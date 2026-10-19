// app/mcp/abfrage.mjs
// Reine Funktion hinter `transaktionen_abfragen`: filtern, begrenzen,
// gruppieren. Summen laufen ausschliesslich ueber toCents (nie Float).
import { centsToDecimal, normalizeLoose, toCents } from "../tools/lib/text.mjs";

const GRUPPEN = {
  monat: (t) => String(t.buchungsdatum ?? "").slice(0, 7),
  kategorie: (t) => t.kategorie_id ?? "(ohne)",
  konto: (t) => t.konto_id ?? "(ohne)",
  gegenpartei: (t) => t.gegenpartei ?? "(ohne)",
};

export function passt(t, f) {
  if (f.von && t.buchungsdatum < f.von) return false;
  if (f.bis && t.buchungsdatum > f.bis) return false;
  if (f.konto && t.konto_id !== f.konto) return false;
  if (f.kategorie && t.kategorie_id !== f.kategorie) return false;
  if (f.immobilie && t.immobilie_id !== f.immobilie) return false;
  if (f.status && t.kategorisierung_status !== f.status) return false;
  if (f.ist_transfer !== undefined && Boolean(t.ist_transfer) !== f.ist_transfer) return false;
  if (f.betrag_min !== undefined && toCents(t.betrag) < toCents(f.betrag_min)) return false;
  if (f.betrag_max !== undefined && toCents(t.betrag) > toCents(f.betrag_max)) return false;
  if (f.text) {
    const nadel = normalizeLoose(f.text);
    const heu = `${normalizeLoose(t.gegenpartei)} ${normalizeLoose(t.verwendungszweck)} ${normalizeLoose(t.bemerkung)}`;
    if (!heu.includes(nadel)) return false;
  }
  return true;
}

export function abfragen(transaktionen, f = {}, namen = {}) {
  const treffer = transaktionen.filter((t) => passt(t, f));
  const gesamt = treffer.reduce((s, t) => s + toCents(t.betrag), 0);
  const ergebnis = { anzahl: treffer.length, summe: centsToDecimal(gesamt) };

  if (f.gruppieren_nach) {
    const schluessel = GRUPPEN[f.gruppieren_nach];
    const map = new Map();
    for (const t of treffer) {
      const k = schluessel(t);
      const g = map.get(k) ?? { schluessel: k, anzahl: 0, cents: 0 };
      g.anzahl += 1;
      g.cents += toCents(t.betrag);
      map.set(k, g);
    }
    const liste = [...map.values()];
    if (f.gruppieren_nach === "monat") liste.sort((a, b) => a.schluessel.localeCompare(b.schluessel));
    else liste.sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents));
    const namensquelle = f.gruppieren_nach === "kategorie" ? namen.kategorien : f.gruppieren_nach === "konto" ? namen.konten : undefined;
    ergebnis.gruppen = liste.map((g) => ({
      schluessel: g.schluessel,
      ...(namensquelle?.[g.schluessel] ? { name: namensquelle[g.schluessel] } : {}),
      anzahl: g.anzahl,
      summe: centsToDecimal(g.cents),
    }));
  }

  if (!f.gruppieren_nach || f.mit_zeilen) {
    const limit = Math.min(f.limit ?? 100, 1000);
    ergebnis.zeilen = treffer.slice(0, limit);
    if (treffer.length > limit) ergebnis.abgeschnitten = true;
  }
  return ergebnis;
}

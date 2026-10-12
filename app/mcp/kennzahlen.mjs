// app/mcp/kennzahlen.mjs
// Reine Funktion hinter dem MCP-Tool `kennzahlen`: die Kennzahlen der
// Uebersicht als kompakter Text. Gerechnet wird ausschliesslich mit denselben
// Funktionen wie die Uebersicht (uebersicht-rechnung.mjs, vermoegen.mjs,
// next-action.mjs); hier wird nur formatiert. Betraege als Decimal-String.
import { buildNextAgentAction } from "../next-action.mjs";
import { centsToDecimal } from "../tools/lib/text.mjs";
import { checkItems, checkVorschau, kontoZeile, saldoGeladenerKonten, sortierteKonten } from "../uebersicht-rechnung.mjs";
import { computeNettovermoegen } from "../vermoegen.mjs";

const eur = (cents) => `${centsToDecimal(cents)} EUR`;
const art = (item) => String(item.title_key ?? "").split(".").pop();

function artenZaehlen(items) {
  const anzahl = new Map();
  for (const item of items) anzahl.set(art(item), (anzahl.get(art(item)) ?? 0) + 1);
  return [...anzahl].map(([a, n]) => `${a} ${n}`).join(", ");
}

export function istKalenderdatum(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [j, m, t] = text.split("-").map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

// data: Bestand wie im Browser (loadFinanceData + validation, checks, importfehler).
export function kennzahlenText(data, stichtag) {
  const netto = computeNettovermoegen(data, stichtag);
  const items = checkItems(data, stichtag);
  const vorschau = checkVorschau(items);
  const aktion = buildNextAgentAction(data, { today: stichtag });
  const q = netto.qualitaet;

  const zeilen = [
    `Kennzahlen der Uebersicht, Stichtag ${stichtag}. Betraege in EUR als Decimal-String.`,
    "",
    `Nettovermoegen: ${eur(netto.netto_cents)} (Aktiva ${eur(netto.aktiva_cents)}, Passiva ${eur(netto.passiva_cents)})`,
    `  Qualitaet: belegt ${q.belegt}, geschaetzt ${q.geschaetzt}, fehlend ${q.fehlend}, gesamt ${q.gesamt ?? "offen"}`,
    "  Positionen (Wert zum Stichtag; Konten = belegter Anker + Buchungen danach):",
    ...netto.positionen.map((p) => `  * ${p.klasse} ${p.id} ${p.name}: ${p.fehlt ? `fehlt (${p.basis})` : `${eur(p.wert_cents)}, Stand ${p.standdatum ?? "-"}, ${p.qualitaet ?? "offen"}`}`),
    "",
    `Summe geladener Bewegungen (Konten): ${eur(saldoGeladenerKonten(data))}`,
    "  Nur geladene Buchungen liquiditaetsrelevanter Konten ohne Depots, kein Anfangssaldo, ohne Stichtagsbezug.",
    "",
    "Konten (Tabelle der Uebersicht; Wert = Depotwert bzw. belegter Anker + Buchungen danach, wie im Nettovermoegen):",
    ...sortierteKonten(data).map((k) => {
      const z = kontoZeile(data, k, stichtag);
      const wert = z.wert_cents === null ? `kein Wert (${z.basis})` : `${eur(z.wert_cents)}, ${z.qualitaet ?? "offen"} zum ${z.belegdatum}`;
      const buchung = k.kontotyp === "depot" ? "" : `, letzte Buchung ${z.letzteBuchung || "-"}`;
      return `- ${k.konto_id} ${k.name} (${k.kontotyp}${k.status === "geschlossen" ? ", geschlossen" : ""}): ${wert}${buchung}`;
    }),
    "",
    aktion.type === "none" ? "Naechste Aktion: keine" : `Naechste Aktion: ${aktion.label} (${aktion.count})`,
    `Checks: ${items.length}${items.length ? ` (${artenZaehlen(items)})` : ""}${items.length > vorschau.length ? `, Vorschau der ersten ${vorschau.length}` : ""}`,
    ...vorschau.map((c) => `- ${art(c)}: ${c.detail ?? ""}`),
  ];
  return zeilen.join("\n");
}

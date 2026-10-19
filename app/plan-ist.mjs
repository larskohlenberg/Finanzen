// app/plan-ist.mjs
// Plan und Ist je Zeitraum. Das Ist kommt aus den Buchungen nach denselben Regeln
// wie die Kacheln der Uebersicht (monatsMittel): ohne Transfers und Investitionen,
// Gutschriften mit gutschriften_sondereffekt daneben, brutto-Kategorien nach
// Vorzeichen geteilt, netto je Kategorie auf die Einnahmen- oder Ausgabenseite.
// Der Plan sind die Termine der bestaetigten Regelzahlungen, die im Zeitraum
// galten: ab der ersten zugeordneten Buchung (sonst ab der ersten Buchung ihres
// Kontos, Konsumplaene ohne Konto immer) bis aktiv_bis. Beide laufen durch
// dieselbe Zuordnung je Kategorie. Alle Werte sind Summen ueber den Zeitraum in
// Cent; das Monatsmittel teilt die Ansicht durch anzahl_monate.
// Rein, ohne DOM: Uebersicht, Seite Plan & Ist und MCP rechnen hiermit.
import { addInterval, periodenSchluessel } from "./liquiditaet.mjs";
import { dayDiff, toCents } from "./tools/lib/text.mjs";
import { ausschlussZaehler, buchungsKlasse, kategorienIndex, KATEGORIE_UNGEKLAERT, STARTZUSTAND } from "./klassifikation.mjs";

// Ausgaben ab 400 Euro ohne Regelzahlung (Urlaub, Anschaffungen) stehen bewusst
// nicht im Plan (Nutzerentscheid 2026-10-12); die Seite weist sie je Kategorie aus.
// Kategorien mit ohne_einzelposten (Bargeld) haben keine.
export const EINZELPOSTEN_CENTS = 40000;
const RHYTHMUS_TAGE = { tag: 1, woche: 7, monat: 30, jahr: 365 };

// Fenster um einen Termin wie im Matcher: ein Viertel des Rhythmus, hoechstens 15 Tage.
function fensterTage(rz) {
  return Math.min(15, Math.floor((RHYTHMUS_TAGE[rz.rhythmus_einheit] ?? 30) * Number(rz.rhythmus_intervall || 1) / 4));
}

const monatsEnde = (ym) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);

// Termine einer Regelzahlung zwischen von und bis (inklusive), vom Anker aus vor-
// und rueckwaerts; aktiv_bis begrenzt.
export function termineImZeitraum(rz, von, bis) {
  const ende = rz.aktiv_bis && rz.aktiv_bis < bis ? rz.aktiv_bis : bis;
  const termin = (k) => addInterval(rz.anker_datum, rz.rhythmus_einheit, Number(rz.rhythmus_intervall) * k);
  const termine = [];
  for (let k = 0, d = termin(0); d <= ende && k < 5000; d = termin(++k)) if (d >= von) termine.push(d);
  for (let k = -1, d = termin(-1); d >= von && k > -5000; d = termin(--k)) if (d <= ende) termine.unshift(d);
  return termine;
}

// Ab wann eine Regelzahlung zaehlt: ihre erste zugeordnete Buchung (abzueglich
// Fenster), sonst die erste Buchung ihres Kontos; ohne Konto ("" = immer).
export function regelzahlungBeginn(data) {
  const ersteRz = new Map();
  const ersteKonto = new Map();
  for (const tx of data.transaktionen ?? []) {
    const d = tx.buchungsdatum;
    if (!d) continue;
    if (tx.regelzahlung_id && !(ersteRz.get(tx.regelzahlung_id) <= d)) ersteRz.set(tx.regelzahlung_id, d);
    if (!(ersteKonto.get(tx.konto_id) <= d)) ersteKonto.set(tx.konto_id, d);
  }
  return new Map((data.regelzahlungen ?? []).map((rz) => {
    const erste = ersteRz.get(rz.regelzahlung_id);
    if (erste) return [rz.regelzahlung_id, addInterval(erste, "tag", -fensterTage(rz))];
    return [rz.regelzahlung_id, rz.konto_id ? ersteKonto.get(rz.konto_id) ?? "" : ""];
  }));
}

// Alle Monate des Bestands, die vollstaendig gebucht sind. Beginn: der Monat, ab
// dem alle mitten in ihrer Geschichte importierten Konten da sind, erkennbar am
// Startzustand (am Monatsersten zaehlt der Monat, sonst der folgende); ohne
// Startzustand die erste Buchung. Ende: der letzte volle Monat (Grenze wie
// monatsMittel: vor dem laufenden Monat, hoechstens bis zum Monat, in dem alle
// Konten belegt sind).
export function bestandsMonate(data, today, { vollstaendigBis = "" } = {}) {
  let grenze = today.slice(0, 7);
  if (vollstaendigBis) {
    const [y, m, d] = vollstaendigBis.split("-").map(Number);
    const voll = d >= new Date(Date.UTC(y, m, 0)).getUTCDate() ? vollstaendigBis.slice(0, 7) : new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
    if (voll < grenze) grenze = new Date(Date.UTC(Number(voll.slice(0, 4)), Number(voll.slice(5, 7)), 1)).toISOString().slice(0, 7);
  }
  const vorher = (data.transaktionen ?? []).map((tx) => tx.buchungsdatum?.slice(0, 7)).filter((m) => m && m < grenze).sort();
  if (!vorher.length) return [];
  const start = (data.transaktionen ?? [])
    .filter((tx) => tx.transaktionstyp === STARTZUSTAND && tx.buchungsdatum)
    .map((tx) => (tx.buchungsdatum.endsWith("-01") ? tx.buchungsdatum : addInterval(`${tx.buchungsdatum.slice(0, 7)}-01`, "monat", 1)).slice(0, 7))
    .reduce((a, m) => (m > a ? m : a), vorher[0]);
  const monate = [];
  for (let m = start; m <= vorher.at(-1); m = addInterval(`${m}-01`, "monat", 1).slice(0, 7)) monate.push(m);
  return monate;
}

// Zeitraeume einer Granularitaet (monat, quartal, jahr), chronologisch; ein
// angeschnittenes Quartal oder Jahr am Rand ist nicht vollstaendig.
// Gueltige Zeitraeume (ohne ""): 12m, Jahr, Quartal, Monat. Route und
// Lese-API pruefen gleich.
export const PERIODE_MUSTER = /^(12m|\d{4}|\d{4}-Q[1-4]|\d{4}-(0[1-9]|1[0-2]))$/;

export function perioden(monate, granularitaet) {
  const soll = { monat: 1, quartal: 3, jahr: 12 }[granularitaet] ?? 1;
  const map = new Map();
  for (const m of monate) {
    const s = periodenSchluessel(m, granularitaet);
    map.set(s, [...(map.get(s) ?? []), m]);
  }
  return [...map].map(([schluessel, ms]) => ({ schluessel, monate: ms, vollstaendig: ms.length === soll }));
}

// Auswahl -> Monate: "" der ganze Bestand, "12m" die letzten zwoelf, sonst ein
// Jahr ("2026"), Quartal ("2026-Q2") oder Monat ("2026-05").
export function zeitraumMonate(monate, auswahl = "") {
  if (!auswahl) return monate;
  if (auswahl === "12m") return monate.slice(-12);
  const gran = /^\d{4}$/.test(auswahl) ? "jahr" : /-Q\d$/.test(auswahl) ? "quartal" : "monat";
  return monate.filter((m) => periodenSchluessel(m, gran) === auswahl);
}

export function planIst(data, monate) {
  const n = monate.length;
  const von = n ? `${monate[0]}-01` : "";
  const bis = n ? monatsEnde(monate.at(-1)) : "";
  const imZeitraum = new Set(monate);
  const typ = kategorienIndex(data);
  const istNeutral = (id) => typ.get(id)?.typ === "neutral" && id !== KATEGORIE_UNGEKLAERT;
  const zeilen = new Map();
  const zeile = (key, id) => {
    if (!zeilen.has(key)) zeilen.set(key, { key, kategorie_id: id, ist: 0, plan: 0, einzel: 0, einzel_buchungen: [], regelzahlungen: [] });
    return zeilen.get(key);
  };
  const schluessel = (id, cents) => (typ.get(id)?.brutto === true ? `${id}${cents >= 0 ? "+" : "-"}` : id);
  let sondereffekte = 0;
  let investitionen = 0;
  const ausschluesse = ausschlussZaehler();

  // Ist; dazu je Regelzahlung, was im Zeitraum tatsaechlich gebucht wurde.
  const gebucht = new Map();
  for (const tx of data.transaktionen ?? []) {
    if (!imZeitraum.has(tx.buchungsdatum?.slice(0, 7))) continue;
    const cents = toCents(tx.betrag);
    if (tx.regelzahlung_id) {
      const g = gebucht.get(tx.regelzahlung_id) ?? { cents: 0, anzahl: 0, daten: [] };
      g.cents += cents;
      g.anzahl += 1;
      g.daten.push(tx.buchungsdatum);
      gebucht.set(tx.regelzahlung_id, g);
    }
    const klasse = buchungsKlasse(tx, typ);
    ausschluesse.zaehle(klasse, cents);
    if (klasse === "transfer" || klasse === "startzustand") continue;
    const id = tx.kategorie_id ?? "";
    if (klasse === "investition") { investitionen += cents; continue; }
    if (klasse === "sondereffekt") { sondereffekte += cents; continue; }
    const z = zeile(schluessel(id, cents), id);
    z.ist += cents;
    if (cents <= -EINZELPOSTEN_CENTS && !tx.regelzahlung_id && !istNeutral(id) && typ.get(id)?.ohne_einzelposten !== true) {
      z.einzel += cents;
      z.einzel_buchungen.push({ transaktion_id: tx.transaktion_id, datum: tx.buchungsdatum, betrag_cents: cents, gegenpartei: tx.gegenpartei ?? "" });
    }
  }

  // Plan aus den Terminen; dieselben Ausschluesse wie beim Ist.
  const beginn = regelzahlungBeginn(data);
  const luecken = [];
  const letzteJeKonto = new Map();
  for (const tx of data.transaktionen ?? []) if (!(letzteJeKonto.get(tx.konto_id) >= tx.buchungsdatum)) letzteJeKonto.set(tx.konto_id, tx.buchungsdatum);
  for (const rz of n ? data.regelzahlungen ?? [] : []) {
    if (rz.status !== "bestaetigt") continue;
    const start = [von, beginn.get(rz.regelzahlung_id) ?? ""].sort().at(-1);
    const termine = termineImZeitraum(rz, start, bis);
    const g = gebucht.get(rz.regelzahlung_id) ?? { cents: 0, anzahl: 0, daten: [] };
    if (!termine.length && !g.anzahl) continue;
    const cents = toCents(rz.betrag);
    const id = rz.kategorie_id ?? "";
    const plan = cents * termine.length;
    const eintrag = { regelzahlung_id: rz.regelzahlung_id, bezeichnung: rz.bezeichnung, konto_id: rz.konto_id ?? "", termine: termine.length, plan_cents: plan, gebucht_cents: g.cents, gebucht_anzahl: g.anzahl };
    if (typ.get(id)?.investition !== true && !(cents > 0 && typ.get(id)?.gutschriften_sondereffekt === true)) {
      const z = zeile(schluessel(id, cents), id);
      z.plan += plan;
      z.regelzahlungen.push(eintrag);
    }
    // Luecke: Termin ohne zugeordnete Buchung im Fenster, nur soweit das Konto gebucht ist.
    if (!rz.konto_id) continue;
    const fenster = fensterTage(rz);
    const frei = [...g.daten];
    const fehlend = termine.filter((d) => d <= (letzteJeKonto.get(rz.konto_id) ?? "")).filter((d) => {
      const i = frei.findIndex((b) => Math.abs(dayDiff(b, d)) <= fenster);
      if (i < 0) return true;
      frei.splice(i, 1);
      return false;
    });
    if (fehlend.length) luecken.push({ ...eintrag, fehlend });
  }

  const name = (id) => typ.get(id)?.name ?? (id || "-");
  const seite = (vorzeichen) => {
    const rows = [...zeilen.values()]
      .filter((z) => !istNeutral(z.kategorie_id) && ((z.ist || z.plan) >= 0) === (vorzeichen > 0))
      .map((z) => ({
        key: z.key,
        kategorie_id: z.kategorie_id,
        name: name(z.kategorie_id),
        richtung: typ.get(z.kategorie_id)?.brutto === true ? (z.key.endsWith("+") ? "+" : "-") : "",
        ist_cents: vorzeichen * z.ist,
        plan_cents: vorzeichen * z.plan,
        einzel_cents: 0 - z.einzel,
        einzel_buchungen: z.einzel_buchungen.sort((a, b) => a.betrag_cents - b.betrag_cents),
        regelzahlungen: z.regelzahlungen.sort((a, b) => Math.abs(b.plan_cents) - Math.abs(a.plan_cents)),
      }))
      .filter((z) => z.ist_cents || z.plan_cents)
      .sort((a, b) => Math.abs(b.ist_cents - b.plan_cents) - Math.abs(a.ist_cents - a.plan_cents));
    return {
      ist_cents: rows.reduce((a, z) => a + z.ist_cents, 0),
      plan_cents: rows.reduce((a, z) => a + z.plan_cents, 0),
      einzel_cents: rows.reduce((a, z) => a + z.einzel_cents, 0),
      kategorien: rows,
    };
  };
  const einnahmen = seite(1);
  const ausgaben = seite(-1);

  // Sparen: Ueberschuss und wohin er fliesst (Depots, Vertraege, Rest liquide).
  const ziel = (sparziel, feld) => 0 - [...zeilen.values()].filter((z) => istNeutral(z.kategorie_id) && typ.get(z.kategorie_id)?.sparziel === sparziel).reduce((a, z) => a + z[feld], 0);
  const sparenFuer = (feld) => {
    const ein = feld === "ist" ? einnahmen.ist_cents : einnahmen.plan_cents;
    const ueberschuss = ein - (feld === "ist" ? ausgaben.ist_cents : ausgaben.plan_cents);
    const depot = ziel("depot", feld);
    const versicherung = ziel("versicherung", feld);
    return { ueberschuss_cents: ueberschuss, quote: ein > 0 ? ueberschuss / ein : null, depot_cents: depot, versicherung_cents: versicherung, liquide_cents: ueberschuss - depot - versicherung };
  };
  const sparKategorien = [...zeilen.values()]
    .filter((z) => istNeutral(z.kategorie_id) && ["depot", "versicherung"].includes(typ.get(z.kategorie_id)?.sparziel))
    .map((z) => ({ key: z.key, kategorie_id: z.kategorie_id, name: name(z.kategorie_id), sparziel: typ.get(z.kategorie_id).sparziel, ist_cents: 0 - z.ist, plan_cents: 0 - z.plan, regelzahlungen: z.regelzahlungen }))
    .filter((z) => z.ist_cents || z.plan_cents);

  return {
    monate,
    anzahl_monate: n,
    von,
    bis,
    einnahmen,
    ausgaben,
    sparen: { ist: sparenFuer("ist"), plan: sparenFuer("plan"), kategorien: sparKategorien },
    sondereffekte_cents: sondereffekte,
    investitionen_cents: 0 - investitionen,
    luecken: luecken.sort((a, b) => b.fehlend.length - a.fehlend.length),
    ausschluesse: ausschluesse.ergebnis(),
  };
}

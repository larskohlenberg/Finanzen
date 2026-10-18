// app/vermoegen-details.mjs
// Reine Rechnung fuer die Detailansichten der Vermoegensseite (Tabs Konten,
// Immobilien, Darlehen): Darlehensplan bis Laufzeitende, Kennzahlen je
// Immobilie, Monatszahlen aus den zugeordneten Buchungen, Saldoverlauf eines
// Kontos. Kein DOM; Betraege in Cent ueber toCents.

import { addInterval, toCents } from "./liquiditaet.mjs";
import { aktuellerZeitwert, anteilWertCents, darlehensplan, kontoWert, restschuldHeute } from "./vermoegen.mjs";

const jahrVon = (iso) => Number(iso.slice(0, 4));

// Grenze des Plans: Laufzeitende, sonst 50 Jahre (der Plan endet ohnehin bei Rest 0).
function planGrenze(darlehen, today) {
  return darlehen.laufzeit_bis || addInterval(today, "jahr", 50);
}

export function darlehenKennzahlen(darlehen, zeitwerte, today) {
  const plan = darlehensplan(darlehen, zeitwerte, planGrenze(darlehen, today));
  if (!plan) return null;
  const { anker, raten } = plan;
  const ankerCents = toCents(anker.wert);
  const bisHeute = raten.filter((r) => r.datum <= today);
  const restHeute = bisHeute.length ? bisHeute.at(-1).rest_cents : ankerCents;
  const anfangsbetrag = darlehen.anfangsbetrag ? toCents(darlehen.anfangsbetrag) : null;

  let restZinsbindung = null;
  if (darlehen.zinsbindung_bis && darlehen.zinsbindung_bis > today) {
    const bisBindung = raten.filter((r) => r.datum <= darlehen.zinsbindung_bis);
    restZinsbindung = bisBindung.length ? bisBindung.at(-1).rest_cents : ankerCents;
  }

  const jahre = new Map();
  for (const r of raten) {
    const jahr = jahrVon(r.datum);
    const eintrag = jahre.get(jahr) ?? { jahr, zins_cents: 0, tilgung_cents: 0, ist: jahr <= jahrVon(today) };
    eintrag.zins_cents += r.zins_cents;
    eintrag.tilgung_cents += r.tilgung_cents;
    jahre.set(jahr, eintrag);
  }

  return {
    anker,
    raten,
    rest_heute_cents: restHeute,
    anfangsbetrag_cents: anfangsbetrag,
    getilgt_cents: anfangsbetrag === null ? null : anfangsbetrag - restHeute,
    zinsen_seit_anker_cents: bisHeute.reduce((summe, r) => summe + r.zins_cents, 0),
    rest_zinsbindung_cents: restZinsbindung,
    naechste_rate: raten.find((r) => r.datum > today) ?? null,
    abbezahlt_am: raten.find((r) => r.rest_cents === 0)?.datum ?? null,
    rest_ende_cents: raten.length ? raten.at(-1).rest_cents : ankerCents,
    jahre: [...jahre.values()],
  };
}

export function immobilienKennzahlen(data, immobilieId, today) {
  const immobilie = (data.immobilien ?? []).find((i) => i.immobilie_id === immobilieId);
  if (!immobilie) return null;
  const marktwert = aktuellerZeitwert(data.zeitwerte, "immobilie", immobilieId, "marktwert");
  const marktwertCents = marktwert ? toCents(marktwert.wert) : null;
  const anteilig = marktwertCents === null ? null : anteilWertCents(marktwertCents, immobilie.eigentumsanteile);
  const darlehen = (data.darlehen ?? []).filter((d) => d.immobilie_id === immobilieId && d.status !== "abgeloest");
  let restschuld = 0;
  let vollstaendig = true;
  for (const d of darlehen) {
    const r = restschuldHeute(d, data.zeitwerte, today);
    if (r.wert_cents === null) vollstaendig = false;
    else restschuld += r.wert_cents;
  }
  return {
    marktwert,
    marktwert_cents: marktwertCents,
    anteilig_cents: anteilig,
    darlehen_ids: darlehen.map((d) => d.darlehen_id),
    restschuld_cents: restschuld,
    restschuld_vollstaendig: vollstaendig,
    eigenkapital_cents: anteilig === null ? null : anteilig - restschuld,
    beleihung: anteilig ? restschuld / anteilig : null,
    wertaenderung_cents: marktwertCents !== null && immobilie.anschaffungskosten ? marktwertCents - toCents(immobilie.anschaffungskosten) : null,
  };
}

// Kategorien der Regelzahlungen, die diese Darlehen bedienen (die Rate).
export function darlehensKategorien(data, darlehenIds) {
  const ids = new Set(darlehenIds);
  return new Set((data.regelzahlungen ?? []).filter((rz) => ids.has(rz.darlehen_id) && rz.kategorie_id).map((rz) => rz.kategorie_id));
}

// Kategorien mit dem Merkmal investition (Modernisierung samt Zuschuessen).
export function investitionsKategorien(data) {
  return new Set((data.kategorien ?? []).filter((k) => k.investition === true).map((k) => k.kategorie_id));
}

// Alle Investitionsbuchungen einer Immobilie ueber die ganze Zeit, neueste zuerst.
// investiert_cents ist positiv: Ausgaben abzueglich Zuschuessen.
export function immobilienInvestitionen(data, immobilieId) {
  const kategorien = investitionsKategorien(data);
  const buchungen = (data.transaktionen ?? [])
    .filter((tx) => tx.immobilie_id === immobilieId && !tx.ist_transfer && kategorien.has(tx.kategorie_id))
    .sort((a, b) => String(b.buchungsdatum).localeCompare(String(a.buchungsdatum)));
  let ausgaben = 0;
  let zuschuesse = 0;
  for (const tx of buchungen) {
    const c = toCents(tx.betrag);
    if (c < 0) ausgaben -= c;
    else zuschuesse += c;
  }
  return { buchungen, ausgaben_cents: ausgaben, zuschuesse_cents: zuschuesse, investiert_cents: ausgaben - zuschuesse };
}

// Die letzten `anzahl` abgeschlossenen Monate vor dem Monat von `today`.
function letzteMonate(today, anzahl) {
  const erster = addInterval(`${today.slice(0, 7)}-01`, "monat", -anzahl);
  return Array.from({ length: anzahl }, (_, i) => addInterval(erster, "monat", i).slice(0, 7));
}

// Eigenanteil (mitEigenanteil): Transfers eigener Konten auf das Konto, ueber das die
// Darlehen dieses Objekts laufen. Sie bleiben Transfer, erscheinen hier aber als eigene
// Spalte, damit die Rate nicht ungedeckt aussieht. Fuer Kennzahlen wie die Mietrendite aus.
export function immobilienMonate(data, immobilieId, today, { anzahl = 12, ohneKategorien = [], mitEigenanteil = false } = {}) {
  const monate = letzteMonate(today, anzahl);
  const position = new Map(monate.map((m, i) => [m, i]));
  const ohne = new Set(ohneKategorien);
  const hauskonten = new Set((data.darlehen ?? [])
    .filter((d) => d.immobilie_id === immobilieId && d.status !== "abgeloest" && d.konto_id)
    .map((d) => d.konto_id));
  const leer = () => monate.map(() => 0);
  const einnahmen = leer();
  const ausgaben = leer();
  const nachKategorie = new Map();
  let anzahlBuchungen = 0;

  for (const tx of data.transaktionen ?? []) {
    if (tx.immobilie_id !== immobilieId) continue;
    const eigenanteil = Boolean(tx.ist_transfer);
    if (eigenanteil && !(mitEigenanteil && hauskonten.has(tx.konto_id))) continue;
    const i = position.get(String(tx.buchungsdatum).slice(0, 7));
    if (i === undefined) continue;
    const kategorie = tx.kategorie_id ?? "";
    if (!eigenanteil && ohne.has(kategorie)) continue;
    const cents = toCents(tx.betrag);
    if (cents >= 0) einnahmen[i] += cents;
    else ausgaben[i] -= cents;
    const schluessel = eigenanteil ? "eigenanteil" : kategorie;
    if (!nachKategorie.has(schluessel)) nachKategorie.set(schluessel, { kategorie_id: kategorie, eigenanteil, werte: leer(), ein: leer(), aus: leer() });
    const eintrag = nachKategorie.get(schluessel);
    eintrag.werte[i] += cents;
    if (cents >= 0) eintrag.ein[i] += cents;
    else eintrag.aus[i] += cents;
    anzahlBuchungen += 1;
  }

  const summe = (werte) => werte.reduce((a, b) => a + b, 0);
  const kategorien = [...nachKategorie.values()]
    .map(({ kategorie_id, eigenanteil, werte, ein, aus }) => ({ kategorie_id, ...(eigenanteil ? { eigenanteil } : {}), werte, ein, aus, summe_cents: summe(werte) }))
    .sort((a, b) => b.summe_cents - a.summe_cents || a.kategorie_id.localeCompare(b.kategorie_id));
  const saldo = monate.map((_, i) => einnahmen[i] - ausgaben[i]);
  return {
    monate,
    kategorien,
    einnahmen,
    ausgaben,
    saldo,
    summe: { einnahmen: summe(einnahmen), ausgaben: summe(ausgaben), saldo: summe(saldo) },
    anzahl_buchungen: anzahlBuchungen,
  };
}

const monatsEnde = (monat) => {
  const [y, m] = monat.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

// Saldo je Monatsende, rueckgerechnet vom heutigen Stand (kontoWert) ueber die
// Buchungen danach. Der laufende Monat endet heute. Monate vor der ersten
// Buchung des Kontos fallen weg: dort waere der Wert geraten.
export function kontoSaldoVerlauf(data, konto, today, monate = 12) {
  if (konto.kontotyp === "depot") return [];
  const heute = kontoWert(konto, data.zeitwerte, data.transaktionen, today);
  if (heute.wert_cents === null) return [];
  const buchungen = (data.transaktionen ?? []).filter((tx) => tx.konto_id === konto.konto_id && tx.buchungsdatum <= today);
  const erste = buchungen.reduce((min, tx) => (tx.buchungsdatum < min ? tx.buchungsdatum : min), today);
  const punkte = [];
  for (let i = monate - 1; i >= 0; i -= 1) {
    const monat = addInterval(`${today.slice(0, 7)}-01`, "monat", -i).slice(0, 7);
    const datum = i === 0 ? today : monatsEnde(monat);
    if (datum < erste.slice(0, 7) + "-01") continue;
    let danach = 0;
    for (const tx of buchungen) if (tx.buchungsdatum > datum) danach += toCents(tx.betrag);
    punkte.push({ monat, datum, wert_cents: heute.wert_cents - danach });
  }
  return punkte;
}

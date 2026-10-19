// app/bewertung.mjs
// Gemeinsamer Bewertungsstand je Stichtag (Review Welle 2, 2.1): eine Rechnung
// fuer Nettovermoegen, Verlauf, Liquiditaet, Kontentabelle, Szenario-Start und
// MCP `kennzahlen`. Rein, ohne DOM; Geld in Cent.
//
// Je Position: Wert, Datum (Stand), Lebenszyklus, Herkunft (der Zeitwert, auf dem
// der Wert beruht), Qualitaet, Methode und ob der Wert unbekannt ist.
//
// Regeln zum Stichtag d:
// - Nur Zeitwerte mit Standdatum <= d gelten als Stand (F6).
// - Rueckrechnung: Ein Kontostand (giro, tagesgeld, spar, festgeld,
//   kreditkarte) ohne Anker bis d wird aus dem naechsten spaeteren Anker
//   zurueckgerechnet: Anker minus die Buchungen nach d bis zum Anker. Das ist
//   exakt, solange die Buchungen vollstaendig sind; Methode "anker-rueckwaerts".
//   Vor dem ersten Anker und der ersten Buchung gab es das Konto noch nicht.
// - Marktwerte (Depotwert, Marktwert, Rueckkaufswert) werden nie aus spaeteren
//   Werten zurueckgerechnet: ohne Wert bis d ist die Position unbekannt (Wert 0,
//   unbekannt: true). Ausnahme mit eigener Methode: eine Immobilie ohne
//   Marktwert bis d gilt mit den Anschaffungskosten ("anschaffungskosten",
//   geschaetzt), auch wenn es gar keinen Marktwert gibt; der Check
//   marktwert-fehlt bleibt trotzdem stehen.
// - Darlehen: Annuitaet ab dem juengsten Restschuld-Anker bis d; ohne Anker bis
//   d ab Anfangsbetrag und Anfangsdatum ("anfangsbetrag+tilgung", geschaetzt),
//   auch wenn es gar keinen Anker gibt (der Check anker-fehlt bleibt); sonst
//   unbekannt.
// - Konten zaehlen erst ab ihrer ersten Buchung bzw. ihrem ersten Anker (davor
//   "noch-nicht", nicht unbekannt): ein spaeter importiertes Konto springt im
//   Verlauf erst mit seinem Beginn hinein.
// - Lebenszyklus: Objekte mit Endstatus (Konto geschlossen, Immobilie verkauft,
//   Vermoegenswert veraeussert, Darlehen abgeloest, Vorsorge gekuendigt oder
//   beendet) zaehlen bis einschliesslich aktiv_bis, ohne aktiv_bis gar nicht.
//   Immobilien vor der Anschaffung und Darlehen vor dem Anfangsdatum zaehlen noch
//   nicht, solange es bis dahin keinen Marktwert bzw. Restschuld-Anker gibt. Solche Objekte stehen in `ausserhalb`, nicht in `positionen`.
// - Vorsorge: nur kapitalbildende Vertraege, bewertet mit dem Rueckkaufswert.
//   Erwartete Leistungen (Kapital, Rente) sind eine andere Groesse und fliessen
//   nie in den Stand.
import { addInterval, toCents } from "./liquiditaet.mjs";

const PERIODEN_PRO_JAHR = { tag: 365, woche: 52, monat: 12, jahr: 1 };

export function aktuellerZeitwert(zeitwerte, entitaet, entitaetId, feld, bis = null) {
  let best = null;
  for (const zw of zeitwerte ?? []) {
    if (zw.entitaet !== entitaet || zw.entitaet_id !== entitaetId || zw.feld !== feld) continue;
    if (bis && zw.standdatum > bis) continue;
    if (best === null || zw.standdatum > best.standdatum) best = zw;
  }
  return best;
}

// Fruehester Zeitwert eines Felds strikt nach `nach`.
function naechsterZeitwert(zeitwerte, entitaet, entitaetId, feld, nach) {
  let best = null;
  for (const zw of zeitwerte ?? []) {
    if (zw.entitaet !== entitaet || zw.entitaet_id !== entitaetId || zw.feld !== feld) continue;
    if (zw.standdatum <= nach) continue;
    if (best === null || zw.standdatum < best.standdatum) best = zw;
  }
  return best;
}

const herkunftVon = (zw) => (zw ? { feld: zw.feld, standdatum: zw.standdatum, wert: zw.wert } : null);

// Objekt mit Endstatus zaehlt bis einschliesslich aktiv_bis, ohne aktiv_bis gar nicht.
export function aktivAm(obj, endStatus, datum) {
  const ende = Array.isArray(endStatus) ? endStatus : [endStatus];
  return !ende.includes(obj.status) || Boolean(obj.aktiv_bis && datum <= obj.aktiv_bis);
}

// Wert eines Kontos zum Stichtag nach Kontotyp (ADR 0013). Liefert
// { wert_cents, basis, standdatum, anker_datum, qualitaet, herkunft,
// lebenszyklus }; wert_cents null heisst unbekannt. Vor dem Beginn des Kontos
// (Rueckrechnung vor dem ersten Anker und der ersten Buchung) lebenszyklus
// "noch-nicht" mit Wert 0.
export function kontoStand(konto, zeitwerte, transaktionen, datum) {
  const leer = (basis) => ({ wert_cents: null, basis, standdatum: null, qualitaet: null, herkunft: null, lebenszyklus: "aktiv" });
  if (konto.kontotyp === "bar") return leer("bar-ignoriert");
  if (konto.kontotyp === "depot") {
    const dw = aktuellerZeitwert(zeitwerte, "konto", konto.konto_id, "depotwert", datum);
    if (!dw) return leer("depotwert-fehlt");
    return { wert_cents: toCents(dw.wert), basis: "depotwert", standdatum: dw.standdatum, qualitaet: dw.qualitaet, herkunft: herkunftVon(dw), lebenszyklus: "aktiv" };
  }
  // Importierte Buchungen stammen selbst aus Belegen: der Stand reicht bis zur
  // letzten eingerechneten Buchung, nicht nur bis zum Ankerdatum.
  const anker = aktuellerZeitwert(zeitwerte, "konto", konto.konto_id, "kontostand", datum);
  if (anker) {
    let summe = toCents(anker.wert);
    let standdatum = anker.standdatum;
    for (const tx of transaktionen ?? []) {
      if (tx.konto_id !== konto.konto_id || tx.buchungsdatum <= anker.standdatum || tx.buchungsdatum > datum) continue;
      summe += toCents(tx.betrag);
      if (tx.buchungsdatum > standdatum) standdatum = tx.buchungsdatum;
    }
    return { wert_cents: summe, basis: "anker+buchungen", standdatum, anker_datum: anker.standdatum, qualitaet: anker.qualitaet, herkunft: herkunftVon(anker), lebenszyklus: "aktiv" };
  }
  const spaeter = naechsterZeitwert(zeitwerte, "konto", konto.konto_id, "kontostand", datum);
  if (!spaeter) return leer("anker-fehlt");
  // Rueckwaerts: Buchungen nach dem Stichtag bis zum Anker stecken in ihm.
  let summe = toCents(spaeter.wert);
  let beginn = spaeter.standdatum;
  for (const tx of transaktionen ?? []) {
    if (tx.konto_id !== konto.konto_id) continue;
    if (tx.buchungsdatum < beginn) beginn = tx.buchungsdatum;
    if (tx.buchungsdatum > datum && tx.buchungsdatum <= spaeter.standdatum) summe -= toCents(tx.betrag);
  }
  if (datum < beginn) return { wert_cents: 0, basis: "vor-beginn", standdatum: null, qualitaet: null, herkunft: null, lebenszyklus: "noch-nicht" };
  return { wert_cents: summe, basis: "anker-rueckwaerts", standdatum: datum, anker_datum: spaeter.standdatum, qualitaet: spaeter.qualitaet, herkunft: herkunftVon(spaeter), lebenszyklus: "aktiv" };
}

// Faelligkeitstermine eines Darlehens strikt nach `nach` (exklusiv) bis `bis` (inklusiv).
export function faelligkeiten(darlehen, nach, bis) {
  const dates = [];
  let step = 0;
  let guard = 0;
  let cur = darlehen.anfangsdatum;
  while (cur <= bis && guard < 100000) {
    if (cur > nach) dates.push(cur);
    step++;
    cur = addInterval(darlehen.anfangsdatum, darlehen.rhythmus_einheit, darlehen.rhythmus_intervall * step);
    guard++;
  }
  return dates;
}

// Annuitaet ab dem juengsten Restschuld-Anker bis `bis`: je Ratentermin Zins,
// Tilgung und Rest. Endet, sobald der Rest 0 ist. Deckt die Rate den Zins nicht,
// waechst der Rest; die Grenze ist dann allein `bis`. Ohne Anker null.
export function darlehensplan(darlehen, zeitwerte, bis) {
  const anker = aktuellerZeitwert(zeitwerte, "darlehen", darlehen.darlehen_id, "restschuld", bis);
  if (!anker) return null;
  let rest = toCents(anker.wert);
  const rateCents = toCents(darlehen.sollrate);
  const zinssatzProzent = Number(darlehen.zinssatz); // % p.a., kein Cent-Wert
  const ppj = PERIODEN_PRO_JAHR[darlehen.rhythmus_einheit] / darlehen.rhythmus_intervall;
  const raten = [];
  for (const datum of faelligkeiten(darlehen, anker.standdatum, bis)) {
    if (rest <= 0) break;
    const zins = Math.round((rest * zinssatzProzent) / 100 / ppj);
    const tilgung = Math.min(rateCents - zins, rest);
    rest -= tilgung;
    raten.push({ datum, zins_cents: zins, tilgung_cents: tilgung, rest_cents: rest });
  }
  return { anker, raten };
}

// Restschuld nach Annuitaet: Anker + Tilgung der seit Anker faelligen Perioden (ADR 0013).
export function restschuldHeute(darlehen, zeitwerte, today) {
  const plan = darlehensplan(darlehen, zeitwerte, today);
  if (!plan) return { wert_cents: null, basis: "anker-fehlt", standdatum: null, qualitaet: null };
  const { anker, raten } = plan;
  // Die Fortschreibung erzeugt die Zwischenstaende ohnehin: als Verlauf festhalten
  // (Anker + je Ratentermin), damit die UI nicht nur den Stichtagswert zeigt.
  const punkte = [{ datum: anker.standdatum, wert_cents: toCents(anker.wert) }, ...raten.map((r) => ({ datum: r.datum, wert_cents: r.rest_cents }))];
  return { wert_cents: punkte.at(-1).wert_cents, basis: "anker+tilgung", standdatum: anker.standdatum, qualitaet: anker.qualitaet, punkte, herkunft: herkunftVon(anker) };
}

// Restschuld zum Stichtag samt Rueckfall auf Anfangsbetrag und Anfangsdatum.
function darlehenStand(darlehen, zeitwerte, datum) {
  const r = restschuldHeute(darlehen, zeitwerte, datum);
  if (r.wert_cents !== null) return r;
  if (darlehen.anfangsbetrag && darlehen.anfangsdatum) {
    const start = { entitaet: "darlehen", entitaet_id: darlehen.darlehen_id, feld: "restschuld", wert: darlehen.anfangsbetrag, standdatum: darlehen.anfangsdatum, qualitaet: "geschaetzt" };
    const plan = darlehensplan(darlehen, [start], datum);
    const rest = plan.raten.at(-1)?.rest_cents ?? toCents(start.wert);
    return { wert_cents: rest, basis: "anfangsbetrag+tilgung", standdatum: darlehen.anfangsdatum, qualitaet: "geschaetzt", herkunft: null };
  }
  return r;
}

// Anteilsgewichteter Wert in Cent: nur Anteile MIT person_id zaehlen (ADR 0014).
export function anteilWertCents(marktwertCents, eigentumsanteile) {
  let summe = 0;
  for (const a of eigentumsanteile ?? []) {
    if (a.extern === true || !a.person_id) continue;
    summe += (marktwertCents * a.zaehler) / a.nenner;
  }
  return Math.round(summe);
}

// Worst-of-Aggregation: eine Kennzahl ist nur so gut wie ihre schwaechste
// Eingabe. Dominanz belegt < geschaetzt < offen; eine unbekannte Position zaehlt
// als "offen" (die ABWESENHEIT eines Belegs, keine eigene Zeitwert-Zeile).
const QUALITAET_RANG = { belegt: 0, geschaetzt: 1, offen: 2 };
export function gesamtQualitaet(positionen) {
  let schlechteste = null;
  for (const p of positionen ?? []) {
    const q = p.fehlt || !p.qualitaet ? "offen" : p.qualitaet;
    if (schlechteste === null || QUALITAET_RANG[q] > QUALITAET_RANG[schlechteste]) schlechteste = q;
  }
  return schlechteste;
}

const ENDSTATUS = {
  konto: "geschlossen",
  immobilie: "verkauft",
  vermoegenswert: "veraeussert",
  vorsorge: ["gekuendigt", "beendet"],
  darlehen: "abgeloest",
};

export function stand(data, datum) {
  const positionen = [];
  const ausserhalb = [];
  let aktiva = 0;
  let passiva = 0;
  let belegt = 0, geschaetzt = 0, fehlend = 0;

  const aufnehmen = (klasse, id, name, w, vorzeichen = 1) => {
    if (w.lebenszyklus === "noch-nicht") { ausserhalb.push({ klasse, id, name, lebenszyklus: "noch-nicht" }); return; }
    const unbekannt = w.wert_cents === null;
    const cents = unbekannt ? 0 : w.wert_cents;
    if (unbekannt) fehlend++;
    else if (w.qualitaet === "belegt") belegt++;
    else if (w.qualitaet === "geschaetzt") geschaetzt++;
    if (vorzeichen > 0) aktiva += cents; else passiva += cents;
    positionen.push({
      klasse, id, name,
      wert_cents: vorzeichen * cents,
      basis: w.basis,
      methode: unbekannt ? null : w.basis,
      qualitaet: unbekannt ? null : w.qualitaet,
      standdatum: unbekannt ? null : w.standdatum,
      ...(w.anker_datum ? { anker_datum: w.anker_datum } : {}),
      lebenszyklus: "aktiv",
      herkunft: unbekannt ? null : w.herkunft ?? null,
      unbekannt,
      fehlt: unbekannt,
    });
  };
  const beendet = (klasse, obj, id, name) => {
    if (aktivAm(obj, ENDSTATUS[klasse], datum)) return false;
    ausserhalb.push({ klasse, id, name, lebenszyklus: "beendet" });
    return true;
  };
  const marktwert = (entitaet, id, feld) => {
    const mw = aktuellerZeitwert(data.zeitwerte, entitaet, id, feld, datum);
    return mw ? { wert_cents: toCents(mw.wert), basis: feld, standdatum: mw.standdatum, qualitaet: mw.qualitaet, herkunft: herkunftVon(mw) } : null;
  };

  for (const konto of data.konten ?? []) {
    if (konto.kontotyp === "bar") continue;
    if (beendet("konto", konto, konto.konto_id, konto.name)) continue;
    aufnehmen("konto", konto.konto_id, konto.name, kontoStand(konto, data.zeitwerte, data.transaktionen, datum));
  }

  for (const imm of data.immobilien ?? []) {
    if (beendet("immobilie", imm, imm.immobilie_id, imm.bezeichnung)) continue;
    if (!marktwert("immobilie", imm.immobilie_id, "marktwert") && imm.anschaffungsdatum && datum < imm.anschaffungsdatum) { ausserhalb.push({ klasse: "immobilie", id: imm.immobilie_id, name: imm.bezeichnung, lebenszyklus: "noch-nicht" }); continue; }
    let w = marktwert("immobilie", imm.immobilie_id, "marktwert");
    if (!w && imm.anschaffungskosten) w = { wert_cents: toCents(imm.anschaffungskosten), basis: "anschaffungskosten", standdatum: imm.anschaffungsdatum ?? null, qualitaet: "geschaetzt", herkunft: null };
    if (w) w = { ...w, wert_cents: anteilWertCents(w.wert_cents, imm.eigentumsanteile) };
    aufnehmen("immobilie", imm.immobilie_id, imm.bezeichnung, w ?? { wert_cents: null, basis: "marktwert-fehlt" });
  }

  for (const vmw of data.vermoegenswerte ?? []) {
    if (beendet("vermoegenswert", vmw, vmw.vermoegenswert_id, vmw.bezeichnung)) continue;
    let w = marktwert("vermoegenswert", vmw.vermoegenswert_id, "marktwert");
    if (w) w = { ...w, wert_cents: anteilWertCents(w.wert_cents, vmw.eigentumsanteile) };
    aufnehmen("vermoegenswert", vmw.vermoegenswert_id, vmw.bezeichnung, w ?? { wert_cents: null, basis: "marktwert-fehlt" });
  }

  for (const vs of data.vorsorge ?? []) {
    if (!vs.kapitalbildend) continue;
    if (beendet("vorsorge", vs, vs.vorsorge_id, vs.name)) continue;
    aufnehmen("vorsorge", vs.vorsorge_id, vs.name, marktwert("vorsorge", vs.vorsorge_id, "rueckkaufswert") ?? { wert_cents: null, basis: "rueckkaufswert-fehlt" });
  }

  for (const dar of data.darlehen ?? []) {
    if (beendet("darlehen", dar, dar.darlehen_id, dar.bezeichnung)) continue;
    const restAnker = aktuellerZeitwert(data.zeitwerte, "darlehen", dar.darlehen_id, "restschuld", datum);
    if (!restAnker && dar.anfangsdatum && datum < dar.anfangsdatum) { ausserhalb.push({ klasse: "darlehen", id: dar.darlehen_id, name: dar.bezeichnung, lebenszyklus: "noch-nicht" }); continue; }
    aufnehmen("darlehen", dar.darlehen_id, dar.bezeichnung, darlehenStand(dar, data.zeitwerte, datum), -1);
  }

  return {
    datum,
    aktiva_cents: aktiva,
    passiva_cents: passiva,
    netto_cents: aktiva - passiva,
    positionen,
    ausserhalb,
    unbekannt: fehlend,
    qualitaet: { belegt, geschaetzt, fehlend, gesamt: gesamtQualitaet(positionen) },
  };
}

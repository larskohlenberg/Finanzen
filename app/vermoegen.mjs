// app/vermoegen.mjs
// Reine, deterministische Vermögens-/Nettovermögens-Mathematik. Kein DOM, keine Node-Abhängigkeiten.
// Eine getestete Funktion an zwei Aufrufstellen: Browser (app/main.js) und Node (tests/).
// Liegt unter app/, weil der Webserver nur das App-Verzeichnis ausliefert (ADR 0009/0012).
// Modell-Begründungen: ADR 0013 (Anker + Reconciliation), ADR 0014 (Nettovermögen Haushaltssicht).

import { toCents, addInterval } from "./cashflow.mjs";

const PERIODEN_PRO_JAHR = { tag: 365, woche: 52, monat: 12, jahr: 1 };

export function aktuellerZeitwert(zeitwerte, entitaet, entitaetId, feld) {
  let best = null;
  for (const zw of zeitwerte ?? []) {
    if (zw.entitaet !== entitaet || zw.entitaet_id !== entitaetId || zw.feld !== feld) continue;
    if (best === null || zw.standdatum > best.standdatum) best = zw;
  }
  return best;
}

// Konto-Wert nach Kontotyp (ADR 0013).
export function kontoWert(konto, zeitwerte, transaktionen, today) {
  if (konto.kontotyp === "bar") {
    return { wert_cents: null, basis: "bar-ignoriert", standdatum: null, qualitaet: null };
  }
  if (konto.kontotyp === "depot") {
    const dw = aktuellerZeitwert(zeitwerte, "konto", konto.konto_id, "depotwert");
    if (!dw) return { wert_cents: null, basis: "depotwert-fehlt", standdatum: null, qualitaet: null };
    return { wert_cents: toCents(dw.wert), basis: "depotwert", standdatum: dw.standdatum, qualitaet: dw.qualitaet };
  }
  // giro | spar | tagesgeld | kreditkarte: Anker + Buchungen danach
  const anker = aktuellerZeitwert(zeitwerte, "konto", konto.konto_id, "kontostand");
  if (!anker) return { wert_cents: null, basis: "anker-fehlt", standdatum: null, qualitaet: null };
  let summe = toCents(anker.wert);
  for (const tx of transaktionen ?? []) {
    if (tx.konto_id !== konto.konto_id) continue;
    if (tx.buchungsdatum <= anker.standdatum) continue;
    if (tx.buchungsdatum > today) continue;
    summe += toCents(tx.betrag);
  }
  return { wert_cents: summe, basis: "anker+buchungen", standdatum: anker.standdatum, qualitaet: anker.qualitaet };
}

// Restschuld nach Annuität: Anker + Tilgung der seit Anker fälligen Perioden (ADR 0013).
export function restschuldHeute(darlehen, zeitwerte, today) {
  const anker = aktuellerZeitwert(zeitwerte, "darlehen", darlehen.darlehen_id, "restschuld");
  if (!anker) return { wert_cents: null, basis: "anker-fehlt", standdatum: null, qualitaet: null };
  let rest = toCents(anker.wert);
  const rateCents = toCents(darlehen.sollrate);
  const zinssatzProzent = Number(darlehen.zinssatz); // % p.a., kein Cent-Wert
  const ppj = PERIODEN_PRO_JAHR[darlehen.rhythmus_einheit] / darlehen.rhythmus_intervall;
  for (const datum of faelligkeiten(darlehen, anker.standdatum, today)) {
    const zinsCents = Math.round((rest * zinssatzProzent) / 100 / ppj);
    const tilgung = rateCents - zinsCents;
    rest -= tilgung;
    if (rest < 0) rest = 0;
  }
  return { wert_cents: rest, basis: "anker+tilgung", standdatum: anker.standdatum, qualitaet: anker.qualitaet };
}

// Fälligkeitstermine eines Darlehens strikt nach `nach` (exklusiv) bis `bis` (inklusiv).
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

// Anteilsgewichteter Wert in Cent — nur Anteile MIT person_id zählen (ADR 0014).
export function anteilWertCents(marktwertCents, eigentumsanteile) {
  let summe = 0;
  for (const a of eigentumsanteile ?? []) {
    if (a.extern === true || !a.person_id) continue;
    summe += Math.round((marktwertCents * a.zaehler) / a.nenner);
  }
  return summe;
}

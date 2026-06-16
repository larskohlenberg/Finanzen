// app/vermoegen.mjs
// Reine, deterministische Vermögens-/Nettovermögens-Mathematik. Kein DOM, keine Node-Abhängigkeiten.
// Eine getestete Funktion an zwei Aufrufstellen: Browser (app/main.js) und Node (tests/).
// Liegt unter app/, weil der Webserver nur das App-Verzeichnis ausliefert (ADR 0009/0012).
// Modell-Begründungen: ADR 0013 (Anker + Reconciliation), ADR 0014 (Nettovermögen Haushaltssicht).

import { toCents, addInterval } from "./liquiditaet.mjs";

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
  // Die Fortschreibung erzeugt die Zwischenstände ohnehin — als Verlauf festhalten
  // (Anker + je Ratentermin), damit die UI nicht nur den Stichtagswert zeigt.
  const punkte = [{ datum: anker.standdatum, wert_cents: rest }];
  for (const datum of faelligkeiten(darlehen, anker.standdatum, today)) {
    const zinsCents = Math.round((rest * zinssatzProzent) / 100 / ppj);
    const tilgung = rateCents - zinsCents;
    rest -= tilgung;
    if (rest < 0) rest = 0;
    punkte.push({ datum, wert_cents: rest });
  }
  return { wert_cents: rest, basis: "anker+tilgung", standdatum: anker.standdatum, qualitaet: anker.qualitaet, punkte };
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

export const STANDDATUM_SCHWELLEN = {
  immobilie: 12,
  vermoegenswert_edelmetall: 6,
  vermoegenswert_beteiligung: 12,
  vermoegenswert_sonstiges: 12,
  depot_aktiv: 1,
  depot_ruhig: 3,
};

function monateZwischen(vonIso, bisIso) {
  const [vy, vm, vd] = vonIso.split("-").map(Number);
  const [by, bm, bd] = bisIso.split("-").map(Number);
  let m = (by - vy) * 12 + (bm - vm);
  if (bd < vd) m -= 1;
  return m;
}

function hatDepotBewegungLetztenMonat(kontoId, transaktionen, today) {
  const grenze = addInterval(today, "monat", -1);
  return (transaktionen ?? []).some((tx) => tx.konto_id === kontoId && tx.buchungsdatum > grenze && tx.buchungsdatum <= today);
}

// Worst-of-Aggregation: eine Kennzahl ist nur so gut wie ihre schwaechste
// Eingabe. Dominanz belegt < geschaetzt < offen; eine fehlende Position (kein
// Zeitwert) zaehlt als "offen". Bewusst abgeleitet statt als Enum-Wert: "offen"
// ist die ABWESENHEIT eines Belegs, keine eigene Zeitwert-Zeile.
const QUALITAET_RANG = { belegt: 0, geschaetzt: 1, offen: 2 };
export function gesamtQualitaet(positionen) {
  let schlechteste = null;
  for (const p of positionen ?? []) {
    const q = p.fehlt || !p.qualitaet ? "offen" : p.qualitaet;
    if (schlechteste === null || QUALITAET_RANG[q] > QUALITAET_RANG[schlechteste]) schlechteste = q;
  }
  return schlechteste;
}

export function computeNettovermoegen(data, today) {
  const positionen = [];
  let aktiva = 0;
  let passiva = 0;
  let belegt = 0, geschaetzt = 0, fehlend = 0;

  for (const konto of data.konten ?? []) {
    if (konto.status === "geschlossen") continue;
    if (konto.kontotyp === "bar") continue;
    const w = kontoWert(konto, data.zeitwerte, data.transaktionen, today);
    if (w.wert_cents === null) { fehlend++; positionen.push({ klasse: "konto", id: konto.konto_id, name: konto.name, wert_cents: 0, basis: w.basis, qualitaet: null, standdatum: null, fehlt: true }); continue; }
    aktiva += w.wert_cents;
    if (w.qualitaet === "belegt") belegt++; else if (w.qualitaet === "geschaetzt") geschaetzt++;
    positionen.push({ klasse: "konto", id: konto.konto_id, name: konto.name, wert_cents: w.wert_cents, basis: w.basis, qualitaet: w.qualitaet, standdatum: w.standdatum, fehlt: false });
  }

  for (const imm of data.immobilien ?? []) {
    if (imm.status === "verkauft") continue;
    const mw = aktuellerZeitwert(data.zeitwerte, "immobilie", imm.immobilie_id, "marktwert");
    if (!mw) { fehlend++; positionen.push({ klasse: "immobilie", id: imm.immobilie_id, name: imm.bezeichnung, wert_cents: 0, basis: "marktwert-fehlt", qualitaet: null, standdatum: null, fehlt: true }); continue; }
    const cents = anteilWertCents(toCents(mw.wert), imm.eigentumsanteile);
    aktiva += cents;
    if (mw.qualitaet === "belegt") belegt++; else if (mw.qualitaet === "geschaetzt") geschaetzt++;
    positionen.push({ klasse: "immobilie", id: imm.immobilie_id, name: imm.bezeichnung, wert_cents: cents, basis: "marktwert", qualitaet: mw.qualitaet, standdatum: mw.standdatum, fehlt: false });
  }

  for (const vmw of data.vermoegenswerte ?? []) {
    if (vmw.status === "veraeussert") continue;
    const mw = aktuellerZeitwert(data.zeitwerte, "vermoegenswert", vmw.vermoegenswert_id, "marktwert");
    if (!mw) { fehlend++; positionen.push({ klasse: "vermoegenswert", id: vmw.vermoegenswert_id, name: vmw.bezeichnung, wert_cents: 0, basis: "marktwert-fehlt", qualitaet: null, standdatum: null, fehlt: true }); continue; }
    const cents = anteilWertCents(toCents(mw.wert), vmw.eigentumsanteile);
    aktiva += cents;
    if (mw.qualitaet === "belegt") belegt++; else if (mw.qualitaet === "geschaetzt") geschaetzt++;
    positionen.push({ klasse: "vermoegenswert", id: vmw.vermoegenswert_id, name: vmw.bezeichnung, wert_cents: cents, basis: "marktwert", qualitaet: mw.qualitaet, standdatum: mw.standdatum, fehlt: false });
  }

  for (const dar of data.darlehen ?? []) {
    if (dar.status === "abgeloest") continue;
    const r = restschuldHeute(dar, data.zeitwerte, today);
    if (r.wert_cents === null) { fehlend++; positionen.push({ klasse: "darlehen", id: dar.darlehen_id, name: dar.bezeichnung, wert_cents: 0, basis: r.basis, qualitaet: null, standdatum: null, fehlt: true }); continue; }
    passiva += r.wert_cents;
    if (r.qualitaet === "belegt") belegt++; else if (r.qualitaet === "geschaetzt") geschaetzt++;
    positionen.push({ klasse: "darlehen", id: dar.darlehen_id, name: dar.bezeichnung, wert_cents: -r.wert_cents, basis: r.basis, qualitaet: r.qualitaet, standdatum: r.standdatum, fehlt: false });
  }

  return {
    aktiva_cents: aktiva,
    passiva_cents: passiva,
    netto_cents: aktiva - passiva,
    positionen,
    qualitaet: { belegt, geschaetzt, fehlend, gesamt: gesamtQualitaet(positionen) },
  };
}

export function computeVermoegenChecks(data, today) {
  const checks = [];

  // Auch nicht-liquiditaetsrelevante Cash-Konten pruefen: sie fliessen via
  // kontoWert ins Nettovermoegen, also gelten Anker-Pflicht und Reconciliation dort genauso.
  for (const konto of data.konten ?? []) {
    if (konto.status === "geschlossen" || konto.kontotyp === "bar" || konto.kontotyp === "depot") continue;
    const anker = aktuellerZeitwert(data.zeitwerte, "konto", konto.konto_id, "kontostand");
    if (!anker) {
      checks.push({ art: "anker-fehlt", entitaet: "konto", entitaet_id: konto.konto_id, text: `Konto ${konto.name}: kein belegter Kontostand` });
      continue;
    }
    // Reconciliation über aufeinanderfolgende belegte Stände
    const staende = (data.zeitwerte ?? [])
      .filter((z) => z.entitaet === "konto" && z.entitaet_id === konto.konto_id && z.feld === "kontostand" && z.qualitaet === "belegt")
      .sort((a, b) => a.standdatum.localeCompare(b.standdatum));
    for (let i = 1; i < staende.length; i++) {
      const von = staende[i - 1], bis = staende[i];
      let gebucht = 0;
      for (const tx of data.transaktionen ?? []) {
        if (tx.konto_id !== konto.konto_id) continue;
        if (tx.buchungsdatum > von.standdatum && tx.buchungsdatum <= bis.standdatum) gebucht += toCents(tx.betrag);
      }
      const erwartet = toCents(von.wert) + gebucht;
      if (erwartet !== toCents(bis.wert)) {
        checks.push({ art: "reconciliation-drift", entitaet: "konto", entitaet_id: konto.konto_id, text: `Konto ${konto.name}: Buchungen passen nicht zum Kontoauszug ${bis.standdatum} (erwartet ${(erwartet / 100).toFixed(2)}, belegt ${(toCents(bis.wert) / 100).toFixed(2)})` });
      }
    }
  }

  for (const konto of data.konten ?? []) {
    if (konto.kontotyp !== "depot" || konto.status === "geschlossen") continue;
    const dw = aktuellerZeitwert(data.zeitwerte, "konto", konto.konto_id, "depotwert");
    if (!dw) { checks.push({ art: "marktwert-fehlt", entitaet: "konto", entitaet_id: konto.konto_id, text: `Depot ${konto.name}: kein Depotwert` }); continue; }
    const aktiv = hatDepotBewegungLetztenMonat(konto.konto_id, data.transaktionen, today);
    const schwelle = aktiv ? STANDDATUM_SCHWELLEN.depot_aktiv : STANDDATUM_SCHWELLEN.depot_ruhig;
    if (monateZwischen(dw.standdatum, today) >= schwelle) {
      checks.push({ art: "bewertung-veraltet", entitaet: "konto", entitaet_id: konto.konto_id, text: `Depot ${konto.name}: Depotwert vom ${dw.standdatum} älter als ${schwelle} Monat(e)` });
    }
  }

  for (const imm of data.immobilien ?? []) {
    if (imm.status === "verkauft") continue;
    const mw = aktuellerZeitwert(data.zeitwerte, "immobilie", imm.immobilie_id, "marktwert");
    if (!mw) { checks.push({ art: "marktwert-fehlt", entitaet: "immobilie", entitaet_id: imm.immobilie_id, text: `Immobilie ${imm.bezeichnung}: kein Marktwert` }); continue; }
    if (monateZwischen(mw.standdatum, today) >= STANDDATUM_SCHWELLEN.immobilie) {
      checks.push({ art: "bewertung-veraltet", entitaet: "immobilie", entitaet_id: imm.immobilie_id, text: `Immobilie ${imm.bezeichnung}: Marktwert vom ${mw.standdatum} älter als ${STANDDATUM_SCHWELLEN.immobilie} Monate` });
    }
  }

  for (const vmw of data.vermoegenswerte ?? []) {
    if (vmw.status === "veraeussert") continue;
    const mw = aktuellerZeitwert(data.zeitwerte, "vermoegenswert", vmw.vermoegenswert_id, "marktwert");
    if (!mw) { checks.push({ art: "marktwert-fehlt", entitaet: "vermoegenswert", entitaet_id: vmw.vermoegenswert_id, text: `Vermögenswert ${vmw.bezeichnung}: kein Marktwert` }); continue; }
    const schwelle = STANDDATUM_SCHWELLEN[`vermoegenswert_${vmw.typ}`] ?? 12;
    if (monateZwischen(mw.standdatum, today) >= schwelle) {
      checks.push({ art: "bewertung-veraltet", entitaet: "vermoegenswert", entitaet_id: vmw.vermoegenswert_id, text: `Vermögenswert ${vmw.bezeichnung}: Wert vom ${mw.standdatum} älter als ${schwelle} Monat(e)` });
    }
  }

  for (const dar of data.darlehen ?? []) {
    if (dar.status === "abgeloest") continue;
    const anker = aktuellerZeitwert(data.zeitwerte, "darlehen", dar.darlehen_id, "restschuld");
    // kein continue — fehlender Anker und fehlende Regelzahlung sind unabhängige Befunde
    if (!anker) checks.push({ art: "anker-fehlt", entitaet: "darlehen", entitaet_id: dar.darlehen_id, text: `Darlehen ${dar.bezeichnung}: kein belegter Restschuldstand` });
    const hatRate = (data.regelzahlungen ?? []).some((rz) => rz.darlehen_id === dar.darlehen_id && rz.status === "bestaetigt");
    if (!hatRate) checks.push({ art: "darlehen-ohne-regelzahlung", entitaet: "darlehen", entitaet_id: dar.darlehen_id, text: `Darlehen ${dar.bezeichnung}: Rate nicht in der Liquiditätsprognose — Regelzahlung anlegen?` });
  }

  return checks;
}

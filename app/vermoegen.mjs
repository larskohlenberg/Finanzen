// app/vermoegen.mjs
// Reine, deterministische Vermögens-/Nettovermögens-Mathematik. Kein DOM, keine Node-Abhängigkeiten.
// Eine getestete Funktion an zwei Aufrufstellen: Browser (app/main.js) und Node (tests/).
// Liegt unter app/, weil der Webserver nur das App-Verzeichnis ausliefert (ADR 0009/0012).
// Modell-Begründungen: ADR 0013 (Anker + Reconciliation), ADR 0014 (Nettovermögen Haushaltssicht).

import { toCents, addInterval } from "./liquiditaet.mjs";
import { dynamikStand } from "./vorsorge-dynamik.mjs";
import { anstehendeFristen } from "./fristen.mjs";

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

// Konto-Wert nach Kontotyp (ADR 0013), zum Stichtag `today`: spaetere Anker und
// Depotwerte zaehlen nicht.
export function kontoWert(konto, zeitwerte, transaktionen, today) {
  if (konto.kontotyp === "bar") {
    return { wert_cents: null, basis: "bar-ignoriert", standdatum: null, qualitaet: null };
  }
  if (konto.kontotyp === "depot") {
    const dw = aktuellerZeitwert(zeitwerte, "konto", konto.konto_id, "depotwert", today);
    if (!dw) return { wert_cents: null, basis: "depotwert-fehlt", standdatum: null, qualitaet: null };
    return { wert_cents: toCents(dw.wert), basis: "depotwert", standdatum: dw.standdatum, qualitaet: dw.qualitaet };
  }
  // giro | spar | tagesgeld | festgeld | kreditkarte: Anker + Buchungen danach.
  // Importierte Buchungen stammen selbst aus Belegen (Export, Auszug, Screenshot):
  // der Stand reicht deshalb bis zur letzten eingerechneten Buchung, nicht nur
  // bis zum Ankerdatum. anker_datum haelt den Kontoauszug-Stand fest.
  const anker = aktuellerZeitwert(zeitwerte, "konto", konto.konto_id, "kontostand", today);
  if (!anker) return { wert_cents: null, basis: "anker-fehlt", standdatum: null, qualitaet: null };
  let summe = toCents(anker.wert);
  let standdatum = anker.standdatum;
  for (const tx of transaktionen ?? []) {
    if (tx.konto_id !== konto.konto_id) continue;
    if (tx.buchungsdatum <= anker.standdatum) continue;
    if (tx.buchungsdatum > today) continue;
    summe += toCents(tx.betrag);
    if (tx.buchungsdatum > standdatum) standdatum = tx.buchungsdatum;
  }
  return { wert_cents: summe, basis: "anker+buchungen", standdatum, anker_datum: anker.standdatum, qualitaet: anker.qualitaet };
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

// Restschuld nach Annuität: Anker + Tilgung der seit Anker fälligen Perioden (ADR 0013).
export function restschuldHeute(darlehen, zeitwerte, today) {
  const plan = darlehensplan(darlehen, zeitwerte, today);
  if (!plan) return { wert_cents: null, basis: "anker-fehlt", standdatum: null, qualitaet: null };
  const { anker, raten } = plan;
  // Die Fortschreibung erzeugt die Zwischenstände ohnehin — als Verlauf festhalten
  // (Anker + je Ratentermin), damit die UI nicht nur den Stichtagswert zeigt.
  const punkte = [{ datum: anker.standdatum, wert_cents: toCents(anker.wert) }, ...raten.map((r) => ({ datum: r.datum, wert_cents: r.rest_cents }))];
  return { wert_cents: punkte.at(-1).wert_cents, basis: "anker+tilgung", standdatum: anker.standdatum, qualitaet: anker.qualitaet, punkte };
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
    summe += (marktwertCents * a.zaehler) / a.nenner;
  }
  return Math.round(summe);
}

export const STANDDATUM_SCHWELLEN = {
  immobilie: 12,
  vorsorge: 12,
  vermoegenswert_edelmetall: 6,
  vermoegenswert_beteiligung: 12,
  vermoegenswert_sonstiges: 12,
  depot_aktiv: 1,
  depot_ruhig: 3,
  konto: 1,
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

// Ab wie vielen Monaten der Stand eines Kontos als veraltet gilt: Depot mit
// Bewegung im letzten Monat 1, ruhiges Depot 3, alle anderen Konten 1.
export function standSchwelleMonate(konto, transaktionen, today) {
  if (konto.kontotyp !== "depot") return STANDDATUM_SCHWELLEN.konto;
  return hatDepotBewegungLetztenMonat(konto.konto_id, transaktionen, today)
    ? STANDDATUM_SCHWELLEN.depot_aktiv
    : STANDDATUM_SCHWELLEN.depot_ruhig;
}

export function standVeraltet(konto, standdatum, transaktionen, today) {
  if (!standdatum) return false;
  return monateZwischen(standdatum, today) >= standSchwelleMonate(konto, transaktionen, today);
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
    const mw = aktuellerZeitwert(data.zeitwerte, "immobilie", imm.immobilie_id, "marktwert", today);
    if (!mw) { fehlend++; positionen.push({ klasse: "immobilie", id: imm.immobilie_id, name: imm.bezeichnung, wert_cents: 0, basis: "marktwert-fehlt", qualitaet: null, standdatum: null, fehlt: true }); continue; }
    const cents = anteilWertCents(toCents(mw.wert), imm.eigentumsanteile);
    aktiva += cents;
    if (mw.qualitaet === "belegt") belegt++; else if (mw.qualitaet === "geschaetzt") geschaetzt++;
    positionen.push({ klasse: "immobilie", id: imm.immobilie_id, name: imm.bezeichnung, wert_cents: cents, basis: "marktwert", qualitaet: mw.qualitaet, standdatum: mw.standdatum, fehlt: false });
  }

  for (const vmw of data.vermoegenswerte ?? []) {
    if (vmw.status === "veraeussert") continue;
    const mw = aktuellerZeitwert(data.zeitwerte, "vermoegenswert", vmw.vermoegenswert_id, "marktwert", today);
    if (!mw) { fehlend++; positionen.push({ klasse: "vermoegenswert", id: vmw.vermoegenswert_id, name: vmw.bezeichnung, wert_cents: 0, basis: "marktwert-fehlt", qualitaet: null, standdatum: null, fehlt: true }); continue; }
    const cents = anteilWertCents(toCents(mw.wert), vmw.eigentumsanteile);
    aktiva += cents;
    if (mw.qualitaet === "belegt") belegt++; else if (mw.qualitaet === "geschaetzt") geschaetzt++;
    positionen.push({ klasse: "vermoegenswert", id: vmw.vermoegenswert_id, name: vmw.bezeichnung, wert_cents: cents, basis: "marktwert", qualitaet: mw.qualitaet, standdatum: mw.standdatum, fehlt: false });
  }

  for (const vs of data.vorsorge ?? []) {
    if (!vs.kapitalbildend) continue;
    const rw = aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, "rueckkaufswert", today);
    if (!rw) { fehlend++; positionen.push({ klasse: "vorsorge", id: vs.vorsorge_id, name: vs.name, wert_cents: 0, basis: "rueckkaufswert-fehlt", qualitaet: null, standdatum: null, fehlt: true }); continue; }
    const cents = toCents(rw.wert);
    aktiva += cents;
    if (rw.qualitaet === "belegt") belegt++; else if (rw.qualitaet === "geschaetzt") geschaetzt++;
    positionen.push({ klasse: "vorsorge", id: vs.vorsorge_id, name: vs.name, wert_cents: cents, basis: "rueckkaufswert", qualitaet: rw.qualitaet, standdatum: rw.standdatum, fehlt: false });
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

// Reconciliation über aufeinanderfolgende belegte Stände eines Kontos: Anker plus
// Buchungen bis zum nächsten Anker muss den nächsten Anker ergeben. Liefert jede
// Abweichung (nur Staende bis `bis`, falls gesetzt); leer heißt, die Kette geht auf. Genutzt von den Vermögens-Checks
// und vom Prüfbericht (tools/pruefbericht.mjs).
export function reconciliationDrift(konto, zeitwerte, transaktionen, bis = null) {
  const staende = (zeitwerte ?? [])
    .filter((z) => z.entitaet === "konto" && z.entitaet_id === konto.konto_id && z.feld === "kontostand" && z.qualitaet === "belegt" && (!bis || z.standdatum <= bis))
    .sort((a, b) => a.standdatum.localeCompare(b.standdatum));
  const drift = [];
  for (let i = 1; i < staende.length; i++) {
    const von = staende[i - 1], bis = staende[i];
    let gebucht = 0;
    for (const tx of transaktionen ?? []) {
      if (tx.konto_id !== konto.konto_id) continue;
      if (tx.buchungsdatum > von.standdatum && tx.buchungsdatum <= bis.standdatum) gebucht += toCents(tx.betrag);
    }
    const erwartet = toCents(von.wert) + gebucht;
    const belegt = toCents(bis.wert);
    if (erwartet !== belegt) {
      drift.push({ konto_id: konto.konto_id, von: von.standdatum, bis: bis.standdatum, erwartet_cents: erwartet, belegt_cents: belegt, differenz_cents: belegt - erwartet });
    }
  }
  return drift;
}

export function computeVermoegenChecks(data, today) {
  const checks = [];

  // Auch nicht-liquiditaetsrelevante Cash-Konten pruefen: sie fliessen via
  // kontoWert ins Nettovermoegen, also gelten Anker-Pflicht und Reconciliation dort genauso.
  for (const konto of data.konten ?? []) {
    if (konto.status === "geschlossen" || konto.kontotyp === "bar" || konto.kontotyp === "depot") continue;
    const anker = aktuellerZeitwert(data.zeitwerte, "konto", konto.konto_id, "kontostand", today);
    if (!anker) {
      checks.push({ art: "anker-fehlt", entitaet: "konto", entitaet_id: konto.konto_id, text: `Konto ${konto.name}: kein belegter Kontostand` });
      continue;
    }
    for (const d of reconciliationDrift(konto, data.zeitwerte, data.transaktionen, today)) {
      checks.push({ art: "reconciliation-drift", entitaet: "konto", entitaet_id: konto.konto_id, text: `Konto ${konto.name}: Buchungen passen nicht zum Kontoauszug ${d.bis} (erwartet ${(d.erwartet_cents / 100).toFixed(2)}, belegt ${(d.belegt_cents / 100).toFixed(2)})` });
    }
  }

  for (const konto of data.konten ?? []) {
    if (konto.kontotyp !== "depot" || konto.status === "geschlossen") continue;
    const dw = aktuellerZeitwert(data.zeitwerte, "konto", konto.konto_id, "depotwert", today);
    if (!dw) { checks.push({ art: "marktwert-fehlt", entitaet: "konto", entitaet_id: konto.konto_id, text: `Depot ${konto.name}: kein Depotwert` }); continue; }
    const schwelle = standSchwelleMonate(konto, data.transaktionen, today);
    if (standVeraltet(konto, dw.standdatum, data.transaktionen, today)) {
      checks.push({ art: "bewertung-veraltet", entitaet: "konto", entitaet_id: konto.konto_id, text: `Depot ${konto.name}: Depotwert vom ${dw.standdatum} älter als ${schwelle} Monat(e)` });
    }
  }

  for (const imm of data.immobilien ?? []) {
    if (imm.status === "verkauft") continue;
    const mw = aktuellerZeitwert(data.zeitwerte, "immobilie", imm.immobilie_id, "marktwert", today);
    if (!mw) { checks.push({ art: "marktwert-fehlt", entitaet: "immobilie", entitaet_id: imm.immobilie_id, text: `Immobilie ${imm.bezeichnung}: kein Marktwert` }); continue; }
    if (monateZwischen(mw.standdatum, today) >= STANDDATUM_SCHWELLEN.immobilie) {
      checks.push({ art: "bewertung-veraltet", entitaet: "immobilie", entitaet_id: imm.immobilie_id, text: `Immobilie ${imm.bezeichnung}: Marktwert vom ${mw.standdatum} älter als ${STANDDATUM_SCHWELLEN.immobilie} Monate` });
    }
  }

  for (const vmw of data.vermoegenswerte ?? []) {
    if (vmw.status === "veraeussert") continue;
    const mw = aktuellerZeitwert(data.zeitwerte, "vermoegenswert", vmw.vermoegenswert_id, "marktwert", today);
    if (!mw) { checks.push({ art: "marktwert-fehlt", entitaet: "vermoegenswert", entitaet_id: vmw.vermoegenswert_id, text: `Vermögenswert ${vmw.bezeichnung}: kein Marktwert` }); continue; }
    const schwelle = STANDDATUM_SCHWELLEN[`vermoegenswert_${vmw.typ}`] ?? 12;
    if (monateZwischen(mw.standdatum, today) >= schwelle) {
      checks.push({ art: "bewertung-veraltet", entitaet: "vermoegenswert", entitaet_id: vmw.vermoegenswert_id, text: `Vermögenswert ${vmw.bezeichnung}: Wert vom ${mw.standdatum} älter als ${schwelle} Monat(e)` });
    }
  }

  for (const dar of data.darlehen ?? []) {
    if (dar.status === "abgeloest") continue;
    const anker = aktuellerZeitwert(data.zeitwerte, "darlehen", dar.darlehen_id, "restschuld", today);
    // kein continue — fehlender Anker und fehlende Regelzahlung sind unabhängige Befunde
    if (!anker) checks.push({ art: "anker-fehlt", entitaet: "darlehen", entitaet_id: dar.darlehen_id, text: `Darlehen ${dar.bezeichnung}: kein belegter Restschuldstand` });
    const hatRate = (data.regelzahlungen ?? []).some((rz) => rz.darlehen_id === dar.darlehen_id && rz.status === "bestaetigt");
    if (!hatRate) checks.push({ art: "darlehen-ohne-regelzahlung", entitaet: "darlehen", entitaet_id: dar.darlehen_id, text: `Darlehen ${dar.bezeichnung}: Rate nicht in der Liquiditätsprognose — Regelzahlung anlegen?` });
  }

  for (const vs of data.vorsorge ?? []) {
    if (vs.status === "beendet" || vs.status === "gekuendigt") continue;
    // Beitragsdynamik: Termin naht ohne Entscheidung, oder ein Angebot liegt vor.
    const dynamik = dynamikStand(vs, today);
    if (dynamik?.entscheidung_noetig) {
      const regel = dynamik.vorschlag ? ` — nach der Regel „nur jede dritte annehmen“: ${dynamik.vorschlag}${dynamik.letzte_chance ? " (ein weiterer Widerspruch beendet das Dynamikrecht)" : ""}` : " — Verlauf unvollständig, frühere Entscheidungen aus den Lastschriften klären";
      checks.push({ art: "vorsorge-dynamik", entitaet: "vorsorge", entitaet_id: vs.vorsorge_id, text: `Vorsorge ${vs.name}: Dynamik zum ${dynamik.naechster_termin} entscheiden${regel}` });
    }
    if (!vs.geprueft_am) {
      checks.push({ art: "vorsorge-ungeprueft", entitaet: "vorsorge", entitaet_id: vs.vorsorge_id, text: `Vorsorge ${vs.name}: ungeprüfter Anspruch — darf nicht als sicherer Zukunftswert gelten` });
      continue;
    }

    // Jede Mitteilung zaehlt als Pruefung, auch eine mit reinen Absicherungswerten (BU, Tod).
    const felder = ["rueckkaufswert", "erwartete_rente", "erwartete_kapitalleistung", "vertragswert", "bu_rente", "erwerbsminderungsrente", "todesfallleistung", "hinterbliebenenrente", "beitragssumme"];
    let juengstes = vs.geprueft_am;
    for (const feld of felder) {
      const zw = aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, feld, today);
      if (zw && zw.standdatum > juengstes) juengstes = zw.standdatum;
    }

    if (monateZwischen(juengstes, today) >= STANDDATUM_SCHWELLEN.vorsorge) {
      checks.push({ art: "vorsorge-wiedervorlage", entitaet: "vorsorge", entitaet_id: vs.vorsorge_id, text: `Vorsorge ${vs.name}: letzte Prüfung/Mitteilung vom ${juengstes} älter als ${STANDDATUM_SCHWELLEN.vorsorge} Monate — Werte verifizieren (z. B. Gesetzesänderung)` });
    }
  }

  const wechselHorizont = addInterval(today, "monat", 24);
  for (const vs of data.vorsorge ?? []) {
    let ende = null;
    for (const rz of data.regelzahlungen ?? []) {
      if (rz.vorsorge_id !== vs.vorsorge_id || !rz.aktiv_bis) continue;
      if (rz.aktiv_bis > today && rz.aktiv_bis <= wechselHorizont) {
        if (!ende || rz.aktiv_bis > ende) ende = rz.aktiv_bis;
      }
    }
    if (!ende) continue;

    const nachfolger = (data.vorsorge ?? []).find((v) => v.vorsorge_id !== vs.vorsorge_id && v.ersetzt_vorsorge_id === vs.vorsorge_id);
    if (!nachfolger) {
      checks.push({ art: "vorsorge-wechsel", entitaet: "vorsorge", entitaet_id: vs.vorsorge_id, text: `Vorsorge ${vs.name}: Beitrag endet ${ende}, keine Nachfolge erkennbar — Wechsel oder bewusste Kündigung?` });
      continue;
    }

    const nachBeitragStart = (data.regelzahlungen ?? [])
      .filter((rz) => rz.vorsorge_id === nachfolger.vorsorge_id)
      .map((rz) => rz.anker_datum)
      .sort()[0];
    if (!nachBeitragStart || nachBeitragStart > addInterval(ende, "tag", 1)) {
      checks.push({ art: "vorsorge-wechsel", entitaet: "vorsorge", entitaet_id: vs.vorsorge_id, text: `Vorsorge ${vs.name}: Deckungslücke — alt endet ${ende}, Nachfolge ${nachfolger.name} beginnt ${nachBeitragStart ?? "ohne Beitrag"}` });
    }
  }

  // Ueberfaellige, nicht abgehakte Fristen (ADR 0031). Der Link fuehrt zum
  // Objekt der Frist; ohne Bezug traegt der Check die Frist-ID.
  for (const termin of anstehendeFristen(data, today, 0)) {
    if (!termin.ueberfaellig) continue;
    checks.push({
      art: "frist-ueberfaellig",
      entitaet: termin.bezug?.typ ?? "frist",
      entitaet_id: termin.bezug?.id ?? termin.frist_id,
      text: `Frist ${termin.frist_id} ${termin.bezeichnung}: fällig am ${termin.datum}, nicht erledigt — erledigen und erledigt_bis setzen`,
    });
  }

  return checks;
}

// ------------------------------------------------------------- Verlaeufe

// Aeltester bekannter Zeitwert eines Felds (fuer Stichtage vor dem ersten Wert).
function aeltesterZeitwert(zeitwerte, entitaet, entitaetId, feld) {
  let best = null;
  for (const zw of zeitwerte ?? []) {
    if (zw.entitaet !== entitaet || zw.entitaet_id !== entitaetId || zw.feld !== feld) continue;
    if (best === null || zw.standdatum < best.standdatum) best = zw;
  }
  return best;
}

// Wert zum Stichtag: juengster Zeitwert bis dahin, sonst der aelteste bekannte
// (vor dem ersten Wert gilt der Status quo rueckwaerts).
const wertAm = (zeitwerte, entitaet, id, feld, datum) =>
  aktuellerZeitwert(zeitwerte, entitaet, id, feld, datum) ?? aeltesterZeitwert(zeitwerte, entitaet, id, feld);

// Beendete Objekte zaehlen bis aktiv_bis mit, ohne aktiv_bis gar nicht (wie heute).
const aktivAm = (obj, endStatus, datum) => obj.status !== endStatus || Boolean(obj.aktiv_bis && datum <= obj.aktiv_bis);

// Kontostand zum Stichtag: vom juengsten Anker bis dahin vorwaerts, sonst vom
// aeltesten Anker rueckwaerts (Buchungen bis zum Anker stecken in ihm). Vor der
// ersten Buchung und dem ersten Anker gab es das Konto noch nicht: null.
function kontoStandAm(konto, zeitwerte, transaktionen, datum) {
  const vorher = aktuellerZeitwert(zeitwerte, "konto", konto.konto_id, "kontostand", datum);
  const anker = vorher ?? aeltesterZeitwert(zeitwerte, "konto", konto.konto_id, "kontostand");
  if (!anker) return null;
  let beginn = anker.standdatum;
  let summe = toCents(anker.wert);
  for (const tx of transaktionen ?? []) {
    if (tx.konto_id !== konto.konto_id) continue;
    if (tx.buchungsdatum < beginn) beginn = tx.buchungsdatum;
    if (vorher) {
      if (tx.buchungsdatum > anker.standdatum && tx.buchungsdatum <= datum) summe += toCents(tx.betrag);
    } else if (tx.buchungsdatum > datum && tx.buchungsdatum <= anker.standdatum) summe -= toCents(tx.betrag);
  }
  return datum < beginn ? null : summe;
}

// Restschuld zum Stichtag: Annuitaet ab dem juengsten Anker bis dahin; vor dem
// ersten Anker ab Anfangsbetrag und Anfangsdatum, ohne Anfangsbetrag der
// aelteste Anker. Vor dem Anfangsdatum 0.
function restschuldAm(darlehen, zeitwerte, datum) {
  if (darlehen.anfangsdatum && datum < darlehen.anfangsdatum) return 0;
  const bisDahin = (zeitwerte ?? []).filter((z) => z.standdatum <= datum);
  let plan = darlehensplan(darlehen, bisDahin, datum);
  if (!plan && darlehen.anfangsbetrag && darlehen.anfangsdatum) {
    const start = { entitaet: "darlehen", entitaet_id: darlehen.darlehen_id, feld: "restschuld", wert: darlehen.anfangsbetrag, standdatum: darlehen.anfangsdatum };
    plan = darlehensplan(darlehen, [start], datum);
  }
  if (!plan) {
    const aeltester = aeltesterZeitwert(zeitwerte, "darlehen", darlehen.darlehen_id, "restschuld");
    return aeltester ? toCents(aeltester.wert) : null;
  }
  return plan.raten.at(-1)?.rest_cents ?? toCents(plan.anker.wert);
}

// Nettovermoegen zum Stichtag, gleiche Positionen wie computeNettovermoegen.
// Fuer heute ergibt es dieselben Summen.
export function nettovermoegenAm(data, datum) {
  const zw = data.zeitwerte;
  let aktiva = 0;
  let passiva = 0;
  for (const konto of data.konten ?? []) {
    if (konto.kontotyp === "bar" || !aktivAm(konto, "geschlossen", datum)) continue;
    if (konto.kontotyp === "depot") {
      const dw = wertAm(zw, "konto", konto.konto_id, "depotwert", datum);
      if (dw) aktiva += toCents(dw.wert);
      continue;
    }
    aktiva += kontoStandAm(konto, zw, data.transaktionen, datum) ?? 0;
  }
  for (const imm of data.immobilien ?? []) {
    if (!aktivAm(imm, "verkauft", datum)) continue;
    if (imm.anschaffungsdatum && datum < imm.anschaffungsdatum) continue;
    const mw = aktuellerZeitwert(zw, "immobilie", imm.immobilie_id, "marktwert", datum)
      ?? (imm.anschaffungskosten ? { wert: imm.anschaffungskosten } : aeltesterZeitwert(zw, "immobilie", imm.immobilie_id, "marktwert"));
    if (mw) aktiva += anteilWertCents(toCents(mw.wert), imm.eigentumsanteile);
  }
  for (const vmw of data.vermoegenswerte ?? []) {
    if (!aktivAm(vmw, "veraeussert", datum)) continue;
    const mw = wertAm(zw, "vermoegenswert", vmw.vermoegenswert_id, "marktwert", datum);
    if (mw) aktiva += anteilWertCents(toCents(mw.wert), vmw.eigentumsanteile);
  }
  for (const vs of data.vorsorge ?? []) {
    if (!vs.kapitalbildend) continue;
    const rw = wertAm(zw, "vorsorge", vs.vorsorge_id, "rueckkaufswert", datum);
    if (rw) aktiva += toCents(rw.wert);
  }
  for (const dar of data.darlehen ?? []) {
    if (!aktivAm(dar, "abgeloest", datum)) continue;
    passiva += restschuldAm(dar, zw, datum) ?? 0;
  }
  return { datum, aktiva_cents: aktiva, passiva_cents: passiva, netto_cents: aktiva - passiva };
}

const monatsEnde = (monat) => addInterval(addInterval(`${monat}-01`, "monat", 1), "tag", -1);

// Nettovermoegen je Monatsende ab dem Monat der ersten Buchung (ohne Buchungen
// ab dem ersten Zeitwert), der laufende Monat zum heutigen Tag.
export function nettovermoegenVerlauf(data, today) {
  let erste = null;
  for (const tx of data.transaktionen ?? []) if (tx.buchungsdatum <= today && (!erste || tx.buchungsdatum < erste)) erste = tx.buchungsdatum;
  if (!erste) for (const z of data.zeitwerte ?? []) if (z.standdatum <= today && (!erste || z.standdatum < erste)) erste = z.standdatum;
  if (!erste) return [];
  const punkte = [];
  for (let monat = erste.slice(0, 7); monat <= today.slice(0, 7); monat = addInterval(`${monat}-01`, "monat", 1).slice(0, 7)) {
    const datum = monat === today.slice(0, 7) ? today : monatsEnde(monat);
    punkte.push({ monat, ...nettovermoegenAm(data, datum) });
  }
  return punkte;
}

// Restschuld aller laufenden Darlehen je Jahresende, von heute bis alle getilgt
// sind (Fortschreibung mit der heutigen Rate, auch ueber die Zinsbindung hinaus;
// laeuft ein Darlehen nie aus, endet die Reihe nach 40 Jahren). Dazu je Darlehen
// Zinsbindungsende und Tilgungsende als Ereignis. Ohne Darlehen mit Anker null.
export function restschuldJahre(data, today) {
  const start = Number(today.slice(0, 4));
  const grenze = `${start + 40}-12-31`;
  const plaene = (data.darlehen ?? [])
    .filter((d) => d.status !== "abgeloest")
    .map((d) => ({ darlehen: d, plan: darlehensplan(d, data.zeitwerte, grenze) }))
    .filter((x) => x.plan);
  if (!plaene.length) return null;
  const ereignisse = [];
  let ende = start;
  for (const { darlehen, plan } of plaene) {
    const frei = plan.raten.find((r) => r.rest_cents <= 0)?.datum ?? null;
    ende = Math.max(ende, Number((frei ?? grenze).slice(0, 4)));
    if (darlehen.zinsbindung_bis && darlehen.zinsbindung_bis >= today) ereignisse.push({ datum: darlehen.zinsbindung_bis, typ: "zinsbindung", darlehen });
    if (frei) ereignisse.push({ datum: frei, typ: "frei", darlehen });
  }
  const jahre = [];
  for (let j = start; j <= ende; j++) jahre.push(j);
  const restBis = ({ plan }, datum) => {
    let rest = toCents(plan.anker.wert);
    for (const r of plan.raten) if (r.datum <= datum) rest = r.rest_cents;
    return rest;
  };
  const rest = jahre.map((j) => plaene.reduce((a, x) => a + restBis(x, `${j}-12-31`), 0));
  ereignisse.sort((a, b) => a.datum.localeCompare(b.datum));
  const freiAb = ereignisse.filter((e) => e.typ === "frei").length === plaene.length ? ereignisse.filter((e) => e.typ === "frei").at(-1).datum : null;
  return { jahre, rest, ereignisse, frei_ab: freiAb };
}

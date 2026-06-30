// app/szenarien.mjs — deterministische, reine Szenario-Engine (browser- & node-fähig).
// Keine Node-I/O. Rechnet ab Rechenstichtag `today` (nicht `stand`).
import { occurrences, addInterval, monatVon, toCents } from "./liquiditaet.mjs";
import { faelligkeiten, aktuellerZeitwert, anteilWertCents } from "./vermoegen.mjs";

const PPJ = { tag: 365, woche: 52, monat: 12, jahr: 1 };
const GUARDRAIL_SCHWELLE = 0.9;
const MATERIALITAET_MONAT_CENTS = 5000;

const startSaldoCents = (data, today) => {
  // aggregierter liquider Startsaldo: belegter Anker + Ist-Buchungen je liquidem Konto bis today
  let summe = 0;
  for (const konto of data.konten ?? []) {
    if (konto.status === "geschlossen") continue;
    if (!konto.liquiditaetsrelevant || konto.kontotyp === "bar" || konto.kontotyp === "depot") continue;
    let best = null;
    for (const zw of data.zeitwerte ?? []) {
      if (zw.entitaet === "konto" && zw.entitaet_id === konto.konto_id && zw.feld === "kontostand" && zw.standdatum <= today) {
        if (!best || zw.standdatum > best.standdatum) best = zw;
      }
    }
    if (!best) continue;
    let s = toCents(best.wert);
    for (const tx of data.transaktionen ?? []) {
      if (tx.konto_id === konto.konto_id && tx.buchungsdatum > best.standdatum && tx.buchungsdatum <= today) s += toCents(tx.betrag);
    }
    summe += s;
  }
  return summe;
};

export function modifizierteRegelzahlungen(data, szenario) {
  const warnungen = [];
  const aenderungen = (szenario.annahmen ?? []).filter((a) => a.art === "regelzahlung-aenderung");
  const neue = (szenario.annahmen ?? []).filter((a) => a.art === "regelzahlung-neu");
  let rzs = (data.regelzahlungen ?? []).filter((r) => r.status === "bestaetigt").map((r) => ({ ...r }));

  for (const ae of aenderungen) {
    const ziel = rzs.find((r) => r.regelzahlung_id === ae.regelzahlung_id);
    if (!ziel) { warnungen.push({ code: "aenderung-wirkungslos", text: `Änderung auf unbekannte Regelzahlung ${ae.regelzahlung_id}` }); continue; }
    const vortag = addInterval(ae.ab, "tag", -1);
    if (ae.ab < ziel.anker_datum) { warnungen.push({ code: "aenderung-wirkungslos", text: `Änderung ${ae.annahme_id} liegt vor dem Anker der Regelzahlung` }); continue; }
    if (ziel.aktiv_bis && ziel.aktiv_bis < ae.ab) { warnungen.push({ code: "aenderung-wirkungslos", text: `Regelzahlung ${ae.regelzahlung_id} ist vor ${ae.ab} bereits abgelaufen` }); continue; }
    if (ae.aktion === "beenden") {
      ziel.aktiv_bis = ziel.aktiv_bis && ziel.aktiv_bis < vortag ? ziel.aktiv_bis : vortag;
    } else if (ae.aktion === "betrag-aendern") {
      const klon = { ...ziel, regelzahlung_id: `${ziel.regelzahlung_id}~${ae.annahme_id}`, anker_datum: ae.ab, betrag: ae.betrag };
      ziel.aktiv_bis = ziel.aktiv_bis && ziel.aktiv_bis < vortag ? ziel.aktiv_bis : vortag;
      rzs.push(klon);
    }
  }
  for (const n of neue) {
    rzs.push({ regelzahlung_id: n.annahme_id, bezeichnung: n.name ?? "Szenario-Zahlung", betrag: n.betrag, qualitaet: n.qualitaet,
      rhythmus_einheit: n.rhythmus_einheit, rhythmus_intervall: n.rhythmus_intervall, anker_datum: n.ab, aktiv_bis: n.bis, status: "bestaetigt",
      kategorie_id: n.kategorie_id, _gegenbuchung: n.gegenbuchung });
  }
  return { rzs, warnungen };
}

const QUALITAET_RANG = { belegt: 0, geschaetzt: 1, offen: 2 };
function worstOf(qualitaeten) {
  let s = null;
  for (const q of qualitaeten) { const r = q ?? "offen"; if (s === null || QUALITAET_RANG[r] > QUALITAET_RANG[s]) s = r; }
  return s ?? "belegt";
}

// Rohe Sondertilgungs-Ereignisse (Nominalbetrag, Magnitude) aus einmalzahlung(gegenbuchung
// darlehen) und aus regelzahlung-neu-Klonen mit _gegenbuchung(darlehen) — je occurrences-Termin
// ein Ereignis.
function sammleSondertilgungen(szenario, rzs, today, horizon) {
  const ereignisse = [];
  for (const a of szenario.annahmen ?? []) {
    if (a.art !== "einmalzahlung") continue;
    if (a.gegenbuchung?.ziel_typ !== "darlehen") continue;
    if (!(a.datum > today && a.datum <= horizon)) continue;
    ereignisse.push({ annahme_id: a.annahme_id, darlehen_id: a.gegenbuchung.ziel_id, datum: a.datum, nominal_cents: Math.abs(toCents(a.betrag)) });
  }
  for (const rz of rzs) {
    if (rz._gegenbuchung?.ziel_typ !== "darlehen") continue;
    for (const datum of occurrences(rz, today, horizon)) {
      ereignisse.push({ annahme_id: `${rz.regelzahlung_id}@${datum}`, darlehen_id: rz._gegenbuchung.ziel_id, datum, nominal_cents: Math.abs(toCents(rz.betrag)) });
    }
  }
  return ereignisse;
}

function depotKonten(data) {
  return (data.konten ?? []).filter((k) => k.kontotyp === "depot");
}

// Gegenbuchung(depot)-Cash-Ereignisse: Verkauf (cash_cents > 0) senkt Depotwert,
// Kauf/Sparplan (cash_cents < 0) erhöht ihn. Aus einmalzahlung und aus
// regelzahlung-neu-Klonen (_gegenbuchung.ziel_typ === "depot"), je occurrences-Termin.
function sammleDepotGegenbuchungen(szenario, rzs, today, horizon) {
  const ereignisse = [];
  for (const a of szenario.annahmen ?? []) {
    if (a.art !== "einmalzahlung") continue;
    if (a.gegenbuchung?.ziel_typ !== "depot") continue;
    if (!(a.datum > today && a.datum <= horizon)) continue;
    ereignisse.push({ annahme_id: a.annahme_id, ziel_id: a.gegenbuchung.ziel_id, datum: a.datum, cash_cents: toCents(a.betrag) });
  }
  for (const rz of rzs) {
    if (rz._gegenbuchung?.ziel_typ !== "depot") continue;
    for (const datum of occurrences(rz, today, horizon)) {
      ereignisse.push({ annahme_id: `${rz.regelzahlung_id}@${datum}`, ziel_id: rz._gegenbuchung.ziel_id, datum, cash_cents: toCents(rz.betrag) });
    }
  }
  ereignisse.sort((x, y) => x.datum.localeCompare(y.datum));
  return ereignisse;
}

// Startwerte aktiver Sachwert-Positionen (anteilsgewichteter Marktwert ≤ today, eingefroren).
// Positionen ohne Zeitwert tragen 0 und gelten als "offen" für die Qualität.
function sachwertStartwerte(data, today) {
  const werte = new Map(); // `${typ}:${id}` -> cents
  const qualitaeten = [];
  for (const imm of data.immobilien ?? []) {
    if (imm.status === "verkauft") continue;
    const zw = aktuellerZeitwert(data.zeitwerte, "immobilie", imm.immobilie_id, "marktwert", today);
    werte.set(`immobilie:${imm.immobilie_id}`, zw ? anteilWertCents(toCents(zw.wert), imm.eigentumsanteile) : 0);
    qualitaeten.push(zw ? zw.qualitaet : "offen");
  }
  for (const v of data.vermoegenswerte ?? []) {
    if (v.status === "veraeussert") continue;
    const zw = aktuellerZeitwert(data.zeitwerte, "vermoegenswert", v.vermoegenswert_id, "marktwert", today);
    werte.set(`vermoegenswert:${v.vermoegenswert_id}`, zw ? anteilWertCents(toCents(zw.wert), v.eigentumsanteile) : 0);
    qualitaeten.push(zw ? zw.qualitaet : "offen");
  }
  for (const vs of data.vorsorge ?? []) {
    if (!vs.kapitalbildend) continue;
    if (vs.status === "beendet" || vs.status === "gekuendigt") continue;
    const zw = aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, "rueckkaufswert", today);
    werte.set(`vorsorge:${vs.vorsorge_id}`, zw ? toCents(zw.wert) : 0);
    qualitaeten.push(zw ? zw.qualitaet : "offen");
  }
  return { werte, qualitaeten };
}

// Gegenbuchung(immobilie|vermoegenswert): Abbau (ziel_id, bestehende Position verkauft/
// verschenkt) oder Aufbau (neue_position, gekauft/geerbt). Cash = toCents(betrag) in beiden
// Fällen (Verschenken/Erbschaft haben betrag="0.00", das ergibt automatisch ein Null-Cash-Bein).
function sammleSachwertGegenbuchungen(szenario, today, horizon) {
  const ereignisse = [];
  for (const a of szenario.annahmen ?? []) {
    if (a.art !== "einmalzahlung") continue;
    const g = a.gegenbuchung;
    if (!g || (g.ziel_typ !== "immobilie" && g.ziel_typ !== "vermoegenswert" && g.ziel_typ !== "vorsorge")) continue;
    if (!(a.datum > today && a.datum <= horizon)) continue;
    const cash_cents = toCents(a.betrag);
    if (g.ziel_id) {
      ereignisse.push({ datum: a.datum, abbau_key: `${g.ziel_typ}:${g.ziel_id}`, cash_cents });
    } else if (g.neue_position) {
      ereignisse.push({ datum: a.datum, aufbau_cents: toCents(g.neue_position.wert), cash_cents });
    }
  }
  ereignisse.sort((x, y) => x.datum.localeCompare(y.datum));
  return ereignisse;
}

// Chronologischer Merge von Ratenterminen und Sondertilgungen je Darlehen. Liefert effektive
// (geklemmte) Beträge: eine Sondertilgung kann nie mehr abtragen als die aktuelle Restschuld.
function restschuldProjektion(darlehen, zeitwerte, today, horizon, sondertilgungen) {
  let best = null;
  for (const zw of zeitwerte ?? []) if (zw.entitaet === "darlehen" && zw.entitaet_id === darlehen.darlehen_id && zw.feld === "restschuld" && zw.standdatum <= today) if (!best || zw.standdatum > best.standdatum) best = zw;
  if (!best) return { reihe: [], abbezahlt_am: null, qualitaet: "offen", effektive: [], start_cents: 0, hatZeitwert: false };
  let rest = toCents(best.wert);
  const startCents = rest;
  const rate = toCents(darlehen.sollrate);
  const satz = Number(darlehen.zinssatz);
  const ppj = PPJ[darlehen.rhythmus_einheit] / darlehen.rhythmus_intervall;
  const meineST = sondertilgungen.filter((s) => s.darlehen_id === darlehen.darlehen_id);
  const events = [
    ...faelligkeiten(darlehen, best.standdatum, horizon).map((d) => ({ datum: d, typ: "rate" })),
    ...meineST.map((s) => ({ datum: s.datum, typ: "st", st: s })),
  ].sort((a, b) => a.datum.localeCompare(b.datum) || (a.typ === "rate" ? -1 : 1));
  const reihe = [];
  const effektive = [];
  let abbezahlt_am = null;
  for (const ev of events) {
    if (rest === 0) { if (ev.typ === "st") effektive.push({ annahme_id: ev.st.annahme_id, datum: ev.datum, effektiv_cents: 0 }); reihe.push({ datum: ev.datum, rest_cents: 0 }); continue; }
    if (ev.typ === "rate") {
      const zins = Math.round((rest * satz) / 100 / ppj);
      rest = Math.max(0, rest - (rate - zins));
    } else {
      const eff = Math.min(ev.st.nominal_cents, rest);
      rest -= eff;
      effektive.push({ annahme_id: ev.st.annahme_id, datum: ev.datum, effektiv_cents: eff });
    }
    if (rest === 0 && !abbezahlt_am) abbezahlt_am = ev.datum;
    reihe.push({ datum: ev.datum, rest_cents: rest });
  }
  return { reihe, abbezahlt_am, qualitaet: best.qualitaet, effektive, start_cents: startCents, hatZeitwert: true };
}

// vorsorge-leistung-Annahmen in vorhandene Primitive aufloesen: Arm 'rente' -> unbefristete
// regelzahlung-neu (lebenslanges Einkommen) + bei kapitalbildenden Vertraegen ein 0-Cash-
// einmalzahlung-Abbau des Rueckkaufswerts (Verrentung); Arm 'kapital' -> einmalzahlung
// (Kapitalzufluss) + Abbau bei kapitalbildend. Qualitaet: ungeprueft -> offen.
export function expandVorsorgeLeistungen(data, szenario, today) {
  const annahmen = [];
  const warnungen = [];
  for (const a of szenario.annahmen ?? []) {
    if (a.art !== "vorsorge-leistung") { annahmen.push(a); continue; }
    const vs = (data.vorsorge ?? []).find((v) => v.vorsorge_id === a.vorsorge_id);
    if (!vs) { warnungen.push({ code: "vorsorge-unbekannt", text: `Annahme ${a.annahme_id} verweist auf unbekannte Vorsorge ${a.vorsorge_id}` }); continue; }
    const feld = a.arm === "kapital" ? "erwartete_kapitalleistung" : "erwartete_rente";
    const zw = aktuellerZeitwert(data.zeitwerte, "vorsorge", a.vorsorge_id, feld, today);
    if (!zw) { warnungen.push({ code: "vorsorge-leistung-ohne-wert", text: `Vorsorge ${a.vorsorge_id} hat keinen ${feld}-Zeitwert` }); continue; }
    const qualitaet = vs.geprueft_am ? (zw.qualitaet ?? "offen") : "offen";
    if (a.arm === "kapital") {
      annahmen.push({ annahme_id: a.annahme_id, art: "einmalzahlung", datum: a.ab, betrag: zw.wert, qualitaet,
        gegenbuchung: vs.kapitalbildend ? { ziel_typ: "vorsorge", ziel_id: vs.vorsorge_id } : undefined });
    } else {
      annahmen.push({ annahme_id: a.annahme_id, art: "regelzahlung-neu", name: vs.name, betrag: zw.wert, qualitaet,
        rhythmus_einheit: "monat", rhythmus_intervall: 1, ab: a.ab, bis: a.bis });
      if (vs.kapitalbildend) {
        annahmen.push({ annahme_id: `${a.annahme_id}~abbau`, art: "einmalzahlung", datum: a.ab, betrag: "0.00", qualitaet,
          gegenbuchung: { ziel_typ: "vorsorge", ziel_id: vs.vorsorge_id } });
      }
    }
  }
  return { szenario: { ...szenario, annahmen }, warnungen };
}

export function rechneSzenario(data, szenario, today) {
  const horizon = szenario.reichweite_bis;
  const warnungen = [];
  const { szenario: szenarioExpandiert, warnungen: vw } = expandVorsorgeLeistungen(data, szenario, today);
  szenario = szenarioExpandiert;
  warnungen.push(...vw);
  const { rzs, warnungen: mw } = modifizierteRegelzahlungen(data, szenario);
  warnungen.push(...mw);

  // Restschuld-Projektion je Darlehen VOR dem Cash-Sammeln: bestimmt effektive
  // Sondertilgungs-Beträge und kürzt ggf. die Sollrate-Regelzahlung bei Volltilgung.
  const sondertilgungen = sammleSondertilgungen(szenario, rzs, today, horizon);
  const restschuldNachDarlehen = new Map();
  for (const darlehen of data.darlehen ?? []) {
    const proj = restschuldProjektion(darlehen, data.zeitwerte, today, horizon, sondertilgungen);
    restschuldNachDarlehen.set(darlehen.darlehen_id, proj);
    if (proj.abbezahlt_am) {
      const grenze = addInterval(proj.abbezahlt_am, "tag", -1);
      for (const rz of rzs) {
        if (rz.darlehen_id !== darlehen.darlehen_id) continue;
        rz.aktiv_bis = rz.aktiv_bis && rz.aktiv_bis < grenze ? rz.aktiv_bis : grenze;
      }
    }
  }

  // Depot-Gegenbuchungen: chronologisch verarbeiten, damit Klemmung (Verkauf >
  // verfügbarer Wert) den tatsächlichen Lauf-Wert respektiert.
  const depotKontoListe = depotKonten(data);
  const depotStart = new Map();
  for (const k of depotKontoListe) {
    const zw = aktuellerZeitwert(data.zeitwerte, "konto", k.konto_id, "depotwert", today);
    depotStart.set(k.konto_id, zw ? toCents(zw.wert) : 0);
  }
  const depotReihe = new Map();
  for (const k of depotKontoListe) depotReihe.set(k.konto_id, []);
  const depotLauf = new Map(depotStart);
  const depotCashEreignisse = [];
  for (const g of sammleDepotGegenbuchungen(szenario, rzs, today, horizon)) {
    if (!depotLauf.has(g.ziel_id)) continue;
    const vorhanden = depotLauf.get(g.ziel_id);
    let eff = g.cash_cents;
    if (g.cash_cents > 0) {
      eff = Math.min(g.cash_cents, vorhanden);
      if (eff < g.cash_cents) warnungen.push({ code: "depot-ueberzogen", text: `Verkauf übersteigt verfügbaren Depotwert (${g.annahme_id})`, datum: g.datum });
    }
    depotLauf.set(g.ziel_id, vorhanden - eff);
    depotReihe.get(g.ziel_id).push({ datum: g.datum, wert_cents: depotLauf.get(g.ziel_id) });
    depotCashEreignisse.push({ datum: g.datum, cents: eff });
  }
  for (const a of szenario.annahmen ?? []) {
    if (a.gegenbuchung?.ziel_typ === "depot") {
      warnungen.push({ code: "depot-vorbehalt", text: a.gegenbuchung.vorbehalt ?? `Gegenbuchung auf Depot ${a.gegenbuchung.ziel_id} ist ein Vorbehalt, kein Garant`, datum: undefined });
    }
  }

  // Sachwert-Gegenbuchungen (Immobilie/Vermögenswert): Abbau (Verkauf/Verschenken) oder
  // Aufbau (Kauf/Erbschaft). Startwerte zum Stichtag eingefroren, keine realen Marktwert-
  // Updates nach diesem Punkt fließen ein.
  const { werte: sachwertStart, qualitaeten: sachwertQualitaeten } = sachwertStartwerte(data, today);
  const sachwertDeltas = []; // { datum, delta_cents }
  const sachwertCash = [];
  for (const e of sammleSachwertGegenbuchungen(szenario, today, horizon)) {
    if (e.abbau_key) {
      const wert = sachwertStart.get(e.abbau_key) ?? 0;
      sachwertDeltas.push({ datum: e.datum, delta_cents: -wert });
    } else {
      sachwertDeltas.push({ datum: e.datum, delta_cents: e.aufbau_cents });
    }
    sachwertCash.push({ datum: e.datum, cents: e.cash_cents });
  }

  // Cash-Ereignisse je Datum sammeln. Generisches Cash-Bein NUR für Annahmen OHNE
  // gegenbuchung — gegenbuchung-Annahmen buchen ihr (effektives) Cash hier separat
  // (Sondertilgungen unten; Depot/Sachwerte folgen in Task 6/7).
  const ereignisse = []; // { datum, cents }
  for (const rz of rzs) {
    if (rz._gegenbuchung) continue;
    for (const datum of occurrences(rz, today, horizon)) ereignisse.push({ datum, cents: toCents(rz.betrag) });
  }
  for (const proj of restschuldNachDarlehen.values()) {
    for (const eff of proj.effektive) ereignisse.push({ datum: eff.datum, cents: -eff.effektiv_cents });
  }
  for (const e of depotCashEreignisse) ereignisse.push(e);
  for (const e of sachwertCash) ereignisse.push(e);
  const startDatum = (a) => (a.art === "einmalzahlung" ? a.datum : a.ab);
  for (const a of szenario.annahmen ?? []) {
    const d = startDatum(a);
    if (d && d <= today) { warnungen.push({ code: "annahme-vergangen", text: `Annahme ${a.annahme_id} liegt vor dem Rechenstichtag`, datum: d }); }
    if (a.art === "einmalzahlung" && !a.gegenbuchung && a.datum > today && a.datum <= horizon && a.betrag && a.betrag !== "0.00") {
      ereignisse.push({ datum: a.datum, cents: toCents(a.betrag) });
    }
  }
  ereignisse.sort((x, y) => x.datum.localeCompare(y.datum));

  // Monatsraster bauen: Startsaldo + kumulierte Ereignisse je Monatsende
  const punkte = [];
  let lauf = startSaldoCents(data, today);
  let ev = 0;
  let cur = monatVon(today);
  const horizonMonat = monatVon(horizon);
  while (cur <= horizonMonat) {
    const monatsEnde = addInterval(`${cur}-01`, "monat", 1); // erster des Folgemonats; Ereignisse < dem zählen
    while (ev < ereignisse.length && ereignisse[ev].datum < monatsEnde) { lauf += ereignisse[ev].cents; ev++; }
    let restschuld = 0;
    for (const darlehen of data.darlehen ?? []) {
      const proj = restschuldNachDarlehen.get(darlehen.darlehen_id);
      let rest = proj.start_cents;
      for (const r of proj.reihe) { if (r.datum < monatsEnde) rest = r.rest_cents; else break; }
      restschuld += rest;
    }
    let depotGesamt = 0;
    for (const k of depotKontoListe) {
      let val = depotStart.get(k.konto_id);
      for (const r of depotReihe.get(k.konto_id)) { if (r.datum < monatsEnde) val = r.wert_cents; else break; }
      depotGesamt += val;
    }
    let sachwerteGesamt = 0;
    for (const v of sachwertStart.values()) sachwerteGesamt += v;
    for (const d of sachwertDeltas) { if (d.datum < monatsEnde) sachwerteGesamt += d.delta_cents; }
    punkte.push({ monat: cur, liquide_cents: lauf, depot_cents: depotGesamt, restschuld_cents: restschuld, sachwerte_cents: sachwerteGesamt, netto_cents: lauf + depotGesamt + sachwerteGesamt - restschuld });
    cur = monatVon(addInterval(`${cur}-01`, "monat", 1));
  }

  // Qualität: worst-of über Annahmen, beitragende Regelzahlungen und Darlehen-Anker
  // (nur Darlehen mit tatsächlichem Restschuld-Zeitwert zählen).
  const qualitaet = worstOf([
    ...(szenario.annahmen ?? []).map((a) => a.qualitaet),
    ...rzs.filter((rz) => occurrences(rz, today, horizon).length).map((rz) => rz.qualitaet),
    ...[...restschuldNachDarlehen.values()].filter((p) => p.hatZeitwert).map((p) => p.qualitaet),
    ...sachwertQualitaeten,
  ]);
  if (punkte.length && punkte[0].liquide_cents < 0) warnungen.push({ code: "liquiditaet-negativ", text: `Liquidität bereits im ersten Monat negativ`, datum: punkte[0].monat });
  warnungen.push(...guardrailWarnungen(data, today, rzs));
  return { punkte, qualitaet, warnungen };
}

export function computeSzenario(data, szenario, today) {
  return { szenario: rechneSzenario(data, szenario, today), basis: rechneSzenario(data, { ...szenario, annahmen: [] }, today) };
}

// Letzte 3 volle Kalendermonate vor dem aktuellen Monat von 'today', z.B. bei
// today="2026-06-22" → ["2026-03","2026-04","2026-05"].
function letzteDreiVolleMonate(today) {
  const monate = [];
  let m = monatVon(today);
  for (let i = 0; i < 3; i++) {
    m = monatVon(addInterval(`${m}-01`, "monat", -1));
    monate.unshift(m);
  }
  return monate;
}

// Cash-Realismus-Guardrail: vergleicht die effektiven Regelzahlungen mit Ist-
// Transaktionen. 'cash-realismus', wenn eine geschätzte
// Regelzahlung deutlich unter dem Ist-Durchschnitt der letzten 3 Monate liegt;
// 'kategorie-ungeplant', wenn materielles Ist keine Regelzahlung referenziert.
export function guardrailWarnungen(data, today, regelzahlungen = data.regelzahlungen ?? []) {
  const warnungen = [];
  const monate = letzteDreiVolleMonate(today);
  const vonMonat = `${monate[0]}-01`;
  const bisMonat = addInterval(`${monate[monate.length - 1]}-01`, "monat", 1);

  const istNachKategorie = new Map();
  for (const tx of data.transaktionen ?? []) {
    if (tx.ist_transfer === true) continue;
    if (!tx.kategorie_id) continue;
    const cents = toCents(tx.betrag);
    if (!(cents < 0)) continue;
    if (!(tx.buchungsdatum >= vonMonat && tx.buchungsdatum < bisMonat)) continue;
    istNachKategorie.set(tx.kategorie_id, (istNachKategorie.get(tx.kategorie_id) ?? 0) + Math.abs(cents));
  }
  for (const [kat, summe] of istNachKategorie) istNachKategorie.set(kat, Math.round(summe / 3));

  const horizon12 = addInterval(today, "monat", 12);
  const planNachKategorie = new Map();
  for (const rz of regelzahlungen ?? []) {
    if (rz.status !== "bestaetigt" || rz.qualitaet !== "geschaetzt" || !rz.kategorie_id) continue;
    const termine = occurrences(rz, today, horizon12);
    if (!termine.length) continue;
    const summe = termine.length * Math.abs(toCents(rz.betrag));
    planNachKategorie.set(rz.kategorie_id, (planNachKategorie.get(rz.kategorie_id) ?? 0) + summe);
  }
  for (const [kat, summe] of planNachKategorie) planNachKategorie.set(kat, Math.round(summe / 12));

  for (const [kat, plan] of planNachKategorie) {
    const ist = istNachKategorie.get(kat) ?? 0;
    if (plan < GUARDRAIL_SCHWELLE * ist) {
      warnungen.push({ code: "cash-realismus", text: `Geplante Ausgaben für ${kat} (${(plan / 100).toFixed(2)}/Monat) liegen deutlich unter dem Ist-Durchschnitt (${(ist / 100).toFixed(2)}/Monat)` });
    }
  }

  const geplanteKategorien = new Set((regelzahlungen ?? []).filter((rz) => rz.status === "bestaetigt" && rz.kategorie_id).map((rz) => rz.kategorie_id));
  for (const [kat, ist] of istNachKategorie) {
    if (ist > MATERIALITAET_MONAT_CENTS && !geplanteKategorien.has(kat)) {
      warnungen.push({ code: "kategorie-ungeplant", text: `Kategorie ${kat} hat materielles Ist (${(ist / 100).toFixed(2)}/Monat), aber keine geplante Regelzahlung` });
    }
  }
  return warnungen;
}

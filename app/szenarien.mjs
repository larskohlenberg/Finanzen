// app/szenarien.mjs — deterministische, reine Szenario-Engine (browser- & node-fähig).
// Keine Node-I/O. Rechnet ab Rechenstichtag `today` (nicht `stand`).
import { occurrences, addInterval, monatVon, toCents } from "./liquiditaet.mjs";
import { faelligkeiten } from "./vermoegen.mjs";

const PPJ = { tag: 365, woche: 52, monat: 12, jahr: 1 };

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
    if (vortag < ziel.anker_datum) { warnungen.push({ code: "aenderung-wirkungslos", text: `Änderung ${ae.annahme_id} liegt vor dem Anker der Regelzahlung` }); continue; }
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
      rhythmus_einheit: n.rhythmus_einheit, rhythmus_intervall: n.rhythmus_intervall, anker_datum: n.ab, aktiv_bis: n.bis, status: "bestaetigt", _gegenbuchung: n.gegenbuchung });
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

export function rechneSzenario(data, szenario, today) {
  const horizon = szenario.reichweite_bis;
  const warnungen = [];
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
    punkte.push({ monat: cur, liquide_cents: lauf, depot_cents: 0, restschuld_cents: restschuld, sachwerte_cents: 0, netto_cents: lauf - restschuld });
    cur = monatVon(addInterval(`${cur}-01`, "monat", 1));
  }

  // Qualität: worst-of über Annahmen, beitragende Regelzahlungen und Darlehen-Anker
  // (nur Darlehen mit tatsächlichem Restschuld-Zeitwert zählen).
  const qualitaet = worstOf([
    ...(szenario.annahmen ?? []).map((a) => a.qualitaet),
    ...rzs.filter((rz) => occurrences(rz, today, horizon).length).map((rz) => rz.qualitaet),
    ...[...restschuldNachDarlehen.values()].filter((p) => p.hatZeitwert).map((p) => p.qualitaet),
  ]);
  if (punkte.length && punkte[0].liquide_cents < 0) warnungen.push({ code: "liquiditaet-negativ", text: `Liquidität bereits im ersten Monat negativ`, datum: punkte[0].monat });
  return { punkte, qualitaet, warnungen };
}

export function computeSzenario(data, szenario, today) {
  return { szenario: rechneSzenario(data, szenario, today), basis: rechneSzenario(data, { ...szenario, annahmen: [] }, today) };
}

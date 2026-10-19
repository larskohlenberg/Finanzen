// app/szenarien.mjs — deterministische, reine Szenario-Engine (browser- & node-fähig).
// Keine Node-I/O. Rechnet ab Rechenstichtag `today` (nicht `stand`).
import { occurrences, addInterval, monatVon, toCents } from "./liquiditaet.mjs";
import { aktuellerZeitwert, computeNettovermoegen } from "./vermoegen.mjs";
import { zahlungsplan } from "./darlehen.mjs";
import { betragJeMonatCents } from "./rhythmus.mjs";
import { bestandsMonate, planIst, zeitraumMonate } from "./plan-ist.mjs";

const GUARDRAIL_SCHWELLE = 0.9;
const MATERIALITAET_MONAT_CENTS = 5000;

// Startbestand zum Rechenstichtag aus denselben Positionen wie die Vermoegensrechnung
// (computeNettovermoegen): liquide Konten, nicht liquide Konten (eingefroren),
// offene Depots, Sachwerte und Rueckkaufswerte, laufende Darlehen. Positionen ohne
// Wert sind "unbekannt": sie tragen 0, die Qualitaet "offen" und eine Warnung.
// positionen: die Positionen von computeNettovermoegen, schon gerechnet (der
// Browser bekommt sie vom App-Server, GET /api/v1/szenarien, und hat selbst
// keine Buchungen); ohne sie rechnet startbestand sie hier.
const KLASSE_TEXT = { konto: "Konto", immobilie: "Immobilie", vermoegenswert: "Vermögenswert", vorsorge: "Vorsorge", darlehen: "Darlehen" };

function startbestand(data, today, positionen = null) {
  const nv = positionen ? { positionen } : computeNettovermoegen(data, today);
  const kontoById = new Map((data.konten ?? []).map((k) => [k.konto_id, k]));
  let liquide = 0;
  let gebunden = 0;
  const depots = new Map(); // konto_id -> cents
  const sachwerte = new Map(); // `${klasse}:${id}` -> cents
  const darlehenIds = new Set();
  const darlehenRest = new Map(); // darlehen_id -> { rest_cents, qualitaet } (Rest heute; fehlt: null)
  const unbekannt = [];
  const qualitaeten = [];
  for (const p of nv.positionen) {
    qualitaeten.push(p.fehlt ? "offen" : p.qualitaet);
    if (p.fehlt) unbekannt.push({ klasse: p.klasse, id: p.id, name: p.name, basis: p.basis });
    if (p.klasse === "konto") {
      const konto = kontoById.get(p.id);
      if (!konto) continue;
      if (konto.kontotyp === "depot") depots.set(p.id, p.wert_cents);
      else if (konto.liquiditaetsrelevant) liquide += p.wert_cents;
      else gebunden += p.wert_cents;
    } else if (p.klasse === "darlehen") {
      darlehenIds.add(p.id);
      darlehenRest.set(p.id, { rest_cents: p.fehlt ? null : -p.wert_cents, qualitaet: p.qualitaet ?? "offen" });
    }
    else sachwerte.set(`${p.klasse}:${p.id}`, p.wert_cents);
  }
  return { liquide, gebunden, depots, sachwerte, darlehenIds, darlehenRest, unbekannt, qualitaeten };
}

export function modifizierteRegelzahlungen(data, szenario) {
  const warnungen = [];
  const aenderungen = (szenario.annahmen ?? []).filter((a) => a.art === "regelzahlung-aenderung");
  const neue = (szenario.annahmen ?? []).filter((a) => a.art === "regelzahlung-neu");
  let rzs = (data.regelzahlungen ?? []).filter((r) => r.status === "bestaetigt").map((r) => ({ ...r }));

  // Aenderungen je urspruenglicher Regelzahlung chronologisch in Gueltigkeits-
  // abschnitte ueberfuehren: jeder Abschnitt endet am Vortag der naechsten
  // Aenderung, ein Beenden schliesst den letzten. So ergibt jede Eingabe-
  // reihenfolge denselben Zahlungsplan (gleiches ab: nach annahme_id).
  const jeRegelzahlung = new Map();
  for (const ae of aenderungen) {
    if (!jeRegelzahlung.has(ae.regelzahlung_id)) jeRegelzahlung.set(ae.regelzahlung_id, []);
    jeRegelzahlung.get(ae.regelzahlung_id).push(ae);
  }
  const ids = [...jeRegelzahlung.keys()].sort();
  for (const id of ids) {
    const liste = jeRegelzahlung.get(id).sort((x, y) => x.ab.localeCompare(y.ab) || String(x.annahme_id).localeCompare(String(y.annahme_id)));
    const original = rzs.find((r) => r.regelzahlung_id === id);
    if (!original) {
      for (const ae of liste) warnungen.push({ code: "aenderung-wirkungslos", text: `Änderung auf unbekannte Regelzahlung ${ae.regelzahlung_id}` });
      continue;
    }
    const ende = original.aktiv_bis;
    let aktuell = original; // laufender Abschnitt
    let beendet = false;
    for (const ae of liste) {
      if (ae.ab < original.anker_datum) { warnungen.push({ code: "aenderung-wirkungslos", text: `Änderung ${ae.annahme_id} liegt vor dem Anker der Regelzahlung` }); continue; }
      if (ende && ende < ae.ab) { warnungen.push({ code: "aenderung-wirkungslos", text: `Regelzahlung ${ae.regelzahlung_id} ist vor ${ae.ab} bereits abgelaufen` }); continue; }
      if (beendet) { warnungen.push({ code: "aenderung-wirkungslos", text: `Änderung ${ae.annahme_id}: Regelzahlung ${ae.regelzahlung_id} ist im Szenario bereits beendet` }); continue; }
      aktuell.aktiv_bis = addInterval(ae.ab, "tag", -1);
      if (ae.aktion === "beenden") {
        beendet = true;
      } else if (ae.aktion === "betrag-aendern") {
        aktuell = { ...original, regelzahlung_id: `${original.regelzahlung_id}~${ae.annahme_id}`, anker_datum: ae.ab, betrag: ae.betrag, aktiv_bis: ende };
        rzs.push(aktuell);
      }
    }
  }
  for (const n of neue) {
    rzs.push({ regelzahlung_id: n.annahme_id, bezeichnung: n.name ?? "Szenario-Zahlung", betrag: n.betrag, qualitaet: n.qualitaet,
      rhythmus_einheit: n.rhythmus_einheit, rhythmus_intervall: n.rhythmus_intervall, anker_datum: n.ab, aktiv_bis: n.bis, status: "bestaetigt",
      kategorie_id: n.kategorie_id, _gegenbuchung: n.gegenbuchung });
  }
  return { rzs, warnungen };
}

// Ereignis aus einem wiederkehrenden Termin (regelzahlung-neu-Klon, "ID@datum")?
const wiederkehrend = (annahmeId) => String(annahmeId).includes("@");

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
      ereignisse.push({ datum: a.datum, abbau_key: `${g.ziel_typ}:${g.ziel_id}`, ziel_typ: g.ziel_typ, ziel_id: g.ziel_id, cash_cents });
    } else if (g.neue_position) {
      ereignisse.push({ datum: a.datum, aufbau_cents: toCents(g.neue_position.wert), ziel_typ: g.ziel_typ, ziel_id: null, neue_bezeichnung: g.neue_position.bezeichnung, cash_cents });
    }
  }
  ereignisse.sort((x, y) => x.datum.localeCompare(y.datum));
  return ereignisse;
}

// Bezeichnung einer Sachwert-/Vorsorge-Position aus den Stammdaten auflösen.
function sachwertBezeichnung(data, ziel_typ, ziel_id) {
  if (ziel_typ === "immobilie") return (data.immobilien ?? []).find((i) => i.immobilie_id === ziel_id)?.bezeichnung ?? ziel_id;
  if (ziel_typ === "vermoegenswert") return (data.vermoegenswerte ?? []).find((v) => v.vermoegenswert_id === ziel_id)?.bezeichnung ?? ziel_id;
  if (ziel_typ === "vorsorge") return (data.vorsorge ?? []).find((v) => v.vorsorge_id === ziel_id)?.name ?? ziel_id;
  if (ziel_typ === "darlehen") return (data.darlehen ?? []).find((d) => d.darlehen_id === ziel_id)?.bezeichnung ?? ziel_id;
  if (ziel_typ === "depot") return (data.konten ?? []).find((k) => k.konto_id === ziel_id)?.name ?? ziel_id;
  return ziel_id;
}

// Schuld und Geldabfluss eines Darlehens aus dem Zahlungsplan (darlehen.mjs) ab
// dem Rest heute (Startbestand): Raten der (im Szenario geaenderten)
// Regelzahlungen des Darlehens, sonst Vertragsplan, dazu Sondertilgungen
// (geklemmt auf den Rest). Ohne bekannten Rest keine Projektion.
function restschuldProjektion(darlehen, startRest, today, horizon, sondertilgungen, rzs) {
  if (!startRest || startRest.rest_cents === null) return { reihe: [], raten: [], abbezahlt_am: null, schluss: null, qualitaet: "offen", effektive: [], start_cents: 0, hatZeitwert: false };
  const plan = zahlungsplan(darlehen, { start: { datum: today, rest_cents: startRest.rest_cents }, bis: horizon, regelzahlungen: rzs,
    sondertilgungen: sondertilgungen.filter((s) => s.darlehen_id === darlehen.darlehen_id) });
  return {
    reihe: plan.ereignisse.map((e) => ({ datum: e.datum, rest_cents: e.rest_cents })),
    raten: plan.ereignisse.filter((e) => e.typ === "rate"),
    effektive: plan.ereignisse.filter((e) => e.typ === "sondertilgung").map((e) => ({ annahme_id: e.annahme_id, datum: e.datum, effektiv_cents: e.zahlung_cents })),
    abbezahlt_am: plan.abbezahlt_am,
    schluss: plan.schluss,
    qualitaet: startRest.qualitaet,
    start_cents: startRest.rest_cents,
    hatZeitwert: true,
  };
}

// vorsorge-leistung-Annahmen in vorhandene Primitive aufloesen: Arm 'rente' -> unbefristete
// regelzahlung-neu (lebenslanges Einkommen) + bei kapitalbildenden Vertraegen ein 0-Cash-
// einmalzahlung-Abbau des Rueckkaufswerts (Verrentung); Arm 'kapital' -> einmalzahlung
// (Kapitalzufluss) + Abbau bei kapitalbildend. Qualitaet: ungeprueft -> offen.
// Ereignis BU oder Arbeitslosigkeit ab `ab` (bis optional `bis`) fuer eine Person:
// Die Beitraege aller laufenden Vertraege dieser Person mit passender
// Beitragsbefreiung entfallen; bei BU fliessen zusaetzlich die erfassten BU- und
// Erwerbsminderungsrenten (brutto) als Einnahme. Uebersetzt in vorhandene
// Annahme-Arten, damit Rechnung und Aenderungsliste ohne Sonderweg laufen.
const EREIGNIS_RENTEN = [["bu_rente", "BU-Rente"], ["erwerbsminderungsrente", "Erwerbsminderungsrente"]];
const EREIGNIS_FALL = { bu: "Berufsunfähigkeit", arbeitslosigkeit: "Arbeitslosigkeit" };

export function ereignisAnnahmen(data, a, today) {
  const annahmen = [];
  const laeuft = (vs) => vs.status !== "beendet" && vs.status !== "gekuendigt" && (!vs.aktiv_bis || vs.aktiv_bis >= a.ab);
  const vertraege = (data.vorsorge ?? []).filter((vs) => vs.person_id === a.person_id && laeuft(vs));
  for (const vs of vertraege.filter((v) => (v.beitragsbefreiung ?? []).includes(a.fall))) {
    const beitraege = (data.regelzahlungen ?? []).filter((r) => r.status === "bestaetigt" && r.vorsorge_id === vs.vorsorge_id
      && toCents(r.betrag) < 0 && r.anker_datum <= a.ab && !(r.aktiv_bis && r.aktiv_bis < a.ab));
    for (const r of beitraege) {
      annahmen.push({ annahme_id: `${a.annahme_id}~${r.regelzahlung_id}`, art: "regelzahlung-aenderung", regelzahlung_id: r.regelzahlung_id,
        aktion: "beenden", ab: a.ab, qualitaet: a.qualitaet, begruendung: `Beitragsbefreiung bei ${EREIGNIS_FALL[a.fall]}` });
      if (a.bis && !(r.aktiv_bis && r.aktiv_bis <= a.bis)) {
        annahmen.push({ annahme_id: `${a.annahme_id}~${r.regelzahlung_id}~wieder`, art: "regelzahlung-neu", name: r.bezeichnung, betrag: r.betrag,
          rhythmus_einheit: r.rhythmus_einheit, rhythmus_intervall: r.rhythmus_intervall, ab: addInterval(a.bis, "tag", 1), bis: r.aktiv_bis,
          kategorie_id: r.kategorie_id, qualitaet: a.qualitaet });
      }
    }
  }
  if (a.fall === "bu") {
    for (const vs of vertraege) {
      for (const [feld, label] of EREIGNIS_RENTEN) {
        const zw = aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, feld, today);
        if (!zw) continue;
        annahmen.push({ annahme_id: `${a.annahme_id}~${vs.vorsorge_id}~${feld}`, art: "regelzahlung-neu", name: `${label} ${vs.name}`, betrag: zw.wert,
          rhythmus_einheit: "monat", rhythmus_intervall: 1, ab: a.ab, bis: a.bis, qualitaet: vs.geprueft_am ? (zw.qualitaet ?? "offen") : "offen" });
      }
    }
  }
  return annahmen;
}

export function expandVorsorgeLeistungen(data, szenario, today) {
  const annahmen = [];
  const warnungen = [];
  for (const a of szenario.annahmen ?? []) {
    if (a.art === "ereignis") {
      const folgen = ereignisAnnahmen(data, a, today);
      if (!folgen.length) warnungen.push({ code: "ereignis-ohne-wirkung", text: `Ereignis ${a.annahme_id}: kein Vertrag mit Beitragsbefreiung oder BU-Leistung für ${a.person_id}` });
      annahmen.push(...folgen);
      continue;
    }
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

export function rechneSzenario(data, szenario, today, { positionen = null } = {}) {
  const horizon = szenario.reichweite_bis;
  const warnungen = [];
  const { szenario: szenarioExpandiert, warnungen: vw } = expandVorsorgeLeistungen(data, szenario, today);
  szenario = szenarioExpandiert;
  warnungen.push(...vw);
  const { rzs, warnungen: mw } = modifizierteRegelzahlungen(data, szenario);
  warnungen.push(...mw);

  const start = startbestand(data, today, positionen);
  if (start.unbekannt.length) {
    warnungen.push({ code: "startbestand-unbekannt", text: `Startbestand unvollständig, ohne belegten Wert: ${start.unbekannt.map((u) => `${KLASSE_TEXT[u.klasse] ?? u.klasse} ${u.name}`).join(", ")}` });
  }

  // Schuld und Raten je laufendem Darlehen aus einer Quelle (Zahlungsplan):
  // die Raten sind zugleich der Geldabfluss, die Schlussrate am Termin der
  // Rate, danach nichts mehr. Die Regelzahlungen dieser Darlehen buchen darum
  // unten kein eigenes Cash; sie enden mit der Tilgung (fuer Herleitung und
  // Qualitaet). Darlehen ohne bekannten Rest behalten ihre Regelzahlungen.
  const sondertilgungen = sammleSondertilgungen(szenario, rzs, today, horizon);
  const restschuldNachDarlehen = new Map();
  const planDarlehen = new Set();
  for (const darlehen of (data.darlehen ?? []).filter((d) => start.darlehenIds.has(d.darlehen_id))) {
    const proj = restschuldProjektion(darlehen, start.darlehenRest.get(darlehen.darlehen_id), today, horizon, sondertilgungen, rzs);
    restschuldNachDarlehen.set(darlehen.darlehen_id, proj);
    if (!proj.hatZeitwert) continue;
    planDarlehen.add(darlehen.darlehen_id);
    if (!proj.schluss) continue;
    const grenze = proj.schluss.datum;
    for (const rz of rzs.filter((r) => r.darlehen_id === darlehen.darlehen_id && !r._gegenbuchung)) rz.aktiv_bis = rz.aktiv_bis && rz.aktiv_bis < grenze ? rz.aktiv_bis : grenze;
  }

  // Depot-Gegenbuchungen: chronologisch verarbeiten, damit Klemmung (Verkauf >
  // verfügbarer Wert) den tatsächlichen Lauf-Wert respektiert.
  const depotKontoListe = (data.konten ?? []).filter((k) => start.depots.has(k.konto_id));
  const depotStart = new Map(start.depots);
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
    depotCashEreignisse.push({ datum: g.datum, cents: eff, art: wiederkehrend(g.annahme_id) ? "umbuchung" : "einmal" });
  }
  for (const a of szenario.annahmen ?? []) {
    if (a.gegenbuchung?.ziel_typ === "depot") {
      warnungen.push({ code: "depot-vorbehalt", text: a.gegenbuchung.vorbehalt ?? `Gegenbuchung auf Depot ${a.gegenbuchung.ziel_id} ist ein Vorbehalt, kein Garant`, datum: undefined });
    }
  }

  // Sachwert-Gegenbuchungen (Immobilie/Vermögenswert): Abbau (Verkauf/Verschenken) oder
  // Aufbau (Kauf/Erbschaft). Startwerte zum Stichtag eingefroren, keine realen Marktwert-
  // Updates nach diesem Punkt fließen ein.
  const sachwertStart = start.sachwerte;
  const sachwertDeltas = []; // { datum, delta_cents }
  const sachwertCash = [];
  const sachwertwirkungen = []; // { ziel_typ, ziel_id, bezeichnung, art, datum, wert_cents }
  const vorsorgewirkungen = []; // { vorsorge_id, bezeichnung, datum, rueckkaufswert_cents }
  for (const e of sammleSachwertGegenbuchungen(szenario, today, horizon)) {
    if (e.abbau_key) {
      const wert = sachwertStart.get(e.abbau_key) ?? 0;
      sachwertDeltas.push({ datum: e.datum, delta_cents: -wert });
      const bezeichnung = sachwertBezeichnung(data, e.ziel_typ, e.ziel_id);
      if (e.ziel_typ === "vorsorge") {
        vorsorgewirkungen.push({ vorsorge_id: e.ziel_id, bezeichnung, datum: e.datum, rueckkaufswert_cents: wert });
      } else {
        sachwertwirkungen.push({ ziel_typ: e.ziel_typ, ziel_id: e.ziel_id, bezeichnung, art: "abbau", datum: e.datum, wert_cents: wert });
      }
    } else {
      sachwertDeltas.push({ datum: e.datum, delta_cents: e.aufbau_cents });
      sachwertwirkungen.push({ ziel_typ: e.ziel_typ, ziel_id: null, bezeichnung: e.neue_bezeichnung, art: "aufbau", datum: e.datum, wert_cents: e.aufbau_cents });
    }
    sachwertCash.push({ datum: e.datum, cents: e.cash_cents });
  }

  // Cash-Ereignisse je Datum sammeln. Generisches Cash-Bein NUR für Annahmen OHNE
  // gegenbuchung — gegenbuchung-Annahmen buchen ihr (effektives) Cash hier separat
  // (Sondertilgungen unten; Depot/Sachwerte folgen in Task 6/7).
  // Jedes Ereignis traegt seine Herkunft (art) fuer die Monatsbewegungen:
  // ein/aus = regelmaessige Zu-/Abfluesse, umbuchung = neutrale Kategorien und
  // wiederkehrende Gegenbuchungen (Sparplan, laufende Sondertilgung),
  // einmal = Einmalzahlungen inkl. Gegenbuchungs-Cash.
  const katTyp = new Map((data.kategorien ?? []).map((k) => [k.kategorie_id, k.typ]));
  const regelArt = (rz, cents) => (katTyp.get(rz.kategorie_id) === "neutral" ? "umbuchung" : cents >= 0 ? "ein" : "aus");
  const ereignisse = []; // { datum, cents, art }
  for (const rz of rzs) {
    if (rz._gegenbuchung || planDarlehen.has(rz.darlehen_id)) continue;
    const cents = toCents(rz.betrag);
    const art = regelArt(rz, cents);
    for (const datum of occurrences(rz, today, horizon)) ereignisse.push({ datum, cents, art });
  }
  const rzById = new Map(rzs.map((rz) => [rz.regelzahlung_id, rz]));
  for (const proj of restschuldNachDarlehen.values()) {
    for (const r of proj.raten) {
      const rz = rzById.get(r.regelzahlung_id);
      ereignisse.push({ datum: r.datum, cents: -r.zahlung_cents, art: rz ? regelArt(rz, -r.zahlung_cents) : "aus" });
    }
  }
  for (const proj of restschuldNachDarlehen.values()) {
    for (const eff of proj.effektive) ereignisse.push({ datum: eff.datum, cents: -eff.effektiv_cents, art: wiederkehrend(eff.annahme_id) ? "umbuchung" : "einmal" });
  }
  for (const e of depotCashEreignisse) ereignisse.push(e);
  for (const e of sachwertCash) ereignisse.push({ ...e, art: "einmal" });
  const startDatum = (a) => (a.art === "einmalzahlung" ? a.datum : a.ab);
  for (const a of szenario.annahmen ?? []) {
    const d = startDatum(a);
    if (d && d <= today) { warnungen.push({ code: "annahme-vergangen", text: `Annahme ${a.annahme_id} liegt vor dem Rechenstichtag`, datum: d }); }
    if (a.art === "einmalzahlung" && !a.gegenbuchung && a.datum > today && a.datum <= horizon && a.betrag && a.betrag !== "0.00") {
      ereignisse.push({ datum: a.datum, cents: toCents(a.betrag), art: "einmal" });
    }
  }
  ereignisse.sort((x, y) => x.datum.localeCompare(y.datum));

  // Monatsraster bauen: Startsaldo + kumulierte Ereignisse je Monatsende
  const punkte = [];
  let lauf = start.liquide;
  let ev = 0;
  let cur = monatVon(today);
  const horizonMonat = monatVon(horizon);
  while (cur <= horizonMonat) {
    const monatsEnde = addInterval(`${cur}-01`, "monat", 1); // erster des Folgemonats; Ereignisse < dem zählen
    const bewegung = { ein: 0, aus: 0, umbuchung: 0, einmal: 0 };
    while (ev < ereignisse.length && ereignisse[ev].datum < monatsEnde) {
      lauf += ereignisse[ev].cents;
      bewegung[ereignisse[ev].art] += ereignisse[ev].cents;
      ev++;
    }
    let restschuld = 0;
    for (const proj of restschuldNachDarlehen.values()) {
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
    punkte.push({ monat: cur, liquide_cents: lauf, gebunden_cents: start.gebunden, depot_cents: depotGesamt, restschuld_cents: restschuld, sachwerte_cents: sachwerteGesamt,
      netto_cents: lauf + start.gebunden + depotGesamt + sachwerteGesamt - restschuld,
      ein_cents: bewegung.ein, aus_cents: bewegung.aus, umbuchung_cents: bewegung.umbuchung, einmal_cents: bewegung.einmal });
    cur = monatVon(addInterval(`${cur}-01`, "monat", 1));
  }

  // Qualität: worst-of über Annahmen, beitragende Regelzahlungen und alle Positionen
  // des Startbestands (eine Position ohne Wert zählt als "offen").
  const qualitaet = worstOf([
    ...(szenario.annahmen ?? []).map((a) => a.qualitaet),
    ...rzs.filter((rz) => occurrences(rz, today, horizon).length).map((rz) => rz.qualitaet),
    ...start.qualitaeten,
  ]);
  if (punkte.length && punkte[0].liquide_cents < 0) warnungen.push({ code: "liquiditaet-negativ", text: `Liquidität bereits im ersten Monat negativ`, datum: punkte[0].monat });

  // Bestätigte Bestands-Regelzahlungen (nicht szenario-neu) mit mindestens einem Termin im
  // Zeitraum — für die Herleitungs-Sicht der Views.
  const basisRegelzahlungen = (data.regelzahlungen ?? [])
    .filter((r) => r.status === "bestaetigt" && occurrences(r, today, horizon).length)
    .map((r) => ({ regelzahlung_id: r.regelzahlung_id, bezeichnung: r.bezeichnung, betrag: r.betrag,
      rhythmus_einheit: r.rhythmus_einheit, rhythmus_intervall: r.rhythmus_intervall,
      aktiv_bis: r.aktiv_bis ?? null, kategorie_id: r.kategorie_id ?? null, qualitaet: r.qualitaet }));

  const darlehen = [...restschuldNachDarlehen.entries()].map(([darlehen_id, p]) => {
    let ende = p.start_cents;
    for (const r of p.reihe) { if (r.datum <= horizon) ende = r.rest_cents; else break; }
    return { darlehen_id, bezeichnung: (data.darlehen ?? []).find((d) => d.darlehen_id === darlehen_id)?.bezeichnung ?? darlehen_id,
      start_cents: p.start_cents, ende_cents: ende, abbezahlt_am: p.abbezahlt_am ?? null, qualitaet: p.qualitaet, hatZeitwert: p.hatZeitwert };
  });

  const depots = depotKontoListe.map((k) => {
    const reihe = depotReihe.get(k.konto_id) ?? [];
    let ende = depotStart.get(k.konto_id);
    for (const r of reihe) { if (r.datum <= horizon) ende = r.wert_cents; else break; }
    return { konto_id: k.konto_id, bezeichnung: k.name, start_cents: depotStart.get(k.konto_id), ende_cents: ende };
  });

  return { punkte, qualitaet, warnungen, unbekannt: start.unbekannt, basisRegelzahlungen, darlehen, depots, sachwertwirkungen, vorsorgewirkungen };
}

export function computeSzenario(data, szenario, today, optionen = {}) {
  return { szenario: rechneSzenario(data, szenario, today, optionen), basis: rechneSzenario(data, { ...szenario, annahmen: [] }, today, optionen) };
}

// Prognose-Realismus: rechnet wie Plan & Ist (planIst) ueber die letzten zwoelf
// vollen Monate, netto je Kategorie und ohne Einzelposten ab 400 Euro; der Plan
// sind alle Regelzahlungen der Kategorie. Investitionen, Transfers und neutrale
// Kategorien sind kein Konsum. 'cash-realismus': eine Kategorie mit geschaetzter
// Regelzahlung (Konsumplan) liegt im Plan deutlich unter ihrem Ist;
// 'kategorie-ungeplant': materielles laufendes Ist ohne jede Regelzahlung.
// vollstaendigBis wie bei Plan & Ist: importAbdeckung (klassifikation.mjs).
export function guardrailWarnungen(data, today, { vollstaendigBis = "" } = {}) {
  const r = planIst(data, zeitraumMonate(bestandsMonate(data, today, { vollstaendigBis }), "12m"));
  const n = r.anzahl_monate;
  if (!n) return [];
  const geschaetzt = new Set((data.regelzahlungen ?? []).filter((rz) => rz.qualitaet === "geschaetzt").map((rz) => rz.regelzahlung_id));
  const warnungen = [];
  for (const z of r.ausgaben.kategorien) {
    if (!z.kategorie_id) continue;
    const kat = z.kategorie_id;
    const ist = Math.round((z.ist_cents - z.einzel_cents) / n);
    const plan = Math.round(z.plan_cents / n);
    if (z.regelzahlungen.some((e) => geschaetzt.has(e.regelzahlung_id))) {
      if (plan < GUARDRAIL_SCHWELLE * ist) {
        warnungen.push({ code: "cash-realismus", kategorie_id: kat, plan_cents: plan, ist_cents: ist, text: `Geplante Ausgaben für ${kat} (${(plan / 100).toFixed(2)}/Monat) liegen deutlich unter dem Ist-Durchschnitt (${(ist / 100).toFixed(2)}/Monat)` });
      }
    } else if (!z.regelzahlungen.length && ist > MATERIALITAET_MONAT_CENTS) {
      warnungen.push({ code: "kategorie-ungeplant", kategorie_id: kat, ist_cents: ist, text: `Kategorie ${kat} hat materielles Ist (${(ist / 100).toFixed(2)}/Monat), aber keine geplante Regelzahlung` });
    }
  }
  return warnungen;
}

// --- Auswertungen fuer den Zeitstrahl (Detail, Liste, Vergleich) -------------

// Erster Monat mit negativer Liquiditaet; null = reicht ueber den Horizont.
export function kippMonat(punkte) {
  return (punkte ?? []).find((p) => p.liquide_cents < 0)?.monat ?? null;
}

export function tiefpunkt(punkte) {
  let tief = null;
  for (const p of punkte ?? []) if (!tief || p.liquide_cents < tief.cents) tief = { monat: p.monat, cents: p.liquide_cents };
  return tief;
}

const monatsIndex = (monat) => Number(monat.slice(0, 4)) * 12 + Number(monat.slice(5, 7)) - 1;
const vormonat = (monat) => monatVon(addInterval(`${monat}-01`, "monat", -1));
const annahmeStart = (a) => (a.art === "einmalzahlung" ? a.datum : a.ab);

// Phasen auf das Monatsraster der Punkte legen: vor dem Rechenstart endende Phasen
// entfallen, die laufende beginnt mit dem Rechenstart, eine Luecke davor ist der
// "vorlauf"; ohne Phasen gibt es genau eine Phase "gesamt".
function phasenRaster(szenario, startMonat, endMonat) {
  const benannt = [...(szenario.phasen ?? [])].sort((a, b) => a.ab.localeCompare(b.ab));
  if (!benannt.length) return [{ art: "gesamt", name: null, von: startMonat, bis: endMonat }];
  const liste = benannt.map((ph, i) => ({
    art: "benannt",
    name: ph.name,
    von: monatVon(ph.ab),
    bis: i + 1 < benannt.length ? vormonat(monatVon(benannt[i + 1].ab)) : endMonat,
  }));
  const sichtbar = liste
    .filter((ph) => ph.bis >= startMonat && ph.von <= endMonat && ph.bis >= ph.von)
    .map((ph) => ({ ...ph, von: ph.von < startMonat ? startMonat : ph.von, bis: ph.bis > endMonat ? endMonat : ph.bis }));
  if (!sichtbar.length || sichtbar[0].von > startMonat) {
    sichtbar.unshift({ art: "vorlauf", name: null, von: startMonat, bis: sichtbar.length ? vormonat(sichtbar[0].von) : endMonat });
  }
  return sichtbar;
}

// Kennzahlen je Phase: Durchschnitte pro Monat (Einnahmen, Ausgaben, Umbuchungen,
// Saldo ohne Einmalzahlungen), Summe der Einmalzahlungen, Stand am Phasenende und
// die Annahmen, deren Start in die Phase faellt (Randfaelle zur ersten/letzten).
export function phasenKennzahlen(szenario, punkte) {
  if (!punkte?.length) return [];
  const raster = phasenRaster(szenario, punkte[0].monat, punkte.at(-1).monat);
  const phasen = raster.map((ph) => {
    const teil = punkte.filter((p) => p.monat >= ph.von && p.monat <= ph.bis);
    const n = teil.length || 1;
    const summe = (feld) => teil.reduce((s, p) => s + (p[feld] ?? 0), 0);
    const ein = summe("ein_cents");
    const aus = summe("aus_cents");
    const umbuchung = summe("umbuchung_cents");
    return {
      ...ph,
      monate: teil.length,
      ein_cents: Math.round(ein / n),
      aus_cents: Math.round(aus / n),
      umbuchung_cents: Math.round(umbuchung / n),
      saldo_cents: Math.round((ein + aus + umbuchung) / n),
      einmal_cents: summe("einmal_cents"),
      liquide_ende_cents: teil.at(-1)?.liquide_cents ?? 0,
      annahme_ids: [],
    };
  });
  for (const a of szenario.annahmen ?? []) {
    const start = annahmeStart(a);
    if (!start) continue;
    const m = monatVon(start);
    const ziel = phasen.find((ph) => m >= ph.von && m <= ph.bis) ?? (m < phasen[0].von ? phasen[0] : phasen.at(-1));
    ziel.annahme_ids.push(a.annahme_id);
  }
  return phasen;
}

// Welche Einmal-Ereignisse tragen das Szenario? Je Einmalzahlung (und Kapital-
// Leistung) ohne diese eine Annahme nachrechnen; gemeldet wird, wenn sich der
// Kipp-Monat um mehr als 12 Monate verschiebt oder erst dadurch entsteht.
export function ereignisWirkung(data, szenario, today, optionen = {}) {
  const basisKipp = kippMonat(rechneSzenario(data, szenario, today, optionen).punkte);
  const horizontIndex = monatsIndex(monatVon(szenario.reichweite_bis)) + 1;
  const index = (k) => (k === null ? horizontIndex : monatsIndex(k));
  const wirkung = [];
  for (const a of szenario.annahmen ?? []) {
    const einmal = a.art === "einmalzahlung" || (a.art === "vorsorge-leistung" && a.arm === "kapital");
    if (!einmal) continue;
    const ohne = { ...szenario, annahmen: szenario.annahmen.filter((x) => x !== a) };
    const kipp = kippMonat(rechneSzenario(data, ohne, today, optionen).punkte);
    const verschiebung = Math.abs(index(kipp) - index(basisKipp));
    if ((kipp === null) !== (basisKipp === null) || verschiebung > 12) wirkung.push({ annahme_id: a.annahme_id, kipp_monat: kipp });
  }
  return wirkung;
}

// Jahresaggregation fuer Diagramme: je Jahr der letzte Monatspunkt und die
// Summen der Monatsbewegungen.
export function jahresWerte(punkte) {
  const jahre = [];
  for (const p of punkte ?? []) {
    const jahr = p.monat.slice(0, 4);
    let j = jahre.at(-1);
    if (!j || j.jahr !== jahr) {
      j = { jahr, punkt: p, ein_cents: 0, aus_cents: 0, umbuchung_cents: 0, einmal_cents: 0 };
      jahre.push(j);
    }
    j.punkt = p;
    j.ein_cents += p.ein_cents ?? 0;
    j.aus_cents += p.aus_cents ?? 0;
    j.umbuchung_cents += p.umbuchung_cents ?? 0;
    j.einmal_cents += p.einmal_cents ?? 0;
  }
  return jahre;
}

// --- Was sich aendert: chronologische Liste fuer die Detailseite ---------------
// Fuehrt Annahmen und das Auslaufen/Beginnen von Bestands-Regelzahlungen im
// Horizont zusammen. Endet eine Zahlung und beginnt im selben oder naechsten
// Monat eine neue derselben Kategorie, wird daraus eine Zeile "ersetzt".
// Eintrag: { datum, art, name, alt?, neu?, delta_cents (Monatsaequivalent),
// einmal_cents, quellen, kategorie_id }; art = neu|beendet|geaendert|auslauf|ersetzt|einmalig.
const monatsAequivalent = (betrag, einheit, intervall) => betragJeMonatCents(toCents(betrag), einheit, intervall);
const zahlung = (name, betrag, einheit, intervall) => ({ name, betrag, rhythmus_einheit: einheit ?? "monat", rhythmus_intervall: Number(intervall || 1) });

export function szenarioAenderungen(data, szenario, today) {
  const horizon = szenario.reichweite_bis;
  const imZeitraum = (d) => d && d > today && d <= horizon;
  const { szenario: expandiert } = expandVorsorgeLeistungen(data, szenario, today);
  const annahmen = expandiert.annahmen ?? [];
  const rzById = new Map((data.regelzahlungen ?? []).filter((r) => r.status === "bestaetigt").map((r) => [r.regelzahlung_id, r]));
  const roh = [];

  for (const a of annahmen) {
    if (String(a.annahme_id).endsWith("~abbau")) continue;
    if (a.art === "einmalzahlung") {
      if (!imZeitraum(a.datum)) continue;
      const g = a.gegenbuchung;
      const name = a.name ?? (g ? sachwertBezeichnung(data, g.ziel_typ, g.ziel_id) ?? g.neue_position?.bezeichnung : null) ?? a.begruendung ?? "Einmalzahlung";
      roh.push({ datum: a.datum, art: "einmalig", name, delta_cents: 0, einmal_cents: toCents(a.betrag), quellen: ["annahme"], annahme_id: a.annahme_id, gegenbuchung: g ?? null });
    } else if (a.art === "regelzahlung-neu") {
      const neu = zahlung(a.name ?? "Szenario-Zahlung", a.betrag, a.rhythmus_einheit, a.rhythmus_intervall);
      const monat = monatsAequivalent(a.betrag, a.rhythmus_einheit, a.rhythmus_intervall);
      if (imZeitraum(a.ab)) roh.push({ datum: a.ab, art: "neu", name: neu.name, neu, delta_cents: monat, einmal_cents: 0, quellen: ["annahme"], annahme_id: a.annahme_id, kategorie_id: a.kategorie_id ?? null });
      const ende = a.bis ? addInterval(a.bis, "tag", 1) : null;
      if (imZeitraum(ende)) roh.push({ datum: ende, art: "auslauf", name: neu.name, alt: neu, delta_cents: -monat, einmal_cents: 0, quellen: ["annahme"], annahme_id: a.annahme_id, kategorie_id: a.kategorie_id ?? null });
    } else if (a.art === "regelzahlung-aenderung") {
      const r = rzById.get(a.regelzahlung_id);
      if (!r || !imZeitraum(a.ab)) continue;
      if (r.aktiv_bis && r.aktiv_bis < a.ab) continue;
      const alt = zahlung(r.bezeichnung, r.betrag, r.rhythmus_einheit, r.rhythmus_intervall);
      const altMonat = monatsAequivalent(r.betrag, r.rhythmus_einheit, r.rhythmus_intervall);
      if (a.aktion === "beenden") {
        roh.push({ datum: a.ab, art: "beendet", name: r.bezeichnung, alt, delta_cents: -altMonat, einmal_cents: 0, quellen: ["annahme"], annahme_id: a.annahme_id, regelzahlung_id: r.regelzahlung_id, kategorie_id: r.kategorie_id ?? null });
      } else {
        const neu = zahlung(r.bezeichnung, a.betrag, r.rhythmus_einheit, r.rhythmus_intervall);
        roh.push({ datum: a.ab, art: "geaendert", name: r.bezeichnung, alt, neu, delta_cents: monatsAequivalent(a.betrag, r.rhythmus_einheit, r.rhythmus_intervall) - altMonat, einmal_cents: 0, quellen: ["annahme"], annahme_id: a.annahme_id, regelzahlung_id: r.regelzahlung_id, kategorie_id: r.kategorie_id ?? null });
      }
    }
  }

  // Bestand: Regelzahlungen, die im Horizont beginnen oder auslaufen. Ein Auslaufen
  // entfaellt, wenn eine Annahme die Zahlung vorher beendet; nach einer
  // Betragsaenderung laeuft der neue Betrag aus.
  for (const r of rzById.values()) {
    if (r.darlehen_id) continue;
    const eigene = annahmen.filter((a) => a.art === "regelzahlung-aenderung" && a.regelzahlung_id === r.regelzahlung_id && a.ab > today);
    if (imZeitraum(r.anker_datum)) {
      const neu = zahlung(r.bezeichnung, r.betrag, r.rhythmus_einheit, r.rhythmus_intervall);
      roh.push({ datum: r.anker_datum, art: "neu", name: r.bezeichnung, neu, delta_cents: monatsAequivalent(r.betrag, r.rhythmus_einheit, r.rhythmus_intervall), einmal_cents: 0, quellen: ["bestand"], regelzahlung_id: r.regelzahlung_id, kategorie_id: r.kategorie_id ?? null });
    }
    if (!r.aktiv_bis) continue;
    const ende = addInterval(r.aktiv_bis, "tag", 1);
    if (!imZeitraum(ende)) continue;
    if (eigene.some((a) => a.aktion === "beenden" && a.ab <= r.aktiv_bis)) continue;
    const letzte = eigene.filter((a) => a.aktion === "betrag-aendern" && a.ab <= r.aktiv_bis).sort((x, y) => x.ab.localeCompare(y.ab)).at(-1);
    const betrag = letzte ? letzte.betrag : r.betrag;
    const alt = zahlung(r.bezeichnung, betrag, r.rhythmus_einheit, r.rhythmus_intervall);
    roh.push({ datum: ende, art: "auslauf", name: r.bezeichnung, alt, delta_cents: -monatsAequivalent(betrag, r.rhythmus_einheit, r.rhythmus_intervall), einmal_cents: 0, quellen: [letzte ? "annahme" : "bestand"], regelzahlung_id: r.regelzahlung_id, kategorie_id: r.kategorie_id ?? null });
  }

  // Ersetzung: Ende + Beginn derselben Kategorie im selben oder naechsten Monat.
  const monatsNr = (d) => Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7));
  const verbraucht = new Set();
  const liste = [];
  for (const e of roh) {
    if (e.art !== "neu" || !e.kategorie_id) continue;
    const vorher = roh.find((o) => !verbraucht.has(o) && (o.art === "auslauf" || o.art === "beendet") && o.kategorie_id === e.kategorie_id
      && Math.sign(o.delta_cents) === -Math.sign(e.delta_cents) && Math.abs(monatsNr(o.datum) - monatsNr(e.datum)) <= 1);
    if (!vorher) continue;
    verbraucht.add(vorher).add(e);
    liste.push({ ...e, art: "ersetzt", alt: vorher.alt, delta_cents: e.delta_cents + vorher.delta_cents, quellen: [...new Set([...vorher.quellen, ...e.quellen])], ersetzt_regelzahlung_id: vorher.regelzahlung_id ?? null });
  }
  for (const e of roh) if (!verbraucht.has(e)) liste.push(e);
  return liste.sort((x, y) => x.datum.localeCompare(y.datum) || x.name.localeCompare(y.name));
}

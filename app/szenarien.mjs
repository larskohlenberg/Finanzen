// app/szenarien.mjs — deterministische, reine Szenario-Engine (browser- & node-fähig).
// Keine Node-I/O. Rechnet ab Rechenstichtag `today` (nicht `stand`).
import { occurrences, addInterval, monatVon, toCents } from "./liquiditaet.mjs";

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

export function rechneSzenario(data, szenario, today) {
  const horizon = szenario.reichweite_bis;
  const warnungen = [];
  const { rzs, warnungen: mw } = modifizierteRegelzahlungen(data, szenario);
  warnungen.push(...mw);

  // Cash-Ereignisse je Datum sammeln. Generisches Cash-Bein NUR für Annahmen OHNE
  // gegenbuchung — gegenbuchung-Annahmen buchen ihr (effektives) Cash in Tasks 5/6/7.
  const ereignisse = []; // { datum, cents }
  for (const rz of rzs) {
    if (rz._gegenbuchung) continue; // Gegenbuchungs-Regelzahlung: Cash via Handler (Task 5/6)
    for (const datum of occurrences(rz, today, horizon)) ereignisse.push({ datum, cents: toCents(rz.betrag) });
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
    punkte.push({ monat: cur, liquide_cents: lauf, depot_cents: 0, restschuld_cents: 0, sachwerte_cents: 0, netto_cents: lauf });
    cur = monatVon(addInterval(`${cur}-01`, "monat", 1));
  }

  // Qualität: worst-of über Annahmen UND beitragende Regelzahlungen (Darlehen-Anker
  // kommen in Task 5 hinzu) — Spec: worst-of über alle Eingaben.
  const qualitaet = worstOf([
    ...(szenario.annahmen ?? []).map((a) => a.qualitaet),
    ...rzs.filter((rz) => occurrences(rz, today, horizon).length).map((rz) => rz.qualitaet),
  ]);
  if (punkte.length && punkte[0].liquide_cents < 0) warnungen.push({ code: "liquiditaet-negativ", text: `Liquidität bereits im ersten Monat negativ`, datum: punkte[0].monat });
  return { punkte, qualitaet, warnungen };
}

export function computeSzenario(data, szenario, today) {
  return { szenario: rechneSzenario(data, szenario, today), basis: rechneSzenario(data, { ...szenario, annahmen: [] }, today) };
}

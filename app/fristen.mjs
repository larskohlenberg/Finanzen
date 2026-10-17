// app/fristen.mjs
// Reine Rechnung der anstehenden Fristen und Termine (ADR 0031). Kein DOM, keine
// Node-Abhaengigkeiten; Browser, Checks und MCP rufen dieselbe Funktion.
//
// Zwei Quellen:
// - erfasste Fristen aus `fristen.json`, wiederkehrende ueber dieselbe
//   Rhythmus-Rechnung wie die Regelzahlungen expandiert. Termine bis
//   einschliesslich `erledigt_bis` sind abgehakt; aeltere offene Termine bleiben
//   als ueberfaellig drin.
// - abgeleitete Termine aus vorhandenen Feldern (Zinsbindung, Laufzeit,
//   Leistungsbeginn, Vertrags- und Zahlungsende), ohne eigene Eintraege. Sie
//   zaehlen ab heute; was vorbei ist, ist Geschichte, nicht ueberfaellig.
import { addInterval } from "./liquiditaet.mjs";
import { FRIST_BEZUEGE } from "./tools/validate-core.mjs";

export const BALD_TAGE = 60;

function fristBezug(frist) {
  const typ = FRIST_BEZUEGE.find((t) => frist[`${t}_id`]);
  return typ ? { typ, id: frist[`${typ}_id`] } : null;
}

// Alle Termine einer erfassten Frist bis `bis`, ohne die erledigten.
function fristTermine(frist, bis) {
  const erledigt = frist.erledigt_bis ?? "";
  if (!frist.rhythmus_einheit) return frist.datum > erledigt && frist.datum <= bis ? [frist.datum] : [];
  const termine = [];
  let cur = frist.datum;
  for (let step = 1; cur <= bis && step < 10000; step++) {
    if (cur > erledigt) termine.push(cur);
    cur = addInterval(frist.datum, frist.rhythmus_einheit, frist.rhythmus_intervall * step);
  }
  return termine;
}

function abgeleiteteTermine(data) {
  const termine = [];
  const neu = (datum, art, bezeichnung, typ, id) => termine.push({ datum, art, bezeichnung, bezug: { typ, id } });

  for (const d of data.darlehen ?? []) {
    if (d.status === "abgeloest") continue;
    if (d.zinsbindung_bis) neu(d.zinsbindung_bis, "entscheidung", "Zinsbindung endet", "darlehen", d.darlehen_id);
    if (d.laufzeit_bis) neu(d.laufzeit_bis, "sonstiges", "Darlehen endet", "darlehen", d.darlehen_id);
  }
  for (const vs of data.vorsorge ?? []) {
    if (vs.status === "beendet") continue;
    if (vs.leistung_beginn && vs.status !== "gekuendigt") {
      if (vs.kapitalwahl === "offen") neu(vs.leistung_beginn, "entscheidung", "Kapitalwahl entscheiden", "vorsorge", vs.vorsorge_id);
      else neu(vs.leistung_beginn, "sonstiges", "Leistungsbeginn", "vorsorge", vs.vorsorge_id);
    }
    if (vs.aktiv_bis) neu(vs.aktiv_bis, "sonstiges", "Vertrag endet", "vorsorge", vs.vorsorge_id);
  }
  // Endet eine Rate am selben Tag wie ihr Vertrag oder Darlehen, steht der
  // Termin schon dort; sonst wuerde er doppelt erscheinen.
  const schonDa = new Set(termine.map((t) => `${t.bezug.typ}:${t.bezug.id}:${t.datum}`));
  for (const rz of data.regelzahlungen ?? []) {
    if (rz.status !== "bestaetigt" || !rz.aktiv_bis) continue;
    const objekt = rz.vorsorge_id ? `vorsorge:${rz.vorsorge_id}` : rz.darlehen_id ? `darlehen:${rz.darlehen_id}` : null;
    if (objekt && schonDa.has(`${objekt}:${rz.aktiv_bis}`)) continue;
    neu(rz.aktiv_bis, "sonstiges", "Zahlung endet", "regelzahlung", rz.regelzahlung_id);
  }
  return termine;
}

// Anstehende Termine von heute bis `monate` Monate voraus (einschliesslich),
// dazu ueberfaellige, nicht erledigte erfasste Fristen. Sortiert nach Datum.
// Eintrag: { datum, art, bezeichnung, bezug: { typ, id } | null, frist_id | null,
//            abgeleitet, ueberfaellig, bald }
export function anstehendeFristen(data, today, monate = 12) {
  const bis = addInterval(today, "monat", monate);
  const baldBis = addInterval(today, "tag", BALD_TAGE);
  const erfasst = (data.fristen ?? []).flatMap((frist) => fristTermine(frist, bis).map((datum) => ({
    datum, art: frist.art, bezeichnung: frist.bezeichnung, bezug: fristBezug(frist), frist_id: frist.frist_id, abgeleitet: false,
  })));
  const abgeleitet = abgeleiteteTermine(data)
    .filter((t) => t.datum >= today && t.datum <= bis)
    .map((t) => ({ ...t, frist_id: null, abgeleitet: true }));
  return [...erfasst, ...abgeleitet]
    .map((t) => ({ ...t, ueberfaellig: t.datum < today, bald: t.datum >= today && t.datum <= baldBis }))
    .sort((a, b) => a.datum.localeCompare(b.datum)
      || Number(a.abgeleitet) - Number(b.abgeleitet)
      || String(a.frist_id ?? a.bezug?.id ?? "").localeCompare(String(b.frist_id ?? b.bezug?.id ?? "")));
}

// Termine zu einem Objekt (z. B. fuer die Zeile "Fristen" in dessen Detail).
export function fristenZuObjekt(data, today, typ, id, monate = 12) {
  return anstehendeFristen(data, today, monate).filter((t) => t.bezug?.typ === typ && t.bezug.id === id);
}

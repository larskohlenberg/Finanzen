// app/vorsorge-rechnung.mjs
// Reine Rechnung fuer die Vorsorgeseite: Tabs nach Vertragsart, erwartete
// Leistungen (Rentenstufen und Kapitalauszahlungen), Beitraege aus den
// verknuepften Regelzahlungen und gebuchte Beitraege. Kein DOM; Betraege in Cent.

import { addInterval, naechsteFaelligkeit, toCents } from "./liquiditaet.mjs";
import { aktuellerZeitwert } from "./vermoegen.mjs";

export const VORSORGE_TABS = ["uebersicht", "renten", "lebensversicherungen", "versicherungen"];

// Tab je Vertragsart. "sonstig" laeuft bei den Versicherungen mit, bis es einen
// eigenen Bedarf gibt.
const TAB_FUER_ART = {
  "gesetzliche-rente": "renten",
  betriebsrente: "renten",
  riester: "renten",
  ruerup: "renten",
  rentenversicherung: "renten",
  lebensversicherung: "lebensversicherungen",
  schutzversicherung: "versicherungen",
  sonstig: "versicherungen",
};

export function tabFuerVorsorge(vs) {
  return TAB_FUER_ART[vs?.art] ?? "versicherungen";
}

export const istBeendet = (vs) => vs.status === "beendet" || vs.status === "gekuendigt";

const PERIODEN_PRO_JAHR = { tag: 365, woche: 52, monat: 12, jahr: 1 };

const periodenProJahr = (rz) => (PERIODEN_PRO_JAHR[rz.rhythmus_einheit] ?? 12) / (Number(rz.rhythmus_intervall) || 1);

// Abfluss einer Regelzahlung als positiver Monats- bzw. Jahresbetrag.
export function beitragJeMonatCents(rz) {
  return Math.round((-toCents(rz.betrag) * periodenProJahr(rz)) / 12);
}

export function beitragJeJahrCents(rz) {
  return Math.round(-toCents(rz.betrag) * periodenProJahr(rz));
}

// Beitrags-Regelzahlungen eines Vertrags, die heute noch laufen.
export function laufendeBeitraege(data, vorsorgeId, today) {
  return (data.regelzahlungen ?? []).filter((rz) => rz.vorsorge_id === vorsorgeId && (!rz.aktiv_bis || rz.aktiv_bis >= today));
}

export function beitragJeMonatVertrag(data, vorsorgeId, today) {
  return laufendeBeitraege(data, vorsorgeId, today).reduce((summe, rz) => summe + beitragJeMonatCents(rz), 0);
}

// Jahresbetrag direkt aus der Regelzahlung, nicht ueber die gerundete Monatsrate.
export function beitragJeJahrVertrag(data, vorsorgeId, today) {
  return laufendeBeitraege(data, vorsorgeId, today).reduce((summe, rz) => summe + beitragJeJahrCents(rz), 0);
}

// Naechster Beitragstermin ueber alle laufenden Regelzahlungen des Vertrags.
export function naechsterBeitrag(data, vorsorgeId, today) {
  let best = null;
  for (const rz of laufendeBeitraege(data, vorsorgeId, today)) {
    const datum = naechsteFaelligkeit(rz, today);
    if (datum && (!best || datum < best.datum)) best = { datum, regelzahlung: rz };
  }
  return best;
}

// Gebuchte Beitraege: Transaktionen, die einer Beitrags-Regelzahlung des Vertrags
// zugeordnet sind, neueste zuerst.
export function gebuchteBeitraegeAlle(data, vorsorgeId) {
  const ids = new Set((data.regelzahlungen ?? []).filter((rz) => rz.vorsorge_id === vorsorgeId).map((rz) => rz.regelzahlung_id));
  return (data.transaktionen ?? [])
    .filter((tx) => ids.has(tx.regelzahlung_id))
    .slice()
    .sort((a, b) => String(b.buchungsdatum).localeCompare(String(a.buchungsdatum)) || String(b.transaktion_id).localeCompare(String(a.transaktion_id)));
}

// Vermoegensgegenstaende, zu denen ein Vertrag gehoert: die Immobilien, denen seine
// gebuchten Beitraege zugeordnet sind (immobilie_id), haeufigste zuerst.
export function vermoegensBezug(data, vorsorgeId) {
  const anzahl = new Map();
  for (const tx of gebuchteBeitraegeAlle(data, vorsorgeId)) {
    if (tx.immobilie_id) anzahl.set(tx.immobilie_id, (anzahl.get(tx.immobilie_id) ?? 0) + 1);
  }
  return [...anzahl]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, n]) => ({ klasse: "immobilie", id, anzahl: n }));
}

// Beitraege je Periode bis heute: monatlich zahlende Vertraege in Monaten (24),
// jaehrlich zahlende in Jahren (5). Betraege positiv.
export function beitragsVerlauf(data, vorsorgeId, today) {
  const rz = (data.regelzahlungen ?? []).filter((r) => r.vorsorge_id === vorsorgeId);
  const jaehrlich = rz.length > 0 && rz.every((r) => r.rhythmus_einheit === "jahr" || (r.rhythmus_einheit === "monat" && Number(r.rhythmus_intervall) % 12 === 0));
  const perioden = [];
  if (jaehrlich) {
    const jahr = Number(today.slice(0, 4));
    for (let j = jahr - 4; j <= jahr; j++) perioden.push(String(j));
  } else {
    for (let i = 23; i >= 0; i--) perioden.push(addInterval(`${today.slice(0, 7)}-01`, "monat", -i).slice(0, 7));
  }
  const laenge = jaehrlich ? 4 : 7;
  const werte = perioden.map(() => 0);
  for (const tx of gebuchteBeitraegeAlle(data, vorsorgeId)) {
    if (tx.buchungsdatum > today) continue;
    const i = perioden.indexOf(String(tx.buchungsdatum).slice(0, laenge));
    if (i >= 0) werte[i] += -toCents(tx.betrag);
  }
  return { einheit: jaehrlich ? "jahr" : "monat", perioden, werte };
}

const istJaehrlich = (rz) => rz.rhythmus_einheit === "jahr" || (rz.rhythmus_einheit === "monat" && Number(rz.rhythmus_intervall) % 12 === 0);

// Stufen im gebuchten Beitrag je Regelzahlung, neueste zuerst. Bei jaehrlichen
// Zahlungen ist jede Abweichung zur vorigen Zahlung eine Aenderung; bei kuerzerem
// Rhythmus zaehlt ein neuer Betrag erst, wenn die naechste Buchung ihn bestaetigt,
// damit einmalige Abweichungen wie ein Rabattmonat nicht als Erhoehung und Senkung
// erscheinen.
export function beitragsAenderungen(data, vorsorgeId) {
  const aenderungen = [];
  for (const rz of (data.regelzahlungen ?? []).filter((r) => r.vorsorge_id === vorsorgeId)) {
    const buchungen = (data.transaktionen ?? [])
      .filter((tx) => tx.regelzahlung_id === rz.regelzahlung_id)
      .sort((a, b) => String(a.buchungsdatum).localeCompare(String(b.buchungsdatum)) || String(a.transaktion_id).localeCompare(String(b.transaktion_id)))
      .map((tx) => ({ tx, cents: -toCents(tx.betrag) }));
    if (buchungen.length < 2) continue;
    const jaehrlich = istJaehrlich(rz);
    let stufe = buchungen[0].cents;
    for (let i = 1; i < buchungen.length; i++) {
      const { tx, cents } = buchungen[i];
      if (cents === stufe) continue;
      const bestaetigt = jaehrlich || buchungen[i + 1]?.cents === cents;
      if (!bestaetigt) continue;
      aenderungen.push({
        regelzahlung_id: rz.regelzahlung_id,
        transaktion_id: tx.transaktion_id,
        datum: tx.buchungsdatum,
        alt_cents: stufe,
        neu_cents: cents,
        diff_cents: cents - stufe,
        anteil: stufe ? (cents - stufe) / stufe : null,
      });
      stufe = cents;
    }
  }
  return aenderungen.sort((a, b) => b.datum.localeCompare(a.datum));
}

// Jahresvergleich fuer jaehrlich gezahlte Beitraege: letzte gebuchte Zahlung
// gegen die Zahlung davor (mindestens zehn Monate frueher).
export function beitragVorjahr(data, vorsorgeId) {
  const buchungen = gebuchteBeitraegeAlle(data, vorsorgeId);
  if (!buchungen.length) return null;
  const letzte = buchungen[0];
  const grenze = addInterval(letzte.buchungsdatum, "monat", -10);
  const vorher = buchungen.find((tx) => tx.buchungsdatum <= grenze);
  if (!vorher) return { letzte_cents: -toCents(letzte.betrag), letzte_datum: letzte.buchungsdatum, vorjahr_cents: null };
  return {
    letzte_cents: -toCents(letzte.betrag),
    letzte_datum: letzte.buchungsdatum,
    vorjahr_cents: -toCents(vorher.betrag),
    vorjahr_datum: vorher.buchungsdatum,
  };
}

// Erwartete Leistungen laufender Vertraege: Renten (monatlich) und Kapital.
export function erwarteteLeistungen(data) {
  const leistungen = [];
  for (const vs of data.vorsorge ?? []) {
    if (istBeendet(vs)) continue;
    const rente = aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, "erwartete_rente");
    if (rente) leistungen.push({ vorsorge: vs, typ: "rente", wert_cents: toCents(rente.wert), beginn: vs.leistung_beginn || null, zeitwert: rente });
    const kapital = aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, "erwartete_kapitalleistung");
    if (kapital) leistungen.push({ vorsorge: vs, typ: "kapital", wert_cents: toCents(kapital.wert), beginn: vs.leistung_beginn || null, zeitwert: kapital });
  }
  return leistungen.sort((a, b) => String(a.beginn ?? "9999").localeCompare(String(b.beginn ?? "9999")) || a.vorsorge.vorsorge_id.localeCompare(b.vorsorge.vorsorge_id));
}

// Monatsrente in Stufen: je Rentenbeginn die Summe aller bis dahin laufenden
// Renten. Renten ohne Beginn zaehlen nur in die Gesamtsumme.
export function rentenStufen(data) {
  const renten = erwarteteLeistungen(data).filter((l) => l.typ === "rente");
  const stufen = [];
  let summe = 0;
  for (const l of renten.filter((r) => r.beginn)) {
    summe += l.wert_cents;
    const letzte = stufen.at(-1);
    if (letzte?.datum === l.beginn) {
      letzte.summe_cents = summe;
      letzte.renten.push(l);
    } else stufen.push({ datum: l.beginn, summe_cents: summe, renten: [l] });
  }
  return { renten, stufen, gesamt_cents: renten.reduce((a, l) => a + l.wert_cents, 0), ohne_beginn: renten.filter((r) => !r.beginn) };
}

// Beginn der gesetzlichen Rente je Person (Bezugspunkt fuer "vor/nach Rentenbeginn").
export function gesetzlicherRentenbeginn(data, personId) {
  return (data.vorsorge ?? [])
    .filter((vs) => vs.art === "gesetzliche-rente" && !istBeendet(vs) && vs.leistung_beginn && (!personId || vs.person_id === personId))
    .map((vs) => vs.leistung_beginn)
    .sort()[0] ?? null;
}

// Jahresraster fuer den Zeitstrahl: von heute bis zwei Jahre nach der letzten
// Leistung; je Jahr die Monatsrente am Jahresende.
export function leistungsZeitstrahl(data, today) {
  const leistungen = erwarteteLeistungen(data).filter((l) => l.beginn);
  if (!leistungen.length) return null;
  const start = Number(today.slice(0, 4));
  const ende = Math.max(...leistungen.map((l) => Number(l.beginn.slice(0, 4)))) + 2;
  const jahre = [];
  for (let j = start; j <= ende; j++) jahre.push(j);
  const rente = jahre.map((j) => leistungen.filter((l) => l.typ === "rente" && l.beginn <= `${j}-12-31`).reduce((a, l) => a + l.wert_cents, 0));
  // Position in Spaltenkoordinaten: Jahr i reicht von i bis i+1.
  const pos = (iso) => Number(iso.slice(0, 4)) - start + (Number(iso.slice(5, 7)) - 1) / 12;
  return { jahre, rente, leistungen: leistungen.map((l) => ({ ...l, pos: pos(l.beginn) })) };
}

export function monateBis(vonIso, bisIso) {
  const [vy, vm, vd] = vonIso.split("-").map(Number);
  const [by, bm, bd] = bisIso.split("-").map(Number);
  let m = (by - vy) * 12 + (bm - vm);
  if (bd < vd) m -= 1;
  return m;
}

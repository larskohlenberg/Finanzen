// app/vorsorge-rechnung.mjs
// Reine Rechnung fuer die Vorsorgeseite: Tabs nach Vertragsart, erwartete
// Leistungen (Rentenstufen und Kapitalauszahlungen), Beitraege aus den
// verknuepften Regelzahlungen und gebuchte Beitraege. Kein DOM; Betraege in Cent.

import { addInterval, naechsteFaelligkeit, toCents } from "./liquiditaet.mjs";
import { aktuellerZeitwert } from "./vermoegen.mjs";
import { betragJeJahrCents, betragJeMonatCents } from "./rhythmus.mjs";

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

// Abfluss einer Regelzahlung als positiver Monats- bzw. Jahresbetrag
// (Perioden/Jahr aus rhythmus.mjs).
export function beitragJeMonatCents(rz) {
  return betragJeMonatCents(-toCents(rz.betrag), rz.rhythmus_einheit, rz.rhythmus_intervall);
}

export function beitragJeJahrCents(rz) {
  return betragJeJahrCents(-toCents(rz.betrag), rz.rhythmus_einheit, rz.rhythmus_intervall);
}

// Beitrags-Regelzahlungen eines Vertrags, die am Stichtag laufen: bestaetigt,
// begonnen (anker_datum <= today) und nicht beendet. Angekuendigte Folgezahlungen
// zaehlen erst ab ihrem Beginn, vorgeschlagene und abgelehnte nie.
const bestaetigterBeitrag = (rz, vorsorgeId, today) => rz.vorsorge_id === vorsorgeId && rz.status === "bestaetigt" && (!rz.aktiv_bis || rz.aktiv_bis >= today);

export function laufendeBeitraege(data, vorsorgeId, today) {
  return (data.regelzahlungen ?? []).filter((rz) => bestaetigterBeitrag(rz, vorsorgeId, today) && rz.anker_datum <= today);
}

export function beitragJeMonatVertrag(data, vorsorgeId, today) {
  return laufendeBeitraege(data, vorsorgeId, today).reduce((summe, rz) => summe + beitragJeMonatCents(rz), 0);
}

// Jahresbetrag direkt aus der Regelzahlung, nicht ueber die gerundete Monatsrate.
export function beitragJeJahrVertrag(data, vorsorgeId, today) {
  return laufendeBeitraege(data, vorsorgeId, today).reduce((summe, rz) => summe + beitragJeJahrCents(rz), 0);
}

// Naechster Beitragstermin ueber alle bestaetigten, nicht beendeten Regelzahlungen
// des Vertrags, auch eine angekuendigte Folgezahlung.
export function naechsterBeitrag(data, vorsorgeId, today) {
  let best = null;
  for (const rz of (data.regelzahlungen ?? []).filter((r) => bestaetigterBeitrag(r, vorsorgeId, today))) {
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

// Kapital zum Ablauf, vorsichtig: zaehlt, was ohne weitere Beitraege garantiert
// ist (beitragsfreie Kapitalleistung laut Beleg). Die Ablaufleistung bei
// Weiterzahlung laeuft als `weiterzahlung` mit, zaehlt aber in keine Summe.
// Kapitalbildende Lebensversicherungen ohne beitragsfreien Wert zaehlen mit dem
// jeweils neuesten Rueckkaufswert als Stand heute (ersatz: true), ohne
// Hochrechnung. Andere Vertraege behalten die erwartete Kapitalleistung. Nicht
// fuer Vertraege mit erwarteter Rente oder gewaehlter Monatsrente.
export function kapitalZumAblauf(data, vs, today = null) {
  const wert = (feld) => aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, feld, today);
  const weiter = wert("erwartete_kapitalleistung");
  const beitragsfrei = wert("beitragsfreie_kapitalleistung");
  if (beitragsfrei) return { zeitwert: beitragsfrei, ersatz: false, weiterzahlung: weiter };
  const lv = vs.art === "lebensversicherung" && vs.kapitalbildend && vs.kapitalwahl !== "monatsrente" && !wert("erwartete_rente");
  const rkw = lv ? wert("rueckkaufswert") : null;
  if (rkw) return { zeitwert: rkw, ersatz: true, weiterzahlung: weiter };
  return weiter ? { zeitwert: weiter, ersatz: false, weiterzahlung: null } : null;
}

// Erwartete Leistungen laufender Vertraege: Renten (monatlich) und Kapital, mit
// Wertstand bis zum Stichtag `today` (ohne: der juengste).
export function erwarteteLeistungen(data, today = null) {
  const leistungen = [];
  for (const vs of data.vorsorge ?? []) {
    if (istBeendet(vs)) continue;
    const rente = aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, "erwartete_rente", today);
    if (rente) leistungen.push({ vorsorge: vs, typ: "rente", wert_cents: toCents(rente.wert), beginn: vs.leistung_beginn || null, zeitwert: rente });
    const kapital = kapitalZumAblauf(data, vs, today);
    if (kapital) {
      leistungen.push({ vorsorge: vs, typ: "kapital", wert_cents: toCents(kapital.zeitwert.wert), beginn: vs.leistung_beginn || null, zeitwert: kapital.zeitwert, ersatz: kapital.ersatz,
        weiterzahlung_cents: kapital.weiterzahlung ? toCents(kapital.weiterzahlung.wert) : null });
    }
  }
  return leistungen.sort((a, b) => String(a.beginn ?? "9999").localeCompare(String(b.beginn ?? "9999")) || a.vorsorge.vorsorge_id.localeCompare(b.vorsorge.vorsorge_id));
}

// Kapitalleistungen in drei getrennten Gruppen, eine Rechnung fuer Uebersicht und
// Vorsorgeseite: terminiert (mit Leistungsbeginn, "faellig"), bedingt (ohne Termin
// an einem nicht kapitalbildenden Vertrag, zahlt nur bei Eintritt, etwa eine
// Todesfallsumme) und undatiert (kapitalbildend, Termin fehlt). Faellig ist nur
// die erste Gruppe; die anderen bleiben im Modell, werden aber nie "faellig" genannt.
export function kapitalLeistungen(data, today = null) {
  const kapital = erwarteteLeistungen(data, today).filter((l) => l.typ === "kapital");
  const terminiert = kapital.filter((l) => l.beginn);
  const bedingt = kapital.filter((l) => !l.beginn && !l.vorsorge.kapitalbildend);
  const undatiert = kapital.filter((l) => !l.beginn && l.vorsorge.kapitalbildend);
  const summe = (liste) => liste.reduce((a, l) => a + l.wert_cents, 0);
  return {
    terminiert,
    bedingt,
    undatiert,
    terminiert_cents: summe(terminiert),
    bedingt_cents: summe(bedingt),
    undatiert_cents: summe(undatiert),
    // Faellige Summe, wenn alle Vertraege bis zum Ablauf weiter bespart werden (nur Anzeige).
    terminiert_weiterzahlung_cents: terminiert.reduce((a, l) => a + (l.weiterzahlung_cents ?? l.wert_cents), 0),
    jahre: [...new Set(terminiert.map((l) => l.beginn.slice(0, 4)))].sort(),
  };
}

// Kapital- und Rentenversicherungen, je Vertrag drei Werte: Rueckkaufswert heute,
// Leistung bei Beitragsfreistellung (garantiert; ohne Garantie der Rueckkaufswert
// von heute, markiert als annahme) und Leistung bei Weiterzahlung (Kapital oder,
// bei Rentenvertraegen, die Monatsrente). Dazu gehoeren kapitalbildende Vertraege
// und die gefoerderten Rentenvertraege (Riester, Ruerup) mit erwarteter Rente;
// deren Kapital ist gebunden (gebunden: true) und zaehlt wie im Nettovermoegen
// nicht als Rueckkaufswert. Schutzversicherungen (etwa eine Pflegerente mit
// Rueckkaufswert) gehoeren nicht dazu. Sortiert nach Faelligkeit; die Summen
// zaehlen nur Kapital, keine Monatsrenten.
const GEFOERDERTE_RENTE = new Set(["riester", "ruerup"]);

export function versicherungsWerte(data, today = null) {
  const personName = new Map((data.personen ?? []).map((p) => [p.person_id, p.name]));
  const zeilen = [];
  for (const vs of data.vorsorge ?? []) {
    if (istBeendet(vs)) continue;
    const wert = (feld) => {
      const zw = aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, feld, today);
      return zw ? toCents(zw.wert) : null;
    };
    const rueckkauf = vs.kapitalbildend ? wert("rueckkaufswert") : null;
    const garantiert = wert("beitragsfreie_kapitalleistung");
    const weiter = wert("erwartete_kapitalleistung");
    const rente = wert("erwartete_rente");
    const gebunden = !vs.kapitalbildend && GEFOERDERTE_RENTE.has(vs.art) && rente !== null;
    // Kapitalbildend mit Rueckkaufswert oder Ablaufleistung, oder gefoerderte Rente
    // (keine reinen Schutzvertraege, keine Todesfallsummen).
    if (!gebunden && !(vs.kapitalbildend && (rueckkauf !== null || garantiert !== null || weiter !== null))) continue;
    zeilen.push({
      vorsorge_id: vs.vorsorge_id,
      name: vs.name,
      person: personName.get(vs.person_id) ?? "",
      beginn: vs.leistung_beginn || null,
      rueckkauf_cents: rueckkauf,
      gebunden,
      beitragsfrei: garantiert !== null ? { cents: garantiert, annahme: false } : rueckkauf !== null ? { cents: rueckkauf, annahme: true } : null,
      weiterzahlung: weiter !== null ? { cents: weiter, rente: false } : rente !== null ? { cents: rente, rente: true } : null,
    });
  }
  zeilen.sort((a, b) => String(a.beginn ?? "9999").localeCompare(String(b.beginn ?? "9999")) || a.vorsorge_id.localeCompare(b.vorsorge_id));
  const summe = (f) => zeilen.reduce((a, z) => a + (f(z) ?? 0), 0);
  return {
    zeilen,
    rueckkauf_cents: summe((z) => z.rueckkauf_cents),
    beitragsfrei_cents: summe((z) => z.beitragsfrei?.cents),
    weiterzahlung_cents: summe((z) => (z.weiterzahlung?.rente ? 0 : z.weiterzahlung?.cents)),
    rente_cents: summe((z) => (z.weiterzahlung?.rente ? z.weiterzahlung.cents : 0)),
  };
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
  const bisJahr = (typ, j) => leistungen.filter((l) => l.typ === typ && l.beginn <= `${j}-12-31`).reduce((a, l) => a + l.wert_cents, 0);
  const rente = jahre.map((j) => bisJahr("rente", j));
  // Kapital: bis Ende des Jahres ausgezahlt, aufsummiert.
  const kapital = jahre.map((j) => bisJahr("kapital", j));
  // Position in Spaltenkoordinaten: Jahr i reicht von i bis i+1.
  const pos = (iso) => Number(iso.slice(0, 4)) - start + (Number(iso.slice(5, 7)) - 1) / 12;
  return { jahre, rente, kapital, leistungen: leistungen.map((l) => ({ ...l, pos: pos(l.beginn) })) };
}

export function monateBis(vonIso, bisIso) {
  const [vy, vm, vd] = vonIso.split("-").map(Number);
  const [by, bm, bd] = bisIso.split("-").map(Number);
  let m = (by - vy) * 12 + (bm - vm);
  if (bd < vd) m -= 1;
  return m;
}

// Feste Farbe je Altersvorsorge-Vertrag (Renten und Lebensversicherungen) fuer
// Grafiken, Legenden und Kartenpunkte: Slot 0..13 der Vertragspalette.
// Fest vergebene Slots stehen in DATENROOT/farben.json ({ "vorsorge": { "VS-001": 0 } })
// und gewinnen immer. Vertraege ohne Eintrag bekommen nach ID die naechste freie Farbe,
// damit die Zuordnung auch ohne Datei stabil bleibt. Sind alle 14 vergeben, beginnt die
// Palette von vorn (bewusst kein Grau). Versicherungen bekommen nur mit Eintrag eine Farbe.
export const VERTRAG_FARBEN = 14;

export function vertragsFarben(data) {
  const ids = new Set((data.vorsorge ?? []).map((vs) => vs.vorsorge_id));
  const fest = Object.entries(data.farben?.vorsorge ?? {})
    .filter(([id, slot]) => ids.has(id) && Number.isInteger(slot) && slot >= 0 && slot < VERTRAG_FARBEN);
  const farben = new Map(fest);
  const belegt = new Set(fest.map(([, slot]) => slot));
  let ueberlauf = 0;
  const offen = (data.vorsorge ?? [])
    .filter((vs) => !farben.has(vs.vorsorge_id) && tabFuerVorsorge(vs) !== "versicherungen")
    .sort((a, b) => a.vorsorge_id.localeCompare(b.vorsorge_id));
  for (const vs of offen) {
    let slot = 0;
    while (slot < VERTRAG_FARBEN && belegt.has(slot)) slot++;
    if (slot === VERTRAG_FARBEN) slot = ueberlauf++ % VERTRAG_FARBEN;
    belegt.add(slot);
    farben.set(vs.vorsorge_id, slot);
  }
  return farben;
}

// Wertentwicklung eines Vertrags: die Wertstaende (Rueckkaufs- oder Vertragswert,
// je nachdem, welcher oefter belegt ist) gegen die bis zum selben Stichtag
// eingezahlten Beitraege. Eingezahlt ist die juengste Beitragssumme laut
// Mitteilung plus die danach gebuchten Beitraege, vor der ersten Summe diese minus
// die Buchungen bis dahin; ohne Beitragssumme zaehlen nur die Buchungen
// (vollstaendig: false), was meist zu wenig ist. Null ohne Wertstand.
// Zaehlen die Beitragssummen nur den Sparanteil (beitragssumme_umfang
// "sparanteil"), enthalten die Lastschriften auch Risikobeitraege wie die BU;
// dann gilt nur eine Summe genau zum Stichtag, Buchungen bleiben aussen vor.
export function wertEntwicklung(data, vorsorgeId) {
  const nurSparanteil = (data.vorsorge ?? []).find((v) => v.vorsorge_id === vorsorgeId)?.beitragssumme_umfang === "sparanteil";
  const staende = (feld) => {
    const jeDatum = new Map();
    for (const zw of data.zeitwerte ?? []) {
      if (zw.entitaet === "vorsorge" && zw.entitaet_id === vorsorgeId && zw.feld === feld) jeDatum.set(zw.standdatum, toCents(zw.wert));
    }
    return [...jeDatum].sort((a, b) => a[0].localeCompare(b[0])).map(([datum, c]) => ({ datum, cents: c }));
  };
  const rkw = staende("rueckkaufswert");
  const vw = staende("vertragswert");
  const feld = vw.length > rkw.length ? "vertragswert" : "rueckkaufswert";
  const werte = feld === "vertragswert" ? vw : rkw;
  if (!werte.length) return null;
  const summen = staende("beitragssumme");
  const buchungen = nurSparanteil ? [] : gebuchteBeitraegeAlle(data, vorsorgeId).map((tx) => ({ datum: tx.buchungsdatum, cents: -toCents(tx.betrag) }));
  const ersteBuchung = buchungen.reduce((min, b) => (!min || b.datum < min ? b.datum : min), null);
  // Die Buchungen decken den Zeitraum ab einem Stichtag ab, wenn die erste schon
  // davor liegt; bei monatlich zahlenden Vertraegen reicht die erste Lastschrift
  // im Monat danach (Kontoauszuege beginnen oft am Jahresanfang).
  const monatlich = (data.regelzahlungen ?? []).filter((rz) => rz.vorsorge_id === vorsorgeId)
    .every((rz) => rz.rhythmus_einheit === "monat" && Number(rz.rhythmus_intervall) === 1);
  const gedecktAb = (datum) => ersteBuchung !== null && ersteBuchung <= (monatlich ? addInterval(datum, "monat", 1) : datum);
  const summeZwischen = (von, bis) => buchungen.filter((b) => b.datum > von && b.datum <= bis).reduce((s, b) => s + b.cents, 0);
  const eingezahltBis = (datum) => {
    const basis = summen.filter((s) => (nurSparanteil ? s.datum === datum : s.datum <= datum)).at(-1);
    if (basis) return { cents: basis.cents + summeZwischen(basis.datum, datum), vollstaendig: true };
    // Vor der ersten Beitragssumme rueckwaerts: Summe minus die Buchungen dazwischen,
    // sofern die Buchungen das Intervall abdecken.
    const spaeter = summen.find((s) => s.datum > datum);
    if (spaeter && gedecktAb(datum)) return { cents: spaeter.cents - summeZwischen(datum, spaeter.datum), vollstaendig: true };
    return { cents: summeZwischen("", datum), vollstaendig: false };
  };
  const punkte = werte.map((w) => {
    const e = eingezahltBis(w.datum);
    return { datum: w.datum, wert_cents: w.cents, eingezahlt_cents: e.cents, vollstaendig: e.vollstaendig };
  });
  // Ertrag je Zeitraum zwischen zwei Stichtagen: Wertzuwachs minus die Beitraege
  // dazwischen. Nur, wo diese Beitraege belegt sind.
  const zeitraeume = [];
  for (let i = 1; i < punkte.length; i++) {
    const a = punkte[i - 1];
    const b = punkte[i];
    if (!(a.vollstaendig || (!b.vollstaendig && gedecktAb(a.datum))) || (nurSparanteil && !b.vollstaendig)) continue;
    const beitraege = b.eingezahlt_cents - a.eingezahlt_cents;
    const zuwachs = b.wert_cents - a.wert_cents;
    zeitraeume.push({ von: a.datum, bis: b.datum, zuwachs_cents: zuwachs, beitraege_cents: beitraege, ertrag_cents: zuwachs - beitraege });
  }
  const ertrag = zeitraeume.at(-1)?.bis === punkte.at(-1).datum ? zeitraeume.at(-1) : null;
  // Wert ohne Ertrag: ab dem ersten Stichtag, ab dem die Buchungen reichen, dessen
  // Stand plus alle Beitraege seither. Liegt der Wert darueber, hat der Vertrag
  // etwas erwirtschaftet; das geht auch ohne Beitragssumme aus einer Mitteilung.
  const start = punkte.find((p) => p.vollstaendig || gedecktAb(p.datum));
  const ohneErtrag = start && !nurSparanteil
    ? punkte.filter((p) => p.datum >= start.datum).map((p) => ({ datum: p.datum, cents: start.wert_cents + summeZwischen(start.datum, p.datum) }))
    : [];
  return { feld, punkte, letzter: punkte.at(-1), ertrag, zeitraeume, ohne_ertrag: ohneErtrag, erste_buchung: ersteBuchung };
}

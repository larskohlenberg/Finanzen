// app/liquiditaet.mjs
// Reine, deterministische Liquiditaets-Mathematik. Kein DOM, keine Node-Abhaengigkeiten.
// Eine getestete Funktion an zwei Aufrufstellen: Browser (app/main.js) und Node (tests/).
// Modell-Begruendung: Liquiditaet = belegter Konto-Anker + Ist-Buchungen + Regelzahlungs-Fortschreibung.

import { toCents } from "./tools/lib/text.mjs";
import { aktivAm, kontoStand } from "./bewertung.mjs";
import { addInterval, naechsterTermin, termine } from "./rhythmus.mjs";
export { toCents, addInterval };

export function monatVon(isoDate) {
  return isoDate.slice(0, 7);
}

function monatsStart(isoDate) {
  return `${monatVon(isoDate)}-01`;
}

export function localTodayIso(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Termine einer Regelzahlung strikt nach `today` bis `horizonEnd`, ab ihrem
// Anker bis aktiv_bis (rhythmus.mjs).
export function occurrences(regelzahlung, today, horizonEnd) {
  return termine(regelzahlung.anker_datum, regelzahlung.rhythmus_einheit, regelzahlung.rhythmus_intervall, { nach: today, bis: horizonEnd, ende: regelzahlung.aktiv_bis });
}

// Naechster erwarteter Termin einer Regelzahlung strikt nach `today`; null,
// wenn sie vorher endet (aktiv_bis). Man sieht sofort, ob Rhythmus und Tag stimmen.
export function naechsteFaelligkeit(regelzahlung, today) {
  return naechsterTermin(regelzahlung.anker_datum, regelzahlung.rhythmus_einheit, regelzahlung.rhythmus_intervall, today, regelzahlung.aktiv_bis ?? null);
}

// Bestaetigte Abfluesse, die einmal im Jahr faellig werden, mit ihren Terminen von
// heute (einschliesslich) bis `monate` Monate voraus, nach Datum sortiert. Fuer die
// Uebersicht: die grossen Jahresposten, die zwischen den Monatsraten untergehen.
export function anstehendeJahreszahlungen(regelzahlungen, today, monate = 3) {
  const bis = addInterval(today, "monat", monate);
  const gestern = addInterval(today, "tag", -1);
  const jaehrlich = (rz) => rz.rhythmus_einheit === "jahr" || (rz.rhythmus_einheit === "monat" && rz.rhythmus_intervall % 12 === 0);
  return (regelzahlungen ?? [])
    .filter((rz) => rz.status === "bestaetigt" && jaehrlich(rz) && toCents(rz.betrag) < 0)
    .flatMap((rz) => occurrences(rz, gestern, bis).map((datum) => ({ datum, regelzahlung: rz })))
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.regelzahlung.regelzahlung_id.localeCompare(b.regelzahlung.regelzahlung_id));
}

// Standard-Horizont der Prognose: zwoelf Monate ab heute. Weiter reicht die
// Aussage kaum, weil viele Regelzahlungen unbefristet weiterlaufen; ein
// spaeteres Datum laesst sich in der Ansicht waehlen.
export function defaultHorizonEnd(today, monate = 12) {
  return addInterval(today, "monat", monate);
}

export function periodenSchluessel(monat, granularitaet) {
  const [jahr, mm] = monat.split("-");
  if (granularitaet === "jahr") return jahr;
  if (granularitaet === "quartal") {
    const quartal = Math.floor((Number(mm) - 1) / 3) + 1;
    return `${jahr}-Q${quartal}`;
  }
  return monat;
}

// Liquide Konten zum Stichtag: liquiditaetsrelevant, kein Bargeld, kein Depot;
// geschlossene zaehlen bis aktiv_bis (Lebenszyklus wie im Bewertungsstand).
function liquiditaetsKonten(konten, datum) {
  return (konten ?? []).filter((konto) =>
    aktivAm(konto, "geschlossen", datum)
    && konto.liquiditaetsrelevant === true
    && konto.kontotyp !== "bar"
    && konto.kontotyp !== "depot"
  );
}

// Saldo eines Kontos zum Stichtag aus dem gemeinsamen Bewertungsstand
// (bewertung.mjs: juengster Anker vorwaerts, sonst Rueckrechnung aus dem
// naechsten spaeteren Anker). Vor dem Beginn des Kontos 0.
function kontoSaldoZuDatum(konto, zeitwerte, transaktionen, bisDatum) {
  const w = kontoStand(konto, zeitwerte, transaktionen, bisDatum);
  return { saldo_cents: w.wert_cents, basis: w.basis };
}

function tagesbewegungenFuerMonat(data, today, gueltigeKontoIds) {
  const start = monatsStart(today);
  const bewegungen = new Map();
  for (const tx of data.transaktionen ?? []) {
    if (!gueltigeKontoIds.has(tx.konto_id)) continue;
    if (tx.buchungsdatum < start || tx.buchungsdatum > today) continue;
    bewegungen.set(tx.buchungsdatum, (bewegungen.get(tx.buchungsdatum) ?? 0) + toCents(tx.betrag));
  }
  return bewegungen;
}

export function computeLiquiditaetIst(data, { today }) {
  const konten = [];
  let saldo = 0;
  let fehlendeAnker = 0;
  const gueltigeKontoIds = new Set();

  for (const konto of liquiditaetsKonten(data.konten, today)) {
    const kontoSaldo = kontoSaldoZuDatum(konto, data.zeitwerte, data.transaktionen, today);
    if (kontoSaldo.saldo_cents === null) {
      fehlendeAnker++;
      konten.push({ konto_id: konto.konto_id, name: konto.name, saldo_cents: null, basis: kontoSaldo.basis });
      continue;
    }
    saldo += kontoSaldo.saldo_cents;
    gueltigeKontoIds.add(konto.konto_id);
    konten.push({ konto_id: konto.konto_id, name: konto.name, saldo_cents: kontoSaldo.saldo_cents, basis: kontoSaldo.basis });
  }

  // Monatsanfang = Saldo heute minus die Bewegungen des Monats: der Verlauf
  // endet so per Konstruktion beim Saldo heute.
  const start = monatsStart(today);
  const bewegungen = tagesbewegungenFuerMonat(data, today, gueltigeKontoIds);
  const startSaldo = saldo - [...bewegungen.values()].reduce((a, b) => a + b, 0);
  const monatsverlauf = [{ datum: start, saldo_cents: startSaldo, bewegung_cents: 0, quelle: "ist" }];
  let laufenderSaldo = startSaldo;
  for (const [datum, bewegung] of [...bewegungen.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    laufenderSaldo += bewegung;
    monatsverlauf.push({ datum, saldo_cents: laufenderSaldo, bewegung_cents: bewegung, quelle: "ist" });
  }

  return {
    saldo_cents: saldo,
    konten,
    monatsverlauf,
    qualitaet: { konten: konten.length, fehlende_anker: fehlendeAnker },
  };
}

// Liquiditaet je Monatsende der letzten `monate` Monate, der laufende Monat zum
// heutigen Tag. Gleiche Konten und Rechnung wie computeLiquiditaetIst; Konten
// ohne Anker zaehlen nicht mit. Je Monat dazu die grossen Buchungen, die den
// Sprung erklaeren (grosseBuchungen), und der Trend aus gleitender Regression
// (trendVerlauf).
export function liquiditaetVerlauf(data, today, monate = 12) {
  const erster = addInterval(`${today.slice(0, 7)}-01`, "monat", -(monate - 1));
  const grosse = grosseBuchungen(data, erster, today);
  const punkte = [];
  for (let i = monate - 1; i >= 0; i--) {
    const monat = addInterval(`${today.slice(0, 7)}-01`, "monat", -i).slice(0, 7);
    const datum = i === 0 ? today : addInterval(addInterval(`${monat}-01`, "monat", 1), "tag", -1);
    const staende = liquiditaetsKonten(data.konten, datum).map((k) => kontoSaldoZuDatum(k, data.zeitwerte, data.transaktionen, datum));
    const saldo = staende.reduce((a, w) => a + (w.saldo_cents ?? 0), 0);
    // modelliert: mindestens ein Konto ist nur aus einem spaeteren Anker
    // zurueckgerechnet. Konten ganz ohne Anker zaehlen 0 und meldet die
    // Kachel ueber "fehlende Anker", nicht als Rueckrechnung.
    const modelliert = staende.some((w) => w.basis === "anker-rueckwaerts");
    punkte.push({ monat, datum, saldo_cents: saldo, modelliert, grosse: grosse.filter((g) => g.monat === monat) });
  }
  trendVerlauf(punkte.map((p) => p.saldo_cents)).forEach((tr, i) => Object.assign(punkte[i], tr));
  return punkte;
}

// Gleitende lineare Regression (kleinste Quadrate) ueber die jeweils letzten
// `fenster` Monatswerte: je Monat die Steigung in Cent je Monat und der Wert der
// Ausgleichsgeraden am Fensterende. So entsteht eine Trendkurve aus dem
// tatsaechlichen Verlauf, die kippt, wenn sich das Verhalten aendert. Vor dem
// ersten vollen Fenster null. Die Statistik ist eine Kennzahl zur Anzeige: sie
// rechnet mit Bruechen und rundet das Ergebnis auf Cent.
export const TREND_FENSTER = 6;

export function trendVerlauf(werte, fenster = TREND_FENSTER) {
  const xMittel = (fenster - 1) / 2;
  const nenner = Array.from({ length: fenster }, (_, x) => (x - xMittel) ** 2).reduce((a, b) => a + b, 0);
  return werte.map((_, i) => {
    if (i < fenster - 1) return { trend_cents: null, steigung_cents: null };
    const y = werte.slice(i - fenster + 1, i + 1);
    const yMittel = y.reduce((a, b) => a + b, 0) / fenster;
    const steigung = y.reduce((a, w, x) => a + (x - xMittel) * (w - yMittel), 0) / nenner;
    return { trend_cents: Math.round(yMittel + steigung * (fenster - 1 - xMittel)), steigung_cents: Math.round(steigung) };
  });
}

// Ab diesem Betrag gilt eine Einzelbuchung als gross (4.000 Euro): darunter
// bleiben normale Monatsausgaben, darueber liegen Anschaffungen, Anlagen und
// Erstattungen, die einen Sprung von 8.000 bis 10.000 Euro erklaeren.
export const GROSSE_BUCHUNG_CENTS = 400000;

const normName = (text) => String(text ?? "").toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim();

// Beschriftung einer Buchung, kurz (hoechstens 32 Zeichen): die Gegenpartei,
// ausser sie ist jemand aus dem Haushalt (Umbuchung, Festgeld); dann die
// Bemerkung bis zum ersten Satzzeichen, der Verwendungszweck ohne Bankdaten und
// Namen aus dem Haushalt, zuletzt die Kategorie.
const LABEL_MAX = 32;
const kuerzen = (text) => (text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1).trim()}…` : text);
// Bankdaten und Codes: Schluesselwoerter samt Wert, IBANs und Zeichenketten ab
// acht Zeichen mit Ziffer (Kontonummern, Referenzen), Datum und Uhrzeit.
const BANKDATEN = /\b(BLZ|Kto|Konto|BIC|IBAN|DATUM|UHR)\b:?\s*[\w.,:]*|\bDE\d{2}[\d\s]{10,}|\b(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{8,}\b|\b\d{1,2}\.\d{1,2}\.\d{0,4}|\b\d{1,2}[.:]\d{2}\b/gi;

function buchungsLabel(tx, data) {
  const namen = (data.personen ?? []).map((p) => normName(p.name).split(" ").filter(Boolean));
  const istEigen = (text) => {
    const n = normName(text);
    return Boolean(n) && namen.some((teile) => teile.length && teile.every((teil) => n.includes(teil)));
  };
  if (tx.gegenpartei?.trim() && !istEigen(tx.gegenpartei)) return kuerzen(tx.gegenpartei.trim());
  const bemerkung = String(tx.bemerkung ?? "").split(/[,(.:;]/)[0].replace(BANKDATEN, " ").replace(/\s+/g, " ").trim();
  if (bemerkung) return kuerzen(bemerkung);
  let zweck = String(tx.verwendungszweck ?? "").replace(BANKDATEN, " ");
  for (const teile of namen) for (const teil of teile) zweck = zweck.replace(new RegExp(`\\b${teil}\\b`, "gi"), " ");
  zweck = zweck.replace(/\s+/g, " ").trim();
  if (/[A-Za-zÄÖÜäöüß]{4,}/.test(zweck)) return kuerzen(zweck);
  return kuerzen((data.kategorien ?? []).find((k) => k.kategorie_id === tx.kategorie_id)?.name ?? tx.gegenpartei ?? "");
}

// Grosse Einzelbuchungen der liquiden Konten von `von` bis `bis`: ab der
// Schwelle, ohne Umbuchungen zwischen zwei liquiden Konten (sie heben sich auf),
// ohne Regelzahlungen und ohne Gegenparteien, die in mindestens drei Monaten mit
// aehnlichem Betrag (+-20 %) wiederkehren, etwa das Gehalt. Nach Datum.
export function grosseBuchungen(data, von, bis, schwelle = GROSSE_BUCHUNG_CENTS) {
  const liquide = new Set(liquiditaetsKonten(data.konten, von).map((k) => k.konto_id));
  const kontoVon = new Map((data.transaktionen ?? []).map((tx) => [tx.transaktion_id, tx.konto_id]));
  const transfers = new Map((data.transfers ?? []).map((tr) => [tr.transfer_id, tr]));
  const intern = (tx) => {
    const tr = tx.transfer_id && transfers.get(tx.transfer_id);
    if (!tr) return false;
    const andere = tr.abgang_transaktion_id === tx.transaktion_id ? tr.zugang_transaktion_id : tr.abgang_transaktion_id;
    return liquide.has(kontoVon.get(andere));
  };
  const kandidaten = (data.transaktionen ?? []).filter((tx) =>
    liquide.has(tx.konto_id) && tx.buchungsdatum >= von && tx.buchungsdatum <= bis
    && Math.abs(toCents(tx.betrag)) >= schwelle && !tx.regelzahlung_id && !intern(tx));
  const wiederkehrend = (tx) => {
    const name = normName(tx.gegenpartei);
    if (!name) return false;
    const betrag = toCents(tx.betrag);
    const monate = new Set(kandidaten
      .filter((o) => normName(o.gegenpartei) === name && Math.sign(toCents(o.betrag)) === Math.sign(betrag) && Math.abs(toCents(o.betrag) - betrag) <= Math.abs(betrag) * 0.2)
      .map((o) => o.buchungsdatum.slice(0, 7)));
    return monate.size >= 3;
  };
  return kandidaten
    .filter((tx) => !wiederkehrend(tx))
    .map((tx) => ({ transaktion_id: tx.transaktion_id, datum: tx.buchungsdatum, monat: tx.buchungsdatum.slice(0, 7), betrag_cents: toCents(tx.betrag), label: buchungsLabel(tx, data) }))
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.transaktion_id.localeCompare(b.transaktion_id));
}

export function computeLiquiditaetPrognose(data, { today, horizonEnd }) {
  const ende = horizonEnd ?? defaultHorizonEnd(today);
  const ist = computeLiquiditaetIst(data, { today });
  const ereignisse = [];
  let bestaetigt = 0;
  let vorschlaege = 0;
  let unbefristet = 0;

  for (const rz of data.regelzahlungen ?? []) {
    if (rz.status === "vorgeschlagen") { vorschlaege++; continue; }
    if (rz.status !== "bestaetigt") continue;
    bestaetigt++;
    if (!rz.aktiv_bis) unbefristet++;
    const betrag = toCents(rz.betrag);
    for (const datum of occurrences(rz, today, ende)) {
      ereignisse.push({ datum, bezeichnung: rz.bezeichnung, regelzahlung_id: rz.regelzahlung_id, bewegung_cents: betrag });
    }
  }

  let saldo = ist.saldo_cents;
  const verlauf = [];
  for (const ereignis of ereignisse.sort((a, b) => a.datum.localeCompare(b.datum) || a.regelzahlung_id.localeCompare(b.regelzahlung_id))) {
    saldo += ereignis.bewegung_cents;
    verlauf.push({ ...ereignis, saldo_cents: saldo, quelle: "prognose" });
  }

  return {
    start_saldo_cents: ist.saldo_cents,
    end_saldo_cents: saldo,
    verlauf,
    horizont_ende: ende,
    qualitaet: {
      bestaetigte_regelzahlungen: bestaetigt,
      vorschlaege_nicht_enthalten: vorschlaege,
      unbefristete_regelzahlungen: unbefristet,
      fehlende_anker: ist.qualitaet.fehlende_anker,
      einmaleffekte_enthalten: false,
    },
  };
}

export function computeLiquiditaetPrognoseDetail(data, { today, horizonEnd, granularitaet = "monat" }) {
  const prognose = computeLiquiditaetPrognose(data, { today, horizonEnd });
  const heuteMonat = monatVon(today);
  const heutePeriode = periodenSchluessel(heuteMonat, granularitaet);

  const monatsMap = new Map();
  for (const posten of prognose.verlauf) {
    const monat = monatVon(posten.datum);
    let eintrag = monatsMap.get(monat);
    if (!eintrag) {
      eintrag = { posten: [], bewegung_cents: 0, saldo_cents: prognose.start_saldo_cents };
      monatsMap.set(monat, eintrag);
    }
    eintrag.posten.push(posten);
    eintrag.bewegung_cents += posten.bewegung_cents;
    eintrag.saldo_cents = posten.saldo_cents;
  }

  const periodenMap = new Map();
  for (const [monat, eintrag] of monatsMap) {
    const periode = periodenSchluessel(monat, granularitaet);
    let monMap = periodenMap.get(periode);
    if (!monMap) {
      monMap = new Map();
      periodenMap.set(periode, monMap);
    }
    monMap.set(monat, eintrag);
  }

  const perioden = [...periodenMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([periode, monMap]) => {
      const monate = [...monMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([monat, eintrag]) => ({
          monat,
          bewegung_cents: eintrag.bewegung_cents,
          saldo_cents: eintrag.saldo_cents,
          ist_laufend: monat === heuteMonat,
          posten: [...eintrag.posten].sort((a, b) => a.datum.localeCompare(b.datum) || a.regelzahlung_id.localeCompare(b.regelzahlung_id)),
        }));
      return {
        periode,
        bewegung_cents: monate.reduce((sum, monat) => sum + monat.bewegung_cents, 0),
        saldo_cents: monate.at(-1)?.saldo_cents ?? prognose.start_saldo_cents,
        ist_laufend: periode === heutePeriode,
        monate,
      };
    });

  return {
    perioden,
    start_saldo_cents: prognose.start_saldo_cents,
    end_saldo_cents: prognose.end_saldo_cents,
    horizont_ende: prognose.horizont_ende,
    qualitaet: prognose.qualitaet,
  };
}

// Saldo-Verlauf je Tag fuer Diagramme: mehrere Buchungen eines Tages ergeben
// einen Punkt mit dem Saldo am Tagesende. Eingabe aufsteigend nach Datum.
export function saldoJeTag(verlauf) {
  const punkte = [];
  for (const eintrag of verlauf ?? []) {
    const letzter = punkte.at(-1);
    if (letzter && letzter.datum === eintrag.datum) letzter.wert = eintrag.saldo_cents;
    else punkte.push({ datum: eintrag.datum, wert: eintrag.saldo_cents });
  }
  return punkte;
}

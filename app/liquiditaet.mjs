// app/liquiditaet.mjs
// Reine, deterministische Liquiditaets-Mathematik. Kein DOM, keine Node-Abhaengigkeiten.
// Eine getestete Funktion an zwei Aufrufstellen: Browser (app/main.js) und Node (tests/).
// Modell-Begruendung: Liquiditaet = belegter Konto-Anker + Ist-Buchungen + Regelzahlungs-Fortschreibung.

import { toCents } from "./tools/lib/text.mjs";
export { toCents };

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

export function addInterval(isoDate, einheit, intervall) {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (einheit === "tag") {
    return new Date(Date.UTC(y, m - 1, d + intervall)).toISOString().slice(0, 10);
  }
  if (einheit === "woche") {
    return new Date(Date.UTC(y, m - 1, d + intervall * 7)).toISOString().slice(0, 10);
  }
  if (einheit === "monat") {
    const totalMonths = y * 12 + (m - 1) + intervall;
    const ny = Math.floor(totalMonths / 12);
    const nm = totalMonths % 12;
    const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    return new Date(Date.UTC(ny, nm, Math.min(d, lastDay))).toISOString().slice(0, 10);
  }
  if (einheit === "jahr") {
    const ny = y + intervall;
    const lastDay = new Date(Date.UTC(ny, m, 0)).getUTCDate();
    return new Date(Date.UTC(ny, m - 1, Math.min(d, lastDay))).toISOString().slice(0, 10);
  }
  throw new Error(`Unbekannte Rhythmus-Einheit: ${einheit}`);
}

export function occurrences(regelzahlung, today, horizonEnd) {
  const ende = regelzahlung.aktiv_bis && regelzahlung.aktiv_bis < horizonEnd ? regelzahlung.aktiv_bis : horizonEnd;
  const dates = [];
  let step = 0;
  let guard = 0;
  let cur = regelzahlung.anker_datum;
  while (cur <= ende && guard < 100000) {
    if (cur > today) dates.push(cur);
    step++;
    cur = addInterval(regelzahlung.anker_datum, regelzahlung.rhythmus_einheit, regelzahlung.rhythmus_intervall * step);
    guard++;
  }
  return dates;
}

// Naechster erwarteter Termin einer Regelzahlung strikt nach `today`. Gleiche
// Expansion wie `occurrences` (Anker x Intervall, Monatsend-Klemmung via
// addInterval), bricht am ersten Treffer ab. Null, wenn die Regelzahlung vor dem
// naechsten Termin endet (aktiv_bis ueberschritten). Grosser Review-Nutzen:
// man sieht sofort, ob Rhythmus und Tag stimmen.
export function naechsteFaelligkeit(regelzahlung, today) {
  const ende = regelzahlung.aktiv_bis ?? null;
  let step = 0;
  let guard = 0;
  let cur = regelzahlung.anker_datum;
  while (guard < 100000) {
    if (ende && cur > ende) return null;
    if (cur > today) return cur;
    step++;
    cur = addInterval(regelzahlung.anker_datum, regelzahlung.rhythmus_einheit, regelzahlung.rhythmus_intervall * step);
    guard++;
  }
  return null;
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

function aktuellerZeitwert(zeitwerte, entitaet, entitaetId, feld) {
  let best = null;
  for (const zw of zeitwerte ?? []) {
    if (zw.entitaet !== entitaet || zw.entitaet_id !== entitaetId || zw.feld !== feld) continue;
    if (best === null || zw.standdatum > best.standdatum) best = zw;
  }
  return best;
}

function liquiditaetsKonten(konten) {
  return (konten ?? []).filter((konto) =>
    konto.status !== "geschlossen"
    && konto.liquiditaetsrelevant === true
    && konto.kontotyp !== "bar"
    && konto.kontotyp !== "depot"
  );
}

function kontoSaldoZuDatum(konto, zeitwerte, transaktionen, bisDatum) {
  const anker = aktuellerZeitwert(zeitwerte, "konto", konto.konto_id, "kontostand");
  if (!anker) return { saldo_cents: null, basis: "anker-fehlt", anker: null };

  // Vorwaerts: Buchungen nach dem Anker addieren. Rueckwaerts (Stichtag vor dem
  // Anker): Buchungen bis zum Anker abziehen — sie stecken im Ankerwert bereits drin.
  let saldo = toCents(anker.wert);
  for (const tx of transaktionen ?? []) {
    if (tx.konto_id !== konto.konto_id) continue;
    if (bisDatum >= anker.standdatum) {
      if (tx.buchungsdatum > anker.standdatum && tx.buchungsdatum <= bisDatum) saldo += toCents(tx.betrag);
    } else {
      if (tx.buchungsdatum > bisDatum && tx.buchungsdatum <= anker.standdatum) saldo -= toCents(tx.betrag);
    }
  }
  return { saldo_cents: saldo, basis: "anker+buchungen", anker };
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

  for (const konto of liquiditaetsKonten(data.konten)) {
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

  const start = monatsStart(today);
  const startSaldo = [...gueltigeKontoIds].reduce((sum, kontoId) => {
    const konto = (data.konten ?? []).find((k) => k.konto_id === kontoId);
    return sum + (kontoSaldoZuDatum(konto, data.zeitwerte, data.transaktionen, addInterval(start, "tag", -1)).saldo_cents ?? 0);
  }, 0);
  const bewegungen = tagesbewegungenFuerMonat(data, today, gueltigeKontoIds);
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
// Sprung erklaeren (grosseBuchungen), und der Grundtrend: der Saldo, als haette
// es die grossen Buchungen nach dem ersten Monatsende nicht gegeben. Er beginnt
// mit dem Saldo und zeigt, was der laufende Alltag zuruecklegt oder verbraucht.
export function liquiditaetVerlauf(data, today, monate = 12) {
  const konten = liquiditaetsKonten(data.konten);
  const erster = addInterval(`${today.slice(0, 7)}-01`, "monat", -(monate - 1));
  const grosse = grosseBuchungen(data, erster, today);
  const punkte = [];
  for (let i = monate - 1; i >= 0; i--) {
    const monat = addInterval(`${today.slice(0, 7)}-01`, "monat", -i).slice(0, 7);
    const datum = i === 0 ? today : addInterval(addInterval(`${monat}-01`, "monat", 1), "tag", -1);
    const saldo = konten.reduce((a, k) => a + (kontoSaldoZuDatum(k, data.zeitwerte, data.transaktionen, datum).saldo_cents ?? 0), 0);
    punkte.push({ monat, datum, saldo_cents: saldo, grosse: grosse.filter((g) => g.monat === monat) });
  }
  const basis = punkte[0]?.datum;
  for (const p of punkte) {
    const sonder = grosse.filter((g) => g.datum > basis && g.datum <= p.datum).reduce((a, g) => a + g.betrag_cents, 0);
    p.grundtrend_cents = p.saldo_cents - sonder;
  }
  return punkte;
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
  const liquide = new Set(liquiditaetsKonten(data.konten).map((k) => k.konto_id));
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

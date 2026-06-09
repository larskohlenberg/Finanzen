// app/liquiditaet.mjs
// Reine, deterministische Liquiditaets-Mathematik. Kein DOM, keine Node-Abhaengigkeiten.
// Eine getestete Funktion an zwei Aufrufstellen: Browser (app/main.js) und Node (tests/).
// Modell-Begruendung: Liquiditaet = belegter Konto-Anker + Ist-Buchungen + Regelzahlungs-Fortschreibung.

export function toCents(decimalString) {
  const sign = decimalString.startsWith("-") ? -1 : 1;
  const unsigned = decimalString.replace("-", "");
  const [euros, cents] = unsigned.split(".");
  return sign * (Number(euros) * 100 + Number(cents));
}

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

export function defaultHorizonEnd(regelzahlungen, today, fallbackMonate = 12) {
  let max = null;
  for (const rz of regelzahlungen ?? []) {
    if (rz.status !== "bestaetigt") continue;
    if (rz.aktiv_bis && (max === null || rz.aktiv_bis > max)) max = rz.aktiv_bis;
  }
  const fallback = addInterval(today, "monat", fallbackMonate);
  if (max === null) return fallback;
  return max > fallback ? max : fallback;
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

  let saldo = toCents(anker.wert);
  for (const tx of transaktionen ?? []) {
    if (tx.konto_id !== konto.konto_id) continue;
    if (tx.buchungsdatum <= anker.standdatum) continue;
    if (tx.buchungsdatum > bisDatum) continue;
    saldo += toCents(tx.betrag);
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

export function computeLiquiditaetPrognose(data, { today, horizonEnd }) {
  const ende = horizonEnd ?? defaultHorizonEnd(data.regelzahlungen, today);
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

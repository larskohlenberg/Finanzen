// app/cashflow.mjs
// Reine, deterministische Cashflow-Mathematik. Kein DOM, keine Node-Abhaengigkeiten.
// Eine getestete Funktion an zwei Aufrufstellen: Browser (app/main.js) und Node (tests/).
// Liegt unter app/, weil der Webserver nur das App-Verzeichnis ausliefert (ADR 0009/0012).

export function toCents(decimalString) {
  const sign = decimalString.startsWith("-") ? -1 : 1;
  const unsigned = decimalString.replace("-", "");
  const [euros, cents] = unsigned.split(".");
  return sign * (Number(euros) * 100 + Number(cents));
}

export function monatVon(isoDate) {
  return isoDate.slice(0, 7);
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
  for (const rz of regelzahlungen) {
    if (rz.status !== "bestaetigt") continue;
    if (rz.aktiv_bis && (max === null || rz.aktiv_bis > max)) max = rz.aktiv_bis;
  }
  const fallback = addInterval(today, "monat", fallbackMonate);
  if (max === null) return fallback;
  return max > fallback ? max : fallback;
}

export function computeCashflowPrognose(regelzahlungen, { today, horizonEnd }) {
  const ende = horizonEnd ?? defaultHorizonEnd(regelzahlungen, today);
  const monate = new Map();
  let bestaetigt = 0;
  let vorschlaege = 0;
  let unbefristet = 0;
  for (const rz of regelzahlungen) {
    if (rz.status === "vorgeschlagen") { vorschlaege++; continue; }
    if (rz.status !== "bestaetigt") continue;
    bestaetigt++;
    if (!rz.aktiv_bis) unbefristet++;
    const betrag = toCents(rz.betrag);
    for (const datum of occurrences(rz, today, ende)) {
      const monat = monatVon(datum);
      monate.set(monat, (monate.get(monat) ?? 0) + betrag);
    }
  }
  const monatsListe = [...monate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monat, netto_cents]) => ({ monat, netto_cents }));
  return {
    monate: monatsListe,
    gesamt_netto_cents: monatsListe.reduce((s, m) => s + m.netto_cents, 0),
    horizont_ende: ende,
    qualitaet: {
      bestaetigte_regelzahlungen: bestaetigt,
      vorschlaege_nicht_enthalten: vorschlaege,
      unbefristete_regelzahlungen: unbefristet,
      einmaleffekte_enthalten: false,
    },
  };
}

export function computeCashflowIst(transaktionen, { today }) {
  const monate = new Map();
  let gesamt = 0;
  let offen = 0;
  for (const tx of transaktionen) {
    if (tx.ist_transfer === true) continue;
    if (tx.buchungsdatum > today) continue;
    gesamt++;
    if (tx.kategorisierung_status !== "bestaetigt") offen++;
    const monat = monatVon(tx.buchungsdatum);
    monate.set(monat, (monate.get(monat) ?? 0) + toCents(tx.betrag));
  }
  const monatsListe = [...monate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monat, netto_cents]) => ({ monat, netto_cents }));
  return {
    monate: monatsListe,
    gesamt_netto_cents: monatsListe.reduce((s, m) => s + m.netto_cents, 0),
    qualitaet: { gesamt_anzahl: gesamt, offene_kategorie_anzahl: offen },
  };
}

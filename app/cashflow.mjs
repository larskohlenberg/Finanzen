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
  let cur = regelzahlung.anker_datum;
  let guard = 0;
  while (cur <= ende && guard < 100000) {
    if (cur > today) dates.push(cur);
    cur = addInterval(cur, regelzahlung.rhythmus_einheit, regelzahlung.rhythmus_intervall);
    guard++;
  }
  return dates;
}

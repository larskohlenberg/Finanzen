// app/rhythmus.mjs
// Rhythmus wiederkehrender Termine (Regelzahlungen, Darlehensraten, Fristen)
// an einer Stelle (Review Welle 2, 2.3): Datumsarithmetik mit Monatsend-
// Klemmung, eine Termin-Expansion, eine Perioden/Jahr-Tabelle und der Zins je
// Periode in Ganzzahlen. Rein, ohne Abhaengigkeiten.
//
// Kalendertermine und Perioden pro Jahr sind verschiedene Dinge: Termine
// entstehen kalendarisch (Anker + k x Intervall, Monatsende geklemmt), Betraege
// je Jahr/Monat und der Zins je Rate rechnen mit der nominellen Zahl der
// Perioden (Monat 12, Woche 52, Tag 365, Jahr 1), nicht mit Kalendertagen.

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

export const PERIODEN_PRO_JAHR = Object.freeze({ tag: 365, woche: 52, monat: 12, jahr: 1 });

const perioden = (einheit) => PERIODEN_PRO_JAHR[einheit ?? "monat"] ?? 12;
const intervallVon = (intervall) => Number(intervall) || 1;

// Termin Nummer k (auch negativ) ab dem Anker.
export function termin(anker, einheit, intervall, k) {
  return addInterval(anker, einheit, intervallVon(intervall) * k);
}

// Termine ab `anker` im Rhythmus, aufsteigend:
// - nach: nur Termine strikt danach; von: nur ab einschliesslich
// - bis: Obergrenze (inklusive); ende: Ende der Gueltigkeit (aktiv_bis, inklusive)
// - vorAnker: auch Termine vor dem Anker (rueckwaerts bis `von`), etwa wenn der
//   Anker die juengste Buchung ist und die Zahlung schon vorher lief.
export function termine(anker, einheit, intervall, { nach = null, von = null, bis, ende = null, vorAnker = false } = {}) {
  const grenze = ende && ende < bis ? ende : bis;
  const passt = (d) => (!nach || d > nach) && (!von || d >= von);
  const liste = [];
  for (let k = 0, d = anker; d <= grenze && k < 100000; d = termin(anker, einheit, intervall, ++k)) if (passt(d)) liste.push(d);
  if (vorAnker && (von || nach)) {
    const unten = von ?? nach;
    for (let k = -1, d = termin(anker, einheit, intervall, -1); d >= unten && k > -100000; d = termin(anker, einheit, intervall, --k)) if (passt(d) && d <= grenze) liste.unshift(d);
  }
  return liste;
}

// Naechster Termin strikt nach `nach`; null, wenn die Gueltigkeit vorher endet.
export function naechsterTermin(anker, einheit, intervall, nach, ende = null) {
  for (let k = 0, d = anker; k < 100000; d = termin(anker, einheit, intervall, ++k)) {
    if (ende && d > ende) return null;
    if (d > nach) return d;
  }
  return null;
}

// Betrag je Rate auf Jahr bzw. Monat umgelegt (nominelle Perioden), in Cent.
export function betragJeJahrCents(cents, einheit, intervall) {
  return Math.round((cents * perioden(einheit)) / intervallVon(intervall));
}
export function betragJeMonatCents(cents, einheit, intervall) {
  return Math.round((cents * perioden(einheit)) / (12 * intervallVon(intervall)));
}

// Zinssatz "2.15" (% p. a., bis vier Nachkommastellen) als Ganzzahl in
// Zehntausendstel Prozent.
function satzE4(zinssatz) {
  const text = String(zinssatz ?? "0").trim();
  const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(text);
  if (!m) throw new Error(`Zinssatz nicht lesbar: ${zinssatz}`);
  return BigInt(m[1]) * 10000n + BigInt((m[2] ?? "").padEnd(4, "0"));
}

// Zins je Rate in Cent: Rest x Satz / Perioden pro Jahr, exakt in Ganzzahlen
// (BigInt) und kaufmaennisch gerundet: ab einem halben Cent vom Betrag weg
// (24,5 Cent -> 25, -24,5 -> -25). Die Periode ist die nominelle des
// Zahlungsrhythmus (Monat 1/12 Jahr), nicht die Zahl der Kalendertage.
export function zinsJePeriodeCents(restCents, zinssatz, einheit, intervall) {
  const zaehler = BigInt(restCents) * satzE4(zinssatz) * BigInt(intervallVon(intervall));
  const nenner = 100n * 10000n * BigInt(perioden(einheit));
  const negativ = zaehler < 0n;
  const betrag = negativ ? -zaehler : zaehler;
  let q = betrag / nenner;
  if ((betrag % nenner) * 2n >= nenner) q += 1n;
  return Number(negativ ? -q : q);
}

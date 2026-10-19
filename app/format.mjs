// app/format.mjs
// Gemeinsame Formatierung der Oberflaeche: Geld, Prozent, Zahl, Datum, Monat,
// Platzhalter in Texten und das eine escapeHtml. Rein, ohne Zustand; die
// Sprache kommt als Argument. Je Sprache werden die Intl-Formatierer einmal
// angelegt (formatierer(lang)).
//
// Regel (docs/ui-regeln.md): Kacheln und Achsen zeigen gerundete Euro
// (geldGanz), Tabellen und Details den exakten Betrag mit Cent (geld).

export const LOCALE = { de: "de-DE", en: "en-GB" };

// Kalenderdaten sind "YYYY-MM-DD" bzw. "YYYY-MM" ohne Uhrzeit. In UTC lesen
// und ausgeben, damit keine Zeitzone den Tag verschiebt.
function alsDatum(iso) {
  const [jahr, monat = 1, tag = 1] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(jahr, monat - 1, tag));
}

function baue(locale, lang) {
  const zahlen = new Map();
  const zahlFormat = (optionen) => {
    const schluessel = JSON.stringify(optionen);
    if (!zahlen.has(schluessel)) zahlen.set(schluessel, new Intl.NumberFormat(locale, optionen));
    return zahlen.get(schluessel);
  };
  const datumFormat = (optionen) => new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...optionen });
  const euro = { style: "currency", currency: "EUR" };
  const formate = {
    datum: datumFormat({}),
    datumMittel: datumFormat({ dateStyle: "medium" }),
    monat: datumFormat({ month: "long", year: "numeric" }),
    monatKurz: datumFormat({ month: "short" }),
    monatJahrKurz: datumFormat({ month: "short", year: "numeric" }),
    tagMonat: datumFormat({ day: "numeric", month: "numeric" }),
    jahr: datumFormat({ year: "numeric" }),
    zeitpunkt: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    zeitpunktTag: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
  };
  const zeitpunktMit = (format, wert) => {
    if (!wert) return "";
    const datum = wert instanceof Date ? wert : new Date(wert);
    return Number.isNaN(datum.getTime()) ? "" : format.format(datum);
  };
  const kalender = (format) => (iso) => (iso ? format.format(alsDatum(iso)) : "");
  const leer = (wert) => wert === null || wert === undefined || Number.isNaN(wert);
  return {
    lang,
    locale,
    // Betrag in Cent, exakt mit Cent ("1.234,56 €").
    geld: (cents) => zahlFormat(euro).format(cents / 100),
    // Betrag in Cent, auf ganze Euro gerundet ("1.235 €").
    geldGanz: (cents) => zahlFormat({ ...euro, maximumFractionDigits: 0 }).format(cents / 100),
    geldMitVorzeichen: (cents) => zahlFormat({ ...euro, maximumFractionDigits: 0, signDisplay: "exceptZero" }).format(cents / 100),
    // Anteil 0..1 als Prozent; null wird zum Gedankenstrich.
    prozent: (anteil, stellen = 0) => (leer(anteil) ? "–"
      : zahlFormat({ style: "percent", maximumFractionDigits: stellen, minimumFractionDigits: stellen }).format(anteil)),
    prozentMitVorzeichen: (anteil, stellen = 0) => (leer(anteil) ? "–"
      : zahlFormat({ style: "percent", maximumFractionDigits: stellen, signDisplay: "exceptZero" }).format(anteil)),
    zahl: (wert, stellen = 0) => zahlFormat({ maximumFractionDigits: stellen }).format(wert),
    zahlMitVorzeichen: (wert, stellen = 0) => zahlFormat({ maximumFractionDigits: stellen, signDisplay: "exceptZero" }).format(wert),
    // Kompakte Achsen- und Kachelangabe in Tausend Euro ("12,3 T€").
    tausend: (cents) => `${zahlFormat({ maximumFractionDigits: 1 }).format(cents / 100000)} ${lang === "en" ? "k€" : "T€"}`,
    datum: kalender(formate.datum),
    datumMittel: kalender(formate.datumMittel),
    monat: kalender(formate.monat),
    monatKurz: kalender(formate.monatKurz),
    monatJahrKurz: kalender(formate.monatJahrKurz),
    tagMonat: kalender(formate.tagMonat),
    jahr: kalender(formate.jahr),
    // Zeitpunkt (Date oder ISO mit Uhrzeit) in Ortszeit, z. B. Upload-Zeit;
    // ungueltige Angaben ergeben "".
    zeitpunkt: (wert) => zeitpunktMit(formate.zeitpunkt, wert),
    zeitpunktTag: (wert) => zeitpunktMit(formate.zeitpunktTag, wert),
    // Dateigroesse lesbar ("512 B", "2 KB", "4,8 MB").
    groesse: (bytes) => (bytes < 1024 ? `${bytes} B`
      : bytes < 1024 * 1024 ? `${zahlFormat({ maximumFractionDigits: 0 }).format(bytes / 1024)} KB`
        : `${zahlFormat({ maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`),
  };
}

const cache = new Map();
// "de-DE"/"en-GB"/"en-US" oder "de"/"en" auf die Sprache der App abbilden.
export function spracheAus(localeOderLang) {
  return String(localeOderLang ?? "").toLowerCase().startsWith("en") ? "en" : "de";
}

export function formatierer(lang) {
  const sprache = LOCALE[lang] ? lang : "de";
  if (!cache.has(sprache)) cache.set(sprache, baue(LOCALE[sprache], sprache));
  return cache.get(sprache);
}

// Benannte Platzhalter "{name}" in einem Text ersetzen; unbekannte bleiben stehen.
export function fuelle(text, werte = {}) {
  return String(text).replace(/\{(\w+)\}/g, (ganz, name) => (Object.hasOwn(werte, name) ? String(werte[name]) : ganz));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

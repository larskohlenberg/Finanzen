// app/tools/lib/text.mjs
export function normalizeWhitespace(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeLoose(value) {
  return normalizeWhitespace(value).toLowerCase();
}

// Einzige toCents-Implementierung im Projekt (CONTEXT: Cent-Integer-Philosophie).
// Browser-Module importieren sie ueber app/liquiditaet.mjs, Tools direkt.
export function toCents(decimalString) {
  const raw = String(decimalString ?? "").trim();
  if (raw === "") return 0;
  const sign = raw.startsWith("-") ? -1 : 1;
  const [euros = "0", frac = ""] = raw.replace("-", "").split(".");
  return sign * (Number(euros) * 100 + Number((frac + "00").slice(0, 2)));
}

// Striktes Betragsformat fuer Validator und Import-Eingang: genau zwei
// Nachkommastellen, keine fuehrenden Nullen (ausser "0"), kein "-0.00".
// Bewusst strenger als toCents (das nachsichtig konvertiert): an der Daten-
// grenze gilt "Luecke zeigen statt raten" — ein leerer/krummer Betrag ist ein
// Fehler, nie still 0,00 EUR.
const STRIKTER_BETRAG = /^-?(0|[1-9]\d*)\.\d{2}$/;
export function istGueltigerBetrag(value) {
  return typeof value === "string" && STRIKTER_BETRAG.test(value) && value !== "-0.00";
}

export function centsToDecimal(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

// Reine Darstellung: IBANs in 4er-Bloecken (DE98 1203 ...). Gespeichert wird
// immer die ungruppierte Form. Nicht-IBANs (z. B. Depotnummern) unveraendert.
export function formatIban(value) {
  const raw = String(value ?? "").trim();
  const compact = raw.replace(/\s+/g, "");
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(compact)) return raw;
  return compact.replace(/(.{4})/g, "$1 ").trim();
}

// Lokale Freitextsuche: jeder whitespace-getrennte Suchbegriff muss in der
// normalisierten Verkettung der Felder vorkommen (UND-Logik, case-insensitiv).
export function matchesQuery(felder, query) {
  const q = normalizeLoose(query);
  if (!q) return true;
  const heuhaufen = (felder ?? []).map((feld) => normalizeLoose(feld)).join(" ");
  return q.split(" ").every((term) => heuhaufen.includes(term));
}

export function dayDiff(dateA, dateB) {
  const a = Date.parse(`${dateA}T00:00:00Z`);
  const b = Date.parse(`${dateB}T00:00:00Z`);
  return Math.round((a - b) / 86400000);
}

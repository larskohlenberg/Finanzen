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

export function centsToDecimal(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function dayDiff(dateA, dateB) {
  const a = Date.parse(`${dateA}T00:00:00Z`);
  const b = Date.parse(`${dateB}T00:00:00Z`);
  return Math.round((a - b) / 86400000);
}

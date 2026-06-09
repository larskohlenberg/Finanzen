// app/tools/lib/text.mjs
export function normalizeWhitespace(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeLoose(value) {
  return normalizeWhitespace(value).toLowerCase();
}

export function toCents(decimalString) {
  const sign = decimalString.startsWith("-") ? -1 : 1;
  const unsigned = decimalString.replace("-", "");
  const [euros, cents] = unsigned.split(".");
  return sign * (Number(euros) * 100 + Number(cents));
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

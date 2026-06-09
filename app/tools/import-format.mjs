// app/tools/import-format.mjs
const betragPattern = /^-?\d+\.\d{2}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value) {
  if (typeof value !== "string" || !datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validateImportEntry(entry, kontenIds) {
  const errors = [];

  if (typeof entry.konto_id !== "string") {
    errors.push("konto_id: Pflichtfeld fehlt");
  } else if (!kontenIds.has(entry.konto_id)) {
    errors.push(`konto_id: ${entry.konto_id} unbekannt`);
  }

  if (!isIsoDate(entry.buchungsdatum)) {
    errors.push("buchungsdatum: muss ISO-Datum YYYY-MM-DD sein");
  }

  if (typeof entry.betrag !== "string") {
    errors.push("betrag: Pflichtfeld fehlt");
  } else if (!betragPattern.test(entry.betrag)) {
    errors.push("betrag: Format ungueltig (erwartet -?\\d+.\\d{2})");
  }

  if (typeof entry.gegenpartei !== "string") errors.push("gegenpartei: muss string sein");
  if (typeof entry.verwendungszweck !== "string") errors.push("verwendungszweck: muss string sein");

  if (typeof entry.rohquelle !== "string" || entry.rohquelle.trim().length === 0) {
    errors.push("rohquelle: Pflichtfeld fehlt");
  }

  if (Object.hasOwn(entry, "bank_referenz") && typeof entry.bank_referenz !== "string") {
    errors.push("bank_referenz: muss string sein");
  }

  return errors;
}

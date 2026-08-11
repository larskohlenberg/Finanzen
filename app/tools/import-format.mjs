// app/tools/import-format.mjs
import { istGueltigerBetrag } from "./lib/text.mjs";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const regelzahlungPattern = /^RZ-\d{3}$/;
const optionalStringFields = [
  "bank_referenz",
  "transaktionstyp",
  "kundenreferenz",
  "empfaenger",
  "empfaenger_iban",
  "mandatsreferenz",
  "glaeubiger_id",
];

function isIsoDate(value) {
  if (typeof value !== "string" || !datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validateImportEntry(entry, kontenIds, regelzahlungIds = new Set()) {
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
  } else if (!istGueltigerBetrag(entry.betrag)) {
    errors.push("betrag: kein gueltiger Betrag (zwei Nachkommastellen, keine fuehrenden Nullen, kein -0.00)");
  }

  if (typeof entry.gegenpartei !== "string") errors.push("gegenpartei: muss string sein");
  if (typeof entry.verwendungszweck !== "string") errors.push("verwendungszweck: muss string sein");

  if (typeof entry.rohquelle !== "string" || entry.rohquelle.trim().length === 0) {
    errors.push("rohquelle: Pflichtfeld fehlt");
  }

  if (Object.hasOwn(entry, "wertstellungsdatum") && !isIsoDate(entry.wertstellungsdatum)) {
    errors.push("wertstellungsdatum: muss ISO-Datum YYYY-MM-DD sein");
  }

  for (const field of optionalStringFields) {
    if (Object.hasOwn(entry, field) && typeof entry[field] !== "string") {
      errors.push(`${field}: muss string sein`);
    }
  }

  if (Object.hasOwn(entry, "regelzahlung_id")) {
    if (typeof entry.regelzahlung_id !== "string" || !regelzahlungPattern.test(entry.regelzahlung_id)) {
      errors.push("regelzahlung_id: Format ungueltig");
    } else if (!regelzahlungIds.has(entry.regelzahlung_id)) {
      errors.push(`regelzahlung_id: ${entry.regelzahlung_id} unbekannt`);
    }
  }

  return errors;
}

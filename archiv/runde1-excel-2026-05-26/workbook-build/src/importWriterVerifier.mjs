import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

export const allowedSections = [
  "sourceRow",
  "importRun",
  "rawTransactions",
  "modelTransactions",
  "warnings",
  "checks",
  "questions",
];

export const tableColumns = {
  "90_Quellen": [
    "Quelle_ID",
    "Quellenart",
    "Eltern_Quelle_ID",
    "Eingangskanal",
    "Originaldateiname",
    "Dateiname_Modell",
    "Dateipfad",
    "Dateihash",
    "Belegtyp",
    "Quelle_Anbieter",
    "Belegdatum",
    "Standdatum",
    "Abrufdatum",
    "Wertname",
    "Wert",
    "Einheit",
    "Zeitraum",
    "Zeitraum_von",
    "Zeitraum_bis",
    "Seite_Abschnitt",
    "Zielblatt",
    "Ziel_ID",
    "Person_ID",
    "Objekt_ID",
    "Szenario_Relevanz",
    "Status",
    "Unsicherheit",
    "Kommentar",
    "Geprueft_am",
  ],
  "10_Importlaeufe": [
    "Import_ID",
    "Importdatei",
    "Quellkonto_ID",
    "Quelle_ID",
    "Zeitraum_von",
    "Zeitraum_bis",
    "Kontostand_Export",
    "Kontostand_Datum",
    "Importdatum",
    "Zeilen_gesamt",
    "Zeilen_importiert",
    "Duplikate",
    "Parse_Fehler",
    "Status",
    "Lauf_ID",
    "Kommentar",
  ],
  "10_Umsaetze_Roh": [
    "Rohumsatz_ID",
    "Import_ID",
    "Quellkonto_ID",
    "Importdatei",
    "Importdatum",
    "Zeilennummer_Import",
    "Zeilenhash",
    "Duplikat_Status",
    "Parse_Status",
    "Parse_Hinweis",
    "Buchungsdatum",
    "Wertstellung",
    "Status_Bank",
    "Zahlungspflichtiger",
    "Zahlungsempfaenger",
    "Verwendungszweck",
    "Umsatztyp",
    "IBAN",
    "Betrag",
    "Glaeubiger_ID",
    "Mandatsreferenz",
    "Kundenreferenz",
  ],
  "11_Umsaetze_Modell": [
    "Transaktion_ID",
    "Rohumsatz_ID",
    "Konto_ID",
    "Zielkonto_ID",
    "Kategorie_ID",
    "Person_ID",
    "Regel_ID",
    "Regel_Match_Status",
    "Regel_Match_Hinweis",
    "Erwartetes_Zahldatum",
    "Betragsabweichung",
    "Tage_Abweichung",
    "Betrag",
    "Buchungsmonat",
    "Cashflow_Wirkung",
    "Szenario_Wirkung",
    "Ist_Transfer",
    "Transfer_Status",
    "Transfer_Typ",
    "Gegenbuchung_Transaktion_ID",
    "Transfer_Regel_ID",
    "Lebenshaltung_Relevant",
    "Transfer_Pruefhinweis",
    "Status",
    "Kommentar",
  ],
  "60_Warnungen_Aktuell": [
    "Warnungs_ID",
    "Warnungs_Fingerprint",
    "Check_ID",
    "Schweregrad",
    "Titel",
    "Betroffene_Tabelle",
    "Betroffene_ID",
    "Status",
    "Naechste_Aktion",
    "Kommentar",
  ],
  "99_Checks": [
    "Check_ID",
    "Checkgruppe",
    "Beschreibung",
    "Schweregrad",
    "Status",
    "Betroffene_Quelle_ID",
    "Betroffene_Annahme_ID",
    "Betroffener_Import_ID",
    "Betroffener_Kontrollspur_ID",
    "Betroffene_Tabelle",
    "Betroffene_ID",
    "Ausloeser",
    "Naechste_Aktion",
    "Kommentar",
  ],
};

export const sectionToTable = {
  sourceRow: "90_Quellen",
  importRun: "10_Importlaeufe",
  rawTransactions: "10_Umsaetze_Roh",
  modelTransactions: "11_Umsaetze_Modell",
  warnings: "60_Warnungen_Aktuell",
  checks: "99_Checks",
};

export const targetTableLayouts = {
  "90_Quellen": { sheetName: "90_Quellen", dataStartRow: 7, scanEndRow: 10000 },
  "10_Importlaeufe": { sheetName: "10_Umsaetze_Roh", dataStartRow: 7, scanEndRow: 10000 },
  "10_Umsaetze_Roh": { sheetName: "10_Umsaetze_Roh", dataStartRow: 13, scanEndRow: 10000 },
  "11_Umsaetze_Modell": { sheetName: "11_Umsaetze_Modell", dataStartRow: 13, scanEndRow: 10000 },
  "60_Warnungen_Aktuell": { sheetName: "60_Warnungen", dataStartRow: 7, scanEndRow: 10000 },
  "99_Checks": { sheetName: "99_Checks", dataStartRow: 7, scanEndRow: 10000 },
};

const idFields = {
  sourceRow: "Quelle_ID",
  importRun: "Import_ID",
  rawTransactions: "Rohumsatz_ID",
  modelTransactions: "Transaktion_ID",
  warnings: "Warnungs_ID",
  checks: "Check_ID",
};

function rowsForSection(proposal, section) {
  if (section === "sourceRow" || section === "importRun") return [proposal[section]];
  if (section === "questions") return [];
  return proposal[section] ?? [];
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateRowFields({ section, tableName, row, rowIndex, errors }) {
  if (!isRecord(row)) {
    errors.push(`${section}[${rowIndex}] must be an object`);
    return;
  }

  const allowed = new Set(tableColumns[tableName]);
  for (const field of Object.keys(row)) {
    if (!allowed.has(field)) errors.push(`${tableName} row ${rowIndex} has unknown field: ${field}`);
  }

  const idField = idFields[section];
  if (idField && !row[idField]) errors.push(`${tableName} row ${rowIndex} missing required ID: ${idField}`);
}

export function validateImportProposal(proposal) {
  const errors = [];
  const warnings = [];

  if (!isRecord(proposal)) {
    return { valid: false, errors: ["proposal must be an object"], warnings };
  }

  const allowed = new Set(allowedSections);
  for (const section of allowedSections) {
    if (!(section in proposal)) errors.push(`missing section: ${section}`);
  }
  for (const section of Object.keys(proposal)) {
    if (!allowed.has(section)) errors.push(`unknown section: ${section}`);
  }

  if ("questions" in proposal && !Array.isArray(proposal.questions)) {
    errors.push("questions must be an array");
  }

  for (const [section, tableName] of Object.entries(sectionToTable)) {
    if (!(section in proposal)) continue;
    const rows = rowsForSection(proposal, section);
    if (section !== "sourceRow" && section !== "importRun" && !Array.isArray(proposal[section])) {
      errors.push(`${section} must be an array`);
      continue;
    }
    rows.forEach((row, index) => validateRowFields({ section, tableName, row, rowIndex: index, errors }));
  }

  return { valid: errors.length === 0, errors, warnings };
}

function colName(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function isDateColumn(columnName) {
  const key = columnName.toLowerCase();
  return key.includes("datum") || key.includes("_am") || key.includes("_von") || key.includes("_bis") || key === "wertstellung";
}

function normalizeCellValue(value, columnName) {
  if (value === undefined || value === "") return null;
  if (typeof value === "string" && isDateColumn(columnName) && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }
  return value;
}

function matrixForRows(tableName, rows) {
  const columns = tableColumns[tableName];
  return rows.map((row) => columns.map((column) => normalizeCellValue(row[column], column)));
}

function findAppendRow(sheet, layout) {
  const values = sheet.getRange(`A${layout.dataStartRow}:A${layout.scanEndRow}`).values;
  let lastUsed = layout.dataStartRow - 1;
  values.forEach((row, index) => {
    const value = row[0];
    if (value !== null && value !== undefined && value !== "") {
      lastUsed = layout.dataStartRow + index;
    }
  });
  return lastUsed + 1;
}

function appendRows(workbook, tableName, rows) {
  if (rows.length === 0) return 0;
  const layout = targetTableLayouts[tableName];
  const sheet = workbook.worksheets.getItem(layout.sheetName);
  const appendRow = findAppendRow(sheet, layout);
  const columns = tableColumns[tableName];
  const endCol = colName(columns.length);
  const endRow = appendRow + rows.length - 1;
  sheet.getRange(`A${appendRow}:${endCol}${endRow}`).values = matrixForRows(tableName, rows);
  return rows.length;
}

export async function applyImportProposal({ workbookPath, outputPath, proposal }) {
  const validation = validateImportProposal(proposal);
  if (!validation.valid) {
    return {
      validation,
      appended: {},
      outputPath: null,
    };
  }

  const input = await FileBlob.load(workbookPath);
  const workbook = await SpreadsheetFile.importXlsx(input);

  const appended = {};
  for (const [section, tableName] of Object.entries(sectionToTable)) {
    const count = appendRows(workbook, tableName, rowsForSection(proposal, section));
    appended[tableName] = count;
  }

  workbook.recalculate();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  return {
    validation,
    appended,
    outputPath,
  };
}

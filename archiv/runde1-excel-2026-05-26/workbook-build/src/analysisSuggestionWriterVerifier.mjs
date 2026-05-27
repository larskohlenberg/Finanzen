import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

export const analysisSuggestionColumns = {
  "12_Regelzahlung_Vorschlaege": [
    "Vorschlag_ID",
    "Erkannt_am",
    "Lauf_ID",
    "Vorgeschlagener_Name",
    "Vorgeschlagene_Frequenz",
    "Treffer_Anzahl",
    "Erstes_Datum",
    "Letztes_Datum",
    "Median_Betrag",
    "Betrag_Min",
    "Betrag_Max",
    "Betrag_Variabilitaet",
    "Typ",
    "Kategorie_ID_Vorschlag",
    "Person_ID_Vorschlag",
    "Konto_ID",
    "Gegenpartei_Muster",
    "IBAN_Muster",
    "Verwendungszweck_Muster",
    "Konfidenz",
    "Status",
    "Erkennungs_Hinweis",
    "Kommentar",
  ],
  "73_Agent_Vorschlaege": [
    "Vorschlag_ID",
    "Vorschlag_Fingerprint",
    "Lauf_ID",
    "Methodik_ID",
    "Vorschlagstyp",
    "Betroffene_Tabelle",
    "Betroffene_ID",
    "Empfohlene_Aktion",
    "Begruendung",
    "Konfidenz",
    "Prioritaet",
    "Status",
    "Umsetzung_Eindeutig",
    "Umsetzungsstatus",
    "Kommentar",
  ],
};

export const analysisSuggestionLayouts = {
  "12_Regelzahlung_Vorschlaege": {
    sheetName: "12_Regelzahlungen",
    dataStartRow: 13,
    scanEndRow: 10000,
  },
  "73_Agent_Vorschlaege": {
    sheetName: "73_Agent_Vorschlaege",
    dataStartRow: 7,
    scanEndRow: 10000,
  },
};

const sectionToTable = {
  regularPaymentSuggestions: "12_Regelzahlung_Vorschlaege",
  agentSuggestions: "73_Agent_Vorschlaege",
};

function colName(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDateColumn(columnName) {
  const key = columnName.toLowerCase();
  return key.includes("datum") || key.includes("_am") || key.includes("erstes_datum") || key.includes("letztes_datum");
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
  const columns = analysisSuggestionColumns[tableName];
  return rows.map((row) => columns.map((column) => normalizeCellValue(row[column], column)));
}

function rowsForSection(suggestions, section) {
  return suggestions[section] ?? [];
}

function validateRows({ tableName, section, rows, errors }) {
  if (!Array.isArray(rows)) {
    errors.push(`${section} must be an array`);
    return;
  }
  const allowed = new Set(analysisSuggestionColumns[tableName]);
  rows.forEach((row, rowIndex) => {
    if (!isRecord(row)) {
      errors.push(`${section}[${rowIndex}] must be an object`);
      return;
    }
    for (const field of Object.keys(row)) {
      if (!allowed.has(field)) errors.push(`${tableName} row ${rowIndex} has unknown field: ${field}`);
    }
    if (!row.Vorschlag_ID) errors.push(`${tableName} row ${rowIndex} missing required ID: Vorschlag_ID`);
  });
}

export function validateAnalysisSuggestions(suggestions) {
  const errors = [];
  const warnings = [];

  if (!isRecord(suggestions)) {
    return { valid: false, errors: ["suggestions must be an object"], warnings };
  }

  for (const section of Object.keys(sectionToTable)) {
    if (!(section in suggestions)) errors.push(`missing section: ${section}`);
  }
  const allowedSections = new Set(Object.keys(sectionToTable));
  for (const section of Object.keys(suggestions)) {
    if (!allowedSections.has(section) && section !== "summary") errors.push(`unknown section: ${section}`);
  }

  for (const [section, tableName] of Object.entries(sectionToTable)) {
    if (!(section in suggestions)) continue;
    validateRows({ tableName, section, rows: rowsForSection(suggestions, section), errors });
  }

  const regularIds = new Set((suggestions.regularPaymentSuggestions ?? []).map((row) => row.Vorschlag_ID));
  const mirroredIds = new Set(
    (suggestions.agentSuggestions ?? [])
      .filter((row) => row.Betroffene_Tabelle === "12_Regelzahlung_Vorschlaege")
      .map((row) => row.Vorschlag_ID),
  );
  for (const id of regularIds) {
    if (!mirroredIds.has(id)) warnings.push(`regular payment suggestion is not mirrored in 73_Agent_Vorschlaege: ${id}`);
  }

  return { valid: errors.length === 0, errors, warnings };
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
  const layout = analysisSuggestionLayouts[tableName];
  const sheet = workbook.worksheets.getItem(layout.sheetName);
  const appendRow = findAppendRow(sheet, layout);
  const columns = analysisSuggestionColumns[tableName];
  const endCol = colName(columns.length);
  const endRow = appendRow + rows.length - 1;
  sheet.getRange(`A${appendRow}:${endCol}${endRow}`).values = matrixForRows(tableName, rows);
  return rows.length;
}

export async function applyAnalysisSuggestions({ workbookPath, outputPath, suggestions }) {
  const validation = validateAnalysisSuggestions(suggestions);
  if (!validation.valid) {
    return { validation, appended: {}, outputPath: null };
  }

  const input = await FileBlob.load(workbookPath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const appended = {};
  for (const [section, tableName] of Object.entries(sectionToTable)) {
    appended[tableName] = appendRows(workbook, tableName, rowsForSection(suggestions, section));
  }

  workbook.recalculate();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  return { validation, appended, outputPath };
}

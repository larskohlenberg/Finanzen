import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { tableColumns, targetTableLayouts } from "./importWriterVerifier.mjs";

const primaryKeyByTable = {
  "90_Quellen": "Quelle_ID",
  "10_Importlaeufe": "Import_ID",
  "10_Umsaetze_Roh": "Rohumsatz_ID",
  "11_Umsaetze_Modell": "Transaktion_ID",
  "60_Warnungen_Aktuell": "Warnungs_ID",
  "99_Checks": "Check_ID",
};

const promotionTables = [
  "90_Quellen",
  "10_Importlaeufe",
  "10_Umsaetze_Roh",
  "11_Umsaetze_Modell",
  "60_Warnungen_Aktuell",
  "99_Checks",
];

const layoutOverrides = {
  "10_Importlaeufe": { sheetName: "10_Umsaetze_Roh", dataStartRow: 7, scanEndRow: 10 },
};

function layoutFor(tableName) {
  return layoutOverrides[tableName] ?? targetTableLayouts[tableName];
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

async function importWorkbook(filePath) {
  const input = await FileBlob.load(filePath);
  return SpreadsheetFile.importXlsx(input);
}

function normalizeId(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function readHeader(workbook, tableName) {
  const layout = layoutFor(tableName);
  const sheet = workbook.worksheets.getItem(layout.sheetName);
  const columns = tableColumns[tableName];
  const headerRow = layout.dataStartRow - 1;
  return sheet.getRange(`A${headerRow}:${colName(columns.length)}${headerRow}`).values[0];
}

function readTableRows(workbook, tableName) {
  const layout = layoutFor(tableName);
  const sheet = workbook.worksheets.getItem(layout.sheetName);
  const columns = tableColumns[tableName];
  const values = sheet.getRange(`A${layout.dataStartRow}:${colName(columns.length)}${layout.scanEndRow}`).values;
  return values
    .filter((row) => normalizeId(row[0]))
    .map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
}

function existingIds(workbook, tableName) {
  return new Set(readTableRows(workbook, tableName).map((row) => normalizeId(row[primaryKeyByTable[tableName]])).filter(Boolean));
}

function findAppendRow(workbook, tableName) {
  const layout = layoutFor(tableName);
  const sheet = workbook.worksheets.getItem(layout.sheetName);
  const values = sheet.getRange(`A${layout.dataStartRow}:A${layout.scanEndRow}`).values;
  let lastUsed = layout.dataStartRow - 1;
  values.forEach((row, index) => {
    if (normalizeId(row[0])) lastUsed = layout.dataStartRow + index;
  });
  return lastUsed + 1;
}

function validateHeaders(workbook, label, errors) {
  for (const tableName of promotionTables) {
    const expected = tableColumns[tableName];
    const actual = readHeader(workbook, tableName);
    expected.forEach((column, index) => {
      if (actual[index] !== column) {
        errors.push(`${label}:${tableName}: header ${index + 1} expected ${column}, found ${actual[index] ?? ""}`);
      }
    });
  }
}

function appendRows(workbook, tableName, rows) {
  if (rows.length === 0) return 0;
  const layout = layoutFor(tableName);
  const appendRow = findAppendRow(workbook, tableName);
  if (appendRow + rows.length - 1 > layout.scanEndRow) {
    throw new Error(`${tableName}: not enough safe rows for promotion append`);
  }
  const columns = tableColumns[tableName];
  const sheet = workbook.worksheets.getItem(layout.sheetName);
  const matrix = rows.map((row) => columns.map((column) => row[column] ?? null));
  sheet.getRange(`A${appendRow}:${colName(columns.length)}${appendRow + rows.length - 1}`).values = matrix;
  return rows.length;
}

function writeAuditSheet(workbook, { financeWorkbookPath, draftWorkbookPath, outputPath, appended, skipped }) {
  const sheet = workbook.worksheets.add("99_Import_Promotion_Audit");
  sheet.showGridLines = false;
  const rows = promotionTables.map((tableName) => [
    tableName,
    appended[tableName] ?? 0,
    skipped[tableName] ?? 0,
    primaryKeyByTable[tableName],
  ]);
  const summaryRows = [
    ["financeWorkbookPath", financeWorkbookPath, "Ziel-Kopie"],
    ["draftWorkbookPath", draftWorkbookPath, "Quelle fuer kontrollierte Promotion"],
    ["outputPath", outputPath, "Erzeugte Arbeitskopie"],
  ];

  sheet.getRange("A1:D1").merge();
  sheet.getRange("A1").values = [["99_Import_Promotion_Audit"]];
  sheet.getRange("A1:D1").format = { fill: "#123047", font: { color: "#FFFFFF", bold: true, size: 16 } };
  sheet.getRange("A3:C6").values = [["Kennzahl", "Wert", "Hinweis"], ...summaryRows];
  sheet.getRange("A8:D8").values = [["Tabelle", "Angehaengt", "Schon_vorhanden", "Primaerschluessel"]];
  sheet.getRange(`A9:D${8 + rows.length}`).values = rows;
  sheet.getRange("A3:C3").format = { fill: "#0F766E", font: { color: "#FFFFFF", bold: true } };
  sheet.getRange("A8:D8").format = { fill: "#0F766E", font: { color: "#FFFFFF", bold: true } };
  [260, 520, 220, 180].forEach((width, index) => {
    sheet.getRange(`${colName(index + 1)}:${colName(index + 1)}`).format.columnWidthPx = width;
  });
}

export async function promoteImportDraftToFinanceCopy({ financeWorkbookPath, draftWorkbookPath, outputPath }) {
  const [financeWorkbook, draftWorkbook] = await Promise.all([
    importWorkbook(financeWorkbookPath),
    importWorkbook(draftWorkbookPath),
  ]);

  const validation = { valid: true, errors: [], warnings: [] };
  validateHeaders(financeWorkbook, "finance", validation.errors);
  validateHeaders(draftWorkbook, "draft", validation.errors);
  validation.valid = validation.errors.length === 0;
  if (!validation.valid) {
    return { validation, appended: {}, skipped: {}, outputPath: null };
  }

  const appended = {};
  const skipped = {};
  for (const tableName of promotionTables) {
    const financeIds = existingIds(financeWorkbook, tableName);
    const draftRows = readTableRows(draftWorkbook, tableName);
    const missingRows = draftRows.filter((row) => !financeIds.has(normalizeId(row[primaryKeyByTable[tableName]])));
    appended[tableName] = appendRows(financeWorkbook, tableName, missingRows);
    skipped[tableName] = draftRows.length - missingRows.length;
  }

  writeAuditSheet(financeWorkbook, { financeWorkbookPath, draftWorkbookPath, outputPath, appended, skipped });
  financeWorkbook.recalculate();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(financeWorkbook);
  await output.save(outputPath);

  return { validation, appended, skipped, outputPath };
}

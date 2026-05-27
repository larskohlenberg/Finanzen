import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import {
  allowedSections,
  sectionToTable,
  tableColumns,
  targetTableLayouts,
} from "./importWriterVerifier.mjs";

const primaryKeys = {
  "90_Quellen": "Quelle_ID",
  "10_Importlaeufe": "Import_ID",
  "10_Umsaetze_Roh": "Rohumsatz_ID",
  "11_Umsaetze_Modell": "Transaktion_ID",
  "60_Warnungen_Aktuell": "Warnungs_ID",
  "99_Checks": "Check_ID",
};

function normalizeId(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function readExistingIds(workbook, tableName) {
  const layout = targetTableLayouts[tableName];
  const sheet = workbook.worksheets.getItem(layout.sheetName);
  const values = sheet.getRange(`A${layout.dataStartRow}:A${layout.scanEndRow}`).values;
  return values
    .map((row) => normalizeId(row[0]))
    .filter(Boolean);
}

export async function readImportWorkbookContext({ workbookPath }) {
  const input = await FileBlob.load(workbookPath);
  const workbook = await SpreadsheetFile.importXlsx(input);

  const targetTables = {};
  for (const tableName of Object.values(sectionToTable)) {
    const layout = targetTableLayouts[tableName];
    targetTables[tableName] = {
      sheetName: layout.sheetName,
      primaryKey: primaryKeys[tableName],
      columns: tableColumns[tableName],
      existingIds: readExistingIds(workbook, tableName),
    };
  }

  return {
    workbookPath,
    allowedSections,
    targetTables,
    forbiddenTargets: [
      "00_Dashboard",
      "30_Cashflow",
      "40_Szenarien",
      "42_Annahmen",
      "43_Zeitachse",
      "44_Liquiditaet",
      "11_Transferregeln",
      "12_Regelzahlungen",
      "12_Regelzahlung_Vorschlaege",
    ],
    uncertaintyRules: [
      "Unsichere Kategorien bleiben KAT013.",
      "Unsichere Transfers bleiben Kandidaten.",
      "Keine Liquiditaets-, Cashflow- oder Reichweitenwerte schreiben.",
      "Keine neuen Tabellen oder Spalten erfinden.",
    ],
  };
}

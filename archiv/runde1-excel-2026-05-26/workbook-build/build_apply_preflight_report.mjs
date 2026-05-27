import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const planPath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungsplan_Batch1_Transfers_Categories_Accepted.xlsx";
const masterPath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Applied_Review_NoOp.xlsx";
const fullDraftPath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_AgentDraft_Full_Analysis.xlsx";
const outputPath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Apply_Preflight_Batch1_Transfers_Categories.xlsx";

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

function readRows(workbook, sheetName, headerRow, maxCol, maxRows = 10000) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const values = sheet.getRange(`A${headerRow}:${colName(maxCol)}${maxRows}`).values;
  const headers = values[0];
  return values
    .slice(1)
    .filter((row) => row.some((value) => value !== null && value !== undefined && value !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

function readPlanTargets(planWorkbook) {
  const categories = readRows(planWorkbook, "Angenommene_Kategorie_Mappings", 1, 8)
    .map((row) => ({
      Vorschlag_ID: row.Vorschlag_ID,
      Typ: "Kategorie_Mapping",
      Betroffene_ID: row.Betroffene_ID,
      Zielwert: row.Ziel_Kategorie_ID,
      Kommentar: row.Kommentar,
    }));
  const transfers = readRows(planWorkbook, "Angenommene_Transferregeln", 1, 8)
    .map((row) => ({
      Vorschlag_ID: row.Vorschlag_ID,
      Typ: "neue_Transferregel",
      Betroffene_ID: row.Betroffene_ID,
      Zielwert: row.Ziel_Transfer_Typ,
      Kommentar: row.Kommentar,
    }));
  return [...categories, ...transfers];
}

function modelTransactionIds(workbook) {
  return new Set(readRows(workbook, "11_Umsaetze_Modell", 12, 25).map((row) => row.Transaktion_ID).filter(Boolean));
}

function styleTable(sheet, startCell, headers, rows) {
  const startCol = startCell.match(/[A-Z]+/)[0];
  const startRow = Number(startCell.match(/\d+/)[0]);
  const startColIndex = startCol.charCodeAt(0) - 64;
  const endCol = colName(startColIndex + headers.length - 1);
  const endRow = startRow + rows.length;
  sheet.getRange(`${startCell}:${endCol}${endRow}`).values = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))];
  sheet.getRange(`${startCell}:${endCol}${startRow}`).format = {
    fill: "#0F766E",
    font: { color: "#FFFFFF", bold: true },
    wrapText: true,
    borders: { preset: "all", style: "thin", color: "#CBD5E1" },
  };
  if (rows.length > 0) {
    sheet.getRange(`${startCol}${startRow + 1}:${endCol}${endRow}`).format = {
      font: { color: "#334155", size: 10 },
      wrapText: true,
      borders: { preset: "all", style: "thin", color: "#CBD5E1" },
    };
  }
}

function setWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getRange(`${colName(index + 1)}:${colName(index + 1)}`).format.columnWidthPx = width;
  });
}

async function main() {
  const [planWorkbook, masterWorkbook, fullDraftWorkbook] = await Promise.all([
    importWorkbook(planPath),
    importWorkbook(masterPath),
    importWorkbook(fullDraftPath),
  ]);

  const targets = readPlanTargets(planWorkbook);
  const masterIds = modelTransactionIds(masterWorkbook);
  const draftIds = modelTransactionIds(fullDraftWorkbook);
  const rows = targets.map((target) => ({
    ...target,
    In_Master: masterIds.has(target.Betroffene_ID),
    In_Full_Draft: draftIds.has(target.Betroffene_ID),
    Preflight_Status: masterIds.has(target.Betroffene_ID)
      ? "master_apply_moeglich"
      : draftIds.has(target.Betroffene_ID)
        ? "blockiert_master_fehlt_ziel_id"
        : "blockiert_ziel_id_unbekannt",
  }));

  const missingInMaster = rows.filter((row) => !row.In_Master).length;
  const availableInDraft = rows.filter((row) => row.In_Full_Draft).length;

  const workbook = Workbook.create();
  const summary = workbook.worksheets.add("Summary");
  const details = workbook.worksheets.add("Target_Check");
  summary.showGridLines = false;
  details.showGridLines = false;

  summary.getRange("A1:D1").merge();
  summary.getRange("A1").values = [["Apply Preflight Batch 1"]];
  summary.getRange("A1:D1").format = {
    fill: "#123047",
    font: { color: "#FFFFFF", bold: true, size: 16 },
  };
  styleTable(summary, "A3", ["Kennzahl", "Wert", "Hinweis"], [
    { Kennzahl: "Entscheidungsplan", Wert: planPath, Hinweis: "Quelle" },
    { Kennzahl: "Ziel-Master", Wert: masterPath, Hinweis: "verifizierter Uebergabestand" },
    { Kennzahl: "Full-Draft", Wert: fullDraftPath, Hinweis: "enthaelt grossen Import und Analysevorschlaege" },
    { Kennzahl: "Plan-Zieltransaktionen", Wert: targets.length, Hinweis: "Kategorie + Transfer" },
    { Kennzahl: "Fehlen in Master", Wert: missingInMaster, Hinweis: missingInMaster > 0 ? "Master-Apply blockiert" : "ok" },
    { Kennzahl: "Vorhanden im Full-Draft", Wert: availableInDraft, Hinweis: "dort waere technische Zuordnung moeglich" },
    { Kennzahl: "Empfehlung", Wert: "Full-Draft erst kontrolliert promoten oder Apply-Ziel wechseln", Hinweis: "nicht blind auf Master anwenden" },
  ]);
  setWidths(summary, [220, 520, 420]);

  styleTable(details, "A1", [
    "Vorschlag_ID",
    "Typ",
    "Betroffene_ID",
    "Zielwert",
    "In_Master",
    "In_Full_Draft",
    "Preflight_Status",
    "Kommentar",
  ], rows);
  setWidths(details, [150, 160, 330, 140, 110, 120, 230, 420]);
  details.freezePanes.freezeRows(1);

  workbook.recalculate();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  return {
    outputPath,
    targets: targets.length,
    missingInMaster,
    availableInDraft,
    masterApplyBlocked: missingInMaster > 0,
  };
}

console.log(JSON.stringify(await main(), null, 2));

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { promoteImportDraftToFinanceCopy } from "../src/importPromotion.mjs";

const masterWorkbookPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Applied_Review_NoOp.xlsx";
const fullDraftWorkbookPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_AgentDraft_Full_Analysis.xlsx";
const batch1PlanPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungsplan_Batch1_Transfers_Categories_Accepted.xlsx";

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

function readBatch1TargetIds(planWorkbook) {
  const categories = readRows(planWorkbook, "Angenommene_Kategorie_Mappings", 1, 8)
    .map((row) => row.Betroffene_ID);
  const transfers = readRows(planWorkbook, "Angenommene_Transferregeln", 1, 8)
    .map((row) => row.Betroffene_ID);
  return [...new Set([...categories, ...transfers].filter(Boolean))];
}

function readModelTransactionIds(workbook) {
  return new Set(readRows(workbook, "11_Umsaetze_Modell", 12, 25).map((row) => row.Transaktion_ID).filter(Boolean));
}

test("promotes missing import draft rows so batch-1 decision targets exist in a finance copy", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "import-promotion-"));
  const outputPath = join(tempDir, "promoted.xlsx");

  try {
    const [planWorkbook, masterBefore] = await Promise.all([
      importWorkbook(batch1PlanPath),
      importWorkbook(masterWorkbookPath),
    ]);
    const targetIds = readBatch1TargetIds(planWorkbook);
    const beforeIds = readModelTransactionIds(masterBefore);

    assert.equal(targetIds.length, 21);
    assert.equal(targetIds.filter((id) => !beforeIds.has(id)).length, 21);

    const report = await promoteImportDraftToFinanceCopy({
      financeWorkbookPath: masterWorkbookPath,
      draftWorkbookPath: fullDraftWorkbookPath,
      outputPath,
    });

    assert.equal(report.validation.valid, true, report.validation.errors.join("\n"));
    assert.equal(report.outputPath, outputPath);
    assert.ok(report.appended["10_Umsaetze_Roh"] > 0);
    assert.ok(report.appended["11_Umsaetze_Modell"] > 0);

    const promoted = await importWorkbook(outputPath);
    const promotedIds = readModelTransactionIds(promoted);
    assert.deepEqual(targetIds.filter((id) => !promotedIds.has(id)), []);

    const masterAfter = await importWorkbook(masterWorkbookPath);
    assert.equal(readModelTransactionIds(masterAfter).size, beforeIds.size);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

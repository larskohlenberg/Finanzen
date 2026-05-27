import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { applyRealEstateMasterDataToFinanceCopy } from "../src/realEstateMasterData.mjs";

const financeWorkbookPath =
  "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Promoted_Applied_Batch1_Batch2_Batch3_Regelzahlungen_Teil1.xlsx";

function rowsById(workbook, sheetName, range, idColumn) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const values = sheet.getRange(range).values;
  const headers = values[0];
  const idIndex = headers.indexOf(idColumn);
  return new Map(
    values
      .slice(1)
      .filter((row) => row[idIndex])
      .map((row) => [row[idIndex], Object.fromEntries(headers.map((header, index) => [header, row[index]]))]),
  );
}

test("applies the four real estate master-data anchors to a finance workbook copy", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "real-estate-master-data-"));
  const outputPath = join(tempDir, "finance_with_real_estate.xlsx");

  try {
    const report = await applyRealEstateMasterDataToFinanceCopy({
      financeWorkbookPath,
      outputPath,
    });

    assert.deepEqual(report, {
      outputPath,
      objectsWritten: 4,
      detailsWritten: 11,
    });

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const objects = rowsById(workbook, "04_Immobilien", "A6:H20", "Objekt_ID");
    assert.equal(objects.size, 4);
    assert.equal(objects.get("OBJ001").Name, "SZ, Helene-Lange-Weg 16");
    assert.equal(objects.get("OBJ001").Objektart, "Vermietete Immobilie");
    assert.equal(objects.get("OBJ001").Person_ID, "HH");
    assert.match(objects.get("OBJ001").Kommentar, /1\/3 P01, 2\/3 P02/);
    assert.equal(objects.get("OBJ002").Name, "SZ, Johannes-Wosnitzs-Str. 8");
    assert.equal(objects.get("OBJ002").Person_ID, "P02");
    assert.equal(objects.get("OBJ003").Name, "BHV, Kleiner Blink 9");
    assert.equal(objects.get("OBJ003").Person_ID, "P01");
    assert.equal(objects.get("OBJ004").Name, "BHV, Nell-Sachs-Str.");
    assert.equal(objects.get("OBJ004").Person_ID, "P01");

    const details = rowsById(workbook, "05_Immobilien_Details", "A6:H30", "Detail_ID");
    assert.equal(details.size, 11);
    assert.equal(details.get("IMD-OBJ001-MIETE").Wert, 750);
    assert.equal(details.get("IMD-OBJ001-MIETE").Einheit, "EUR/Monat");
    assert.match(details.get("IMD-OBJ001-MIETE").Kommentar, /SUG-20260521-009/);
    assert.equal(details.get("IMD-OBJ001-PV").Wert, 20);
    assert.match(details.get("IMD-OBJ001-DARLEHEN").Kommentar, /SUG-20260521-007/);
    assert.match(details.get("IMD-OBJ003-NIESSBRAUCH").Kommentar, /keine Mieteinnahmen/);
    assert.match(details.get("IMD-OBJ004-NIESSBRAUCH").Kommentar, /keine Mieteinnahmen/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

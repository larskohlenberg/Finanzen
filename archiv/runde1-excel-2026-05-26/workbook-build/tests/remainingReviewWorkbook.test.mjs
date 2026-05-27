import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { buildRemainingReviewWorkbook } from "../src/remainingReviewWorkbook.mjs";

const batch1ReviewPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch1_Transfers_Categories_Accepted.xlsx";

test("builds a focused workbook for remaining open review decisions", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "remaining-review-"));
  const outputPath = join(tempDir, "remaining_review.xlsx");

  try {
    const report = await buildRemainingReviewWorkbook({
      reviewWorkbookPath: batch1ReviewPath,
      outputPath,
    });

    assert.equal(report.outputPath, outputPath);
    assert.deepEqual(report.counts, {
      openTotal: 59,
      openRegularPayments: 50,
      openCategoryMappings: 9,
      openTransferRules: 0,
      blockedWithoutPerson: 50,
    });

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const matches = await workbook.inspect({
      kind: "match",
      searchTerm: "Offene Entscheidungen|Offene_Regelzahlungen|Offene_Kategorie_Mappings|Person_ID fehlt|Keine offenen Transfers",
      options: { useRegex: true, maxResults: 120 },
      summary: "remaining review workbook evidence",
    });

    assert.match(matches.ndjson, /Offene Entscheidungen/);
    assert.match(matches.ndjson, /Offene_Regelzahlungen/);
    assert.match(matches.ndjson, /Offene_Kategorie_Mappings/);
    assert.match(matches.ndjson, /Person_ID fehlt/);
    assert.match(matches.ndjson, /Keine offenen Transfers/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

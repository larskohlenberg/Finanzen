import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { buildProposalReviewWorkbook } from "../src/proposalReviewWorkbook.mjs";

const analysisWorkbookPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_AgentDraft_Full_Analysis.xlsx";
const execFileAsync = promisify(execFile);

async function readXlsxEntry(workbookPath, entryPath) {
  const { stdout } = await execFileAsync("unzip", ["-p", workbookPath, entryPath], { maxBuffer: 10_000_000 });
  return stdout;
}

test("builds a compact proposal review workbook from the analysis draft", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "proposal-review-"));
  const outputPath = join(tempDir, "proposal_review.xlsx");

  try {
    const report = await buildProposalReviewWorkbook({
      analysisWorkbookPath,
      outputPath,
    });

    assert.equal(report.outputPath, outputPath);
    assert.equal(report.counts.allSuggestions, 86);
    assert.equal(report.counts.regularPaymentSuggestions, 50);
    assert.equal(report.counts.transferSuggestions, 11);
    assert.equal(report.counts.categorySuggestions, 25);

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const summary = await workbook.inspect({
      kind: "match",
      searchTerm: "Vorschlagsreview|Regelzahlungen|Transfers|Kategorie-Mappings|Entscheidung|SUG-20260521-001",
      options: { useRegex: true, maxResults: 50 },
      summary: "proposal review workbook evidence",
    });
    assert.match(summary.ndjson, /Vorschlagsreview/);
    assert.match(summary.ndjson, /Regelzahlungen/);
    assert.match(summary.ndjson, /Transfers/);
    assert.match(summary.ndjson, /Kategorie-Mappings/);
    assert.match(summary.ndjson, /Entscheidung/);
    assert.match(summary.ndjson, /SUG-20260521-001/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("adds review helper lists and dropdown validations for target fields", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "proposal-review-validation-"));
  const outputPath = join(tempDir, "proposal_review.xlsx");

  try {
    await buildProposalReviewWorkbook({
      analysisWorkbookPath,
      outputPath,
    });

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const helperSheet = workbook.worksheets.getItem("Review_Listen");
    const helperValues = helperSheet.getRange("A1:H20").values.flat().filter(Boolean).join("|");
    assert.match(helperValues, /KAT001/);
    assert.match(helperValues, /KAT013/);
    assert.match(helperValues, /P01/);
    assert.match(helperValues, /HH/);
    assert.match(helperValues, /KTO001/);
    assert.match(helperValues, /Eigenumbuchung/);

    const reviewSheetXml = await readXlsxEntry(outputPath, "xl/worksheets/sheet2.xml");
    assert.match(reviewSheetXml, /<x:dataValidations count="5">/);
    assert.match(reviewSheetXml, /sqref="A2:A87"/);
    assert.match(reviewSheetXml, /sqref="O2:O87"/);
    assert.match(reviewSheetXml, /sqref="P2:P87"/);
    assert.match(reviewSheetXml, /sqref="Q2:Q87"/);
    assert.match(reviewSheetXml, /sqref="R2:R87"/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("adds formula-based completeness checks for accepted review decisions", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "proposal-review-checks-"));
  const outputPath = join(tempDir, "proposal_review.xlsx");

  try {
    await buildProposalReviewWorkbook({
      analysisWorkbookPath,
      outputPath,
    });

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const review = workbook.worksheets.getItem("Review_Liste");
    const headers = review.getRange("A1:W1").values[0];
    assert.equal(headers[21], "Check_Status");
    assert.equal(headers[22], "Pflichtfeld_Hinweis");

    const reviewSheetXml = await readXlsxEntry(outputPath, "xl/worksheets/sheet2.xml");
    assert.match(reviewSheetXml, /Check_Status/);
    assert.match(reviewSheetXml, /Pflichtfeld_Hinweis/);
    assert.match(reviewSheetXml, /neue_Regelzahlung/);
    assert.match(reviewSheetXml, /Ziel_Person_ID fehlt/);
    assert.match(reviewSheetXml, /Ziel_Transfer_Typ fehlt/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("adds live review progress metrics to the summary sheet", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "proposal-review-summary-progress-"));
  const outputPath = join(tempDir, "proposal_review.xlsx");

  try {
    await buildProposalReviewWorkbook({
      analysisWorkbookPath,
      outputPath,
    });

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const summary = workbook.worksheets.getItem("Summary");
    const values = summary.getRange("A10:C16").values.flat().filter(Boolean).join("|");
    assert.match(values, /Review-Fortschritt/);
    assert.match(values, /Offen/);
    assert.match(values, /Angenommen/);
    assert.match(values, /Abgelehnt/);
    assert.match(values, /Zurueckgestellt/);
    assert.match(values, /Unvollstaendige angenommene Entscheidungen/);

    const summarySheetXml = await readXlsxEntry(outputPath, "xl/worksheets/sheet1.xml");
    assert.match(summarySheetXml, /COUNTIF\(Review_Liste!\$A\$2:\$A\$87,""\)/);
    assert.match(summarySheetXml, /COUNTIF\(Review_Liste!\$V\$2:\$V\$87,"unvollstaendig"\)/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

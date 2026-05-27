import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { buildProposalReviewWorkbook } from "../src/proposalReviewWorkbook.mjs";
import {
  applyReviewDecisionPlanToFinanceCopy,
  buildReviewDecisionPlan,
  preflightReviewDecisionPlan,
  readReviewDecisionPackage,
  summarizeReviewWorkbook,
  validateReviewDecisionPackage,
} from "../src/reviewDecisionPlan.mjs";

const analysisWorkbookPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_AgentDraft_Full_Analysis.xlsx";
const financeWorkbookPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Startmappe.xlsx";
const promotedFinanceWorkbookPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Promoted_Full_Analysis_Import.xlsx";
const batch1TransferCategoryReviewPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch1_Transfers_Categories_Accepted.xlsx";

function readXlsxPart(xlsxPath, partPath) {
  return execFileSync("unzip", ["-p", xlsxPath, partPath], { encoding: "utf8" });
}

function mergeRefsInSheet(xlsxPath, sheetPartPath) {
  const xml = readXlsxPart(xlsxPath, sheetPartPath);
  return [...xml.matchAll(/<[^:>]*:?mergeCell\s+ref="([^"]+)"/g)].map((match) => match[1]);
}

async function writeAcceptedDecisionReview(sourcePath, outputPath, acceptCount = 1) {
  await writeAcceptedDecisionReviewByTypes(
    sourcePath,
    outputPath,
    Array.from({ length: acceptCount }, () => ({
      type: "neue_Regelzahlung",
      Ziel_Kategorie_ID: "KAT001",
      Ziel_Person_ID: "P01",
      Entscheidung_Notiz: "Testentscheidung",
    })),
  );
}

async function writeAcceptedDecisionReviewByTypes(sourcePath, outputPath, decisionsToAccept) {
  const input = await FileBlob.load(sourcePath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const review = workbook.worksheets.getItem("Review_Liste");
  const headers = review.getRange("A1:U1").values[0];
  const rows = review.getRange("A2:U90").values;
  const typeIndex = headers.indexOf("Typ");
  const decisionIndex = headers.indexOf("Entscheidung");
  const usedRows = new Set();

  for (const decision of decisionsToAccept) {
    const rowIndex = rows.findIndex((row, index) => !usedRows.has(index) && row[typeIndex] === decision.type);
    assert.notEqual(rowIndex, -1, `missing review row for ${decision.type}`);
    usedRows.add(rowIndex);
    const excelRow = rowIndex + 2;
    review.getRange(`A${excelRow}:U${excelRow}`).values = [
      rows[rowIndex].map((value, index) => {
        const header = headers[index];
        if (index === decisionIndex) return "annehmen";
        if (Object.hasOwn(decision, header)) return decision[header];
        return value;
      }),
    ];
  }

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);
}

async function writeAcceptedRegularPaymentDecisionById(sourcePath, outputPath, suggestionId, decisionFields) {
  const input = await FileBlob.load(sourcePath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const review = workbook.worksheets.getItem("Review_Liste");
  const headers = review.getRange("A1:U1").values[0];
  const rows = review.getRange("A2:U1000").values;
  const idIndex = headers.indexOf("Vorschlag_ID");
  const decisionIndex = headers.indexOf("Entscheidung");
  const rowIndex = rows.findIndex((row) => row[idIndex] === suggestionId);
  assert.notEqual(rowIndex, -1, `missing review row for ${suggestionId}`);
  const excelRow = rowIndex + 2;

  review.getRange(`A${excelRow}:U${excelRow}`).values = [
    rows[rowIndex].map((value, index) => {
      const header = headers[index];
      if (index === decisionIndex) return "annehmen";
      if (Object.hasOwn(decisionFields, header)) return decisionFields[header];
      return value;
    }),
  ];

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);
}

test("reads and validates accepted review decisions", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "review-decisions-"));
  const reviewPath = join(tempDir, "review.xlsx");
  const decidedReviewPath = join(tempDir, "review_decided.xlsx");

  try {
    await buildProposalReviewWorkbook({ analysisWorkbookPath, outputPath: reviewPath });
    await writeAcceptedDecisionReview(reviewPath, decidedReviewPath);

    const decisionPackage = await readReviewDecisionPackage({ reviewWorkbookPath: decidedReviewPath });
    const validation = validateReviewDecisionPackage(decisionPackage);
    assert.equal(validation.valid, true, validation.errors.join("\n"));
    assert.equal(decisionPackage.decisions.filter((row) => row.Entscheidung === "annehmen").length, 1);
    assert.equal(decisionPackage.acceptedRegularPayments.length, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("builds an implementation plan workbook without mutating the finance workbook", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "review-decision-plan-"));
  const reviewPath = join(tempDir, "review.xlsx");
  const decidedReviewPath = join(tempDir, "review_decided.xlsx");
  const outputPath = join(tempDir, "decision_plan.xlsx");

  try {
    await buildProposalReviewWorkbook({ analysisWorkbookPath, outputPath: reviewPath });
    await writeAcceptedDecisionReview(reviewPath, decidedReviewPath);

    const report = await buildReviewDecisionPlan({
      reviewWorkbookPath: decidedReviewPath,
      outputPath,
      firstRuleNumber: 1001,
    });

    assert.equal(report.outputPath, outputPath);
    assert.equal(report.counts.acceptedRegularPayments, 1);
    assert.equal(report.counts.blockedDecisions, 0);

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const matches = await workbook.inspect({
      kind: "match",
      searchTerm: "REG1001|Angenommene_Regelzahlungen|KAT001|P01|nicht_in_modell_geschrieben",
      options: { useRegex: true, maxResults: 30 },
      summary: "decision plan evidence",
    });

    assert.match(matches.ndjson, /REG1001/);
    assert.match(matches.ndjson, /KAT001/);
    assert.match(matches.ndjson, /P01/);
    assert.match(matches.ndjson, /nicht_in_modell_geschrieben/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("builds a delta implementation plan for selected accepted suggestions only", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "review-decision-delta-plan-"));
  const decidedReviewPath = join(tempDir, "review_decided.xlsx");
  const outputPath = join(tempDir, "decision_plan.xlsx");

  try {
    await writeAcceptedRegularPaymentDecisionById(
      batch1TransferCategoryReviewPath,
      decidedReviewPath,
      "SUG-20260521-009",
      {
        Ziel_Kategorie_ID: "KAT002",
        Ziel_Person_ID: "HH",
        Entscheidung_Notiz: "Test: Miete OBJ001",
      },
    );

    const report = await buildReviewDecisionPlan({
      reviewWorkbookPath: decidedReviewPath,
      outputPath,
      firstRuleNumber: 1005,
      acceptedSuggestionIds: ["SUG-20260521-009"],
    });

    assert.equal(report.counts.acceptedRegularPayments, 1);
    assert.equal(report.counts.acceptedCategoryMappings, 0);
    assert.equal(report.counts.acceptedTransferRules, 0);

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const regular = workbook.worksheets.getItem("Angenommene_Regelzahlungen");
    assert.equal(regular.getRange("A2").values[0][0], "REG1005");
    assert.equal(regular.getRange("D2").values[0][0], "KAT002");
    assert.equal(regular.getRange("E2").values[0][0], "HH");
    assert.match(regular.getRange("AA2").values[0][0], /SUG-20260521-009/);
    assert.equal(regular.getRange("A3").values[0][0], null);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("keeps accepted regular payment amounts numeric when raw suggestion cells import as dates", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "review-decision-date-amount-"));
  const decidedReviewPath = join(tempDir, "review_decided.xlsx");
  const outputPath = join(tempDir, "decision_plan.xlsx");

  try {
    await writeAcceptedRegularPaymentDecisionById(
      batch1TransferCategoryReviewPath,
      decidedReviewPath,
      "SUG-20260521-004",
      {
        Ziel_Kategorie_ID: "KAT001",
        Ziel_Person_ID: "P01",
        Entscheidung_Notiz: "Test: Uebertrag mit Betrag 3000 bleibt numerisch",
      },
    );

    const report = await buildReviewDecisionPlan({
      reviewWorkbookPath: decidedReviewPath,
      outputPath,
      firstRuleNumber: 1001,
    });
    assert.equal(report.counts.acceptedRegularPayments, 1);

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const regular = workbook.worksheets.getItem("Angenommene_Regelzahlungen");
    assert.equal(regular.getRange("I2").values[0][0], 3000);
    assert.equal(regular.getRange("P2").values[0][0], 3000);
    assert.equal(regular.getRange("Q2").values[0][0], 3000);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("embeds review status in the decision plan workbook", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "review-decision-plan-status-"));
  const reviewPath = join(tempDir, "review.xlsx");
  const decidedReviewPath = join(tempDir, "review_decided.xlsx");
  const outputPath = join(tempDir, "decision_plan.xlsx");

  try {
    await buildProposalReviewWorkbook({ analysisWorkbookPath, outputPath: reviewPath });
    await writeAcceptedDecisionReview(reviewPath, decidedReviewPath);

    await buildReviewDecisionPlan({
      reviewWorkbookPath: decidedReviewPath,
      outputPath,
      firstRuleNumber: 1001,
    });

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const matches = await workbook.inspect({
      kind: "match",
      searchTerm: "Review_Status|totalDecisions|open|acceptedRegularPayments|readyForDecisionPlan|86|85|true",
      options: { useRegex: true, maxResults: 60 },
      summary: "decision plan review status evidence",
    });

    assert.match(matches.ndjson, /Review_Status/);
    assert.match(matches.ndjson, /totalDecisions/);
    assert.match(matches.ndjson, /open/);
    assert.match(matches.ndjson, /acceptedRegularPayments/);
    assert.match(matches.ndjson, /readyForDecisionPlan/);
    assert.match(matches.ndjson, /86/);
    assert.match(matches.ndjson, /85/);
    assert.match(matches.ndjson, /true/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("builds plan sheets for accepted category and transfer decisions without direct finance writes", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "review-decision-nonregular-plan-"));
  const reviewPath = join(tempDir, "review.xlsx");
  const decidedReviewPath = join(tempDir, "review_decided.xlsx");
  const outputPath = join(tempDir, "decision_plan.xlsx");

  try {
    await buildProposalReviewWorkbook({ analysisWorkbookPath, outputPath: reviewPath });
    await writeAcceptedDecisionReviewByTypes(reviewPath, decidedReviewPath, [
      {
        type: "Kategorie_Mapping",
        Ziel_Kategorie_ID: "KAT003",
        Ziel_Person_ID: "P01",
        Entscheidung_Notiz: "Kategorie bestaetigt",
      },
      {
        type: "neue_Transferregel",
        Ziel_Konto_ID: "KTO001",
        Ziel_Transfer_Typ: "Eigenumbuchung",
        Entscheidung_Notiz: "Transfer bestaetigt",
      },
    ]);

    const decisionPackage = await readReviewDecisionPackage({ reviewWorkbookPath: decidedReviewPath });
    const validation = validateReviewDecisionPackage(decisionPackage);
    assert.equal(validation.valid, true, validation.errors.join("\n"));
    assert.deepEqual(validation.warnings, []);
    assert.equal(decisionPackage.acceptedCategoryMappings.length, 1);
    assert.equal(decisionPackage.acceptedTransferRules.length, 1);

    const report = await buildReviewDecisionPlan({
      reviewWorkbookPath: decidedReviewPath,
      outputPath,
      firstRuleNumber: 1001,
    });

    assert.equal(report.counts.acceptedRegularPayments, 0);
    assert.equal(report.counts.acceptedCategoryMappings, 1);
    assert.equal(report.counts.acceptedTransferRules, 1);
    assert.equal(report.counts.blockedDecisions, 0);

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const matches = await workbook.inspect({
      kind: "match",
      searchTerm: "Angenommene_Kategorie_Mappings|Angenommene_Transferregeln|KAT003|Eigenumbuchung|KTO001|nicht_in_modell_geschrieben",
      options: { useRegex: true, maxResults: 50 },
      summary: "category and transfer plan evidence",
    });

    assert.match(matches.ndjson, /Angenommene_Kategorie_Mappings/);
    assert.match(matches.ndjson, /Angenommene_Transferregeln/);
    assert.match(matches.ndjson, /KAT003/);
    assert.match(matches.ndjson, /Eigenumbuchung/);
    assert.match(matches.ndjson, /KTO001/);
    assert.match(matches.ndjson, /nicht_in_modell_geschrieben/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("summarizes review progress and incomplete accepted decisions", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "review-status-"));
  const reviewPath = join(tempDir, "review.xlsx");
  const decidedReviewPath = join(tempDir, "review_decided.xlsx");

  try {
    await buildProposalReviewWorkbook({ analysisWorkbookPath, outputPath: reviewPath });
    await writeAcceptedDecisionReviewByTypes(reviewPath, decidedReviewPath, [
      {
        type: "neue_Regelzahlung",
        Ziel_Kategorie_ID: "KAT001",
        Ziel_Person_ID: "P01",
        Entscheidung_Notiz: "vollstaendig",
      },
      {
        type: "neue_Transferregel",
        Entscheidung_Notiz: "Transfer noch ohne Typ",
      },
    ]);

    const status = await summarizeReviewWorkbook({ reviewWorkbookPath: decidedReviewPath });

    assert.equal(status.totalDecisions, 86);
    assert.equal(status.counts.open, 84);
    assert.equal(status.counts.accepted, 2);
    assert.equal(status.counts.acceptedRegularPayments, 1);
    assert.equal(status.counts.acceptedTransferRules, 1);
    assert.equal(status.counts.incompleteAccepted, 1);
    assert.equal(status.readyForDecisionPlan, false);
    assert.match(status.validation.errors.join("\n"), /Ziel_Transfer_Typ required/);
    assert.deepEqual(status.incompleteAcceptedDecisions, [
      {
        Vorschlag_ID: status.incompleteAcceptedDecisions[0].Vorschlag_ID,
        Typ: "neue_Transferregel",
        missingFields: ["Ziel_Transfer_Typ"],
      },
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("preflights an accepted regular-payment plan against the finance workbook", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "review-decision-preflight-"));
  const reviewPath = join(tempDir, "review.xlsx");
  const decidedReviewPath = join(tempDir, "review_decided.xlsx");
  const outputPath = join(tempDir, "decision_plan.xlsx");

  try {
    await buildProposalReviewWorkbook({ analysisWorkbookPath, outputPath: reviewPath });
    await writeAcceptedDecisionReview(reviewPath, decidedReviewPath);
    await buildReviewDecisionPlan({
      reviewWorkbookPath: decidedReviewPath,
      outputPath,
      firstRuleNumber: 1001,
    });

    const preflight = await preflightReviewDecisionPlan({
      financeWorkbookPath,
      decisionPlanPath: outputPath,
    });

    assert.equal(preflight.valid, true, preflight.errors.join("\n"));
    assert.equal(preflight.regularPayments.count, 1);
    assert.equal(preflight.regularPayments.availableBlankRows, 2);
    assert.equal(preflight.regularPayments.requiresRowInsertion, false);
    assert.equal(preflight.regularPayments.writableWithoutInsertion, true);
    assert.deepEqual(preflight.regularPayments.duplicateRuleIds, []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("preflight blocks accepted regular payments that exceed safe blank-row capacity", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "review-decision-capacity-"));
  const reviewPath = join(tempDir, "review.xlsx");
  const decidedReviewPath = join(tempDir, "review_decided.xlsx");
  const outputPath = join(tempDir, "decision_plan.xlsx");

  try {
    await buildProposalReviewWorkbook({ analysisWorkbookPath, outputPath: reviewPath });
    await writeAcceptedDecisionReview(reviewPath, decidedReviewPath, 3);
    await buildReviewDecisionPlan({
      reviewWorkbookPath: decidedReviewPath,
      outputPath,
      firstRuleNumber: 1001,
    });

    const preflight = await preflightReviewDecisionPlan({
      financeWorkbookPath,
      decisionPlanPath: outputPath,
    });

    assert.equal(preflight.valid, false);
    assert.equal(preflight.regularPayments.count, 3);
    assert.equal(preflight.regularPayments.availableBlankRows, 2);
    assert.equal(preflight.regularPayments.requiresRowInsertion, true);
    assert.match(preflight.errors.join("\n"), /exceeds safe blank-row capacity/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("preflight rejects duplicate regular-payment IDs", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "review-decision-duplicate-"));
  const reviewPath = join(tempDir, "review.xlsx");
  const decidedReviewPath = join(tempDir, "review_decided.xlsx");
  const outputPath = join(tempDir, "decision_plan.xlsx");

  try {
    await buildProposalReviewWorkbook({ analysisWorkbookPath, outputPath: reviewPath });
    await writeAcceptedDecisionReview(reviewPath, decidedReviewPath);
    await buildReviewDecisionPlan({
      reviewWorkbookPath: decidedReviewPath,
      outputPath,
      firstRuleNumber: 1001,
    });

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    workbook.worksheets.getItem("Angenommene_Regelzahlungen").getRange("A2").values = [["REG001"]];
    const output = await SpreadsheetFile.exportXlsx(workbook);
    await output.save(outputPath);

    const preflight = await preflightReviewDecisionPlan({
      financeWorkbookPath,
      decisionPlanPath: outputPath,
    });

    assert.equal(preflight.valid, false);
    assert.deepEqual(preflight.regularPayments.duplicateRuleIds, ["REG001"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("applies accepted regular payments to a finance workbook copy", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "review-decision-apply-"));
  const reviewPath = join(tempDir, "review.xlsx");
  const decidedReviewPath = join(tempDir, "review_decided.xlsx");
  const decisionPlanPath = join(tempDir, "decision_plan.xlsx");
  const outputPath = join(tempDir, "finance_copy.xlsx");

  try {
    await buildProposalReviewWorkbook({ analysisWorkbookPath, outputPath: reviewPath });
    await writeAcceptedDecisionReview(reviewPath, decidedReviewPath);
    await buildReviewDecisionPlan({
      reviewWorkbookPath: decidedReviewPath,
      outputPath: decisionPlanPath,
      firstRuleNumber: 1001,
    });

    const report = await applyReviewDecisionPlanToFinanceCopy({
      financeWorkbookPath,
      decisionPlanPath,
      outputPath,
    });

    assert.equal(report.validation.valid, true, report.validation.errors.join("\n"));
    assert.equal(report.applied.regularPayments, 1);

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const matches = await workbook.inspect({
      kind: "match",
      searchTerm: "REG1001|KAT001|P01|aus SUG-20260521|99_Review_Apply_Audit|appliedRegularPayments|layoutExpandedRows",
      options: { useRegex: true, maxResults: 30 },
      summary: "applied regular payment evidence",
    });
    assert.match(matches.ndjson, /REG1001/);
    assert.match(matches.ndjson, /KAT001/);
    assert.match(matches.ndjson, /P01/);
    assert.match(matches.ndjson, /aus SUG-20260521/);
    assert.match(matches.ndjson, /99_Review_Apply_Audit/);
    assert.match(matches.ndjson, /appliedRegularPayments/);
    assert.match(matches.ndjson, /layoutExpandedRows/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("applies accepted category mappings and transfer confirmations to promoted import rows", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "review-decision-model-updates-"));
  const decisionPlanPath = join(tempDir, "decision_plan.xlsx");
  const outputPath = join(tempDir, "finance_model_updates.xlsx");

  try {
    await buildReviewDecisionPlan({
      reviewWorkbookPath: batch1TransferCategoryReviewPath,
      outputPath: decisionPlanPath,
      firstRuleNumber: 1001,
    });

    const report = await applyReviewDecisionPlanToFinanceCopy({
      financeWorkbookPath: promotedFinanceWorkbookPath,
      decisionPlanPath,
      outputPath,
    });

    assert.equal(report.validation.valid, true, report.validation.errors.join("\n"));
    assert.equal(report.applied.categoryMappings, 16);
    assert.equal(report.applied.transferConfirmations, 5);

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const modelSheet = workbook.worksheets.getItem("11_Umsaetze_Modell");
    const values = modelSheet.getRange("A12:Y10000").values;
    const headers = values[0];
    const rows = values.slice(1);
    const byId = new Map(rows.filter((row) => row[0]).map((row) => [row[0], Object.fromEntries(headers.map((header, index) => [header, row[index]]))]));

    assert.equal(byId.get("TXN-RAW-IMP-20260516-FULLDRAFT-000123").Kategorie_ID, "KAT003");
    assert.equal(byId.get("TXN-RAW-IMP-20260516-FULLDRAFT-000123").Status, "belegt");

    const transferRow = byId.get("TXN-RAW-IMP-20260516-FULLDRAFT-000646");
    assert.equal(transferRow.Kategorie_ID, "KAT012");
    assert.equal(transferRow.Ist_Transfer, true);
    assert.equal(transferRow.Transfer_Status, "bestaetigter_transfer");
    assert.equal(transferRow.Transfer_Typ, "Eigenumbuchung");
    assert.equal(transferRow.Cashflow_Wirkung, "neutral");
    assert.equal(transferRow.Lebenshaltung_Relevant, false);

    const matches = await workbook.inspect({
      kind: "match",
      searchTerm: "99_Review_Apply_Audit|appliedCategoryMappings|appliedTransferConfirmations",
      options: { useRegex: true, maxResults: 30 },
      summary: "model update apply audit evidence",
    });
    assert.match(matches.ndjson, /99_Review_Apply_Audit/);
    assert.match(matches.ndjson, /appliedCategoryMappings/);
    assert.match(matches.ndjson, /appliedTransferConfirmations/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("preflight blocks category and transfer plans that are not Umsetzung_Eindeutig", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "review-decision-non-eindeutig-"));
  const decisionPlanPath = join(tempDir, "decision_plan.xlsx");

  try {
    await buildReviewDecisionPlan({
      reviewWorkbookPath: batch1TransferCategoryReviewPath,
      outputPath: decisionPlanPath,
      firstRuleNumber: 1001,
    });

    const input = await FileBlob.load(decisionPlanPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    workbook.worksheets.getItem("Angenommene_Kategorie_Mappings").getRange("G2").values = [[false]];
    workbook.worksheets.getItem("Angenommene_Transferregeln").getRange("G2").values = [[false]];
    const output = await SpreadsheetFile.exportXlsx(workbook);
    await output.save(decisionPlanPath);

    const preflight = await preflightReviewDecisionPlan({
      financeWorkbookPath: promotedFinanceWorkbookPath,
      decisionPlanPath,
    });

    assert.equal(preflight.valid, false);
    assert.match(preflight.errors.join("\n"), /category mapping is not Umsetzung_Eindeutig/);
    assert.match(preflight.errors.join("\n"), /transfer confirmation is not Umsetzung_Eindeutig/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("applies manual transfer-pair confirmations from a decision plan", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "review-decision-manual-transfer-pair-"));
  const decisionPlanPath = join(tempDir, "decision_plan.xlsx");
  const outputPath = join(tempDir, "finance_manual_transfer_pair.xlsx");

  try {
    await buildReviewDecisionPlan({
      reviewWorkbookPath: batch1TransferCategoryReviewPath,
      outputPath: decisionPlanPath,
      firstRuleNumber: 1001,
    });

    const input = await FileBlob.load(decisionPlanPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const sheet = workbook.worksheets.add("Manuelle_Transferpaare");
    sheet.getRange("A1:E2").values = [
      ["Entscheidung_ID", "Transaktion_ID", "Gegenbuchung_Transaktion_ID", "Ziel_Transfer_Typ", "Kommentar"],
      [
        "MAN-TRANSFER-SUG-20260521-079",
        "TXN-RAW-IMP-20260516-FULLDRAFT-000028",
        "TXN-RAW-IMP-20260516-FULLDRAFT-000034",
        "Eigenumbuchung",
        "Fahrradkauf Jan: Zahlungseingang und Fahrradladen-Gegenbuchung neutralisieren",
      ],
    ];
    const output = await SpreadsheetFile.exportXlsx(workbook);
    await output.save(decisionPlanPath);

    const report = await applyReviewDecisionPlanToFinanceCopy({
      financeWorkbookPath: promotedFinanceWorkbookPath,
      decisionPlanPath,
      outputPath,
    });

    assert.equal(report.validation.valid, true, report.validation.errors.join("\n"));
    assert.equal(report.applied.manualTransferPairs, 1);
    assert.equal(report.applied.manualTransferTransactions, 2);

    const resultInput = await FileBlob.load(outputPath);
    const resultWorkbook = await SpreadsheetFile.importXlsx(resultInput);
    const modelSheet = resultWorkbook.worksheets.getItem("11_Umsaetze_Modell");
    const values = modelSheet.getRange("A12:Y10000").values;
    const headers = values[0];
    const byId = new Map(
      values
        .slice(1)
        .filter((row) => row[0])
        .map((row) => [row[0], Object.fromEntries(headers.map((header, index) => [header, row[index]]))]),
    );

    for (const id of [
      "TXN-RAW-IMP-20260516-FULLDRAFT-000028",
      "TXN-RAW-IMP-20260516-FULLDRAFT-000034",
    ]) {
      const row = byId.get(id);
      assert.equal(row.Kategorie_ID, "KAT012");
      assert.equal(row.Ist_Transfer, true);
      assert.equal(row.Transfer_Status, "bestaetigter_transfer");
      assert.equal(row.Transfer_Typ, "Eigenumbuchung");
      assert.equal(row.Cashflow_Wirkung, "neutral");
      assert.equal(row.Lebenshaltung_Relevant, false);
      assert.match(row.Kommentar, /MAN-TRANSFER-SUG-20260521-079/);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("apply is no-op when no review decisions are accepted", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "review-decision-noop-"));
  const outputPath = join(tempDir, "finance_noop.xlsx");

  try {
    const report = await applyReviewDecisionPlanToFinanceCopy({
      financeWorkbookPath,
      decisionPlanPath: "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungsplan.xlsx",
      outputPath,
    });

    assert.equal(report.validation.valid, true);
    assert.equal(report.applied.regularPayments, 0);

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const matches = await workbook.inspect({
      kind: "match",
      searchTerm: "REG1001",
      options: { useRegex: false, maxResults: 10 },
      summary: "no-op apply evidence",
    });
    assert.doesNotMatch(matches.ndjson, /REG1001/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("apply can use the verified workbook copy as its finance base", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "review-decision-verified-noop-"));
  const outputPath = join(tempDir, "verified_finance_noop.xlsx");

  try {
    const report = await applyReviewDecisionPlanToFinanceCopy({
      financeWorkbookPath: "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert.xlsx",
      decisionPlanPath: "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungsplan.xlsx",
      outputPath,
    });

    assert.equal(report.validation.valid, true);
    assert.equal(report.applied.regularPayments, 0);

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    workbook.recalculate();
    const matches = await workbook.inspect({
      kind: "match",
      searchTerm: "99_Build_Verification_Audit|99_Review_Apply_Audit|Kontrollstatus|bestanden|appliedRegularPayments|REG1001",
      options: { useRegex: true, maxResults: 80 },
      summary: "verified no-op apply evidence",
    });
    assert.match(matches.ndjson, /99_Build_Verification_Audit/);
    assert.match(matches.ndjson, /99_Review_Apply_Audit/);
    assert.match(matches.ndjson, /bestanden/);
    assert.match(matches.ndjson, /appliedRegularPayments/);
    assert.doesNotMatch(matches.ndjson, /REG1001/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("applies over-capacity regular payments when layout expansion is explicit", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "review-decision-expanded-"));
  const reviewPath = join(tempDir, "review.xlsx");
  const decidedReviewPath = join(tempDir, "review_decided.xlsx");
  const decisionPlanPath = join(tempDir, "decision_plan.xlsx");
  const outputPath = join(tempDir, "finance_expanded.xlsx");

  try {
    await buildProposalReviewWorkbook({ analysisWorkbookPath, outputPath: reviewPath });
    await writeAcceptedDecisionReview(reviewPath, decidedReviewPath, 3);
    await buildReviewDecisionPlan({
      reviewWorkbookPath: decidedReviewPath,
      outputPath: decisionPlanPath,
      firstRuleNumber: 1001,
    });

    const report = await applyReviewDecisionPlanToFinanceCopy({
      financeWorkbookPath,
      decisionPlanPath,
      outputPath,
      allowLayoutExpansion: true,
    });

    assert.equal(report.validation.valid, true, report.validation.errors.join("\n"));
    assert.equal(report.applied.regularPayments, 3);
    assert.equal(report.applied.layoutExpandedRows, 1);

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const matches = await workbook.inspect({
      kind: "match",
      searchTerm: "REG1001|REG1002|REG1003|Regelzahlung Vorschlaege|SUG-20260521-001",
      options: { useRegex: true, maxResults: 80 },
      summary: "expanded apply evidence",
    });
    assert.match(matches.ndjson, /REG1001/);
    assert.match(matches.ndjson, /REG1002/);
    assert.match(matches.ndjson, /REG1003/);
    assert.match(matches.ndjson, /Regelzahlung Vorschlaege/);
    assert.match(matches.ndjson, /SUG-20260521-001/);

    const mergeRefs = mergeRefsInSheet(outputPath, "xl/worksheets/sheet11.xml");
    assert.deepEqual(
      mergeRefs.filter((ref) => /^A(8|9|10|11):/.test(ref)),
      [],
      "regular payment data rows must not retain stale merged cells after layout expansion",
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

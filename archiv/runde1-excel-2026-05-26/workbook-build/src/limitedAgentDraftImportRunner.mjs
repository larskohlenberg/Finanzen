import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { applyImportProposal } from "./importWriterVerifier.mjs";
import { createProposalFromCsvDraft } from "./agentCsvProposalDraft.mjs";

const formulaErrorPattern = "#VALUE!|#REF!|#DIV/0!|#NAME\\?|#N/A|#NULL!|#NUM!";

function countActualMatches(ndjson) {
  return ndjson
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.kind !== "notice").length;
}

async function workbookContains(workbook, term) {
  const result = await workbook.inspect({
    kind: "match",
    searchTerm: term,
    options: { useRegex: false, maxResults: 10 },
    summary: "limited agent draft evidence",
  });
  return result.ndjson.includes(term);
}

export async function runLimitedAgentDraftImport({
  workbookPath,
  sourcePath,
  outputPath,
  maxTransactions,
  ids,
  accountId,
  personId,
  importDate,
}) {
  const proposal = await createProposalFromCsvDraft({
    sourcePath,
    maxTransactions,
    ids,
    accountId,
    personId,
    importDate,
  });

  const writeReport = await applyImportProposal({
    workbookPath,
    outputPath,
    proposal,
  });

  const input = await FileBlob.load(outputPath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const evidenceTerms = [
    ids.sourceId,
    ids.importId,
    proposal.rawTransactions[0]?.Rohumsatz_ID,
    proposal.modelTransactions[0]?.Transaktion_ID,
    ids.checkId,
  ].filter(Boolean);

  const evidenceResults = await Promise.all(
    evidenceTerms.map(async (term) => [term, await workbookContains(workbook, term)]),
  );
  const missingIdEvidence = evidenceResults
    .filter(([, found]) => !found)
    .map(([term]) => term);

  const formulaErrors = await workbook.inspect({
    kind: "match",
    searchTerm: formulaErrorPattern,
    options: { useRegex: true, maxResults: 20 },
    summary: "limited agent draft formula errors",
  });

  return {
    outputPath: writeReport.outputPath,
    validation: writeReport.validation,
    appended: writeReport.appended,
    proposalSummary: {
      sourceRows: 1,
      importRuns: 1,
      rawTransactions: proposal.rawTransactions.length,
      modelTransactions: proposal.modelTransactions.length,
      warnings: proposal.warnings.length,
      checks: proposal.checks.length,
      questions: proposal.questions.length,
    },
    verification: {
      idEvidenceFound: missingIdEvidence.length === 0,
      missingIdEvidence,
      formulaErrorMatches: countActualMatches(formulaErrors.ndjson),
    },
  };
}

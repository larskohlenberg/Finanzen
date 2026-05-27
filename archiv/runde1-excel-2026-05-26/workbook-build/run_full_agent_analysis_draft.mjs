import { createAnalysisSuggestionsFromWorkbookDraft } from "./src/agentAnalysisProposalDraft.mjs";
import { applyAnalysisSuggestions } from "./src/analysisSuggestionWriterVerifier.mjs";

const suggestions = await createAnalysisSuggestionsFromWorkbookDraft({
  workbookPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_AgentDraft_Full.xlsx",
  importId: "IMP-20260516-FULLDRAFT",
  runId: "RUN-20260521-ANALYSIS",
  createdAt: "2026-05-21",
  firstSuggestionNumber: 1,
  maxRecurringSuggestions: 50,
  maxTransferSuggestions: 25,
});

const report = await applyAnalysisSuggestions({
  workbookPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_AgentDraft_Full.xlsx",
  outputPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_AgentDraft_Full_Analysis.xlsx",
  suggestions,
});

console.log(JSON.stringify({
  summary: suggestions.summary,
  validation: report.validation,
  appended: report.appended,
  outputPath: report.outputPath,
}, null, 2));

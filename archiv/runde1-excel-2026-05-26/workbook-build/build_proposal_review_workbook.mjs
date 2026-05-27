import { buildProposalReviewWorkbook } from "./src/proposalReviewWorkbook.mjs";

const report = await buildProposalReviewWorkbook({
  analysisWorkbookPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_AgentDraft_Full_Analysis.xlsx",
  outputPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview.xlsx",
  analysisRunId: "RUN-20260521-ANALYSIS",
});

console.log(JSON.stringify(report, null, 2));

import { buildReviewDecisionPlan } from "./src/reviewDecisionPlan.mjs";

const report = await buildReviewDecisionPlan({
  reviewWorkbookPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch4_OBJ001_Miete_Accepted.xlsx",
  outputPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungsplan_Batch4_OBJ001_Miete_Accepted.xlsx",
  firstRuleNumber: 1005,
  acceptedSuggestionIds: ["SUG-20260521-009"],
});

console.log(JSON.stringify({ ...report, deltaPlan: true }, null, 2));

import { buildReviewDecisionPlan } from "./src/reviewDecisionPlan.mjs";

const report = await buildReviewDecisionPlan({
  reviewWorkbookPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch1_Transfers_Categories_Accepted.xlsx",
  outputPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungsplan_Batch1_Transfers_Categories_Accepted.xlsx",
  firstRuleNumber: 1001,
});

console.log(JSON.stringify(report, null, 2));

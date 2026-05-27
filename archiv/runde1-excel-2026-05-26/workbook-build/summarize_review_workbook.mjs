import { summarizeReviewWorkbook } from "./src/reviewDecisionPlan.mjs";

const report = await summarizeReviewWorkbook({
  reviewWorkbookPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview.xlsx",
});

console.log(JSON.stringify(report, null, 2));

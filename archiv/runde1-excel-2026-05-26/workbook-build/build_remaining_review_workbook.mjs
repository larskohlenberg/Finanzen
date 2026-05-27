import { buildRemainingReviewWorkbook } from "./src/remainingReviewWorkbook.mjs";

const report = await buildRemainingReviewWorkbook({
  reviewWorkbookPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch1_Transfers_Categories_Accepted.xlsx",
  outputPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Restentscheidungen_Nach_Batch1.xlsx",
});

console.log(JSON.stringify(report, null, 2));

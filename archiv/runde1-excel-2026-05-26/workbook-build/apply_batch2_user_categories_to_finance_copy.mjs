import { applyReviewDecisionPlanToFinanceCopy } from "./src/reviewDecisionPlan.mjs";

const report = await applyReviewDecisionPlanToFinanceCopy({
  financeWorkbookPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Promoted_Applied_Batch1_Transfers_Categories.xlsx",
  decisionPlanPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungsplan_Batch2_User_Categories_Accepted.xlsx",
  outputPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Promoted_Applied_Batch1_Batch2_User_Categories.xlsx",
});

console.log(JSON.stringify(report, null, 2));

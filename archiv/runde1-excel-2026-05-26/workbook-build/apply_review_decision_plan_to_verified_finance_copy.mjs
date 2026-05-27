import { applyReviewDecisionPlanToFinanceCopy } from "./src/reviewDecisionPlan.mjs";

const report = await applyReviewDecisionPlanToFinanceCopy({
  financeWorkbookPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert.xlsx",
  decisionPlanPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungsplan.xlsx",
  outputPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Applied_Review_NoOp.xlsx",
});

console.log(JSON.stringify(report, null, 2));

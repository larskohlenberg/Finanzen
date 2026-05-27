import { applyReviewDecisionPlanToFinanceCopy } from "./src/reviewDecisionPlan.mjs";

const report = await applyReviewDecisionPlanToFinanceCopy({
  financeWorkbookPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Promoted_Applied_Batch1_Batch2_User_Categories.xlsx",
  decisionPlanPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungsplan_Batch3_Regelzahlungen_Teil1_Accepted.xlsx",
  outputPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Promoted_Applied_Batch1_Batch2_Batch3_Regelzahlungen_Teil1.xlsx",
  allowLayoutExpansion: true,
});

console.log(JSON.stringify(report, null, 2));

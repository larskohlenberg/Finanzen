import { preflightReviewDecisionPlan } from "./src/reviewDecisionPlan.mjs";

const report = await preflightReviewDecisionPlan({
  financeWorkbookPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Startmappe.xlsx",
  decisionPlanPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungsplan.xlsx",
});

console.log(JSON.stringify(report, null, 2));

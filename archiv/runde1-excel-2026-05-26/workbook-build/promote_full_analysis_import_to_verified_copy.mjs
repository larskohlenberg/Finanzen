import { promoteImportDraftToFinanceCopy } from "./src/importPromotion.mjs";

const report = await promoteImportDraftToFinanceCopy({
  financeWorkbookPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Applied_Review_NoOp.xlsx",
  draftWorkbookPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_AgentDraft_Full_Analysis.xlsx",
  outputPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Promoted_Full_Analysis_Import.xlsx",
});

console.log(JSON.stringify(report, null, 2));

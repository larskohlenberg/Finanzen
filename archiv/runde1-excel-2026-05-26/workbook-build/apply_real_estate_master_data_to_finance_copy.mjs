import { applyRealEstateMasterDataToFinanceCopy } from "./src/realEstateMasterData.mjs";

const report = await applyRealEstateMasterDataToFinanceCopy({
  financeWorkbookPath:
    "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Promoted_Applied_Batch1_Batch2_Batch3_Regelzahlungen_Teil1.xlsx",
  outputPath:
    "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Promoted_Applied_Batch1_Batch2_Batch3_Immobilien_Stammdaten.xlsx",
});

console.log(JSON.stringify(report, null, 2));

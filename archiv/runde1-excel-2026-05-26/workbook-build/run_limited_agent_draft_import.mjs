import { runLimitedAgentDraftImport } from "./src/limitedAgentDraftImportRunner.mjs";

const report = await runLimitedAgentDraftImport({
  workbookPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Startmappe.xlsx",
  sourcePath: "./16-05-2026_Umsatzliste_Girokonto_DE98120300001061711675.csv",
  outputPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_AgentDraft_10Rows.xlsx",
  maxTransactions: 10,
  ids: {
    sourceId: "SRC-20260516-DRAFT",
    importId: "IMP-20260516-DRAFT",
    runId: "RUN-20260521-DRAFT",
    warningId: "WRN-IMPORT-DRAFT-REAL",
    checkId: "CHK-IMPORT-DRAFT-REAL",
  },
  accountId: "KTO001",
  personId: "P01",
  importDate: "2026-05-21",
});

console.log(JSON.stringify(report, null, 2));

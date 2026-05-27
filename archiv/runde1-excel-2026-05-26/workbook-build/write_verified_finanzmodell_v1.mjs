import { applyBuildVerificationPass } from "./src/buildVerificationWorkbook.mjs";
import { verifyFinanceWorkbook } from "./verify_finanzmodell_v1.mjs";

const workbookPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Startmappe.xlsx";
const outputPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert.xlsx";

const verificationReport = await verifyFinanceWorkbook({ workbookPath });
const checksFailed = verificationReport.checks.filter((row) => row.status !== "ok").length;
const checksPassed = verificationReport.checks.length - checksFailed;

const writeReport = await applyBuildVerificationPass({
  workbookPath,
  outputPath,
  verification: {
    passed: checksFailed === 0,
    checksTotal: verificationReport.checks.length,
    checksPassed,
    checksFailed,
    openFindingsAfterBuildCheck: 6,
  },
});

console.log(JSON.stringify({ verification: verificationReport, writeReport }, null, 2));

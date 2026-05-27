import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { buildReviewDecisionPlan } from "./src/reviewDecisionPlan.mjs";

const reviewWorkbookPath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch2_User_Categories_Accepted.xlsx";
const outputPath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungsplan_Batch2_User_Categories_Accepted.xlsx";

async function main() {
  const report = await buildReviewDecisionPlan({
    reviewWorkbookPath,
    outputPath,
    firstRuleNumber: 1001,
  });

  const input = await FileBlob.load(outputPath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const sheet = workbook.worksheets.add("Manuelle_Transferpaare");
  sheet.showGridLines = false;
  sheet.getRange("A1:E2").values = [
    ["Entscheidung_ID", "Transaktion_ID", "Gegenbuchung_Transaktion_ID", "Ziel_Transfer_Typ", "Kommentar"],
    [
      "MAN-TRANSFER-SUG-20260521-079",
      "TXN-RAW-IMP-20260516-FULLDRAFT-000028",
      "TXN-RAW-IMP-20260516-FULLDRAFT-000034",
      "Eigenumbuchung",
      "Nutzerentscheidung: Fahrradkauf Jan; Zahlungseingang und V...S.Bike-Gegenbuchung neutralisieren",
    ],
  ];
  sheet.getRange("A1:E1").format = { fill: "#0F766E", font: { color: "#FFFFFF", bold: true }, wrapText: true };
  [220, 340, 340, 160, 520].forEach((width, index) => {
    const column = String.fromCharCode(65 + index);
    sheet.getRange(`${column}:${column}`).format.columnWidthPx = width;
  });

  workbook.recalculate();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  return {
    ...report,
    manualTransferPairs: 1,
  };
}

console.log(JSON.stringify(await main(), null, 2));

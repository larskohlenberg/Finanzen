import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { buildReviewDecisionPlan } from "./src/reviewDecisionPlan.mjs";

const outputPath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungsplan_Batch3_Regelzahlungen_Teil1_Accepted.xlsx";

function blankRows(rowCount, columnCount) {
  return Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => null));
}

async function main() {
  const report = await buildReviewDecisionPlan({
    reviewWorkbookPath: "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch3_Regelzahlungen_Teil1_Accepted.xlsx",
    outputPath,
    firstRuleNumber: 1001,
  });

  const input = await FileBlob.load(outputPath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  workbook.worksheets.getItem("Angenommene_Kategorie_Mappings").getRange("A2:H1000").values = blankRows(999, 8);
  workbook.worksheets.getItem("Angenommene_Transferregeln").getRange("A2:H1000").values = blankRows(999, 8);
  workbook.worksheets.getItem("Summary").getRange("B5:C6").values = [
    [0, "Delta-Plan: Kategorie-Mappings wurden bereits in Batch 1/2 angewendet"],
    [0, "Delta-Plan: Transferentscheidungen wurden bereits in Batch 1/2 angewendet"],
  ];
  workbook.recalculate();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  return {
    ...report,
    counts: {
      ...report.counts,
      acceptedCategoryMappings: 0,
      acceptedTransferRules: 0,
    },
    deltaPlan: true,
  };
}

console.log(JSON.stringify(await main(), null, 2));

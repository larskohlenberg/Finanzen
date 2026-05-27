import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch3_Regelzahlungen_Teil1_Accepted.xlsx";
const outputPath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch4_OBJ001_Miete_Accepted.xlsx";

function indexes(headers) {
  return Object.fromEntries(headers.map((header, index) => [header, index]));
}

async function main() {
  const input = await FileBlob.load(sourcePath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const sheet = workbook.worksheets.getItem("Review_Liste");
  const values = sheet.getRange("A1:U1000").values;
  const header = values[0];
  const ix = indexes(header);
  let accepted = 0;

  values.slice(1).forEach((row, zeroIndex) => {
    if (row[ix.Vorschlag_ID] !== "SUG-20260521-009") return;
    const excelRow = zeroIndex + 2;
    sheet.getRange(`A${excelRow}`).values = [["annehmen"]];
    sheet.getRange(`O${excelRow}`).values = [["KAT002"]];
    sheet.getRange(`P${excelRow}`).values = [["HH"]];
    sheet.getRange(`S${excelRow}`).values = [[
      "Nutzerentscheidung: Miete Willi Kohlenberg fuer OBJ001 SZ, Helene-Lange-Weg 16; Objektanker in Batch 4 gesetzt",
    ]];
    accepted += 1;
  });

  const audit = workbook.worksheets.add("Batch4_OBJ001_Miete_Audit");
  audit.showGridLines = false;
  audit.getRange("A1:D1").merge();
  audit.getRange("A1").values = [["Batch4 OBJ001 Miete Audit"]];
  audit.getRange("A1:D1").format = { fill: "#123047", font: { color: "#FFFFFF", bold: true, size: 16 } };
  audit.getRange("A3:C8").values = [
    ["Kennzahl", "Wert", "Hinweis"],
    ["Quelle", sourcePath, "Batch-3-Reviewstand"],
    ["Output", outputPath, "Review-Kopie mit angenommener OBJ001-Miete"],
    ["Angenommene Regelzahlungen", accepted, "SUG-20260521-009"],
    ["Objektanker", "OBJ001", "SZ, Helene-Lange-Weg 16"],
    ["Master-Mappe veraendert", "nein", "nur Review-Kopie erzeugt"],
  ];
  audit.getRange("A3:C3").format = { fill: "#0F766E", font: { color: "#FFFFFF", bold: true } };
  audit.getRange("A:A").format.columnWidthPx = 260;
  audit.getRange("B:B").format.columnWidthPx = 500;
  audit.getRange("C:C").format.columnWidthPx = 520;

  workbook.recalculate();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  return { outputPath, accepted };
}

console.log(JSON.stringify(await main(), null, 2));

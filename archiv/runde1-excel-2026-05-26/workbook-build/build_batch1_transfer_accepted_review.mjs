import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch1_Draft.xlsx";
const outputPath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch1_Transfers_Accepted.xlsx";

const acceptedTransferIds = new Map([
  ["SUG-20260521-051", "Eigenumbuchung bestaetigt aus Batch-1-Freigabe: Übertrag ESt"],
  ["SUG-20260521-052", "Eigenumbuchung bestaetigt aus Batch-1-Freigabe: Übertrag"],
  ["SUG-20260521-053", "Eigenumbuchung bestaetigt aus Batch-1-Freigabe: Übertrag"],
  ["SUG-20260521-054", "Eigenumbuchung bestaetigt aus Batch-1-Freigabe: Übertrag Führerschein Oma und Opa"],
  ["SUG-20260521-055", "Eigenumbuchung bestaetigt aus Batch-1-Freigabe: Übertrag"],
]);

function indexes(headers) {
  return Object.fromEntries(headers.map((header, index) => [header, index]));
}

async function main() {
  const input = await FileBlob.load(sourcePath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const sheet = workbook.worksheets.getItem("Review_Liste");
  const values = sheet.getRange("A1:W1000").values;
  const header = values[0];
  const ix = indexes(header);
  let accepted = 0;

  values.slice(1).forEach((row, zeroIndex) => {
    const excelRow = zeroIndex + 2;
    const id = row[ix.Vorschlag_ID];
    if (!acceptedTransferIds.has(id)) return;
    sheet.getRange(`A${excelRow}`).values = [["annehmen"]];
    sheet.getRange(`R${excelRow}`).values = [["Eigenumbuchung"]];
    sheet.getRange(`S${excelRow}`).values = [[acceptedTransferIds.get(id)]];
    accepted += 1;
  });

  const audit = workbook.worksheets.add("Batch1_Transfers_Audit");
  audit.showGridLines = false;
  audit.getRange("A1:D1").merge();
  audit.getRange("A1").values = [["Batch1 Transfers Accepted Audit"]];
  audit.getRange("A1:D1").format = {
    fill: "#123047",
    font: { color: "#FFFFFF", bold: true, size: 16 },
  };
  audit.getRange("A3:C8").values = [
    ["Kennzahl", "Wert", "Hinweis"],
    ["Quelle", sourcePath, "Batch-1-Review-Draft"],
    ["Output", outputPath, "Review-Kopie mit angenommenen Uebertraegen"],
    ["Angenommene Transfer-Vorschlaege", accepted, "nur Uebertrag-Kandidaten"],
    ["Ziel_Transfer_Typ", "Eigenumbuchung", "fuer alle angenommenen Transfer-Vorschlaege"],
    ["Master-Mappe veraendert", "nein", "nur Review-Kopie erzeugt"],
  ];
  audit.getRange("A3:C3").format = {
    fill: "#0F766E",
    font: { color: "#FFFFFF", bold: true },
    borders: { preset: "all", style: "thin", color: "#CBD5E1" },
  };
  audit.getRange("A4:C8").format = {
    font: { color: "#334155", size: 10 },
    wrapText: true,
    borders: { preset: "all", style: "thin", color: "#CBD5E1" },
  };
  audit.getRange("A:A").format.columnWidthPx = 240;
  audit.getRange("B:B").format.columnWidthPx = 360;
  audit.getRange("C:C").format.columnWidthPx = 360;

  workbook.recalculate();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  return { outputPath, accepted };
}

console.log(JSON.stringify(await main(), null, 2));

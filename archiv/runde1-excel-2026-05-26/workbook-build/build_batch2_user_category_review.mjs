import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch1_Transfers_Categories_Accepted.xlsx";
const outputPath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch2_User_Categories_Accepted.xlsx";

const decisions = new Map([
  ["SUG-20260521-080", { categoryId: "KAT007", note: "Nutzerentscheidung: iPhone-Verkauf Lea Sophie -> Familie & Haushalt" }],
  ["SUG-20260521-067", { categoryId: "KAT002", note: "Nutzerentscheidung: Handwerks-/Dienstleistung -> Wohnen & Immobilien" }],
  ["SUG-20260521-071", { categoryId: "KAT002", note: "Nutzerentscheidung: Rueckzahlung Rasenmaehroboter -> Wohnen & Immobilien" }],
  ["SUG-20260521-072", { categoryId: "KAT002", note: "Nutzerentscheidung: Handwerks-/Dienstleistung -> Wohnen & Immobilien" }],
  ["SUG-20260521-073", { categoryId: "KAT002", note: "Nutzerentscheidung: Handwerks-/Dienstleistung -> Wohnen & Immobilien" }],
  ["SUG-20260521-075", { categoryId: "KAT002", note: "Nutzerentscheidung: Handwerks-/Dienstleistung -> Wohnen & Immobilien" }],
  ["SUG-20260521-079", { categoryId: "KAT012", note: "Nutzerentscheidung: Fahrradzahlung als Transferpaar mit Fahrradladen-Gegenbuchung neutralisieren" }],
  ["SUG-20260521-083", { categoryId: "KAT007", note: "Nutzerentscheidung: Catering Konfirmation Sohn -> Familie & Haushalt" }],
  ["SUG-20260521-086", { categoryId: "KAT008", note: "Nutzerentscheidung: Hennestrand passt zu Freizeit & Reisen" }],
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
    const id = row[ix.Vorschlag_ID];
    const decision = decisions.get(id);
    if (!decision) return;
    const excelRow = zeroIndex + 2;
    sheet.getRange(`A${excelRow}`).values = [["annehmen"]];
    sheet.getRange(`O${excelRow}`).values = [[decision.categoryId]];
    sheet.getRange(`S${excelRow}`).values = [[decision.note]];
    accepted += 1;
  });

  const audit = workbook.worksheets.add("Batch2_User_Categories_Audit");
  audit.showGridLines = false;
  audit.getRange("A1:D1").merge();
  audit.getRange("A1").values = [["Batch2 User Categories Accepted Audit"]];
  audit.getRange("A1:D1").format = { fill: "#123047", font: { color: "#FFFFFF", bold: true, size: 16 } };
  audit.getRange("A3:C8").values = [
    ["Kennzahl", "Wert", "Hinweis"],
    ["Quelle", sourcePath, "Batch-1-Reviewstand"],
    ["Output", outputPath, "Review-Kopie mit Nutzerentscheidungen"],
    ["Angenommene Kategorie-Mappings", accepted, "neun offene Kategorieentscheidungen"],
    ["Manuelles Transferpaar", "SUG-20260521-079", "Plan-Builder ergaenzt Fahrrad-Gegenbuchung"],
    ["Master-Mappe veraendert", "nein", "nur Review-Kopie erzeugt"],
  ];
  audit.getRange("A3:C3").format = { fill: "#0F766E", font: { color: "#FFFFFF", bold: true } };
  audit.getRange("A:A").format.columnWidthPx = 260;
  audit.getRange("B:B").format.columnWidthPx = 420;
  audit.getRange("C:C").format.columnWidthPx = 420;

  workbook.recalculate();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  return { outputPath, accepted };
}

console.log(JSON.stringify(await main(), null, 2));

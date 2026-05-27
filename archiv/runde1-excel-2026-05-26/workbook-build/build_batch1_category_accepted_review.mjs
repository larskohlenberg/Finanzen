import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch1_Transfers_Accepted.xlsx";
const helperPath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungshilfe.xlsx";
const outputPath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch1_Transfers_Categories_Accepted.xlsx";

function indexes(headers) {
  return Object.fromEntries(headers.map((header, index) => [header, index]));
}

function readHelperCategoryDecisions(workbook) {
  const sheet = workbook.worksheets.getItem("Kategorie_Mappings");
  const values = sheet.getRange("A4:Q200").values;
  const header = values[0];
  const ix = indexes(header);
  return new Map(
    values
      .slice(1)
      .filter((row) => row[ix.Vorschlag_ID] && row[ix.KI_Empfehlung] === "wahrscheinliche Kategorie" && row[ix.KI_Ziel_Kategorie_ID])
      .map((row) => [
        row[ix.Vorschlag_ID],
        {
          categoryId: row[ix.KI_Ziel_Kategorie_ID],
          note: row[ix.KI_Begruendung] || "Kategorie aus Entscheidungshilfe",
        },
      ]),
  );
}

async function main() {
  const [sourceInput, helperInput] = await Promise.all([
    FileBlob.load(sourcePath),
    FileBlob.load(helperPath),
  ]);
  const workbook = await SpreadsheetFile.importXlsx(sourceInput);
  const helperWorkbook = await SpreadsheetFile.importXlsx(helperInput);
  const categoryDecisions = readHelperCategoryDecisions(helperWorkbook);

  const sheet = workbook.worksheets.getItem("Review_Liste");
  const values = sheet.getRange("A1:W1000").values;
  const header = values[0];
  const ix = indexes(header);

  let accepted = 0;
  for (const [rowIndex, row] of values.slice(1).entries()) {
    const excelRow = rowIndex + 2;
    const id = row[ix.Vorschlag_ID];
    const decision = categoryDecisions.get(id);
    if (!decision) continue;
    sheet.getRange(`A${excelRow}`).values = [["annehmen"]];
    sheet.getRange(`O${excelRow}`).values = [[decision.categoryId]];
    sheet.getRange(`S${excelRow}`).values = [[`Batch1-Draft: ${decision.note}`]];
    accepted += 1;
  }

  const audit = workbook.worksheets.add("Batch1_Categories_Audit");
  audit.showGridLines = false;
  audit.getRange("A1:D1").merge();
  audit.getRange("A1").values = [["Batch1 Categories Accepted Audit"]];
  audit.getRange("A1:D1").format = {
    fill: "#123047",
    font: { color: "#FFFFFF", bold: true, size: 16 },
  };
  audit.getRange("A3:C8").values = [
    ["Kennzahl", "Wert", "Hinweis"],
    ["Quelle", sourcePath, "Review-Kopie mit angenommenen Transfers"],
    ["Entscheidungshilfe", helperPath, "Quelle fuer Kategoriehinweise"],
    ["Angenommene Kategorie-Mappings", accepted, "nur Zeilen mit konkretem KI_Ziel_Kategorie_ID"],
    ["Unklare Kategorie-Mappings", 25 - accepted, "bleiben offen"],
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
  audit.getRange("A:A").format.columnWidthPx = 250;
  audit.getRange("B:B").format.columnWidthPx = 380;
  audit.getRange("C:C").format.columnWidthPx = 380;

  workbook.recalculate();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  return { outputPath, accepted, stillOpenCategoryMappings: 25 - accepted };
}

console.log(JSON.stringify(await main(), null, 2));

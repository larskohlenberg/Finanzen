import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview.xlsx";
const outputPath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch1_Draft.xlsx";

const rejectedFalsePositiveTransfers = new Map([
  ["SUG-20260521-056", "Kartenzahlung SPAR.KOEBMAND, kein Transfer"],
  ["SUG-20260521-057", "Kartenzahlung SPAR.KOEBMAND, kein Transfer"],
  ["SUG-20260521-058", "Kartenzahlung SPAR.KOEBMAND, kein Transfer"],
  ["SUG-20260521-059", "Kartenzahlung SPAR.KOEBMAND, kein Transfer"],
  ["SUG-20260521-060", "Kartenzahlung SPAR.KOEBMAND, kein Transfer"],
  ["SUG-20260521-061", "Kartenzahlung SPAR.KOEBMAND, kein Transfer"],
]);

const likelyTransferRows = new Map([
  ["SUG-20260521-051", "Wahrscheinlich Eigenumbuchung: Übertrag ESt"],
  ["SUG-20260521-052", "Wahrscheinlich Eigenumbuchung: Übertrag"],
  ["SUG-20260521-053", "Wahrscheinlich Eigenumbuchung: Übertrag"],
  ["SUG-20260521-054", "Wahrscheinlich Eigenumbuchung: Übertrag Führerschein Oma und Opa"],
  ["SUG-20260521-055", "Wahrscheinlich Eigenumbuchung: Übertrag"],
]);

function findHeaderIndexes(headers) {
  return Object.fromEntries(headers.map((header, index) => [header, index]));
}

async function main() {
  const input = await FileBlob.load(sourcePath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const sheet = workbook.worksheets.getItem("Review_Liste");
  const values = sheet.getRange("A1:W1000").values;
  const headers = values[0];
  const indexes = findHeaderIndexes(headers);

  const decisionCol = indexes.Entscheidung;
  const idCol = indexes.Vorschlag_ID;
  const transferTypeCol = indexes.Ziel_Transfer_Typ;
  const noteCol = indexes.Entscheidung_Notiz;
  const commentCol = indexes.Kommentar;

  let rejected = 0;
  let annotated = 0;
  const nextRows = [];

  values.slice(1).forEach((row, zeroIndex) => {
    const excelRow = zeroIndex + 2;
    const id = row[idCol];
    if (rejectedFalsePositiveTransfers.has(id)) {
      sheet.getRange(`A${excelRow}`).values = [["ablehnen"]];
      sheet.getRange(`S${excelRow}`).values = [[`Batch1-Draft: ${rejectedFalsePositiveTransfers.get(id)}`]];
      rejected += 1;
    }
    if (likelyTransferRows.has(id)) {
      sheet.getRange(`R${excelRow}`).values = [["Eigenumbuchung"]];
      sheet.getRange(`S${excelRow}`).values = [[`Bitte bestaetigen: ${likelyTransferRows.get(id)}`]];
      annotated += 1;
      nextRows.push({
        Vorschlag_ID: id,
        Vorschlag: likelyTransferRows.get(id),
        Empfohlene_Entscheidung: "annehmen, falls eigenes Konto bzw. Familien-Umbuchung bestaetigt",
        Ziel_Transfer_Typ: "Eigenumbuchung",
      });
    }
  });

  const summary = workbook.worksheets.add("Batch1_Draft_Audit");
  summary.showGridLines = false;
  summary.getRange("A1:D1").merge();
  summary.getRange("A1").values = [["Batch1 Draft Audit"]];
  summary.getRange("A1:D1").format = {
    fill: "#123047",
    font: { color: "#FFFFFF", bold: true, size: 16 },
  };
  summary.getRange("A3:C8").values = [
    ["Kennzahl", "Wert", "Hinweis"],
    ["Quelle", sourcePath, "Review-Arbeitsmappe"],
    ["Output", outputPath, "Vorbefuellte Review-Kopie"],
    ["Abgelehnte False-Positive-Transfers", rejected, "SPAR.KOEBMAND Kartenzahlungen"],
    ["Zur Bestaetigung markierte Uebertraege", annotated, "Entscheidung bleibt offen"],
    ["Master-Mappe veraendert", "nein", "nur Review-Kopie erzeugt"],
  ];
  summary.getRange("A3:C3").format = {
    fill: "#0F766E",
    font: { color: "#FFFFFF", bold: true },
    borders: { preset: "all", style: "thin", color: "#CBD5E1" },
  };
  summary.getRange("A4:C8").format = {
    font: { color: "#334155", size: 10 },
    wrapText: true,
    borders: { preset: "all", style: "thin", color: "#CBD5E1" },
  };
  summary.getRange("A:A").format.columnWidthPx = 230;
  summary.getRange("B:B").format.columnWidthPx = 360;
  summary.getRange("C:C").format.columnWidthPx = 360;

  if (nextRows.length > 0) {
    summary.getRange(`A11:D${11 + nextRows.length}`).values = [
      ["Vorschlag_ID", "Vorschlag", "Empfohlene_Entscheidung", "Ziel_Transfer_Typ"],
      ...nextRows.map((row) => [
        row.Vorschlag_ID,
        row.Vorschlag,
        row.Empfohlene_Entscheidung,
        row.Ziel_Transfer_Typ,
      ]),
    ];
    summary.getRange("A11:D11").format = {
      fill: "#0F766E",
      font: { color: "#FFFFFF", bold: true },
      wrapText: true,
      borders: { preset: "all", style: "thin", color: "#CBD5E1" },
    };
    summary.getRange(`A12:D${11 + nextRows.length}`).format = {
      font: { color: "#334155", size: 10 },
      wrapText: true,
      borders: { preset: "all", style: "thin", color: "#CBD5E1" },
    };
  }

  workbook.recalculate();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  return { outputPath, rejected, annotated };
}

console.log(JSON.stringify(await main(), null, 2));

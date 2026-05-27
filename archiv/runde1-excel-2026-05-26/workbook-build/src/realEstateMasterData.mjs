import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const realEstateObjects = [
  [
    "OBJ001",
    "SZ, Helene-Lange-Weg 16",
    "Vermietete Immobilie",
    "HH",
    "",
    "belegt",
    "Darlehen, PV-Ertrag, Miete und spaetere Kosten vervollstaendigen",
    "Eigentum intern: 1/3 P01, 2/3 P02; modellwirksam; SUG-20260521-007 und SUG-20260521-009 gehoeren hierher",
  ],
  [
    "OBJ002",
    "SZ, Johannes-Wosnitzs-Str. 8",
    "Selbst genutzte Immobilie",
    "P02",
    "",
    "belegt",
    "Darlehen und Restschuld separat erfassen; spaeter Kontoimport P02 einlesen",
    "Eigentum P02; fast abbezahlt; Darlehen laufen noch bis 2027; Nutzung eigenstaendig",
  ],
  [
    "OBJ003",
    "BHV, Kleiner Blink 9",
    "Wohnung mit Niessbrauch",
    "P01",
    "",
    "belegt",
    "Niessbrauch und spaetere Szenarioannahmen dokumentieren",
    "Eigentum P01; voll abbezahlt; belegt; Niessbrauch gegenueber Eltern; keine Mieteinnahmen und keine laufenden Kosten",
  ],
  [
    "OBJ004",
    "BHV, Nell-Sachs-Str.",
    "Wohnung mit Niessbrauch",
    "P01",
    "",
    "belegt",
    "Niessbrauch und spaetere Szenarioannahmen dokumentieren",
    "Eigentum P01; voll abbezahlt; belegt; wie OBJ003: keine Mieteinnahmen und keine laufenden Kosten",
  ],
];

const realEstateDetails = [
  [
    "IMD-OBJ001-EIGENTUM",
    "OBJ001",
    "Eigentum",
    "1/3 P01, 2/3 P02",
    "Anteil",
    "",
    "belegt",
    "Fachlicher Eigentumsanker fuer SZ, Helene-Lange-Weg 16",
  ],
  [
    "IMD-OBJ001-NUTZUNG",
    "OBJ001",
    "Nutzung",
    "vermietet",
    "Status",
    "",
    "belegt",
    "Modellwirksam; Miete und objektbezogene Cashflows sollen beruecksichtigt werden",
  ],
  [
    "IMD-OBJ001-MIETE",
    "OBJ001",
    "Miete",
    750,
    "EUR/Monat",
    "",
    "belegt",
    "Mieter Willi Kohlenberg; entspricht SUG-20260521-009; Regelzahlung erst nach Objektanker bestaetigen",
  ],
  [
    "IMD-OBJ001-PV",
    "OBJ001",
    "PV_Ertrag",
    20,
    "EUR/Monat",
    "",
    "belegt",
    "PV-Einspeiseabschlag aktuell 20 EUR/Monat; Jahresabrechnung mit Ist-Zahlen in Q1 des Folgejahres",
  ],
  [
    "IMD-OBJ001-DARLEHEN",
    "OBJ001",
    "Darlehen",
    "Zins und Tilgung zu 2/3",
    "SUG",
    "",
    "offen",
    "Gehoert zu SUG-20260521-007; Darlehen und Restschuld separat erfassen",
  ],
  [
    "IMD-OBJ002-EIGENTUM",
    "OBJ002",
    "Eigentum",
    "P02",
    "Person_ID",
    "",
    "belegt",
    "Eigentum P02",
  ],
  [
    "IMD-OBJ002-NUTZUNG",
    "OBJ002",
    "Nutzung",
    "selbst genutzt",
    "Status",
    "",
    "belegt",
    "Darlehen laufen noch bis 2027 ueber Konten P02; spaeter gesondert einlesen",
  ],
  [
    "IMD-OBJ003-EIGENTUM",
    "OBJ003",
    "Eigentum",
    "P01",
    "Person_ID",
    "",
    "belegt",
    "Eigentum P01",
  ],
  [
    "IMD-OBJ003-NIESSBRAUCH",
    "OBJ003",
    "Niessbrauch",
    "Eltern",
    "Hinweis",
    "",
    "belegt",
    "Voll abbezahlt; belegt; Niessbrauch gegenueber Eltern; keine Mieteinnahmen und keine laufenden Kosten",
  ],
  [
    "IMD-OBJ004-EIGENTUM",
    "OBJ004",
    "Eigentum",
    "P01",
    "Person_ID",
    "",
    "belegt",
    "Eigentum P01",
  ],
  [
    "IMD-OBJ004-NIESSBRAUCH",
    "OBJ004",
    "Niessbrauch",
    "Eltern",
    "Hinweis",
    "",
    "belegt",
    "Voll abbezahlt; belegt; Niessbrauch gegenueber Eltern; keine Mieteinnahmen und keine laufenden Kosten",
  ],
];

function colName(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function importWorkbook(filePath) {
  const input = await FileBlob.load(filePath);
  return SpreadsheetFile.importXlsx(input);
}

function clearAndWriteRows(sheet, startRow, columnCount, rows, clearToRow = 100) {
  const endCol = colName(columnCount);
  sheet.getRange(`A${startRow}:${endCol}${clearToRow}`).values = Array.from(
    { length: clearToRow - startRow + 1 },
    () => Array.from({ length: columnCount }, () => null),
  );
  sheet.getRange(`A${startRow}:${endCol}${startRow + rows.length - 1}`).values = rows;
}

function writeAuditSheet(workbook, { financeWorkbookPath, outputPath }) {
  const sheet = workbook.worksheets.add("99_Stammdaten_Audit");
  sheet.showGridLines = false;
  sheet.getRange("A1:C1").merge();
  sheet.getRange("A1").values = [["99_Stammdaten_Audit"]];
  sheet.getRange("A1:C1").format = { fill: "#123047", font: { color: "#FFFFFF", bold: true, size: 16 } };
  sheet.getRange("A3:C10").values = [
    ["Kennzahl", "Wert", "Hinweis"],
    ["financeWorkbookPath", financeWorkbookPath, "Quelle der Finanzmodell-Kopie"],
    ["outputPath", outputPath, "Erzeugte Finanzmodell-Kopie"],
    ["objectsWritten", realEstateObjects.length, "04_Immobilien"],
    ["detailsWritten", realEstateDetails.length, "05_Immobilien_Details"],
    ["blockedRegularPayments", "SUG-20260521-007|SUG-20260521-009", "Objektanker fuer Zins/Tilgung und Miete"],
    ["deferredScope", "Darlehen|Restschuld|Grundsteuer|Versicherungen|Szenarioannahmen", "spaeter separat"],
    ["modelEffect", "beruecksichtigen", "Immobilien sollen modellwirksam werden; Annahmen folgen separat"],
  ];
  sheet.getRange("A3:C3").format = { fill: "#0F766E", font: { color: "#FFFFFF", bold: true } };
  sheet.getRange("A:A").format.columnWidthPx = 240;
  sheet.getRange("B:B").format.columnWidthPx = 520;
  sheet.getRange("C:C").format.columnWidthPx = 520;
}

export async function applyRealEstateMasterDataToFinanceCopy({ financeWorkbookPath, outputPath }) {
  const workbook = await importWorkbook(financeWorkbookPath);
  clearAndWriteRows(workbook.worksheets.getItem("04_Immobilien"), 7, 8, realEstateObjects);
  clearAndWriteRows(workbook.worksheets.getItem("05_Immobilien_Details"), 7, 8, realEstateDetails);
  writeAuditSheet(workbook, { financeWorkbookPath, outputPath });
  workbook.recalculate();

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  return {
    outputPath,
    objectsWritten: realEstateObjects.length,
    detailsWritten: realEstateDetails.length,
  };
}

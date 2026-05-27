import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch2_User_Categories_Accepted.xlsx";
const outputPath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch3_Regelzahlungen_Teil1_Accepted.xlsx";

const decisions = new Map([
  [
    "SUG-20260521-001",
    {
      decision: "annehmen",
      categoryId: "KAT001",
      personId: "P01",
      note: "Nutzerentscheidung: Einkommen fuer Lars/P01",
    },
  ],
  [
    "SUG-20260521-002",
    {
      decision: "annehmen",
      categoryId: "KAT001",
      personId: "P01",
      note: "Nutzerentscheidung: Einkommen fuer Lars/P01",
    },
  ],
  [
    "SUG-20260521-003",
    {
      decision: "annehmen",
      categoryId: "KAT001",
      personId: "P01",
      note: "Nutzerentscheidung: Einkommen fuer Lars/P01",
    },
  ],
  [
    "SUG-20260521-004",
    {
      decision: "ablehnen",
      categoryId: "KAT012",
      note: "Nutzerentscheidung: Buchungstext 'Uebertrag Kueche 2. Teil'; nicht als Regelzahlung uebernehmen, als Transfer pruefen",
    },
  ],
  [
    "SUG-20260521-005",
    {
      decision: "zurueckstellen",
      categoryId: "KAT012",
      personId: "P02",
      note: "Nutzerentscheidung: Partnertransfer P01/Lars -> P02/Katrin; nicht als normale Ausgabe uebernehmen",
    },
  ],
  [
    "SUG-20260521-007",
    {
      decision: "zurueckstellen",
      categoryId: "KAT002",
      personId: "HH",
      note: "Nutzerentscheidung: Zins und Tilgung zu 2/3; Objekt-/Immobilienbezug vor Annahme festlegen",
    },
  ],
  [
    "SUG-20260521-008",
    {
      decision: "ablehnen",
      categoryId: "KAT012",
      note: "Nutzerentscheidung: Buchungstext 'Uebertrag'; nicht als Regelzahlung uebernehmen, als Transfer pruefen",
    },
  ],
  [
    "SUG-20260521-009",
    {
      decision: "zurueckstellen",
      categoryId: "KAT002",
      personId: "HH",
      note: "Nutzerentscheidung: Miete 2/3 Haus; Objekt-/Immobilienbezug gemeinsam mit Zins/Tilgung festlegen",
    },
  ],
  [
    "SUG-20260521-010",
    {
      decision: "annehmen",
      categoryId: "KAT010",
      personId: "HH",
      note: "Nutzerentscheidung: Sparrate fuer Depot bei MLP",
    },
  ],
]);

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
  let rejected = 0;
  let deferred = 0;

  values.slice(1).forEach((row, zeroIndex) => {
    const id = row[ix.Vorschlag_ID];
    const decision = decisions.get(id);
    if (!decision) return;
    const excelRow = zeroIndex + 2;
    sheet.getRange(`A${excelRow}`).values = [[decision.decision]];
    sheet.getRange(`O${excelRow}`).values = [[decision.categoryId ?? row[ix.Ziel_Kategorie_ID]]];
    sheet.getRange(`P${excelRow}`).values = [[decision.personId ?? row[ix.Ziel_Person_ID]]];
    sheet.getRange(`S${excelRow}`).values = [[decision.note]];
    if (decision.decision === "annehmen") accepted += 1;
    if (decision.decision === "ablehnen") rejected += 1;
    if (decision.decision === "zurueckstellen") deferred += 1;
  });

  const audit = workbook.worksheets.add("Batch3_Regelzahlungen_Audit");
  audit.showGridLines = false;
  audit.getRange("A1:D1").merge();
  audit.getRange("A1").values = [["Batch3 Regelzahlungen Teil 1 Audit"]];
  audit.getRange("A1:D1").format = { fill: "#123047", font: { color: "#FFFFFF", bold: true, size: 16 } };
  audit.getRange("A3:C9").values = [
    ["Kennzahl", "Wert", "Hinweis"],
    ["Quelle", sourcePath, "Batch-2-Reviewstand"],
    ["Output", outputPath, "Review-Kopie mit Nutzerentscheidungen"],
    ["Angenommene Regelzahlungen", accepted, "001, 002, 003, 010"],
    ["Abgelehnte Regelzahlungen", rejected, "004 und 008 sind Uebertrag/Transfer statt Regelzahlung"],
    ["Zurueckgestellte Vorschlaege", deferred, "005, 007, 009 brauchen Transfer-/Objektklaerung"],
    ["SUG-20260521-006", "offen", "bewusst nicht entschieden; Buchungstext mischt Sparrate und Mieteinnahmen"],
  ];
  audit.getRange("A3:C3").format = { fill: "#0F766E", font: { color: "#FFFFFF", bold: true } };
  audit.getRange("A:A").format.columnWidthPx = 260;
  audit.getRange("B:B").format.columnWidthPx = 500;
  audit.getRange("C:C").format.columnWidthPx = 520;

  workbook.recalculate();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  return { outputPath, accepted, rejected, deferred, leftOpen: ["SUG-20260521-006"] };
}

console.log(JSON.stringify(await main(), null, 2));

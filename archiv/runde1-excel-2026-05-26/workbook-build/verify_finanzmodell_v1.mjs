import { pathToFileURL } from "node:url";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const defaultWorkbookPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Startmappe.xlsx";

const expectedSheets = [
  "00_Dashboard",
  "01_Personen",
  "02_Kategorien",
  "03_Konten",
  "04_Immobilien",
  "05_Immobilien_Details",
  "06_Versicherungen",
  "07_Rente",
  "10_Umsaetze_Roh",
  "11_Umsaetze_Modell",
  "12_Regelzahlungen",
  "20_Vermoegen",
  "30_Cashflow",
  "40_Szenarien",
  "41_Ereignisse",
  "42_Annahmen",
  "43_Zeitachse",
  "44_Liquiditaet",
  "60_Warnungen",
  "73_Agent_Vorschlaege",
  "90_Quellen",
  "98_Kontrollspur",
  "99_Checks",
];

function records(ndjson) {
  return ndjson
    .split("\n")
    .filter((line) => line.trim().startsWith("{"))
    .map((line) => JSON.parse(line));
}

function assertCheck(condition, name, detail = "") {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
  }
  return { name, status: "ok", detail };
}

export async function verifyFinanceWorkbook({ workbookPath = defaultWorkbookPath } = {}) {
  const input = await FileBlob.load(workbookPath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  workbook.recalculate();

  const results = [];

  const inventory = records(
    (await workbook.inspect({
    kind: "sheet",
    include: "name,index,tables",
    maxChars: 20000,
    summary: "sheet inventory",
    })).ndjson,
  );
  const sheetNames = inventory.filter((row) => row.kind === "sheet").map((row) => row.name);
  results.push(assertCheck(sheetNames.length === expectedSheets.length, "sheet count is 23", String(sheetNames.length)));
  results.push(assertCheck(JSON.stringify(sheetNames) === JSON.stringify(expectedSheets), "sheet order matches final artifact"));

  const dashboard = records(
    (await workbook.inspect({
    kind: "table",
    range: "00_Dashboard!A1:M20",
    include: "values,formulas",
    tableMaxRows: 20,
    tableMaxCols: 13,
    summary: "dashboard",
    })).ndjson,
  ).find((row) => row.kind === "table");
  const dashboardRows = dashboard.values;
  results.push(assertCheck(dashboardRows[3][1] === "Rot", "dashboard Modellstatus is Rot"));
  results.push(assertCheck(dashboardRows[4][1] === "nicht_ausgefuehrt", "dashboard Kontrollstatus is nicht_ausgefuehrt"));
  results.push(assertCheck(dashboardRows[9][1] === 4250, "Liquiditaet heute is calculated", String(dashboardRows[9][1])));
  results.push(assertCheck(dashboardRows[10][1] === 1250, "freie Liquiditaet is calculated", String(dashboardRows[10][1])));
  results.push(assertCheck(Math.abs(dashboardRows[11][1] - 1038.68) < 0.001, "Cashflow Monat ist calculated", String(dashboardRows[11][1])));
  results.push(assertCheck(Math.abs(dashboardRows[12][1] - 0.6) < 0.001, "Reichweite is calculated", String(dashboardRows[12][1])));
  results.push(assertCheck(dashboardRows[13][1] === 7, "dashboard open checks count is 7"));

const cashflowTable = records(
  (await workbook.inspect({
    kind: "table",
    range: "30_Cashflow!A6:H10",
    include: "values,formulas",
    tableMaxRows: 5,
    tableMaxCols: 8,
    summary: "cashflow metrics",
  })).ndjson,
).find((row) => row.kind === "table");
const cashflowRows = cashflowTable.values.slice(1);
const expectedCashflow = cashflowRows.find((row) => row[0] === "CF002");
const uncategorizedShare = cashflowRows.find((row) => row[0] === "CF003");
results.push(assertCheck(expectedCashflow?.[3] === -2100, "expected monthly cashflow is calculated", String(expectedCashflow?.[3])));
results.push(assertCheck(Math.abs(uncategorizedShare?.[3] - 5.13) < 0.001, "uncategorized expense share is calculated", String(uncategorizedShare?.[3])));

const timelineTable = records(
  (await workbook.inspect({
    kind: "table",
    range: "43_Zeitachse!A6:G10",
    include: "values,formulas",
    tableMaxRows: 5,
    tableMaxCols: 7,
    summary: "scenario timeline",
  })).ndjson,
).find((row) => row.kind === "table");
const timelineRows = timelineTable.values.slice(1);
results.push(assertCheck(timelineRows[0][3] === -2100 && timelineRows[0][4] === 2150, "timeline month 1 is calculated"));
results.push(assertCheck(timelineRows[1][3] === -2100 && timelineRows[1][4] === 50, "timeline month 2 is calculated"));
results.push(assertCheck(timelineRows[2][3] === -2100 && timelineRows[2][4] === -2050, "timeline month 3 is calculated"));

const liquidityTable = records(
  (await workbook.inspect({
    kind: "table",
    range: "44_Liquiditaet!A6:H10",
    include: "values,formulas",
    tableMaxRows: 5,
    tableMaxCols: 8,
    summary: "liquidity metrics",
  })).ndjson,
).find((row) => row.kind === "table");
const liquidityRows = liquidityTable.values.slice(1);
const runway = liquidityRows.find((row) => row[0] === "LIQ003");
results.push(assertCheck(Math.abs(runway?.[2] - 0.6) < 0.001, "liquidity runway metric is calculated", String(runway?.[2])));

const checksTable = records(
  (await workbook.inspect({
    kind: "table",
    range: "99_Checks!A6:N13",
    include: "values,formulas",
    tableMaxRows: 8,
    tableMaxCols: 14,
    summary: "checks",
  })).ndjson,
).find((row) => row.kind === "table");
const checkRows = checksTable.values.slice(1);
const checkIds = new Set(checkRows.map((row) => row[0]));
results.push(assertCheck(checkIds.has("CHK-BLD-01"), "CHK-BLD-01 exists"));
results.push(assertCheck(checkIds.has("CHK003"), "CHK003 exists"));
results.push(assertCheck(checkIds.has("CHK012"), "CHK012 exists"));
results.push(assertCheck(checkIds.has("CHK015"), "CHK015 exists"));
results.push(assertCheck(checkIds.has("CHK016"), "CHK016 exists"));
results.push(assertCheck(checkRows.every((row) => row[4] === "offen"), "all visible checks are open"));
results.push(assertCheck(checkRows.some((row) => row[8] === "BLD-20260521-001"), "checks reference build verification"));
results.push(assertCheck(checkRows.some((row) => row[7] === "IMP-20260518-001"), "checks reference import run"));
results.push(assertCheck(checkRows.some((row) => row[6] === "ASM002"), "checks reference placeholder assumption"));
results.push(assertCheck(checkRows.some((row) => row[5] === "SRC-20260518-001"), "checks reference source"));
results.push(assertCheck(checkRows.some((row) => row[10] === "REG001"), "checks reference unconfirmed regular payment"));
results.push(assertCheck(checkRows.some((row) => row[10] === "MON202607"), "checks reference negative timeline month"));

const rawImport = records(
  (await workbook.inspect({
    kind: "table",
    range: "10_Umsaetze_Roh!A6:M16",
    include: "values,formulas",
    tableMaxRows: 12,
    tableMaxCols: 13,
    summary: "raw import",
  })).ndjson,
).find((row) => row.kind === "table");
results.push(assertCheck(rawImport.values.some((row) => row[0] === "IMP-20260518-001"), "import run exists"));
results.push(assertCheck(rawImport.values.filter((row) => String(row[0] ?? "").startsWith("RAW-")).length === 4, "four raw transactions exist"));

const formulaErrors = (await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "formula errors",
})).ndjson;
results.push(assertCheck(formulaErrors.includes("matched 0 entries"), "formula error scan has 0 matches"));

  return { workbookPath, checks: results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await verifyFinanceWorkbook(), null, 2));
}

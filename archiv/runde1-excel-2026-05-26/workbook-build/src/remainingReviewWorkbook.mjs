import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const reviewHeaders = [
  "Entscheidung",
  "Vorschlag_ID",
  "Typ",
  "Prioritaet",
  "Konfidenz",
  "Empfohlene_Aktion",
  "Name_oder_Muster",
  "Betrag",
  "Treffer",
  "Erstes_Datum",
  "Letztes_Datum",
  "Betroffene_Tabelle",
  "Betroffene_ID",
  "Naechste_Entscheidung",
  "Ziel_Kategorie_ID",
  "Ziel_Person_ID",
  "Ziel_Konto_ID",
  "Ziel_Transfer_Typ",
  "Entscheidung_Notiz",
  "Begruendung",
  "Kommentar",
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

function normalizeDecision(value) {
  return String(value ?? "").trim().toLowerCase();
}

function toIsoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + Math.round(value) * 86400000).toISOString().slice(0, 10);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return value ?? "";
}

async function importWorkbook(filePath) {
  const input = await FileBlob.load(filePath);
  return SpreadsheetFile.importXlsx(input);
}

function readReviewRows(workbook) {
  const sheet = workbook.worksheets.getItem("Review_Liste");
  const values = sheet.getRange(`A1:${colName(reviewHeaders.length)}10000`).values;
  const headers = values[0];
  const indexes = reviewHeaders.map((header) => headers.indexOf(header));
  return values
    .slice(1)
    .filter((row) => row[indexes[1]] !== null && row[indexes[1]] !== undefined && row[indexes[1]] !== "")
    .map((row) => Object.fromEntries(reviewHeaders.map((header, index) => [header, row[indexes[index]]])));
}

function priorityScore(row) {
  const priority = row.Prioritaet === "hoch" ? 3 : row.Prioritaet === "normal" ? 2 : 1;
  const amount = Math.abs(Number(row.Betrag) || 0);
  const confidence = Number(row.Konfidenz) || 0;
  return priority * 1_000_000 + amount * 100 + confidence;
}

function decisionBlocker(row) {
  if (row.Typ === "neue_Regelzahlung") {
    const missing = [
      row.Ziel_Kategorie_ID ? null : "Kategorie_ID fehlt",
      row.Ziel_Person_ID ? null : "Person_ID fehlt",
    ].filter(Boolean);
    return missing.length ? missing.join("; ") : "apply-faehig nach Annahme";
  }
  if (row.Typ === "Kategorie_Mapping") {
    return row.Ziel_Kategorie_ID ? "Kategorie bestaetigen oder zurueckstellen" : "Kategorie_ID fehlt";
  }
  if (row.Typ === "neue_Transferregel") {
    return row.Ziel_Transfer_Typ ? "Transfer bestaetigen oder ablehnen" : "Transfer_Typ fehlt";
  }
  return "Typ pruefen";
}

function commonRow(row) {
  return {
    Vorschlag_ID: row.Vorschlag_ID,
    Typ: row.Typ,
    Prioritaet: row.Prioritaet,
    Konfidenz: row.Konfidenz,
    Name_oder_Muster: row.Name_oder_Muster,
    Betrag: row.Betrag,
    Treffer: row.Treffer,
    Erstes_Datum: toIsoDate(row.Erstes_Datum),
    Letztes_Datum: toIsoDate(row.Letztes_Datum),
    Betroffene_Tabelle: row.Betroffene_Tabelle,
    Betroffene_ID: row.Betroffene_ID,
    Ziel_Kategorie_ID: row.Ziel_Kategorie_ID,
    Ziel_Person_ID: row.Ziel_Person_ID,
    Ziel_Transfer_Typ: row.Ziel_Transfer_Typ,
    Entscheidung_Blocker: decisionBlocker(row),
    Empfehlung: row.Typ === "neue_Regelzahlung" ? "Person_ID und Kategorie pruefen" : "entscheiden oder bewusst zurueckstellen",
    Begruendung: row.Begruendung,
    Kommentar: row.Kommentar,
  };
}

function writeTitle(sheet, title, subtitle) {
  sheet.showGridLines = false;
  sheet.getRange("A1:H1").merge();
  sheet.getRange("A1").values = [[title]];
  sheet.getRange("A1:H1").format = { fill: "#123047", font: { color: "#FFFFFF", bold: true, size: 16 } };
  sheet.getRange("A2:H2").merge();
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange("A2:H2").format = { fill: "#EAF2F8", font: { color: "#334155", size: 10 }, wrapText: true };
}

function writeTable(sheet, startCell, headers, rows) {
  const startCol = startCell.match(/[A-Z]+/)[0];
  const startRow = Number(startCell.match(/\d+/)[0]);
  const startColIndex = startCol.charCodeAt(0) - 64;
  const endCol = colName(startColIndex + headers.length - 1);
  const endRow = startRow + rows.length;
  sheet.getRange(`${startCell}:${endCol}${endRow}`).values = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))];
  sheet.getRange(`${startCell}:${endCol}${startRow}`).format = {
    fill: "#0F766E",
    font: { color: "#FFFFFF", bold: true },
    wrapText: true,
    borders: { preset: "all", style: "thin", color: "#CBD5E1" },
  };
  if (rows.length > 0) {
    sheet.getRange(`${startCol}${startRow + 1}:${endCol}${endRow}`).format = {
      font: { color: "#334155", size: 10 },
      wrapText: true,
      borders: { preset: "all", style: "thin", color: "#CBD5E1" },
    };
  }
  sheet.freezePanes.freezeRows(startRow);
}

function setWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getRange(`${colName(index + 1)}:${colName(index + 1)}`).format.columnWidthPx = width;
  });
}

export async function buildRemainingReviewWorkbook({ reviewWorkbookPath, outputPath }) {
  const sourceWorkbook = await importWorkbook(reviewWorkbookPath);
  const openRows = readReviewRows(sourceWorkbook)
    .filter((row) => !normalizeDecision(row.Entscheidung))
    .sort((a, b) => priorityScore(b) - priorityScore(a) || String(a.Vorschlag_ID).localeCompare(String(b.Vorschlag_ID)));
  const regularRows = openRows.filter((row) => row.Typ === "neue_Regelzahlung").map(commonRow);
  const categoryRows = openRows.filter((row) => row.Typ === "Kategorie_Mapping").map(commonRow);
  const transferRows = openRows.filter((row) => row.Typ === "neue_Transferregel").map(commonRow);
  const blockedWithoutPerson = regularRows.filter((row) => String(row.Entscheidung_Blocker).includes("Person_ID fehlt")).length;

  const workbook = Workbook.create();
  const summary = workbook.worksheets.add("Summary");
  const regular = workbook.worksheets.add("Offene_Regelzahlungen");
  const categories = workbook.worksheets.add("Offene_Kategorie_Mappings");
  const transfers = workbook.worksheets.add("Offene_Transfers");

  writeTitle(summary, "Offene Entscheidungen", "Rest-Review nach Batch-1-Apply; diese Mappe veraendert keine Masterdaten.");
  writeTable(summary, "A4", ["Kennzahl", "Wert", "Hinweis"], [
    { Kennzahl: "Review-Quelle", Wert: reviewWorkbookPath, Hinweis: "Arbeitskopie nach Batch 1" },
    { Kennzahl: "Offen gesamt", Wert: openRows.length, Hinweis: "noch ohne Entscheidung" },
    { Kennzahl: "Offene Regelzahlungen", Wert: regularRows.length, Hinweis: "erst annehmen, wenn Kategorie_ID und Person_ID belastbar sind" },
    { Kennzahl: "Regelzahlungen mit Person_ID-Blocker", Wert: blockedWithoutPerson, Hinweis: "Person_ID fehlt" },
    { Kennzahl: "Offene Kategorie-Mappings", Wert: categoryRows.length, Hinweis: "Kategorie bestaetigen oder zurueckstellen" },
    { Kennzahl: "Offene Transfers", Wert: transferRows.length, Hinweis: transferRows.length === 0 ? "Keine offenen Transfers" : "Transfer bestaetigen oder ablehnen" },
  ]);
  setWidths(summary, [260, 520, 520]);

  const headers = [
    "Vorschlag_ID",
    "Typ",
    "Prioritaet",
    "Konfidenz",
    "Name_oder_Muster",
    "Betrag",
    "Treffer",
    "Erstes_Datum",
    "Letztes_Datum",
    "Betroffene_ID",
    "Ziel_Kategorie_ID",
    "Ziel_Person_ID",
    "Ziel_Transfer_Typ",
    "Entscheidung_Blocker",
    "Empfehlung",
    "Begruendung",
    "Kommentar",
  ];

  writeTitle(regular, "Offene_Regelzahlungen", "Keine automatische Annahme: Person_ID ist Pflicht und derzeit der Hauptblocker.");
  writeTable(regular, "A4", headers, regularRows);
  setWidths(regular, [145, 145, 90, 90, 260, 100, 80, 105, 105, 320, 130, 120, 150, 220, 260, 360, 360]);

  writeTitle(categories, "Offene_Kategorie_Mappings", "Diese neun Kategorie-Mappings sind nach Batch 1 noch nicht entschieden.");
  writeTable(categories, "A4", headers, categoryRows);
  setWidths(categories, [145, 145, 90, 90, 260, 100, 80, 105, 105, 320, 130, 120, 150, 220, 260, 360, 360]);

  writeTitle(transfers, "Offene_Transfers", transferRows.length === 0 ? "Keine offenen Transfers nach Batch 1." : "Transfers separat pruefen.");
  writeTable(transfers, "A4", headers, transferRows);
  setWidths(transfers, [145, 145, 90, 90, 260, 100, 80, 105, 105, 320, 130, 120, 150, 220, 260, 360, 360]);

  workbook.recalculate();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  return {
    outputPath,
    counts: {
      openTotal: openRows.length,
      openRegularPayments: regularRows.length,
      openCategoryMappings: categoryRows.length,
      openTransferRules: transferRows.length,
      blockedWithoutPerson,
    },
  };
}

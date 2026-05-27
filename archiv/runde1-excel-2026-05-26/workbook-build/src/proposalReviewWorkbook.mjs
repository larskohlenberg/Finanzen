import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";
import {
  analysisSuggestionColumns,
  analysisSuggestionLayouts,
} from "./analysisSuggestionWriterVerifier.mjs";

const colors = {
  navy: "#123047",
  teal: "#0F766E",
  slate: "#334155",
  line: "#CBD5E1",
  gray: "#F3F6F8",
  paleBlue: "#EAF2F8",
  paleYellow: "#FEF3C7",
  white: "#FFFFFF",
  red: "#B91C1C",
};

function colName(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
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

function readTable(workbook, tableName) {
  const layout = analysisSuggestionLayouts[tableName];
  const columns = analysisSuggestionColumns[tableName];
  const sheet = workbook.worksheets.getItem(layout.sheetName);
  const endCol = colName(columns.length);
  const values = sheet.getRange(`A${layout.dataStartRow}:${endCol}${layout.scanEndRow}`).values;
  return values
    .filter((row) => row[0] !== null && row[0] !== undefined && row[0] !== "")
    .map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
}

function readIdRows(workbook, sheetName, idColumn, labelColumns = [], headerRow = 6, maxRows = 500) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const values = sheet.getRange(`A${headerRow}:H${maxRows}`).values;
  const headers = values[0];
  const idIndex = headers.indexOf(idColumn);
  const labelIndexes = labelColumns.map((column) => headers.indexOf(column));
  if (idIndex < 0) return [];
  return values
    .slice(1)
    .filter((row) => row[idIndex] !== null && row[idIndex] !== undefined && row[idIndex] !== "")
    .map((row) => ({
      id: String(row[idIndex]),
      label: labelIndexes
        .map((index) => (index >= 0 ? row[index] : ""))
        .filter((value) => value !== null && value !== undefined && value !== "")
        .join(" | "),
    }));
}

function styleHeader(range) {
  range.format = {
    fill: colors.teal,
    font: { color: colors.white, bold: true, size: 10 },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "all", style: "thin", color: colors.line },
  };
  range.format.rowHeightPx = 36;
}

function styleBody(range) {
  range.format = {
    font: { name: "Aptos", size: 10, color: colors.slate },
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "all", style: "thin", color: colors.line },
  };
}

function writeTable(sheet, startCell, headers, rows) {
  const startCol = startCell.match(/[A-Z]+/)[0];
  const startRow = Number(startCell.match(/\d+/)[0]);
  const startColIndex = startCol.charCodeAt(0) - 64;
  const endCol = colName(startColIndex + headers.length - 1);
  const endRow = startRow + rows.length;
  sheet.getRange(`${startCell}:${endCol}${endRow}`).values = [headers, ...rows];
  styleHeader(sheet.getRange(`${startCell}:${endCol}${startRow}`));
  if (rows.length > 0) styleBody(sheet.getRange(`${startCol}${startRow + 1}:${endCol}${endRow}`));
  return { endCol, endRow };
}

function priorityScore(row) {
  const priority = row.Prioritaet === "hoch" ? 3 : row.Prioritaet === "normal" ? 2 : 1;
  const confidence = Number(row.Konfidenz) || 0;
  return priority * 100 + confidence;
}

function reviewAction(row) {
  if (row.Vorschlagstyp === "neue_Regelzahlung") return "annehmen / ablehnen / zusammenfuehren";
  if (row.Vorschlagstyp === "neue_Transferregel") return "Transfer bestaetigen oder verwerfen";
  if (row.Vorschlagstyp === "Kategorie_Mapping") return "Kategorie festlegen";
  return "pruefen";
}

function makeReviewRows(agentSuggestions, regularPaymentById) {
  return agentSuggestions
    .map((row) => {
      const regular = regularPaymentById.get(row.Vorschlag_ID);
      return {
        Entscheidung: "",
        Vorschlag_ID: row.Vorschlag_ID,
        Typ: row.Vorschlagstyp,
        Prioritaet: row.Prioritaet,
        Konfidenz: row.Konfidenz,
        Empfohlene_Aktion: row.Empfohlene_Aktion,
        Name_oder_Muster: regular?.Vorgeschlagener_Name ?? "",
        Betrag: regular?.Median_Betrag ?? "",
        Treffer: regular?.Treffer_Anzahl ?? "",
        Erstes_Datum: toIsoDate(regular?.Erstes_Datum),
        Letztes_Datum: toIsoDate(regular?.Letztes_Datum),
        Betroffene_Tabelle: row.Betroffene_Tabelle,
        Betroffene_ID: row.Betroffene_ID,
        Naechste_Entscheidung: reviewAction(row),
        Ziel_Kategorie_ID: regular?.Kategorie_ID_Vorschlag ?? "",
        Ziel_Person_ID: regular?.Person_ID_Vorschlag ?? "",
        Ziel_Konto_ID: regular?.Konto_ID ?? "",
        Ziel_Transfer_Typ: "",
        Entscheidung_Notiz: "",
        Begruendung: row.Begruendung,
        Kommentar: row.Kommentar,
      };
    })
    .sort((a, b) => priorityScore(b) - priorityScore(a) || String(a.Vorschlag_ID).localeCompare(String(b.Vorschlag_ID)));
}

function setWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getRange(`${colName(index + 1)}:${colName(index + 1)}`).format.columnWidthPx = width;
  });
}

function buildSummarySheet(sheet, counts, reviewRowCount) {
  sheet.showGridLines = false;
  sheet.getRange("A1:H1").merge();
  sheet.getRange("A1").values = [["Vorschlagsreview"]];
  sheet.getRange("A1:H1").format = {
    fill: colors.navy,
    font: { color: colors.white, bold: true, size: 18 },
    horizontalAlignment: "left",
    verticalAlignment: "center",
  };
  sheet.getRange("A1:H1").format.rowHeightPx = 42;
  sheet.getRange("A2:H2").merge();
  sheet.getRange("A2").values = [["Arbeitsmappe zur Entscheidung ueber Agentenvorschlaege. Diese Datei setzt nichts um."]];
  sheet.getRange("A2:H2").format = { fill: colors.paleBlue, font: { color: colors.slate, size: 11 }, wrapText: true };

  const rows = [
    ["Bereich", "Anzahl", "Naechste Aktion"],
    ["Regelzahlungen", counts.regularPaymentSuggestions, "annehmen, ablehnen oder zusammenfuehren"],
    ["Transfers", counts.transferSuggestions, "bestaetigen oder verwerfen"],
    ["Kategorie-Mappings", counts.categorySuggestions, "Zielkategorie festlegen"],
    ["Alle Vorschlaege", counts.allSuggestions, "Priorisiert in Review_Liste bearbeiten"],
  ];
  writeTable(sheet, "A4", rows[0], rows.slice(1));
  sheet.getRange("A8:C8").format = { fill: colors.paleYellow, font: { color: colors.red, bold: true }, wrapText: true };
  const lastReviewRow = reviewRowCount + 1;
  const progressRows = [
    ["Offen", "", "Noch nicht entschieden"],
    ["Angenommen", "", "Fliessen in Entscheidungsplan, falls vollstaendig"],
    ["Abgelehnt", "", "Bleiben dokumentiert, werden nicht umgesetzt"],
    ["Zusammengefuehrt", "", "Manuell mit anderem Vorschlag zusammenfassen"],
    ["Zurueckgestellt", "", "Spaeter pruefen"],
    ["Unvollstaendige angenommene Entscheidungen", "", "Vor Plan-Build Zielwerte ergaenzen"],
  ];
  writeTable(sheet, "A10", ["Review-Fortschritt", "Wert", "Hinweis"], progressRows);
  sheet.getRange("B11:B16").formulas = [
    [`=COUNTIF(Review_Liste!$A$2:$A$${lastReviewRow},"")`],
    [`=COUNTIF(Review_Liste!$A$2:$A$${lastReviewRow},"annehmen")`],
    [`=COUNTIF(Review_Liste!$A$2:$A$${lastReviewRow},"ablehnen")`],
    [`=COUNTIF(Review_Liste!$A$2:$A$${lastReviewRow},"zusammenfuehren")`],
    [`=COUNTIF(Review_Liste!$A$2:$A$${lastReviewRow},"zurueckstellen")`],
    [`=COUNTIF(Review_Liste!$V$2:$V$${lastReviewRow},"unvollstaendig")`],
  ];
  sheet.getRange("A16:C16").format = { fill: colors.paleYellow, font: { color: colors.red, bold: true }, wrapText: true };
  setWidths(sheet, [190, 100, 340, 120, 120, 120, 120, 120]);
}

function buildReviewSheet(sheet, reviewRows) {
  sheet.showGridLines = false;
  const headers = [
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
    "Check_Status",
    "Pflichtfeld_Hinweis",
  ];
  const rows = reviewRows.map((row) => headers.map((header) => row[header]));
  writeTable(sheet, "A1", headers, rows);
  setWidths(sheet, [130, 145, 145, 90, 90, 220, 220, 110, 80, 110, 110, 170, 220, 220, 130, 130, 130, 140, 220, 300, 300, 130, 220]);
  sheet.freezePanes.freezeRows(1);
  sheet.getRange(`A2:A${rows.length + 1}`).dataValidation = {
    allowBlank: true,
    list: { inCellDropDown: true, source: ["annehmen", "ablehnen", "zusammenfuehren", "zurueckstellen"] },
  };
  if (rows.length > 0) {
    const statusFormulas = rows.map((_, index) => {
      const row = index + 2;
      return [
        `=IF($A${row}="","offen",IF($A${row}<>"annehmen","ok",IF(AND($C${row}="neue_Regelzahlung",OR($O${row}="",$P${row}="")),"unvollstaendig",IF(AND($C${row}="Kategorie_Mapping",$O${row}=""),"unvollstaendig",IF(AND($C${row}="neue_Transferregel",$R${row}=""),"unvollstaendig","ok")))))`,
      ];
    });
    const hintFormulas = rows.map((_, index) => {
      const row = index + 2;
      return [
        `=IF($A${row}="","",IF($A${row}<>"annehmen","",IF(AND($C${row}="neue_Regelzahlung",$O${row}=""),"Ziel_Kategorie_ID fehlt",IF(AND($C${row}="neue_Regelzahlung",$P${row}=""),"Ziel_Person_ID fehlt",IF(AND($C${row}="Kategorie_Mapping",$O${row}=""),"Ziel_Kategorie_ID fehlt",IF(AND($C${row}="neue_Transferregel",$R${row}=""),"Ziel_Transfer_Typ fehlt",""))))))`,
      ];
    });
    sheet.getRange(`V2:V${rows.length + 1}`).formulas = statusFormulas;
    sheet.getRange(`W2:W${rows.length + 1}`).formulas = hintFormulas;
  }
}

function buildReviewListSheet(sheet, lists) {
  sheet.showGridLines = false;
  const headers = [
    "Entscheidung",
    "Kategorie_ID",
    "Kategorie_Label",
    "Person_ID",
    "Person_Label",
    "Konto_ID",
    "Konto_Label",
    "Transfer_Typ",
  ];
  const decisions = ["annehmen", "ablehnen", "zusammenfuehren", "zurueckstellen"];
  const transferTypes = ["Eigenumbuchung", "Sparen_Investieren", "Kredit_Tilgung", "Sonstiger_Transfer"];
  const maxRows = Math.max(
    decisions.length,
    lists.categories.length,
    lists.people.length,
    lists.accounts.length,
    transferTypes.length,
  );
  const rows = Array.from({ length: maxRows }, (_, index) => [
    decisions[index] ?? "",
    lists.categories[index]?.id ?? "",
    lists.categories[index]?.label ?? "",
    lists.people[index]?.id ?? "",
    lists.people[index]?.label ?? "",
    lists.accounts[index]?.id ?? "",
    lists.accounts[index]?.label ?? "",
    transferTypes[index] ?? "",
  ]);

  writeTable(sheet, "A1", headers, rows);
  setWidths(sheet, [150, 120, 240, 100, 220, 110, 240, 170]);
  sheet.freezePanes.freezeRows(1);
}

function applyReviewDropdowns(sheet, reviewRowCount, lists) {
  if (reviewRowCount <= 0) return;
  const lastReviewRow = reviewRowCount + 1;
  const decisionEnd = 1 + 4;
  const categoryEnd = 1 + lists.categories.length;
  const peopleEnd = 1 + lists.people.length;
  const accountEnd = 1 + lists.accounts.length;
  const transferEnd = 1 + 4;
  const validations = [
    [`A2:A${lastReviewRow}`, `=Review_Listen!$A$2:$A$${decisionEnd}`],
    [`O2:O${lastReviewRow}`, `=Review_Listen!$B$2:$B$${categoryEnd}`],
    [`P2:P${lastReviewRow}`, `=Review_Listen!$D$2:$D$${peopleEnd}`],
    [`Q2:Q${lastReviewRow}`, `=Review_Listen!$F$2:$F$${accountEnd}`],
    [`R2:R${lastReviewRow}`, `=Review_Listen!$H$2:$H$${transferEnd}`],
  ];

  for (const [range, source] of validations) {
    sheet.getRange(range).dataValidation = {
      allowBlank: true,
      list: { inCellDropDown: true, source },
    };
  }
}

function buildRawSheet(sheet, title, headers, rows) {
  sheet.showGridLines = false;
  sheet.getRange("A1").values = [[title]];
  sheet.getRange("A1").format = { font: { bold: true, size: 14, color: colors.navy } };
  writeTable(sheet, "A3", headers, rows.map((row) => headers.map((header) => toIsoDate(row[header]))));
  setWidths(sheet, headers.map((header) => (header.includes("Kommentar") || header.includes("Begruendung") || header.includes("Hinweis") ? 260 : 135)));
  sheet.freezePanes.freezeRows(3);
}

export async function buildProposalReviewWorkbook({
  analysisWorkbookPath,
  outputPath,
  analysisRunId = "RUN-20260521-ANALYSIS",
}) {
  const input = await FileBlob.load(analysisWorkbookPath);
  const sourceWorkbook = await SpreadsheetFile.importXlsx(input);
  const regularPayments = readTable(sourceWorkbook, "12_Regelzahlung_Vorschlaege")
    .filter((row) => row.Lauf_ID === analysisRunId);
  const agentSuggestions = readTable(sourceWorkbook, "73_Agent_Vorschlaege")
    .filter((row) => row.Lauf_ID === analysisRunId);

  const regularPaymentById = new Map(regularPayments.map((row) => [row.Vorschlag_ID, row]));
  const lists = {
    categories: readIdRows(sourceWorkbook, "02_Kategorien", "Kategorie_ID", ["Name", "Gruppe", "Cashflow_Typ"]),
    people: readIdRows(sourceWorkbook, "01_Personen", "Person_ID", ["Name_Rolle", "Typ"]),
    accounts: readIdRows(sourceWorkbook, "03_Konten", "Konto_ID", ["Name", "Kontoart", "Person_ID"]),
  };
  const counts = {
    regularPaymentSuggestions: regularPayments.length,
    transferSuggestions: agentSuggestions.filter((row) => row.Vorschlagstyp === "neue_Transferregel").length,
    categorySuggestions: agentSuggestions.filter((row) => row.Vorschlagstyp === "Kategorie_Mapping").length,
    allSuggestions: agentSuggestions.length,
  };

  const workbook = Workbook.create();
  const summarySheet = workbook.worksheets.add("Summary");
  const reviewSheet = workbook.worksheets.add("Review_Liste");
  const regularSheet = workbook.worksheets.add("Regelzahlungen_Roh");
  const agentSheet = workbook.worksheets.add("Agentvorschlaege_Roh");
  const listSheet = workbook.worksheets.add("Review_Listen");

  const reviewRows = makeReviewRows(agentSuggestions, regularPaymentById);
  buildSummarySheet(summarySheet, counts, reviewRows.length);
  buildReviewSheet(reviewSheet, reviewRows);
  buildReviewListSheet(listSheet, lists);
  applyReviewDropdowns(reviewSheet, reviewRows.length, lists);
  buildRawSheet(regularSheet, "Regelzahlungsvorschlaege Roh", analysisSuggestionColumns["12_Regelzahlung_Vorschlaege"], regularPayments);
  buildRawSheet(agentSheet, "Agentvorschlaege Roh", analysisSuggestionColumns["73_Agent_Vorschlaege"], agentSuggestions);

  workbook.recalculate();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  return { outputPath, counts };
}

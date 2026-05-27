import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";
import { tableColumns, targetTableLayouts } from "./src/importWriterVerifier.mjs";

const reviewWorkbookPath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview.xlsx";
const analysisWorkbookPath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_AgentDraft_Full_Analysis.xlsx";
const outputPath = "./outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungshilfe.xlsx";

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

const regularSuggestionHeaders = [
  "Vorschlag_ID",
  "Erkannt_am",
  "Lauf_ID",
  "Vorgeschlagener_Name",
  "Vorgeschlagene_Frequenz",
  "Treffer_Anzahl",
  "Erstes_Datum",
  "Letztes_Datum",
  "Median_Betrag",
  "Betrag_Min",
  "Betrag_Max",
  "Betrag_Variabilitaet",
  "Typ",
  "Kategorie_ID_Vorschlag",
  "Person_ID_Vorschlag",
  "Konto_ID",
  "Gegenpartei_Muster",
  "IBAN_Muster",
  "Verwendungszweck_Muster",
  "Konfidenz",
  "Status",
  "Erkennungs_Hinweis",
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

function toIsoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + Math.round(value) * 86400000).toISOString().slice(0, 10);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return value ?? "";
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function displayText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function score(row) {
  const priority = row.Prioritaet === "hoch" ? 3 : row.Prioritaet === "normal" ? 2 : 1;
  const amount = Math.abs(Number(row.Betrag ?? row.Raw_Betrag ?? 0));
  const confidence = Number(row.Konfidenz) || 0;
  return priority * 1_000_000 + amount * 100 + confidence;
}

async function importWorkbook(filePath) {
  const input = await FileBlob.load(filePath);
  return SpreadsheetFile.importXlsx(input);
}

function readSheetRows(workbook, sheetName, headerRow, headers, maxRows = 10000) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const endCol = colName(headers.length);
  const values = sheet.getRange(`A${headerRow}:${endCol}${maxRows}`).values;
  const headerValues = values[0];
  const indexes = headers.map((header) => headerValues.indexOf(header));
  const idIndex = headers.includes("Vorschlag_ID") ? headers.indexOf("Vorschlag_ID") : 0;
  return values
    .slice(1)
    .filter((row) => row[idIndex] !== null && row[idIndex] !== undefined && row[idIndex] !== "")
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[indexes[index]]])));
}

function readTableRows(workbook, tableName) {
  const layout = targetTableLayouts[tableName];
  const columns = tableColumns[tableName];
  const sheet = workbook.worksheets.getItem(layout.sheetName);
  const endCol = colName(columns.length);
  return sheet
    .getRange(`A${layout.dataStartRow}:${endCol}${layout.scanEndRow}`)
    .values.filter((row) => row[0] !== null && row[0] !== undefined && row[0] !== "")
    .map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
}

function inferCategory({ row, raw }) {
  const text = normalizeText(
    `${row.Name_oder_Muster} ${raw?.Zahlungspflichtiger} ${raw?.Zahlungsempfaenger} ${raw?.Verwendungszweck}`,
  );
  const amount = Number(row.Betrag ?? raw?.Betrag ?? 0);
  if (/(caritas|stiftung kath|wolkenmacher|gehalt|lohn|salary)/.test(text) && amount > 0) {
    return { id: "KAT001", label: "Einkommen", confidence: "mittel", note: "wirkt wie regelmaessiger Zahlungseingang" };
  }
  if (/(finanzkasse|est veranl|steuer|steuerberatung)/.test(text)) {
    return { id: "KAT009", label: "Steuern & Abgaben", confidence: "mittel", note: "Steuer-/Abgabenbezug erkennbar" };
  }
  if (/(rewe|spar koebmand|supermarkt|visa debitkartenumsatz)/.test(text) && Math.abs(amount) < 300) {
    return { id: "KAT003", label: "Lebenshaltung", confidence: "mittel", note: "Alltags-/Kartenzahlung" };
  }
  if (/(villa|ferienhaus|hotel|centerparcs|eishockeykarten|jahrbuch)/.test(text)) {
    return { id: "KAT008", label: "Freizeit & Reisen", confidence: "mittel", note: "Freizeit- oder Reisebezug erkennbar" };
  }
  if (/(domcura|rv lebensversicherung|r v lebensversicherung)/.test(text)) {
    return { id: "KAT005", label: "Versicherungen & Vorsorge", confidence: "mittel", note: "Versicherungs-/Vorsorgebezug erkennbar" };
  }
  if (/(thermondo|dunst hausbau|thein grimm|kuchen und ideen|wohngebaeude)/.test(text)) {
    return { id: "KAT002", label: "Wohnen & Immobilien", confidence: "mittel", note: "Immobilien-/Hausbezug erkennbar" };
  }
  if (/(ubertrag|umbuchung)/.test(text)) {
    return { id: "KAT012", label: "Interne Transfers", confidence: "niedrig", note: "Namens-/Umbuchungssignal, bitte bestaetigen" };
  }
  return { id: "", label: "", confidence: "niedrig", note: "keine robuste Heuristik" };
}

function inferReviewRecommendation(row, raw) {
  const text = normalizeText(`${raw?.Zahlungspflichtiger} ${raw?.Zahlungsempfaenger} ${raw?.Verwendungszweck} ${row.Name_oder_Muster}`);
  if (row.Typ === "neue_Transferregel") {
    if (/visa debitkartenumsatz|spar koebmand/.test(text)) {
      return {
        recommendation: "wahrscheinlich ablehnen",
        targetCategory: "KAT003",
        targetTransferType: "",
        rationale: "Kartenzahlung/Haendler wurde durch das Wort SPAR faelschlich als Transfer erkannt.",
      };
    }
    if (/ubertrag|umbuchung/.test(text)) {
      return {
        recommendation: "wahrscheinlich annehmen",
        targetCategory: "KAT012",
        targetTransferType: "Eigenumbuchung",
        rationale: "Verwendungszweck enthaelt Uebertrag/Umbuchung; Zielkonto und Eigentum bitte pruefen.",
      };
    }
    return {
      recommendation: "prüfen",
      targetCategory: "KAT012",
      targetTransferType: "Sonstiger_Transfer",
      rationale: "Transfer-Signal ist nicht eindeutig genug fuer automatische Annahme.",
    };
  }

  const category = inferCategory({ row, raw });
  if (row.Typ === "neue_Regelzahlung") {
    return {
      recommendation: "prüfen",
      targetCategory: category.id || row.Ziel_Kategorie_ID || "KAT013",
      targetTransferType: "",
      rationale: `${category.note}; Person_ID ist vor Annahme meist der entscheidende Pflichtwert.`,
    };
  }
  if (row.Typ === "Kategorie_Mapping") {
    return {
      recommendation: category.id ? "wahrscheinliche Kategorie" : "prüfen",
      targetCategory: category.id,
      targetTransferType: "",
      rationale: category.note,
    };
  }
  return { recommendation: "prüfen", targetCategory: "", targetTransferType: "", rationale: "" };
}

function enrichRows(reviewRows, regularRows, rawRows, modelRows) {
  const regularById = new Map(regularRows.map((row) => [row.Vorschlag_ID, row]));
  const rawById = new Map(rawRows.map((row) => [row.Rohumsatz_ID, row]));
  const modelById = new Map(modelRows.map((row) => [row.Transaktion_ID, row]));
  return reviewRows
    .map((row) => {
      const regular = regularById.get(row.Vorschlag_ID);
      const model = modelById.get(row.Betroffene_ID);
      const raw = model ? rawById.get(model.Rohumsatz_ID) : null;
      const recommendation = inferReviewRecommendation(row, raw);
      return {
        ...row,
        Name_oder_Muster: row.Name_oder_Muster || regular?.Vorgeschlagener_Name || "",
        Betrag: row.Betrag ?? regular?.Median_Betrag ?? raw?.Betrag ?? "",
        Treffer: row.Treffer ?? regular?.Treffer_Anzahl ?? "",
        Erstes_Datum: toIsoDate(row.Erstes_Datum || regular?.Erstes_Datum),
        Letztes_Datum: toIsoDate(row.Letztes_Datum || regular?.Letztes_Datum),
        Raw_Datum: toIsoDate(raw?.Buchungsdatum),
        Raw_Betrag: raw?.Betrag ?? "",
        Zahlungspflichtiger: displayText(raw?.Zahlungspflichtiger),
        Zahlungsempfaenger: displayText(raw?.Zahlungsempfaenger),
        Verwendungszweck: displayText(raw?.Verwendungszweck),
        Umsatztyp: raw?.Umsatztyp ?? "",
        KI_Empfehlung: recommendation.recommendation,
        KI_Ziel_Kategorie_ID: recommendation.targetCategory,
        KI_Ziel_Transfer_Typ: recommendation.targetTransferType,
        KI_Begruendung: recommendation.rationale,
      };
    })
    .sort((a, b) => score(b) - score(a) || String(a.Vorschlag_ID).localeCompare(String(b.Vorschlag_ID)));
}

function styleTitle(sheet, title, subtitle = "") {
  sheet.showGridLines = false;
  sheet.getRange("A1:H1").merge();
  sheet.getRange("A1").values = [[title]];
  sheet.getRange("A1:H1").format = {
    fill: "#123047",
    font: { color: "#FFFFFF", bold: true, size: 16 },
    verticalAlignment: "center",
  };
  sheet.getRange("A1:H1").format.rowHeightPx = 34;
  if (subtitle) {
    sheet.getRange("A2:H2").merge();
    sheet.getRange("A2").values = [[subtitle]];
    sheet.getRange("A2:H2").format = {
      fill: "#EAF2F8",
      font: { color: "#334155", size: 10 },
      wrapText: true,
    };
  }
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
    font: { color: "#FFFFFF", bold: true, size: 10 },
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

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

async function main() {
  const [reviewWorkbook, analysisWorkbook] = await Promise.all([
    importWorkbook(reviewWorkbookPath),
    importWorkbook(analysisWorkbookPath),
  ]);

  const reviewRows = readSheetRows(reviewWorkbook, "Review_Liste", 1, reviewHeaders, 10000);
  const regularRows = readSheetRows(reviewWorkbook, "Regelzahlungen_Roh", 3, regularSuggestionHeaders, 10000);
  const rawRows = readTableRows(analysisWorkbook, "10_Umsaetze_Roh");
  const modelRows = readTableRows(analysisWorkbook, "11_Umsaetze_Modell");
  const enriched = enrichRows(reviewRows, regularRows, rawRows, modelRows);

  const workbook = Workbook.create();
  const summary = workbook.worksheets.add("Summary");
  const batch = workbook.worksheets.add("Batch_1");
  const regular = workbook.worksheets.add("Regelzahlungen");
  const transfers = workbook.worksheets.add("Transfers");
  const categories = workbook.worksheets.add("Kategorie_Mappings");

  styleTitle(summary, "Review Entscheidungshilfe", "Diese Arbeitsmappe veraendert keine Entscheidungen. Sie priorisiert und ergaenzt die bestehende Review-Liste.");
  writeTable(summary, "A4", ["Kennzahl", "Wert", "Hinweis"], [
    { Kennzahl: "Vorschlaege gesamt", Wert: enriched.length, Hinweis: "aus Review_Liste" },
    { Kennzahl: "Hohe Prioritaet", Wert: countWhere(enriched, (row) => row.Prioritaet === "hoch"), Hinweis: "zuerst bearbeiten" },
    { Kennzahl: "Regelzahlungen", Wert: countWhere(enriched, (row) => row.Typ === "neue_Regelzahlung"), Hinweis: "Person_ID und Kategorie entscheiden" },
    { Kennzahl: "Transferregeln", Wert: countWhere(enriched, (row) => row.Typ === "neue_Transferregel"), Hinweis: "false positives zuerst aussortieren" },
    { Kennzahl: "Kategorie-Mappings", Wert: countWhere(enriched, (row) => row.Typ === "Kategorie_Mapping"), Hinweis: "Kategorie-ID bestaetigen" },
    { Kennzahl: "Wahrscheinlich ablehnen", Wert: countWhere(enriched, (row) => row.KI_Empfehlung === "wahrscheinlich ablehnen"), Hinweis: "vermutete Transfer-False-Positives" },
  ]);
  setWidths(summary, [180, 100, 420]);

  const commonHeaders = [
    "Vorschlag_ID",
    "Typ",
    "Prioritaet",
    "KI_Empfehlung",
    "KI_Ziel_Kategorie_ID",
    "KI_Ziel_Transfer_Typ",
    "Name_oder_Muster",
    "Betrag",
    "Treffer",
    "Erstes_Datum",
    "Letztes_Datum",
    "Raw_Datum",
    "Raw_Betrag",
    "Zahlungspflichtiger",
    "Zahlungsempfaenger",
    "Verwendungszweck",
    "KI_Begruendung",
  ];

  const batchRows = [
    ...enriched.filter((row) => row.Typ === "neue_Transferregel"),
    ...enriched.filter((row) => row.Prioritaet === "hoch" && row.Typ !== "neue_Transferregel").slice(0, 22),
  ].sort((a, b) => score(b) - score(a));
  styleTitle(batch, "Batch 1: schnelle Review-Entscheidungen", "Transfer-False-Positives und hoechste Betrags-/Prioritaetsvorschlaege zuerst.");
  writeTable(batch, "A4", commonHeaders, batchRows);
  setWidths(batch, [140, 145, 90, 150, 130, 150, 230, 100, 80, 105, 105, 105, 100, 220, 220, 360, 360]);

  styleTitle(regular, "Regelzahlungen", "Nicht automatisch annehmen: meist fehlen Person_ID oder fachliche Kategorie-Bestaetigung.");
  writeTable(regular, "A4", commonHeaders, enriched.filter((row) => row.Typ === "neue_Regelzahlung"));
  setWidths(regular, [140, 145, 90, 150, 130, 150, 230, 100, 80, 105, 105, 105, 100, 220, 220, 360, 360]);

  styleTitle(transfers, "Transferregeln", "SPAR/Kartenzahlungen sind wahrscheinlich False-Positives; Uebertrag-Zeilen bitte als moegliche Eigenumbuchung pruefen.");
  writeTable(transfers, "A4", commonHeaders, enriched.filter((row) => row.Typ === "neue_Transferregel"));
  setWidths(transfers, [140, 145, 90, 150, 130, 150, 230, 100, 80, 105, 105, 105, 100, 220, 220, 360, 360]);

  styleTitle(categories, "Kategorie-Mappings", "KI_Ziel_Kategorie_ID ist nur eine Entscheidungshilfe und noch keine Umsetzung.");
  writeTable(categories, "A4", commonHeaders, enriched.filter((row) => row.Typ === "Kategorie_Mapping"));
  setWidths(categories, [140, 145, 90, 150, 130, 150, 230, 100, 80, 105, 105, 105, 100, 220, 220, 360, 360]);

  workbook.recalculate();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  return {
    outputPath,
    counts: {
      total: enriched.length,
      batch1: batchRows.length,
      regularPayments: countWhere(enriched, (row) => row.Typ === "neue_Regelzahlung"),
      transfers: countWhere(enriched, (row) => row.Typ === "neue_Transferregel"),
      categoryMappings: countWhere(enriched, (row) => row.Typ === "Kategorie_Mapping"),
      likelyRejects: countWhere(enriched, (row) => row.KI_Empfehlung === "wahrscheinlich ablehnen"),
    },
  };
}

console.log(JSON.stringify(await main(), null, 2));

import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";
import { analysisSuggestionColumns } from "./analysisSuggestionWriterVerifier.mjs";
import { tableColumns } from "./importWriterVerifier.mjs";

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

const regularPaymentPlanHeaders = [
  "Regel_ID",
  "Name",
  "Typ",
  "Kategorie_ID",
  "Person_ID",
  "Konto_ID",
  "Quelle_ID",
  "Frequenz",
  "Erwarteter_Betrag",
  "Toleranz_Betrag",
  "Toleranz_Prozent",
  "Erwarteter_Tag",
  "Gegenpartei_Muster",
  "IBAN_Muster",
  "Verwendungszweck_Muster",
  "Betrag_Min",
  "Betrag_Max",
  "Betrag_Variabel",
  "Faelligkeitstag",
  "Faelligkeitstoleranz_Tage",
  "Matching_Status",
  "Auto_Matching_Erlaubt",
  "Startdatum",
  "Enddatum",
  "Status",
  "Szenario_Wirkung",
  "Kommentar",
];

const regularPaymentRequiredFields = [
  "Regel_ID",
  "Name",
  "Typ",
  "Kategorie_ID",
  "Person_ID",
  "Konto_ID",
  "Frequenz",
  "Erwarteter_Betrag",
  "Status",
];

const categoryMappingPlanHeaders = [
  "Vorschlag_ID",
  "Betroffene_Tabelle",
  "Betroffene_ID",
  "Ziel_Kategorie_ID",
  "Ziel_Person_ID",
  "Status",
  "Umsetzung_Eindeutig",
  "Kommentar",
];

const transferRulePlanHeaders = [
  "Vorschlag_ID",
  "Betroffene_Tabelle",
  "Betroffene_ID",
  "Ziel_Konto_ID",
  "Ziel_Transfer_Typ",
  "Status",
  "Umsetzung_Eindeutig",
  "Kommentar",
];

const manualTransferPairPlanHeaders = [
  "Entscheidung_ID",
  "Transaktion_ID",
  "Gegenbuchung_Transaktion_ID",
  "Ziel_Transfer_Typ",
  "Kommentar",
];

const supportedAcceptedTypes = new Set(["neue_Regelzahlung", "Kategorie_Mapping", "neue_Transferregel"]);

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
  return "";
}

function dayOfMonth(value) {
  const iso = toIsoDate(value);
  return iso ? Number(iso.slice(8, 10)) : "";
}

function numberFromExcelDateLike(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return Math.round(((value.getTime() - excelEpoch) / 86400000) * 100) / 100;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const numeric = Number(trimmed.replace(",", "."));
    if (Number.isFinite(numeric)) return numeric;
  }
  return fallback;
}

function normalizeDecision(value) {
  return String(value ?? "").trim().toLowerCase();
}

function readSheetRows(workbook, sheetName, headerRow, headers, maxRows = 10000) {
  const sheet = workbook.worksheets.getItem(sheetName);
  const endCol = colName(headers.length);
  const values = sheet.getRange(`A${headerRow}:${endCol}${maxRows}`).values;
  const headerValues = values[0];
  const indexes = headers.map((header) => headerValues.indexOf(header));
  const rowAnchorIndex = headers.includes("Vorschlag_ID") ? headers.indexOf("Vorschlag_ID") : 0;
  return values
    .slice(1)
    .filter((row) => row[rowAnchorIndex] !== null && row[rowAnchorIndex] !== undefined && row[rowAnchorIndex] !== "")
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[indexes[index]]])));
}

function normalizeId(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function readExistingRegularPaymentIds(workbook) {
  const sheet = workbook.worksheets.getItem("12_Regelzahlungen");
  const section = regularPaymentSection(workbook);
  const values = sheet.getRange(`A7:A${section.lastRegularPaymentRow}`).values;
  return values.map((row) => normalizeId(row[0])).filter(Boolean);
}

function regularPaymentSection(workbook) {
  const sheet = workbook.worksheets.getItem("12_Regelzahlungen");
  const values = sheet.getRange("A7:A200").values;
  const markerIndex = values.findIndex((row) => row[0] === "Regelzahlung Vorschlaege");
  const markerRow = markerIndex === -1 ? 10 : 7 + markerIndex;
  return {
    markerRow,
    lastRegularPaymentRow: markerRow - 1,
  };
}

function findRegularPaymentAppendRow(workbook) {
  const sheet = workbook.worksheets.getItem("12_Regelzahlungen");
  const section = regularPaymentSection(workbook);
  const values = sheet.getRange(`A7:A${section.lastRegularPaymentRow}`).values;
  let lastUsed = 6;
  values.forEach((row, index) => {
    if (normalizeId(row[0])) lastUsed = 7 + index;
  });
  return lastUsed + 1;
}

function regularPaymentCapacity(workbook) {
  const section = regularPaymentSection(workbook);
  const appendRow = findRegularPaymentAppendRow(workbook);
  return {
    appendRow,
    lastAvailableRow: section.lastRegularPaymentRow,
    availableBlankRows: Math.max(0, section.markerRow - appendRow),
  };
}

function readRegularPaymentPlanRows(workbook) {
  return readSheetRows(workbook, "Angenommene_Regelzahlungen", 1, regularPaymentPlanHeaders, 10000);
}

function readCategoryMappingPlanRows(workbook) {
  return readSheetRows(workbook, "Angenommene_Kategorie_Mappings", 1, categoryMappingPlanHeaders, 10000);
}

function readTransferRulePlanRows(workbook) {
  return readSheetRows(workbook, "Angenommene_Transferregeln", 1, transferRulePlanHeaders, 10000);
}

function readManualTransferPairPlanRows(workbook) {
  try {
    return readSheetRows(workbook, "Manuelle_Transferpaare", 1, manualTransferPairPlanHeaders, 10000);
  } catch {
    return [];
  }
}

function normalizePlanCell(value, columnName) {
  if (value === undefined || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && (columnName.includes("datum") || columnName === "Startdatum" || columnName === "Enddatum")) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }
  return value;
}

function regularPaymentMatrix(rows) {
  return rows.map((row) => regularPaymentPlanHeaders.map((header) => normalizePlanCell(row[header], header)));
}

function unmergeRows(sheet, startRow, columnCount, rowCount) {
  if (rowCount <= 0) return;
  const endCol = colName(columnCount);
  sheet.getRange(`A${startRow}:${endCol}${startRow + rowCount - 1}`).unmerge();
}

function shiftRangeDown(sheet, startRow, columnCount, rowCount, shiftBy) {
  if (shiftBy <= 0) return;
  const endCol = colName(columnCount);
  const sourceRange = `A${startRow}:${endCol}${startRow + rowCount - 1}`;
  const targetRange = `A${startRow + shiftBy}:${endCol}${startRow + shiftBy + rowCount - 1}`;
  unmergeRows(sheet, startRow, columnCount, rowCount);
  unmergeRows(sheet, startRow + shiftBy, columnCount, rowCount);
  const values = sheet.getRange(sourceRange).values;
  sheet.getRange(targetRange).values = values;
  sheet.getRange(`A${startRow}:${endCol}${startRow + shiftBy - 1}`).values = Array.from(
    { length: shiftBy },
    () => Array.from({ length: columnCount }, () => null),
  );
}

export async function readReviewDecisionPackage({ reviewWorkbookPath }) {
  const input = await FileBlob.load(reviewWorkbookPath);
  const workbook = await SpreadsheetFile.importXlsx(input);
  const decisions = readSheetRows(workbook, "Review_Liste", 1, reviewHeaders, 10000)
    .map((row) => ({ ...row, Entscheidung: normalizeDecision(row.Entscheidung) }));
  const regularPaymentSuggestions = readSheetRows(
    workbook,
    "Regelzahlungen_Roh",
    3,
    analysisSuggestionColumns["12_Regelzahlung_Vorschlaege"],
    10000,
  );
  const regularById = new Map(regularPaymentSuggestions.map((row) => [row.Vorschlag_ID, row]));
  const acceptedRegularPayments = decisions
    .filter((row) => row.Entscheidung === "annehmen" && row.Typ === "neue_Regelzahlung")
    .map((decision) => ({ decision, suggestion: regularById.get(decision.Vorschlag_ID) }))
    .filter((entry) => entry.suggestion);
  const acceptedCategoryMappings = decisions
    .filter((row) => row.Entscheidung === "annehmen" && row.Typ === "Kategorie_Mapping");
  const acceptedTransferRules = decisions
    .filter((row) => row.Entscheidung === "annehmen" && row.Typ === "neue_Transferregel");

  return {
    reviewWorkbookPath,
    decisions,
    regularPaymentSuggestions,
    acceptedRegularPayments,
    acceptedCategoryMappings,
    acceptedTransferRules,
  };
}

export function validateReviewDecisionPackage(decisionPackage) {
  const errors = [];
  const warnings = [];

  for (const row of decisionPackage.decisions) {
    if (!row.Entscheidung) continue;
    if (!["annehmen", "ablehnen", "zusammenfuehren", "zurueckstellen"].includes(row.Entscheidung)) {
      errors.push(`${row.Vorschlag_ID}: unknown decision ${row.Entscheidung}`);
    }
    if (row.Entscheidung === "annehmen" && !supportedAcceptedTypes.has(row.Typ)) {
      warnings.push(`${row.Vorschlag_ID}: accepted ${row.Typ} is not directly implementable yet`);
    }
    if (row.Entscheidung === "annehmen" && row.Typ === "neue_Regelzahlung") {
      if (!row.Ziel_Kategorie_ID) errors.push(`${row.Vorschlag_ID}: Ziel_Kategorie_ID required`);
      if (!row.Ziel_Person_ID) errors.push(`${row.Vorschlag_ID}: Ziel_Person_ID required`);
    }
    if (row.Entscheidung === "annehmen" && row.Typ === "Kategorie_Mapping") {
      if (!row.Ziel_Kategorie_ID) errors.push(`${row.Vorschlag_ID}: Ziel_Kategorie_ID required`);
    }
    if (row.Entscheidung === "annehmen" && row.Typ === "neue_Transferregel") {
      if (!row.Ziel_Transfer_Typ) errors.push(`${row.Vorschlag_ID}: Ziel_Transfer_Typ required`);
    }
  }

  for (const entry of decisionPackage.acceptedRegularPayments) {
    if (!entry.suggestion) errors.push(`${entry.decision.Vorschlag_ID}: missing regular-payment raw suggestion`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function missingFieldsForAcceptedDecision(row) {
  if (row.Entscheidung !== "annehmen") return [];
  if (row.Typ === "neue_Regelzahlung") {
    return [
      row.Ziel_Kategorie_ID ? null : "Ziel_Kategorie_ID",
      row.Ziel_Person_ID ? null : "Ziel_Person_ID",
    ].filter(Boolean);
  }
  if (row.Typ === "Kategorie_Mapping") {
    return [row.Ziel_Kategorie_ID ? null : "Ziel_Kategorie_ID"].filter(Boolean);
  }
  if (row.Typ === "neue_Transferregel") {
    return [row.Ziel_Transfer_Typ ? null : "Ziel_Transfer_Typ"].filter(Boolean);
  }
  return [];
}

export async function summarizeReviewWorkbook({ reviewWorkbookPath }) {
  const decisionPackage = await readReviewDecisionPackage({ reviewWorkbookPath });
  const validation = validateReviewDecisionPackage(decisionPackage);
  const decisions = decisionPackage.decisions;
  const accepted = decisions.filter((row) => row.Entscheidung === "annehmen");
  const incompleteAcceptedDecisions = accepted
    .map((row) => ({
      Vorschlag_ID: row.Vorschlag_ID,
      Typ: row.Typ,
      missingFields: missingFieldsForAcceptedDecision(row),
    }))
    .filter((row) => row.missingFields.length > 0);

  return {
    reviewWorkbookPath,
    totalDecisions: decisions.length,
    counts: {
      open: decisions.filter((row) => !row.Entscheidung).length,
      accepted: accepted.length,
      rejected: decisions.filter((row) => row.Entscheidung === "ablehnen").length,
      merged: decisions.filter((row) => row.Entscheidung === "zusammenfuehren").length,
      deferred: decisions.filter((row) => row.Entscheidung === "zurueckstellen").length,
      acceptedRegularPayments: decisionPackage.acceptedRegularPayments.length,
      acceptedCategoryMappings: decisionPackage.acceptedCategoryMappings.length,
      acceptedTransferRules: decisionPackage.acceptedTransferRules.length,
      incompleteAccepted: incompleteAcceptedDecisions.length,
    },
    incompleteAcceptedDecisions,
    validation,
    readyForDecisionPlan: validation.valid && incompleteAcceptedDecisions.length === 0,
  };
}

function buildRegularPaymentRow(entry, index, firstRuleNumber) {
  const { decision, suggestion } = entry;
  const ruleId = `REG${String(firstRuleNumber + index).padStart(4, "0")}`;
  const expectedAmount = numberFromExcelDateLike(decision.Betrag, numberFromExcelDateLike(suggestion.Median_Betrag, 0));
  const minAmount = numberFromExcelDateLike(suggestion.Betrag_Min, expectedAmount);
  const maxAmount = numberFromExcelDateLike(suggestion.Betrag_Max, expectedAmount);
  const variability = numberFromExcelDateLike(suggestion.Betrag_Variabilitaet, 0);
  const tolerance = Math.max(Math.abs(maxAmount - expectedAmount), Math.abs(expectedAmount - minAmount), Math.abs(expectedAmount) * 0.05);
  const expectedDay = dayOfMonth(suggestion.Erstes_Datum);
  return {
    Regel_ID: ruleId,
    Name: suggestion.Vorgeschlagener_Name,
    Typ: suggestion.Typ,
    Kategorie_ID: decision.Ziel_Kategorie_ID,
    Person_ID: decision.Ziel_Person_ID,
    Konto_ID: decision.Ziel_Konto_ID || suggestion.Konto_ID,
    Quelle_ID: "",
    Frequenz: suggestion.Vorgeschlagene_Frequenz,
    Erwarteter_Betrag: expectedAmount,
    Toleranz_Betrag: Math.round(tolerance * 100) / 100,
    Toleranz_Prozent: 0.05,
    Erwarteter_Tag: expectedDay,
    Gegenpartei_Muster: suggestion.Gegenpartei_Muster,
    IBAN_Muster: suggestion.IBAN_Muster,
    Verwendungszweck_Muster: suggestion.Verwendungszweck_Muster,
    Betrag_Min: minAmount,
    Betrag_Max: maxAmount,
    Betrag_Variabel: Math.abs(variability) > 0.05,
    Faelligkeitstag: expectedDay,
    Faelligkeitstoleranz_Tage: 3,
    Matching_Status: "kandidaten_gefunden",
    Auto_Matching_Erlaubt: false,
    Startdatum: toIsoDate(suggestion.Erstes_Datum),
    Enddatum: "",
    Status: "vorgeschlagen",
    Szenario_Wirkung: "S01",
    Kommentar: `aus ${suggestion.Vorschlag_ID}; nicht_in_modell_geschrieben; ${decision.Entscheidung_Notiz ?? ""}`.trim(),
  };
}

function buildCategoryMappingPlanRow(decision) {
  return {
    Vorschlag_ID: decision.Vorschlag_ID,
    Betroffene_Tabelle: decision.Betroffene_Tabelle,
    Betroffene_ID: decision.Betroffene_ID,
    Ziel_Kategorie_ID: decision.Ziel_Kategorie_ID,
    Ziel_Person_ID: decision.Ziel_Person_ID || "",
    Status: "vorgeschlagen",
    Umsetzung_Eindeutig: true,
    Kommentar: `nicht_in_modell_geschrieben; ${decision.Entscheidung_Notiz ?? ""}`.trim(),
  };
}

function buildTransferRulePlanRow(decision) {
  return {
    Vorschlag_ID: decision.Vorschlag_ID,
    Betroffene_Tabelle: decision.Betroffene_Tabelle,
    Betroffene_ID: decision.Betroffene_ID,
    Ziel_Konto_ID: decision.Ziel_Konto_ID || "",
    Ziel_Transfer_Typ: decision.Ziel_Transfer_Typ,
    Status: "vorgeschlagen",
    Umsetzung_Eindeutig: true,
    Kommentar: `nicht_in_modell_geschrieben; ${decision.Entscheidung_Notiz ?? ""}`.trim(),
  };
}

function writeTable(sheet, startCell, headers, rows) {
  const startCol = startCell.match(/[A-Z]+/)[0];
  const startRow = Number(startCell.match(/\d+/)[0]);
  const startColIndex = startCol.charCodeAt(0) - 64;
  const endCol = colName(startColIndex + headers.length - 1);
  const endRow = startRow + rows.length;
  sheet.getRange(`${startCell}:${endCol}${endRow}`).values = [headers, ...rows];
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
}

function setWidths(sheet, count, width = 130) {
  for (let index = 1; index <= count; index += 1) {
    sheet.getRange(`${colName(index)}:${colName(index)}`).format.columnWidthPx = width;
  }
}

function reviewStatusRows(status) {
  return [
    ["reviewWorkbookPath", status.reviewWorkbookPath, "Quelle"],
    ["totalDecisions", status.totalDecisions, "Alle Vorschlaege in Review_Liste"],
    ["open", status.counts.open, "Noch nicht entschieden"],
    ["accepted", status.counts.accepted, "Angenommene Entscheidungen insgesamt"],
    ["rejected", status.counts.rejected, "Abgelehnte Entscheidungen"],
    ["merged", status.counts.merged, "Zusammengefuehrte Entscheidungen"],
    ["deferred", status.counts.deferred, "Zurueckgestellte Entscheidungen"],
    ["acceptedRegularPayments", status.counts.acceptedRegularPayments, "Planfaehige Regelzahlungen"],
    ["acceptedCategoryMappings", status.counts.acceptedCategoryMappings, "Planfaehige Kategorie-Mappings"],
    ["acceptedTransferRules", status.counts.acceptedTransferRules, "Planfaehige Transferregeln"],
    ["incompleteAccepted", status.counts.incompleteAccepted, "Angenommen, aber Pflichtfelder fehlen"],
    ["validationValid", status.validation.valid, status.validation.errors.join("; ")],
    ["validationWarnings", status.validation.warnings.length, status.validation.warnings.join("; ")],
    ["readyForDecisionPlan", status.readyForDecisionPlan, "true bedeutet formal planbar"],
  ];
}

function applyAuditRows({ financeWorkbookPath, decisionPlanPath, outputPath, preflight, validation, applied, allowLayoutExpansion }) {
  return [
    ["financeWorkbookPath", financeWorkbookPath, "Quelle der Finanzmodell-Kopie"],
    ["decisionPlanPath", decisionPlanPath, "Angewendeter Entscheidungsplan"],
    ["outputPath", outputPath, "Erzeugte Finanzmodell-Kopie"],
    ["validationValid", validation.valid, validation.errors.join("; ")],
    ["validationWarnings", validation.warnings.length, validation.warnings.join("; ")],
    ["plannedRegularPayments", preflight.regularPayments.count, "Regelzahlungen im Entscheidungsplan"],
    ["appliedRegularPayments", applied.regularPayments, "Tatsaechlich geschriebene Regelzahlungen"],
    ["plannedCategoryMappings", preflight.categoryMappings.count, "Kategorie-Mappings im Entscheidungsplan"],
    ["appliedCategoryMappings", applied.categoryMappings ?? 0, "Tatsaechlich aktualisierte Modellumsaetze"],
    ["plannedTransferConfirmations", preflight.transferConfirmations.count, "Transferbestaetigungen im Entscheidungsplan"],
    ["appliedTransferConfirmations", applied.transferConfirmations ?? 0, "Tatsaechlich bestaetigte Transfer-Modellumsaetze"],
    ["plannedManualTransferPairs", preflight.manualTransferPairs.count, "Manuell bestaetigte Transferpaare im Entscheidungsplan"],
    ["appliedManualTransferPairs", applied.manualTransferPairs ?? 0, "Tatsaechlich angewendete Transferpaare"],
    ["appliedManualTransferTransactions", applied.manualTransferTransactions ?? 0, "Tatsaechlich neutralisierte Transaktionen aus Transferpaaren"],
    ["layoutExpansionAllowed", allowLayoutExpansion, "Explizite Erlaubnis fuer Layout-Erweiterung"],
    ["layoutExpandedRows", applied.layoutExpandedRows ?? 0, "Eingefuegte/verschobene Zeilen in Kopie"],
    ["appendRow", preflight.regularPayments.appendRow, "Startzeile fuer Regelzahlungs-Write"],
    ["availableBlankRows", preflight.regularPayments.availableBlankRows, "Vorhandene sichere Leerzeilen"],
    ["requiresRowInsertion", preflight.regularPayments.requiresRowInsertion, "Preflight-Einschaetzung"],
  ];
}

function writeApplyAuditSheet(workbook, audit) {
  const sheet = workbook.worksheets.add("99_Review_Apply_Audit");
  sheet.showGridLines = false;
  sheet.getRange("A1:C1").merge();
  sheet.getRange("A1").values = [["99_Review_Apply_Audit"]];
  sheet.getRange("A1:C1").format = { fill: "#123047", font: { color: "#FFFFFF", bold: true, size: 16 } };
  writeTable(sheet, "A3", ["Kennzahl", "Wert", "Hinweis"], applyAuditRows(audit));
  setWidths(sheet, 3, 230);
  sheet.freezePanes.freezeRows(3);
}

export async function buildReviewDecisionPlan({ reviewWorkbookPath, outputPath, firstRuleNumber = 1, acceptedSuggestionIds = null }) {
  const decisionPackage = await readReviewDecisionPackage({ reviewWorkbookPath });
  const validation = validateReviewDecisionPackage(decisionPackage);
  const reviewStatus = await summarizeReviewWorkbook({ reviewWorkbookPath });
  const acceptedIdSet = acceptedSuggestionIds ? new Set(acceptedSuggestionIds) : null;
  const includeAcceptedDecision = (row) => !acceptedIdSet || acceptedIdSet.has(row.Vorschlag_ID);
  const acceptedRegularPayments = decisionPackage.acceptedRegularPayments.filter((entry) =>
    includeAcceptedDecision(entry.decision),
  );
  const acceptedCategoryMappings = decisionPackage.acceptedCategoryMappings.filter(includeAcceptedDecision);
  const acceptedTransferRules = decisionPackage.acceptedTransferRules.filter(includeAcceptedDecision);
  const acceptedRegularPaymentRows = validation.valid
    ? acceptedRegularPayments.map((entry, index) => buildRegularPaymentRow(entry, index, firstRuleNumber))
    : [];
  const acceptedCategoryMappingRows = validation.valid
    ? acceptedCategoryMappings.map((decision) => buildCategoryMappingPlanRow(decision))
    : [];
  const acceptedTransferRuleRows = validation.valid
    ? acceptedTransferRules.map((decision) => buildTransferRulePlanRow(decision))
    : [];
  const blockedDecisions = decisionPackage.decisions
    .filter((row) => row.Entscheidung === "annehmen" && includeAcceptedDecision(row) && !supportedAcceptedTypes.has(row.Typ));

  const workbook = Workbook.create();
  const summary = workbook.worksheets.add("Summary");
  const status = workbook.worksheets.add("Review_Status");
  const regular = workbook.worksheets.add("Angenommene_Regelzahlungen");
  const categoryMappings = workbook.worksheets.add("Angenommene_Kategorie_Mappings");
  const transferRules = workbook.worksheets.add("Angenommene_Transferregeln");
  const blocked = workbook.worksheets.add("Blockierte_Entscheidungen");

  summary.getRange("A1:D1").merge();
  summary.getRange("A1").values = [["Umsetzungsplan aus Vorschlagsreview"]];
  summary.getRange("A1:D1").format = { fill: "#123047", font: { color: "#FFFFFF", bold: true, size: 16 } };
  writeTable(summary, "A3", ["Kennzahl", "Wert", "Hinweis"], [
    ["Angenommene Regelzahlungen", acceptedRegularPaymentRows.length, "nicht_in_modell_geschrieben"],
    ["Angenommene Kategorie-Mappings", acceptedCategoryMappingRows.length, "Plan, keine direkte Modellschreibung"],
    ["Angenommene Transferregeln", acceptedTransferRuleRows.length, "Plan, keine direkte Modellschreibung"],
    ["Blockierte Entscheidungen", blockedDecisions.length, "Unbekannte akzeptierte Typen"],
    ["Validierung", validation.valid ? "ok" : "fehler", validation.errors.join("; ")],
  ]);
  setWidths(summary, 4, 210);

  writeTable(status, "A1", ["Kennzahl", "Wert", "Hinweis"], reviewStatusRows(reviewStatus));
  setWidths(status, 3, 230);
  status.freezePanes.freezeRows(1);

  writeTable(
    regular,
    "A1",
    regularPaymentPlanHeaders,
    acceptedRegularPaymentRows.map((row) => regularPaymentPlanHeaders.map((header) => row[header])),
  );
  setWidths(regular, regularPaymentPlanHeaders.length, 130);
  regular.freezePanes.freezeRows(1);

  writeTable(
    categoryMappings,
    "A1",
    categoryMappingPlanHeaders,
    acceptedCategoryMappingRows.map((row) => categoryMappingPlanHeaders.map((header) => row[header])),
  );
  setWidths(categoryMappings, categoryMappingPlanHeaders.length, 150);
  categoryMappings.freezePanes.freezeRows(1);

  writeTable(
    transferRules,
    "A1",
    transferRulePlanHeaders,
    acceptedTransferRuleRows.map((row) => transferRulePlanHeaders.map((header) => row[header])),
  );
  setWidths(transferRules, transferRulePlanHeaders.length, 150);
  transferRules.freezePanes.freezeRows(1);

  writeTable(blocked, "A1", reviewHeaders, blockedDecisions.map((row) => reviewHeaders.map((header) => row[header])));
  setWidths(blocked, reviewHeaders.length, 130);
  blocked.freezePanes.freezeRows(1);

  workbook.recalculate();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  return {
    outputPath,
    validation,
    reviewStatus,
    counts: {
      acceptedRegularPayments: acceptedRegularPaymentRows.length,
      acceptedCategoryMappings: acceptedCategoryMappingRows.length,
      acceptedTransferRules: acceptedTransferRuleRows.length,
      blockedDecisions: blockedDecisions.length,
    },
  };
}

function normalizePlanBoolean(value) {
  if (value === true) return true;
  if (typeof value === "string") return ["true", "ja", "yes", "1"].includes(value.trim().toLowerCase());
  return false;
}

function readModelTransactionIndex(workbook) {
  const headers = tableColumns["11_Umsaetze_Modell"];
  const sheet = workbook.worksheets.getItem("11_Umsaetze_Modell");
  const values = sheet.getRange(`A13:${colName(headers.length)}10000`).values;
  const index = new Map();
  values.forEach((row, zeroIndex) => {
    const id = normalizeId(row[0]);
    if (!id) return;
    index.set(id, {
      rowNumber: 13 + zeroIndex,
      row: Object.fromEntries(headers.map((header, columnIndex) => [header, row[columnIndex]])),
    });
  });
  return index;
}

function appendAuditComment(existing, addition) {
  const text = String(existing ?? "").trim();
  if (text.includes(addition)) return text;
  return [text, addition].filter(Boolean).join("; ");
}

function writeModelTransactionRow(workbook, rowNumber, row) {
  const headers = tableColumns["11_Umsaetze_Modell"];
  const sheet = workbook.worksheets.getItem("11_Umsaetze_Modell");
  sheet.getRange(`A${rowNumber}:${colName(headers.length)}${rowNumber}`).values = [
    headers.map((header) => row[header] ?? null),
  ];
}

function applyCategoryMappingsToModelTransactions(workbook, rows) {
  if (rows.length === 0) return 0;
  const index = readModelTransactionIndex(workbook);
  let applied = 0;
  for (const planRow of rows) {
    const target = index.get(normalizeId(planRow.Betroffene_ID));
    if (!target) continue;
    const row = { ...target.row };
    row.Kategorie_ID = planRow.Ziel_Kategorie_ID;
    if (planRow.Ziel_Person_ID) row.Person_ID = planRow.Ziel_Person_ID;
    row.Status = "belegt";
    row.Kommentar = appendAuditComment(row.Kommentar, `Review-Apply ${planRow.Vorschlag_ID}: Kategorie ${planRow.Ziel_Kategorie_ID}`);
    writeModelTransactionRow(workbook, target.rowNumber, row);
    applied += 1;
  }
  return applied;
}

function applyTransferConfirmationsToModelTransactions(workbook, rows) {
  if (rows.length === 0) return 0;
  const index = readModelTransactionIndex(workbook);
  let applied = 0;
  for (const planRow of rows) {
    const target = index.get(normalizeId(planRow.Betroffene_ID));
    if (!target) continue;
    const row = { ...target.row };
    row.Zielkonto_ID = planRow.Ziel_Konto_ID || row.Zielkonto_ID || null;
    row.Kategorie_ID = "KAT012";
    row.Cashflow_Wirkung = "neutral";
    row.Ist_Transfer = true;
    row.Transfer_Status = "bestaetigter_transfer";
    row.Transfer_Typ = planRow.Ziel_Transfer_Typ;
    row.Lebenshaltung_Relevant = false;
    row.Transfer_Pruefhinweis = appendAuditComment(row.Transfer_Pruefhinweis, `Review-Apply ${planRow.Vorschlag_ID}: Transfer bestaetigt`);
    row.Status = "belegt";
    row.Kommentar = appendAuditComment(row.Kommentar, `Review-Apply ${planRow.Vorschlag_ID}: ${planRow.Ziel_Transfer_Typ}`);
    writeModelTransactionRow(workbook, target.rowNumber, row);
    applied += 1;
  }
  return applied;
}

function markTransferRow(row, { transferType, decisionId, counterpartId, comment }) {
  row.Kategorie_ID = "KAT012";
  row.Cashflow_Wirkung = "neutral";
  row.Ist_Transfer = true;
  row.Transfer_Status = "bestaetigter_transfer";
  row.Transfer_Typ = transferType;
  row.Gegenbuchung_Transaktion_ID = counterpartId;
  row.Lebenshaltung_Relevant = false;
  row.Transfer_Pruefhinweis = appendAuditComment(row.Transfer_Pruefhinweis, `Review-Apply ${decisionId}: Transferpaar bestaetigt`);
  row.Status = "belegt";
  row.Kommentar = appendAuditComment(row.Kommentar, `Review-Apply ${decisionId}: ${comment || transferType}`);
}

function applyManualTransferPairsToModelTransactions(workbook, rows) {
  if (rows.length === 0) return { pairs: 0, transactions: 0 };
  const index = readModelTransactionIndex(workbook);
  let pairs = 0;
  let transactions = 0;
  for (const planRow of rows) {
    const firstId = normalizeId(planRow.Transaktion_ID);
    const secondId = normalizeId(planRow.Gegenbuchung_Transaktion_ID);
    const first = index.get(firstId);
    const second = index.get(secondId);
    if (!first || !second) continue;

    const firstRow = { ...first.row };
    const secondRow = { ...second.row };
    markTransferRow(firstRow, {
      transferType: planRow.Ziel_Transfer_Typ,
      decisionId: planRow.Entscheidung_ID,
      counterpartId: secondId,
      comment: planRow.Kommentar,
    });
    markTransferRow(secondRow, {
      transferType: planRow.Ziel_Transfer_Typ,
      decisionId: planRow.Entscheidung_ID,
      counterpartId: firstId,
      comment: planRow.Kommentar,
    });
    writeModelTransactionRow(workbook, first.rowNumber, firstRow);
    writeModelTransactionRow(workbook, second.rowNumber, secondRow);
    pairs += 1;
    transactions += 2;
  }
  return { pairs, transactions };
}

export async function preflightReviewDecisionPlan({ financeWorkbookPath, decisionPlanPath }) {
  const [financeInput, planInput] = await Promise.all([
    FileBlob.load(financeWorkbookPath),
    FileBlob.load(decisionPlanPath),
  ]);
  const financeWorkbook = await SpreadsheetFile.importXlsx(financeInput);
  const planWorkbook = await SpreadsheetFile.importXlsx(planInput);

  const existingRuleIds = readExistingRegularPaymentIds(financeWorkbook);
  const planRows = readRegularPaymentPlanRows(planWorkbook);
  const categoryMappingRows = readCategoryMappingPlanRows(planWorkbook);
  const transferRuleRows = readTransferRulePlanRows(planWorkbook);
  const manualTransferPairRows = readManualTransferPairPlanRows(planWorkbook);
  const capacity = regularPaymentCapacity(financeWorkbook);
  const existingIdSet = new Set(existingRuleIds);
  const duplicateRuleIds = planRows
    .map((row) => normalizeId(row.Regel_ID))
    .filter((id) => id && existingIdSet.has(id));

  const errors = [];
  const warnings = [];
  for (const row of planRows) {
    for (const field of regularPaymentRequiredFields) {
      if (row[field] === null || row[field] === undefined || row[field] === "") {
        errors.push(`${row.Regel_ID || "unbekannt"}: missing required field ${field}`);
      }
    }
  }

  const modelTransactionIndex = readModelTransactionIndex(financeWorkbook);
  const missingCategoryMappingTargetIds = categoryMappingRows
    .map((row) => normalizeId(row.Betroffene_ID))
    .filter((id) => id && !modelTransactionIndex.has(id));
  const missingTransferTargetIds = transferRuleRows
    .map((row) => normalizeId(row.Betroffene_ID))
    .filter((id) => id && !modelTransactionIndex.has(id));
  const nonEindeutigCategoryIds = categoryMappingRows
    .filter((row) => !normalizePlanBoolean(row.Umsetzung_Eindeutig))
    .map((row) => normalizeId(row.Vorschlag_ID));
  const nonEindeutigTransferIds = transferRuleRows
    .filter((row) => !normalizePlanBoolean(row.Umsetzung_Eindeutig))
    .map((row) => normalizeId(row.Vorschlag_ID));
  const missingManualTransferIds = manualTransferPairRows
    .flatMap((row) => [normalizeId(row.Transaktion_ID), normalizeId(row.Gegenbuchung_Transaktion_ID)])
    .filter((id) => id && !modelTransactionIndex.has(id));
  const incompleteManualTransferPairIds = manualTransferPairRows
    .filter((row) => !row.Entscheidung_ID || !row.Transaktion_ID || !row.Gegenbuchung_Transaktion_ID || !row.Ziel_Transfer_Typ)
    .map((row) => normalizeId(row.Entscheidung_ID) || "unbekannt");

  missingCategoryMappingTargetIds.forEach((id) => errors.push(`${id}: category mapping target transaction missing in finance workbook`));
  missingTransferTargetIds.forEach((id) => errors.push(`${id}: transfer target transaction missing in finance workbook`));
  nonEindeutigCategoryIds.forEach((id) => errors.push(`${id}: category mapping is not Umsetzung_Eindeutig`));
  nonEindeutigTransferIds.forEach((id) => errors.push(`${id}: transfer confirmation is not Umsetzung_Eindeutig`));
  missingManualTransferIds.forEach((id) => errors.push(`${id}: manual transfer-pair transaction missing in finance workbook`));
  incompleteManualTransferPairIds.forEach((id) => errors.push(`${id}: manual transfer-pair row is incomplete`));

  duplicateRuleIds.forEach((id) => errors.push(`${id}: Regel_ID already exists in finance workbook`));
  const requiresRowInsertion = planRows.length > capacity.availableBlankRows;
  if (requiresRowInsertion) {
    errors.push(`planned regular payments (${planRows.length}) exceeds safe blank-row capacity (${capacity.availableBlankRows})`);
    warnings.push("12_Regelzahlungen shares a sheet with 12_Regelzahlung_Vorschlaege; safe row insertion is required before writing.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    regularPayments: {
      count: planRows.length,
      existingRuleIds,
      plannedRuleIds: planRows.map((row) => normalizeId(row.Regel_ID)).filter(Boolean),
      duplicateRuleIds,
      appendRow: capacity.appendRow,
      lastAvailableRow: capacity.lastAvailableRow,
      availableBlankRows: capacity.availableBlankRows,
      requiresRowInsertion,
      writableWithoutInsertion: planRows.length <= capacity.availableBlankRows,
    },
    categoryMappings: {
      count: categoryMappingRows.length,
      targetIds: categoryMappingRows.map((row) => normalizeId(row.Betroffene_ID)).filter(Boolean),
      missingTargetIds: missingCategoryMappingTargetIds,
      nonEindeutigIds: nonEindeutigCategoryIds.filter(Boolean),
    },
    transferConfirmations: {
      count: transferRuleRows.length,
      targetIds: transferRuleRows.map((row) => normalizeId(row.Betroffene_ID)).filter(Boolean),
      missingTargetIds: missingTransferTargetIds,
      nonEindeutigIds: nonEindeutigTransferIds.filter(Boolean),
    },
    manualTransferPairs: {
      count: manualTransferPairRows.length,
      decisionIds: manualTransferPairRows.map((row) => normalizeId(row.Entscheidung_ID)).filter(Boolean),
      missingTransactionIds: missingManualTransferIds,
      incompleteDecisionIds: incompleteManualTransferPairIds.filter(Boolean),
    },
  };
}

export async function applyReviewDecisionPlanToFinanceCopy({
  financeWorkbookPath,
  decisionPlanPath,
  outputPath,
  allowLayoutExpansion = false,
}) {
  const preflight = await preflightReviewDecisionPlan({ financeWorkbookPath, decisionPlanPath });
  const validation = {
    valid: preflight.valid,
    errors: [...preflight.errors],
    warnings: [...preflight.warnings],
  };
  const capacityErrors = validation.errors.filter((error) => error.includes("exceeds safe blank-row capacity"));
  const nonCapacityErrors = validation.errors.filter((error) => !error.includes("exceeds safe blank-row capacity"));
  if (!preflight.valid && (!allowLayoutExpansion || nonCapacityErrors.length > 0)) {
    return {
      validation,
      preflight,
      applied: { regularPayments: 0 },
      outputPath: null,
    };
  }

  const [financeInput, planInput] = await Promise.all([
    FileBlob.load(financeWorkbookPath),
    FileBlob.load(decisionPlanPath),
  ]);
  const financeWorkbook = await SpreadsheetFile.importXlsx(financeInput);
  const planWorkbook = await SpreadsheetFile.importXlsx(planInput);
  const planRows = readRegularPaymentPlanRows(planWorkbook);
  const categoryMappingRows = readCategoryMappingPlanRows(planWorkbook);
  const transferRuleRows = readTransferRulePlanRows(planWorkbook);
  const manualTransferPairRows = readManualTransferPairPlanRows(planWorkbook);
  const expansionRows = Math.max(0, planRows.length - preflight.regularPayments.availableBlankRows);
  const regularPaymentSheet = financeWorkbook.worksheets.getItem("12_Regelzahlungen");
  const regularPaymentDataEndRow = Math.max(
    7,
    preflight.regularPayments.lastAvailableRow,
    preflight.regularPayments.appendRow + planRows.length - 1,
  );
  unmergeRows(regularPaymentSheet, 7, regularPaymentPlanHeaders.length, regularPaymentDataEndRow - 6);

  if (allowLayoutExpansion && expansionRows > 0) {
    const shiftStartRow = preflight.regularPayments.appendRow + preflight.regularPayments.availableBlankRows;
    shiftRangeDown(regularPaymentSheet, shiftStartRow, regularPaymentPlanHeaders.length, 1000, expansionRows);
    validation.valid = true;
    validation.errors = [];
    validation.warnings.push(`Layout expanded by ${expansionRows} row(s) in finance copy.`);
  }

  const appendRow = findRegularPaymentAppendRow(financeWorkbook);
  const applied = {
    regularPayments: planRows.length,
    categoryMappings: 0,
    transferConfirmations: 0,
    manualTransferPairs: 0,
    manualTransferTransactions: 0,
    layoutExpandedRows: expansionRows,
  };

  if (planRows.length > 0) {
    const endCol = colName(regularPaymentPlanHeaders.length);
    const endRow = appendRow + planRows.length - 1;
    regularPaymentSheet.getRange(`A${appendRow}:${endCol}${endRow}`).values = regularPaymentMatrix(planRows);
  }

  applied.categoryMappings = applyCategoryMappingsToModelTransactions(financeWorkbook, categoryMappingRows);
  applied.transferConfirmations = applyTransferConfirmationsToModelTransactions(financeWorkbook, transferRuleRows);
  const manualTransferApply = applyManualTransferPairsToModelTransactions(financeWorkbook, manualTransferPairRows);
  applied.manualTransferPairs = manualTransferApply.pairs;
  applied.manualTransferTransactions = manualTransferApply.transactions;

  writeApplyAuditSheet(financeWorkbook, {
    financeWorkbookPath,
    decisionPlanPath,
    outputPath,
    preflight,
    validation,
    applied,
    allowLayoutExpansion,
  });

  financeWorkbook.recalculate();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(financeWorkbook);
  await output.save(outputPath);

  return {
    validation,
    preflight,
    applied,
    outputPath,
  };
}

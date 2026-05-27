import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

function colName(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function writeTable(sheet, startCell, headers, rows) {
  const startCol = startCell.match(/[A-Z]+/)[0];
  const startRow = Number(startCell.match(/\d+/)[0]);
  const startColIndex = startCol.charCodeAt(0) - 64;
  const endCol = colName(startColIndex + headers.length - 1);
  const endRow = startRow + rows.length;
  sheet.getRange(`${startCell}:${endCol}${endRow}`).values = [headers, ...rows];
}

function buildAuditRows({ workbookPath, outputPath, verification }) {
  return [
    ["sourceWorkbookPath", workbookPath, "Input workbook that was verified"],
    ["outputPath", outputPath, "Verified workbook copy"],
    ["verificationStatus", "bestanden", "Only written after passed verification"],
    ["checksTotal", verification.checksTotal, "Verifier checks executed"],
    ["checksPassed", verification.checksPassed, "Verifier checks passed"],
    ["checksFailed", verification.checksFailed, "Verifier checks failed"],
    ["openFindingsAfterBuildCheck", verification.openFindingsAfterBuildCheck, "Remaining open non-build findings"],
    ["closedCheckId", "CHK-BLD-01", "Build check closed in this copy"],
  ];
}

function writeBuildVerificationAuditSheet(workbook, audit) {
  const sheet = workbook.worksheets.add("99_Build_Verification_Audit");
  sheet.showGridLines = false;
  sheet.getRange("A1").values = [["99_Build_Verification_Audit"]];
  writeTable(sheet, "A3", ["Kennzahl", "Wert", "Hinweis"], buildAuditRows(audit));
}

export async function applyBuildVerificationPass({ workbookPath, outputPath, verification }) {
  if (!verification?.passed) {
    throw new Error("Cannot write verified workbook copy because verification did not pass");
  }

  const input = await FileBlob.load(workbookPath);
  const workbook = await SpreadsheetFile.importXlsx(input);

  const dashboard = workbook.worksheets.getItem("00_Dashboard");
  dashboard.getRange("B4").values = [[
    '=IF(COUNTIFS(\'99_Checks\'!D:D,"Fehler",\'99_Checks\'!E:E,"offen")>0,"Rot",IF(COUNTIFS(\'99_Checks\'!D:D,"Warnung",\'99_Checks\'!E:E,"offen")>0,"Gelb","Gruen"))',
  ]];
  dashboard.getRange("B5:C5").values = [["bestanden", "Workbook-Verifikation bestanden"]];
  dashboard.getRange("B6:C6").values = [["Review abschliessen und Prognosebefunde bearbeiten", "Build-Check ist erledigt; fachliche Warnungen bleiben offen"]];
  dashboard.getRange("F10:H12").values = [
    ["Buchung mit offener Kategorie", "Warnung", "Kategorie pruefen"],
    ["Prognose nutzt unbestaetigte Regelzahlung", "Warnung", "Regelzahlung im Review entscheiden"],
    ["Zeitachse faellt im Standardszenario unter null", "Warnung", "Ausgabenannahme und Reserve pruefen"],
  ];

  const control = workbook.worksheets.getItem("98_Kontrollspur");
  control.getRange("E3").values = [["bestanden"]];
  control.getRange("H7:M7").values = [[
    "bestanden",
    "workbook-build/verify_finanzmodell_v1.mjs",
    verification.checksTotal,
    verification.checksPassed,
    verification.checksFailed,
    verification.openFindingsAfterBuildCheck,
  ]];
  control.getRange("O7").values = [["Workbook-Verifikation bestanden; Build-Check in verifizierter Kopie geschlossen"]];

  const checks = workbook.worksheets.getItem("99_Checks");
  checks.getRange("E7:N7").values = [[
    "erledigt",
    "",
    "",
    "",
    "BLD-20260521-001",
    "98_Build_Verifikation",
    "BLD-20260521-001",
    "Verifier_Status bestanden",
    "Keine Aktion",
    "Build-Verifikation in separater Kopie bestanden",
  ]];

  const warnings = workbook.worksheets.getItem("60_Warnungen");
  warnings.getRange("H7:J7").values = [["erledigt", "Keine Aktion", "Build-Verifikation in separater Kopie bestanden"]];

  writeBuildVerificationAuditSheet(workbook, { workbookPath, outputPath, verification });
  workbook.recalculate();

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);

  return {
    outputPath,
    closedCheckId: "CHK-BLD-01",
    verificationStatus: "bestanden",
    openFindingsAfterBuildCheck: verification.openFindingsAfterBuildCheck,
  };
}

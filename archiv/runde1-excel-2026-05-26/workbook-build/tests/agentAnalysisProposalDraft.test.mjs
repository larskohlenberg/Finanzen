import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProposalFromCsvDraft } from "../src/agentCsvProposalDraft.mjs";
import { applyImportProposal } from "../src/importWriterVerifier.mjs";
import { createAnalysisSuggestionsFromWorkbookDraft } from "../src/agentAnalysisProposalDraft.mjs";
import {
  applyAnalysisSuggestions,
  validateAnalysisSuggestions,
} from "../src/analysisSuggestionWriterVerifier.mjs";

const workbookPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Startmappe.xlsx";

async function writePatternCsv(sourcePath) {
  await writeFile(
    sourcePath,
    [
      '"Girokonto";"DE00000000000000000000"',
      '"Zeitraum:";"01.01.2026 - 31.03.2026"',
      '"Kontostand vom 31.03.2026:";"1.234,56 €"',
      '""',
      '"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)";"Gläubiger-ID";"Mandatsreferenz";"Kundenreferenz"',
      '"02.01.26";"02.01.26";"Gebucht";"Arbeitgeber";"P01";"Gehalt";"Eingang";"";"2.500,00";"";"";""',
      '"02.02.26";"02.02.26";"Gebucht";"Arbeitgeber";"P01";"Gehalt";"Eingang";"";"2.500,00";"";"";""',
      '"02.03.26";"02.03.26";"Gebucht";"Arbeitgeber";"P01";"Gehalt";"Eingang";"";"2.500,00";"";"";""',
      '"05.01.26";"05.01.26";"Gebucht";"P01";"Vermieter";"Miete";"Ausgang";"DE00999999999999999999";"-1.000,00";"";"";""',
      '"05.02.26";"05.02.26";"Gebucht";"P01";"Vermieter";"Miete";"Ausgang";"DE00999999999999999999";"-1.000,00";"";"";""',
      '"05.03.26";"05.03.26";"Gebucht";"P01";"Vermieter";"Miete";"Ausgang";"DE00999999999999999999";"-1.000,00";"";"";""',
      '"10.01.26";"10.01.26";"Gebucht";"P01";"Eigenes Tagesgeld";"Übertrag";"Ausgang";"DE00888888888888888888";"-500,00";"";"";""',
      '"11.01.26";"11.01.26";"Gebucht";"P01";"Supermarkt";"Kartenzahlung";"Ausgang";"";"-42,10";"";"";""',
      '"18.01.26";"18.01.26";"Gebucht";"P01";"Supermarkt";"Kartenzahlung";"Ausgang";"";"-51,20";"";"";""',
      '"25.01.26";"25.01.26";"Gebucht";"P01";"Supermarkt";"Kartenzahlung";"Ausgang";"";"-38,70";"";"";""',
      '"03.02.26";"03.02.26";"Gebucht";"P01";"Supermarkt";"Kartenzahlung";"Ausgang";"";"-61,10";"";"";""',
      '"12.02.26";"12.02.26";"Gebucht";"P01";"Supermarkt";"Kartenzahlung";"Ausgang";"";"-47,60";"";"";""',
    ].join("\n"),
    "utf8",
  );
}

test("creates mirrored recurring-payment and agent suggestions from an import draft", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "agent-analysis-draft-"));
  const sourcePath = join(tempDir, "patterns.csv");
  const importPath = join(tempDir, "import_draft.xlsx");
  const outputPath = join(tempDir, "analysis_output.xlsx");
  await writePatternCsv(sourcePath);

  try {
    const proposal = await createProposalFromCsvDraft({
      sourcePath,
      maxTransactions: 100,
      ids: {
        sourceId: "SRC-20260331-ANALYSIS",
        importId: "IMP-20260331-ANALYSIS",
        runId: "RUN-20260331-IMPORT",
        warningId: "WRN-IMPORT-DRAFT-ANALYSIS",
        checkId: "CHK-IMPORT-DRAFT-ANALYSIS",
      },
      accountId: "KTO001",
      personId: "P01",
      importDate: "2026-03-31",
    });
    await applyImportProposal({ workbookPath, outputPath: importPath, proposal });

    const suggestions = await createAnalysisSuggestionsFromWorkbookDraft({
      workbookPath: importPath,
      importId: "IMP-20260331-ANALYSIS",
      runId: "RUN-20260331-ANALYSIS",
      createdAt: "2026-03-31",
      firstSuggestionNumber: 301,
    });

    const validation = validateAnalysisSuggestions(suggestions);
    assert.equal(validation.valid, true, validation.errors.join("\n"));
    assert.equal(suggestions.regularPaymentSuggestions.length, 2);
    assert.equal(suggestions.agentSuggestions.length >= 3, true);
    assert.deepEqual(
      suggestions.regularPaymentSuggestions.map((row) => row.Vorschlag_ID),
      suggestions.agentSuggestions
        .filter((row) => row.Vorschlagstyp === "neue_Regelzahlung")
        .map((row) => row.Vorschlag_ID),
    );
    assert.ok(
      suggestions.agentSuggestions.some((row) => row.Vorschlagstyp === "neue_Transferregel"),
    );
    assert.ok(
      suggestions.agentSuggestions.some((row) => row.Vorschlagstyp === "Kategorie_Mapping"),
    );

    const report = await applyAnalysisSuggestions({
      workbookPath: importPath,
      outputPath,
      suggestions,
    });
    assert.equal(report.validation.valid, true);
    assert.equal(report.appended["12_Regelzahlung_Vorschlaege"], 2);
    assert.equal(report.appended["73_Agent_Vorschlaege"], suggestions.agentSuggestions.length);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

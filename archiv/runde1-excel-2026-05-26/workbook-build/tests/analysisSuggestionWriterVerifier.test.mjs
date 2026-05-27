import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import {
  applyAnalysisSuggestions,
  validateAnalysisSuggestions,
} from "../src/analysisSuggestionWriterVerifier.mjs";

const workbookPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Startmappe.xlsx";

function validSuggestions() {
  return {
    regularPaymentSuggestions: [
      {
        Vorschlag_ID: "SUG-20260630-101",
        Erkannt_am: "2026-06-30",
        Lauf_ID: "RUN-ANALYSIS-001",
        Vorgeschlagener_Name: "Monatliches Muster",
        Vorgeschlagene_Frequenz: "monatlich",
        Treffer_Anzahl: 3,
        Erstes_Datum: "2026-04-01",
        Letztes_Datum: "2026-06-01",
        Median_Betrag: -1000,
        Betrag_Min: -1000,
        Betrag_Max: -1000,
        Betrag_Variabilitaet: 0,
        Typ: "Ausgabe",
        Kategorie_ID_Vorschlag: "KAT013",
        Person_ID_Vorschlag: "",
        Konto_ID: "KTO001",
        Gegenpartei_Muster: "Monatliche Gegenpartei",
        IBAN_Muster: "",
        Verwendungszweck_Muster: "Monatliches Muster",
        Konfidenz: 0.78,
        Status: "offen",
        Erkennungs_Hinweis: "3 Treffer in 3 Monaten",
        Kommentar: "Analyse-Draft; nicht umgesetzt",
      },
    ],
    agentSuggestions: [
      {
        Vorschlag_ID: "SUG-20260630-101",
        Vorschlag_Fingerprint: "neue_Regelzahlung|kto001|monatliche-gegenpartei|-1000",
        Lauf_ID: "RUN-ANALYSIS-001",
        Methodik_ID: "METH_ANALYSE_REGELZAHLUNGEN",
        Vorschlagstyp: "neue_Regelzahlung",
        Betroffene_Tabelle: "12_Regelzahlung_Vorschlaege",
        Betroffene_ID: "SUG-20260630-101",
        Empfohlene_Aktion: "Regelzahlung pruefen",
        Begruendung: "Wiederkehrendes Monatsmuster erkannt",
        Konfidenz: 0.78,
        Prioritaet: "normal",
        Status: "offen",
        Umsetzung_Eindeutig: false,
        Umsetzungsstatus: "nicht_beauftragt",
        Kommentar: "Spiegelvorschlag",
      },
    ],
  };
}

test("validates analysis suggestions for allowed proposal tables", () => {
  const validation = validateAnalysisSuggestions(validSuggestions());
  assert.equal(validation.valid, true, validation.errors.join("\n"));

  const invalid = validSuggestions();
  invalid.regularPaymentSuggestions[0].Unbekanntes_Feld = "nope";
  const invalidValidation = validateAnalysisSuggestions(invalid);
  assert.equal(invalidValidation.valid, false);
  assert.match(invalidValidation.errors.join("\n"), /unknown field/);
});

test("applies analysis suggestions to a workbook copy", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "analysis-suggestions-"));
  const outputPath = join(tempDir, "analysis_suggestions.xlsx");

  try {
    const report = await applyAnalysisSuggestions({
      workbookPath,
      outputPath,
      suggestions: validSuggestions(),
    });

    assert.equal(report.validation.valid, true);
    assert.equal(report.appended["12_Regelzahlung_Vorschlaege"], 1);
    assert.equal(report.appended["73_Agent_Vorschlaege"], 1);

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const matches = await workbook.inspect({
      kind: "match",
      searchTerm: "SUG-20260630-101|neue_Regelzahlung|12_Regelzahlung_Vorschlaege",
      options: { useRegex: true, maxResults: 20 },
      summary: "analysis suggestions output IDs",
    });

    assert.match(matches.ndjson, /SUG-20260630-101/);
    assert.match(matches.ndjson, /neue_Regelzahlung/);
    assert.match(matches.ndjson, /12_Regelzahlung_Vorschlaege/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

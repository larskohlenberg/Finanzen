import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import {
  applyImportProposal,
  validateImportProposal,
} from "../src/importWriterVerifier.mjs";

const workbookPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Startmappe.xlsx";

const validProposal = {
  sourceRow: {
    Quelle_ID: "SRC-20260601-001",
    Quellenart: "Bankexport",
    Eltern_Quelle_ID: "",
    Eingangskanal: "agent",
    Originaldateiname: "agent_test_giro.csv",
    Dateiname_Modell: "agent_test_giro.csv",
    Dateipfad: "workbook-build/tests/fixtures/csv/agent_test_giro.csv",
    Dateihash: "hash-agent-test",
    Belegtyp: "CSV",
    Quelle_Anbieter: "Bank",
    Belegdatum: "2026-06-01",
    Standdatum: "2026-06-01",
    Abrufdatum: "2026-06-01",
    Wertname: "Startsaldo",
    Wert: 5175.25,
    Einheit: "EUR",
    Zeitraum: "Juni 2026",
    Zeitraum_von: "2026-06-01",
    Zeitraum_bis: "2026-06-30",
    Seite_Abschnitt: "Export",
    Zielblatt: "03_Konten",
    Ziel_ID: "KTO001",
    Person_ID: "P01",
    Objekt_ID: "",
    Szenario_Relevanz: "S01",
    Status: "ungeprueft",
    Unsicherheit: "Agent-Testimport",
    Kommentar: "Vom Agenten vorgeschlagene Quelle",
    Geprueft_am: "",
  },
  importRun: {
    Import_ID: "IMP-20260601-001",
    Importdatei: "agent_test_giro.csv",
    Quellkonto_ID: "KTO001",
    Quelle_ID: "SRC-20260601-001",
    Zeitraum_von: "2026-06-01",
    Zeitraum_bis: "2026-06-30",
    Kontostand_Export: 5175.25,
    Kontostand_Datum: "2026-06-30",
    Importdatum: "2026-06-01",
    Zeilen_gesamt: 2,
    Zeilen_importiert: 2,
    Duplikate: 0,
    Parse_Fehler: 0,
    Status: "agent_vorschlag",
    Lauf_ID: "RUN-20260601-001",
    Kommentar: "Importvorschlag aus Agent-first Test",
  },
  rawTransactions: [
    {
      Rohumsatz_ID: "RAW-IMP-20260601-001-000001",
      Import_ID: "IMP-20260601-001",
      Quellkonto_ID: "KTO001",
      Importdatei: "agent_test_giro.csv",
      Importdatum: "2026-06-01",
      Zeilennummer_Import: 1,
      Zeilenhash: "raw-hash-1",
      Duplikat_Status: "neu",
      Parse_Status: "ok",
      Parse_Hinweis: "",
      Buchungsdatum: "2026-06-03",
      Wertstellung: "2026-06-03",
      Status_Bank: "gebucht",
      Zahlungspflichtiger: "Arbeitgeber GmbH",
      Zahlungsempfaenger: "P01",
      Verwendungszweck: "Gehalt Juni",
      Umsatztyp: "Gutschrift",
      IBAN: "DE**ARBEIT",
      Betrag: 2500,
      Glaeubiger_ID: "",
      Mandatsreferenz: "",
      Kundenreferenz: "",
    },
    {
      Rohumsatz_ID: "RAW-IMP-20260601-001-000002",
      Import_ID: "IMP-20260601-001",
      Quellkonto_ID: "KTO001",
      Importdatei: "agent_test_giro.csv",
      Importdatum: "2026-06-01",
      Zeilennummer_Import: 2,
      Zeilenhash: "raw-hash-2",
      Duplikat_Status: "neu",
      Parse_Status: "ok",
      Parse_Hinweis: "Kategorie offen",
      Buchungsdatum: "2026-06-04",
      Wertstellung: "2026-06-04",
      Status_Bank: "gebucht",
      Zahlungspflichtiger: "P01",
      Zahlungsempfaenger: "Unklare Gegenpartei",
      Verwendungszweck: "Online Zahlung",
      Umsatztyp: "Kartenzahlung",
      IBAN: "",
      Betrag: -89.9,
      Glaeubiger_ID: "",
      Mandatsreferenz: "",
      Kundenreferenz: "",
    },
  ],
  modelTransactions: [
    {
      Transaktion_ID: "TXN-RAW-IMP-20260601-001-000001",
      Rohumsatz_ID: "RAW-IMP-20260601-001-000001",
      Konto_ID: "KTO001",
      Zielkonto_ID: "",
      Kategorie_ID: "KAT001",
      Person_ID: "P01",
      Regel_ID: "",
      Regel_Match_Status: "kein_match",
      Regel_Match_Hinweis: "Agentenvorschlag",
      Erwartetes_Zahldatum: "2026-06-03",
      Betragsabweichung: "",
      Tage_Abweichung: "",
      Betrag: 2500,
      Buchungsmonat: "2026-06",
      Cashflow_Wirkung: "Einnahme",
      Szenario_Wirkung: "Ist",
      Ist_Transfer: false,
      Transfer_Status: "kein_transfer",
      Transfer_Typ: "",
      Gegenbuchung_Transaktion_ID: "",
      Transfer_Regel_ID: "",
      Lebenshaltung_Relevant: true,
      Transfer_Pruefhinweis: "",
      Status: "offen",
      Kommentar: "Agentenvorschlag",
    },
    {
      Transaktion_ID: "TXN-RAW-IMP-20260601-001-000002",
      Rohumsatz_ID: "RAW-IMP-20260601-001-000002",
      Konto_ID: "KTO001",
      Zielkonto_ID: "",
      Kategorie_ID: "KAT013",
      Person_ID: "",
      Regel_ID: "",
      Regel_Match_Status: "kein_match",
      Regel_Match_Hinweis: "Kategorie offen",
      Erwartetes_Zahldatum: "2026-06-04",
      Betragsabweichung: "",
      Tage_Abweichung: "",
      Betrag: -89.9,
      Buchungsmonat: "2026-06",
      Cashflow_Wirkung: "Ausgabe",
      Szenario_Wirkung: "Ist",
      Ist_Transfer: false,
      Transfer_Status: "unklar",
      Transfer_Typ: "",
      Gegenbuchung_Transaktion_ID: "",
      Transfer_Regel_ID: "",
      Lebenshaltung_Relevant: true,
      Transfer_Pruefhinweis: "Offene Kategorie",
      Status: "offen",
      Kommentar: "Unsicherheit bleibt sichtbar",
    },
  ],
  warnings: [
    {
      Warnungs_ID: "WRN-IMPORT-AGENT-001",
      Warnungs_Fingerprint: "CHK-IMPORT-AGENT-001|TXN-RAW-IMP-20260601-001-000002",
      Check_ID: "CHK-IMPORT-AGENT-001",
      Schweregrad: "Warnung",
      Titel: "Agentenimport enthaelt offene Kategorie",
      Betroffene_Tabelle: "11_Umsaetze_Modell",
      Betroffene_ID: "TXN-RAW-IMP-20260601-001-000002",
      Status: "offen",
      Naechste_Aktion: "Kategorie pruefen",
      Kommentar: "KAT013 aus Importvorschlag",
    },
  ],
  checks: [
    {
      Check_ID: "CHK-IMPORT-AGENT-001",
      Checkgruppe: "Import",
      Beschreibung: "Agentenimport enthaelt offene Kategorie",
      Schweregrad: "Warnung",
      Status: "offen",
      Betroffene_Quelle_ID: "SRC-20260601-001",
      Betroffene_Annahme_ID: "",
      Betroffener_Import_ID: "IMP-20260601-001",
      Betroffener_Kontrollspur_ID: "",
      Betroffene_Tabelle: "11_Umsaetze_Modell",
      Betroffene_ID: "TXN-RAW-IMP-20260601-001-000002",
      Ausloeser: "Kategorie_ID = KAT013",
      Naechste_Aktion: "Kategorie pruefen",
      Kommentar: "Vom Import-Agenten bewusst offengehalten",
    },
  ],
  questions: [],
};

test("validates a complete agent import proposal", () => {
  const result = validateImportProposal(validProposal);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("rejects missing or unknown top-level sections", () => {
  const missing = structuredClone(validProposal);
  delete missing.questions;
  assert.equal(validateImportProposal(missing).valid, false);
  assert.match(validateImportProposal(missing).errors.join("\n"), /missing section: questions/);

  const unknown = { ...validProposal, freeExcelEdits: [] };
  assert.equal(validateImportProposal(unknown).valid, false);
  assert.match(validateImportProposal(unknown).errors.join("\n"), /unknown section: freeExcelEdits/);
});

test("rejects unknown target fields", () => {
  const proposal = structuredClone(validProposal);
  proposal.rawTransactions[0].Neue_Spalte = "not allowed";
  const result = validateImportProposal(proposal);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /10_Umsaetze_Roh.*Neue_Spalte/);
});

test("applies valid proposal to a copied workbook", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "agent-import-"));
  const outputPath = join(tempDir, "agent_import_output.xlsx");

  try {
    const report = await applyImportProposal({
      workbookPath,
      outputPath,
      proposal: validProposal,
    });

    assert.equal(report.validation.valid, true);
    assert.deepEqual(report.appended, {
      "90_Quellen": 1,
      "10_Importlaeufe": 1,
      "10_Umsaetze_Roh": 2,
      "11_Umsaetze_Modell": 2,
      "60_Warnungen_Aktuell": 1,
      "99_Checks": 1,
    });

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const matches = await workbook.inspect({
      kind: "match",
      searchTerm:
        "SRC-20260601-001|IMP-20260601-001|RAW-IMP-20260601-001-000001|TXN-RAW-IMP-20260601-001-000001|CHK-IMPORT-AGENT-001",
      options: { useRegex: true, maxResults: 20 },
      summary: "agent import output IDs",
    });

    assert.match(matches.ndjson, /SRC-20260601-001/);
    assert.match(matches.ndjson, /IMP-20260601-001/);
    assert.match(matches.ndjson, /RAW-IMP-20260601-001-000001/);
    assert.match(matches.ndjson, /TXN-RAW-IMP-20260601-001-000001/);
    assert.match(matches.ndjson, /CHK-IMPORT-AGENT-001/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

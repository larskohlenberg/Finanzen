import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { createProposalFromCsvDraft } from "../src/agentCsvProposalDraft.mjs";
import { applyImportProposal, validateImportProposal } from "../src/importWriterVerifier.mjs";

const workbookPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Startmappe.xlsx";

async function writeSampleCsv(sourcePath) {
  await writeFile(
    sourcePath,
    [
      '"Girokonto";"DE00000000000000000000"',
      '"Zeitraum:";"01.06.2026 - 30.06.2026"',
      '"Kontostand vom 30.06.2026:";"1.234,56 €"',
      '""',
      '"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)";"Gläubiger-ID";"Mandatsreferenz";"Kundenreferenz"',
      '"03.06.26";"03.06.26";"Gebucht";"Arbeitgeber";"P01";"Gehalt";"Eingang";"";"2.500,00";"";"";""',
      '"04.06.26";"04.06.26";"Gebucht";"P01";"Eigenes Konto";"Übertrag";"Ausgang";"DE00999999999999999999";"-4.501";"";"";""',
      '"05.06.26";"05.06.26";"Gebucht";"P01";"Unklar";"Kartenzahlung";"Ausgang";"";"-89,90";"";"";"REF123"',
    ].join("\n"),
    "utf8",
  );
}

test("drafts a valid limited agent proposal from a giro CSV", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "agent-csv-draft-"));
  const sourcePath = join(tempDir, "sample_giro.csv");
  await writeSampleCsv(sourcePath);

  try {
    const proposal = await createProposalFromCsvDraft({
      workbookPath,
      sourcePath,
      maxTransactions: 3,
      ids: {
        sourceId: "SRC-20260630-001",
        importId: "IMP-20260630-001",
        runId: "RUN-20260630-001",
        warningId: "WRN-IMPORT-DRAFT-001",
        checkId: "CHK-IMPORT-DRAFT-001",
      },
      accountId: "KTO001",
      personId: "P01",
      importDate: "2026-06-30",
    });

    const validation = validateImportProposal(proposal);
    assert.equal(validation.valid, true, validation.errors.join("\n"));

    assert.equal(proposal.sourceRow.Quelle_ID, "SRC-20260630-001");
    assert.equal(proposal.sourceRow.Dateihash.length, 64);
    assert.equal(proposal.importRun.Zeilen_gesamt, 3);
    assert.equal(proposal.importRun.Kontostand_Export, 1234.56);
    assert.equal(proposal.rawTransactions.length, 3);
    assert.equal(proposal.rawTransactions[1].Betrag, -4501);
    assert.equal(proposal.rawTransactions[2].Betrag, -89.9);
    assert.equal(proposal.modelTransactions[0].Kategorie_ID, "KAT013");
    assert.equal(proposal.modelTransactions[0].Person_ID, "");
    assert.equal(proposal.modelTransactions[1].Transfer_Status, "unklar");
    assert.equal(proposal.checks[0].Betroffener_Import_ID, "IMP-20260630-001");
    assert.match(proposal.questions[0], /Kategorien/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("applies a limited CSV draft proposal to a workbook copy", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "agent-csv-draft-"));
  const sourcePath = join(tempDir, "sample_giro.csv");
  const outputPath = join(tempDir, "draft_import_output.xlsx");
  await writeSampleCsv(sourcePath);

  try {
    const proposal = await createProposalFromCsvDraft({
      workbookPath,
      sourcePath,
      maxTransactions: 2,
      ids: {
        sourceId: "SRC-20260630-002",
        importId: "IMP-20260630-002",
        runId: "RUN-20260630-002",
        warningId: "WRN-IMPORT-DRAFT-002",
        checkId: "CHK-IMPORT-DRAFT-002",
      },
      accountId: "KTO001",
      personId: "P01",
      importDate: "2026-06-30",
    });

    const report = await applyImportProposal({ workbookPath, outputPath, proposal });
    assert.equal(report.validation.valid, true);
    assert.equal(report.appended["10_Umsaetze_Roh"], 2);
    assert.equal(report.appended["11_Umsaetze_Modell"], 2);

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    const matches = await workbook.inspect({
      kind: "match",
      searchTerm: "SRC-20260630-002|IMP-20260630-002|RAW-IMP-20260630-002-000001|TXN-RAW-IMP-20260630-002-000001|CHK-IMPORT-DRAFT-002",
      options: { useRegex: true, maxResults: 20 },
      summary: "draft import output IDs",
    });

    assert.match(matches.ndjson, /SRC-20260630-002/);
    assert.match(matches.ndjson, /IMP-20260630-002/);
    assert.match(matches.ndjson, /RAW-IMP-20260630-002-000001/);
    assert.match(matches.ndjson, /TXN-RAW-IMP-20260630-002-000001/);
    assert.match(matches.ndjson, /CHK-IMPORT-DRAFT-002/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readImportWorkbookContext } from "../src/importWorkbookContext.mjs";
import { createProposalFromCsvDraft } from "../src/agentCsvProposalDraft.mjs";
import { applyImportProposal } from "../src/importWriterVerifier.mjs";

const workbookPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Startmappe.xlsx";

test("reads allowed import tables and existing IDs from the workbook", async () => {
  const context = await readImportWorkbookContext({ workbookPath });

  assert.equal(context.workbookPath, workbookPath);
  assert.deepEqual(Object.keys(context.targetTables), [
    "90_Quellen",
    "10_Importlaeufe",
    "10_Umsaetze_Roh",
    "11_Umsaetze_Modell",
    "60_Warnungen_Aktuell",
    "99_Checks",
  ]);

  assert.equal(context.targetTables["90_Quellen"].sheetName, "90_Quellen");
  assert.equal(context.targetTables["90_Quellen"].primaryKey, "Quelle_ID");
  assert.ok(context.targetTables["90_Quellen"].columns.includes("Quelle_ID"));
  assert.ok(context.targetTables["90_Quellen"].existingIds.includes("SRC-20260518-001"));

  assert.equal(context.targetTables["10_Importlaeufe"].primaryKey, "Import_ID");
  assert.ok(context.targetTables["10_Importlaeufe"].existingIds.includes("IMP-20260518-001"));

  assert.equal(context.targetTables["10_Umsaetze_Roh"].primaryKey, "Rohumsatz_ID");
  assert.ok(context.targetTables["10_Umsaetze_Roh"].existingIds.includes("RAW-IMP-20260518-001-000001"));

  assert.equal(context.targetTables["11_Umsaetze_Modell"].primaryKey, "Transaktion_ID");
  assert.ok(context.targetTables["11_Umsaetze_Modell"].existingIds.includes("TXN-RAW-IMP-20260518-001-000001"));

  assert.equal(context.targetTables["60_Warnungen_Aktuell"].primaryKey, "Warnungs_ID");
  assert.ok(context.targetTables["60_Warnungen_Aktuell"].existingIds.includes("WRN001"));

  assert.equal(context.targetTables["99_Checks"].primaryKey, "Check_ID");
  assert.ok(context.targetTables["99_Checks"].existingIds.includes("CHK-BLD-01"));
});

test("exposes import boundaries for the agent", async () => {
  const context = await readImportWorkbookContext({ workbookPath });

  assert.deepEqual(context.allowedSections, [
    "sourceRow",
    "importRun",
    "rawTransactions",
    "modelTransactions",
    "warnings",
    "checks",
    "questions",
  ]);
  assert.ok(context.forbiddenTargets.includes("30_Cashflow"));
  assert.ok(context.forbiddenTargets.includes("44_Liquiditaet"));
  assert.ok(context.uncertaintyRules.includes("Unsichere Kategorien bleiben KAT013."));
});

test("reads existing IDs beyond the first 500 rows after a large import", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "import-context-large-"));
  const sourcePath = join(tempDir, "large_giro.csv");
  const outputPath = join(tempDir, "large_import_context.xlsx");

  try {
    const rows = [
      '"Girokonto";"DE00000000000000000000"',
      '"Zeitraum:";"01.06.2026 - 30.06.2026"',
      '"Kontostand vom 30.06.2026:";"1.234,56 €"',
      '""',
      '"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)";"Gläubiger-ID";"Mandatsreferenz";"Kundenreferenz"',
    ];
    for (let index = 1; index <= 550; index += 1) {
      rows.push(`"03.06.26";"03.06.26";"Gebucht";"P01";"Gegenpartei ${index}";"Test ${index}";"Ausgang";"";"-1,00";"";"";""`);
    }
    await writeFile(sourcePath, rows.join("\n"), "utf8");

    const proposal = await createProposalFromCsvDraft({
      sourcePath,
      maxTransactions: 550,
      ids: {
        sourceId: "SRC-20260630-LARGE",
        importId: "IMP-20260630-LARGE",
        runId: "RUN-20260630-LARGE",
        warningId: "WRN-IMPORT-DRAFT-LARGE",
        checkId: "CHK-IMPORT-DRAFT-LARGE",
      },
      accountId: "KTO001",
      personId: "P01",
      importDate: "2026-06-30",
    });
    await applyImportProposal({ workbookPath, outputPath, proposal });

    const context = await readImportWorkbookContext({ workbookPath: outputPath });
    assert.ok(
      context.targetTables["10_Umsaetze_Roh"].existingIds.includes("RAW-IMP-20260630-LARGE-000550"),
    );
    assert.ok(
      context.targetTables["11_Umsaetze_Modell"].existingIds.includes("TXN-RAW-IMP-20260630-LARGE-000550"),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLimitedAgentDraftImport } from "../src/limitedAgentDraftImportRunner.mjs";

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
    ].join("\n"),
    "utf8",
  );
}

test("runs a limited agent-draft import and verifies workbook evidence", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "limited-agent-draft-runner-"));
  const sourcePath = join(tempDir, "sample_giro.csv");
  const outputPath = join(tempDir, "limited_agent_draft.xlsx");
  await writeSampleCsv(sourcePath);

  try {
    const report = await runLimitedAgentDraftImport({
      workbookPath,
      sourcePath,
      outputPath,
      maxTransactions: 2,
      ids: {
        sourceId: "SRC-20260630-RUN",
        importId: "IMP-20260630-RUN",
        runId: "RUN-20260630-RUN",
        warningId: "WRN-IMPORT-DRAFT-RUN",
        checkId: "CHK-IMPORT-DRAFT-RUN",
      },
      accountId: "KTO001",
      personId: "P01",
      importDate: "2026-06-30",
    });

    assert.equal(report.validation.valid, true);
    assert.equal(report.appended["10_Umsaetze_Roh"], 2);
    assert.equal(report.appended["11_Umsaetze_Modell"], 2);
    assert.equal(report.proposalSummary.rawTransactions, 2);
    assert.equal(report.verification.idEvidenceFound, true);
    assert.deepEqual(report.verification.missingIdEvidence, []);
    assert.equal(report.verification.formulaErrorMatches, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

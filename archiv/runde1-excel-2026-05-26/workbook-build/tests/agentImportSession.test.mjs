import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentImportSession } from "../src/agentImportSession.mjs";

const workbookPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Startmappe.xlsx";

test("creates an agent import session packet from workbook context and source preview", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "agent-session-"));
  const sourcePath = join(tempDir, "sample_giro.csv");

  await writeFile(
    sourcePath,
    [
      '"Girokonto";"DE00000000000000000000"',
      '"Zeitraum:";"01.06.2026 - 30.06.2026"',
      '"Kontostand vom 30.06.2026:";"1.234,56 €"',
      '""',
      '"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)"',
      '"03.06.26";"03.06.26";"Gebucht";"Arbeitgeber";"P01";"Gehalt";"Eingang";"";"2.500,00"',
      '"04.06.26";"04.06.26";"Gebucht";"P01";"Unklar";"Kartenzahlung";"Ausgang";"";"-89,90"',
    ].join("\n"),
    "utf8",
  );

  try {
    const session = await createAgentImportSession({
      workbookPath,
      sourcePath,
      previewLineCount: 6,
    });

    assert.equal(session.kind, "agent_import_session");
    assert.equal(session.workbookContext.workbookPath, workbookPath);
    assert.ok(session.workbookContext.targetTables["10_Umsaetze_Roh"].columns.includes("Rohumsatz_ID"));
    assert.equal(session.sourceFile.basename, "sample_giro.csv");
    assert.equal(session.sourceFile.lineCount, 7);
    assert.equal(session.sourceFile.previewLines.length, 6);
    assert.equal(session.sourceFile.detectedDelimiter, ";");
    assert.match(session.sourceFile.sha256, /^[a-f0-9]{64}$/);
    assert.match(session.agentPrompt, /Du bist der Import-Agent/);
    assert.ok(session.outputContract.allowedSections.includes("rawTransactions"));
    assert.ok(session.outputContract.requiredTopLevelFields.includes("questions"));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("caps preview lines without dropping file metadata", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "agent-session-"));
  const sourcePath = join(tempDir, "many_lines.csv");
  await writeFile(sourcePath, ["a;b", "1;2", "3;4", "5;6"].join("\n"), "utf8");

  try {
    const session = await createAgentImportSession({
      workbookPath,
      sourcePath,
      previewLineCount: 2,
    });

    assert.deepEqual(session.sourceFile.previewLines, ["a;b", "1;2"]);
    assert.equal(session.sourceFile.lineCount, 4);
    assert.equal(session.sourceFile.detectedDelimiter, ";");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

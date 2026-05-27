import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { applyBuildVerificationPass } from "../src/buildVerificationWorkbook.mjs";

const financeWorkbookPath = "outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Startmappe.xlsx";

function records(ndjson) {
  return ndjson
    .split("\n")
    .filter((line) => line.trim().startsWith("{"))
    .map((line) => JSON.parse(line));
}

test("writes a verified workbook copy and closes only the build verification check", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "build-verification-workbook-"));
  const outputPath = join(tempDir, "verified.xlsx");

  try {
    const report = await applyBuildVerificationPass({
      workbookPath: financeWorkbookPath,
      outputPath,
      verification: {
        passed: true,
        checksTotal: 30,
        checksPassed: 30,
        checksFailed: 0,
        openFindingsAfterBuildCheck: 6,
      },
    });

    assert.equal(report.outputPath, outputPath);
    assert.equal(report.closedCheckId, "CHK-BLD-01");

    const input = await FileBlob.load(outputPath);
    const workbook = await SpreadsheetFile.importXlsx(input);
    workbook.recalculate();

    const dashboard = records(
      (await workbook.inspect({
        kind: "table",
        range: "00_Dashboard!A4:K14",
        include: "values,formulas",
        tableMaxRows: 11,
        tableMaxCols: 11,
        summary: "verified dashboard",
      })).ndjson,
    ).find((row) => row.kind === "table");
    assert.equal(dashboard.values[0][1], "Gelb");
    assert.equal(dashboard.values[1][1], "bestanden");
    assert.equal(dashboard.values[10][1], 6);

    const checks = records(
      (await workbook.inspect({
        kind: "table",
        range: "99_Checks!A6:N13",
        include: "values,formulas",
        tableMaxRows: 8,
        tableMaxCols: 14,
        summary: "verified checks",
      })).ndjson,
    ).find((row) => row.kind === "table");
    const checkRows = checks.values.slice(1);
    const buildCheck = checkRows.find((row) => row[0] === "CHK-BLD-01");
    assert.equal(buildCheck[4], "erledigt");
    assert.equal(checkRows.filter((row) => row[4] === "offen").length, 6);

    const matches = await workbook.inspect({
      kind: "match",
      searchTerm: "99_Build_Verification_Audit|checksPassed|30|closedCheckId|CHK-BLD-01",
      options: { useRegex: true, maxResults: 40 },
      summary: "build verification audit",
    });
    assert.match(matches.ndjson, /99_Build_Verification_Audit/);
    assert.match(matches.ndjson, /closedCheckId/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

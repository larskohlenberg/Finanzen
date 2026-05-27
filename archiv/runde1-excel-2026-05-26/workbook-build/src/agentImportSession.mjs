import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { allowedSections, tableColumns } from "./importWriterVerifier.mjs";
import { readImportWorkbookContext } from "./importWorkbookContext.mjs";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const promptPath = path.join(moduleDir, "..", "agentImportPrompt.md");

function lineList(text) {
  if (text.length === 0) return [];
  return text.replace(/^\uFEFF/, "").split(/\r?\n/);
}

function detectDelimiter(lines) {
  const sample = lines.find((line) => line.trim() !== "") ?? "";
  const candidates = [";", ",", "\t"];
  return candidates
    .map((delimiter) => ({ delimiter, count: sample.split(delimiter).length - 1 }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? "";
}

export async function createAgentImportSession({
  workbookPath,
  sourcePath,
  previewLineCount = 20,
}) {
  const [workbookContext, sourceBuffer, agentPrompt] = await Promise.all([
    readImportWorkbookContext({ workbookPath }),
    fs.readFile(sourcePath),
    fs.readFile(promptPath, "utf8"),
  ]);

  const sourceText = sourceBuffer.toString("utf8");
  const lines = lineList(sourceText);
  const stat = await fs.stat(sourcePath);

  return {
    kind: "agent_import_session",
    createdAt: new Date().toISOString(),
    workbookContext,
    sourceFile: {
      path: sourcePath,
      basename: path.basename(sourcePath),
      sizeBytes: stat.size,
      sha256: crypto.createHash("sha256").update(sourceBuffer).digest("hex"),
      lineCount: lines.length,
      previewLineCount,
      previewLines: lines.slice(0, previewLineCount),
      detectedDelimiter: detectDelimiter(lines),
      encodingAssumption: "utf8",
    },
    outputContract: {
      allowedSections,
      requiredTopLevelFields: allowedSections,
      targetTables: Object.fromEntries(
        Object.entries(tableColumns).map(([tableName, columns]) => [tableName, { columns }]),
      ),
    },
    agentPrompt,
  };
}

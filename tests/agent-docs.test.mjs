import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const docsDir = join(repoRoot, "app", "docs");
const skillsDir = join(docsDir, "skills");

const forbidden = [
  /CONTEXT\.md/,
  /docs\/adr/,
  /docs\/superpowers/,
  /Repo-Root/i,
  /Projektroot/i,
];

function readMarkdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return readMarkdownFiles(full);
    if (!entry.name.endsWith(".md")) return [];
    return [full];
  });
}

test("app agent docs do not depend on root-only development documentation", () => {
  const files = [
    join(docsDir, "agent-context.md"),
    ...readMarkdownFiles(skillsDir),
  ];

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(text, pattern, `${file} contains forbidden reference ${pattern}`);
    }
  }
});

test("every app skill points to the app agent context", () => {
  for (const file of readMarkdownFiles(skillsDir)) {
    const text = readFileSync(file, "utf8");
    assert.match(text, /docs\/agent-context\.md/, `${file} must reference docs/agent-context.md`);
  }
});

// Einmal-Migrationen haben zwar eine CLI, sollen aber von einem Agenten gerade
// NICHT von sich aus aufgerufen werden — sie stehen darum bewusst nicht im
// Betriebskontext.
const nichtFuerAgenten = new Set(["migrate-ids-uuid.mjs"]);

test("every tool with a CLI entry point is listed in the agent context", () => {
  // Wer eine CLI hat, ist agentenbedienbar — dann muss der Agent das Tool auch
  // finden koennen, ohne app/tools/ zu durchsuchen. Ohne diesen Guard rottet
  // die Tool-Liste beim naechsten neuen Tool still.
  const toolsDir = join(repoRoot, "app", "tools");
  const context = readFileSync(join(docsDir, "agent-context.md"), "utf8");

  const cliTools = readdirSync(toolsDir)
    .filter((name) => name.endsWith(".mjs"))
    .filter((name) => readFileSync(join(toolsDir, name), "utf8").includes("process.argv[1] === fileURLToPath"))
    .filter((name) => !nichtFuerAgenten.has(name));

  assert.ok(cliTools.length > 0, "Testvoraussetzung: es gibt ueberhaupt CLI-Tools");
  for (const tool of cliTools) {
    assert.match(context, new RegExp(tool.replaceAll(".", "\\.")), `tools/${tool} hat eine CLI, steht aber nicht in docs/agent-context.md`);
  }
});

test("agent context requires an explicit data mode and data root before writes", () => {
  const text = readFileSync(join(docsDir, "agent-context.md"), "utf8");

  assert.match(text, /DATENMODUS/);
  assert.match(text, /DATENROOT/);
  assert.match(text, /data\/master/);
  assert.match(text, /data\/demo/);
  assert.match(text, /Abbruch/);
});

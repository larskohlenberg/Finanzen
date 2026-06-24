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

test("agent context requires an explicit data mode and data root before writes", () => {
  const text = readFileSync(join(docsDir, "agent-context.md"), "utf8");

  assert.match(text, /DATENMODUS/);
  assert.match(text, /DATENROOT/);
  assert.match(text, /data\/master/);
  assert.match(text, /data\/demo/);
  assert.match(text, /Abbruch/);
});

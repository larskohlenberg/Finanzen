// Schreibende CLIs melden nur NEUE Validatorfehler als fehlgeschlagenen Lauf
// (Exitcode 1), wie mitRollback im MCP. Ein schon vorher vorhandener Fehler im
// Bestand ist ein Hinweis, kein Abbruch.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("../app/", import.meta.url));
const OFFEN = "TXN-00000000-0000-4000-8000-0000000002a2";

// Demobestand mit einem alten Fehler, der keinen der Laeufe beruehrt.
function bestandMitAltfehler() {
  const wurzel = mkdtempSync(join(tmpdir(), "cli-exit-"));
  const root = join(wurzel, "bestand");
  cpSync(join(app, "data", "demo"), root, { recursive: true });
  const konten = JSON.parse(readFileSync(join(root, "konten.json"), "utf8"));
  konten.at(-1).kontotyp = "quatsch";
  writeFileSync(join(root, "konten.json"), JSON.stringify(konten, null, 2));
  return { root, aufraeumen: () => rmSync(wurzel, { recursive: true, force: true }) };
}

const LAEUFE = [
  ["transfer-matcher.mjs", []],
  ["regelzahlung-matcher.mjs", []],
  ["freigabe.mjs", []],
  ["agent-vorschlag.mjs", [`--ids=${OFFEN}`, "--kategorie=KAT-012"]],
  ["confirm.mjs", ["--aktion=bestaetigen", `--ids=${OFFEN}`]],
  ["transaktion-immobilie.mjs", [`--ids=${OFFEN}`, "--immobilie=IMM-001"]],
];

for (const [skript, extra] of LAEUFE) {
  test(`${skript}: alter Validatorfehler ergibt Exitcode 0 mit Hinweis`, () => {
    const b = bestandMitAltfehler();
    try {
      const r = spawnSync(process.execPath, [join(app, "tools", skript), ...extra, b.root, "--schreiben"], { encoding: "utf8" });
      assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stderr, /schon vorher/);
    } finally {
      b.aufraeumen();
    }
  });
}

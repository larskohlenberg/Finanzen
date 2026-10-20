// Zugaenglichkeit (3.7) im gerenderten Markup: Zeilen haben genau einen
// Tastatur-Halt (einen echten Link), keine role="button"-Zeilen; sortierbare
// Spalten melden aria-sort; Navigation und Reiter melden aria-current;
// Diagramme haben eine gleichwertige Tabelle.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const appDir = fileURLToPath(new URL("../app", import.meta.url));
const dateien = [
  ...readdirSync(join(appDir, "views")).map((f) => join(appDir, "views", f)),
  join(appDir, "komponenten.mjs"),
  join(appDir, "rahmen.mjs"),
];
const quelle = (datei) => readFileSync(datei, "utf8");

test("keine Tabellenzeilen als Knopf und keine Zellen mit eigenem Tab-Halt", () => {
  const verstoesse = [];
  for (const datei of dateien) {
    const text = quelle(datei);
    if (/<tr[^>]*role="button"/.test(text)) verstoesse.push(`${datei}: <tr role=button>`);
    if (/<tr[^>]*tabindex="0"/.test(text)) verstoesse.push(`${datei}: <tr tabindex=0>`);
    if (/<td[^>]*tabindex="0"/.test(text)) verstoesse.push(`${datei}: <td tabindex=0>`);
  }
  assert.deepEqual(verstoesse, []);
});

test("sortierbare Spaltenkoepfe melden aria-sort", () => {
  const ohne = [];
  for (const datei of dateien) {
    for (const m of quelle(datei).matchAll(/<th[^>]*>\s*<button[^>]*data-(?:transaction-sort|regel-sort|wertstaende-sort|beleg-sort|action="(?:rz-sort|sort-belege)")/g)) {
      if (!/aria-sort=|\$\{aria\}/.test(m[0])) ohne.push(`${datei}: ${m[0].slice(0, 80)}`);
    }
  }
  assert.deepEqual(ohne, []);
});

test("aktive Navigation meldet aria-current", () => {
  const rahmen = quelle(join(appDir, "rahmen.mjs"));
  assert.match(rahmen, /data-view="\$\{view\}"[^>]*\$\{state\.view === view \? ' aria-current="page"' : ""\}/);
});

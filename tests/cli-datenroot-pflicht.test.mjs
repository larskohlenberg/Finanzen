// Schreibgrenzen der Kommandozeile (Review 0A.9, CLI-Teil): Der Datenbestand
// ist immer ausdruecklich benannt (kein stiller Default data/master), und
// geschrieben wird nur mit --schreiben, sonst ist der Lauf eine Vorschau.
// recategorize.mjs hat Vorschau und --schreiben schon seit den MCP-Schreibgrenzen.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { legeAbzugAn } from "./mcp-hilfe.mjs";

function cli(abzug, skript, ...args) {
  const r = spawnSync(process.execPath, [join(realpathSync(abzug.app), "tools", skript), ...args], { cwd: abzug.wurzel, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function stand(ordner) {
  return Object.fromEntries(readdirSync(ordner).sort().map((n) => [n, readFileSync(join(ordner, n), "utf8")]));
}

const OHNE_DEFAULT = [
  ["import.mjs", (datei) => [datei]],
  ["recategorize.mjs", () => []],
  ["confirm.mjs", () => ["--aktion=bestaetigen", "--gegenpartei=Niemand"]],
  ["transfer-matcher.mjs", () => []],
  ["agent-vorschlag.mjs", () => ["--ids=TXN-1", "--kategorie=KAT-001"]],
  ["regel-vorschlag.mjs", () => []],
  ["regel-probelauf.mjs", () => []],
  ["regelzahlung-matcher.mjs", () => []],
  ["inbox.mjs", () => []],
];

test("ohne Datenbestand bricht jede CLI ab, statt data/master anzunehmen", () => {
  const abzug = legeAbzugAn();
  try {
    const datei = join(abzug.wurzel, "lauf.jsonl");
    writeFileSync(datei, "");
    const vorher = stand(abzug.master);
    for (const [skript, args] of OHNE_DEFAULT) {
      const r = cli(abzug, skript, ...args(datei));
      assert.notEqual(r.status, 0, `${skript}: ${r.stdout}`);
      assert.match(r.stderr, /Datenbestand|Datenroot/, `${skript}: ${r.stderr}`);
    }
    assert.deepEqual(stand(abzug.master), vorher);
  } finally {
    abzug.aufraeumen();
  }
});

test("import.mjs: ohne --schreiben eine Vorschau, mit --schreiben geschrieben und geprueft", () => {
  const abzug = legeAbzugAn();
  try {
    const konto = JSON.parse(readFileSync(join(abzug.master, "konten.json"), "utf8"))[0].konto_id;
    const datei = join(abzug.wurzel, "lauf.jsonl");
    writeFileSync(datei, `${JSON.stringify({ konto_id: konto, buchungsdatum: "2026-09-30", betrag: "-7.77", gegenpartei: "Testladen Vorschau", verwendungszweck: "CLI-Test", rohquelle: "data/inbox/lauf.jsonl" })}\n`);
    const vorher = stand(abzug.master);

    const vorschau = cli(abzug, "import.mjs", datei, abzug.master);
    assert.equal(vorschau.status, 0, vorschau.stderr);
    assert.match(vorschau.stdout, /Vorschau/);
    assert.match(vorschau.stdout, /"written"/);
    assert.deepEqual(stand(abzug.master), vorher, "Vorschau schreibt nichts");

    const schreiben = cli(abzug, "import.mjs", datei, abzug.master, "--schreiben");
    assert.equal(schreiben.status, 0, schreiben.stderr);
    assert.match(readFileSync(join(abzug.master, "transaktionen.jsonl"), "utf8"), /Testladen Vorschau/);
  } finally {
    abzug.aufraeumen();
  }
});

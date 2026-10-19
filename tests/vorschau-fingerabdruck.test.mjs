// Vorschau-Fingerabdruck (Review 0B.2): Die Vorschau nennt den Stand, den sie
// gelesen hat. Ein Schreibaufruf mit diesem Fingerabdruck wird abgewiesen, wenn
// sich der Bestand inzwischen geaendert hat. Ohne Fingerabdruck wie bisher.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { bestandFingerabdruck } from "../app/tools/lib/fingerabdruck.mjs";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";

const app = fileURLToPath(new URL("../app/", import.meta.url));
const OFFEN = "TXN-00000000-0000-4000-8000-0000000002a2";

function demoKopie() {
  const wurzel = mkdtempSync(join(tmpdir(), "fingerabdruck-"));
  const root = join(wurzel, "bestand");
  cpSync(join(app, "data", "demo"), root, { recursive: true });
  return { root, aufraeumen: () => rmSync(wurzel, { recursive: true, force: true }) };
}

const fingerabdruckAus = (text) => text.match(/Fingerabdruck: ([0-9a-f]{16})/)?.[1];

test("Fingerabdruck: stabil, aendert sich mit dem Inhalt, ignoriert Sperr- und Punktdateien", async () => {
  const b = demoKopie();
  try {
    const a = await bestandFingerabdruck(b.root);
    assert.match(a, /^[0-9a-f]{16}$/);
    assert.equal(await bestandFingerabdruck(b.root), a);
    writeFileSync(join(b.root, ".schreibsperre"), "{}");
    writeFileSync(join(b.root, ".notiz"), "x");
    assert.equal(await bestandFingerabdruck(b.root), a);
    appendFileSync(join(b.root, "agent_log.jsonl"), "{\"anlass\":\"test\"}\n");
    assert.notEqual(await bestandFingerabdruck(b.root), a);
  } finally {
    b.aufraeumen();
  }
});

test("CLI: Vorschau nennt den Fingerabdruck; veralteter Fingerabdruck wird mit Exitcode 4 abgewiesen", () => {
  const b = demoKopie();
  const lauf = (...extra) => spawnSync(process.execPath, [join(app, "tools", "agent-vorschlag.mjs"), `--ids=${OFFEN}`, "--kategorie=KAT-012", b.root, ...extra], { encoding: "utf8" });
  try {
    const vorschau = lauf();
    assert.equal(vorschau.status, 0, vorschau.stderr);
    const fp = fingerabdruckAus(vorschau.stderr);
    assert.ok(fp, vorschau.stderr);

    appendFileSync(join(b.root, "agent_log.jsonl"), "{\"anlass\":\"dazwischen\"}\n");
    const vorher = readFileSync(join(b.root, "transaktionen.jsonl"), "utf8");
    const veraltet = lauf("--schreiben", `--fingerabdruck=${fp}`);
    assert.equal(veraltet.status, 4, veraltet.stdout + veraltet.stderr);
    assert.match(veraltet.stderr, /geaendert/);
    assert.equal(readFileSync(join(b.root, "transaktionen.jsonl"), "utf8"), vorher, "nichts geschrieben");

    const frisch = fingerabdruckAus(lauf().stderr);
    const ok = lauf("--schreiben", `--fingerabdruck=${frisch}`);
    assert.equal(ok.status, 0, ok.stderr);
    assert.notEqual(readFileSync(join(b.root, "transaktionen.jsonl"), "utf8"), vorher);

    // Ohne Fingerabdruck wie bisher.
    assert.equal(lauf("--schreiben").status, 0);
  } finally {
    b.aufraeumen();
  }
});

test("MCP: Vorschau nennt den Fingerabdruck; Schreiben gegen einen veralteten Stand wird abgewiesen", async () => {
  const abzug = legeAbzugAn();
  const s = starteServer(abzug, "schreiben");
  try {
    const args = { ids: [OFFEN], kategorie: "KAT-012" };
    const vorschau = await s.werkzeug("agent_vorschlag", args);
    assert.ok(!vorschau.isError, vorschau.text);
    const fp = fingerabdruckAus(vorschau.text);
    assert.ok(fp, vorschau.text);

    appendFileSync(join(abzug.master, "agent_log.jsonl"), "{\"anlass\":\"dazwischen\"}\n");
    const vorher = readFileSync(join(abzug.master, "transaktionen.jsonl"), "utf8");
    const veraltet = await s.werkzeug("agent_vorschlag", { ...args, schreiben: true, fingerabdruck: fp });
    assert.equal(veraltet.isError, true, veraltet.text);
    assert.match(veraltet.text, /geaendert/);
    assert.equal(readFileSync(join(abzug.master, "transaktionen.jsonl"), "utf8"), vorher);

    const frisch = fingerabdruckAus((await s.werkzeug("agent_vorschlag", args)).text);
    const ok = await s.werkzeug("agent_vorschlag", { ...args, schreiben: true, fingerabdruck: frisch });
    assert.ok(!ok.isError, ok.text);
    assert.notEqual(readFileSync(join(abzug.master, "transaktionen.jsonl"), "utf8"), vorher);

    // Dateiwerkzeug ohne CLI: derselbe Schutz.
    const dv = await s.werkzeug("datei_schreiben", { pfad: "data/inbox/notiz.txt", inhalt: "x" });
    const dfp = fingerabdruckAus(dv.text);
    assert.ok(dfp, dv.text);
    appendFileSync(join(abzug.master, "agent_log.jsonl"), "{\"anlass\":\"dazwischen2\"}\n");
    const dw = await s.werkzeug("datei_schreiben", { pfad: "data/inbox/notiz.txt", inhalt: "x", schreiben: true, fingerabdruck: dfp });
    assert.equal(dw.isError, true, dw.text);
  } finally {
    await s.beenden();
    abzug.aufraeumen();
  }
});

// Schreibsperre je Bestand (Review 0B.2): zwei echte Prozesse, die zweite
// Sitzung bekommt eine klare Abweisung; verwaiste Sperren werden uebernommen;
// das Zuruecksetzen ersetzt Dateien einzeln statt den Bestand zu leeren.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { mitRollback } from "../app/mcp/schreiben.mjs";

const demo = fileURLToPath(new URL("../app/data/demo/", import.meta.url));
const halterSkript = fileURLToPath(new URL("./hilfe-sperre-halter.mjs", import.meta.url));
const freigabe = fileURLToPath(new URL("../app/tools/freigabe.mjs", import.meta.url));

function bestand() {
  const wurzel = realpathSync(mkdtempSync(join(tmpdir(), "finanzen-sperre-")));
  const root = join(wurzel, "bestand");
  cpSync(demo, root, { recursive: true });
  return { root, weg: () => rmSync(wurzel, { recursive: true, force: true }) };
}

function starteHalter(root) {
  const kind = spawn(process.execPath, [halterSkript, root], { stdio: ["pipe", "pipe", "inherit"] });
  let aus = "";
  const gesperrt = new Promise((resolve, reject) => {
    kind.stdout.on("data", (d) => { aus += d; if (aus.includes("gesperrt")) resolve(); });
    kind.on("exit", () => reject(new Error(`Halter beendet: ${aus}`)));
  });
  const ende = new Promise((resolve) => kind.on("close", (code) => resolve({ code, aus })));
  return { gesperrt, beenden: () => { kind.stdin.end(); return ende; }, abbrechen: () => kind.kill() };
}

test("zweiter Prozess wird abgewiesen, solange der erste schreibt; danach geht es", async () => {
  const b = bestand();
  const halter = starteHalter(b.root);
  try {
    await halter.gesperrt;

    const cli = spawnSync(process.execPath, [freigabe, b.root, "--schreiben"], { encoding: "utf8" });
    assert.notEqual(cli.status, 0, cli.stdout);
    assert.match(cli.stderr, /gesperrt/);

    const mcp = await mitRollback(b.root, async () => {
      writeFileSync(join(b.root, "zweiter.txt"), "darf nicht");
      return { text: "zweiter" };
    });
    assert.equal(mcp.isError, true);
    assert.match(mcp.text, /gesperrt/);
    assert.ok(!existsSync(join(b.root, "zweiter.txt")));

    const ende = await halter.beenden();
    assert.match(ende.aus, /ok/);
    assert.equal(readFileSync(join(b.root, "halter.txt"), "utf8"), "vom Halter");

    const danach = spawnSync(process.execPath, [freigabe, b.root, "--schreiben"], { encoding: "utf8" });
    assert.equal(danach.status, 0, danach.stderr);
    assert.ok(!readdirSync(b.root).some((n) => n.startsWith(".schreibsperre")), "Sperre bleibt nicht liegen");
  } finally {
    halter.abbrechen();
    b.weg();
  }
});

test("verwaiste Sperre (Prozess tot oder zu alt) wird uebernommen", async () => {
  const b = bestand();
  try {
    const tot = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
    for (const halter of [
      { pid: Number(tot.stdout), rechner: hostname(), zeit: new Date().toISOString(), wer: "tot", kennung: "a" },
      { pid: 1, rechner: "anderer-rechner", zeit: "2020-01-01T00:00:00.000Z", wer: "alt", kennung: "b" },
    ]) {
      writeFileSync(join(b.root, ".schreibsperre"), JSON.stringify(halter));
      const r = await mitRollback(b.root, async () => ({ text: "geschrieben" }));
      assert.ok(!r.isError, `${halter.wer}: ${r.text}`);
      assert.ok(!existsSync(join(b.root, ".schreibsperre")));
    }
  } finally {
    b.weg();
  }
});

test("Zuruecksetzen ersetzt Dateien einzeln: Unveraendertes bleibt dieselbe Datei", async () => {
  const b = bestand();
  try {
    const kontenVorher = readFileSync(join(b.root, "konten.json"), "utf8");
    const inodeKategorien = statSync(join(b.root, "kategorien.json")).ino;
    const r = await mitRollback(b.root, async () => {
      writeFileSync(join(b.root, "konten.json"), "{ kaputt");
      writeFileSync(join(b.root, "neu.json"), "{}");
      return { text: "kaputt geschrieben" };
    });
    assert.equal(r.isError, true);
    assert.equal(readFileSync(join(b.root, "konten.json"), "utf8"), kontenVorher);
    assert.ok(!existsSync(join(b.root, "neu.json")));
    assert.equal(statSync(join(b.root, "kategorien.json")).ino, inodeKategorien, "unveraenderte Datei wurde neu angelegt");
    assert.ok(!readdirSync(b.root).some((n) => n.startsWith(".")), readdirSync(b.root).join(", "));
  } finally {
    b.weg();
  }
});

test("lebender Halter auf diesem Rechner behaelt die Sperre, auch wenn sie alt ist", async () => {
  const b = bestand();
  try {
    writeFileSync(join(b.root, ".schreibsperre"), JSON.stringify({ pid: process.pid, rechner: hostname(), zeit: "2020-01-01T00:00:00.000Z", wer: "lang", kennung: "c" }));
    const r = await mitRollback(b.root, async () => ({ text: "darf nicht" }));
    assert.equal(r.isError, true);
    assert.match(r.text, /gesperrt/);
  } finally {
    b.weg();
  }
});

test("nicht loeschbare verwaiste Sperre: Abweisung statt Endlosschleife", { skip: process.getuid?.() === 0 && "als root greift chmod nicht" }, async () => {
  const b = bestand();
  const tot = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  writeFileSync(join(b.root, ".schreibsperre"), JSON.stringify({ pid: Number(tot.stdout), rechner: hostname(), zeit: new Date().toISOString(), wer: "tot", kennung: "d" }));
  // Ein schreibgeschuetzter Ordner: die Sperre laesst sich nicht loeschen.
  chmodSync(b.root, 0o555);
  try {
    const start = Date.now();
    const r = await mitRollback(b.root, async () => ({ text: "darf nicht" }));
    assert.equal(r.isError, true, r.text);
    assert.ok(Date.now() - start < 10000);
  } finally {
    chmodSync(b.root, 0o755);
    b.weg();
  }
});

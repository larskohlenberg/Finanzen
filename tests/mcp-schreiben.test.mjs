// Schreibpfad ueber Entwuerfe (ADR 0035): mitRollback und die schreibenden
// CLIs auf einem Bestand mit Generationen, angesprochen wie spaeter data/master
// ueber einen Symlink auf <basis>/aktuell, und im Rueckfallmodus.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { erwarteterStand, mitRollback } from "../app/mcp/schreiben.mjs";
import { bestandFingerabdruck } from "../app/tools/lib/fingerabdruck.mjs";
import { aktuelleId, einrichten, findeBasis, pruefeGeneration, veroeffentlichteIds } from "../app/tools/lib/generationen.mjs";

const demo = fileURLToPath(new URL("../app/data/demo/", import.meta.url));
const agentVorschlag = fileURLToPath(new URL("../app/tools/agent-vorschlag.mjs", import.meta.url));

// <wurzel>/master.gen = Basis, <wurzel>/master -> master.gen/aktuell.
async function generationenBestand() {
  const wurzel = mkdtempSync(join(tmpdir(), "finanzen-gen-schreiben-"));
  const basis = join(wurzel, "master.gen");
  await einrichten(basis, demo);
  const master = join(wurzel, "master");
  symlinkSync(join("master.gen", "aktuell"), master);
  return { wurzel, basis, master, weg: () => rmSync(wurzel, { recursive: true, force: true }) };
}

async function heil(basis) {
  const fehler = [];
  for (const id of await veroeffentlichteIds(basis)) fehler.push(...(await pruefeGeneration(basis, id)));
  return fehler;
}

test("findeBasis: Basis, Generation ueber Symlink und einfacher Ordner", async () => {
  const b = await generationenBestand();
  try {
    assert.equal(await findeBasis(b.basis), b.basis);
    assert.equal(await findeBasis(b.master), realpathSync(b.basis));
    assert.equal(await findeBasis(demo), resolve(demo));
    assert.equal(await bestandFingerabdruck(b.master), "G000001");
    assert.match(await bestandFingerabdruck(demo), /^[0-9a-f]{16}$/);
  } finally {
    b.weg();
  }
});

test("mitRollback mit Generationen: Schreiben im Entwurf wird neue Generation, Fehler veroeffentlichen nichts", async () => {
  const b = await generationenBestand();
  try {
    const ok = await mitRollback(b.master, async (s) => {
      assert.equal(s.pfad(join(b.master, "farben.json")), join(s.ordner, "farben.json"));
      // ersetzeDatei-Weg: neue Datei + rename ueber den schreibgeschuetzten Hardlink.
      const { ersetzeDatei } = await import("../app/tools/lib/datei.mjs");
      await ersetzeDatei(s.pfad(join(b.master, "farben.json")), "{}\n");
      return { text: "geschrieben" };
    });
    assert.ok(!ok.isError, ok.text);
    assert.match(ok.text, /Neuer Stand: G000002/);
    assert.equal(readFileSync(join(b.master, "farben.json"), "utf8"), "{}\n");
    assert.notEqual(readFileSync(join(b.basis, "generationen", "000001", "farben.json"), "utf8"), "{}\n");

    const kaputt = await mitRollback(b.master, async (s) => {
      writeFileSync(join(s.ordner, "neu.json"), "{}");
      const { ersetzeDatei } = await import("../app/tools/lib/datei.mjs");
      await ersetzeDatei(join(s.ordner, "konten.json"), "{ kaputt");
      return { text: "kaputt" };
    });
    assert.equal(kaputt.isError, true);
    assert.match(kaputt.text, /nichts uebernommen/);
    const fehler = await mitRollback(b.master, async (s) => {
      writeFileSync(join(s.ordner, "neu.json"), "{}");
      return { text: "Werkzeug gescheitert", isError: true };
    });
    assert.match(fehler.text, /kein Commit/);
    assert.equal(await aktuelleId(b.basis), "000002");
    assert.ok(!existsSync(join(b.master, "neu.json")));
    assert.deepEqual(await heil(b.basis), []);
    assert.deepEqual(readdirSync(join(b.basis, "generationen")).filter((n) => n.startsWith(".")), []);
  } finally {
    b.weg();
  }
});

test("mitRollback mit Generationen: Fingerabdruck ist die Generations-Id", async () => {
  const b = await generationenBestand();
  try {
    const schreibe = (inhalt, fingerabdruck) => erwarteterStand.run(fingerabdruck, () => mitRollback(b.master, async (s) => {
      const { ersetzeDatei } = await import("../app/tools/lib/datei.mjs");
      await ersetzeDatei(join(s.ordner, "farben.json"), inhalt);
      return { text: "ok" };
    }));
    assert.ok(!(await schreibe("{\"a\":1}\n", "G000001")).isError);
    const veraltet = await schreibe("{\"a\":2}\n", "G000001");
    assert.equal(veraltet.isError, true);
    assert.match(veraltet.text, /G000001, jetzt G000002/);
    assert.ok(!(await schreibe("{\"a\":2}\n", "G000002")).isError);
  } finally {
    b.weg();
  }
});

test("CLI-Schreiblauf mit Generationen: Neustart im Entwurf, neue Generation, Vorschau nennt die Id", async () => {
  const b = await generationenBestand();
  try {
    const tx = readFileSync(join(b.master, "transaktionen.jsonl"), "utf8").split("\n").filter(Boolean).map((z) => JSON.parse(z));
    const offen = tx.find((t) => t.kategorisierung_status === "offen") ?? tx[0];
    const args = (zusatz) => [agentVorschlag, `--ids=${offen.transaktion_id}`, "--kategorie=KAT-001", b.master, ...zusatz];
    const vorschau = spawnSync(process.execPath, args([]), { encoding: "utf8" });
    assert.match(vorschau.stderr, /Fingerabdruck: G000001/);
    const veraltet = spawnSync(process.execPath, args(["--schreiben", "--fingerabdruck=G000009"]), { encoding: "utf8" });
    assert.equal(veraltet.status, 4, veraltet.stderr);
    const lauf = spawnSync(process.execPath, args(["--schreiben", "--fingerabdruck=G000001"]), { encoding: "utf8" });
    assert.equal(lauf.status, 0, lauf.stderr);
    assert.match(lauf.stderr, /Neuer Stand: G000002/);
    assert.equal(await aktuelleId(b.basis), "000002");
    assert.equal((statSync(join(b.master, "transaktionen.jsonl")).mode & 0o222), 0);
    assert.deepEqual(await heil(b.basis), []);
    assert.ok(!existsSync(join(b.basis, ".schreibsperre")));
  } finally {
    b.weg();
  }
});

test("CLI-Schreiblauf im einfachen Ordner: ohne Aenderung bleibt der Bestand gleich, alte Temp-Reste werden aufgeraeumt", () => {
  const wurzel = mkdtempSync(join(tmpdir(), "finanzen-ordner-schreiben-"));
  const master = join(wurzel, "bestand");
  cpSync(demo, master, { recursive: true });
  const rest = join(master, ".transaktionen.jsonl.4242-abcdef01.tmp");
  const sicherung = join(master, ".transaktion-immobilie-4242-x-transaktionen-backup.tmp");
  writeFileSync(rest, "halb");
  writeFileSync(sicherung, "sicherung");
  const vorher = readFileSync(join(master, "transaktionen.jsonl"), "utf8");
  try {
    const unbekannt = spawnSync(process.execPath, [agentVorschlag, "--ids=TXN-GIBT-ES-NICHT", "--kategorie=KAT-001", master, "--schreiben"], { encoding: "utf8" });
    assert.ok([0, 1, 2].includes(unbekannt.status), unbekannt.stderr);
    assert.equal(readFileSync(join(master, "transaktionen.jsonl"), "utf8"), vorher);
    assert.ok(!existsSync(rest), "Temp-Rest bleibt liegen");
    assert.ok(existsSync(sicherung), "Sicherung darf nicht verschwinden");
    assert.deepEqual(readdirSync(master).filter((n) => n.startsWith(".") && n !== ".transaktion-immobilie-4242-x-transaktionen-backup.tmp"), []);
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});

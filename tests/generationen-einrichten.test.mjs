// Umstellung eines einfachen Ordners auf Generationen (E1 Schritt 5): Vorschau,
// Umstellung mit Sicherung und Byte-Vergleich, Schreiben danach, Rueckweg.
import assert from "node:assert/strict";
import { execSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { aktuelleId, pruefeGeneration } from "../app/tools/lib/generationen.mjs";

const demo = fileURLToPath(new URL("../app/data/demo/", import.meta.url));
const werkzeug = fileURLToPath(new URL("../app/tools/generationen-einrichten.mjs", import.meta.url));
const agentVorschlag = fileURLToPath(new URL("../app/tools/agent-vorschlag.mjs", import.meta.url));

function bestand() {
  const wurzel = realpathSync(mkdtempSync(join(tmpdir(), "finanzen-umstellung-")));
  const daten = join(wurzel, "data");
  mkdirSync(daten);
  const master = join(daten, "master");
  cpSync(demo, master, { recursive: true });
  return { daten, master, weg: () => rmSync(wurzel, { recursive: true, force: true }) };
}

const lauf = (args) => spawnSync(process.execPath, [werkzeug, ...args], { encoding: "utf8" });
const inhalt = (ordner) => Object.fromEntries(readdirSync(ordner, { recursive: true }).filter((n) => !n.startsWith(".") && n !== "MANIFEST.json" && statSync(join(ordner, n)).isFile()).sort().map((n) => [n, readFileSync(join(ordner, n), "utf8")]));

test("Umstellung: Vorschau aendert nichts; danach Symlink, Sicherung byte-gleich, Schreiben erzeugt Generationen, Rueckweg", async () => {
  const b = bestand();
  try {
    const original = inhalt(b.master);
    const vorschau = lauf([b.master]);
    assert.equal(vorschau.status, 0, vorschau.stderr);
    assert.match(vorschau.stdout, /Vorschau/);
    assert.ok(!existsSync(`${b.master}.gen`));

    const r = lauf([b.master, "--schreiben"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Umgestellt: Fingerabdruck G000001/);
    assert.ok(lstatSync(b.master).isSymbolicLink());
    const sicherung = readdirSync(b.daten).find((n) => n.startsWith("master.ordner-"));
    assert.deepEqual(inhalt(join(b.daten, sicherung)), original);
    assert.ok(!readdirSync(join(b.daten, sicherung)).some((n) => n.startsWith(".")), "Sperrdatei in der Sicherung");
    assert.deepEqual(inhalt(b.master), original);
    assert.deepEqual(await pruefeGeneration(`${b.master}.gen`, "000001"), []);
    assert.equal(lauf([b.master, "--schreiben"]).status, 1, "zweite Umstellung muss abgewiesen werden");

    // Schreiben ueber den alten Pfad: neue Generation, Sperre im Basisordner.
    const tx = readFileSync(join(b.master, "transaktionen.jsonl"), "utf8").split("\n").filter(Boolean).map((z) => JSON.parse(z)).filter((t) => t.kategorisierung_status === "offen");
    const w = spawnSync(process.execPath, [agentVorschlag, `--ids=${tx[0].transaktion_id}`, "--kategorie=KAT-001", b.master, "--schreiben"], { encoding: "utf8" });
    assert.equal(w.status, 0, w.stderr);
    assert.equal(await aktuelleId(`${b.master}.gen`), "000002");
    const nachSchreiben = inhalt(b.master);

    // Rueckweg wie im Werkzeug beschrieben.
    const befehl = r.stdout.split("\n").find((z) => z.trim().startsWith("cp -RL")).trim();
    execSync(befehl, { cwd: b.daten });
    assert.ok(lstatSync(b.master).isDirectory());
    assert.deepEqual(inhalt(b.master), nachSchreiben);
    assert.ok(!existsSync(join(b.master, "MANIFEST.json")));
    const w2 = spawnSync(process.execPath, [agentVorschlag, `--ids=${tx[1].transaktion_id}`, "--kategorie=KAT-001", b.master, "--schreiben"], { encoding: "utf8" });
    assert.equal(w2.status, 0, w2.stderr);
  } finally {
    b.weg();
  }
});

test("Umstellung verweigert: vorhandenes .gen, schon umgestellt", () => {
  const b = bestand();
  try {
    mkdirSync(`${b.master}.gen`);
    const r = lauf([b.master, "--schreiben"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /existiert schon/);
    assert.ok(lstatSync(b.master).isDirectory());
  } finally {
    b.weg();
  }
});

// Umstellung eines einfachen Ordners auf Generationen (E1 Schritt 5): Vorschau,
// Umstellung mit Sicherung und Byte-Vergleich, Schreiben danach, Rueckweg.
import assert from "node:assert/strict";
import { execSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { lesetestOhneLease } from "../app/tools/generationen-einrichten.mjs";
import { aktuelleId, einrichten, generationsOrdner, pruefeGeneration } from "../app/tools/lib/generationen.mjs";

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
    assert.match(r.stdout, /Lesetest ohne Lease ok/);
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

// Der Webdienst darf im Bestand nichts schreiben (ProtectSystem=strict); der
// Lesetest bildet das nach und findet veraenderte Dateien.
test("Lesetest ohne Lease: klappt ohne Schreibrecht, meldet Abweichungen", { skip: process.getuid?.() === 0 && "root ignoriert Dateirechte" }, async () => {
  const b = bestand();
  const basis = `${b.master}.gen`;
  const gen = generationsOrdner(basis, "000001");
  try {
    await einrichten(basis, b.master);
    for (const o of [basis, join(basis, "generationen"), gen]) chmodSync(o, 0o555);
    assert.deepEqual(await lesetestOhneLease(basis), []);
    for (const o of [basis, join(basis, "generationen"), gen]) chmodSync(o, 0o755);
    chmodSync(join(gen, "farben.json"), 0o644);
    writeFileSync(join(gen, "farben.json"), "{}\n");
    assert.match((await lesetestOhneLease(basis)).join("\n"), /farben\.json weicht vom Manifest ab/);
  } finally {
    for (const o of [basis, join(basis, "generationen"), gen]) if (existsSync(o)) chmodSync(o, 0o755);
    b.weg();
  }
});

// Nach der Umstellung muss der Checkout sauber bleiben, sonst bricht das
// Update-Skript auf dem Server mit "lokale Aenderungen" ab: Symlink, .gen,
// Sicherung (samt .gitkeep/README.md) und Rueckweg-Zwischenstand sind ignoriert.
test("Umstellung laesst git status leer (gitignore deckt Generationen und Sicherung)", () => {
  const wurzel = realpathSync(mkdtempSync(join(tmpdir(), "finanzen-umstellung-git-")));
  const git = (...args) => execSync(`git ${args.join(" ")}`, { cwd: wurzel, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.org", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.org" } });
  try {
    git("init", "-q");
    copyFileSync(fileURLToPath(new URL("../.gitignore", import.meta.url)), join(wurzel, ".gitignore"));
    const daten = join(wurzel, "app", "data");
    mkdirSync(join(daten, "inbox"), { recursive: true });
    writeFileSync(join(daten, ".gitkeep"), "");
    writeFileSync(join(daten, "inbox", ".gitkeep"), "");
    git("add", "-A");
    git("commit", "-q", "-m", "start");
    const master = join(daten, "master");
    cpSync(demo, master, { recursive: true });
    writeFileSync(join(master, ".gitkeep"), "");
    writeFileSync(join(master, "README.md"), "Platzhalter\n");
    assert.equal(git("status", "--porcelain", "--untracked-files=all"), "", "Bestand als Ordner");
    const r = lauf([master, "--schreiben"]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(lstatSync(master).isSymbolicLink());
    assert.equal(git("status", "--porcelain", "--untracked-files=all"), "", "nach der Umstellung");
    // Rueckweg-Zwischenstand ebenfalls ignoriert.
    cpSync(join(`${master}.gen`, "generationen", "000001"), join(daten, "master.zurueck"), { recursive: true });
    assert.equal(git("status", "--porcelain", "--untracked-files=all"), "", "Rueckweg-Zwischenstand");
    // Gegenprobe: echte Ausnahmen bleiben sichtbar.
    writeFileSync(join(daten, "neu.txt"), "x");
    mkdirSync(join(daten, "exports"));
    writeFileSync(join(daten, "exports", ".gitkeep"), "");
    assert.equal(git("status", "--porcelain", "--untracked-files=all"), "?? app/data/exports/.gitkeep\n");
  } finally {
    rmSync(wurzel, { recursive: true, force: true });
  }
});

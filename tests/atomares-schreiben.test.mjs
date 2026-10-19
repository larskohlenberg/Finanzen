import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ersetzeDatei, haengeAn, legeDateiAn } from "../app/tools/lib/datei.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));

async function tempOrdner(t) {
  const ordner = await mkdtemp(path.join(tmpdir(), "finanzen-atomar-"));
  t.after(() => rm(ordner, { recursive: true, force: true }));
  return ordner;
}

async function alleMjs(relativ) {
  const out = [];
  for (const e of await readdir(path.join(REPO, relativ), { withFileTypes: true, recursive: true })) {
    if (e.isFile() && e.name.endsWith(".mjs")) out.push(path.relative(REPO, path.join(e.parentPath, e.name)));
  }
  return out.sort();
}

// Wer in den Bestand schreibt, nimmt lib/datei.mjs. Ausgenommen sind nur der
// Helfer selbst, die Sperrdatei (eigenes Exklusiv-Protokoll) und die
// Generationen-Bibliothek, die ihre Dateien selbst synchronisiert.
const AUSNAHMEN = new Set([
  "app/tools/lib/datei.mjs",
  "app/tools/lib/schreibsperre.mjs",
  "app/tools/lib/generationen.mjs",
]);
const DIREKT = /\b(writeFile|appendFile|writeFileSync|appendFileSync|createWriteStream)\b/;

test("kein direktes writeFile/appendFile in Werkzeugen und MCP", async () => {
  const dateien = [...await alleMjs("app/tools"), ...await alleMjs("app/mcp")];
  assert.ok(dateien.length > 20, "Werkzeuge gefunden");
  const treffer = [];
  for (const datei of dateien) {
    if (AUSNAHMEN.has(datei)) continue;
    const zeilen = (await readFile(path.join(REPO, datei), "utf8")).split("\n");
    zeilen.forEach((zeile, i) => {
      if (zeile.trim().startsWith("//")) return;
      if (DIREKT.test(zeile)) treffer.push(`${datei}:${i + 1}: ${zeile.trim()}`);
    });
  }
  assert.deepEqual(treffer, [], "ersetzeDatei/haengeAn/legeDateiAn aus app/tools/lib/datei.mjs nehmen");
});

test("ersetzeDatei: ersetzt, behaelt den Modus, neue Dateien 0640, keine Temp-Reste", async (t) => {
  const ordner = await tempOrdner(t);
  const neu = path.join(ordner, "neu.json");
  await ersetzeDatei(pathToFileURL(neu), "eins\n");
  assert.equal(await readFile(neu, "utf8"), "eins\n");
  assert.equal((await stat(neu)).mode & 0o777, 0o640);

  const alt = path.join(ordner, "alt.json");
  await writeFile(alt, "vorher");
  await chmod(alt, 0o600);
  await ersetzeDatei(alt, Buffer.from("nachher"));
  assert.equal(await readFile(alt, "utf8"), "nachher");
  assert.equal((await stat(alt)).mode & 0o777, 0o600);

  await ersetzeDatei(path.join(ordner, "unter", "tief.txt"), "x");
  assert.deepEqual((await readdir(ordner)).sort(), ["alt.json", "neu.json", "unter"]);
});

test("legeDateiAn: legt an, ueberschreibt nie", async (t) => {
  const ordner = await tempOrdner(t);
  const datei = path.join(ordner, "a.json");
  await legeDateiAn(datei, "erst");
  await assert.rejects(legeDateiAn(datei, "zweit"), { code: "EEXIST" });
  assert.equal(await readFile(datei, "utf8"), "erst");
  assert.deepEqual(await readdir(ordner), ["a.json"]);
});

test("haengeAn: haengt Zeilen an, ergaenzt fehlende Schlusszeile", async (t) => {
  const ordner = await tempOrdner(t);
  const log = path.join(ordner, "agent_log.jsonl");
  await haengeAn(log, '{"a":1}\n');
  await writeFile(log, '{"a":1}');
  await haengeAn(log, '{"b":2}\n');
  assert.equal(await readFile(log, "utf8"), '{"a":1}\n{"b":2}\n');
});

function warteAufBereit(kind) {
  return new Promise((fertig, fehler) => {
    let puffer = "";
    kind.stdout.on("data", (d) => { puffer += d; if (puffer.includes("bereit")) fertig(); });
    kind.on("exit", (code) => fehler(new Error(`Schreiber vorzeitig beendet (${code})`)));
  });
}

test("SIGKILL mitten im Schreiben hinterlaesst eine vollstaendige alte oder neue Datei", async (t) => {
  const ordner = await tempOrdner(t);
  const datei = path.join(ordner, "transaktionen.jsonl");
  const groesse = 4 * 1024 * 1024;
  const gueltig = new Set(["A", "B"].map((z) => z.repeat(groesse)));
  for (let runde = 0; runde < 6; runde += 1) {
    const kind = spawn(process.execPath, [path.join(REPO, "tests/hilfe-atomar-schreiber.mjs"), datei, String(groesse)], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    await warteAufBereit(kind);
    await new Promise((weiter) => setTimeout(weiter, 5 + runde * 13));
    const beendet = new Promise((fertig) => kind.once("exit", fertig));
    kind.kill("SIGKILL");
    await beendet;
    const inhalt = await readFile(datei, "utf8");
    assert.equal(inhalt.length, groesse, `Runde ${runde}: Datei vollstaendig`);
    assert.ok(gueltig.has(inhalt), `Runde ${runde}: alter oder neuer Inhalt`);
  }
  // Abgebrochene Laeufe lassen hoechstens versteckte Temp-Dateien liegen.
  for (const name of await readdir(ordner)) {
    assert.ok(name === "transaktionen.jsonl" || /^\.transaktionen\.jsonl\.\d+-[0-9a-f]{8}\.tmp$/.test(name), name);
  }
});

test("ersetzeDatei respektiert den Schreibschutz einer Datei", { skip: process.getuid?.() === 0 && "als root greift der Schreibschutz nicht" }, async (t) => {
  const ordner = await tempOrdner(t);
  const datei = path.join(ordner, "geschuetzt.json");
  await writeFile(datei, "bleibt");
  await chmod(datei, 0o444);
  await assert.rejects(ersetzeDatei(datei, "neu"), { code: "EACCES" });
  assert.equal(await readFile(datei, "utf8"), "bleibt");
  assert.deepEqual(await readdir(ordner), ["geschuetzt.json"]);
});

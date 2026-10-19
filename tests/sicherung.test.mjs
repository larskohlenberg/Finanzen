// Vollstaendige Sicherung (Review D.1): Der Export "komplett" enthaelt Bestand
// (genau eine Generation), Belege, Inbox samt Originalquellen und Importprofile
// plus SICHERUNG.json; tools/sicherung-pruefen.mjs prueft eine Sicherung und
// packt sie als Datenort aus (Restore-Probe). Nur Demodaten und erfundene Dateien.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createAppServer } from "../app/server.mjs";
import { einrichten } from "../app/tools/lib/generationen.mjs";

const lauf = promisify(execFile);
const demo = fileURLToPath(new URL("../app/data/demo/", import.meta.url));
const pruefer = fileURLToPath(new URL("../app/tools/sicherung-pruefen.mjs", import.meta.url));
const validator = fileURLToPath(new URL("../app/tools/validator.mjs", import.meta.url));

let wurzel, appDir, orte;

before(async () => {
  wurzel = await mkdtemp(join(tmpdir(), "sicherung-"));
  appDir = join(wurzel, "app");
  orte = {
    inbox: join(appDir, "data", "inbox"),
    profile: join(appDir, "data", "import-profile"),
    belege: join(appDir, "Belege"),
    master: join(appDir, "data", "master"),
  };
  await mkdir(join(orte.inbox, "processed"), { recursive: true });
  await mkdir(orte.profile, { recursive: true });
  await mkdir(join(orte.belege, "Konten", "KTO-001_Giro", "2026"), { recursive: true });
  await writeFile(join(appDir, "index.html"), "<!doctype html>");
  await writeFile(join(appDir, "version.json"), JSON.stringify({ commit: "a".repeat(40), kurz: "aaaaaaa" }));
  await writeFile(join(orte.inbox, "wartet.pdf"), "%PDF-wartet");
  await writeFile(join(orte.inbox, "processed", "umsaetze-2026-01.csv"), "Datum;Betrag\n01.01.2026;-1,00\n");
  await writeFile(join(orte.profile, "musterbank.json"), "{\"name\":\"Musterbank\"}");
  await writeFile(join(orte.belege, "Konten", "KTO-001_Giro", "2026", "Auszug_2026-01.pdf"), "%PDF-Auszug");
  // Bestand mit Generationen: data/master -> master.gen/aktuell (ADR 0035).
  const quelle = join(wurzel, "quelle");
  await cp(demo, quelle, { recursive: true });
  await einrichten(join(appDir, "data", "master.gen"), quelle);
  await symlink(join("master.gen", "aktuell"), orte.master);
});

after(() => rm(wurzel, { recursive: true, force: true }));

function hole(port, pfad) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: pfad }, (res) => {
      const teile = [];
      res.on("data", (c) => teile.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(teile) }));
    }).on("error", reject);
  });
}

async function sicherungHolen() {
  const server = createAppServer({
    appDir, inboxDir: orte.inbox, belegeDir: orte.belege, profileDir: orte.profile,
    datenDirs: { live: orte.master, demo }, log: () => {},
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const antwort = await hole(server.address().port, "/api/export/komplett");
    assert.equal(antwort.status, 200);
    const datei = join(wurzel, `sicherung-${Date.now()}.zip`);
    await writeFile(datei, antwort.body);
    return datei;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("Export komplett: Bestand einer Generation, Belege, Inbox, Importprofile und Manifest", async () => {
  const datei = await sicherungHolen();
  const r = await lauf(process.execPath, [pruefer, datei, "--json"]);
  const bericht = JSON.parse(r.stdout);
  assert.equal(bericht.ok, true);
  const m = bericht.manifest;
  assert.equal(m.stand, "000001");
  assert.equal(m.code.kurz, "aaaaaaa");
  assert.equal(m.pruefung.gueltig, true);
  assert.equal(m.pruefung.fehler_anzahl, 0);
  const namen = m.dateien.map((d) => d.name);
  assert.ok(namen.includes("Inbox/wartet.pdf"));
  assert.ok(namen.includes("Inbox/processed/umsaetze-2026-01.csv"));
  assert.ok(namen.includes("Importprofile/musterbank.json"));
  assert.ok(namen.includes("Belege/Konten/KTO-001_Giro/2026/Auszug_2026-01.pdf"));
  assert.ok(namen.includes("Daten/transaktionen.jsonl"));
  // Interna der Generation gehoeren nicht in die Sicherung.
  assert.ok(!namen.includes("Daten/MANIFEST.json"));
  assert.deepEqual(m.abgeleitet, ["Daten/buchungen.csv"]);
  assert.equal(m.bereiche.Inbox.dateien, 2);
  assert.equal(m.bereiche.Importprofile.dateien, 1);
});

test("Restore-Probe: auspacken als Datenort, Validator gruen, Dateien byte-gleich", async () => {
  const datei = await sicherungHolen();
  const ziel = join(wurzel, "wiederhergestellt");
  const r = await lauf(process.execPath, [pruefer, datei, `--auspacken=${ziel}`]);
  assert.match(r.stdout, /ausgepackt/);
  assert.deepEqual((await readdir(ziel)).sort(), ["Belege", "import-profile", "inbox", "master"]);
  assert.equal(await readFile(join(ziel, "inbox", "processed", "umsaetze-2026-01.csv"), "utf8"), "Datum;Betrag\n01.01.2026;-1,00\n");
  assert.equal(await readFile(join(ziel, "Belege", "Konten", "KTO-001_Giro", "2026", "Auszug_2026-01.pdf"), "utf8"), "%PDF-Auszug");
  assert.equal(await readFile(join(ziel, "master", "konten.json"), "utf8"), await readFile(join(demo, "konten.json"), "utf8"));
  await assert.rejects(readFile(join(ziel, "master", "buchungen.csv")), /ENOENT/);
  const v = await lauf(process.execPath, [validator, "data/master"], { env: { ...process.env, FINANZEN_DATEN: ziel } });
  assert.match(v.stdout, /validation passed/);
  // Ein zweites Auspacken ueberschreibt nichts.
  await assert.rejects(lauf(process.execPath, [pruefer, datei, `--auspacken=${ziel}`]), /nicht leer/);
});

test("Pruefung erkennt kaputte Daten und fremde Eintraege", async () => {
  const datei = await sicherungHolen();
  const zip = await readFile(datei);
  const kaputt = Buffer.from(zip);
  const pos = kaputt.indexOf("%PDF-Auszug");
  kaputt[pos + 5] ^= 0xff;
  await writeFile(`${datei}.kaputt`, kaputt);
  await assert.rejects(lauf(process.execPath, [pruefer, `${datei}.kaputt`]), /CRC/);
});

test("Auspacken weist Pfade ausserhalb des Ziels ab", async () => {
  const { zipTeile } = await import("../app/export.mjs");
  const eintrag = (name, text) => ({ name, groesse: Buffer.byteLength(text), geaendert: new Date(), lies: async () => Buffer.from(text) });
  const manifest = { dateien: [{ name: "Daten/../../boese.txt", groesse: 1 }], abgeleitet: [] };
  const teile = [];
  for await (const t of zipTeile([eintrag("Daten/../../boese.txt", "x"), eintrag("SICHERUNG.json", JSON.stringify(manifest))])) teile.push(t);
  const datei = join(wurzel, "boese.zip");
  await writeFile(datei, Buffer.concat(teile));
  await assert.rejects(lauf(process.execPath, [pruefer, datei, `--auspacken=${join(wurzel, "ziel-boese")}`]), /ungueltiger Name/);
});

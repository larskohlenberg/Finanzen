// Lesepfad auf Dateigenerationen (E1 Schritt 4, ADR 0035): Server-Snapshot,
// Statik, Export, Validator- und Pruefbericht-CLI und MCP-Lesewerkzeuge lesen
// aus einer Lease, wenn data/master wie nach der Migration ein Symlink auf
// master.gen/aktuell ist. Im einfachen Ordner bleibt alles wie bisher.
// Temp-Verzeichnisse, erfundene Demodaten.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createAppServer } from "../app/server.mjs";
import { erstelleSnapshotQuelle, leseSnapshot, standKennung } from "../app/stand.mjs";
import { einrichten, generationsOrdner, mitSchreiber } from "../app/tools/lib/generationen.mjs";
import { bestandsBasis, lesestandId, mitLesestand } from "../app/tools/lib/lesestand.mjs";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";

const DEMO = fileURLToPath(new URL("../app/data/demo/", import.meta.url));

// app/data/master -> master.gen/aktuell, wie es die Migration (Schritt 5) anlegt.
async function generationsLayout(dataOrdner, name = "master") {
  const basis = join(dataOrdner, `${name}.gen`);
  await einrichten(basis, DEMO);
  symlinkSync(join(`${name}.gen`, "aktuell"), join(dataOrdner, name));
  return basis;
}

const leases = async (basis, id) => (await readdir(generationsOrdner(basis, id))).filter((n) => n.startsWith(".leser-"));

// Eine Datei im Bestand aendern, wie es der Schreibpfad tun wird.
async function schreibe(basis, datei, aendere) {
  return mitSchreiber(basis, async (tx) => {
    await tx.schreibe(datei, aendere(await tx.lies(datei)));
  });
}

let wurzel;
before(() => {
  wurzel = mkdtempSync(join(tmpdir(), "lesepfad-gen-"));
});
after(() => rmSync(wurzel, { recursive: true, force: true }));

test("bestandsBasis: einfacher Ordner, Symlink auf <basis>/aktuell, Basis selbst", async () => {
  const data = join(wurzel, "basis-test");
  await mkdir(data, { recursive: true });
  const basis = await generationsLayout(data);
  assert.equal(await bestandsBasis(join(data, "master")), basis);
  assert.equal(await bestandsBasis(`${join(data, "master")}/`), basis);
  assert.equal(await bestandsBasis(basis), basis);
  assert.equal(await bestandsBasis(DEMO), DEMO.replace(/\/$/, ""));
  assert.equal(await lesestandId(join(data, "master")), "000001");
  assert.equal(await lesestandId(DEMO), "ordner");
});

test("mitLesestand: Lease waehrend des Lesens, danach weg; Leser bleibt auf seiner Generation", async () => {
  const data = join(wurzel, "lease-test");
  await mkdir(data, { recursive: true });
  const basis = await generationsLayout(data);
  const root = join(data, "master");
  await mitLesestand(root, async (leser) => {
    assert.equal(leser.id, "000001");
    assert.equal((await leases(basis, "000001")).length, 1);
    const vorher = await readFile(join(leser.ordner, "personen.json"), "utf8");
    await schreibe(basis, "personen.json", (t) => `${JSON.stringify(JSON.parse(t))}\n`);
    assert.equal(await lesestandId(root), "000002");
    assert.equal(await readFile(join(leser.ordner, "personen.json"), "utf8"), vorher, "alte Generation unveraendert");
    assert.equal(leser.url.href.endsWith("/"), true);
  });
  assert.deepEqual(await leases(basis, "000001"), []);
});

test("stand.mjs: Generations-Id als Stand, Snapshot aus der Lease, neuer Stand nach Schreiben", async () => {
  const data = join(wurzel, "stand-test");
  await mkdir(data, { recursive: true });
  const basis = await generationsLayout(data);
  const root = join(data, "master");
  assert.equal(await standKennung(root), "g000001-f1");
  const quelle = erstelleSnapshotQuelle(root);
  const erst = await quelle.snapshot();
  assert.equal(erst.stand, "g000001-f1");
  await schreibe(basis, "konten.json", (t) => JSON.stringify([...JSON.parse(t), null]));
  assert.equal(await standKennung(root), "g000002-f1");
  const neu = JSON.parse((await quelle.snapshot()).body);
  assert.equal(neu.stand, "g000002-f1");
  assert.equal(neu.validierung.valid, false);
  assert.deepEqual(await leases(basis, "000002"), [], "Lease nach dem Lesen frei");
  // Einfacher Ordner: wie bisher ein Hash.
  assert.match((await leseSnapshot(DEMO)).stand, /^[0-9a-f]{24}$/);
});

function hole(port, pfad, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: pfad, headers }, (res) => {
      const teile = [];
      res.on("data", (t) => teile.push(t));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(teile) }));
    }).on("error", reject);
  });
}

// Dateinamen aus einer ungepackten ZIP (export.mjs speichert ohne Kompression).
function zipNamen(puffer) {
  const namen = [];
  for (let i = 0; i + 46 <= puffer.length; i += 1) {
    if (puffer.readUInt32LE(i) !== 0x02014b50) continue;
    const laenge = puffer.readUInt16LE(i + 28);
    namen.push(puffer.subarray(i + 46, i + 46 + laenge).toString("utf8"));
  }
  return namen;
}

test("App-Server: Snapshot, 304, Logos und Export aus der aktuellen Generation", async () => {
  const app = join(wurzel, "server-test", "app");
  const data = join(app, "data");
  await mkdir(data, { recursive: true });
  await writeFile(join(app, "index.html"), "<!doctype html><title>t</title>");
  const basis = await generationsLayout(data);
  // Ein Logo in einer neuen Generation.
  await mitSchreiber(basis, async (tx) => {
    await mkdir(join(tx.ordner, "logos"), { recursive: true });
    await tx.schreibe("logos/beispiel.example.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });
  const server = createAppServer({ appDir: app, inboxDir: join(app, "data", "inbox"), log: () => {} });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const stand = JSON.parse((await hole(port, "/api/v1/stand")).body).stand;
    assert.equal(stand, "g000002-f1");
    const snap = await hole(port, "/api/v1/snapshot");
    assert.equal(snap.status, 200);
    assert.equal(snap.headers.etag, `"${stand}"`);
    assert.equal((await hole(port, "/api/v1/snapshot", { "If-None-Match": `"${stand}"` })).status, 304);

    const logo = await hole(port, "/data/master/logos/beispiel.example.png");
    assert.equal(logo.status, 200);
    assert.equal(logo.headers["content-type"], "image/png");
    assert.equal((await hole(port, "/data/master/konten.json")).status, 404);
    assert.equal((await hole(port, "/data/master.gen/aktuell/konten.json")).status, 404);

    const zip = await hole(port, "/api/export/daten");
    assert.equal(zip.status, 200);
    const namen = zipNamen(zip.body);
    assert.ok(namen.includes("Daten/konten.json"), namen.join(", "));
    assert.ok(namen.includes("Daten/logos/beispiel.example.png"));
    assert.ok(namen.includes("Daten/buchungen.csv"));
    assert.ok(!namen.some((n) => n.includes(".leser-") || n.includes("generationen/")), namen.join(", "));
    assert.deepEqual(await leases(basis, "000002"), [], "keine Lease bleibt liegen");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// Echter Pfad: die CLIs laufen nur, wenn argv[1] ihrem Modulpfad entspricht (macOS: /var -> /private/var).
const lauf = (app, skript, root) => new Promise((resolve) => {
  execFile(process.execPath, [join(realpathSync(app), "tools", skript), root], { cwd: app }, (fehler, stdout, stderr) => resolve({ code: fehler?.code ?? 0, stdout, stderr }));
});

test("MCP-Lesewerkzeuge und CLIs lesen den Generationsbestand ueber data/master", async () => {
  const abzug = legeAbzugAn();
  try {
    // data/master des Abzugs in einen Generationsbestand umbauen.
    const data = join(abzug.app, "data");
    await rename(abzug.master, join(data, "quelle"));
    await einrichten(join(data, "master.gen"), join(data, "quelle"));
    rmSync(join(data, "quelle"), { recursive: true, force: true });
    symlinkSync(join("master.gen", "aktuell"), abzug.master);

    const validator = await lauf(abzug.app, "validator.mjs", "data/master");
    assert.equal(validator.code, 0, validator.stderr);
    assert.match(validator.stdout, /validation passed/);
    const bericht = await lauf(abzug.app, "pruefbericht.mjs", "data/master");
    assert.equal(bericht.code, 0, bericht.stderr);

    const s = starteServer(abzug);
    try {
      const status = JSON.parse((await s.werkzeug("status")).text);
      assert.equal(status.stand, "000001");
      assert.equal(status.transaktionen, 675);
      assert.equal(status.validator.gueltig, true);
      assert.ok(!(await s.werkzeug("kennzahlen")).isError);
      assert.ok(!(await s.werkzeug("transaktionen_abfragen", { limit: 1 })).isError);
      const pb = await s.werkzeug("pruefbericht");
      assert.ok(!pb.isError, pb.text);

      // Suche: jede Bestandsdatei genau einmal, unter data/master, nie in den Generationen.
      const treffer = (await s.werkzeug("dateien_suchen", { muster: "konten.json" })).text.split("\n");
      assert.deepEqual(treffer, ["data/master/konten.json"]);
      const gelesen = await s.werkzeug("datei_lesen", { pfad: "data/master/konten.json" });
      assert.ok(!gelesen.isError, gelesen.text);
      // Ein fremder Symlink unter data/ wird weiter nicht verfolgt.
      symlinkSync(abzug.wurzel, join(data, "ausbruch"));
      writeFileSync(join(abzug.wurzel, "geheim.json"), "{}");
      assert.equal((await s.werkzeug("dateien_suchen", { muster: "geheim.json" })).text, "Keine Treffer.");
    } finally {
      await s.beenden();
    }
    assert.deepEqual(readdirSync(join(data, "master.gen", "generationen", "000001")).filter((n) => n.startsWith(".leser-")), []);
  } finally {
    abzug.aufraeumen();
  }
});

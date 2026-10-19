// tests/app-server-stand.test.mjs
// GET /api/v1/stand und /api/v1/snapshot: Kennung des Datenstands, Snapshot
// mit ETag (304 bei unveraendertem Stand), neuer Stand nach Dateiaenderung,
// Demo und Echt getrennt. Temp-Verzeichnis, erfundene Daten.
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import http from "node:http";
import { cp, mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer, etagPasst } from "../app/server.mjs";
import { erstelleSnapshotQuelle, leseSnapshot, standKennung } from "../app/stand.mjs";

const DEMO = new URL("../app/data/demo/", import.meta.url);
let wurzel;
let master;
let demo;
let server;
let port;
const logs = [];

before(async () => {
  wurzel = await mkdtemp(join(tmpdir(), "app-server-stand-"));
  const app = join(wurzel, "app");
  master = join(app, "data", "master");
  demo = join(app, "data", "demo");
  await mkdir(join(app, "data"), { recursive: true });
  await writeFile(join(app, "index.html"), "<!doctype html><title>t</title>");
  // Echt und Demo als Kopie des erfundenen Demo-Bestands; Echt bekommt eine eigene Person.
  await cp(DEMO, master, { recursive: true });
  await cp(DEMO, demo, { recursive: true });
  const personen = JSON.parse(await readFile(join(master, "personen.json"), "utf8"));
  personen[0] = { ...personen[0], name: "Erika Beispiel-Echt" };
  await writeFile(join(master, "personen.json"), JSON.stringify(personen));
  server = createAppServer({ appDir: app, inboxDir: join(wurzel, "inbox"), log: (zeile) => logs.push(zeile) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(wurzel, { recursive: true, force: true });
});

function hole(pfad, { headers = {}, method = "GET" } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: pfad, method, headers }, (res) => {
      const teile = [];
      res.on("data", (t) => teile.push(t));
      res.on("end", () => {
        const text = Buffer.concat(teile).toString("utf8");
        resolve({ status: res.statusCode, headers: res.headers, text, json: () => JSON.parse(text) });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

test("etagPasst: exakter Stand, Liste, schwache Tags und *", () => {
  assert.equal(etagPasst('"abc"', "abc"), true);
  assert.equal(etagPasst('"x", W/"abc"', "abc"), true);
  assert.equal(etagPasst("*", "abc"), true);
  assert.equal(etagPasst('"abd"', "abc"), false);
  assert.equal(etagPasst("abc", "abc"), false);
  assert.equal(etagPasst(undefined, "abc"), false);
  assert.equal(etagPasst("", "abc"), false);
});

test("Stand: Kennung je Bestand, no-store, nur GET", async () => {
  const live = await hole("/api/v1/stand");
  const demoStand = await hole("/api/v1/stand?quelle=demo");
  assert.equal(live.status, 200);
  assert.match(live.headers["cache-control"], /no-store/);
  assert.match(live.json().stand, /^[0-9a-f]{24}$/);
  assert.notEqual(live.json().stand, demoStand.json().stand);
  assert.equal(live.json().stand, await standKennung(master));
  assert.equal((await hole("/api/v1/stand", { method: "POST" })).status, 405);
});

test("Snapshot: Bestand mit Validator-Befund und ETag, 304 bei gleichem Stand", async () => {
  const erst = await hole("/api/v1/snapshot");
  assert.equal(erst.status, 200);
  assert.match(erst.headers["cache-control"], /no-store/);
  const snapshot = erst.json();
  assert.equal(erst.headers.etag, `"${snapshot.stand}"`);
  assert.equal(snapshot.format, 1);
  assert.equal(snapshot.validierung.valid, true, snapshot.validierung.errors.join("\n"));
  assert.equal(snapshot.daten.personen[0].name, "Erika Beispiel-Echt");
  assert.ok(snapshot.daten.transaktionen.length > 0);

  const nochmal = await hole("/api/v1/snapshot", { headers: { "If-None-Match": erst.headers.etag } });
  assert.equal(nochmal.status, 304);
  assert.equal(nochmal.text, "");
  assert.equal(nochmal.headers.etag, erst.headers.etag);

  const demoSnap = await hole("/api/v1/snapshot?quelle=demo", { headers: { "If-None-Match": erst.headers.etag } });
  assert.equal(demoSnap.status, 200, "Demo hat einen eigenen Stand");
  assert.notEqual(demoSnap.json().daten.personen[0].name, "Erika Beispiel-Echt");
  assert.equal((await hole("/api/v1/snapshot", { method: "PUT" })).status, 405);
});

test("Standwechsel: Dateiaenderung gibt neuen Stand, Snapshot mit neuen Daten und neuem Befund", async () => {
  const alt = (await hole("/api/v1/stand")).json().stand;
  const pfad = join(master, "konten.json");
  const konten = JSON.parse(await readFile(pfad, "utf8"));
  // Wie ein atomar schreibendes Werkzeug: temp + rename.
  await writeFile(`${pfad}.tmp`, JSON.stringify([...konten, { kaputt: true }]));
  await rename(`${pfad}.tmp`, pfad);
  try {
    const neu = (await hole("/api/v1/stand")).json().stand;
    assert.notEqual(neu, alt);
    const snap = await hole("/api/v1/snapshot", { headers: { "If-None-Match": `"${alt}"` } });
    assert.equal(snap.status, 200);
    assert.equal(snap.headers.etag, `"${neu}"`);
    const { daten, validierung } = snap.json();
    assert.equal(daten.konten.length, konten.length + 1);
    assert.equal(validierung.valid, false);
    assert.match(validierung.errors.join("\n"), /konten\[\d+\]/);
  } finally {
    await writeFile(pfad, JSON.stringify(konten));
  }
  const zurueck = await hole("/api/v1/snapshot");
  assert.equal(zurueck.json().validierung.valid, true);
});

test("Snapshot: unlesbarer Bestand gibt 500 mit Dateiname, Stand bleibt abfragbar", async () => {
  const pfad = join(demo, "transfers.json");
  const vorher = await readFile(pfad, "utf8");
  await writeFile(pfad, "[kaputt");
  try {
    const res = await hole("/api/v1/snapshot?quelle=demo");
    assert.equal(res.status, 500);
    assert.equal(res.json().grund, "bestand-unlesbar");
    assert.match(res.json().meldung, /^transfers\.json: /);
    assert.equal((await hole("/api/v1/stand?quelle=demo")).status, 200);
    assert.ok(logs.some((zeile) => zeile.includes("snapshot quelle=demo ergebnis=fehler")));
  } finally {
    await writeFile(pfad, vorher);
  }
});

test("Bestandsdateien sind statisch nicht mehr abrufbar", async () => {
  for (const pfad of ["/data/master/personen.json", "/data/demo/transaktionen.jsonl", "/data/master/logos.json"]) {
    assert.equal((await hole(pfad)).status, 404, pfad);
  }
});

test("Snapshot-Quelle: baut je Stand einmal, gleichzeitige Anfragen teilen sich den Bau", async () => {
  const quelle = erstelleSnapshotQuelle(demo);
  const [a, b] = await Promise.all([quelle.snapshot(), quelle.snapshot()]);
  assert.equal(a, b);
  assert.equal(await quelle.snapshot(), a, "gleicher Stand: kein Neubau");
  assert.equal(JSON.parse(a.body).stand, a.stand);
  assert.equal(a.stand, (await leseSnapshot(demo)).stand);
});

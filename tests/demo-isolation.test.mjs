// tests/demo-isolation.test.mjs
// Demo-Modus zeigt nur Demo-Dokumente: Dokumentenliste, Dateien, Export und
// Inbox kommen im Demo-Modus nie aus den echten Verzeichnissen, und ein Upload
// landet nicht in der echten Inbox. Temp-Verzeichnis, erfundene Dateien.
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import http from "node:http";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createAppServer } from "../app/server.mjs";
import { belegDateiUrl, belegeApiUrl, exportUrl, hashNachModuswechsel, uploadMoeglich } from "../app/demo-modus.mjs";

let wurzel;
let appDir;
let inboxDir;
let server;
let port;

const DATEIEN = {
  "index.html": "<!doctype html><title>t</title>",
  "Belege/Steuern/echt-bescheid.pdf": "%PDF-echt",
  "data/inbox/echt-auszug.csv": "a;b",
  "data/master/personen.json": "[]",
  "data/demo/personen.json": "[]",
  "data/demo-belege/Konten/KTO-001_Demo/demo-auszug.pdf": "%PDF-demo",
  "data/demo-belege/Sonstiges/boese.html": "<script>alert(1)</script>",
};

before(async () => {
  wurzel = await mkdtemp(join(tmpdir(), "demo-isolation-"));
  appDir = join(wurzel, "app");
  inboxDir = join(appDir, "data", "inbox");
  for (const [pfad, inhalt] of Object.entries(DATEIEN)) {
    const ziel = join(appDir, ...pfad.split("/"));
    await mkdir(dirname(ziel), { recursive: true });
    await writeFile(ziel, inhalt);
  }
  server = createAppServer({ appDir, inboxDir, log: () => {} });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(wurzel, { recursive: true, force: true });
});

function anfrage(pfad, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: pfad, method, headers }, (res) => {
      const teile = [];
      res.on("data", (c) => teile.push(c));
      res.on("end", () => {
        const puffer = Buffer.concat(teile);
        let json = null;
        try { json = JSON.parse(puffer.toString("utf8")); } catch { /* keine JSON-Antwort */ }
        resolve({ status: res.statusCode, body: puffer, json });
      });
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

test("GET /api/belege?quelle=demo listet nur die Demo-Dokumente", async () => {
  const demo = (await anfrage("/api/belege?quelle=demo")).json.dateien.map((d) => d.pfad);
  assert.deepEqual(demo, ["Belege/Konten/KTO-001_Demo/demo-auszug.pdf", "Belege/Sonstiges/boese.html"]);
  const echt = (await anfrage("/api/belege")).json.dateien.map((d) => d.pfad);
  assert.deepEqual(echt, ["Belege/Steuern/echt-bescheid.pdf"]);
});

test("Demo-Dokumente kommen unter data/demo-belege/, ohne ausfuehrbare Typen", async () => {
  const r = await anfrage("/data/demo-belege/Konten/KTO-001_Demo/demo-auszug.pdf");
  assert.equal(r.status, 200);
  assert.equal(r.body.toString(), "%PDF-demo");
  assert.equal((await anfrage("/data/demo-belege/Sonstiges/boese.html")).status, 404);
  assert.equal((await anfrage("/data/master/Belege/Steuern/echt-bescheid.pdf")).status, 404);
});

test("Export im Demo-Modus enthaelt keine echten Dokumente", async () => {
  for (const art of ["dokumente", "komplett"]) {
    const zip = (await anfrage(`/api/export/${art}?quelle=demo`)).body.toString("latin1");
    assert.match(zip, /demo-auszug\.pdf/, art);
    assert.doesNotMatch(zip, /echt-bescheid/, art);
  }
  assert.match((await anfrage("/api/export/dokumente")).body.toString("latin1"), /echt-bescheid/);
});

test("Inbox im Demo-Modus: leere Liste, Upload abgelehnt, echte Inbox unberuehrt", async () => {
  const liste = await anfrage("/api/inbox?quelle=demo");
  assert.equal(liste.status, 200);
  assert.deepEqual(liste.json.dateien, []);
  const vorher = (await readdir(inboxDir)).sort();
  const r = await anfrage("/api/inbox/demo.csv?quelle=demo", {
    method: "PUT",
    headers: { "X-Finanzen-Upload": "1", Origin: `http://127.0.0.1:${port}`, "Content-Length": "1" },
    body: "x",
  });
  assert.equal(r.status, 409);
  assert.equal(r.json.grund, "demo-modus");
  assert.deepEqual((await readdir(inboxDir)).sort(), vorher);
});

test("demo-modus: URLs je Modus", () => {
  assert.equal(belegeApiUrl("live"), "./api/belege");
  assert.equal(belegeApiUrl("demo"), "./api/belege?quelle=demo");
  assert.equal(belegDateiUrl("Belege/A B/ä.pdf", "live"), "Belege/A%20B/%C3%A4.pdf");
  assert.equal(belegDateiUrl("Belege/A B/ä.pdf", "demo"), "data/demo-belege/A%20B/%C3%A4.pdf");
  for (const art of ["dokumente", "daten", "komplett"]) {
    assert.equal(exportUrl(art, "live"), `./api/export/${art}`);
    assert.equal(exportUrl(art, "demo"), `./api/export/${art}?quelle=demo`);
  }
  assert.equal(uploadMoeglich("live"), true);
  assert.equal(uploadMoeglich("demo"), false);
});

test("hashNachModuswechsel: Auswahl faellt weg, die Seite bleibt", () => {
  assert.equal(hashNachModuswechsel("#/dokumente/Konten/KTO-001_Giro/auszug.pdf"), "#/dokumente");
  assert.equal(hashNachModuswechsel("#/transaktionen/TXN-000123"), "#/transaktionen");
  assert.equal(hashNachModuswechsel("#/vermoegen/immobilien/IMM-001"), "#/vermoegen/immobilien");
  assert.equal(hashNachModuswechsel("#/vorsorge/VS-003"), "#/vorsorge");
  assert.equal(hashNachModuswechsel("#/szenarien/vergleich/SZN-001,SZN-002"), "#/szenarien");
  assert.equal(hashNachModuswechsel("#/termine/fristen"), "#/termine/fristen");
  assert.equal(hashNachModuswechsel("#/administration/checks"), "#/administration/checks");
  assert.equal(hashNachModuswechsel("#/konten/KTO-001"), "#/administration");
  assert.equal(hashNachModuswechsel("#/uebersicht"), "#/uebersicht");
  assert.equal(hashNachModuswechsel(""), "");
});

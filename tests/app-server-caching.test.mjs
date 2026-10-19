// Caching (Review D.2): Nur Code-Assets der App duerfen in den Browser-Cache,
// mit Inhalts-ETag; mit passendem Versionsparameter ?v=<Inhaltshash> sogar
// immutable. Finanzdaten, APIs, Belege, index.html und version.json bleiben
// no-store. Temp-Verzeichnis, erfundene Dateien.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import http from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createAppServer } from "../app/server.mjs";

const DATEIEN = {
  "index.html": '<!doctype html><link rel="stylesheet" href="./styles.css"><script src="./i18n.js" defer></script><script src="./main.js" type="module"></script>',
  "i18n.js": "window.x = 1;",
  "styles.css": "body{}",
  "main.js": 'import { a } from "./views/a.mjs";',
  "views/a.mjs": "export const a = 1;",
  "version.json": JSON.stringify({ commit: "b".repeat(40), kurz: "bbbbbbb" }),
  "data/master/logos/a.example.png": "png",
  "Belege/Konten/auszug.pdf": "%PDF-1.4",
};

let wurzel, server, port;

async function starte(dateien) {
  const w = await mkdtemp(join(tmpdir(), "app-server-caching-"));
  for (const [pfad, inhalt] of Object.entries(dateien)) {
    if (inhalt === undefined) continue;
    const ziel = join(w, "app", ...pfad.split("/"));
    await mkdir(dirname(ziel), { recursive: true });
    await writeFile(ziel, inhalt);
  }
  const s = createAppServer({ appDir: join(w, "app"), inboxDir: join(w, "app", "data", "inbox"), belegeDir: join(w, "app", "Belege"), datenDirs: { live: join(w, "app", "data", "master"), demo: join(w, "app", "data", "demo") }, log: () => {} });
  await new Promise((resolve) => s.listen(0, "127.0.0.1", resolve));
  return { w, s, p: s.address().port };
}

before(async () => {
  ({ w: wurzel, s: server, p: port } = await starte(DATEIEN));
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(wurzel, { recursive: true, force: true });
});

const hole = (pfad, kopf = {}, p = port) => new Promise((resolve, reject) => {
  http.get({ host: "127.0.0.1", port: p, path: pfad, headers: kopf }, (res) => {
    const teile = [];
    res.on("data", (c) => teile.push(c));
    res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(teile).toString("utf8") }));
  }).on("error", reject);
});

const versionIn = (html, datei) => html.match(new RegExp(`"\\./${datei.replace(".", "\\.")}\\?v=([0-9a-f]{16})"`))?.[1];

test("index.html verweist mit Inhaltshash und bleibt no-store", async () => {
  const r = await hole("/");
  assert.equal(r.status, 200);
  assert.match(r.headers["cache-control"], /no-store/);
  for (const datei of ["styles.css", "i18n.js", "main.js"]) {
    const v = versionIn(r.body, datei);
    assert.ok(v, `${datei} in ${r.body}`);
    assert.equal(`"${v}"`, (await hole(`/${datei}`)).headers.etag, datei);
  }
  assert.equal(Number(r.headers["content-length"]), Buffer.byteLength(r.body));
});

test("Code-Asset mit passender Version: immutable mit ETag", async () => {
  const v = versionIn((await hole("/")).body, "main.js");
  const r = await hole(`/main.js?v=${v}`);
  assert.equal(r.status, 200);
  assert.match(r.headers["cache-control"], /immutable/);
  assert.match(r.headers["cache-control"], /private/);
  assert.match(r.headers.etag, /^"[0-9a-f]{16,}"$/);
  assert.equal(r.headers.pragma, undefined);
});

test("Code-Asset ohne oder mit fremder Version: no-cache mit ETag, 304 bei passendem If-None-Match", async () => {
  for (const pfad of ["/views/a.mjs", "/main.js?v=alt", "/styles.css"]) {
    const r = await hole(pfad);
    assert.equal(r.status, 200, pfad);
    assert.equal(r.headers["cache-control"], "no-cache", pfad);
    const wieder = await hole(pfad, { "If-None-Match": r.headers.etag });
    assert.equal(wieder.status, 304, pfad);
    assert.equal(wieder.body, "");
    assert.equal(wieder.headers.etag, r.headers.etag);
  }
});

test("ETag folgt dem Inhalt", async () => {
  const vorher = (await hole("/views/a.mjs")).headers.etag;
  await writeFile(join(wurzel, "app", "views", "a.mjs"), "export const a = 2;");
  const nachher = await hole("/views/a.mjs", { "If-None-Match": vorher });
  assert.equal(nachher.status, 200);
  assert.notEqual(nachher.headers.etag, vorher);
});

test("Daten, Belege, version.json und APIs bleiben no-store ohne ETag", async () => {
  for (const pfad of ["/version.json", "/Belege/Konten/auszug.pdf", "/data/master/logos/a.example.png", "/api/v1/belege"]) {
    const r = await hole(pfad);
    assert.match(r.headers["cache-control"], /no-store/, pfad);
    assert.equal(r.headers.etag, undefined, pfad);
  }
  const ohne = await hole("/version.json?v=bbbbbbb");
  assert.match(ohne.headers["cache-control"], /no-store/);
});

test("Ruecksprung-sicher: alter Versionsparameter auf neuem Inhalt ist nicht immutable", async () => {
  const { w, s, p } = await starte(DATEIEN);
  try {
    const alt = versionIn((await hole("/", {}, p)).body, "main.js");
    await writeFile(join(w, "app", "main.js"), 'import { a } from "./views/a.mjs"; // neu');
    const r = await hole(`/main.js?v=${alt}`, {}, p);
    assert.equal(r.headers["cache-control"], "no-cache");
    const neu = versionIn((await hole("/", {}, p)).body, "main.js");
    assert.notEqual(neu, alt);
    assert.match((await hole(`/main.js?v=${neu}`, {}, p)).headers["cache-control"], /immutable/);
  } finally {
    await new Promise((resolve) => s.close(resolve));
    await rm(w, { recursive: true, force: true });
  }
});

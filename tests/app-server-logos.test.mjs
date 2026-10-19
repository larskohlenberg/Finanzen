// tests/app-server-logos.test.mjs
// Logos kommen ueber die statische Auslieferung aus data/<bestand>/logos/,
// dort aber nur als PNG. Temp-Verzeichnis, erfundene Dateien.
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import http from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer, statikErlaubt } from "../app/server.mjs";

let wurzel;
let server;
let port;

before(async () => {
  wurzel = await mkdtemp(join(tmpdir(), "app-server-logos-"));
  const logos = join(wurzel, "app", "data", "master", "logos");
  await mkdir(logos, { recursive: true });
  await writeFile(join(wurzel, "app", "index.html"), "<!doctype html><title>t</title>");
  await writeFile(join(logos, "beispiel.example.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await writeFile(join(logos, "boese.example.svg"), "<svg><script>alert(1)</script></svg>");
  await writeFile(join(logos, "notiz.txt"), "x");
  await writeFile(join(wurzel, "app", "data", "master", "logos.json"), "[]");
  server = createAppServer({ appDir: join(wurzel, "app"), inboxDir: join(wurzel, "inbox"), log: () => {} });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(wurzel, { recursive: true, force: true });
});

const hole = (pfad) => new Promise((resolve, reject) => {
  http.get({ host: "127.0.0.1", port, path: pfad }, (res) => { res.resume(); res.on("end", () => resolve(res)); }).on("error", reject);
});

test("statikErlaubt: im Logo-Ordner nur PNG", () => {
  assert.equal(statikErlaubt(["data", "master", "logos", "a.example.png"]), true);
  assert.equal(statikErlaubt(["data", "demo", "logos", "a.svg"]), false);
  // Das Logo-Verzeichnis selbst kommt mit dem Snapshot, nicht statisch.
  assert.equal(statikErlaubt(["data", "master", "logos.json"]), false);
});

test("Logo-PNG kommt als Bild mit Rasterbild-CSP", async () => {
  const res = await hole("/data/master/logos/beispiel.example.png");
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "image/png");
  assert.match(res.headers["content-security-policy"], /default-src 'none'/);
  assert.equal(res.headers["x-content-type-options"], "nosniff");
});

test("Im Logo-Ordner: SVG, Text, Ordner und Pfad-Ausbruch sind 404", async () => {
  for (const pfad of [
    "/data/master/logos/boese.example.svg",
    "/data/master/logos/notiz.txt",
    "/data/master/logos/",
    "/data/master/logos/..%2F..%2Findex.html",
    "/data/master/logos/%2e%2e/logos.json",
  ]) {
    assert.equal((await hole(pfad)).statusCode, 404, pfad);
  }
  assert.equal((await hole("/data/master/logos.json")).statusCode, 404);
});

// tests/belege-api.test.mjs
// GET /api/belege: flache Dateiliste unter der Belege-Wurzel (Temp-Verzeichnis,
// keine Echtdaten). Dotfiles/Dot-Ordner fehlen, Symlinks werden nicht verfolgt,
// Zugangspruefungen gelten wie fuer jede Anfrage.
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import http from "node:http";
import { mkdtemp, mkdir, writeFile, rm, symlink, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer, parseArgs, listeBelege } from "../app/server.mjs";

let wurzel, appDir, belegeDir, server, port;

async function starte(optionen = {}) {
  const s = createAppServer({ appDir, inboxDir: join(appDir, "data", "inbox"), belegeDir, log: () => {}, ...optionen });
  await new Promise((resolve) => s.listen(0, "127.0.0.1", resolve));
  return s;
}

function anfrage({ method = "GET", path = "/api/belege", headers = {}, p = port }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: p, method, path, headers }, (res) => {
      const teile = [];
      res.on("data", (c) => teile.push(c));
      res.on("end", () => {
        const text = Buffer.concat(teile).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* keine JSON-Antwort */ }
        resolve({ status: res.statusCode, headers: res.headers, json });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

const ZEIT = new Date("2026-03-01T12:00:00Z");

before(async () => {
  wurzel = await mkdtemp(join(tmpdir(), "belege-api-"));
  appDir = join(wurzel, "app");
  belegeDir = join(appDir, "Belege");
  await mkdir(join(belegeDir, "Kontoauszuege", "KTO-001"), { recursive: true });
  await mkdir(join(belegeDir, "2025", "Rente"), { recursive: true });
  await mkdir(join(belegeDir, ".versteckt"), { recursive: true });
  await writeFile(join(appDir, "index.html"), "<!doctype html><title>t</title>");
  await writeFile(join(belegeDir, ".gitkeep"), "");
  await writeFile(join(belegeDir, ".versteckt", "x.pdf"), "x");
  await writeFile(join(belegeDir, "Kontoauszuege", "KTO-001", "a.pdf"), "%PDF-1");
  await writeFile(join(belegeDir, "Kontoauszuege", "KTO-001", "a.txt"), "Text");
  await writeFile(join(belegeDir, "2025", "Rente", "scan.pdf"), "%PDF-12");
  await writeFile(join(belegeDir, "2025", "Rente", "scan.txt"), "# Kein Textlayer — Bildscan, 2 Seiten. Inhalt nur im PDF.\n");
  await writeFile(join(belegeDir, "2025", "Rente", "Tabelle.XLSX"), "xl");
  await writeFile(join(wurzel, "geheim.pdf"), "GEHEIM");
  await mkdir(join(wurzel, "aussen"));
  await writeFile(join(wurzel, "aussen", "fremd.pdf"), "F");
  await symlink(join(wurzel, "geheim.pdf"), join(belegeDir, "link.pdf"));
  await symlink(join(wurzel, "aussen"), join(belegeDir, "linkordner"));
  for (const datei of ["Kontoauszuege/KTO-001/a.pdf", "Kontoauszuege/KTO-001/a.txt", "2025/Rente/scan.pdf", "2025/Rente/scan.txt", "2025/Rente/Tabelle.XLSX"]) {
    await utimes(join(belegeDir, datei), ZEIT, ZEIT);
  }
  server = await starte();
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(wurzel, { recursive: true, force: true });
});

test("GET /api/belege: alle Dateien rekursiv, App-relativ, ohne Dotfiles und Symlinks", async () => {
  const r = await anfrage({});
  assert.equal(r.status, 200);
  assert.match(r.headers["content-type"], /application\/json/);
  assert.match(r.headers["cache-control"], /no-store/);
  const iso = ZEIT.toISOString();
  assert.deepEqual(r.json, {
    dateien: [
      { pfad: "Belege/2025/Rente/Tabelle.XLSX", groesse: 2, geaendert: iso, typ: "xlsx" },
      { pfad: "Belege/2025/Rente/scan.pdf", groesse: 7, geaendert: iso, typ: "pdf" },
      { pfad: "Belege/2025/Rente/scan.txt", groesse: 60, geaendert: iso, typ: "txt", ocrAusstehend: true },
      { pfad: "Belege/Kontoauszuege/KTO-001/a.pdf", groesse: 6, geaendert: iso, typ: "pdf" },
      { pfad: "Belege/Kontoauszuege/KTO-001/a.txt", groesse: 4, geaendert: iso, typ: "txt" },
    ],
  });
});

test("GET /api/belege: nur GET, sonst 405; Unterpfade 404", async () => {
  for (const method of ["POST", "PUT", "DELETE"]) {
    const r = await anfrage({ method });
    assert.equal(r.status, 405, method);
    assert.equal(r.headers.allow, "GET");
  }
  assert.equal((await anfrage({ path: "/api/belege/x" })).status, 404);
});

test("GET /api/belege: fehlende Wurzel ergibt leere Liste", async () => {
  const s = await starte({ belegeDir: join(wurzel, "gibt-es-nicht") });
  try {
    const r = await anfrage({ p: s.address().port });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { dateien: [] });
  } finally {
    await new Promise((resolve) => s.close(resolve));
  }
});

test("GET /api/belege: fremder Host und Betriebsmodus ohne Proxy/Remote-User -> 403", async () => {
  assert.equal((await anfrage({ headers: { Host: "boese.example" } })).status, 403);
  const betrieb = await starte({ proxyIp: "127.0.0.1" });
  const fremd = await starte({ proxyIp: "192.0.2.10" });
  try {
    assert.equal((await anfrage({ p: betrieb.address().port })).status, 403, "ohne Remote-User");
    const ok = await anfrage({ p: betrieb.address().port, headers: { "Remote-User": "nutzer" } });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.dateien.length, 5);
    assert.equal((await anfrage({ p: fremd.address().port, headers: { "Remote-User": "nutzer" } })).status, 403, "falsche IP");
  } finally {
    await new Promise((resolve) => betrieb.close(resolve));
    await new Promise((resolve) => fremd.close(resolve));
  }
});

test("listeBelege: Praefix ist frei waehlbar, Ergebnis sortiert", async () => {
  const liste = await listeBelege(join(belegeDir, "2025"), "Belege/2025");
  assert.deepEqual(liste.map((d) => d.pfad), ["Belege/2025/Rente/Tabelle.XLSX", "Belege/2025/Rente/scan.pdf", "Belege/2025/Rente/scan.txt"]);
});

test("parseArgs: --belege setzt die Wurzel, Default ist <app>/Belege", () => {
  assert.equal(parseArgs([], { appDir: "/srv/app" }).belege, "/srv/app/Belege");
  assert.equal(parseArgs(["--belege", "/tmp/b"], { appDir: "/srv/app" }).belege, "/tmp/b");
});

// tests/app-server-statik.test.mjs
// Statik-Allowlist: der Browser bekommt aus app/ nur App-Shell, den Modulgraphen
// ab index.html, die Datendateien des Loaders, Logos und Dokumente. Server-
// und MCP-Quellen, Doku, Agentenprotokoll, Papierkorb und Inbox bleiben 404.
// Temp-Verzeichnis, erfundene Dateien; dazu ein Lauf gegen das echte app/.
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import http from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { browserModule, createAppServer, statikErlaubt } from "../app/server.mjs";

const ECHTES_APP = join(dirname(fileURLToPath(import.meta.url)), "..", "app");

let wurzel;
let server;
let port;

const DATEIEN = {
  "index.html": '<!doctype html><script src="./i18n.js" defer></script><script src="./main.js" type="module"></script>',
  "i18n.js": "window.x = 1;",
  "styles.css": "body{}",
  "main.js": 'import { a } from "./views/a.mjs";\nimport {\n  b,\n} from "./b.mjs";\nexport * from "./c.mjs";\nimport "./d.mjs";\nconst e = () => import("./views/e.mjs");',
  "views/a.mjs": 'import { t } from "../tools/lib/text.mjs";\nexport const a = 1;',
  "b.mjs": "export const b = 1;",
  "c.mjs": "export const c = 1;",
  "d.mjs": "",
  "views/e.mjs": "export const e = 1;",
  "tools/lib/text.mjs": "export const t = 1;",
  "tools/inbox.mjs": "// Werkzeug",
  "server.mjs": "// Server",
  "export.mjs": "// Export",
  "mcp/server.mjs": "// MCP",
  "docs/agent-context.md": "# Doku",
  "README.md": "# Readme",
  "schemas/personen.schema.json": "{}",
  "version.json": "{}",
  "sitzung.json": "{}",
  "data/master/personen.json": "[]",
  "data/master/transaktionen.jsonl": "",
  "data/master/agent_log.jsonl": "{}",
  "data/master/boese.html": "<script>alert(1)</script>",
  "data/master/boese.js": "alert(1)",
  "data/master/logos/a.example.png": "png",
  "data/master/papierkorb/2026-01-01/x.json": "{}",
  "data/master/belege-text/x.txt": "x",
  "data/demo/konten.json": "[]",
  "data/demo/agent_log.jsonl": "{}",
  "data/inbox/auszug.csv": "a;b",
  "data/inbox/error/auszug.txt": "fehler",
  "data/exports/x.zip": "zip",
  "data/test-invalid/personen.json": "[]",
  "Belege/Konten/auszug.pdf": "%PDF-1.4",
  "Belege/Konten/foto.png": "png",
  "Belege/Konten/notiz.txt": "text",
  "Belege/Konten/Ärger mit Leerzeichen.pdf": "%PDF-1.4",
  "Belege/Sonstiges/boese.html": "<script>alert(1)</script>",
  "Belege/Sonstiges/boese.svg": "<svg><script>alert(1)</script></svg>",
  "Belege/Sonstiges/boese.js": "alert(1)",
  "Belege/Sonstiges/boese.xhtml": "<html/>",
};

before(async () => {
  wurzel = await mkdtemp(join(tmpdir(), "app-server-statik-"));
  for (const [pfad, inhalt] of Object.entries(DATEIEN)) {
    const ziel = join(wurzel, "app", ...pfad.split("/"));
    await mkdir(dirname(ziel), { recursive: true });
    await writeFile(ziel, inhalt);
  }
  server = createAppServer({ appDir: join(wurzel, "app"), inboxDir: join(wurzel, "app", "data", "inbox"), log: () => {} });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(wurzel, { recursive: true, force: true });
});

const hole = (pfad, p = port) => new Promise((resolve, reject) => {
  http.get({ host: "127.0.0.1", port: p, path: pfad }, (res) => { res.resume(); res.on("end", () => resolve(res)); }).on("error", reject);
});

test("browserModule: Modulgraph ab den Skripten der index.html, statisch und dynamisch", async () => {
  const module = await browserModule(join(wurzel, "app"));
  assert.deepEqual([...module].sort(), [
    "b.mjs", "c.mjs", "d.mjs", "i18n.js", "main.js", "tools/lib/text.mjs", "views/a.mjs", "views/e.mjs",
  ]);
});

test("Statik: App-Shell, Module, Loader-Daten, Logos und Dokumente kommen", async () => {
  for (const pfad of [
    "/", "/index.html", "/styles.css", "/i18n.js", "/main.js", "/views/a.mjs", "/views/e.mjs", "/tools/lib/text.mjs",
    "/version.json", "/sitzung.json",
    "/data/master/personen.json", "/data/master/transaktionen.jsonl", "/data/demo/konten.json",
    "/data/master/logos/a.example.png",
    "/Belege/Konten/auszug.pdf", "/Belege/Konten/foto.png", "/Belege/Konten/notiz.txt",
    `/Belege/Konten/${encodeURIComponent("Ärger mit Leerzeichen.pdf")}`,
  ]) {
    assert.equal((await hole(pfad)).statusCode, 200, pfad);
  }
  assert.equal((await hole("/Belege/Konten/auszug.pdf")).headers["content-type"], "application/pdf");
  assert.match((await hole("/Belege/Konten/foto.png")).headers["content-security-policy"], /default-src 'none'/);
});

test("Statik: Quellen, Doku, Protokoll, Papierkorb, Inbox und Ausfuehrbares sind 404", async () => {
  for (const pfad of [
    "/server.mjs", "/export.mjs", "/mcp/server.mjs", "/tools/inbox.mjs", "/docs/agent-context.md", "/README.md",
    "/schemas/personen.schema.json",
    "/data/master/agent_log.jsonl", "/data/demo/agent_log.jsonl",
    "/data/master/boese.html", "/data/master/boese.js",
    "/data/master/papierkorb/2026-01-01/x.json", "/data/master/belege-text/x.txt",
    "/data/inbox/auszug.csv", "/data/inbox/error/auszug.txt", "/data/exports/x.zip",
    "/data/test-invalid/personen.json",
    "/Belege/Sonstiges/boese.html", "/Belege/Sonstiges/boese.svg", "/Belege/Sonstiges/boese.js", "/Belege/Sonstiges/boese.xhtml",
    "/Belege/", "/Belege",
  ]) {
    assert.equal((await hole(pfad)).statusCode, 404, pfad);
  }
});

test("Statik: Dokumente kommen aus dem Belege-Verzeichnis des Servers (--belege)", async () => {
  const eigen = join(wurzel, "eigene-belege");
  await mkdir(join(eigen, "Steuern"), { recursive: true });
  await writeFile(join(eigen, "Steuern", "bescheid.pdf"), "%PDF-1.4");
  const s = createAppServer({ appDir: join(wurzel, "app"), inboxDir: join(wurzel, "app", "data", "inbox"), belegeDir: eigen, log: () => {} });
  await new Promise((resolve) => s.listen(0, "127.0.0.1", resolve));
  try {
    const p = s.address().port;
    assert.equal((await hole("/Belege/Steuern/bescheid.pdf", p)).statusCode, 200);
    assert.equal((await hole("/Belege/Konten/auszug.pdf", p)).statusCode, 404, "app/Belege gilt mit --belege nicht mehr");
  } finally {
    await new Promise((resolve) => s.close(resolve));
  }
});

test("statikErlaubt: reine Regel", () => {
  const module = new Set(["main.js", "views/a.mjs"]);
  assert.equal(statikErlaubt(["main.js"], { module }), true);
  assert.equal(statikErlaubt(["server.mjs"], { module }), false);
  assert.equal(statikErlaubt(["data", "master", "logos", "a.example.png"], { module }), true);
  assert.equal(statikErlaubt(["data", "demo", "logos", "a.svg"], { module }), false);
  assert.equal(statikErlaubt(["data", "master", "logos.json"], { module }), true);
  assert.equal(statikErlaubt(["data", "master", "agent_log.jsonl"], { module }), false);
  assert.equal(statikErlaubt(["data", "inbox", "personen.json"], { module }), false);
  assert.equal(statikErlaubt(["Belege", "a", "b.pdf"], { module }), true);
  assert.equal(statikErlaubt(["Belege", "a", "b.HTML"], { module }), false);
});

test("Echtes app/: Browser-Module kommen, Server- und Werkzeugquellen nicht", async () => {
  const module = await browserModule(ECHTES_APP);
  for (const pflicht of ["main.js", "i18n.js", "runtime.mjs", "data-loader.mjs", "views/belege.mjs", "tools/validate-core.mjs", "tools/lib/text.mjs"]) {
    assert.ok(module.has(pflicht), pflicht);
  }
  for (const verboten of ["server.mjs", "export.mjs", "mcp/server.mjs", "tools/inbox.mjs", "tools/import.mjs"]) {
    assert.ok(!module.has(verboten), verboten);
  }
  const s = createAppServer({ appDir: ECHTES_APP, inboxDir: join(wurzel, "leer-inbox"), log: () => {} });
  await new Promise((resolve) => s.listen(0, "127.0.0.1", resolve));
  try {
    const p = s.address().port;
    for (const modul of [...module, "index.html", "styles.css"]) assert.equal((await hole(`/${modul}`, p)).statusCode, 200, modul);
    for (const pfad of ["/server.mjs", "/mcp/server.mjs", "/docs/agent-context.md", "/data/demo/agent_log.jsonl", "/package.json"]) {
      assert.equal((await hole(pfad, p)).statusCode, 404, pfad);
    }
    assert.equal((await hole("/data/demo/personen.json", p)).statusCode, 200);
  } finally {
    await new Promise((resolve) => s.close(resolve));
  }
});

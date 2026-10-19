// MCP-Metadaten (Review D.1): Per SSH landet stderr beim Client, darum
// schreibt der Server Metadaten zusaetzlich in <Datenort>/logs/mcp-<JJJJ-MM>.log.
// Nur Zeit, Sitzung, Methode, Werkzeugname, Dauer, Fehlerklasse; nie Inhalte.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";

const logDatei = (ordner) => {
  const namen = readdirSync(ordner).filter((n) => /^mcp-\d{4}-\d{2}\.log$/.test(n));
  assert.equal(namen.length, 1, `genau eine Logdatei in ${ordner}: ${namen}`);
  return readFileSync(join(ordner, namen[0]), "utf8");
};

test("MCP schreibt Metadaten ohne Inhalte nach data/logs", async () => {
  const abzug = legeAbzugAn();
  const s = starteServer(abzug, "lesen");
  try {
    await s.werkzeug("status");
    await s.werkzeug("datei_lesen", { pfad: "data/master/konten.json" });
    await s.werkzeug("dateien_suchen", { text: "GeheimerSuchbegriff" });
    await s.anfrage("tools/call", { name: "gibt\nes nicht <script>", arguments: {} });
  } finally {
    await s.beenden();
  }
  try {
    const text = logDatei(join(abzug.app, "data", "logs"));
    const zeilen = text.trim().split("\n");
    assert.ok(zeilen.every((z) => /^\d{4}-\d{2}-\d{2}T\S+ s=[0-9a-f]{8} pid=\d+ /.test(z)), text);
    assert.ok(zeilen.some((z) => / gestartet, recht=lesen/.test(z)), text);
    assert.ok(zeilen.some((z) => / tools\/call status \d+ms$/.test(z)), text);
    assert.ok(zeilen.some((z) => / tools\/call datei_lesen \d+ms/.test(z)), text);
    assert.ok(zeilen.some((z) => / tools\/call \(ungueltig\) /.test(z)), text);
    assert.match(zeilen.at(-1), /beendet$/);
    const sitzungen = new Set(zeilen.map((z) => z.split(" ")[1]));
    assert.equal(sitzungen.size, 1);
    for (const verboten of ["konten.json", "GeheimerSuchbegriff", "<script>", "es nicht"]) assert.ok(!text.includes(verboten), verboten);
  } finally {
    abzug.aufraeumen();
  }
});

test("Log legt keinen fehlenden Datenort an, relativer Datenort gibt die klare Meldung", () => {
  const abzug = legeAbzugAn();
  try {
    const fehlt = join(abzug.wurzel, "nicht-eingehaengt");
    const server = join(abzug.app, "mcp", "server.mjs");
    const r = spawnSync(process.execPath, [server, "data/master"], { input: "", encoding: "utf8", env: { ...process.env, FINANZEN_DATEN: fehlt } });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /existiert nicht/);
    assert.equal(existsSync(fehlt), false);
    const rel = spawnSync(process.execPath, [server, "data/master"], { input: "", encoding: "utf8", env: { ...process.env, FINANZEN_DATEN: "relativ" } });
    assert.equal(rel.status, 2, rel.stderr);
    assert.match(rel.stderr, /^\[finanzen-mcp\] FINANZEN_DATEN muss ein absoluter Pfad sein/m);
  } finally {
    abzug.aufraeumen();
  }
});

test("MCP-Log liegt am externen Datenort", async () => {
  const abzug = legeAbzugAn();
  const extern = join(abzug.wurzel, "datenort");
  mkdirSync(extern);
  renameSync(abzug.master, join(extern, "master"));
  const s = starteServer(abzug, "lesen", "data/master", { FINANZEN_DATEN: extern });
  try {
    await s.werkzeug("status");
  } finally {
    await s.beenden();
  }
  try {
    assert.match(logDatei(join(extern, "logs")), /tools\/call status/);
  } finally {
    abzug.aufraeumen();
  }
});

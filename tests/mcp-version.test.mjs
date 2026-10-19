// Versionswechsel (Review 0B.3): der MCP-Server merkt sich beim Start die
// Release-Kennung aus app/version.json, meldet sie als serverInfo.version und
// weist nach einem Deploy fachliche Toolaufrufe (auch lesende) mit
// Neustarthinweis ab; status bleibt moeglich und zeigt beide Staende.
import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";

let abzug;
before(() => { abzug = legeAbzugAn(); });
after(() => abzug.aufraeumen());

const release = (commit) => `${JSON.stringify({ commit, kurz: commit.slice(0, 7), datum: "2026-10-19", branch: "main" })}\n`;

test("serverInfo.version ist die Release-Kennung; nach einem Deploy nur noch status", async () => {
  const versionDatei = join(abzug.app, "version.json");
  writeFileSync(versionDatei, release("a".repeat(40)));
  const s = starteServer(abzug, "schreiben");
  try {
    const init = await s.anfrage("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
    assert.equal(init.result.serverInfo.version, "aaaaaaa");
    assert.ok(!(await s.werkzeug("kennzahlen")).isError);

    writeFileSync(versionDatei, release("b".repeat(40)));
    for (const [name, args] of [["kennzahlen", {}], ["transaktionen_abfragen", { limit: 1 }], ["datei_lesen", { pfad: "data/master/konten.json" }], ["freigabe", {}]]) {
      const r = await s.werkzeug(name, args);
      assert.equal(r.isError, true, `${name}: ${r.text}`);
      assert.match(r.text, /neu starten/i, name);
      assert.match(r.text, /aaaaaaa/);
      assert.match(r.text, /bbbbbbb/);
    }
    const status = await s.werkzeug("status");
    assert.ok(!status.isError, status.text);
    const bericht = JSON.parse(status.text);
    assert.deepEqual(bericht.version, { gestartet: "aaaaaaa", installiert: "bbbbbbb", veraltet: true });
  } finally {
    await s.beenden();
    rmSync(versionDatei, { force: true });
  }
});

test("ohne version.json (Entwicklung) laeuft alles, version bleibt erkennbar", async () => {
  const s = starteServer(abzug);
  try {
    const init = await s.anfrage("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
    assert.equal(init.result.serverInfo.version, "entwicklung");
    assert.ok(!(await s.werkzeug("kennzahlen")).isError);
  } finally {
    await s.beenden();
  }
});

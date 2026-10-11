// Haertung der MCP-Tools aus dem Review: Pfade, Dateimodus, Anhaengen.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";

let abzug;
before(() => { abzug = legeAbzugAn(); });
after(() => abzug.aufraeumen());

const KANDIDAT = [{ regel_id: "REG-900", gegenpartei_pattern: "gibtesnicht", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-08-12", kommentar: "x", belegstufe: "E2" }];

test("regel_probelauf: kandidaten_datei wird nicht als URL dekodiert", async () => {
  mkdirSync(join(abzug.wurzel, "geheim"), { recursive: true });
  writeFileSync(join(abzug.wurzel, "geheim", "kandidaten.json"), "GEHEIM-MARKER");
  // Ein Dateiname mit Prozentzeichen muss woertlich gelesen werden.
  writeFileSync(join(abzug.app, "data", "inbox", "k%41.json"), JSON.stringify(KANDIDAT));
  const s = starteServer(abzug);
  try {
    const ausbruch = await s.werkzeug("regel_probelauf", { kandidaten_datei: "data/%2e%2e/%2e%2e/geheim/kandidaten.json", json: true });
    assert.equal(ausbruch.isError, true, ausbruch.text);
    assert.ok(!ausbruch.text.includes("GEHEIM"), ausbruch.text);

    const woertlich = await s.werkzeug("regel_probelauf", { kandidaten_datei: "data/inbox/k%41.json", json: true });
    assert.ok(!woertlich.isError, woertlich.text);
    assert.match(woertlich.text, /REG-900/);
  } finally {
    await s.beenden();
  }
});

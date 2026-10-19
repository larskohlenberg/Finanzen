// Die MCP-Anleitung gibt den Agenten die Kategorisierungsregel aus ADR 0029:
// Regeln nur mit Beleg, Einzelbuchungen ohne Beleg schaetzt der Agent, KAT-012
// nur, wenn nichts passt. Geprueft als Verhalten: Anleitung und Werkzeuge
// nennen dieselbe Regel, und der Weg, den sie beschreibt, fuehrt durchs Gate.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { KATEGORIE_REGEL } from "../app/mcp/werkzeuge.mjs";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";

let abzug;
before(() => { abzug = legeAbzugAn(); });
after(() => abzug.aufraeumen());

const OFFEN = "TXN-00000000-0000-4000-8000-0000000002a3"; // Demo: Baeckerei, ohne Regel, ohne Beleg

test("Anleitung und Werkzeuge nennen dieselbe Kategorisierungsregel", async () => {
  const s = starteServer(abzug, "schreiben");
  try {
    const init = await s.anfrage("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
    assert.ok(init.result.instructions.includes(KATEGORIE_REGEL), init.result.instructions);
    const tools = (await s.anfrage("tools/list")).result.tools;
    for (const name of ["regel_vorschlag", "agent_vorschlag"]) {
      const t = tools.find((w) => w.name === name);
      assert.ok(t.description.includes(KATEGORIE_REGEL), `${name}: ${t.description}`);
    }
  } finally {
    await s.beenden();
  }
});

test("Buchung ohne Beleg: Schaetzung per agent_vorschlag geht durchs Gate, ohne KAT-012", async () => {
  const s = starteServer(abzug, "schreiben");
  try {
    const vorschlag = await s.werkzeug("agent_vorschlag", { ids: [OFFEN], kategorie: "KAT-004", schreiben: true });
    assert.ok(!vorschlag.isError, vorschlag.text);
    const freigabe = await s.werkzeug("freigabe", { schreiben: true });
    assert.ok(!freigabe.isError, freigabe.text);
    const tx = readFileSync(join(abzug.master, "transaktionen.jsonl"), "utf8")
      .split("\n").filter(Boolean).map((z) => JSON.parse(z)).find((t) => t.transaktion_id === OFFEN);
    assert.equal(tx.kategorie_id, "KAT-004");
    assert.equal(tx.kategorie_herkunft, "agent");
    assert.equal(tx.kategorisierung_status, "bestaetigt");
    assert.equal(tx.bestaetigt_durch, "auto");
  } finally {
    await s.beenden();
  }
});

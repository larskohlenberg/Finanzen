// Demodaten als stimmiges Schaufenster (Review 3.8): ein fester Stichtag,
// zu dem die Demo-Buchungen passen, stimmige Kontostaende und wenige,
// erklaerte Checks. Absichtlich fehlerhafte Faelle gehoeren in tests/fixtures.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { DEMO_STICHTAG } from "../app/demo-modus.mjs";
import { checksModell } from "../app/checks-modell.mjs";

const dir = new URL("../app/data/demo/", import.meta.url);
const daten = {};
for (const f of readdirSync(dir)) {
  if (f.endsWith(".json")) daten[f.slice(0, -5)] = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
  if (f.endsWith(".jsonl")) daten[f.slice(0, -6)] = readFileSync(new URL(f, dir), "utf8").trim().split("\n").filter(Boolean).map((z) => JSON.parse(z));
}

test("Demo-Stichtag liegt am Ende der Demo-Buchungen", () => {
  const letzte = daten.transaktionen.map((t) => t.buchungsdatum).sort().at(-1);
  assert.equal(DEMO_STICHTAG.slice(0, 7), letzte.slice(0, 7));
  assert.ok(DEMO_STICHTAG >= letzte);
});

test("Demo hat wenige, erklaerte Checks: eine Abstimmungsdifferenz, ein ungepruefter Vertrag", () => {
  const m = checksModell(daten, DEMO_STICHTAG);
  const arten = m.vermoegen.map((c) => `${c.art}:${c.entitaet_id}`).sort();
  assert.deepEqual(arten, ["reconciliation-drift:KTO-003", "vorsorge-ungeprueft:VS-006"]);
  assert.equal(m.vermoegen.find((c) => c.art === "reconciliation-drift").differenz_cents, 899);
  assert.equal(m.transfers.unvollstaendig.length, 0);
});

test("Regelzahlungen mit Konto haben zugeordnete Buchungen", () => {
  const zugeordnet = new Set(daten.transaktionen.map((t) => t.regelzahlung_id).filter(Boolean));
  const mitKonto = daten.regelzahlungen.filter((rz) => rz.konto_id && rz.status === "bestaetigt");
  assert.ok(zugeordnet.size >= 5, `nur ${zugeordnet.size} Regelzahlungen mit Buchungen`);
  assert.ok(mitKonto.length > 0);
});

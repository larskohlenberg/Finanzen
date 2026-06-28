import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateMasterData } from "../app/tools/validate-core.mjs";
import { loadMasterData } from "../app/tools/validator.mjs";
import { computeSzenario } from "../app/szenarien.mjs";

function ladeDemo() {
  const j = (p) => JSON.parse(readFileSync(new URL(`../app/data/demo/${p}`, import.meta.url)));
  const jsonl = (p) => readFileSync(new URL(`../app/data/demo/${p}`, import.meta.url), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return {
    personen: j("personen.json"), konten: j("konten.json"), kategorien: j("kategorien.json"),
    immobilien: j("immobilien.json"), darlehen: j("darlehen.json"), vermoegenswerte: j("vermoegenswerte.json"),
    regelzahlungen: j("regelzahlungen.json"), kategorisierungsregeln: j("kategorisierungsregeln.json"),
    transfers: j("transfers.json"), szenarien: j("szenarien.json"), vorsorge: j("vorsorge.json"),
    transaktionen: jsonl("transaktionen.jsonl"), zeitwerte: jsonl("zeitwerte.jsonl"),
  };
}

test("Demo-Daten inkl. Vorsorge sind valide", () => {
  assert.deepEqual(validateMasterData(ladeDemo()).errors, []);
});

test("Ruhestands-Szenario SZN-004 rechnet, Rente erhoeht Liquiditaet ggue. Basis", () => {
  const data = ladeDemo();
  const szn = data.szenarien.find((s) => s.szenario_id === "SZN-004");
  const { szenario, basis } = computeSzenario(data, szn, "2026-06-22");
  const sEnd = szenario.punkte[szenario.punkte.length - 1];
  const bEnd = basis.punkte[basis.punkte.length - 1];
  assert.ok(sEnd.liquide_cents > bEnd.liquide_cents);
});

test("Todesfall-Szenario SZN-005 rechnet ohne Wertfehler", () => {
  const data = ladeDemo();
  const szn = data.szenarien.find((s) => s.szenario_id === "SZN-005");
  const { szenario } = computeSzenario(data, szn, "2026-06-22");
  assert.ok(szenario.punkte.length > 0);
});

test("CLI-Loader (loadMasterData) traegt die vorsorge-Collection", async () => {
  // sonst ueberspringt `npm run validate:master` alle Vorsorge-Pruefungen,
  // sobald der reale Bestand in app/data/master/vorsorge.json liegt.
  const master = await loadMasterData();
  assert.ok(Array.isArray(master.vorsorge), "vorsorge muss als Liste geladen werden, nicht undefined");
});

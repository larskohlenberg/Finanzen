// tests/neuer-bestand.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { planNeuerBestand, GRUNDKATEGORIEN } from "../app/tools/neuer-bestand.mjs";
import { loadMasterData, validateMasterData } from "../app/tools/validator.mjs";
import { pathToFileURL } from "node:url";

const cli = (...args) => execFileSync("node", ["app/tools/neuer-bestand.mjs", ...args], { encoding: "utf8" });

test("leerer Ordner: Plan legt alle Masterdateien an", () => {
  const plan = planNeuerBestand([]);
  assert.deepEqual(plan.vorhanden, []);
  assert.ok(plan.dateien["personen.json"]);
  assert.ok(plan.dateien["transaktionen.jsonl"] !== undefined);
  assert.ok(plan.dateien["kategorisierungsregeln.json"]);
});

test("Grundkategorien: KAT-012 ist Noch zu klaeren und steht zuletzt", () => {
  const letzte = GRUNDKATEGORIEN.at(-1);
  assert.equal(letzte.kategorie_id, "KAT-012");
  assert.equal(letzte.name, "Noch zu klaeren");
});

test("Demodaten: KAT-012 gleicht der Grundkategorie und steht zuletzt", () => {
  const demo = JSON.parse(readFileSync("app/data/demo/kategorien.json", "utf8"));
  assert.deepEqual(demo.at(-1), GRUNDKATEGORIEN.at(-1));
});

test("vorhandene Masterdatei: Plan verweigert, statt zu ueberschreiben", () => {
  const plan = planNeuerBestand(["konten.json", "notizen.txt"]);
  assert.deepEqual(plan.vorhanden, ["konten.json"]);
});

test("CLI: Vorschau schreibt nichts, --schreiben legt einen gueltigen Bestand an", async () => {
  const root = mkdtempSync(join(tmpdir(), "neuer-bestand-"));
  const vorschau = cli(root);
  assert.match(vorschau, /Vorschau/);
  assert.equal(existsSync(join(root, "personen.json")), false);

  cli(root, "--schreiben");
  const daten = await loadMasterData(pathToFileURL(root + "/"));
  const ergebnis = validateMasterData(daten);
  assert.equal(ergebnis.valid, true, ergebnis.errors?.join("\n"));
  assert.deepEqual(daten.kategorisierungsregeln, []);
  assert.equal(daten.kategorien.length, GRUNDKATEGORIEN.length);
});

test("CLI: bricht ab, wenn schon Masterdaten liegen", () => {
  const root = mkdtempSync(join(tmpdir(), "neuer-bestand-"));
  writeFileSync(join(root, "konten.json"), "[]\n");
  assert.throws(() => cli(root, "--schreiben"), /konten\.json/);
  assert.equal(readFileSync(join(root, "konten.json"), "utf8"), "[]\n");
  assert.equal(existsSync(join(root, "personen.json")), false);
});

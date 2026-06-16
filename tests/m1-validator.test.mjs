import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { validateMasterData } from "../app/tools/validator.mjs";

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

async function readJsonl(path) {
  const text = await readFile(new URL(path, import.meta.url), "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

async function loadMasterData(root = "./fixtures/master-valid/") {
  return {
    personen: await readJson(`${root}personen.json`),
    konten: await readJson(`${root}konten.json`),
    kategorien: await readJson(`${root}kategorien.json`),
    transaktionen: await readJsonl(`${root}transaktionen.jsonl`),
    transfers: await readJson(`${root}transfers.json`),
  };
}

const validResult = validateMasterData(await loadMasterData());
assert.equal(validResult.valid, true, validResult.errors.join("\n"));

const invalidResult = validateMasterData(await loadMasterData("./fixtures/master-invalid/"));
assert.equal(invalidResult.valid, false);
assert.match(invalidResult.errors.join("\n"), /konto_id.*existiert nicht/);
assert.match(invalidResult.errors.join("\n"), /kategorie_id.*Pflicht/);
assert.match(invalidResult.errors.join("\n"), /dedupe_hash.*doppelt/);

test("Validator lehnt -0.00 und fuehrende Nullen als Betrag ab", async () => {
  const base = await loadMasterData();
  const tx = base.transaktionen[0];
  for (const krumm of ["-0.00", "01.50", "1.5", ""]) {
    const result = validateMasterData({ ...base, transaktionen: [{ ...tx, betrag: krumm }, ...base.transaktionen.slice(1)] });
    assert.equal(result.valid, false, `Betrag ${JSON.stringify(krumm)} haette abgelehnt werden muessen`);
    assert.match(result.errors.join("\n"), /betrag.*(gueltiger Betrag|Format)/);
  }
});

test("Validator akzeptiert striktes Betragsformat weiterhin", async () => {
  const base = await loadMasterData();
  assert.equal(validateMasterData(base).valid, true);
});

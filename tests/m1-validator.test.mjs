import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateMasterData } from "../tools/validator.mjs";

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

async function loadMasterData(root = "../data/master/") {
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

const invalidResult = validateMasterData(await loadMasterData("../data/test-invalid/"));
assert.equal(invalidResult.valid, false);
assert.match(invalidResult.errors.join("\n"), /konto_id.*existiert nicht/);
assert.match(invalidResult.errors.join("\n"), /kategorie_id.*Pflicht/);
assert.match(invalidResult.errors.join("\n"), /dedupe_hash.*doppelt/);


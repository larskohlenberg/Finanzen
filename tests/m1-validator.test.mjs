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

function gueltigeRegel(base) {
  return {
    regel_id: "REG-001",
    gegenpartei_pattern: "MusterladenB",
    konto_id: base.konten[0].konto_id,
    vorzeichen: "ausgabe",
    kategorie_id: base.kategorien[0].kategorie_id,
    status: "aktiv",
    erstellt_am: "2026-06-16",
    kommentar: "MusterladenB-Einkauf automatisch als Lebensmittel kategorisieren",
  };
}

test("Validator akzeptiert gueltige Kategorisierungsregel", async () => {
  const base = await loadMasterData();
  const result = validateMasterData({ ...base, kategorisierungsregeln: [gueltigeRegel(base)] });
  assert.equal(result.valid, true, result.errors.join("\n"));
});

test("Validator lehnt Regel mit nicht existierender kategorie_id ab", async () => {
  const base = await loadMasterData();
  const regel = { ...gueltigeRegel(base), kategorie_id: "KAT-999" };
  const result = validateMasterData({ ...base, kategorisierungsregeln: [regel] });
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /kategorie_id.*KAT-999.*existiert nicht/);
});

test("Validator lehnt Regel mit nicht existierender konto_id ab", async () => {
  const base = await loadMasterData();
  const regel = { ...gueltigeRegel(base), konto_id: "KTO-999" };
  const result = validateMasterData({ ...base, kategorisierungsregeln: [regel] });
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /konto_id.*KTO-999.*existiert nicht/);
});

test("Validator akzeptiert matched_regeln mit gueltigem Format", async () => {
  const base = await loadMasterData();
  const tx = base.transaktionen[0];
  const result = validateMasterData({
    ...base,
    kategorisierungsregeln: [
      { regel_id: "REG-001", kategorie_id: "KAT-001", status: "aktiv", erstellt_am: "2026-01-01", kommentar: "Testregel A" },
      { regel_id: "REG-042", kategorie_id: "KAT-001", status: "aktiv", erstellt_am: "2026-01-01", kommentar: "Testregel B" },
    ],
    transaktionen: [{ ...tx, kategorie_herkunft: "regel", matched_regeln: ["REG-001", "REG-042"] }, ...base.transaktionen.slice(1)],
  });
  assert.equal(result.valid, true, result.errors.join("\n"));
});

test("Validator lehnt matched_regeln mit falschem Format ab", async () => {
  const base = await loadMasterData();
  const tx = base.transaktionen[0];
  const result = validateMasterData({
    ...base,
    transaktionen: [{ ...tx, matched_regeln: ["REG-1"] }, ...base.transaktionen.slice(1)],
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /matched_regeln/);
});

test("matched_regeln auf manueller Buchung ist ungueltig", async () => {
  const data = await loadMasterData();
  const tx = data.transaktionen[0];
  tx.kategorie_herkunft = "manuell";
  tx.kategorie_id = "KAT-001";
  tx.kategorisierung_status = "bestaetigt";
  tx.matched_regeln = ["REG-001"];
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /matched_regeln.*manueller Herkunft/);
});

test("matched_regeln auf agent-Buchung ist ungueltig", async () => {
  const data = await loadMasterData();
  const tx = data.transaktionen[0];
  tx.kategorie_herkunft = "agent";
  tx.kategorie_id = "KAT-001";
  tx.kategorisierung_status = "vorgeschlagen";
  tx.matched_regeln = ["REG-001"];
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /matched_regeln.*Agenten-Herkunft/);
});

test("matched_regeln muss auf existierende Regeln zeigen", async () => {
  const data = await loadMasterData();
  data.kategorisierungsregeln = [{ regel_id: "REG-001", kategorie_id: "KAT-001", status: "aktiv", erstellt_am: "2026-01-01", kommentar: "x" }];
  data.transaktionen[0].matched_regeln = ["REG-999"];
  data.transaktionen[0].kategorie_herkunft = "regel";
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /REG-999.*existiert nicht/);
});

test("Regel ohne kommentar ist ungueltig", async () => {
  const base = await loadMasterData();
  const data = { ...base, kategorisierungsregeln: [{ regel_id: "REG-001", kategorie_id: "KAT-001", status: "aktiv", erstellt_am: "2026-01-01" }] };
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /kommentar/);
});

test("Validator lehnt Regel mit Schemaverstoss ab", async () => {
  const base = await loadMasterData();
  for (const kaputt of [
    { regel_id: "REGEL-1" },
    { vorzeichen: "neutral" },
    { status: "geloescht" },
    { gegenpartei_pattern: "" },
    { erstellt_am: "16.06.2026" },
  ]) {
    const regel = { ...gueltigeRegel(base), ...kaputt };
    const result = validateMasterData({ ...base, kategorisierungsregeln: [regel] });
    assert.equal(result.valid, false, `Regel ${JSON.stringify(kaputt)} haette abgelehnt werden muessen`);
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { validateMasterData } from "../app/tools/validator.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function demoData() {
  return {
    personen: readJson("app/data/demo/personen.json"),
    konten: readJson("app/data/demo/konten.json"),
    kategorien: readJson("app/data/demo/kategorien.json"),
    transaktionen: readJsonl("app/data/demo/transaktionen.jsonl"),
    transfers: readJson("app/data/demo/transfers.json"),
    regelzahlungen: readJson("app/data/demo/regelzahlungen.json"),
    szenarien: readJson("app/data/demo/szenarien.json"),
    immobilien: readJson("app/data/demo/immobilien.json"),
    darlehen: readJson("app/data/demo/darlehen.json"),
    vermoegenswerte: readJson("app/data/demo/vermoegenswerte.json"),
    vorsorge: readJson("app/data/demo/vorsorge.json"),
    zeitwerte: readJsonl("app/data/demo/zeitwerte.jsonl"),
    kategorisierungsregeln: readJson("app/data/demo/kategorisierungsregeln.json"),
  };
}

test("Demodaten bilden mindestens 36 Monate Transaktionshistorie ab", () => {
  const transaktionen = readJsonl("app/data/demo/transaktionen.jsonl");
  const months = new Set(transaktionen.map((tx) => tx.buchungsdatum.slice(0, 7)));
  const dates = transaktionen.map((tx) => tx.buchungsdatum).sort();

  assert.ok(transaktionen.length >= 180);
  assert.equal(months.size, 36);
  assert.equal(dates[0].slice(0, 7), "2023-07");
  assert.equal(dates.at(-1).slice(0, 7), "2026-06");
});

test("Demo-Darlehen enthalten Laufzeitende und erwarteten Stand am Laufzeitende", () => {
  const data = demoData();

  for (const darlehen of data.darlehen) {
    assert.match(darlehen.laufzeit_bis, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(darlehen.restschuld_laufzeitende, /^\d+\.\d{2}$/);
    assert.ok(darlehen.laufzeit_bis > darlehen.anfangsdatum);
  }
  assert.equal(validateMasterData(data).valid, true);
});

test("Demodaten zeigen den Immobilienbezug an Darlehensrate und Hausgeld", () => {
  const data = demoData();
  const objektbezogen = data.transaktionen.filter((entry) =>
    ["Hannoversche Bank", "Hausverwaltung Lindenhof"].includes(entry.gegenpartei)
  );

  assert.equal(data.transaktionen.filter((entry) => entry.gegenpartei === "Hannoversche Bank").length, 36);
  assert.equal(data.transaktionen.filter((entry) => entry.gegenpartei === "Hausverwaltung Lindenhof").length, 36);
  assert.equal(objektbezogen.length, 72);
  assert.ok(objektbezogen.every((entry) => entry.immobilie_id === "IMM-001"));
  assert.equal(validateMasterData(data).valid, true);
});

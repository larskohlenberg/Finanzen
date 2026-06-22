import { test } from "node:test";
import assert from "node:assert/strict";
import { aktuellerZeitwert } from "../app/vermoegen.mjs";

const ZW = [
  { entitaet: "immobilie", entitaet_id: "IMM-001", feld: "marktwert", wert: "400000.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" },
  { entitaet: "immobilie", entitaet_id: "IMM-001", feld: "marktwert", wert: "999999.00", standdatum: "2030-01-01", qualitaet: "geschaetzt" },
];

test("aktuellerZeitwert mit bis-Cutoff ignoriert spätere Stände", () => {
  assert.equal(aktuellerZeitwert(ZW, "immobilie", "IMM-001", "marktwert", "2026-06-22").wert, "400000.00");
});

test("aktuellerZeitwert ohne bis nimmt den neuesten", () => {
  assert.equal(aktuellerZeitwert(ZW, "immobilie", "IMM-001", "marktwert").wert, "999999.00");
});

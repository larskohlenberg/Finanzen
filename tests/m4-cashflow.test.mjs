import { test } from "node:test";
import assert from "node:assert/strict";
import { addInterval, occurrences } from "../app/cashflow.mjs";

test("addInterval addiert Tage", () => {
  assert.equal(addInterval("2026-01-30", "tag", 5), "2026-02-04");
});

test("addInterval addiert Wochen", () => {
  assert.equal(addInterval("2026-01-01", "woche", 2), "2026-01-15");
});

test("addInterval addiert Monate mit Monatsende-Clamping", () => {
  assert.equal(addInterval("2026-01-31", "monat", 1), "2026-02-28");
  assert.equal(addInterval("2026-01-31", "monat", 3), "2026-04-30");
});

test("addInterval addiert Jahre und clampt Schaltjahr", () => {
  assert.equal(addInterval("2024-02-29", "jahr", 1), "2025-02-28");
});

test("occurrences liefert nur Fälligkeiten nach heute bis Horizont", () => {
  const rz = { anker_datum: "2026-01-01", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  const result = occurrences(rz, "2026-03-15", "2026-06-30");
  assert.deepEqual(result, ["2026-04-01", "2026-05-01", "2026-06-01"]);
});

test("occurrences stoppt an aktiv_bis (24-Monate-Vertrag)", () => {
  const rz = { anker_datum: "2025-07-01", aktiv_bis: "2027-07-01", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  const result = occurrences(rz, "2027-04-15", "2030-12-31");
  assert.deepEqual(result, ["2027-05-01", "2027-06-01", "2027-07-01"]);
});

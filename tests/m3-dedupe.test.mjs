// tests/m3-dedupe.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { computeDedupeHash } from "../app/tools/dedupe.mjs";

const base = {
  konto_id: "KTO-001",
  buchungsdatum: "2026-05-03",
  betrag: "-82.45",
  gegenpartei: "Supermarkt Demo",
  verwendungszweck: "Wocheneinkauf Demo",
};

test("gleiche Buchung ergibt gleichen Hash", () => {
  assert.equal(computeDedupeHash(base), computeDedupeHash({ ...base }));
});

test("Whitespace im Verwendungszweck aendert den Hash nicht", () => {
  const reformatted = { ...base, verwendungszweck: "Wocheneinkauf   Demo" };
  assert.equal(computeDedupeHash(base), computeDedupeHash(reformatted));
});

test("unterschiedlicher Betrag ergibt unterschiedlichen Hash", () => {
  assert.notEqual(computeDedupeHash(base), computeDedupeHash({ ...base, betrag: "-82.46" }));
});

test("Gross-/Kleinschreibung ist relevant (kein lowercase)", () => {
  assert.notEqual(computeDedupeHash(base), computeDedupeHash({ ...base, gegenpartei: "supermarkt demo" }));
});

test("mit bank_referenz zaehlt nur konto_id + referenz", () => {
  const withRef = { ...base, bank_referenz: "E2E-123" };
  const reformatted = { ...withRef, verwendungszweck: "voellig anders", gegenpartei: "x" };
  assert.equal(computeDedupeHash(withRef), computeDedupeHash(reformatted));
});

test("leere bank_referenz faellt auf Freitext-Hash zurueck", () => {
  const empty = { ...base, bank_referenz: "  " };
  assert.equal(computeDedupeHash(empty), computeDedupeHash(base));
});

// tests/m3-text.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeWhitespace,
  normalizeLoose,
  toCents,
  centsToDecimal,
  dayDiff,
} from "../tools/lib/text.mjs";

test("normalizeWhitespace trimmt und kollabiert, ohne lowercase", () => {
  assert.equal(normalizeWhitespace("  Wocheneinkauf   Demo "), "Wocheneinkauf Demo");
  assert.equal(normalizeWhitespace("MusterladenA"), "MusterladenA");
});

test("normalizeLoose kollabiert und lowercased", () => {
  assert.equal(normalizeLoose("  MusterladenA   Mitte "), "musterladena mitte");
});

test("toCents wandelt Decimal-String in Cent-Integer", () => {
  assert.equal(toCents("3500.00"), 350000);
  assert.equal(toCents("-82.45"), -8245);
  assert.equal(toCents("0.00"), 0);
});

test("centsToDecimal wandelt zurueck mit zwei Nachkommastellen", () => {
  assert.equal(centsToDecimal(350000), "3500.00");
  assert.equal(centsToDecimal(-8245), "-82.45");
  assert.equal(centsToDecimal(5), "0.05");
});

test("dayDiff zaehlt Kalendertage", () => {
  assert.equal(dayDiff("2026-05-05", "2026-05-05"), 0);
  assert.equal(dayDiff("2026-05-08", "2026-05-05"), 3);
  assert.equal(dayDiff("2026-05-05", "2026-05-08"), -3);
});

// tests/m3-text.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeWhitespace,
  normalizeLoose,
  toCents,
  centsToDecimal,
  dayDiff,
  formatIban,
  matchesQuery,
} from "../app/tools/lib/text.mjs";

test("normalizeWhitespace trimmt und kollabiert, ohne lowercase", () => {
  assert.equal(normalizeWhitespace("  Wocheneinkauf   Demo "), "Wocheneinkauf Demo");
  assert.equal(normalizeWhitespace("EDEKA"), "EDEKA");
});

test("normalizeLoose kollabiert und lowercased", () => {
  assert.equal(normalizeLoose("  EDEKA   Mitte "), "edeka mitte");
});

test("toCents wandelt Decimal-String in Cent-Integer", () => {
  assert.equal(toCents("3500.00"), 350000);
  assert.equal(toCents("-82.45"), -8245);
  assert.equal(toCents("0.00"), 0);
});

test("toCents ist robust gegen fehlende oder kurze Nachkommastellen", () => {
  // Schema garantiert zwei Nachkommastellen — aber als einzige toCents-Implementierung
  // (auch fuer UI-Anzeigewege) darf die Funktion bei Abweichungen nicht centfalsch rechnen.
  assert.equal(toCents("1.5"), 150);
  assert.equal(toCents("12"), 1200);
  assert.equal(toCents(""), 0);
  assert.equal(toCents(null), 0);
});

test("centsToDecimal wandelt zurueck mit zwei Nachkommastellen", () => {
  assert.equal(centsToDecimal(350000), "3500.00");
  assert.equal(centsToDecimal(-8245), "-82.45");
  assert.equal(centsToDecimal(5), "0.05");
});

test("formatIban gruppiert IBANs in 4er-Bloecke, nur Darstellung", () => {
  assert.equal(formatIban("DE98120300001061711675"), "DE98 1203 0000 1061 7116 75");
  // bereits gruppierte Eingabe wird neu gruppiert, nicht doppelt verlueckt
  assert.equal(formatIban("DE98 1203 0000 1061 7116 75"), "DE98 1203 0000 1061 7116 75");
});

test("formatIban laesst Nicht-IBANs unveraendert (Depotnummern, leere Werte)", () => {
  assert.equal(formatIban("1510365800"), "1510365800");
  assert.equal(formatIban("Depot 4711"), "Depot 4711");
  assert.equal(formatIban(""), "");
  assert.equal(formatIban(null), "");
});

test("matchesQuery: jeder Suchbegriff muss vorkommen, case- und whitespace-tolerant", () => {
  const felder = ["REWE Markt GmbH", "Dankeschoen  EINKAUF 123", null];
  assert.equal(matchesQuery(felder, "rewe"), true);
  assert.equal(matchesQuery(felder, "rewe einkauf"), true);
  assert.equal(matchesQuery(felder, "  REWE   123 "), true);
  assert.equal(matchesQuery(felder, "rewe tankstelle"), false);
});

test("matchesQuery: leere Suche matcht alles, leere Felder matchen nichts", () => {
  assert.equal(matchesQuery(["abc"], ""), true);
  assert.equal(matchesQuery(["abc"], null), true);
  assert.equal(matchesQuery([null, undefined, ""], "x"), false);
});

test("dayDiff zaehlt Kalendertage", () => {
  assert.equal(dayDiff("2026-05-05", "2026-05-05"), 0);
  assert.equal(dayDiff("2026-05-08", "2026-05-05"), 3);
  assert.equal(dayDiff("2026-05-05", "2026-05-08"), -3);
});

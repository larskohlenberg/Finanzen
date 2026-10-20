import assert from "node:assert/strict";
import test from "node:test";
import { datumAusEingabe } from "../app/datum-eingabe.mjs";

test("Datum eintippen: deutsche, britische und ISO-Schreibweise", () => {
  assert.equal(datumAusEingabe("20.10.2027"), "2027-10-20");
  assert.equal(datumAusEingabe(" 1.2.27 "), "2027-02-01");
  assert.equal(datumAusEingabe("20/10/2027"), "2027-10-20");
  assert.equal(datumAusEingabe("20102027"), "2027-10-20");
  assert.equal(datumAusEingabe("2027-10-20"), "2027-10-20");
});

test("Datum eintippen: leer, unlesbar und nicht existierende Tage", () => {
  assert.equal(datumAusEingabe(""), "");
  assert.equal(datumAusEingabe("   "), "");
  assert.equal(datumAusEingabe("morgen"), null);
  assert.equal(datumAusEingabe("31.2.2027"), null);
  assert.equal(datumAusEingabe("29.2.2028"), "2028-02-29");
  assert.equal(datumAusEingabe("13.13.2027"), null);
});

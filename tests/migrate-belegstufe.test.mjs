// tests/migrate-belegstufe.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { belegstufeAusBestand } from "../app/tools/migrate-belegstufe.mjs";

let n = 0;
function mensch(gegenpartei, kategorie_id) {
  n += 1;
  return {
    transaktion_id: `TXN-${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`,
    konto_id: "KTO-001", buchungsdatum: "2026-05-20", betrag: "-10.00",
    gegenpartei, verwendungszweck: "", ist_transfer: false,
    kategorisierung_status: "bestaetigt", kategorie_id, bestaetigt_durch: "mensch",
  };
}
const regel = (props) => ({ regel_id: "REG-001", gegenpartei_pattern: "testladen", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "x", ...props });

test("einheitliche menschliche Treffer belegen E2", () => {
  const out = belegstufeAusBestand([regel()], [mensch("Testladen Mitte", "KAT-003"), mensch("Testladen Nord", "KAT-003")]);
  assert.equal(out.regeln[0].belegstufe, "E2");
  assert.equal(out.bericht.belegt[0].treffer, 2);
});

test("Widerspruch belegt nicht und wird gemeldet", () => {
  const out = belegstufeAusBestand([regel()], [mensch("Testladen Mitte", "KAT-003"), mensch("Testladen Nord", "KAT-005")]);
  assert.equal(Object.hasOwn(out.regeln[0], "belegstufe"), false);
  assert.equal(out.bericht.widerspruch[0].abweichend, 1);
});

test("ohne menschlichen Treffer keine Stufe", () => {
  const out = belegstufeAusBestand([regel()], [mensch("Ganz Anderer Laden", "KAT-003")]);
  assert.equal(Object.hasOwn(out.regeln[0], "belegstufe"), false);
  assert.equal(out.bericht.ohne_treffer.length, 1);
});

test("Auto-Freigaben belegen nichts", () => {
  const auto = { ...mensch("Testladen Mitte", "KAT-003"), bestaetigt_durch: "auto" };
  const out = belegstufeAusBestand([regel()], [auto]);
  assert.equal(Object.hasOwn(out.regeln[0], "belegstufe"), false);
});

test("vorhandene Stufe wird nicht ueberschrieben", () => {
  const out = belegstufeAusBestand([regel({ belegstufe: "E4" })], [mensch("Testladen Mitte", "KAT-003")]);
  assert.equal(out.regeln[0].belegstufe, "E4");
});

test("inaktive Regeln bleiben unangetastet", () => {
  const out = belegstufeAusBestand([regel({ status: "inaktiv" })], [mensch("Testladen Mitte", "KAT-003")]);
  assert.equal(Object.hasOwn(out.regeln[0], "belegstufe"), false);
});

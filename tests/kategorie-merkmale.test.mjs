import assert from "node:assert/strict";
import test from "node:test";
import { validateMasterData } from "../app/tools/validate-core.mjs";

const leer = { personen: [], konten: [], transaktionen: [], transfers: [], regelzahlungen: [] };
const kategorie = (extra) => ({ kategorie_id: "KAT-001", name: "Test", typ: "neutral", lebenshaltung_relevant: false, status: "aktiv", ...extra });
const fehler = (k) => validateMasterData({ ...leer, kategorien: [k] }).errors.filter((f) => f.startsWith("kategorien"));

test("Kategorie-Merkmale gutschriften_sondereffekt und sparziel werden geprueft", () => {
  assert.deepEqual(fehler(kategorie({ sparziel: "depot", gutschriften_sondereffekt: true })), []);
  assert.equal(fehler(kategorie({ sparziel: "konto" })).length, 1);
  assert.equal(fehler(kategorie({ gutschriften_sondereffekt: "ja" })).length, 1);
});

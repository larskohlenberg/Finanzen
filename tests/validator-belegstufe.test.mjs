// tests/validator-belegstufe.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { validateMasterData } from "../app/tools/validate-core.mjs";

function mitRegel(regel) {
  return {
    personen: [{ person_id: "PER-001", name: "Testperson", status: "aktiv" }],
    konten: [], transaktionen: [], transfers: [],
    kategorien: [{ kategorie_id: "KAT-003", name: "Testkategorie", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" }],
    kategorisierungsregeln: [{
      regel_id: "REG-001", gegenpartei_pattern: "testladen", kategorie_id: "KAT-003",
      status: "aktiv", erstellt_am: "2026-06-01", kommentar: "Testregel", ...regel,
    }],
  };
}

test("belegstufe E2 ist gueltig", () => {
  const out = validateMasterData(mitRegel({ belegstufe: "E2" }));
  assert.equal(out.valid, true, out.errors.join("; "));
});

test("belegstufe E6 ist ungueltig", () => {
  const out = validateMasterData(mitRegel({ belegstufe: "E6" }));
  assert.equal(out.valid, false);
  assert.ok(out.errors.some((e) => e.includes("belegstufe")));
});

// Die 295 Bestandsregeln tragen die Stufe noch nicht. Ein globales required
// wuerde sie sofort ungueltig machen; die Anwesenheit erzwingt das Gate.
test("fehlende belegstufe ist gueltig", () => {
  const out = validateMasterData(mitRegel({}));
  assert.equal(out.valid, true, out.errors.join("; "));
});

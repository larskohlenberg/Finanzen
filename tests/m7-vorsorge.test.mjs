import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMasterData } from "../app/tools/validate-core.mjs";

function basis(extra = {}) {
  return {
    personen: [{ person_id: "PER-001", name: "Lena", status: "aktiv" }],
    konten: [],
    kategorien: [],
    transaktionen: [],
    transfers: [],
    ...extra,
  };
}

test("valide Vorsorge (kapitalbildende Riester) besteht", () => {
  const data = basis({
    vorsorge: [{
      vorsorge_id: "VS-001", art: "riester", name: "Riester Lena", person_id: "PER-001",
      status: "aktiv", kapitalbildend: true, kapitalwahl: "offen", geprueft_am: "2026-01-15",
    }],
  });
  assert.deepEqual(validateMasterData(data).errors, []);
});

test("unbekannte art ist Fehler", () => {
  const data = basis({ vorsorge: [{ vorsorge_id: "VS-001", art: "krypto", name: "X", person_id: "PER-001", status: "aktiv", kapitalbildend: false }] });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("art")));
});

test("fehlendes kapitalbildend ist Fehler", () => {
  const data = basis({ vorsorge: [{ vorsorge_id: "VS-001", art: "schutzversicherung", name: "KFZ-HV", person_id: "PER-001", status: "aktiv" }] });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("kapitalbildend")));
});

test("kapitalbildend muss boolean sein", () => {
  const data = basis({ vorsorge: [{ vorsorge_id: "VS-001", art: "riester", name: "X", person_id: "PER-001", status: "aktiv", kapitalbildend: "ja" }] });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("kapitalbildend")));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMasterData } from "../app/tools/validator.mjs";

function base() {
  return {
    personen: [{ person_id: "PER-001", name: "Lars", status: "aktiv" }],
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    kategorien: [{ kategorie_id: "KAT-001", name: "Gehalt", typ: "einnahme", lebenshaltung_relevant: false, status: "aktiv" }],
    transaktionen: [],
    transfers: [],
  };
}

function rz(extra = {}) {
  return { regelzahlung_id: "RZ-001", bezeichnung: "Gehalt", betrag: "3500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-30", status: "bestaetigt", kategorie_id: "KAT-001", erstellt_am: "2026-06-02", ...extra };
}

test("gueltige Regelzahlung passiert den Validator", () => {
  const data = { ...base(), regelzahlungen: [rz()] };
  const result = validateMasterData(data);
  assert.equal(result.valid, true, result.errors.join("\n"));
});

test("fehlendes regelzahlungen-Feld ist erlaubt (optional)", () => {
  const result = validateMasterData(base());
  assert.equal(result.valid, true, result.errors.join("\n"));
});

test("unbekannte kategorie_id wird gemeldet", () => {
  const data = { ...base(), regelzahlungen: [rz({ kategorie_id: "KAT-999" })] };
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /KAT-999 existiert nicht/);
});

test("aktiv_bis vor anker_datum wird gemeldet", () => {
  const data = { ...base(), regelzahlungen: [rz({ anker_datum: "2026-05-01", aktiv_bis: "2026-04-01" })] };
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /aktiv_bis: liegt vor anker_datum/);
});

test("rhythmus_intervall 0 ist ungueltig", () => {
  const data = { ...base(), regelzahlungen: [rz({ rhythmus_intervall: 0 })] };
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /rhythmus_intervall: muss mindestens 1 sein/);
});

test("nicht-ganzzahliges rhythmus_intervall ist ungueltig", () => {
  const data = { ...base(), regelzahlungen: [rz({ rhythmus_intervall: 1.5 })] };
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /rhythmus_intervall: muss eine Ganzzahl sein/);
});

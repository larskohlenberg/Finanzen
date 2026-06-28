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

test("vorsorge-Zeitwert mit rueckkaufswert ist valide", () => {
  const data = basis({
    vorsorge: [{ vorsorge_id: "VS-001", art: "riester", name: "R", person_id: "PER-001", status: "aktiv", kapitalbildend: true }],
    zeitwerte: [{ entitaet: "vorsorge", entitaet_id: "VS-001", feld: "rueckkaufswert", wert: "9100.00", standdatum: "2026-01-01", qualitaet: "belegt" }],
  });
  assert.deepEqual(validateMasterData(data).errors, []);
});

test("vorsorge-Zeitwert auf unbekannte vorsorge_id ist Fehler", () => {
  const data = basis({
    vorsorge: [],
    zeitwerte: [{ entitaet: "vorsorge", entitaet_id: "VS-999", feld: "erwartete_rente", wert: "1480.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" }],
  });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("VS-999")));
});

test("Regelzahlung mit gueltiger vorsorge_id ist valide", () => {
  const data = basis({
    vorsorge: [{ vorsorge_id: "VS-001", art: "schutzversicherung", name: "KFZ", person_id: "PER-001", status: "aktiv", kapitalbildend: false }],
    regelzahlungen: [{ regelzahlung_id: "RZ-001", bezeichnung: "KFZ-Beitrag", betrag: "-92.00", rhythmus_einheit: "jahr", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt", erstellt_am: "2026-01-01", vorsorge_id: "VS-001" }],
  });
  assert.deepEqual(validateMasterData(data).errors, []);
});

test("Regelzahlung mit unbekannter vorsorge_id ist Fehler", () => {
  const data = basis({
    vorsorge: [],
    regelzahlungen: [{ regelzahlung_id: "RZ-001", bezeichnung: "X", betrag: "-92.00", rhythmus_einheit: "jahr", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt", erstellt_am: "2026-01-01", vorsorge_id: "VS-404" }],
  });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("VS-404")));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMasterData } from "../tools/validator.mjs";

function basis() {
  return {
    personen: [
      { person_id: "PER-001", name: "Lars", status: "aktiv" },
      { person_id: "PER-002", name: "Katrin", status: "aktiv" },
    ],
    konten: [
      { konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" },
    ],
    kategorien: [],
    transaktionen: [],
    transfers: [],
    regelzahlungen: [],
    immobilien: [],
    darlehen: [],
    vermoegenswerte: [],
    zeitwerte: [],
  };
}

test("gültige Immobilie mit Bruch-Anteilen Summe 1 ist valide", () => {
  const data = basis();
  data.immobilien.push({
    immobilie_id: "IMM-001",
    bezeichnung: "EFH",
    eigentumsanteile: [
      { person_id: "PER-001", zaehler: 2, nenner: 3 },
      { person_id: "PER-002", zaehler: 1, nenner: 3 },
    ],
    status: "aktiv",
  });
  const result = validateMasterData(data);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("Eigentumsanteile mit Summe != 1 ist Fehler", () => {
  const data = basis();
  data.immobilien.push({
    immobilie_id: "IMM-001",
    bezeichnung: "EFH",
    eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 3 }],
    status: "aktiv",
  });
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("eigentumsanteile") && e.includes("Summe")));
});

test("Eigentumsanteil mit unbekannter person_id ist Fehler", () => {
  const data = basis();
  data.immobilien.push({
    immobilie_id: "IMM-001",
    bezeichnung: "EFH",
    eigentumsanteile: [{ person_id: "PER-999", zaehler: 1, nenner: 1 }],
    status: "aktiv",
  });
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("PER-999")));
});

test("Darlehen mit kaputter immobilie_id/konto_id ist Fehler", () => {
  const data = basis();
  data.darlehen.push({
    darlehen_id: "DAR-001", bezeichnung: "Hyp", status: "aktiv",
    anfangsbetrag: "300000.00", anfangsdatum: "2020-01-01", zinssatz: "1.85",
    sollrate: "1200.00", rhythmus_einheit: "monat", rhythmus_intervall: 1,
    immobilie_id: "IMM-404", konto_id: "KTO-404",
  });
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("IMM-404")));
  assert.ok(result.errors.some((e) => e.includes("KTO-404")));
});

test("Zeitwert mit kaputter entitaet_id ist Fehler", () => {
  const data = basis();
  data.zeitwerte.push({
    entitaet: "konto", entitaet_id: "KTO-404", feld: "kontostand",
    wert: "1000.00", standdatum: "2026-01-01", qualitaet: "belegt",
  });
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("KTO-404")));
});

test("Regelzahlung mit kaputter darlehen_id ist Fehler", () => {
  const data = basis();
  data.regelzahlungen.push({
    regelzahlung_id: "RZ-001", bezeichnung: "Rate", betrag: "-1200.00",
    rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01",
    status: "bestaetigt", erstellt_am: "2026-01-01", darlehen_id: "DAR-404",
  });
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("DAR-404")));
});

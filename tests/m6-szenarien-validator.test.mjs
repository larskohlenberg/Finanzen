import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMasterData } from "../app/tools/validate-core.mjs";

function basis(annahmen = [], extra = {}) {
  return {
    personen: [{ person_id: "PER-001", name: "Person A", status: "aktiv" }],
    konten: [
      { konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" },
      { konto_id: "KTO-006", name: "Depot", kontotyp: "depot", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" },
    ],
    kategorien: [{ kategorie_id: "KAT-001", name: "Wohnen", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" }],
    transaktionen: [],
    transfers: [],
    darlehen: [{ darlehen_id: "DAR-001", bezeichnung: "Hyp", status: "aktiv", anfangsbetrag: "300000.00", anfangsdatum: "2020-01-31", zinssatz: "1.80", sollrate: "800.00", rhythmus_einheit: "monat", rhythmus_intervall: 1 }],
    immobilien: [{ immobilie_id: "IMM-001", bezeichnung: "EFH", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }], status: "aktiv" }],
    vermoegenswerte: [{ vermoegenswert_id: "VMW-001", typ: "edelmetall", bezeichnung: "Gold", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }], status: "aktiv" }],
    zeitwerte: [],
    szenarien: [{ szenario_id: "SZN-001", name: "Test", status: "entwurf", stand: "2026-06-01", reichweite_bis: "2030-01-01", erstellt_am: "2026-06-01", annahmen, ...extra }],
  };
}

test("gültiges Szenario mit Einmalzahlung ist valide", () => {
  const data = basis([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2027-01-01", betrag: "20000.00" }]);
  assert.deepEqual(validateMasterData(data).errors, []);
});

test("reichweite_bis vor stand ist Fehler", () => {
  const data = basis([], { reichweite_bis: "2025-01-01" });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("reichweite_bis")));
});

test("doppelte annahme_id im Szenario ist Fehler", () => {
  const data = basis([
    { annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2027-01-01", betrag: "10.00" },
    { annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2027-02-01", betrag: "10.00" },
  ]);
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("annahme_id")));
});

test("gegenbuchung mit unbekannter ziel_id ist Fehler", () => {
  const data = basis([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2027-01-01", betrag: "-5000.00", gegenbuchung: { ziel_typ: "darlehen", ziel_id: "DAR-999" } }]);
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("DAR-999")));
});

test("gegenbuchung darf nicht zugleich ziel_id und neue_position haben", () => {
  const data = basis([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2027-01-01", betrag: "-5000.00", gegenbuchung: { ziel_typ: "immobilie", ziel_id: "IMM-001", neue_position: { bezeichnung: "X", wert: "1.00" } } }]);
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("gegenbuchung")));
});

test("depot-gegenbuchung mit Nicht-Depot-Konto ist Fehler", () => {
  const data = basis([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2027-01-01", betrag: "5000.00", gegenbuchung: { ziel_typ: "depot", ziel_id: "KTO-001" } }]);
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("Depot")));
});

test("regelzahlung-neu mit gegenbuchung(immobilie) ist Fehler", () => {
  const data = basis([{ annahme_id: "A1", art: "regelzahlung-neu", qualitaet: "geschaetzt", ab: "2027-01-01", betrag: "-100.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, gegenbuchung: { ziel_typ: "immobilie", ziel_id: "IMM-001" } }]);
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("wiederkehrend")));
});

test("einmalzahlung ohne Betrag und ohne gegenbuchung ist Fehler", () => {
  const data = basis([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2027-01-01", betrag: "0.00" }]);
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("wirkungslos")));
});

test("doppelter Verkauf derselben Position ist Fehler", () => {
  const data = basis([
    { annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2027-01-01", betrag: "400000.00", gegenbuchung: { ziel_typ: "immobilie", ziel_id: "IMM-001" } },
    { annahme_id: "A2", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2028-01-01", betrag: "400000.00", gegenbuchung: { ziel_typ: "immobilie", ziel_id: "IMM-001" } },
  ]);
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("IMM-001")));
});

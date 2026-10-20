// Liquiditaetsverlauf: belegte Monate (Anker vorwaerts) und modellierte
// (Rueckrechnung aus einem spaeteren Anker) sind unterscheidbar.
import assert from "node:assert/strict";
import test from "node:test";
import { liquiditaetVerlauf } from "../app/liquiditaet.mjs";

test("Monate vor dem ersten Anker sind modelliert, ab dem Anker belegt", () => {
  const data = {
    konten: [{ konto_id: "KTO-1", name: "Giro", kontotyp: "giro", liquiditaetsrelevant: true, status: "aktiv", inhaber_person_ids: [] }],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-1", feld: "kontostand", wert: "1000.00", standdatum: "2026-03-31", qualitaet: "belegt" }],
    transaktionen: [{ transaktion_id: "T1", konto_id: "KTO-1", buchungsdatum: "2026-02-10", betrag: "-100.00" }],
  };
  const verlauf = liquiditaetVerlauf(data, "2026-05-15", 4);
  assert.deepEqual(verlauf.map((p) => [p.monat, p.modelliert]), [["2026-02", true], ["2026-03", false], ["2026-04", false], ["2026-05", false]]);
});

test("Konto ganz ohne Anker macht den Verlauf nicht 'zurueckgerechnet'", () => {
  const data = {
    konten: [{ konto_id: "KTO-2", name: "Neu", kontotyp: "giro", liquiditaetsrelevant: true, status: "aktiv", inhaber_person_ids: [] }],
    zeitwerte: [],
    transaktionen: [],
  };
  assert.ok(liquiditaetVerlauf(data, "2026-05-15", 3).every((p) => p.modelliert === false));
});

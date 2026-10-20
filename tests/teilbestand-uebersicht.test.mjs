// Die Uebersicht bekommt je Vermoegensposition, ob ihr Wert fehlt (Chip
// "bekannter Teilbestand" in der Kachel).
import assert from "node:assert/strict";
import test from "node:test";
import { uebersichtModell } from "../app/uebersicht-modell.mjs";

test("Uebersicht-Modell: Positionen tragen fehlt", () => {
  const daten = {
    konten: [
      { konto_id: "KTO-1", name: "Giro", kontotyp: "giro", status: "aktiv", liquiditaetsrelevant: true, inhaber_person_ids: [] },
      { konto_id: "KTO-2", name: "Ohne Stand", kontotyp: "tagesgeld", status: "aktiv", liquiditaetsrelevant: true, inhaber_person_ids: [] },
    ],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-1", feld: "kontostand", wert: "100.00", standdatum: "2026-01-01", qualitaet: "belegt" }],
    transaktionen: [], kategorien: [], regelzahlungen: [], vorsorge: [], immobilien: [], darlehen: [], vermoegenswerte: [], personen: [], fristen: [],
  };
  const m = uebersichtModell(daten, "2026-05-01");
  const je = Object.fromEntries(m.vermoegen.positionen.map((p) => [p.id, p.fehlt]));
  assert.deepEqual(je, { "KTO-1": false, "KTO-2": true });
});

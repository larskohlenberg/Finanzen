import { test } from "node:test";
import assert from "node:assert/strict";
import { aktuellerZeitwert } from "../app/vermoegen.mjs";

const ZW = [
  { entitaet: "immobilie", entitaet_id: "IMM-001", feld: "marktwert", wert: "400000.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" },
  { entitaet: "immobilie", entitaet_id: "IMM-001", feld: "marktwert", wert: "999999.00", standdatum: "2030-01-01", qualitaet: "geschaetzt" },
];

test("aktuellerZeitwert mit bis-Cutoff ignoriert spätere Stände", () => {
  assert.equal(aktuellerZeitwert(ZW, "immobilie", "IMM-001", "marktwert", "2026-06-22").wert, "400000.00");
});

test("aktuellerZeitwert ohne bis nimmt den neuesten", () => {
  assert.equal(aktuellerZeitwert(ZW, "immobilie", "IMM-001", "marktwert").wert, "999999.00");
});

import { rechneSzenario } from "../app/szenarien.mjs";

function dataMitRz(rz = []) {
  return { konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    transaktionen: [], zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-06-22", qualitaet: "belegt" }],
    darlehen: [], immobilien: [], vermoegenswerte: [], regelzahlungen: rz };
}
const sz = (annahmen = [], reichweite_bis = "2026-12-31") => ({ szenario_id: "SZN-001", name: "T", status: "entwurf", stand: "2026-06-22", reichweite_bis, erstellt_am: "2026-06-22", annahmen });

test("Basis: nur bestätigte Regelzahlungen wirken (Miete -500/Monat, 6 Monate)", () => {
  const data = dataMitRz([{ regelzahlung_id: "RZ-001", bezeichnung: "Miete", betrag: "-500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-22", status: "bestaetigt", qualitaet: "belegt", erstellt_am: "2026-06-01" }]);
  const r = rechneSzenario(data, sz([]), "2026-06-22");
  const letzte = r.punkte[r.punkte.length - 1];
  assert.equal(letzte.liquide_cents, 100000 - 6 * 50000); // 1000 - 3000 = -2000
});

test("Vorgeschlagene Regelzahlung wirkt NICHT", () => {
  const data = dataMitRz([{ regelzahlung_id: "RZ-001", bezeichnung: "X", betrag: "-500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-22", status: "vorgeschlagen", qualitaet: "geschaetzt", erstellt_am: "2026-06-01" }]);
  const r = rechneSzenario(data, sz([]), "2026-06-22");
  assert.equal(r.punkte[r.punkte.length - 1].liquide_cents, 100000);
});

test("einmalzahlung (Cash-Bein) wirkt ab Datum", () => {
  const data = dataMitRz([]);
  const r = rechneSzenario(data, sz([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2026-08-15", betrag: "2000.00" }]), "2026-06-22");
  assert.equal(r.punkte[r.punkte.length - 1].liquide_cents, 100000 + 200000);
});

test("regelzahlung-aenderung beenden stoppt die Regelzahlung", () => {
  const data = dataMitRz([{ regelzahlung_id: "RZ-001", bezeichnung: "Miete", betrag: "-500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-22", status: "bestaetigt", qualitaet: "belegt", erstellt_am: "2026-06-01" }]);
  const r = rechneSzenario(data, sz([{ annahme_id: "A1", art: "regelzahlung-aenderung", qualitaet: "geschaetzt", regelzahlung_id: "RZ-001", ab: "2026-09-01", aktion: "beenden" }]), "2026-06-22");
  // Juli + August = 2 x -500 = -1000
  assert.equal(r.punkte[r.punkte.length - 1].liquide_cents, 100000 - 100000);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { rechneSzenario } from "../app/szenarien.mjs";

const TODAY = "2026-06-28";

function baseData(extra = {}) {
  return {
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", status: "aktiv", liquiditaetsrelevant: true }],
    immobilien: [],
    vermoegenswerte: [],
    darlehen: [],
    regelzahlungen: [],
    transaktionen: [],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "5000.00", standdatum: "2026-06-01", qualitaet: "belegt" }],
    vorsorge: [],
    ...extra,
  };
}

test("kapitalbildende Vorsorge erhoeht das Netto im Szenario (eingefroren)", () => {
  const data = baseData({
    vorsorge: [{ vorsorge_id: "VS-003", art: "riester", name: "Riester", person_id: "PER-001", status: "aktiv", kapitalbildend: true }],
  });
  data.zeitwerte.push({ entitaet: "vorsorge", entitaet_id: "VS-003", feld: "rueckkaufswert", wert: "9100.00", standdatum: "2026-01-01", qualitaet: "belegt" });
  const szn = { szenario_id: "SZN-001", name: "Basis", status: "entwurf", stand: TODAY, reichweite_bis: "2028-12-31", erstellt_am: TODAY, annahmen: [] };
  const r = rechneSzenario(data, szn, TODAY);
  // erster Monatspunkt enthaelt den eingefrorenen Rueckkaufswert in sachwerte_cents
  assert.equal(r.punkte[0].sachwerte_cents, 910000);
});

test("Kapitalauszahlung (gegenbuchung vorsorge) baut Rueckkaufswert ab, Cash steigt", () => {
  const data = baseData({
    vorsorge: [{ vorsorge_id: "VS-003", art: "lebensversicherung", name: "LV", person_id: "PER-001", status: "aktiv", kapitalbildend: true }],
  });
  data.zeitwerte.push({ entitaet: "vorsorge", entitaet_id: "VS-003", feld: "rueckkaufswert", wert: "9100.00", standdatum: "2026-01-01", qualitaet: "belegt" });
  const szn = { szenario_id: "SZN-002", name: "Kapital", status: "entwurf", stand: TODAY, reichweite_bis: "2028-12-31", erstellt_am: TODAY,
    annahmen: [{ annahme_id: "A1", art: "einmalzahlung", datum: "2027-01-15", betrag: "9100.00", qualitaet: "belegt", gegenbuchung: { ziel_typ: "vorsorge", ziel_id: "VS-003" } }] };
  const r = rechneSzenario(data, szn, TODAY);
  const letzter = r.punkte[r.punkte.length - 1];
  // Umschichtung: Aktivum (sachwerte) weg, Cash entsprechend hoeher -> netto ~ unveraendert
  assert.equal(letzter.sachwerte_cents, 0);
  assert.equal(letzter.liquide_cents, 500000 + 910000); // Startsaldo 5000 + 9100 Kapital
});

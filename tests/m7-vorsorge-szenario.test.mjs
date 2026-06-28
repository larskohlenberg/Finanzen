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

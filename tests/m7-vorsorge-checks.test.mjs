import { test } from "node:test";
import assert from "node:assert/strict";
import { computeVermoegenChecks } from "../app/vermoegen.mjs";

const TODAY = "2026-06-28";
const base = { konten: [], immobilien: [], vermoegenswerte: [], darlehen: [], transaktionen: [], regelzahlungen: [] };

test("vorsorge-ungeprueft feuert ohne geprueft_am", () => {
  const checks = computeVermoegenChecks({
    ...base,
    vorsorge: [{ vorsorge_id: "VS-006", art: "betriebsrente", name: "bAV Lena", person_id: "PER-001", status: "geplant", kapitalbildend: false }],
    zeitwerte: [{ entitaet: "vorsorge", entitaet_id: "VS-006", feld: "erwartete_rente", wert: "240.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" }],
  }, TODAY);
  assert.ok(checks.some((c) => c.art === "vorsorge-ungeprueft" && c.entitaet_id === "VS-006"));
});

test("vorsorge-ungeprueft verschwindet mit geprueft_am", () => {
  const checks = computeVermoegenChecks({
    ...base,
    vorsorge: [{ vorsorge_id: "VS-006", art: "betriebsrente", name: "bAV", person_id: "PER-001", status: "geplant", kapitalbildend: false, geprueft_am: "2026-03-01" }],
    zeitwerte: [{ entitaet: "vorsorge", entitaet_id: "VS-006", feld: "erwartete_rente", wert: "240.00", standdatum: "2026-03-01", qualitaet: "geschaetzt" }],
  }, TODAY);
  assert.ok(!checks.some((c) => c.art === "vorsorge-ungeprueft"));
});

test("vorsorge-wiedervorlage feuert bei alter Pruefung", () => {
  const checks = computeVermoegenChecks({
    ...base,
    vorsorge: [{ vorsorge_id: "VS-001", art: "gesetzliche-rente", name: "GRV", person_id: "PER-001", status: "geplant", kapitalbildend: false, geprueft_am: "2024-01-01" }],
    zeitwerte: [{ entitaet: "vorsorge", entitaet_id: "VS-001", feld: "erwartete_rente", wert: "1480.00", standdatum: "2024-01-01", qualitaet: "geschaetzt" }],
  }, TODAY);
  assert.ok(checks.some((c) => c.art === "vorsorge-wiedervorlage" && c.entitaet_id === "VS-001"));
});

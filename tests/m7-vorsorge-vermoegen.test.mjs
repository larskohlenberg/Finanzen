import { test } from "node:test";
import assert from "node:assert/strict";
import { computeNettovermoegen } from "../app/vermoegen.mjs";

const TODAY = "2026-06-28";

function data(vorsorge, zeitwerte = []) {
  return { konten: [], immobilien: [], vermoegenswerte: [], darlehen: [], transaktionen: [], vorsorge, zeitwerte };
}

test("kapitalbildende Vorsorge mit Rueckkaufswert zaehlt als Aktivum", () => {
  const r = computeNettovermoegen(data(
    [{ vorsorge_id: "VS-003", art: "riester", name: "Riester Lena", person_id: "PER-001", status: "aktiv", kapitalbildend: true }],
    [{ entitaet: "vorsorge", entitaet_id: "VS-003", feld: "rueckkaufswert", wert: "9100.00", standdatum: "2026-01-01", qualitaet: "belegt" }],
  ), TODAY);
  assert.equal(r.aktiva_cents, 910000);
  assert.ok(r.positionen.some((p) => p.klasse === "vorsorge" && p.wert_cents === 910000 && p.fehlt === false));
});

test("kapitalbildende Vorsorge ohne Zeitwert ist sichtbare Luecke", () => {
  const r = computeNettovermoegen(data(
    [{ vorsorge_id: "VS-003", art: "riester", name: "Riester", person_id: "PER-001", status: "aktiv", kapitalbildend: true }],
  ), TODAY);
  assert.equal(r.aktiva_cents, 0);
  const p = r.positionen.find((p) => p.klasse === "vorsorge");
  assert.equal(p.fehlt, true);
  assert.equal(r.qualitaet.gesamt, "offen");
});

test("gesetzliche Rente (!kapitalbildend) erzeugt NIE eine Position", () => {
  const r = computeNettovermoegen(data(
    [{ vorsorge_id: "VS-001", art: "gesetzliche-rente", name: "GRV Lena", person_id: "PER-001", status: "geplant", kapitalbildend: false }],
    [{ entitaet: "vorsorge", entitaet_id: "VS-001", feld: "erwartete_rente", wert: "1480.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" }],
  ), TODAY);
  assert.equal(r.positionen.filter((p) => p.klasse === "vorsorge").length, 0);
  assert.equal(r.aktiva_cents, 0);
});

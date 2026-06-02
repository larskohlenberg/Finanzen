import { test } from "node:test";
import assert from "node:assert/strict";
import { addInterval, occurrences, computeCashflowIst } from "../app/cashflow.mjs";

test("addInterval addiert Tage", () => {
  assert.equal(addInterval("2026-01-30", "tag", 5), "2026-02-04");
});

test("addInterval addiert Wochen", () => {
  assert.equal(addInterval("2026-01-01", "woche", 2), "2026-01-15");
});

test("addInterval addiert Monate mit Monatsende-Clamping", () => {
  assert.equal(addInterval("2026-01-31", "monat", 1), "2026-02-28");
  assert.equal(addInterval("2026-01-31", "monat", 3), "2026-04-30");
});

test("addInterval addiert Jahre und clampt Schaltjahr", () => {
  assert.equal(addInterval("2024-02-29", "jahr", 1), "2025-02-28");
});

test("occurrences liefert nur Fälligkeiten nach heute bis Horizont", () => {
  const rz = { anker_datum: "2026-01-01", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  const result = occurrences(rz, "2026-03-15", "2026-06-30");
  assert.deepEqual(result, ["2026-04-01", "2026-05-01", "2026-06-01"]);
});

test("occurrences stoppt an aktiv_bis (24-Monate-Vertrag)", () => {
  const rz = { anker_datum: "2025-07-01", aktiv_bis: "2027-07-01", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  const result = occurrences(rz, "2027-04-15", "2030-12-31");
  assert.deepEqual(result, ["2027-05-01", "2027-06-01", "2027-07-01"]);
});

test("computeCashflowIst summiert je Monat, ohne Transfers, bis heute", () => {
  const tx = [
    { buchungsdatum: "2026-04-01", betrag: "3500.00", ist_transfer: false, kategorisierung_status: "bestaetigt" },
    { buchungsdatum: "2026-04-10", betrag: "-1200.00", ist_transfer: false, kategorisierung_status: "bestaetigt" },
    { buchungsdatum: "2026-04-12", betrag: "-500.00", ist_transfer: true, kategorisierung_status: "bestaetigt" },
    { buchungsdatum: "2026-05-02", betrag: "-80.00", ist_transfer: false, kategorisierung_status: "offen" },
    { buchungsdatum: "2026-07-01", betrag: "-50.00", ist_transfer: false, kategorisierung_status: "bestaetigt" },
  ];
  const result = computeCashflowIst(tx, { today: "2026-05-31" });
  assert.deepEqual(result.monate, [
    { monat: "2026-04", netto_cents: 230000 },
    { monat: "2026-05", netto_cents: -8000 },
  ]);
  assert.equal(result.gesamt_netto_cents, 222000);
  assert.equal(result.qualitaet.gesamt_anzahl, 3);
  assert.equal(result.qualitaet.offene_kategorie_anzahl, 1);
});

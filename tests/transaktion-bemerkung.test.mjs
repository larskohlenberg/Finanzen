import assert from "node:assert/strict";
import { test } from "node:test";
import { aktualisiereImmobilienbezug } from "../app/tools/transaktion-immobilie.mjs";
import { abfragen } from "../app/mcp/abfrage.mjs";

const immobilien = [{ immobilie_id: "IMM-001" }];
const tx = (id, over = {}) => ({
  transaktion_id: id,
  konto_id: "KTO-001",
  buchungsdatum: "2026-01-01",
  betrag: "-10.00",
  gegenpartei: "Testfirma",
  verwendungszweck: "Test",
  kategorisierung_status: "bestaetigt",
  ist_transfer: false,
  ...over,
});

test("Bemerkung allein setzen, Immobilienbezug bleibt", () => {
  const out = aktualisiereImmobilienbezug({
    transaktionen: [tx("TXN-A", { immobilie_id: "IMM-001" }), tx("TXN-B")],
    immobilien,
    ids: ["TXN-A"],
    bemerkung: "  Fenster Obergeschoss  ",
  });
  assert.equal(out.blockiert, false);
  assert.equal(out.transaktionen[0].bemerkung, "Fenster Obergeschoss");
  assert.equal(out.transaktionen[0].immobilie_id, "IMM-001");
  assert.equal(out.transaktionen[1].bemerkung, undefined);
  assert.equal(out.report.bemerkungen_gesetzt, 1);
  assert.equal(out.report.gesetzt, 0);
});

test("Bemerkung zusammen mit Immobilienbezug setzen", () => {
  const out = aktualisiereImmobilienbezug({
    transaktionen: [tx("TXN-A")],
    immobilien,
    ids: ["TXN-A"],
    immobilieId: "IMM-001",
    bemerkung: "Heizungswartung",
  });
  assert.deepEqual(
    [out.transaktionen[0].immobilie_id, out.transaktionen[0].bemerkung],
    ["IMM-001", "Heizungswartung"],
  );
  assert.equal(out.report.gesetzt, 1);
  assert.equal(out.report.bemerkungen_gesetzt, 1);
});

test("leere Bemerkung entfernt das Feld, gleiche Bemerkung ist unveraendert", () => {
  const original = tx("TXN-A", { bemerkung: "alt" });
  const weg = aktualisiereImmobilienbezug({ transaktionen: [original], immobilien, ids: ["TXN-A"], bemerkung: "" });
  assert.equal(Object.hasOwn(weg.transaktionen[0], "bemerkung"), false);
  assert.equal(weg.report.bemerkungen_entfernt, 1);
  const gleich = aktualisiereImmobilienbezug({ transaktionen: [original], immobilien, ids: ["TXN-A"], bemerkung: "alt" });
  assert.equal(gleich.transaktionen[0], original);
  assert.equal(gleich.report.unveraendert, 1);
});

test("ohne Aktion ist ein Fehler, Bericht ohne Bemerkung bleibt wie bisher", () => {
  assert.throws(
    () => aktualisiereImmobilienbezug({ transaktionen: [tx("TXN-A")], immobilien, ids: ["TXN-A"] }),
    /Aktion/,
  );
  const out = aktualisiereImmobilienbezug({ transaktionen: [tx("TXN-A")], immobilien, ids: ["TXN-A"], immobilieId: "IMM-001" });
  assert.equal(Object.hasOwn(out.report, "bemerkungen_gesetzt"), false);
});

test("Abfrage filtert nach Immobilie und findet Text in der Bemerkung", () => {
  const liste = [
    tx("TXN-A", { immobilie_id: "IMM-001", bemerkung: "Dachrinne" }),
    tx("TXN-B", { immobilie_id: "IMM-002" }),
    tx("TXN-C"),
  ];
  assert.deepEqual(abfragen(liste, { immobilie: "IMM-001" }).zeilen.map((t) => t.transaktion_id), ["TXN-A"]);
  assert.deepEqual(abfragen(liste, { text: "dachrinne" }).zeilen.map((t) => t.transaktion_id), ["TXN-A"]);
});

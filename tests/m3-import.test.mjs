// tests/m3-import.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { runImport } from "../app/tools/import.mjs";

const konten = [
  { konto_id: "KTO-001", kontoreferenz: "DE..1175" },
  { konto_id: "KTO-004" },
];
const kategorien = [{ kategorie_id: "KAT-003" }, { kategorie_id: "KAT-011" }];
const regeln = [
  { regel_id: "REG-001", gegenpartei_pattern: "edeka", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-06-01" },
];

function entry(konto, datum, betrag, gegenpartei, zweck, extra = {}) {
  return { konto_id: konto, buchungsdatum: datum, betrag, gegenpartei, verwendungszweck: zweck, rohquelle: "data/inbox/test.csv", ...extra };
}

test("schreibt gueltige Buchung mit Regel-Kategorie", () => {
  const out = runImport({
    entries: [entry("KTO-001", "2026-05-20", "-42.80", "EDEKA Mitte", "Einkauf")],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: [], transfers: [],
  });
  assert.equal(out.result.written.length, 1);
  assert.equal(out.transaktionen.length, 1);
  const tx = out.transaktionen[0];
  assert.equal(tx.transaktion_id, "TXN-20260520-000001");
  assert.equal(tx.kategorie_id, "KAT-003");
  assert.equal(tx.kategorisierung_status, "vorgeschlagen");
  assert.equal(tx.ist_transfer, false);
  assert.ok(tx.dedupe_hash.length === 64);
  assert.equal(tx.rohquelle, "data/inbox/test.csv");
});

test("ohne Regel-Treffer bleibt Kategorie offen", () => {
  const out = runImport({
    entries: [entry("KTO-001", "2026-05-20", "-9.99", "Unbekannt", "x")],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: [], transfers: [],
  });
  assert.equal(out.transaktionen[0].kategorisierung_status, "offen");
  assert.equal(Object.hasOwn(out.transaktionen[0], "kategorie_id"), false);
});

test("ueberspringt bereits vorhandene Buchung per Hash", () => {
  const first = runImport({
    entries: [entry("KTO-001", "2026-05-20", "-42.80", "EDEKA", "Einkauf")],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: [], transfers: [],
  });
  const second = runImport({
    entries: [entry("KTO-001", "2026-05-20", "-42.80", "EDEKA", "Einkauf")],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: first.transaktionen, transfers: first.transfers,
  });
  assert.equal(second.result.written.length, 0);
  assert.equal(second.result.skipped_dedupe.length, 1);
  assert.equal(second.transaktionen.length, 1);
});

test("zeilenweise: kaputte Zeile blockiert saubere nicht", () => {
  const out = runImport({
    entries: [
      entry("KTO-001", "2026-05-20", "-42.80", "EDEKA", "Einkauf"),
      entry("KTO-099", "2026-05-20", "-1.00", "X", "y"),
      entry("KTO-001", "2026-05-21", "-5.00", "Kiosk", "z"),
    ],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: [], transfers: [],
  });
  assert.equal(out.result.written.length, 2);
  assert.equal(out.result.errors.length, 1);
  assert.equal(out.result.errors[0].row, 2);
  assert.match(out.result.errors[0].detail, /unbekannt/);
});

test("paart Transfer im selben Lauf", () => {
  const out = runImport({
    entries: [
      entry("KTO-001", "2026-05-05", "-500.00", "Umbuchung", "Sparen Mai"),
      entry("KTO-004", "2026-05-05", "500.00", "Umbuchung", "Sparen Mai"),
    ],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: [], transfers: [],
  });
  assert.equal(out.result.transfers_matched.length, 1);
  assert.equal(out.transfers.length, 1);
  assert.ok(out.transaktionen.every((tx) => tx.ist_transfer === true));
});

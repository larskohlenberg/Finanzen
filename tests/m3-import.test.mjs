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
  { regel_id: "REG-001", gegenpartei_pattern: "musterladena", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-06-01" },
];

function entry(konto, datum, betrag, gegenpartei, zweck, extra = {}) {
  return { konto_id: konto, buchungsdatum: datum, betrag, gegenpartei, verwendungszweck: zweck, rohquelle: "data/inbox/test.csv", ...extra };
}

test("schreibt gueltige Buchung mit Regel-Kategorie", () => {
  const out = runImport({
    entries: [entry("KTO-001", "2026-05-20", "-42.80", "MusterladenA Mitte", "Einkauf")],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: [], transfers: [],
  });
  assert.equal(out.result.written.length, 1);
  assert.equal(out.transaktionen.length, 1);
  const tx = out.transaktionen[0];
  assert.match(tx.transaktion_id, /^TXN-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(tx.kategorie_id, "KAT-003");
  assert.equal(tx.kategorisierung_status, "vorgeschlagen");
  assert.equal(tx.ist_transfer, false);
  assert.ok(tx.dedupe_hash.length === 64);
  assert.equal(tx.rohquelle, "data/inbox/test.csv");
});

test("uebernimmt optionale Bankdetails in die Transaktion", () => {
  const bankdetails = {
    bank_referenz: "BANK-REF-1",
    wertstellungsdatum: "2026-05-21",
    transaktionstyp: "SEPA-Ueberweisung",
    kundenreferenz: "KREF-123",
    empfaenger: "Muster GmbH",
    empfaenger_iban: "DE00111111111111111111",
    mandatsreferenz: "MANDAT-123",
    glaeubiger_id: "DE00ZZZ00000000000",
  };
  const out = runImport({
    entries: [entry("KTO-001", "2026-05-20", "-42.80", "MusterladenA Mitte", "Einkauf", bankdetails)],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: [], transfers: [],
  });

  assert.deepEqual(Object.fromEntries(Object.keys(bankdetails).map((key) => [key, out.transaktionen[0][key]])), bankdetails);
});

test("Import übernimmt die explizite Regelzahlungszuordnung", () => {
  const out = runImport({
    entries: [entry("KTO-001", "2026-05-20", "-162.00", "MusterversicherungA", "Riester", { regelzahlung_id: "RZ-001" })],
    konten,
    kategorien,
    kategorisierungsregeln: regeln,
    transaktionen: [],
    transfers: [],
    regelzahlungen: [{ regelzahlung_id: "RZ-001" }],
  });

  assert.equal(out.result.errors.length, 0);
  assert.equal(out.transaktionen[0].regelzahlung_id, "RZ-001");
});

test("ohne Regel-Treffer bleibt Kategorie offen", () => {
  const out = runImport({
    entries: [entry("KTO-001", "2026-05-20", "-9.99", "Unbekannt", "x")],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: [], transfers: [],
  });
  assert.equal(out.transaktionen[0].kategorisierung_status, "offen");
  assert.equal(Object.hasOwn(out.transaktionen[0], "kategorie_id"), false);
});

test("Regel-Treffer setzt kategorie_herkunft=regel", () => {
  const out = runImport({
    entries: [entry("KTO-001", "2026-05-20", "-42.80", "MusterladenA Mitte", "Einkauf")],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: [], transfers: [],
  });
  assert.equal(out.transaktionen[0].kategorie_id, "KAT-003");
  assert.equal(out.transaktionen[0].kategorie_herkunft, "regel");
});

test("ohne Regel-Treffer kein kategorie_herkunft", () => {
  const out = runImport({
    entries: [entry("KTO-001", "2026-05-20", "-9.99", "Unbekannt", "x")],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: [], transfers: [],
  });
  assert.equal(Object.hasOwn(out.transaktionen[0], "kategorie_herkunft"), false);
});

test("ueberspringt bereits vorhandene Buchung per Hash", () => {
  const first = runImport({
    entries: [entry("KTO-001", "2026-05-20", "-42.80", "MusterladenA", "Einkauf")],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: [], transfers: [],
  });
  const second = runImport({
    entries: [entry("KTO-001", "2026-05-20", "-42.80", "MusterladenA", "Einkauf")],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: first.transaktionen, transfers: first.transfers,
  });
  assert.equal(second.result.written.length, 0);
  assert.equal(second.result.skipped_dedupe.length, 1);
  assert.equal(second.transaktionen.length, 1);
});

test("zeilenweise: kaputte Zeile blockiert saubere nicht", () => {
  const out = runImport({
    entries: [
      entry("KTO-001", "2026-05-20", "-42.80", "MusterladenA", "Einkauf"),
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

test("Doppel-Import ist idempotent: 0 neu und Bestand byte-identisch", () => {
  // Invariante, nicht nur Eigenschaft des Dedupe-Hashs: derselbe Import zweimal
  // -> keine neuen Buchungen, alle als Duplikat erkannt, serialisierter Bestand
  // exakt gleich (so wie import.mjs ihn nach data/master schreibt).
  const entries = [
    entry("KTO-001", "2026-05-20", "-42.80", "MusterladenA Mitte", "Einkauf"),
    entry("KTO-001", "2026-05-21", "-9.99", "Unbekannt", "x"),
  ];
  const serialize = (txs) => txs.map((tx) => JSON.stringify(tx)).join("\n") + "\n";
  const first = runImport({ entries, konten, kategorien, kategorisierungsregeln: regeln, transaktionen: [], transfers: [] });
  const bestand = serialize(first.transaktionen);
  const second = runImport({ entries, konten, kategorien, kategorisierungsregeln: regeln, transaktionen: first.transaktionen, transfers: first.transfers });
  assert.equal(second.result.written.length, 0);
  assert.equal(second.result.skipped_dedupe.length, entries.length);
  assert.equal(serialize(second.transaktionen), bestand);
});

test("Import schreibt matched_regeln bei eindeutigem Regel-Treffer", () => {
  const out = runImport({
    entries: [entry("KTO-001", "2026-05-20", "-42.80", "MusterladenA Mitte", "Einkauf")],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: [], transfers: [],
  });
  const tx = out.transaktionen[0];
  assert.deepEqual(tx.matched_regeln, ["REG-001"]);
  assert.equal(tx.kategorie_herkunft, "regel");
});

test("Import schreibt matched_regeln auch bei Regel-Konflikt (offen)", () => {
  const konflikRegeln = [
    { regel_id: "REG-010", gegenpartei_pattern: "konflikt", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-06-01" },
    { regel_id: "REG-011", gegenpartei_pattern: "konflikt", kategorie_id: "KAT-011", status: "aktiv", erstellt_am: "2026-06-01" },
  ];
  const out = runImport({
    entries: [entry("KTO-001", "2026-05-20", "-15.00", "Konflikt GmbH", "Rechnung")],
    konten, kategorien, kategorisierungsregeln: konflikRegeln, transaktionen: [], transfers: [],
  });
  const tx = out.transaktionen[0];
  assert.equal(tx.kategorisierung_status, "offen");
  assert.equal(Object.hasOwn(tx, "kategorie_id"), false);
  assert.deepEqual([...tx.matched_regeln].sort(), ["REG-010", "REG-011"]);
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

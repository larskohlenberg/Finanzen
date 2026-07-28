// tests/m3-transfer-matcher.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { matchTransfers } from "../app/tools/transfer-matcher.mjs";

function tx(id, konto, datum, betrag, zweck) {
  return { transaktion_id: id, konto_id: konto, buchungsdatum: datum, betrag, verwendungszweck: zweck, ist_transfer: false };
}

test("paart gegenlaeufige Buchungen mit gleichem Zweck", () => {
  const transaktionen = [
    tx("TXN-20260505-000001", "KTO-001", "2026-05-05", "-500.00", "Sparen Mai"),
    tx("TXN-20260506-000002", "KTO-004", "2026-05-06", "500.00", "Sparen Mai"),
  ];
  const { transfers, matched } = matchTransfers(transaktionen, []);
  assert.equal(matched.length, 1);
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0].typ, "intern");
  assert.equal(transfers[0].betrag, "500.00");
  assert.equal(transfers[0].abgang_transaktion_id, "TXN-20260505-000001");
  assert.equal(transfers[0].zugang_transaktion_id, "TXN-20260506-000002");
  assert.equal(transaktionen[0].ist_transfer, true);
  assert.equal(transaktionen[0].transfer_id, transfers[0].transfer_id);
  assert.equal(transaktionen[1].transfer_id, transfers[0].transfer_id);
});

test("paart nicht bei unterschiedlichem Verwendungszweck", () => {
  const transaktionen = [
    tx("TXN-20260505-000001", "KTO-001", "2026-05-05", "-500.00", "Sparen"),
    tx("TXN-20260506-000002", "KTO-004", "2026-05-06", "500.00", "Etwas anderes"),
  ];
  const { matched } = matchTransfers(transaktionen, []);
  assert.equal(matched.length, 0);
});

test("paart nicht bei Datumsdifferenz groesser 3 Tage", () => {
  const transaktionen = [
    tx("TXN-20260501-000001", "KTO-001", "2026-05-01", "-500.00", "Sparen"),
    tx("TXN-20260510-000002", "KTO-004", "2026-05-10", "500.00", "Sparen"),
  ];
  assert.equal(matchTransfers(transaktionen, []).matched.length, 0);
});

test("paart nicht innerhalb desselben Kontos", () => {
  const transaktionen = [
    tx("TXN-20260505-000001", "KTO-001", "2026-05-05", "-500.00", "Sparen"),
    tx("TXN-20260505-000002", "KTO-001", "2026-05-05", "500.00", "Sparen"),
  ];
  assert.equal(matchTransfers(transaktionen, []).matched.length, 0);
});

test("ignoriert bereits gepaarte Transaktionen", () => {
  const transaktionen = [
    { ...tx("TXN-20260505-000001", "KTO-001", "2026-05-05", "-500.00", "Sparen"), ist_transfer: true, transfer_id: "TRF-20260505-001" },
    tx("TXN-20260506-000002", "KTO-004", "2026-05-06", "500.00", "Sparen"),
  ];
  assert.equal(matchTransfers(transaktionen, []).matched.length, 0);
});

// --- IBAN-Kopplung als zweiter Weg zum Auto-Match --------------------------
// Zwei Banken formatieren den Verwendungszweck verschieden (die eine haengt
// Name/BIC/IBAN an, die andere schreibt nur "UEbertrag"). Das Textkriterium
// kann dann systematisch nie greifen. Traegt eine Seite die IBAN des
// Gegenkontos, ist das ein strukturell staerkeres Signal als gleicher Freitext.

const konten = [
  { konto_id: "KTO-001", kontoreferenz: "DE11110000000000000011" },
  { konto_id: "KTO-002", kontoreferenz: "DE22220000000000000022" },
];

test("paart ueber die IBAN-Kopplung, auch wenn der Verwendungszweck abweicht", () => {
  const transaktionen = [
    { ...tx("TXN-20260601-000001", "KTO-002", "2026-06-01", "-2000.00", "Uebertrag Erika Mustermann BIC: BYLADEM1001 IBAN: DE11110000000000000011"), empfaenger_iban: "DE11110000000000000011" },
    tx("TXN-20260602-000002", "KTO-001", "2026-06-02", "2000.00", "UEbertrag"),
  ];
  const { transfers, matched } = matchTransfers(transaktionen, [], konten);
  assert.equal(matched.length, 1);
  assert.equal(transfers[0].abgang_transaktion_id, "TXN-20260601-000001");
  assert.equal(transfers[0].zugang_transaktion_id, "TXN-20260602-000002");
  assert.equal(transaktionen[0].ist_transfer, true);
  assert.equal(transaktionen[1].ist_transfer, true);
});

test("IBAN-Vergleich ignoriert Leerzeichen und Gross-/Kleinschreibung", () => {
  const transaktionen = [
    { ...tx("TXN-20260601-000001", "KTO-002", "2026-06-01", "-100.00", "egal"), empfaenger_iban: "de11 1100 0000 0000 0000 11" },
    tx("TXN-20260602-000002", "KTO-001", "2026-06-02", "100.00", "anders"),
  ];
  assert.equal(matchTransfers(transaktionen, [], konten).matched.length, 1);
});

test("paart nicht, wenn die IBAN auf ein Konto ausserhalb des Modells zeigt", () => {
  const transaktionen = [
    { ...tx("TXN-20260601-000001", "KTO-002", "2026-06-01", "-100.00", "Miete"), empfaenger_iban: "DE00999999999999999999" },
    tx("TXN-20260602-000002", "KTO-001", "2026-06-02", "100.00", "Etwas anderes"),
  ];
  assert.equal(matchTransfers(transaktionen, [], konten).matched.length, 0);
});

test("ohne Konten-Liste bleibt das alte Textverhalten unveraendert", () => {
  const transaktionen = [
    { ...tx("TXN-20260601-000001", "KTO-002", "2026-06-01", "-100.00", "Uebertrag mit IBAN"), empfaenger_iban: "DE11110000000000000011" },
    tx("TXN-20260602-000002", "KTO-001", "2026-06-02", "100.00", "UEbertrag"),
  ];
  assert.equal(matchTransfers(transaktionen, []).matched.length, 0);
});

test("zwei gleich hohe Uebertraege im selben Fenster werden paarweise zugeordnet", () => {
  // Der greedy Lauf muss die N-zu-N-Situation sauber aufloesen und darf keine
  // Buchung zweimal verbrauchen.
  const transaktionen = [
    { ...tx("TXN-20260601-000001", "KTO-002", "2026-06-01", "-500.00", "a"), empfaenger_iban: "DE11110000000000000011" },
    { ...tx("TXN-20260601-000002", "KTO-002", "2026-06-01", "-500.00", "b"), empfaenger_iban: "DE11110000000000000011" },
    tx("TXN-20260602-000003", "KTO-001", "2026-06-02", "500.00", "c"),
    tx("TXN-20260602-000004", "KTO-001", "2026-06-02", "500.00", "d"),
  ];
  const { matched } = matchTransfers(transaktionen, [], konten);
  assert.equal(matched.length, 2);
  assert.equal(new Set(transaktionen.map((t) => t.transfer_id)).size, 2, "jede Buchung genau einem Transfer");
  assert.ok(transaktionen.every((t) => t.ist_transfer === true));
});

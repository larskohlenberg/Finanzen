// tests/m3-transfer-matcher.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { matchTransfers } from "../tools/transfer-matcher.mjs";

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

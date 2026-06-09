// tests/m3-ids.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { nextTransaktionId, nextTransferId } from "../app/tools/ids.mjs";

test("erste Transaktion eines Tages bekommt 000001", () => {
  assert.equal(nextTransaktionId("2026-05-20", new Set()), "TXN-20260520-000001");
});

test("naechste Transaktion zaehlt hoch", () => {
  const ids = new Set(["TXN-20260520-000001", "TXN-20260520-000002", "TXN-20260519-000009"]);
  assert.equal(nextTransaktionId("2026-05-20", ids), "TXN-20260520-000003");
});

test("anderer Tag startet wieder bei 000001", () => {
  const ids = new Set(["TXN-20260520-000005"]);
  assert.equal(nextTransaktionId("2026-05-21", ids), "TXN-20260521-000001");
});

test("transfer-id zaehlt dreistellig pro Tag", () => {
  assert.equal(nextTransferId("2026-05-05", new Set()), "TRF-20260505-001");
  assert.equal(nextTransferId("2026-05-05", new Set(["TRF-20260505-001"])), "TRF-20260505-002");
});

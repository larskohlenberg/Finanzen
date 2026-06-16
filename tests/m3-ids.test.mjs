// tests/m3-ids.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { nextTransaktionId, nextTransferId } from "../app/tools/ids.mjs";

const TXN_ID = /^TXN-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TRF_ID = /^TRF-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("nextTransaktionId liefert eine opake UUID mit TXN-Praefix (kein Datum, keine Nummer)", () => {
  const id = nextTransaktionId(new Set());
  assert.match(id, TXN_ID);
});

test("nextTransaktionId vergibt eindeutige IDs und meidet Kollisionen", () => {
  const vorhanden = new Set();
  for (let i = 0; i < 200; i++) {
    const id = nextTransaktionId(vorhanden);
    assert.equal(vorhanden.has(id), false);
    vorhanden.add(id);
  }
  assert.equal(vorhanden.size, 200);
});

test("nextTransferId liefert eine opake UUID mit TRF-Praefix", () => {
  const a = nextTransferId(new Set());
  assert.match(a, TRF_ID);
  const b = nextTransferId(new Set([a]));
  assert.match(b, TRF_ID);
  assert.notEqual(a, b);
});

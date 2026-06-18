import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
  const cleanPath = String(path).replace(/^\.\//, "").replace(/\?.*$/, "");
  const body = readFileSync(new URL(`../app/${cleanPath}`, import.meta.url), "utf8");
  return {
    ok: true,
    json: async () => JSON.parse(body),
    text: async () => body,
  };
};
await import("../app/i18n.js");

const { regelWirkungAus } = await import("../app/selektoren.mjs");

test("regelWirkungAus zaehlt Treffer pro Regel und sammelt Transaktionen", () => {
  const txs = [
    { transaktion_id: "TXN-1", matched_regeln: ["REG-001"] },
    { transaktion_id: "TXN-2", matched_regeln: ["REG-001", "REG-002"] },
    { transaktion_id: "TXN-3" },
  ];
  const w = regelWirkungAus(txs);
  assert.equal(w.get("REG-001").anzahl, 2);
  assert.equal(w.get("REG-002").anzahl, 1);
  assert.deepEqual(w.get("REG-001").transaktionen.map((t) => t.transaktion_id), ["TXN-1", "TXN-2"]);
  assert.equal(w.has("REG-003"), false);
});

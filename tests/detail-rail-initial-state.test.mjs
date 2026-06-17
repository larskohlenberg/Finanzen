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

const runtime = await import("../app/runtime.mjs");
const transactionsView = await import("../app/views/transaktionen.mjs");
const vermoegenView = await import("../app/views/vermoegen.mjs");
const { state } = runtime;
const { renderTransactions } = transactionsView;
const { renderVermoegen } = vermoegenView;

function resetTransactionState() {
  state.selectedTransactionId = "";
  state.detailRailClosed = false;
  state.transactionPage = 1;
  state.transactionFilters = {
    account: "",
    status: "",
    category: "",
    transfer: "",
    search: "",
    timeMode: "none",
    dateFrom: "",
    dateTo: "",
    month: "",
    quarterYear: "",
    quarter: "1",
    year: "",
  };
}

function resetVermoegenState() {
  state.selectedVermoegenId = "";
  state.vermoegenDetailRailClosed = false;
  state.vermoegenRailMode = "position";
  state.vermoegenRailWide = false;
  state.vermoegenFilters = { klasse: "", qualitaet: "" };
}

test("transactions initial render has no selected row and no visible detail rail", () => {
  resetTransactionState();
  const html = renderTransactions();

  assert.equal(state.selectedTransactionId, "");
  assert.doesNotMatch(html, /transaction-row selected/);
  assert.doesNotMatch(html, /detail-panel/);
  assert.match(html, /layout-with-rail rail-closed/);
});

test("vermoegen initial render has no selected row and no visible detail rail", () => {
  resetVermoegenState();
  const html = renderVermoegen();

  assert.equal(state.selectedVermoegenId, "");
  assert.doesNotMatch(html, /clickable selected/);
  assert.doesNotMatch(html, /detail-panel/);
  assert.match(html, /layout-with-rail rail-closed/);
});

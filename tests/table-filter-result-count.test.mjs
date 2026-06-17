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
const vermoegen = await import("../app/vermoegen.mjs");
const liquiditaet = await import("../app/liquiditaet.mjs");
const { data, state } = runtime;
const { filteredTransactions, renderTransactions } = transactionsView;
const { renderVermoegen } = vermoegenView;
const { computeNettovermoegen } = vermoegen;
const { localTodayIso } = liquiditaet;

function resetTransactionFilters() {
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
  state.transactionPage = 1;
}

test("transactions show filtered hits out of total hits even without active filters", () => {
  resetTransactionFilters();
  const total = data.transaktionen.length;

  assert.match(renderTransactions(), new RegExp(`${total} von ${total} Treffer`));

  state.transactionFilters.search = data.transaktionen[0].transaktion_id;
  const filtered = filteredTransactions().length;
  assert.ok(filtered > 0);
  assert.match(renderTransactions(), new RegExp(`${filtered} von ${total} Treffer`));
});

test("vermoegen filter table shows filtered positions out of total positions", () => {
  state.vermoegenFilters = { klasse: "", qualitaet: "" };
  const positions = computeNettovermoegen(data, localTodayIso()).positionen;
  const total = positions.length;

  assert.match(renderVermoegen(), new RegExp(`${total} von ${total} Treffer`));

  state.vermoegenFilters = { klasse: "darlehen", qualitaet: "" };
  const filtered = positions.filter((position) => position.klasse === "darlehen").length;
  assert.match(renderVermoegen(), new RegExp(`${filtered} von ${total} Treffer`));
});

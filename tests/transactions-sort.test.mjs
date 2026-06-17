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
const { data, state, cents } = runtime;
const { filteredTransactions, renderTransactions } = transactionsView;

function withTransactionSort(sort, fn) {
  const previousSort = state.transactionSort;
  state.transactionSort = sort;
  try {
    fn();
  } finally {
    state.transactionSort = previousSort;
  }
}

test("transactions can be sorted by amount ascending", () => {
  withTransactionSort({ key: "amount", dir: "asc" }, () => {
    const rows = filteredTransactions();
    assert.ok(rows.length > 1);
    for (let index = 1; index < rows.length; index += 1) {
      assert.ok(cents(rows[index - 1].betrag) <= cents(rows[index].betrag));
    }
  });
});

test("transactions can be sorted by counterparty descending", () => {
  withTransactionSort({ key: "counterparty", dir: "desc" }, () => {
    const rows = filteredTransactions();
    assert.ok(rows.length > 1);
    for (let index = 1; index < rows.length; index += 1) {
      const previous = String(rows[index - 1].gegenpartei ?? "");
      const current = String(rows[index].gegenpartei ?? "");
      assert.ok(previous.localeCompare(current) >= 0);
    }
  });
});

test("transactions render sortable column headers", () => {
  withTransactionSort({ key: "category", dir: "asc" }, () => {
    const html = renderTransactions();
    for (const key of ["date", "account", "counterparty", "purpose", "amount", "category", "status", "transfer"]) {
      assert.match(html, new RegExp(`data-transaction-sort="${key}"`));
    }
    assert.match(html, /Kategorie ▲/);
    assert.match(html, new RegExp(data.kategorien[0].name));
  });
});

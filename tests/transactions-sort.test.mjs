import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { apiAbwarten, bestandAntwort, demoBuchungen } from "./hilfe-bestand.mjs";

// Die Lese-APIs rechnen ueber den Bestand der App (data), den die Tests aendern.
let appDaten = null;

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: (key) => (key === "finance-m2-data-mode" ? "demo" : null), setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
  const bestand = bestandAntwort(path, { daten: appDaten });
  if (bestand) return bestand;
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
appDaten = data;
// Buchungen hat nur der Server; data dient hier als sein Bestand.
Object.assign(data, demoBuchungen());
const { renderTransactions } = transactionsView;
const { filtereTransaktionen, sortiereTransaktionen } = await import("../app/transaktionen-abfrage.mjs");
// Wie der Server (GET /api/v1/transaktionen): gefiltert und sortiert ueber den Bestand.
const filteredTransactions = () => sortiereTransaktionen(filtereTransaktionen(data, state.transactionFilters), data, state.transactionSort, "Keine Kategorie");

async function withTransactionSort(sort, fn) {
  const previousSort = state.transactionSort;
  state.transactionSort = sort;
  try {
    await fn();
  } finally {
    state.transactionSort = previousSort;
  }
}

test("transactions can be sorted by amount ascending", async () => {
  await withTransactionSort({ key: "amount", dir: "asc" }, () => {
    const rows = filteredTransactions();
    assert.ok(rows.length > 1);
    for (let index = 1; index < rows.length; index += 1) {
      assert.ok(cents(rows[index - 1].betrag) <= cents(rows[index].betrag));
    }
  });
});

test("transactions can be sorted by counterparty descending", async () => {
  await withTransactionSort({ key: "counterparty", dir: "desc" }, () => {
    const rows = filteredTransactions();
    assert.ok(rows.length > 1);
    for (let index = 1; index < rows.length; index += 1) {
      const previous = String(rows[index - 1].gegenpartei ?? "");
      const current = String(rows[index].gegenpartei ?? "");
      assert.ok(previous.localeCompare(current, "de") >= 0);
    }
  });
});

test("transactions render sortable column headers", async () => {
  await withTransactionSort({ key: "category", dir: "asc" }, async () => {
    renderTransactions();
    await apiAbwarten();
    const html = renderTransactions();
    for (const key of ["date", "account", "counterparty", "purpose", "amount", "category"]) {
      assert.match(html, new RegExp(`data-transaction-sort="${key}"`));
    }
    assert.doesNotMatch(html, /data-transaction-sort="(status|transfer)"/);
    assert.match(html, /Kategorie ▲/);
    assert.match(html, new RegExp(data.kategorien[0].name));
  });
});

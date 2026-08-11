import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appListeners = new Map();
const app = {
  innerHTML: "",
  classList: { toggle: () => {} },
  addEventListener(type, listener) {
    const listeners = appListeners.get(type) ?? [];
    listeners.push(listener);
    appListeners.set(type, listeners);
  },
  contains: () => false,
  querySelector: () => null,
  querySelectorAll: () => [],
};

globalThis.document = {
  activeElement: null,
  body: {},
  documentElement: { dataset: {}, lang: "" },
  querySelector: (selector) => selector === "#app" ? app : null,
};
document.activeElement = document.body;
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
globalThis.location = { hash: "" };
globalThis.history = { pushState: () => {}, replaceState: () => {} };
globalThis.CSS = { escape: (value) => String(value) };
globalThis.scrollX = 0;
globalThis.scrollY = 0;
globalThis.scrollTo = () => {};
globalThis.addEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {} });

await import("../app/i18n.js");

const runtime = await import("../app/runtime.mjs");
const transactionsView = await import("../app/views/transaktionen.mjs");
const { data, state, transaktionenById } = runtime;

const TARGET_ID = "TX-TARGET";
const TARGET_ACCOUNT_ID = "KTO-001";

function buildTransactions() {
  return Array.from({ length: 12 }, (_, index) => ({
    transaktion_id: index === 0 ? TARGET_ID : `TX-${String(index + 1).padStart(2, "0")}`,
    dedupe_hash: `transfer-target-pagination-${index + 1}`,
    rohquelle: "tests/transfer-target-pagination.test.mjs",
    konto_id: TARGET_ACCOUNT_ID,
    buchungsdatum: `2026-01-${String(index + 1).padStart(2, "0")}`,
    betrag: "1.00",
    gegenpartei: `Testgegenpartei ${index + 1}`,
    verwendungszweck: `Testbuchung ${index + 1}`,
    kategorisierung_status: "bestaetigt",
    ist_transfer: false,
    kategorie_herkunft: "manuell",
  }));
}

function installTransactions(transactions) {
  data.transaktionen = transactions;
  transaktionenById.clear();
  for (const transaction of transactions) {
    transaktionenById.set(transaction.transaktion_id, transaction);
  }
}

function resetTransactionState() {
  state.view = "transactions";
  state.transactionFilters = {
    account: TARGET_ACCOUNT_ID,
    status: "",
    category: "",
    transfer: "",
    origin: "",
    search: "",
    timeMode: "none",
    dateFrom: "",
    dateTo: "",
    month: "",
    quarterYear: "",
    quarter: "1",
    year: "",
  };
  state.transactionSort = { key: "date", dir: "desc" };
  state.transactionPage = 1;
  state.pageSize = 10;
  state.selectedTransactionId = "";
  state.detailRailClosed = true;
}

function clickPairedTransfer(transactionId) {
  const transferCell = {
    dataset: { action: "paired-transfer", transaction: transactionId },
  };
  const event = {
    target: {
      closest(selector) {
        return selector === ".transfer-link-cell" ? transferCell : null;
      },
    },
    stopPropagation: () => {},
  };
  const clickListener = appListeners.get("click")?.[0];
  assert.equal(typeof clickListener, "function");
  clickListener(event);
}

installTransactions(buildTransactions());
resetTransactionState();
await import("../app/main.js");

test("transactionPageForId berücksichtigt Sortierung, Seitengröße und fehlende IDs", () => {
  resetTransactionState();
  assert.equal(typeof transactionsView.transactionPageForId, "function");

  state.pageSize = 5;
  assert.equal(transactionsView.transactionPageForId(TARGET_ID), 3);

  state.transactionSort = { key: "date", dir: "asc" };
  assert.equal(transactionsView.transactionPageForId(TARGET_ID), 1);
  assert.equal(transactionsView.transactionPageForId("TX-MISSING"), 1);
});

test("Gegenbuchungsnavigation zeigt Zielzeile auf ihrer Seite und öffnet die Detail-Rail", () => {
  resetTransactionState();

  clickPairedTransfer(TARGET_ID);

  assert.equal(state.transactionFilters.account, TARGET_ACCOUNT_ID);
  assert.equal(state.selectedTransactionId, TARGET_ID);
  assert.equal(state.transactionPage, 2);
  assert.equal(state.detailRailClosed, false);
  assert.match(app.innerHTML, /transaction-row selected/);
  assert.match(app.innerHTML, /data-transaction="TX-TARGET"/);
  assert.match(app.innerHTML, /detail-panel/);
});

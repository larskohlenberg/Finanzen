import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { apiAbwarten, bestandAntwort } from "./hilfe-bestand.mjs";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: (key) => (key === "finance-m2-data-mode" ? "demo" : null), setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
  const bestand = bestandAntwort(path);
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
const vermoegenView = await import("../app/views/vermoegen.mjs");
const vermoegen = await import("../app/vermoegen.mjs");
const liquiditaet = await import("../app/liquiditaet.mjs");
const { data, state } = runtime;
const { renderTransactions } = transactionsView;
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

// Treffer und Gesamtzahl kommen aus der Transaktionen-API (hier wie der Server ueber den Demobestand).
async function gerendert() {
  renderTransactions();
  await apiAbwarten();
  return renderTransactions();
}

test("transactions show filtered hits out of total hits even without active filters", async () => {
  resetTransactionFilters();
  const total = data.transaktionen.length;

  assert.match(await gerendert(), new RegExp(`${total} von ${total} Treffer`));

  state.transactionFilters.search = data.transaktionen[0].transaktion_id;
  assert.match(await gerendert(), new RegExp(`1 von ${total} Treffer`));
});


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
const { data, state, kontenById } = runtime;
const { filteredTransactions } = transactionsView;

// Synthetisches Szenario: ein Konto mit "MusterbankA" im Namen und eine Buchung darauf,
// deren Freitextfelder das Wort "MusterbankA" NICHT enthalten. So lässt sich der frühere
// Bug isolieren, ohne von lokalen Echtdaten abzuhängen.
const KONTO_ID = "__test_konto_xyz__";
const TX_ID = "__test_tx_xyz__";
const PURPOSE_TOKEN = "ZZZUNIKAT42";
const RULE_ID = "REG-999";
const IMMOBILIE_ID = "IMM-777";

function withSearchScenario(fn) {
  kontenById.set(KONTO_ID, { konto_id: KONTO_ID, name: "MusterbankA Girokonto Test" });
  const tx = {
    transaktion_id: TX_ID,
    konto_id: KONTO_ID,
    gegenpartei: "Stadtwerke Musterstadt",
    verwendungszweck: `Abschlag Strom ${PURPOSE_TOKEN}`,
    empfaenger: "Stadtwerke Musterstadt",
    betrag: "-42.00",
    buchungstag: "2026-01-15",
    kategorisierung_status: "offen",
    ist_transfer: false,
    matched_regeln: [RULE_ID],
    immobilie_id: IMMOBILIE_ID,
  };
  data.transaktionen.push(tx);
  const previousSearch = state.transactionFilters.search;
  try {
    fn();
  } finally {
    state.transactionFilters.search = previousSearch;
    data.transaktionen.pop();
    kontenById.delete(KONTO_ID);
  }
}

test("Suche nach dem Kontonamen matcht die Buchung nicht mehr", () => {
  withSearchScenario(() => {
    state.transactionFilters.search = "MusterbankA";
    const ids = filteredTransactions().map((tx) => tx.transaktion_id);
    assert.ok(!ids.includes(TX_ID), "MusterbankA-Kontoname darf keine Freitext-Treffer erzeugen");
  });
});

test("Suche nach Verwendungszweck-Text matcht weiterhin", () => {
  withSearchScenario(() => {
    state.transactionFilters.search = PURPOSE_TOKEN;
    const ids = filteredTransactions().map((tx) => tx.transaktion_id);
    assert.ok(ids.includes(TX_ID), "Text im Verwendungszweck muss gefunden werden");
  });
});

test("Suche nach konkreter Regel-ID matcht nur die zugeordnete Buchung", () => {
  withSearchScenario(() => {
    state.transactionFilters.search = RULE_ID;
    let ids = filteredTransactions().map((tx) => tx.transaktion_id);
    assert.ok(ids.includes(TX_ID), "Zugeordnete Regel-ID muss die Buchung finden");

    state.transactionFilters.search = "REG-998";
    ids = filteredTransactions().map((tx) => tx.transaktion_id);
    assert.ok(!ids.includes(TX_ID), "Andere Regel-ID darf die Buchung nicht finden");
  });
});

test("Suche nach Immobilien-ID findet nur die zugeordnete Buchung", () => {
  withSearchScenario(() => {
    state.transactionFilters.search = IMMOBILIE_ID;
    let ids = filteredTransactions().map((entry) => entry.transaktion_id);
    assert.ok(ids.includes(TX_ID));

    state.transactionFilters.search = "IMM-778";
    ids = filteredTransactions().map((entry) => entry.transaktion_id);
    assert.ok(!ids.includes(TX_ID));
  });
});

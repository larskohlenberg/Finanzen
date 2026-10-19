// tests/transactions-dokument-filter.test.mjs
// Transaktionsansicht: Filter auf ein Quelldokument (rohquelle enthaelt den
// Belegpfad), sichtbar als entfernbarer Filter-Chip; Rohquelle verlinkt zurueck.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { apiAbwarten, bestandAntwort } from "./hilfe-bestand.mjs";

// Die Lese-API rechnet ueber den Bestand der App (data), den die Tests ergaenzen.
let appDaten = null;

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: (key) => (key === "finance-m2-data-mode" ? "demo" : null), setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
  const bestand = bestandAntwort(path, { daten: appDaten });
  if (bestand) return bestand;
  const cleanPath = String(path).replace(/^\.\//, "").replace(/\?.*$/, "");
  const body = readFileSync(new URL(`../app/${cleanPath}`, import.meta.url), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};
await import("../app/i18n.js");

const { data, state } = await import("../app/runtime.mjs");
appDaten = data;
const { renderTransactions, renderTransactionDetail } = await import("../app/views/transaktionen.mjs");
const { filtereTransaktionen } = await import("../app/transaktionen-abfrage.mjs");
const filteredTransactions = () => filtereTransaktionen(data, state.transactionFilters);
const detail = (transaktion) => ({ transaktion, regelzahlung: null, vorsorge: null, immobilie: null });

const PFAD = "Belege/Kontoauszuege/KTO-TEST/auszug_2026-01.csv";

async function mitBuchungen(fn) {
  const neu = [
    { transaktion_id: "TXN-T1", konto_id: "KTO-001", buchungsdatum: "2026-01-05", betrag: "-1.00", gegenpartei: "A", verwendungszweck: "x", kategorisierung_status: "offen", ist_transfer: false, rohquelle: PFAD },
    { transaktion_id: "TXN-T2", konto_id: "KTO-001", buchungsdatum: "2026-01-06", betrag: "-2.00", gegenpartei: "B", verwendungszweck: "y", kategorisierung_status: "offen", ist_transfer: false, rohquelle: `Import aus ${PFAD}.` },
    { transaktion_id: "TXN-T3", konto_id: "KTO-001", buchungsdatum: "2026-01-07", betrag: "-3.00", gegenpartei: "C", verwendungszweck: "z", kategorisierung_status: "offen", ist_transfer: false, rohquelle: "Belege/Kontoauszuege/KTO-TEST/anderer.csv" },
  ];
  data.transaktionen.push(...neu);
  try {
    await fn(neu);
  } finally {
    data.transaktionen.splice(data.transaktionen.length - neu.length, neu.length);
    state.transactionFilters.beleg = "";
  }
}

test("Filter beleg gibt es im Zustand, leer per Default", () => {
  assert.equal(state.transactionFilters.beleg, "");
});

test("Dokument-Filter zeigt genau die Buchungen mit diesem Quelldokument", async () => {
  await mitBuchungen(() => {
    state.transactionFilters.beleg = PFAD;
    assert.deepEqual(filteredTransactions().map((tx) => tx.transaktion_id).sort(), ["TXN-T1", "TXN-T2"]);
  });
});

test("Dokument-Filter erscheint als entfernbarer Chip mit Dateiname", async () => {
  await mitBuchungen(async () => {
    state.transactionFilters.beleg = PFAD;
    renderTransactions();
    await apiAbwarten();
    const html = renderTransactions();
    assert.match(html, /<strong>2<\/strong>/, "Treffer aus der API");
    assert.match(html, /class="filter-chip/);
    assert.match(html, /auszug_2026-01\.csv/);
    assert.match(html, /data-action="clear-transaction-filter" data-filter-name="beleg"/);
    state.transactionFilters.beleg = "";
    renderTransactions();
    await apiAbwarten();
    assert.doesNotMatch(renderTransactions(), /data-filter-name="beleg"/);
  });
});

test("Rohquelle im Transaktions-Detail verlinkt das Quelldokument", async () => {
  await mitBuchungen((neu) => {
    const html = renderTransactionDetail(detail(neu[1]));
    assert.match(html, /<a class="linkish quelldokument-link" href="#\/dokumente\/Kontoauszuege\/KTO-TEST\/auszug_2026-01\.csv"/);
    assert.match(html, /Import aus <a /);
  });
});

test("Rohquelle ohne Belegpfad bleibt reiner, escapter Text", () => {
  const html = renderTransactionDetail(detail({ ...data.transaktionen[0], rohquelle: "data/<x>.csv" }));
  assert.match(html, /data\/&lt;x&gt;\.csv/);
  assert.doesNotMatch(html, /quelldokument-link/);
});

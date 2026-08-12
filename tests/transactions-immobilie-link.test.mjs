import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = {
  getItem: (key) => key === "finance-m2-data-mode" ? "demo" : null,
  setItem: () => {},
};
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
  const cleanPath = String(path).replace(/^\.\//, "").replace(/\?.*$/, "");
  const body = readFileSync(new URL(`../app/${cleanPath}`, import.meta.url), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};
await import("../app/i18n.js");

const { immobilieForTransaction, renderTransactionDetail } =
  await import("../app/views/transaktionen.mjs");
const { data } = await import("../app/runtime.mjs");

const immobilie = data.immobilien[0];
const konto = data.konten[0];

function txMit(over = {}) {
  return {
    transaktion_id: "TXN-00000000-0000-4000-8000-000000000999",
    konto_id: konto.konto_id,
    buchungsdatum: "2026-06-02",
    betrag: "-56.83",
    gegenpartei: "Testgegenpartei",
    verwendungszweck: "Test",
    kategorisierung_status: "bestaetigt",
    kategorie_herkunft: "manuell",
    ist_transfer: false,
    ...over,
  };
}

test("immobilieForTransaction loest nur bekannte IDs auf", () => {
  assert.equal(immobilieForTransaction(txMit()), undefined);
  assert.equal(immobilieForTransaction(txMit({ immobilie_id: "IMM-999" })), undefined);
  assert.equal(
    immobilieForTransaction(txMit({ immobilie_id: immobilie.immobilie_id }))?.immobilie_id,
    immobilie.immobilie_id,
  );
});

test("Detailansicht zeigt die Immobilie als Querlink", () => {
  const html = renderTransactionDetail(txMit({ immobilie_id: immobilie.immobilie_id }));
  assert.match(html, /data-action="open-vermoegen-entity"/);
  assert.match(html, /data-vklasse="immobilie"/);
  assert.match(html, new RegExp(`data-vid="${immobilie.immobilie_id}"`));
  assert.match(html, new RegExp(immobilie.immobilie_id));
});

test("Detailansicht laesst die Immobilienzeile ohne Bezug weg", () => {
  const html = renderTransactionDetail(txMit());
  assert.doesNotMatch(html, /data-vklasse="immobilie"/);
});

test("Immobilienlabel ist in beiden Sprachen gepflegt", () => {
  assert.equal(window.FINANCE_I18N.de.transactions.immobilie, "Immobilie");
  assert.equal(window.FINANCE_I18N.en.transactions.immobilie, "Property");
});

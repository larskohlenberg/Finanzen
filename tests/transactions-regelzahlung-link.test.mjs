// tests/transactions-regelzahlung-link.test.mjs
//
// Eine Buchung kann per regelzahlung_id festhalten, welche erwartete Zahlung
// sie erfuellt. Bis hierher war diese Verknuepfung in der Detail-Ansicht
// unsichtbar: sie tauchte nur indirekt als Vorsorge-Link auf, und auch das nur,
// wenn die Regelzahlung zufaellig ein vorsorge_id trug. Eine Miet- oder
// Darlehensrate zeigte gar nichts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Browser-global shim (gleiches Muster wie transactions-herkunft.test.mjs)
globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
  const cleanPath = String(path).replace(/^\.\//, "").replace(/\?.*$/, "");
  const body = readFileSync(new URL(`../app/${cleanPath}`, import.meta.url), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};
await import("../app/i18n.js");

const { regelzahlungForTransaction, renderTransactionDetail } = await import("../app/views/transaktionen.mjs");
const { data } = await import("../app/runtime.mjs");

// Keine echte ID im Testcode: die Regelzahlung wird aus dem geladenen Bestand
// gezogen, damit der Test nicht bricht, wenn sich der Datenbestand aendert.
const eineRegelzahlung = (data.regelzahlungen ?? [])[0];
const einKonto = data.konten[0];

function txMit(over = {}) {
  return {
    transaktion_id: "TXN-00000000-0000-0000-0000-000000000000",
    konto_id: einKonto.konto_id,
    buchungsdatum: "2026-06-02",
    betrag: "-56.83",
    gegenpartei: "Testgegenpartei",
    verwendungszweck: "Test",
    kategorisierung_status: "bestaetigt",
    kategorie_herkunft: "regel",
    ist_transfer: false,
    ...over,
  };
}

test("regelzahlungForTransaction: ohne regelzahlung_id undefined", () => {
  assert.equal(regelzahlungForTransaction(txMit()), undefined);
});

test("regelzahlungForTransaction: unbekannte ID ergibt undefined statt Absturz", () => {
  assert.equal(regelzahlungForTransaction(txMit({ regelzahlung_id: "RZ-999" })), undefined);
});

test("regelzahlungForTransaction: bekannte ID loest die Regelzahlung auf", () => {
  assert.ok(eineRegelzahlung, "Testvoraussetzung: es gibt mindestens eine Regelzahlung");
  const gefunden = regelzahlungForTransaction(txMit({ regelzahlung_id: eineRegelzahlung.regelzahlung_id }));
  assert.equal(gefunden?.regelzahlung_id, eineRegelzahlung.regelzahlung_id);
});

test("Detail-Ansicht zeigt die verknuepfte Regelzahlung als Querlink", () => {
  assert.ok(eineRegelzahlung, "Testvoraussetzung: es gibt mindestens eine Regelzahlung");
  const html = renderTransactionDetail(txMit({ regelzahlung_id: eineRegelzahlung.regelzahlung_id }));

  assert.match(html, /Regelzahlung/, "Label fehlt");
  assert.match(html, /data-action="open-regelzahlung"/, "Querlink-Aktion fehlt");
  assert.match(
    html,
    new RegExp(`data-regelzahlung="${eineRegelzahlung.regelzahlung_id}"`),
    "Ziel-ID am Link fehlt",
  );
});

test("Detail-Ansicht zeigt keine Regelzahlungs-Zeile, wenn die Buchung keine traegt", () => {
  const html = renderTransactionDetail(txMit());
  assert.doesNotMatch(html, /data-action="open-regelzahlung"/);
});

test("Label ist in beiden Sprachen gepflegt", () => {
  for (const lang of ["de", "en"]) {
    const wert = window.FINANCE_I18N[lang]?.transactions?.regelzahlung;
    assert.equal(typeof wert, "string", `transactions.regelzahlung fehlt in ${lang}`);
    assert.ok(wert.length > 0, `transactions.regelzahlung ist leer in ${lang}`);
  }
});

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
const { data, state } = runtime;
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

test("vermoegen loan detail renders term metadata", () => {
  const originalDarlehen = data.darlehen;
  const originalZeitwerte = data.zeitwerte;
  const originalLang = state.lang;

  try {
    data.darlehen = [{
      darlehen_id: "DAR-DETAIL-TEST",
      bezeichnung: "Test-Darlehen",
      darlehenstyp: "ratenkredit",
      status: "aktiv",
      anfangsdatum: "2022-03-15",
      anfangsbetrag: "120000.00",
      laufzeit_bis: "2032-03-15",
      zinssatz: "3.10",
      zinsbindung_bis: "2032-03-15",
      sollrate: "1150.00",
      rhythmus_einheit: "monat",
      rhythmus_intervall: 1,
      restschuld_laufzeitende: "0.00",
    }];
    data.zeitwerte = [{
      entitaet: "darlehen",
      entitaet_id: "DAR-DETAIL-TEST",
      feld: "restschuld",
      wert: "98600.00",
      standdatum: "2026-06-01",
      qualitaet: "belegt",
    }];
    state.lang = "de";
    resetVermoegenState();
    state.selectedVermoegenId = "darlehen:DAR-DETAIL-TEST";

    const html = renderVermoegen();

    assert.match(html, /Aufgenommen am/);
    assert.match(html, /15\.3\.2022/);
    assert.match(html, /Anfangsbetrag/);
    assert.match(html, /120\.000,00/);
    assert.match(html, /Laufzeit/);
    assert.match(html, /10 Jahre/);
    assert.match(html, /Zinsbindung bis/);
    assert.match(html, /Restschuld am Laufzeitende/);
    assert.match(html, /0,00/);
  } finally {
    data.darlehen = originalDarlehen;
    data.zeitwerte = originalZeitwerte;
    state.lang = originalLang;
    resetVermoegenState();
  }
});

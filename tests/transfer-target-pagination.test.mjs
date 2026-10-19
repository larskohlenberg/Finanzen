import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { apiAbwarten, bestandAntwort } from "./hilfe-bestand.mjs";

// Die Lese-APIs rechnen ueber den Bestand der App (data), den die Tests aendern.
let appDaten = null;

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
globalThis.location = { hash: "" };
const historyCalls = [];
globalThis.history = {
  pushState(state, title, hash) {
    historyCalls.push({ method: "push", state, title, hash });
    location.hash = hash;
  },
  replaceState(state, title, hash) {
    historyCalls.push({ method: "replace", state, title, hash });
    location.hash = hash;
  },
};
globalThis.CSS = { escape: (value) => String(value) };
globalThis.scrollX = 0;
globalThis.scrollY = 0;
globalThis.scrollTo = () => {};
globalThis.addEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {} });

await import("../app/i18n.js");

const runtime = await import("../app/runtime.mjs");
const transactionsView = await import("../app/views/transaktionen.mjs");
const { data, state } = runtime;
appDaten = data;
// Wie beim Stand-Wechsel: geaenderter Bestand -> Antworten der Lese-APIs verwerfen.
const { verwerfeApiCaches } = await import("../app/api-daten.mjs");
const { transaktionenSeite } = await import("../app/transaktionen-abfrage.mjs");

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
  verwerfeApiCaches();
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
  const transferLink = {
    dataset: { action: "paired-transfer", transaction: transactionId, account: TARGET_ACCOUNT_ID },
  };
  const event = {
    target: {
      closest(selector) {
        return selector === ".transfer-link" ? transferLink : null;
      },
    },
    stopPropagation: () => {},
  };
  const clickListener = appListeners.get("click")?.[0];
  assert.equal(typeof clickListener, "function");
  clickListener(event);
}

function clickAction(dataset) {
  const action = { dataset };
  const event = {
    target: {
      closest(selector) {
        if (selector === ".transfer-link") return null;
        return selector === "[data-action]" ? action : null;
      },
    },
  };
  const clickListener = appListeners.get("click")?.[0];
  assert.equal(typeof clickListener, "function");
  clickListener(event);
}

installTransactions(buildTransactions());
resetTransactionState();
await import("../app/main.js");

test("Sprung zu einer Buchung: der Server rechnet ihre Seite nach Sortierung und Seitengroesse", () => {
  const seite = (sort, zeige) => transaktionenSeite(data, { sort, groesse: 10, zeige }).seite;
  assert.equal(seite({ key: "date", dir: "desc" }, TARGET_ID), 2);
  assert.equal(seite({ key: "date", dir: "asc" }, TARGET_ID), 1);
  assert.equal(seite({ key: "date", dir: "desc" }, "TX-MISSING"), 1);
});

test("Gegenbuchungsnavigation zeigt Zielzeile auf ihrer Seite und öffnet die Detail-Rail", async () => {
  resetTransactionState();

  clickPairedTransfer(TARGET_ID);
  await apiAbwarten();

  assert.equal(state.transactionFilters.account, TARGET_ACCOUNT_ID);
  assert.equal(state.selectedTransactionId, TARGET_ID);
  assert.equal(state.transactionPage, 2);
  assert.equal(state.detailRailClosed, false);
  assert.match(app.innerHTML, /transaction-row selected/);
  assert.match(app.innerHTML, /data-transaction="TX-TARGET"/);
  assert.match(app.innerHTML, /detail-panel/);
});

test("open-transaction aus einer anderen Ansicht springt auf die Seite der Zielbuchung", async () => {
  resetTransactionState();
  state.view = "vorsorge";
  state.transactionPage = 1;
  clickAction({ action: "open-transaction", transaction: TARGET_ID });
  await apiAbwarten();
  assert.equal(state.view, "transactions");
  assert.equal(state.selectedTransactionId, TARGET_ID);
  // 12 Buchungen, absteigend nach Datum, 10 je Seite: die aelteste steht auf Seite 2.
  assert.equal(state.transactionPage, 2);
  assert.match(app.innerHTML, /transaction-row selected/);
  assert.match(app.innerHTML, /data-transaction="TX-TARGET"/);
});

test("Letzte Seite: der Server begrenzt auf die letzte vorhandene Seite", async () => {
  resetTransactionState();
  clickAction({ action: "page-last" });
  await apiAbwarten();
  assert.equal(state.transactionPage, 2);
  assert.match(app.innerHTML, /data-transaction="TX-TARGET"/);
  clickAction({ action: "page-first" });
  await apiAbwarten();
  assert.equal(state.transactionPage, 1);
});

test("open-entity fuer eine Transaktion springt ebenfalls auf ihre Seite", async () => {
  resetTransactionState();
  clickAction({ action: "open-entity", scope: "transaktion", entity: TARGET_ID });
  await apiAbwarten();
  assert.equal(state.selectedTransactionId, TARGET_ID);
  assert.equal(state.transactionPage, 2);
});

test("Alle Beitraege eines Vorsorgevertrags: Transaktionen gefiltert auf seine Regelzahlungen", async () => {
  const saved = { regelzahlungen: data.regelzahlungen, vorsorge: data.vorsorge, transaktionen: data.transaktionen };
  try {
    const txs = buildTransactions().map((tx, i) => (i < 3 ? { ...tx, regelzahlung_id: "RZ-V1" } : tx));
    installTransactions(txs);
    data.regelzahlungen = [{ regelzahlung_id: "RZ-V1", bezeichnung: "Beitrag", betrag: "1.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt", vorsorge_id: "VS-V1" }];
    data.vorsorge = [{ vorsorge_id: "VS-V1", art: "rentenversicherung", name: "Musterrente", person_id: data.personen[0].person_id, status: "aktiv", kapitalbildend: true }];
    verwerfeApiCaches();
    resetTransactionState();
    state.view = "vorsorge";
    clickAction({ action: "vorsorge-transactions", vorsorge: "VS-V1" });
    assert.equal(state.view, "transactions");
    assert.equal(state.transactionFilters.vorsorge, "VS-V1");
    assert.equal(state.transactionFilters.account, "");
    await apiAbwarten();
    assert.equal(transactionsView.transaktionenAntwort().antwort.treffer, 3);
    assert.equal(location.hash, "#/transaktionen/vorsorge/VS-V1");
    assert.match(app.innerHTML, /Beiträge zu:[\s\S]*Musterrente/);
    clickAction({ action: "clear-transaction-filter", filterName: "vorsorge" });
    await apiAbwarten();
    assert.equal(transactionsView.transaktionenAntwort().antwort.treffer, 12);
  } finally {
    data.regelzahlungen = saved.regelzahlungen;
    data.vorsorge = saved.vorsorge;
    installTransactions(saved.transaktionen);
    state.transactionFilters.vorsorge = "";
  }
});

test("Sprung 'Alle Wertstaende' oeffnet die sonst zugeklappte Kachel auf der Vermoegensuebersicht", () => {
  state.klappKacheln = {};
  clickAction({ action: "show-vermoegen-wertstaende", entity: "DAR-001" });
  assert.equal(state.view, "vermoegen");
  assert.equal(state.vermoegenTab, "uebersicht");
  assert.equal(state.klappKacheln["vermoegen.wertstaende"], true);
  assert.equal(state.wertstaendeFilters.search, "DAR-001");
  state.klappKacheln = {};
  state.view = "transactions";
});

test("open-vorsorge setzt Auswahl zurück, leert Filter und navigiert zum Vorsorge-Hash", () => {
  resetTransactionState();
  state.vorsorgeFilters = { person: "PER-001" };
  state.selectedVorsorgeId = "VS-ALT";
  historyCalls.length = 0;

  clickAction({ action: "open-vorsorge", vorsorge: "VS-003" });

  assert.equal(state.view, "vorsorge");
  assert.deepEqual(state.vorsorgeFilters, { person: "" });
  assert.equal(state.selectedVorsorgeId, "VS-003");
  assert.equal(location.hash, "#/vorsorge/VS-003");
  const navigation = historyCalls.at(-1);
  assert.equal(navigation.method, "push");
  assert.equal(navigation.state.view, "vorsorge");
  assert.equal(navigation.state.selectedVorsorgeId, "VS-003");
  assert.equal(navigation.title, "");
  assert.equal(navigation.hash, "#/vorsorge/VS-003");
});

test("Immobilien-Ruecklink oeffnet die Transaktionssuche nur mit der Immobilien-ID", () => {
  resetTransactionState();
  state.transactionFilters = {
    account: "KTO-ALT",
    status: "offen",
    category: "KAT-ALT",
    transfer: "ja",
    origin: "regel",
    search: "alt",
    timeMode: "month",
    dateFrom: "2026-01-01",
    dateTo: "2026-01-31",
    month: "2026-01",
    quarterYear: "2026",
    quarter: "2",
    year: "2026",
  };
  state.transactionPage = 4;
  state.selectedTransactionId = TARGET_ID;
  historyCalls.length = 0;

  clickAction({ action: "immobilie-transactions", immobilie: "IMM-004" });

  assert.equal(state.view, "transactions");
  assert.deepEqual(state.transactionFilters, {
    account: "",
    status: "",
    category: "",
    transfer: "",
    origin: "",
    search: "IMM-004",
    beleg: "",
    vorsorge: "",
    timeMode: "none",
    dateFrom: "",
    dateTo: "",
    month: "",
    quarterYear: "",
    quarter: "1",
    year: "",
  });
  assert.equal(state.transactionPage, 1);
  assert.equal(state.selectedTransactionId, "");
  assert.equal(state.detailRailClosed, false);
  assert.equal(location.hash, "#/transaktionen");

  // Monat ohne Angabe: Transfers aus. Eigenanteil-Spalte: nur Transfers. Saldo mit Eigenanteil: alle.
  clickAction({ action: "immobilie-transactions", immobilie: "IMM-004", monat: "2026-01" });
  assert.equal(state.transactionFilters.transfer, "without");
  clickAction({ action: "immobilie-transactions", immobilie: "IMM-004", monat: "2026-01", kategorie: "KAT-011", transfer: "only" });
  assert.equal(state.transactionFilters.transfer, "only");
  assert.equal(state.transactionFilters.category, "KAT-011");
  clickAction({ action: "immobilie-transactions", immobilie: "IMM-004", monat: "2026-01", transfer: "all" });
  assert.equal(state.transactionFilters.transfer, "");
});

test("verknüpfte Beitragsbuchung öffnet die Transaktions-Rail und navigiert zum Vorsorgevertrag zurück", async () => {
  const vorsorgeId = "VS-RUNDWEG";
  const regelzahlungId = "RZ-RUNDWEG";
  const transactionId = "TX-RUNDWEG";
  const transaction = {
    transaktion_id: transactionId,
    dedupe_hash: "vorsorge-rundweg-fixture",
    rohquelle: "tests/transfer-target-pagination.test.mjs",
    konto_id: TARGET_ACCOUNT_ID,
    buchungsdatum: "2026-06-15",
    betrag: "-162.00",
    gegenpartei: "MusterversicherungA Rundweg",
    verwendungszweck: "Riester-Beitrag Rundweg",
    kategorisierung_status: "bestaetigt",
    ist_transfer: false,
    kategorie_herkunft: "manuell",
    regelzahlung_id: regelzahlungId,
  };
  const saved = {
    transaktionen: data.transaktionen,
    regelzahlungen: data.regelzahlungen,
    vorsorge: data.vorsorge,
    view: state.view,
    transactionFilters: state.transactionFilters,
    transactionSort: state.transactionSort,
    transactionPage: state.transactionPage,
    pageSize: state.pageSize,
    selectedTransactionId: state.selectedTransactionId,
    detailRailClosed: state.detailRailClosed,
    vorsorgeFilters: state.vorsorgeFilters,
    selectedVorsorgeId: state.selectedVorsorgeId,
  };

  try {
    data.transaktionen = [transaction];
    data.regelzahlungen = [{
      regelzahlung_id: regelzahlungId,
      bezeichnung: "Riester-Beitrag Rundweg",
      betrag: "-162.00",
      vorsorge_id: vorsorgeId,
    }];
    data.vorsorge = [{
      vorsorge_id: vorsorgeId,
      art: "riester",
      name: "Riester Rundweg",
      person_id: data.personen[0].person_id,
      status: "aktiv",
      kapitalbildend: true,
      bemerkung: "Rundweg-Bemerkung",
    }];
    verwerfeApiCaches();
    resetTransactionState();
    state.vorsorgeFilters = { person: "" };
    historyCalls.length = 0;

    clickAction({ action: "open-vorsorge", vorsorge: vorsorgeId });
    // Gebuchte Beitraege kommen vom Server (GET /api/v1/vorsorge).
    await apiAbwarten();

    assert.equal(state.view, "vorsorge");
    assert.equal(state.selectedVorsorgeId, vorsorgeId);
    assert.equal(location.hash, `#/vorsorge/${vorsorgeId}`);
    assert.ok(app.innerHTML.includes("objekt-detail-titel"));
    assert.ok(app.innerHTML.includes(`data-action="vorsorge-transactions" data-vorsorge="${vorsorgeId}"`));

    state.transactionFilters = {
      ...state.transactionFilters,
      account: "KTO-ALT",
      status: "offen",
      category: "KAT-ALT",
      transfer: "ja",
      origin: "regel",
      search: "ausgefiltert",
      timeMode: "month",
      month: "2025-01",
    };
    clickAction({ action: "open-transaction", transaction: transactionId });
    await apiAbwarten();

    assert.equal(state.view, "transactions");
    assert.equal(state.selectedTransactionId, transactionId);
    assert.equal(state.detailRailClosed, false);
    assert.equal(location.hash, `#/transaktionen/${transactionId}`);
    assert.deepEqual(state.transactionFilters, {
      account: "",
      status: "",
      category: "",
      transfer: "",
      origin: "",
      search: "",
      beleg: "",
      vorsorge: "",
      timeMode: "none",
      dateFrom: "",
      dateTo: "",
      month: "",
      quarterYear: "",
      quarter: "1",
      year: "",
    });
    assert.ok(app.innerHTML.includes("transaction-row selected"));
    assert.ok(app.innerHTML.includes(`data-transaction="${transactionId}"`));
    assert.ok(app.innerHTML.includes("MusterversicherungA Rundweg"));
    assert.ok(app.innerHTML.includes(`data-action="open-vorsorge" data-vorsorge="${vorsorgeId}"`));

    state.vorsorgeFilters = { person: "PER-X" };
    state.selectedVorsorgeId = "VS-ALT";
    clickAction({ action: "open-vorsorge", vorsorge: vorsorgeId });
    // Gebuchte Beitraege kommen vom Server (GET /api/v1/vorsorge).
    await apiAbwarten();

    assert.equal(state.view, "vorsorge");
    assert.deepEqual(state.vorsorgeFilters, { person: "" });
    assert.equal(state.selectedVorsorgeId, vorsorgeId);
    assert.equal(location.hash, `#/vorsorge/${vorsorgeId}`);
    assert.ok(app.innerHTML.includes("objekt-detail-titel"));
    assert.ok(app.innerHTML.includes("Riester Rundweg"));
    assert.ok(app.innerHTML.includes(`data-action="vorsorge-transactions" data-vorsorge="${vorsorgeId}"`));
  } finally {
    data.transaktionen = saved.transaktionen;
    data.regelzahlungen = saved.regelzahlungen;
    data.vorsorge = saved.vorsorge;
    verwerfeApiCaches();
    state.view = saved.view;
    state.transactionFilters = saved.transactionFilters;
    state.transactionSort = saved.transactionSort;
    state.transactionPage = saved.transactionPage;
    state.pageSize = saved.pageSize;
    state.selectedTransactionId = saved.selectedTransactionId;
    state.detailRailClosed = saved.detailRailClosed;
    state.vorsorgeFilters = saved.vorsorgeFilters;
    state.selectedVorsorgeId = saved.selectedVorsorgeId;
  }
});

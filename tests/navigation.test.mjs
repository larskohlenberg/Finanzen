import assert from "node:assert/strict";
import test from "node:test";
import {
  LEERE_FILTER, zuBuchungen, filterAlsQuery, filterAusQuery, aktiveFilter, neuerVerlaufseintrag, seitenTitel,
} from "../app/navigation.mjs";
import { routeFromState, parseRoute } from "../app/routing.mjs";

const zustand = (teil = {}) => ({
  view: "overview",
  transactionFilters: { ...LEERE_FILTER, origin: "agent", search: "miete", status: "offen" },
  transactionPage: 7,
  selectedTransactionId: "TX-ALT",
  transactionJumpTo: "",
  detailRailClosed: true,
  ...teil,
});

test("LEERE_FILTER ist eingefroren und vollstaendig", () => {
  assert.ok(Object.isFrozen(LEERE_FILTER));
  assert.equal(LEERE_FILTER.timeMode, "none");
  assert.equal(LEERE_FILTER.search, "");
});

test("zuBuchungen setzt einen definierten Filterzustand (F20)", () => {
  const s = zustand();
  zuBuchungen(s, { filter: { account: "KTO-1" } });
  assert.equal(s.view, "transactions");
  assert.deepEqual(s.transactionFilters, { ...LEERE_FILTER, account: "KTO-1" });
  assert.equal(s.transactionPage, 1);
  assert.equal(s.selectedTransactionId, "");
  assert.equal(s.detailRailClosed, false);
});

test("zuBuchungen mit Auswahl springt auf deren Seite", () => {
  const s = zustand();
  zuBuchungen(s, { auswahl: "TX-9" });
  assert.deepEqual(s.transactionFilters, LEERE_FILTER, "Herkunft und Suche verdecken die Zielbuchung nicht mehr");
  assert.equal(s.selectedTransactionId, "TX-9");
  assert.equal(s.transactionJumpTo, "TX-9");
});

test("Filter in der URL: ohne Freitextsuche, ohne Standardwerte, umkehrbar", () => {
  const filter = { ...LEERE_FILTER, account: "KTO-1", category: "KAT-002", search: "geheim", timeMode: "month", month: "2026-03" };
  const query = filterAlsQuery(filter);
  assert.equal(query, "?konto=KTO-1&kategorie=KAT-002&zeit=month&monat=2026-03");
  assert.doesNotMatch(query, /geheim|search/);
  assert.deepEqual(filterAusQuery(query.slice(1)), { ...filter, search: "" });
  assert.equal(filterAlsQuery(LEERE_FILTER), "");
});

test("filterAusQuery verwirft ungueltige Werte", () => {
  assert.deepEqual(filterAusQuery("zeit=unsinn&quartal=9&status=<x>&unbekannt=1"), { ...LEERE_FILTER, status: "<x>" });
  assert.deepEqual(filterAusQuery("zeit=quarter&quartalsjahr=2026&quartal=3"), { ...LEERE_FILTER, timeMode: "quarter", quarterYear: "2026", quarter: "3" });
});

test("Routen der Buchungsliste tragen die Filter, Deeplinks sind invers", () => {
  const s = { view: "transactions", transactionFilters: { ...LEERE_FILTER, origin: "agent", status: "offen" }, selectedTransactionId: "" };
  const route = routeFromState(s);
  assert.equal(route, "#/transaktionen?status=offen&herkunft=agent");
  assert.deepEqual(parseRoute(route), { view: "transactions", transactionFilters: s.transactionFilters });
  const detail = routeFromState({ ...s, selectedTransactionId: "TX-1" });
  assert.equal(detail, "#/transaktionen/TX-1?status=offen&herkunft=agent");
  assert.deepEqual(parseRoute(detail), { view: "transactions", selectedTransactionId: "TX-1", transactionFilters: s.transactionFilters });
});

test("Dokument- und Vorsorgefilter bleiben Pfad, weitere Filter haengen als Query an", () => {
  const s = { view: "transactions", transactionFilters: { ...LEERE_FILTER, vorsorge: "VS-001", year: "2025", timeMode: "year" } };
  const route = routeFromState(s);
  assert.equal(route, "#/transaktionen/vorsorge/VS-001?zeit=year&jahr=2025");
  assert.deepEqual(parseRoute(route).transactionFilters, s.transactionFilters);
  const beleg = { view: "transactions", transactionFilters: { ...LEERE_FILTER, beleg: "Belege/Konto/a b.pdf", account: "KTO-1" } };
  assert.deepEqual(parseRoute(routeFromState(beleg)).transactionFilters, beleg.transactionFilters);
});

test("aktiveFilter listet sichtbare Chips, Zeitfilter als einer", () => {
  const liste = aktiveFilter({ ...LEERE_FILTER, account: "KTO-1", search: "x", timeMode: "range", dateFrom: "2026-01-01" });
  assert.deepEqual(liste.map((f) => f.name), ["account", "zeit"]);
  assert.deepEqual(aktiveFilter({ ...LEERE_FILTER, timeMode: "month" }), [], "Zeitmodus ohne Monat filtert nicht");
});

test("Zurueck: Detail oder anderer Pfad = neuer Eintrag, nur Filter = ersetzen", () => {
  assert.equal(neuerVerlaufseintrag("#/transaktionen", "#/transaktionen/TX-1"), true);
  assert.equal(neuerVerlaufseintrag("#/transaktionen", "#/transaktionen?status=offen"), false);
  assert.equal(neuerVerlaufseintrag("#/transaktionen?status=offen", "#/transaktionen?konto=K"), false);
  assert.equal(neuerVerlaufseintrag("#/uebersicht", "#/transaktionen"), true);
  assert.equal(neuerVerlaufseintrag("#/plan-ist", "#/plan-ist"), false);
});

test("seitenTitel nennt Seite und App", () => {
  assert.equal(seitenTitel(["Transaktionen", "TX-1"], "Finanzmodell"), "TX-1 · Transaktionen · Finanzmodell");
  assert.equal(seitenTitel(["Übersicht", ""], "Finanzmodell"), "Übersicht · Finanzmodell");
});

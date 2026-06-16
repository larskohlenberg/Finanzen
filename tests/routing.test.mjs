import { test } from "node:test";
import assert from "node:assert/strict";
import { routeFromState, parseRoute } from "../app/routing.mjs";

test("routeFromState adressiert die ausgewählte Transaktion", () => {
  assert.equal(routeFromState({ view: "transactions", selectedTransactionId: "TXN-20260101-000001" }), "#/transaktionen/TXN-20260101-000001");
  assert.equal(routeFromState({ view: "transactions", selectedTransactionId: "" }), "#/transaktionen");
});

test("routeFromState adressiert Konto über die Vermögens-Auswahl, andere Klassen unter vermoegen", () => {
  assert.equal(routeFromState({ view: "vermoegen", selectedVermoegenId: "konto:KTO-001" }), "#/konten/KTO-001");
  assert.equal(routeFromState({ view: "vermoegen", selectedVermoegenId: "darlehen:DAR-001" }), "#/vermoegen/darlehen:DAR-001");
});

test("routeFromState bildet reine Views auf Slugs ab", () => {
  assert.equal(routeFromState({ view: "overview" }), "#/uebersicht");
  assert.equal(routeFromState({ view: "liquiditaet" }), "#/liquiditaet");
  assert.equal(routeFromState({ view: "masterdata" }), "#/stammdaten");
});

test("parseRoute liest Transaktions- und Konto-Deeplinks", () => {
  assert.deepEqual(parseRoute("#/transaktionen/TXN-20260101-000001"), { view: "transactions", selectedTransactionId: "TXN-20260101-000001" });
  assert.deepEqual(parseRoute("#/konten/KTO-001"), { view: "vermoegen", selectedVermoegenId: "konto:KTO-001" });
  assert.deepEqual(parseRoute("#/vermoegen/darlehen:DAR-001"), { view: "vermoegen", selectedVermoegenId: "darlehen:DAR-001" });
});

test("parseRoute liest reine Views und faellt sauber zurueck", () => {
  assert.deepEqual(parseRoute("#/liquiditaet"), { view: "liquiditaet" });
  assert.deepEqual(parseRoute("#/stammdaten"), { view: "masterdata" });
  assert.deepEqual(parseRoute("#/konten"), { view: "masterdata", masterSection: "konten" });
  assert.deepEqual(parseRoute(""), { view: "overview" });
  assert.deepEqual(parseRoute("#/unsinn"), { view: "overview" });
});

test("routeFromState und parseRoute sind für Deeplinks invers", () => {
  for (const state of [
    { view: "transactions", selectedTransactionId: "TXN-20260101-000001" },
    { view: "vermoegen", selectedVermoegenId: "konto:KTO-001" },
    { view: "liquiditaet" },
  ]) {
    const parsed = parseRoute(routeFromState(state));
    assert.equal(parsed.view, state.view);
  }
});

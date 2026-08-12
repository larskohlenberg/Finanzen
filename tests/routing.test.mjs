import { test } from "node:test";
import assert from "node:assert/strict";
import { routeFromState, parseRoute } from "../app/routing.mjs";

test("routeFromState adressiert die ausgewählte Transaktion", () => {
  assert.equal(routeFromState({ view: "transactions", selectedTransactionId: "TXN-5347b957-b93e-4453-830d-81eae240aa51" }), "#/transaktionen/TXN-5347b957-b93e-4453-830d-81eae240aa51");
  assert.equal(routeFromState({ view: "transactions", selectedTransactionId: "" }), "#/transaktionen");
});

test("routeFromState adressiert den Konto-Stammsatz und Vermögens-Positionen", () => {
  assert.equal(routeFromState({ view: "masterdata", masterSection: "konten", selectedKonto: "KTO-001" }), "#/konten/KTO-001");
  assert.equal(routeFromState({ view: "vermoegen", selectedVermoegenId: "konto:KTO-001" }), "#/vermoegen/konto:KTO-001");
  assert.equal(routeFromState({ view: "vermoegen", selectedVermoegenId: "darlehen:DAR-001" }), "#/vermoegen/darlehen:DAR-001");
});

test("routeFromState bildet reine Views auf Slugs ab", () => {
  assert.equal(routeFromState({ view: "overview" }), "#/uebersicht");
  assert.equal(routeFromState({ view: "liquiditaet" }), "#/liquiditaet");
  assert.equal(routeFromState({ view: "masterdata" }), "#/stammdaten");
});

test("parseRoute liest Transaktions- und Konto-Deeplinks", () => {
  assert.deepEqual(parseRoute("#/transaktionen/TXN-5347b957-b93e-4453-830d-81eae240aa51"), { view: "transactions", selectedTransactionId: "TXN-5347b957-b93e-4453-830d-81eae240aa51" });
  assert.deepEqual(parseRoute("#/konten/KTO-001"), { view: "masterdata", masterSection: "konten", selectedKonto: "KTO-001" });
  assert.deepEqual(parseRoute("#/vermoegen/darlehen:DAR-001"), { view: "vermoegen", selectedVermoegenId: "darlehen:DAR-001" });
});

test("parseRoute liest reine Views und faellt sauber zurueck", () => {
  assert.deepEqual(parseRoute("#/liquiditaet"), { view: "liquiditaet" });
  assert.deepEqual(parseRoute("#/stammdaten"), { view: "masterdata" });
  assert.deepEqual(parseRoute("#/konten"), { view: "masterdata", masterSection: "konten" });
  assert.deepEqual(parseRoute(""), { view: "overview" });
  assert.deepEqual(parseRoute("#/unsinn"), { view: "overview" });
});

test("parseRoute erkennt Regel-Detail", () => {
  assert.deepEqual(parseRoute("#/regeln/REG-001"), { view: "masterdata", masterSection: "regeln", selectedRegel: "REG-001" });
});
test("parseRoute erkennt Regel-Liste", () => {
  assert.deepEqual(parseRoute("#/regeln"), { view: "masterdata", masterSection: "regeln" });
});
test("routeFromState erzeugt Regel-Detail-Hash", () => {
  assert.equal(routeFromState({ view: "masterdata", masterSection: "regeln", selectedRegel: "REG-001" }), "#/regeln/REG-001");
});

test("routeFromState und parseRoute sind für Deeplinks invers", () => {
  for (const state of [
    { view: "transactions", selectedTransactionId: "TXN-5347b957-b93e-4453-830d-81eae240aa51" },
    { view: "vermoegen", selectedVermoegenId: "konto:KTO-001" },
    { view: "szenarien", selectedSzenarioId: "SZN-001" },
    { view: "liquiditaet" },
  ]) {
    const parsed = parseRoute(routeFromState(state));
    assert.equal(parsed.view, state.view);
  }
});

test("Vorsorge-Rail ist adressierbar", () => {
  assert.equal(
    routeFromState({ view: "vorsorge", selectedVorsorgeId: "VS-003" }),
    "#/vorsorge/VS-003",
  );
  assert.equal(routeFromState({ view: "vorsorge", selectedVorsorgeId: "" }), "#/vorsorge");
  assert.deepEqual(parseRoute("#/vorsorge/VS-003"), { view: "vorsorge", selectedVorsorgeId: "VS-003" });
  assert.deepEqual(parseRoute("#/vorsorge"), { view: "vorsorge" });
});

test("routeFromState adressiert das ausgewaehlte Szenario", () => {
  assert.equal(routeFromState({ view: "szenarien", selectedSzenarioId: "SZN-001" }), "#/szenarien/SZN-001");
  assert.equal(routeFromState({ view: "szenarien", selectedSzenarioId: "" }), "#/szenarien");
});

test("parseRoute liest Szenario-Deeplinks", () => {
  assert.deepEqual(parseRoute("#/szenarien/SZN-001"), { view: "szenarien", selectedSzenarioId: "SZN-001" });
  assert.deepEqual(parseRoute("#/szenarien"), { view: "szenarien" });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { routeFromState, parseRoute } from "../app/routing.mjs";
import { LEERE_FILTER } from "../app/navigation.mjs";

test("routeFromState adressiert die ausgewählte Transaktion", () => {
  assert.equal(routeFromState({ view: "transactions", selectedTransactionId: "TXN-5347b957-b93e-4453-830d-81eae240aa51" }), "#/transaktionen/TXN-5347b957-b93e-4453-830d-81eae240aa51");
  assert.equal(routeFromState({ view: "transactions", selectedTransactionId: "" }), "#/transaktionen");
});

test("routeFromState adressiert den Konto-Stammsatz und Vermögens-Positionen", () => {
  assert.equal(routeFromState({ view: "masterdata", masterSection: "konten", selectedKonto: "KTO-001" }), "#/konten/KTO-001");
  assert.equal(routeFromState({ view: "vermoegen", selectedVermoegenId: "konto:KTO-001" }), "#/vermoegen/konten/KTO-001");
  assert.equal(routeFromState({ view: "vermoegen", selectedVermoegenId: "darlehen:DAR-001" }), "#/vermoegen/darlehen/DAR-001");
  assert.equal(routeFromState({ view: "vermoegen", vermoegenTab: "immobilien", selectedVermoegenId: "" }), "#/vermoegen/immobilien");
  assert.equal(routeFromState({ view: "vermoegen", vermoegenTab: "uebersicht" }), "#/vermoegen");
});

test("routeFromState bildet reine Views auf Slugs ab", () => {
  assert.equal(routeFromState({ view: "overview" }), "#/uebersicht");
  assert.equal(routeFromState({ view: "liquiditaet" }), "#/liquiditaet");
  assert.equal(routeFromState({ view: "masterdata" }), "#/administration");
});

test("parseRoute liest Transaktions- und Konto-Deeplinks", () => {
  assert.deepEqual(parseRoute("#/transaktionen/TXN-5347b957-b93e-4453-830d-81eae240aa51"), { view: "transactions", selectedTransactionId: "TXN-5347b957-b93e-4453-830d-81eae240aa51", transactionFilters: LEERE_FILTER });
  assert.deepEqual(parseRoute("#/konten/KTO-001"), { view: "masterdata", masterSection: "konten", selectedKonto: "KTO-001" });
  assert.deepEqual(parseRoute("#/vermoegen/darlehen/DAR-001"), { view: "vermoegen", vermoegenTab: "darlehen", selectedVermoegenId: "darlehen:DAR-001" });
});

test("parseRoute liest reine Views und faellt sauber zurueck", () => {
  assert.deepEqual(parseRoute("#/liquiditaet"), { view: "liquiditaet" });
  assert.deepEqual(parseRoute("#/stammdaten"), { view: "masterdata", masterSection: "konten" });
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

test("Administration: Bereiche sind adressierbar, alte Slugs bleiben gueltig", () => {
  assert.equal(routeFromState({ view: "masterdata", masterSection: "konten" }), "#/administration");
  assert.equal(routeFromState({ view: "masterdata", masterSection: "checks" }), "#/administration/checks");
  assert.equal(routeFromState({ view: "masterdata", masterSection: "export" }), "#/administration/export");
  assert.equal(routeFromState({ view: "masterdata", masterSection: "regeln" }), "#/administration/regeln");
  assert.deepEqual(parseRoute("#/administration"), { view: "masterdata", masterSection: "konten" });
  assert.deepEqual(parseRoute("#/administration/checks"), { view: "masterdata", masterSection: "checks" });
  assert.deepEqual(parseRoute("#/administration/unsinn"), { view: "masterdata", masterSection: "konten" });
  assert.deepEqual(parseRoute("#/checks"), { view: "masterdata", masterSection: "checks" });
  assert.deepEqual(parseRoute("#/export"), { view: "masterdata", masterSection: "export" });
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

test("Vorsorgevertrag und Vorsorge-Tab sind adressierbar", () => {
  assert.equal(
    routeFromState({ view: "vorsorge", selectedVorsorgeId: "VS-003" }),
    "#/vorsorge/VS-003",
  );
  assert.equal(routeFromState({ view: "vorsorge", selectedVorsorgeId: "" }), "#/vorsorge");
  assert.equal(routeFromState({ view: "vorsorge", selectedVorsorgeId: "", vorsorgeTab: "uebersicht" }), "#/vorsorge");
  assert.equal(routeFromState({ view: "vorsorge", selectedVorsorgeId: "", vorsorgeTab: "versicherungen" }), "#/vorsorge/versicherungen");
  assert.equal(routeFromState({ view: "vorsorge", selectedVorsorgeId: "VS-003", vorsorgeTab: "renten" }), "#/vorsorge/VS-003", "Vertrag schlaegt Tab");
  assert.deepEqual(parseRoute("#/vorsorge/VS-003"), { view: "vorsorge", selectedVorsorgeId: "VS-003" });
  assert.deepEqual(parseRoute("#/vorsorge/lebensversicherungen"), { view: "vorsorge", vorsorgeTab: "lebensversicherungen" });
  assert.deepEqual(parseRoute("#/vorsorge/uebersicht"), { view: "vorsorge" });
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

test("Vermoegen: Tabs adressierbar, alte Klassen-Links landen im richtigen Tab", () => {
  assert.deepEqual(parseRoute("#/vermoegen"), { view: "vermoegen", vermoegenTab: "uebersicht" });
  assert.deepEqual(parseRoute("#/vermoegen/immobilien"), { view: "vermoegen", vermoegenTab: "immobilien" });
  assert.deepEqual(parseRoute("#/vermoegen/immobilien/IMM-004"), { view: "vermoegen", vermoegenTab: "immobilien", selectedVermoegenId: "immobilie:IMM-004" });
  assert.deepEqual(parseRoute("#/vermoegen/konto:KTO-001"), { view: "vermoegen", vermoegenTab: "konten", selectedVermoegenId: "konto:KTO-001" });
  assert.deepEqual(parseRoute("#/vermoegen/vermoegenswert:VMW-001"), { view: "vermoegen", vermoegenTab: "sonstige", selectedVermoegenId: "vermoegenswert:VMW-001" });
  assert.deepEqual(parseRoute("#/vermoegen/vorsorge:VS-002"), { view: "vorsorge", selectedVorsorgeId: "VS-002" });
  assert.deepEqual(parseRoute("#/vermoegen/quatsch"), { view: "vermoegen", vermoegenTab: "uebersicht" });
  for (const id of ["immobilie:IMM-004", "darlehen:DAR-002", "konto:KTO-010", "vermoegenswert:VMW-001"]) {
    assert.equal(parseRoute(routeFromState({ view: "vermoegen", selectedVermoegenId: id })).selectedVermoegenId, id);
  }
});

test("Szenarien: Detail gegen ein anderes Szenario und Vergleich mehrerer", () => {
  assert.equal(routeFromState({ view: "szenarien", selectedSzenarioId: "SZN-001", szenarioVergleichMit: "SZN-002" }), "#/szenarien/SZN-001/gegen/SZN-002");
  assert.deepEqual(parseRoute("#/szenarien/SZN-001/gegen/SZN-002"), { view: "szenarien", selectedSzenarioId: "SZN-001", szenarioVergleichMit: "SZN-002" });
  assert.equal(routeFromState({ view: "szenarien", szenarioVergleichIds: ["SZN-001", "SZN-003"] }), "#/szenarien/vergleich/SZN-001,SZN-003");
  assert.deepEqual(parseRoute("#/szenarien/vergleich/SZN-001,SZN-003"), { view: "szenarien", szenarioVergleichIds: ["SZN-001", "SZN-003"] });
  assert.deepEqual(parseRoute("#/szenarien/vergleich/"), { view: "szenarien" });
});

test("Transaktionen gefiltert auf einen Vorsorgevertrag sind adressierbar", () => {
  assert.equal(routeFromState({ view: "transactions", transactionFilters: { vorsorge: "VS-002" } }), "#/transaktionen/vorsorge/VS-002");
  assert.deepEqual(parseRoute("#/transaktionen/vorsorge/VS-002"), { view: "transactions", transactionFilters: { ...LEERE_FILTER, vorsorge: "VS-002" } });
});

test("Termine: Reiter und Regelzahlung adressierbar, alte Regelzahlungs-Links bleiben gueltig", () => {
  assert.equal(routeFromState({ view: "termine", termineTab: "regelzahlungen" }), "#/termine");
  assert.equal(routeFromState({ view: "termine", termineTab: "fristen" }), "#/termine/fristen");
  assert.equal(routeFromState({ view: "termine", termineTab: "regelzahlungen", selectedRegelzahlungId: "RZ-007" }), "#/termine/regelzahlungen/RZ-007");
  assert.deepEqual(parseRoute("#/termine"), { view: "termine", termineTab: "regelzahlungen" });
  assert.deepEqual(parseRoute("#/termine/fristen"), { view: "termine", termineTab: "fristen" });
  assert.deepEqual(parseRoute("#/termine/regelzahlungen/RZ-007"), { view: "termine", termineTab: "regelzahlungen", selectedRegelzahlungId: "RZ-007" });
  assert.deepEqual(parseRoute("#/termine/unbekannt"), { view: "termine", termineTab: "regelzahlungen" });
  assert.deepEqual(parseRoute("#/regelzahlungen"), { view: "termine", termineTab: "regelzahlungen" });
  assert.deepEqual(parseRoute("#/regelzahlungen/RZ-007"), { view: "termine", termineTab: "regelzahlungen", selectedRegelzahlungId: "RZ-007" });
});

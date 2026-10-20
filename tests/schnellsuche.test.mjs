import assert from "node:assert/strict";
import test from "node:test";
import { suchIndex, suche } from "../app/schnellsuche.mjs";

const daten = {
  konten: [{ konto_id: "KTO-001", name: "Gemeinschaftsgiro" }, { konto_id: "KTO-002", name: "Tagesgeld" }],
  kategorien: [{ kategorie_id: "KAT-003", name: "Wohnen & Energie" }],
  regelzahlungen: [{ regelzahlung_id: "RZ-008", bezeichnung: "Deutschlandticket" }],
  vorsorge: [{ vorsorge_id: "VS-003", name: "Lebensversicherung Lena" }],
  immobilien: [{ immobilie_id: "IMM-001", bezeichnung: "Musterhaus" }],
  darlehen: [{ darlehen_id: "DAR-001", bezeichnung: "Baufinanzierung" }],
  vermoegenswerte: [],
  szenarien: [{ szenario_id: "SZN-001", name: "Teilzeit ab 2027" }],
  kategorisierungsregeln: [{ regel_id: "REG-001", matcher: { gegenpartei_enthaelt: "Bäckerei" } }],
};
const seiten = [{ name: "Liquidität", route: "#/liquiditaet" }];
const index = suchIndex(daten, { seiten });

test("ID findet genau das Objekt, mit Route", () => {
  const [erster] = suche(index, "vs-003");
  assert.equal(erster.id, "VS-003");
  assert.equal(erster.route, "#/vorsorge/VS-003");
  assert.equal(suche(index, "RZ-008")[0].route, "#/termine/regelzahlungen/RZ-008");
  assert.equal(suche(index, "KTO-002")[0].route, "#/vermoegen/konten/KTO-002");
  assert.equal(suche(index, "KAT-003")[0].route, "#/transaktionen?kategorie=KAT-003");
});

test("Name: Teilwoerter, Gross-/Kleinschreibung und Umlaute egal; Seiten auch", () => {
  assert.equal(suche(index, "liquiditat")[0].route, "#/liquiditaet");
  assert.equal(suche(index, "deutschland")[0].id, "RZ-008");
  assert.equal(suche(index, "wohnen energie")[0].id, "KAT-003");
  assert.deepEqual(suche(index, "gibtesnicht"), []);
  assert.deepEqual(suche(index, ""), []);
});

test("Buchungs-ID wird direkt angesprungen", () => {
  const [treffer] = suche(index, "TXN-00000000-0000-4000-8000-0000000002a0");
  assert.equal(treffer.art, "buchung");
  assert.equal(treffer.route, "#/transaktionen/TXN-00000000-0000-4000-8000-0000000002a0");
});

test("Vorrang: ID genau vor Name am Anfang vor Name enthalten; hoechstens max Treffer", () => {
  const viele = suchIndex({ konten: Array.from({ length: 30 }, (_, i) => ({ konto_id: `KTO-${100 + i}`, name: `Konto ${i}` })) }, { seiten: [] });
  assert.equal(suche(viele, "konto", 8).length, 8);
  assert.equal(suche(viele, "KTO-105")[0].id, "KTO-105");
});

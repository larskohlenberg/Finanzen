// Fuer wen ist eine Buchung (fuer_person_id, ADR 0039): Filter, Gruppen und
// Detail der Buchungsliste, URL-Zustand und die MCP-Abfrage.
import assert from "node:assert/strict";
import test from "node:test";
import { filtereTransaktionen, transaktionenSeite, transaktionDetail } from "../app/transaktionen-abfrage.mjs";
import { filterAlsQuery, filterAusQuery, aktiveFilter } from "../app/navigation.mjs";
import { abfragen } from "../app/mcp/abfrage.mjs";

const tx = (id, betrag, extra = {}) => ({ transaktion_id: id, buchungsdatum: "2026-03-01", betrag, konto_id: "KTO-1", gegenpartei: "Verein", ...extra });
const daten = {
  personen: [{ person_id: "PER-003", name: "Kind A" }, { person_id: "PER-004", name: "Kind B" }],
  transaktionen: [
    tx("T1", "-49.00", { fuer_person_id: "PER-003", fuer_person_herkunft: "regelzahlung" }),
    tx("T2", "-10.00", { fuer_person_id: "PER-004", fuer_person_herkunft: "regel" }),
    tx("T3", "-98.00"),
    tx("T4", "-20.00", { fuer_person_id: "PER-003", fuer_person_herkunft: "manuell" }),
  ],
};
const ids = (liste) => liste.map((t) => t.transaktion_id);

test("Filter Person: eine Person oder ohne Person", () => {
  assert.deepEqual(ids(filtereTransaktionen(daten, { person: "PER-003" })), ["T1", "T4"]);
  assert.deepEqual(ids(filtereTransaktionen(daten, { person: "ohne" })), ["T3"]);
  assert.equal(filtereTransaktionen(daten, { person: "" }).length, 4);
});

test("Gruppe Person: Summen je Person mit Namen, ohne Person als leerer Schluessel", () => {
  const { gruppen } = transaktionenSeite(daten, { gruppe: "person" });
  assert.deepEqual(gruppen.map((g) => [g.schluessel, g.name, g.anzahl, g.summe_cent]), [
    ["", "", 1, -9800],
    ["PER-003", "Kind A", 2, -6900],
    ["PER-004", "Kind B", 1, -1000],
  ]);
});

test("Detail nennt Person und Herkunft", () => {
  assert.deepEqual(transaktionDetail(daten, daten.transaktionen[0]).person, { person_id: "PER-003", name: "Kind A", herkunft: "regelzahlung" });
  assert.equal(transaktionDetail(daten, daten.transaktionen[2]).person, null);
});

test("URL traegt Person und Gruppe Person; Chip erscheint", () => {
  const query = filterAlsQuery({ person: "PER-003", gruppe: "person" });
  assert.equal(query, "?person=PER-003&gruppe=person");
  const zurueck = filterAusQuery(query.slice(1));
  assert.equal(zurueck.person, "PER-003");
  assert.equal(zurueck.gruppe, "person");
  assert.ok(aktiveFilter(zurueck).some((f) => f.name === "person" && f.wert === "PER-003"));
});

test("MCP-Abfrage: Filter person und gruppieren_nach person mit Namen", () => {
  assert.equal(abfragen(daten.transaktionen, { person: "PER-004" }).anzahl, 1);
  const out = abfragen(daten.transaktionen, { gruppieren_nach: "person" }, { personen: { "PER-003": "Kind A" } });
  assert.deepEqual(out.gruppen.map((g) => [g.schluessel, g.name, g.summe]), [["(ohne)", undefined, "-98.00"], ["PER-003", "Kind A", "-69.00"], ["PER-004", undefined, "-10.00"]]);
});

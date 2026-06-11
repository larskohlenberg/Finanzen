// tests/recategorize.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { recategorize } from "../app/tools/recategorize.mjs";

const regeln = [
  { regel_id: "REG-001", gegenpartei_pattern: "musterladena", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-06-01" },
  { regel_id: "REG-002", gegenpartei_pattern: "musterladenb", kategorie_id: "KAT-005", status: "aktiv", erstellt_am: "2026-06-01" },
];

let txCounter = 0;
function tx(props) {
  txCounter += 1;
  return {
    transaktion_id: `TXN-20260520-${String(txCounter).padStart(6, "0")}`,
    dedupe_hash: `h${txCounter}`,
    rohquelle: "data/inbox/x.csv",
    konto_id: "KTO-001",
    buchungsdatum: "2026-05-20",
    betrag: "-10.00",
    gegenpartei: "",
    verwendungszweck: "",
    ist_transfer: false,
    ...props,
  };
}

test("offen mit Treffer wird vorgeschlagen + herkunft regel", () => {
  const t = tx({ gegenpartei: "MusterladenA Mitte", kategorisierung_status: "offen" });
  const out = recategorize({ transaktionen: [t], regeln });
  const r = out.transaktionen[0];
  assert.equal(r.kategorisierung_status, "vorgeschlagen");
  assert.equal(r.kategorie_id, "KAT-003");
  assert.equal(r.kategorie_herkunft, "regel");
  assert.equal(out.report.neu_vorgeschlagen, 1);
});

test("offen ohne Treffer bleibt offen", () => {
  const t = tx({ gegenpartei: "Unbekannt", kategorisierung_status: "offen" });
  const out = recategorize({ transaktionen: [t], regeln });
  const r = out.transaktionen[0];
  assert.equal(r.kategorisierung_status, "offen");
  assert.equal(Object.hasOwn(r, "kategorie_id"), false);
  assert.equal(Object.hasOwn(r, "kategorie_herkunft"), false);
  assert.equal(out.report.unveraendert, 1);
});

test("bestaetigt+regel mit gleicher Kategorie bleibt unveraendert", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel" });
  const out = recategorize({ transaktionen: [t], regeln });
  assert.deepEqual(out.transaktionen[0], t);
  assert.equal(out.report.unveraendert, 1);
});

test("bestaetigt+regel mit anderer konkreter Kategorie wird wiedervorgelegt", () => {
  // Bestaetigt auf KAT-003, aber das Regelwerk liefert fuer MusterladenB jetzt KAT-005.
  const t = tx({ gegenpartei: "MusterladenB City", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel" });
  const out = recategorize({ transaktionen: [t], regeln });
  const r = out.transaktionen[0];
  assert.equal(r.kategorisierung_status, "vorgeschlagen");
  assert.equal(r.kategorie_id, "KAT-005");
  assert.equal(r.kategorie_herkunft, "regel");
  assert.equal(out.report.wiedervorlage, 1);
});

test("bestaetigt+regel ohne Treffer bleibt unveraendert", () => {
  const t = tx({ gegenpartei: "Unbekannt", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel" });
  const out = recategorize({ transaktionen: [t], regeln });
  assert.deepEqual(out.transaktionen[0], t);
  assert.equal(out.report.unveraendert, 1);
});

test("bestaetigt+regel bei Regel-Konflikt bleibt unveraendert", () => {
  const konfliktRegeln = [
    { regel_id: "REG-A", gegenpartei_pattern: "tankstelle", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-06-01" },
    { regel_id: "REG-B", gegenpartei_pattern: "tankstelle", kategorie_id: "KAT-005", status: "aktiv", erstellt_am: "2026-06-01" },
  ];
  const t = tx({ gegenpartei: "Tankstelle Nord", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel" });
  const out = recategorize({ transaktionen: [t], regeln: konfliktRegeln });
  assert.deepEqual(out.transaktionen[0], t);
  assert.equal(out.report.unveraendert, 1);
});

test("manuell wird nie angefasst, auch wenn eine Regel widerspricht", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-099", kategorie_herkunft: "manuell" });
  const out = recategorize({ transaktionen: [t], regeln });
  assert.deepEqual(out.transaktionen[0], t);
  assert.equal(out.report.uebersprungen, 1);
});

test("abgelehnt wird nie angefasst", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "abgelehnt" });
  const out = recategorize({ transaktionen: [t], regeln });
  assert.deepEqual(out.transaktionen[0], t);
  assert.equal(out.report.uebersprungen, 1);
});

test("vorgeschlagen+regel ohne Treffer wird auf offen zurueckgesetzt", () => {
  // Die Regel, die diesen Vorschlag erzeugt hat, ist weg.
  const t = tx({ gegenpartei: "Unbekannt", kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003", kategorie_herkunft: "regel" });
  const out = recategorize({ transaktionen: [t], regeln });
  const r = out.transaktionen[0];
  assert.equal(r.kategorisierung_status, "offen");
  assert.equal(Object.hasOwn(r, "kategorie_id"), false);
  assert.equal(Object.hasOwn(r, "kategorie_herkunft"), false);
  assert.equal(out.report.zurueckgesetzt, 1);
});

test("erhaelt unbeteiligte Felder", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "offen", bank_referenz: "REF-1", bemerkung: "Notiz" });
  const out = recategorize({ transaktionen: [t], regeln });
  assert.equal(out.transaktionen[0].bank_referenz, "REF-1");
  assert.equal(out.transaktionen[0].bemerkung, "Notiz");
});

test("ist idempotent: zweimal laufen liefert dasselbe Ergebnis", () => {
  const txs = [
    tx({ gegenpartei: "MusterladenA", kategorisierung_status: "offen" }),
    tx({ gegenpartei: "MusterladenB", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel" }),
    tx({ gegenpartei: "Unbekannt", kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003", kategorie_herkunft: "regel" }),
    tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-099", kategorie_herkunft: "manuell" }),
    tx({ gegenpartei: "MusterladenA", kategorisierung_status: "abgelehnt" }),
  ];
  const once = recategorize({ transaktionen: txs, regeln });
  const twice = recategorize({ transaktionen: once.transaktionen, regeln });
  assert.deepEqual(twice.transaktionen, once.transaktionen);
});

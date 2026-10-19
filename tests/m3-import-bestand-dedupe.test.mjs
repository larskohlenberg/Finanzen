// tests/m3-import-bestand-dedupe.test.mjs
// Synthetischer Regressionstest aus einem Musterimport (2026-06-09):
//  - Dedupe prueft gegen den BESTAND, nicht innerhalb desselben Auszugs
//    (ein amtlicher Auszug enthaelt reale Buchungen, keine Importdubletten).
//  - bank_referenz taugt nur als Dedupe-Schluessel, wenn sie im Lauf
//    dateiweit EINDEUTIG ist (MusterbankA verwendet manche Referenzen mehrfach).
import assert from "node:assert/strict";
import { test } from "node:test";
import { runImport } from "../app/tools/import.mjs";

const konten = [{ konto_id: "KTO-001" }];
const kategorien = [];
const regeln = [];

function entry(datum, betrag, gegenpartei, zweck, extra = {}) {
  return { konto_id: "KTO-001", buchungsdatum: datum, betrag, gegenpartei, verwendungszweck: zweck, rohquelle: "data/inbox/test.csv", ...extra };
}

test("intra-file: in allen Quellfeldern identische Zeilen werden BEIDE importiert", () => {
  const e = entry("2026-06-03", "27.00", "Person A", "Rueckbuchung nicht erreichbar");
  const out = runImport({
    entries: [e, { ...e }],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: [], transfers: [],
  });
  assert.equal(out.result.written.length, 2, "beide synthetischen Buchungen geschrieben");
  assert.equal(out.transaktionen.length, 2);
  assert.equal(out.result.skipped_dedupe.length, 0, "nichts intra-file verworfen");
  assert.equal(out.result.disambiguated.length, 1, "zweite Buchung hash-disambiguiert");
  const hashes = out.transaktionen.map((t) => t.dedupe_hash);
  assert.notEqual(hashes[0], hashes[1], "dedupe_hash bleibt eindeutig (Validator-Pflicht)");
});

test("wiederverwendete bank_referenz fuehrt NICHT zu falschem Merge", () => {
  // zwei synthetisch verschiedene Buchungen, von der Bank mit derselben Referenz versehen
  const out = runImport({
    entries: [
      entry("2025-03-10", "-12.00", "Schulverein", "Jahresbeitrag 2025", { bank_referenz: "113-1" }),
      entry("2024-04-05", "-12.00", "Schulverein", "Jahresbeitrag 2024", { bank_referenz: "113-1" }),
    ],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: [], transfers: [],
  });
  assert.equal(out.result.written.length, 2, "beide Buchungen trotz gleicher Referenz importiert");
  // nicht-eindeutige Referenz wird nicht als bank_referenz gespeichert (waere irrefuehrender Dedupe-Key)
  assert.ok(out.transaktionen.every((t) => !Object.hasOwn(t, "bank_referenz")));
});

test("eindeutige bank_referenz ueberlebt Re-Export mit umformatiertem Zweck (ADR 0007)", () => {
  const first = runImport({
    entries: [entry("2026-05-27", "-65.93", "MusteranbieterA", "Festnetz RG 9000000002", { bank_referenz: "TEST-KUNDENREFERENZ-2339" })],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: [], transfers: [],
  });
  assert.equal(first.transaktionen[0].bank_referenz, "TEST-KUNDENREFERENZ-2339", "eindeutige Referenz wird gespeichert");
  const second = runImport({
    entries: [entry("2026-05-27", "-65.93", "MusteranbieterA GmbH", "FESTNETZ Rechnung 9000000002 (re-export)", { bank_referenz: "TEST-KUNDENREFERENZ-2339" })],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: first.transaktionen, transfers: first.transfers,
  });
  assert.equal(second.result.written.length, 0, "per Referenz als Duplikat erkannt");
  assert.equal(second.result.skipped_dedupe.length, 1);
});

test("Re-Import desselben Auszugs ueberspringt auch disambiguierte Doppel", () => {
  const e = entry("2026-06-03", "27.00", "Person A", "Rueckbuchung nicht erreichbar");
  const first = runImport({
    entries: [e, { ...e }],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: [], transfers: [],
  });
  const second = runImport({
    entries: [e, { ...e }],
    konten, kategorien, kategorisierungsregeln: regeln, transaktionen: first.transaktionen, transfers: first.transfers,
  });
  assert.equal(second.result.written.length, 0, "kein Doppelimport beim erneuten Einspielen");
  assert.equal(second.transaktionen.length, 2);
});

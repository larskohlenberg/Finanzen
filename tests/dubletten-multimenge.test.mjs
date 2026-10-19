// Dubletten als Multimenge (Review 0A.13, ADR 0034): Der Import gleicht je
// Konto und Buchungsinhalt Vorkommen ab, statt einen Hash zu verwerfen, bevor
// identische Zeilen disambiguiert sind. Die Bank-Referenz zaehlt nur, wenn sie
// auf dem Konto verlaesslich ist, und nur zusammen mit Datum und Betrag.
import assert from "node:assert/strict";
import { test } from "node:test";
import { runImport } from "../app/tools/import.mjs";
import { computeDedupeHash, disambiguateHash } from "../app/tools/dedupe.mjs";

const konten = [{ konto_id: "KTO-001" }, { konto_id: "KTO-002" }];

function entry(datum, betrag, gegenpartei, zweck, extra = {}) {
  return { konto_id: "KTO-001", buchungsdatum: datum, betrag, gegenpartei, verwendungszweck: zweck, rohquelle: "data/inbox/test.csv", ...extra };
}
const A = entry("2026-06-03", "-4.20", "Testkiosk", "Zwei gleiche Zeilen");
const basis = (e) => computeDedupeHash({ ...e, bank_referenz: undefined });

function lauf(entries, transaktionen = []) {
  return runImport({ entries, konten, kategorien: [], kategorisierungsregeln: [], transaktionen, transfers: [] });
}

// Bestandszeile wie sie ein frueherer Import geschrieben hat.
let laufendeNummer = 0;
function bestand(e, dedupe_hash, extra = {}) {
  laufendeNummer += 1;
  return {
    transaktion_id: `TXN-00000000-0000-4000-8000-${String(laufendeNummer).padStart(12, "0")}`,
    dedupe_hash,
    rohquelle: "data/inbox/processed/frueher.csv",
    konto_id: e.konto_id,
    buchungsdatum: e.buchungsdatum,
    betrag: e.betrag,
    gegenpartei: e.gegenpartei,
    verwendungszweck: e.verwendungszweck,
    kategorisierung_status: "offen",
    ist_transfer: false,
    ...extra,
  };
}

test("Bestand [A] + Export [A,A]: die zweite echte Buchung kommt dazu", () => {
  const erster = lauf([A]);
  const zweiter = lauf([A, { ...A }], erster.transaktionen);
  assert.equal(zweiter.result.written.length, 1);
  assert.equal(zweiter.result.skipped_dedupe.length, 1);
  assert.equal(zweiter.transaktionen.length, 2);
  assert.equal(new Set(zweiter.transaktionen.map((t) => t.dedupe_hash)).size, 2);
});

test("Zuschnitt egal: [A,A] auf einmal oder [A] dann [A,A] ergibt dieselben Schluessel", () => {
  const aufEinmal = lauf([A, { ...A }]).transaktionen.map((t) => t.dedupe_hash).sort();
  const nacheinander = lauf([A, { ...A }], lauf([A]).transaktionen).transaktionen.map((t) => t.dedupe_hash).sort();
  assert.deepEqual(nacheinander, aufEinmal);
  assert.deepEqual(aufEinmal, [basis(A), disambiguateHash(basis(A), 2)].sort());
});

test("Teilweise vorhanden wird als Prueffall ausgewiesen, nicht still entschieden", () => {
  const out = lauf([A, { ...A }], lauf([A]).transaktionen);
  const fall = out.result.pruefen.find((p) => p.art === "teilweise_vorhanden");
  assert.ok(fall, JSON.stringify(out.result.pruefen));
  assert.deepEqual({ in_datei: fall.in_datei, im_bestand: fall.im_bestand, geschrieben: fall.geschrieben }, { in_datei: 2, im_bestand: 1, geschrieben: 1 });
  assert.deepEqual(fall.zeilen, [1, 2]);
});

test("Bestand hat mehr gleiche Buchungen als der Export: nichts geschrieben, Prueffall", () => {
  const out = lauf([A], lauf([A, { ...A }]).transaktionen);
  assert.equal(out.result.written.length, 0);
  assert.ok(out.result.pruefen.some((p) => p.art === "teilweise_vorhanden" && p.in_datei === 1 && p.im_bestand === 2));
});

test("Alt-Hashes: disambiguierter Bestand [A, A#2] + Export [A,A,A] schreibt genau eine mit A#3", () => {
  const alt = [bestand(A, basis(A)), bestand(A, disambiguateHash(basis(A), 2))];
  const out = lauf([A, { ...A }, { ...A }], alt);
  assert.equal(out.result.written.length, 1);
  assert.deepEqual(out.transaktionen.slice(0, 2), alt, "vorhandene IDs und Hashes bleiben unveraendert");
  assert.equal(out.transaktionen[2].dedupe_hash, disambiguateHash(basis(A), 3));
  assert.equal(lauf([A, { ...A }], alt).result.written.length, 0);
});

test("Alt-Hashes mit Luecke: Bestand nur [A#2] + Export [A,A] schreibt eine, ohne Hash-Kollision", () => {
  const alt = [bestand(A, disambiguateHash(basis(A), 2))];
  const out = lauf([A, { ...A }], alt);
  assert.equal(out.result.written.length, 1);
  assert.equal(out.transaktionen[1].dedupe_hash, basis(A), "der freie Grundschluessel wird genutzt");
});

test("Alt-Hash einer spaeter von Hand geaenderten Zeile zaehlt weiter fuer ihren Ursprungsinhalt", () => {
  const alt = [bestand({ ...A, gegenpartei: "Testkiosk (korrigiert)" }, basis(A))];
  assert.equal(lauf([A], alt).result.written.length, 0);
});

test("Referenz: A mit R, dann Export A+B mit R ergibt 2 Buchungen, nicht 3", () => {
  const R = { bank_referenz: "REF-77" };
  const B = entry("2026-06-04", "-9.99", "Testladen", "Etwas anderes", R);
  const erster = lauf([{ ...A, ...R }]);
  const zweiter = lauf([{ ...A, ...R }, B], erster.transaktionen);
  assert.equal(zweiter.transaktionen.length, 2);
  assert.equal(zweiter.result.written.length, 1);
});

test("Referenz: monatlich wiederverwendete Referenz unterschlaegt keine Buchung", () => {
  const R = { bank_referenz: "MONAT-1" };
  const jan = entry("2026-01-15", "-30.00", "Testverein", "Beitrag", R);
  const feb = entry("2026-02-15", "-30.00", "Testverein", "Beitrag", R);
  const out = lauf([feb], lauf([jan]).transaktionen);
  assert.equal(out.result.written.length, 1, "Februar ist eine eigene Buchung");
  assert.deepEqual(out.result.referenz_unzuverlaessig, ["KTO-001"]);
});

test("Referenz bleibt Schluessel ueber umformatierte Re-Exporte (ADR 0007), auch fuer Alt-Hashes", () => {
  const R = { bank_referenz: "STABIL-1" };
  const original = entry("2026-05-27", "-65.93", "Testanbieter", "Festnetz RG 1", R);
  const umformatiert = { ...original, gegenpartei: "Testanbieter GmbH", verwendungszweck: "FESTNETZ Rechnung 1" };
  assert.equal(lauf([umformatiert], lauf([original]).transaktionen).result.written.length, 0);
  // Alt-Bestand: Hash noch aus (Konto, Referenz) gebildet.
  const alt = [bestand(original, computeDedupeHash(original), R)];
  assert.equal(lauf([umformatiert], alt).result.written.length, 0);
});

test("Gleiche Referenz, anderes Datum oder anderer Betrag ist nie dieselbe Buchung", () => {
  const R = { bank_referenz: "STABIL-2" };
  const original = entry("2026-05-27", "-65.93", "Testanbieter", "Festnetz RG 2", R);
  const out = lauf([{ ...original, betrag: "-66.93" }], lauf([original]).transaktionen);
  assert.equal(out.result.written.length, 1);
});

test("Verlaessliche Referenz widerspricht dem Inhaltsabgleich: Prueffall statt still verwerfen", () => {
  const erster = lauf([{ ...A, bank_referenz: "R-1" }]);
  const out = lauf([{ ...A, bank_referenz: "R-2" }], erster.transaktionen);
  assert.equal(out.result.written.length, 0, "Inhalt und Anzahl sagen: schon da");
  assert.ok(out.result.pruefen.some((p) => p.art === "referenz_abweichend" && p.zeilen.includes(1)), JSON.stringify(out.result.pruefen));
});

test("Unverlaessliche Referenz: moegliche Dublette eines umformatierten Re-Exports wird Prueffall", () => {
  const R = { bank_referenz: "DOPPELT" };
  const original = entry("2026-05-27", "-65.93", "Testanbieter", "Festnetz RG 3", R);
  const umformatiert = { ...original, verwendungszweck: "FESTNETZ Rechnung 3" };
  const anderes = entry("2026-05-28", "-1.00", "Testanbieter", "Gebuehr", R);
  const out = lauf([umformatiert, anderes], lauf([original]).transaktionen);
  assert.equal(out.result.written.length, 2, "ohne verlaessliche Referenz entscheidet der Inhalt");
  assert.ok(out.result.pruefen.some((p) => p.art === "moegliche_dublette" && p.zeilen.includes(1)), JSON.stringify(out.result.pruefen));
});

test("Konten sind getrennt: gleicher Inhalt auf anderem Konto ist keine Dublette", () => {
  const out = lauf([{ ...A, konto_id: "KTO-002" }], lauf([A]).transaktionen);
  assert.equal(out.result.written.length, 1);
});

// tests/lernen.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { metriken, gesperrteBelegstufenAus } from "../app/tools/lernen.mjs";

const freigabe = (freigaben, gate_durchfall = [], gesperrte_belegstufen) => ({
  zeitpunkt: "2026-08-31T10:00:00+02:00", anlass: "freigabe", freigaben, gate_durchfall,
  ...(gesperrte_belegstufen ? { gesperrte_belegstufen } : {}),
});
const korrektur = (korrekturen) => ({ zeitpunkt: "2026-08-31T11:00:00+02:00", anlass: "korrektur", korrekturen });
const k = (n, belegstufe = "E2", regel_id = "REG-001") =>
  Array.from({ length: n }, () => ({ regel_id, belegstufe, von_kategorie: "KAT-003", nach_kategorie: "KAT-005" }));

test("leeres Log liefert leere Metriken statt Division durch null", () => {
  const m = metriken([]);
  assert.deepEqual(m.je_regel, []);
  assert.deepEqual(m.gesperrte_belegstufen, []);
  assert.deepEqual(m.stillzulegende_regeln, []);
});

test("Korrekturquote je Regel", () => {
  const m = metriken([freigabe([{ regel_id: "REG-001", belegstufe: "E2", anzahl: 10 }]), korrektur(k(2))]);
  assert.equal(m.je_regel[0].regel_id, "REG-001");
  assert.equal(m.je_regel[0].freigaben, 10);
  assert.equal(m.je_regel[0].korrekturen, 2);
  assert.equal(m.je_regel[0].quote, 0.2);
});

test("Regel ueber 30 Prozent bei mindestens 10 Freigaben wird stillgelegt", () => {
  const m = metriken([freigabe([{ regel_id: "REG-001", belegstufe: "E2", anzahl: 10 }]), korrektur(k(4))]);
  assert.deepEqual(m.stillzulegende_regeln, ["REG-001"]);
});

test("zu wenige Freigaben legen nichts still", () => {
  const m = metriken([freigabe([{ regel_id: "REG-001", belegstufe: "E2", anzahl: 3 }]), korrektur(k(2))]);
  assert.deepEqual(m.stillzulegende_regeln, []);
});

test("Belegstufe ueber 25 Prozent bei mindestens 20 Freigaben wird gesperrt", () => {
  const m = metriken([freigabe([{ regel_id: "REG-002", belegstufe: "E4", anzahl: 20 }]), korrektur(k(6, "E4", "REG-002"))]);
  assert.deepEqual(m.gesperrte_belegstufen, ["E4"]);
});

test("Belegstufe unter 25 Prozent bleibt offen", () => {
  const m = metriken([freigabe([{ regel_id: "REG-002", belegstufe: "E4", anzahl: 20 }]), korrektur(k(4, "E4", "REG-002"))]);
  assert.deepEqual(m.gesperrte_belegstufen, []);
});

test("Hysterese: eine gesperrte Stufe bleibt zwischen 15 und 25 Prozent gesperrt", () => {
  const log = [freigabe([{ regel_id: "REG-002", belegstufe: "E4", anzahl: 20 }]), korrektur(k(4, "E4", "REG-002"))];
  assert.deepEqual(metriken(log, ["E4"]).gesperrte_belegstufen, ["E4"]);
});

test("Hysterese: unter 15 Prozent faellt die Sperre", () => {
  const log = [freigabe([{ regel_id: "REG-002", belegstufe: "E4", anzahl: 20 }]), korrektur(k(2, "E4", "REG-002"))];
  assert.deepEqual(metriken(log, ["E4"]).gesperrte_belegstufen, []);
});

test("zu wenige Freigaben sperren keine Stufe", () => {
  const m = metriken([freigabe([{ regel_id: "REG-002", belegstufe: "E4", anzahl: 5 }]), korrektur(k(5, "E4", "REG-002"))]);
  assert.deepEqual(m.gesperrte_belegstufen, []);
});

test("Gate-Gruende werden gezaehlt", () => {
  const m = metriken([freigabe([], [{ regel_id: "REG-900", grund: "spezifitaet" }, { regel_id: "REG-901", grund: "spezifitaet" }, { regel_id: "REG-902", grund: "belegstufe" }])]);
  assert.equal(m.gate_gruende.spezifitaet, 2);
  assert.equal(m.gate_gruende.belegstufe, 1);
});

test("Agentenvorschlaege ohne regel_id stuerzen nicht ab", () => {
  const m = metriken([freigabe([{ regel_id: null, belegstufe: null, kategorie_id: "KAT-012", anzahl: 5 }])]);
  assert.deepEqual(m.je_regel, []);
});

test("gesperrteBelegstufenAus liest den juengsten Freigabe-Eintrag", () => {
  const log = [freigabe([], [], ["E3"]), freigabe([], [], ["E4"])];
  assert.deepEqual(gesperrteBelegstufenAus(log), ["E4"]);
});

test("gesperrteBelegstufenAus liefert leer, wenn nie protokolliert", () => {
  assert.deepEqual(gesperrteBelegstufenAus([]), []);
});

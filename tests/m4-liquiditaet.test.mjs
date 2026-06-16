import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addInterval,
  occurrences,
  naechsteFaelligkeit,
  computeLiquiditaetIst,
  computeLiquiditaetPrognose,
  computeLiquiditaetPrognoseDetail,
  defaultHorizonEnd,
  localTodayIso,
  periodenSchluessel,
  toCents,
} from "../app/liquiditaet.mjs";

test("addInterval addiert Monate mit Monatsende-Clamping", () => {
  assert.equal(addInterval("2026-01-31", "monat", 1), "2026-02-28");
  assert.equal(addInterval("2026-02-28", "monat", 1), "2026-03-28");
});

test("occurrences liefert nur Faelligkeiten nach heute bis Horizont", () => {
  const rz = { anker_datum: "2026-01-01", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  assert.deepEqual(occurrences(rz, "2026-02-01", "2026-04-01"), ["2026-03-01", "2026-04-01"]);
});

test("naechsteFaelligkeit liefert den naechsten Termin strikt nach heute", () => {
  const rz = { anker_datum: "2026-01-01", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  assert.equal(naechsteFaelligkeit(rz, "2026-02-15"), "2026-03-01");
  // Anker in der Zukunft: der Anker selbst ist die naechste Faelligkeit.
  assert.equal(naechsteFaelligkeit({ ...rz, anker_datum: "2026-07-01" }, "2026-06-16"), "2026-07-01");
});

test("naechsteFaelligkeit klemmt das Monatsende und beachtet aktiv_bis", () => {
  const rz = { anker_datum: "2026-01-31", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  assert.equal(naechsteFaelligkeit(rz, "2026-02-01"), "2026-02-28");
  // aktiv_bis ueberschritten -> keine weitere Faelligkeit.
  assert.equal(naechsteFaelligkeit({ ...rz, aktiv_bis: "2026-02-10" }, "2026-02-15"), null);
});

test("localTodayIso formatiert das lokale Datum ohne UTC-Verschiebung", () => {
  assert.equal(localTodayIso(new Date(2026, 5, 3, 0, 30)), "2026-06-03");
});

test("computeLiquiditaetIst berechnet Live-Saldo aus belegtem Anker plus Buchungen", () => {
  const data = {
    konten: [
      { konto_id: "KTO-001", name: "Giro", kontotyp: "giro", liquiditaetsrelevant: true, status: "aktiv" },
      { konto_id: "KTO-002", name: "Depot", kontotyp: "depot", liquiditaetsrelevant: true, status: "aktiv" },
    ],
    zeitwerte: [
      { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-05-31", qualitaet: "belegt" },
      { entitaet: "konto", entitaet_id: "KTO-002", feld: "depotwert", wert: "9999.00", standdatum: "2026-05-31", qualitaet: "belegt" },
    ],
    transaktionen: [
      { konto_id: "KTO-001", buchungsdatum: "2026-05-31", betrag: "500.00", ist_transfer: false },
      { konto_id: "KTO-001", buchungsdatum: "2026-06-02", betrag: "-200.00", ist_transfer: false },
      { konto_id: "KTO-001", buchungsdatum: "2026-06-03", betrag: "50.00", ist_transfer: true },
      { konto_id: "KTO-001", buchungsdatum: "2026-07-01", betrag: "999.00", ist_transfer: false },
    ],
  };

  const result = computeLiquiditaetIst(data, { today: "2026-06-09" });

  assert.equal(result.saldo_cents, 85000);
  assert.equal(result.qualitaet.fehlende_anker, 0);
  assert.deepEqual(result.monatsverlauf.map((p) => ({ datum: p.datum, saldo_cents: p.saldo_cents, bewegung_cents: p.bewegung_cents })), [
    { datum: "2026-06-01", saldo_cents: 100000, bewegung_cents: 0 },
    { datum: "2026-06-02", saldo_cents: 80000, bewegung_cents: -20000 },
    { datum: "2026-06-03", saldo_cents: 85000, bewegung_cents: 5000 },
  ]);
});

test("computeLiquiditaetIst zaehlt Buchungen vor einem Anker im laufenden Monat nicht doppelt", () => {
  // Anker 15.06. = 1000,00 enthaelt die Buchung vom 05.06. bereits.
  // Der Monatsstart-Saldo muss rueckwaerts vom Anker gerechnet werden (1100,00),
  // damit der Verlauf am Monatsende den KPI-Saldo trifft.
  const data = {
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", liquiditaetsrelevant: true, status: "aktiv" }],
    zeitwerte: [
      { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-06-15", qualitaet: "belegt" },
    ],
    transaktionen: [
      { konto_id: "KTO-001", buchungsdatum: "2026-06-05", betrag: "-100.00", ist_transfer: false },
      { konto_id: "KTO-001", buchungsdatum: "2026-06-18", betrag: "-50.00", ist_transfer: false },
    ],
  };

  const result = computeLiquiditaetIst(data, { today: "2026-06-20" });

  assert.equal(result.saldo_cents, 95000);
  assert.deepEqual(result.monatsverlauf.map((p) => ({ datum: p.datum, saldo_cents: p.saldo_cents, bewegung_cents: p.bewegung_cents })), [
    { datum: "2026-06-01", saldo_cents: 110000, bewegung_cents: 0 },
    { datum: "2026-06-05", saldo_cents: 100000, bewegung_cents: -10000 },
    { datum: "2026-06-18", saldo_cents: 95000, bewegung_cents: -5000 },
  ]);
  assert.equal(result.monatsverlauf.at(-1).saldo_cents, result.saldo_cents);
});

test("computeLiquiditaetIst markiert fehlenden Anker statt Saldo zu raten", () => {
  const data = {
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", liquiditaetsrelevant: true, status: "aktiv" }],
    zeitwerte: [],
    transaktionen: [{ konto_id: "KTO-001", buchungsdatum: "2026-06-02", betrag: "50.00", ist_transfer: false }],
  };

  const result = computeLiquiditaetIst(data, { today: "2026-06-09" });

  assert.equal(result.saldo_cents, 0);
  assert.equal(result.qualitaet.fehlende_anker, 1);
  assert.deepEqual(result.konten[0], { konto_id: "KTO-001", name: "Giro", saldo_cents: null, basis: "anker-fehlt" });
});

test("computeLiquiditaetPrognose schreibt Saldo ab morgen mit bestaetigten Regelzahlungen fort", () => {
  const data = {
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", liquiditaetsrelevant: true, status: "aktiv" }],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-06-01", qualitaet: "belegt" }],
    transaktionen: [{ konto_id: "KTO-001", buchungsdatum: "2026-06-05", betrag: "-100.00", ist_transfer: false }],
    regelzahlungen: [
      { regelzahlung_id: "RZ-001", bezeichnung: "Gehalt", betrag: "3000.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-06-10", status: "bestaetigt" },
      { regelzahlung_id: "RZ-002", bezeichnung: "Miete", betrag: "-1200.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-06-15", status: "bestaetigt" },
      { regelzahlung_id: "RZ-003", bezeichnung: "Vorschlag", betrag: "-50.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-06-20", status: "vorgeschlagen" },
    ],
  };

  const result = computeLiquiditaetPrognose(data, { today: "2026-06-09", horizonEnd: "2026-06-30" });

  assert.equal(result.start_saldo_cents, 90000);
  assert.equal(result.end_saldo_cents, 270000);
  assert.deepEqual(result.verlauf.map((p) => ({ datum: p.datum, saldo_cents: p.saldo_cents, bewegung_cents: p.bewegung_cents })), [
    { datum: "2026-06-10", saldo_cents: 390000, bewegung_cents: 300000 },
    { datum: "2026-06-15", saldo_cents: 270000, bewegung_cents: -120000 },
  ]);
  assert.equal(result.qualitaet.bestaetigte_regelzahlungen, 2);
  assert.equal(result.qualitaet.vorschlaege_nicht_enthalten, 1);
});

test("periodenSchluessel gruppiert Monate nach Monat Quartal Jahr", () => {
  assert.equal(periodenSchluessel("2026-08", "monat"), "2026-08");
  assert.equal(periodenSchluessel("2026-08", "quartal"), "2026-Q3");
  assert.equal(periodenSchluessel("2026-08", "jahr"), "2026");
});

test("computeLiquiditaetPrognoseDetail gruppiert Prognose und fuehrt Saldo je Posten fort", () => {
  const data = {
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", liquiditaetsrelevant: true, status: "aktiv" }],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-06-01", qualitaet: "belegt" }],
    transaktionen: [{ konto_id: "KTO-001", buchungsdatum: "2026-06-05", betrag: "-100.00", ist_transfer: false }],
    regelzahlungen: [
      { regelzahlung_id: "RZ-001", bezeichnung: "Gehalt", betrag: "3000.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-06-10", status: "bestaetigt" },
      { regelzahlung_id: "RZ-002", bezeichnung: "Miete", betrag: "-1200.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-06-15", status: "bestaetigt" },
    ],
  };

  const result = computeLiquiditaetPrognoseDetail(data, { today: "2026-06-09", horizonEnd: "2026-07-31", granularitaet: "quartal" });

  assert.equal(result.start_saldo_cents, 90000);
  assert.equal(result.end_saldo_cents, 450000);
  assert.deepEqual(result.perioden.map((p) => ({ periode: p.periode, bewegung_cents: p.bewegung_cents, saldo_cents: p.saldo_cents })), [
    { periode: "2026-Q2", bewegung_cents: 180000, saldo_cents: 270000 },
    { periode: "2026-Q3", bewegung_cents: 180000, saldo_cents: 450000 },
  ]);
  const juni = result.perioden[0].monate[0];
  assert.equal(juni.monat, "2026-06");
  assert.deepEqual(juni.posten.map((p) => ({ datum: p.datum, bewegung_cents: p.bewegung_cents, saldo_cents: p.saldo_cents })), [
    { datum: "2026-06-10", bewegung_cents: 300000, saldo_cents: 390000 },
    { datum: "2026-06-15", bewegung_cents: -120000, saldo_cents: 270000 },
  ]);
});

test("defaultHorizonEnd faellt auf today+Fallback zurueck, wenn alle unbefristet", () => {
  const liste = [{ regelzahlung_id: "RZ-001", status: "bestaetigt", anker_datum: "2026-01-01", rhythmus_einheit: "monat", rhythmus_intervall: 1 }];
  assert.equal(defaultHorizonEnd(liste, "2026-06-01", 12), "2027-06-01");
});

test("toCents parst Decimal-Strings centgenau", () => {
  assert.equal(toCents("-6008.35"), -600835);
  assert.equal(toCents("0.05"), 5);
});

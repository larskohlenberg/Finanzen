import assert from "node:assert/strict";
import test from "node:test";
import { absicherung, ABSICHERUNG_FELDER } from "../app/absicherung.mjs";
import { computeNettovermoegen } from "../app/vermoegen.mjs";
import { erwarteteLeistungen, rentenStufen } from "../app/vorsorge-rechnung.mjs";
import { validateMasterData } from "../app/tools/validate-core.mjs";

const HEUTE = "2026-10-17";

const zw = (id, feld, wert, standdatum = "2026-01-01") => ({ entitaet: "vorsorge", entitaet_id: id, feld, wert, standdatum, qualitaet: "belegt" });

function daten() {
  return {
    personen: [
      { person_id: "PER-001", name: "Anna Muster", status: "aktiv" },
      { person_id: "PER-002", name: "Ben Muster", status: "aktiv" },
      { person_id: "PER-003", name: "Kind Muster", status: "aktiv" },
      { person_id: "PER-004", name: "Ehemals", status: "inaktiv" },
    ],
    vorsorge: [
      { vorsorge_id: "VS-001", art: "gesetzliche-rente", name: "Gesetzliche Rente Anna", person_id: "PER-001", status: "geplant", kapitalbildend: false, leistung_beginn: "2045-01-01" },
      { vorsorge_id: "VS-002", art: "schutzversicherung", name: "BU Anna", person_id: "PER-001", status: "aktiv", kapitalbildend: false },
      { vorsorge_id: "VS-003", art: "lebensversicherung", name: "Risiko-LV Anna", person_id: "PER-001", status: "aktiv", kapitalbildend: false },
      { vorsorge_id: "VS-004", art: "schutzversicherung", name: "BU alt", person_id: "PER-001", status: "gekuendigt", kapitalbildend: false },
      { vorsorge_id: "VS-005", art: "schutzversicherung", name: "Haftpflicht Ben", person_id: "PER-002", status: "aktiv", kapitalbildend: false },
      { vorsorge_id: "VS-006", art: "schutzversicherung", name: "BU Ehemals", person_id: "PER-004", status: "aktiv", kapitalbildend: false },
    ],
    zeitwerte: [
      zw("VS-001", "erwerbsminderungsrente", "900.00", "2025-07-01"),
      zw("VS-001", "erwerbsminderungsrente", "950.50", "2026-07-01"),
      zw("VS-001", "hinterbliebenenrente", "600.00", "2026-07-01"),
      { ...zw("VS-001", "waisenrente", "200.00", "2026-07-01"), qualitaet: "geschaetzt" },
      zw("VS-001", "erwartete_rente", "1800.00", "2026-07-01"),
      zw("VS-002", "bu_rente", "1500.00", "2026-03-01"),
      zw("VS-002", "bu_rente", "1600.00", "2027-01-01"), // nach dem Stichtag, zaehlt noch nicht
      zw("VS-003", "todesfallleistung", "150000.00", "2026-02-01"),
      zw("VS-004", "bu_rente", "800.00", "2024-01-01"),
      zw("VS-006", "bu_rente", "500.00", "2026-01-01"),
    ],
  };
}

const ohneAbsicherung = (d) => ({ ...d, zeitwerte: d.zeitwerte.filter((z) => !ABSICHERUNG_FELDER.includes(z.feld)) });

test("absicherung: je aktiver Person mit Vertrag BU und Tod mit Summen und Posten", () => {
  const ergebnis = absicherung(daten(), HEUTE);
  assert.deepEqual(ergebnis.map((p) => p.person_id), ["PER-001", "PER-002"]);
  const anna = ergebnis[0];
  assert.equal(anna.name, "Anna Muster");
  assert.equal(anna.bu.monatlich_cents, 245050);
  assert.deepEqual(anna.bu.posten, [
    { vorsorge_id: "VS-002", name: "BU Anna", feld: "bu_rente", wert_cents: 150000, standdatum: "2026-03-01", qualitaet: "belegt", einkommensanrechnung: false },
    { vorsorge_id: "VS-001", name: "Gesetzliche Rente Anna", feld: "erwerbsminderungsrente", wert_cents: 95050, standdatum: "2026-07-01", qualitaet: "belegt", einkommensanrechnung: false },
  ]);
  assert.equal(anna.tod.einmalig_cents, 15000000);
  assert.equal(anna.tod.monatlich_cents, 80000);
  assert.deepEqual(anna.tod.posten.map((p) => [p.vorsorge_id, p.feld, p.qualitaet, p.einkommensanrechnung]), [
    ["VS-003", "todesfallleistung", "belegt", false],
    ["VS-001", "hinterbliebenenrente", "belegt", true],
    ["VS-001", "waisenrente", "geschaetzt", false],
  ]);
});

test("absicherung: Person ohne Werte bekommt leere Faelle", () => {
  const ben = absicherung(daten(), HEUTE).find((p) => p.person_id === "PER-002");
  assert.deepEqual(ben.bu, { monatlich_cents: 0, posten: [] });
  assert.deepEqual(ben.tod, { einmalig_cents: 0, monatlich_cents: 0, posten: [] });
});

test("absicherung: beendete Vertraege und Personen mit aktiv_bis in der Vergangenheit fallen weg", () => {
  const d = daten();
  d.personen[1].aktiv_bis = "2026-01-31";
  const ergebnis = absicherung(d, HEUTE);
  assert.deepEqual(ergebnis.map((p) => p.person_id), ["PER-001"]);
  assert.ok(!ergebnis[0].bu.posten.some((p) => p.vorsorge_id === "VS-004"));
});

test("absicherung: leerer Bestand liefert leere Liste", () => {
  assert.deepEqual(absicherung({}, HEUTE), []);
  assert.deepEqual(ABSICHERUNG_FELDER, ["bu_rente", "erwerbsminderungsrente", "todesfallleistung", "hinterbliebenenrente", "waisenrente"]);
});

test("Absicherungswerte zaehlen weder ins Vermoegen noch als Altersleistung", () => {
  const d = daten();
  const rest = { konten: [], immobilien: [], darlehen: [], vermoegenswerte: [], transaktionen: [] };
  assert.deepEqual(computeNettovermoegen({ ...d, ...rest }, HEUTE), computeNettovermoegen({ ...ohneAbsicherung(d), ...rest }, HEUTE));
  assert.deepEqual(rentenStufen(d, HEUTE), rentenStufen(ohneAbsicherung(d), HEUTE));
  assert.deepEqual(erwarteteLeistungen(d, HEUTE), erwarteteLeistungen(ohneAbsicherung(d), HEUTE));
});

test("Validator erlaubt die Absicherungsfelder nur fuer Vorsorge", () => {
  const basis = {
    personen: [{ person_id: "PER-001", name: "Anna", status: "aktiv" }],
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", person_ids: ["PER-001"], status: "aktiv", waehrung: "EUR" }],
    vorsorge: [{ vorsorge_id: "VS-001", art: "schutzversicherung", name: "BU", person_id: "PER-001", status: "aktiv", kapitalbildend: false }],
  };
  for (const feld of ABSICHERUNG_FELDER) {
    const ok = validateMasterData({ ...basis, zeitwerte: [zw("VS-001", feld, "1000.00")] });
    assert.ok(!ok.errors.some((e) => e.includes(feld)), ok.errors.join("\n"));
    const falsch = validateMasterData({ ...basis, zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld, wert: "1.00", standdatum: "2026-01-01", qualitaet: "belegt" }] });
    assert.ok(falsch.errors.some((e) => e.includes(`${feld} ist fuer konto nicht zulaessig`)), falsch.errors.join("\n"));
  }
});

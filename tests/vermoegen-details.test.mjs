import test from "node:test";
import assert from "node:assert/strict";
import { darlehensplan, restschuldHeute } from "../app/vermoegen.mjs";
import {
  darlehenKennzahlen, darlehensKategorien, immobilienKennzahlen, immobilienMonate, kontoSaldoVerlauf,
} from "../app/vermoegen-details.mjs";

const darlehen = {
  darlehen_id: "DAR-001", bezeichnung: "Testdarlehen", status: "aktiv",
  anfangsbetrag: "120000.00", anfangsdatum: "2020-01-31", zinssatz: "3.00", sollrate: "1000.00",
  rhythmus_einheit: "monat", rhythmus_intervall: 1, laufzeit_bis: "2040-12-31", zinsbindung_bis: "2027-01-31",
  immobilie_id: "IMM-001",
};
const anker = { entitaet: "darlehen", entitaet_id: "DAR-001", feld: "restschuld", wert: "100000.00", standdatum: "2026-01-31", qualitaet: "belegt" };

test("darlehensplan: Annuitaet ab Anker, erste Rate 250 Zins und 750 Tilgung", () => {
  const plan = darlehensplan(darlehen, [anker], "2026-03-31");
  assert.equal(plan.anker, anker);
  assert.deepEqual(plan.raten[0], { datum: "2026-02-28", zins_cents: 25000, tilgung_cents: 75000, rest_cents: 9925000 });
  assert.equal(plan.raten.length, 2);
});

test("darlehensplan: ohne Anker null, endet bei Rest 0", () => {
  assert.equal(darlehensplan(darlehen, [], "2030-01-01"), null);
  const plan = darlehensplan(darlehen, [{ ...anker, wert: "1500.00" }], "2040-12-31");
  assert.equal(plan.raten.length, 2);
  assert.equal(plan.raten.at(-1).rest_cents, 0);
  assert.equal(plan.raten.at(-1).tilgung_cents, 50375);
});

test("darlehensplan: Rate deckt den Zins nicht — Plan endet an der Grenze", () => {
  const teuer = { ...darlehen, sollrate: "100.00" };
  const plan = darlehensplan(teuer, [anker], "2027-01-31");
  assert.equal(plan.raten.length, 12);
  assert.ok(plan.raten.at(-1).rest_cents > 10000000);
});

test("restschuldHeute rechnet ueber darlehensplan und bleibt gleich", () => {
  const r = restschuldHeute(darlehen, [anker], "2026-03-31");
  assert.equal(r.wert_cents, darlehensplan(darlehen, [anker], "2026-03-31").raten.at(-1).rest_cents);
  assert.deepEqual(r.punkte.map((p) => p.datum), ["2026-01-31", "2026-02-28", "2026-03-31"]);
});

test("darlehenKennzahlen: getilgt, Zinsen seit Anker, Rest zum Zinsbindungsende, Jahre", () => {
  const k = darlehenKennzahlen(darlehen, [anker], "2026-03-31");
  assert.equal(k.rest_heute_cents, 9849813);
  assert.equal(k.getilgt_cents, 12000000 - 9849813);
  assert.equal(k.zinsen_seit_anker_cents, 25000 + 24813);
  assert.equal(k.naechste_rate.datum, "2026-04-30");
  const bindung = k.raten.filter((r) => r.datum <= "2027-01-31").at(-1).rest_cents;
  assert.equal(k.rest_zinsbindung_cents, bindung);
  const j2026 = k.jahre.find((j) => j.jahr === 2026);
  assert.equal(j2026.ist, true);
  assert.equal(k.jahre.find((j) => j.jahr === 2027).ist, false);
  assert.equal(j2026.zins_cents + j2026.tilgung_cents, 11 * 100000);
  assert.equal(darlehenKennzahlen(darlehen, [], "2026-03-31"), null);
});

function daten() {
  return {
    immobilien: [{ immobilie_id: "IMM-001", bezeichnung: "Haus", status: "aktiv", anschaffungskosten: "300000.00", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 2 }, { person_id: "PER-002", zaehler: 1, nenner: 2 }] }],
    darlehen: [darlehen, { ...darlehen, darlehen_id: "DAR-002", status: "abgeloest" }],
    zeitwerte: [anker, { entitaet: "immobilie", entitaet_id: "IMM-001", feld: "marktwert", wert: "400000.00", standdatum: "2025-12-31", qualitaet: "geschaetzt" }],
    regelzahlungen: [{ regelzahlung_id: "RZ-001", darlehen_id: "DAR-001", kategorie_id: "KAT-024" }, { regelzahlung_id: "RZ-002", kategorie_id: "KAT-001" }],
    konten: [{ konto_id: "KTO-001", kontotyp: "giro", status: "aktiv" }],
    transaktionen: [
      { konto_id: "KTO-001", immobilie_id: "IMM-001", buchungsdatum: "2026-01-03", betrag: "900.00", kategorie_id: "KAT-030" },
      { konto_id: "KTO-001", immobilie_id: "IMM-001", buchungsdatum: "2026-01-31", betrag: "-1000.00", kategorie_id: "KAT-024" },
      { konto_id: "KTO-001", immobilie_id: "IMM-001", buchungsdatum: "2026-02-10", betrag: "-120.50", kategorie_id: "KAT-031" },
      { konto_id: "KTO-001", immobilie_id: "IMM-001", buchungsdatum: "2026-02-11", betrag: "-500.00", kategorie_id: "KAT-031", ist_transfer: true },
      { konto_id: "KTO-001", immobilie_id: "IMM-001", buchungsdatum: "2026-03-02", betrag: "-50.00", kategorie_id: "KAT-031" },
      { konto_id: "KTO-001", buchungsdatum: "2026-02-15", betrag: "-10.00" },
    ],
  };
}

test("immobilienKennzahlen: anteiliger Wert, nur aktive Darlehen, Eigenkapital, Wertaenderung", () => {
  const k = immobilienKennzahlen(daten(), "IMM-001", "2026-01-31");
  assert.equal(k.marktwert_cents, 40000000);
  assert.equal(k.anteilig_cents, 40000000);
  assert.deepEqual(k.darlehen_ids, ["DAR-001"]);
  assert.equal(k.restschuld_cents, 10000000);
  assert.equal(k.eigenkapital_cents, 30000000);
  assert.equal(k.beleihung, 0.25);
  assert.equal(k.wertaenderung_cents, 10000000);
});

test("immobilienKennzahlen: ohne Marktwert und ohne Darlehen bleibt es bei null", () => {
  const d = daten();
  d.zeitwerte = [];
  d.darlehen = [];
  const k = immobilienKennzahlen(d, "IMM-001", "2026-01-31");
  assert.equal(k.marktwert_cents, null);
  assert.equal(k.eigenkapital_cents, null);
  assert.equal(k.restschuld_cents, 0);
  assert.deepEqual(k.darlehen_ids, []);
});

test("immobilienMonate: abgeschlossene Monate, Transfers raus, Kategorien und Saldo", () => {
  const m = immobilienMonate(daten(), "IMM-001", "2026-03-15", { anzahl: 3 });
  assert.deepEqual(m.monate, ["2025-12", "2026-01", "2026-02"]);
  assert.deepEqual(m.einnahmen, [0, 90000, 0]);
  assert.deepEqual(m.ausgaben, [0, 100000, 12050]);
  assert.deepEqual(m.saldo, [0, -10000, -12050]);
  assert.deepEqual(m.kategorien.map((k) => k.kategorie_id), ["KAT-030", "KAT-031", "KAT-024"]);
  assert.equal(m.anzahl_buchungen, 3);

  const ohne = immobilienMonate(daten(), "IMM-001", "2026-03-15", { anzahl: 3, ohneKategorien: darlehensKategorien(daten(), ["DAR-001"]) });
  assert.deepEqual(ohne.ausgaben, [0, 0, 12050]);
  assert.ok(!ohne.kategorien.some((k) => k.kategorie_id === "KAT-024"));
});

test("darlehensKategorien: Kategorien der Regelzahlungen dieser Darlehen", () => {
  assert.deepEqual([...darlehensKategorien(daten(), ["DAR-001"])], ["KAT-024"]);
  assert.deepEqual([...darlehensKategorien(daten(), [])], []);
});

test("kontoSaldoVerlauf: Monatsenden rueckgerechnet vom heutigen Stand", () => {
  const d = daten();
  d.zeitwerte.push({ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2025-12-31", qualitaet: "belegt" });
  const verlauf = kontoSaldoVerlauf(d, d.konten[0], "2026-03-15", 3);
  // Heute: 1000 + 900 - 1000 - 120.50 - 500 - 10 - 50 = 219.50
  assert.deepEqual(verlauf.map((p) => [p.datum, p.wert_cents]), [
    ["2026-01-31", 90000],
    ["2026-02-28", 26950],
    ["2026-03-15", 21950],
  ]);
  assert.deepEqual(kontoSaldoVerlauf(d, { konto_id: "KTO-009", kontotyp: "giro" }, "2026-03-15"), []);
});

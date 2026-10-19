// Ein Zahlungsereignis-Modell fuer Darlehen (Review Welle 2, 2.3): Zahlung, Zins,
// Tilgung, Rest aus einer Quelle; Ganzzahl-Zins (F22); Regelzahlungen als
// Gueltigkeitsabschnitte; eine Rhythmus-Expansion und Perioden/Jahr-Tabelle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { betragJeMonatCents, termine, zinsJePeriodeCents } from "../app/rhythmus.mjs";
import { zahlungsplan } from "../app/darlehen.mjs";
import { computeVermoegenChecks, darlehensplan, restschuldHeute } from "../app/vermoegen.mjs";
import { rechneSzenario } from "../app/szenarien.mjs";
import { occurrences } from "../app/liquiditaet.mjs";
import { termineImZeitraum } from "../app/plan-ist.mjs";

const darlehen = (extra = {}) => ({ darlehen_id: "DAR-001", bezeichnung: "Kredit", status: "aktiv", anfangsbetrag: "10000.00", anfangsdatum: "2026-01-01", zinssatz: "0.35", sollrate: "1000.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, ...extra });
const anker = (wert, standdatum) => ({ entitaet: "darlehen", entitaet_id: "DAR-001", feld: "restschuld", wert, standdatum, qualitaet: "belegt" });
const rz = (id, betrag, anker_datum, extra = {}) => ({ regelzahlung_id: id, bezeichnung: id, betrag, rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum, status: "bestaetigt", qualitaet: "belegt", darlehen_id: "DAR-001", kategorie_id: "KAT-013", konto_id: "KTO-001", erstellt_am: "2026-01-01", ...extra });

test("F22: Zins ganzzahlig, halbe Cent kaufmaennisch auf (24,5 Cent -> 25)", () => {
  // 840,00 EUR x 0,35 % / 12 = 24,5 Cent; Gleitkomma ergab 24.
  assert.equal(zinsJePeriodeCents(84000, "0.35", "monat", 1), 25);
  assert.equal(zinsJePeriodeCents(84000, "0.3500", "monat", 1), 25);
  assert.equal(zinsJePeriodeCents(84000, "0.35", "monat", 3), 74, "quartalsweise: 73,5 -> 74");
  assert.equal(zinsJePeriodeCents(0, "4.20", "monat", 1), 0);
  const plan = darlehensplan(darlehen(), [anker("840.00", "2026-01-01")], "2026-02-01");
  assert.equal(plan.raten[0].zins_cents, 25);
});

test("eine Rhythmus-Expansion: vorwaerts, Ende, rueckwaerts; eine Perioden/Jahr-Tabelle", () => {
  assert.deepEqual(termine("2026-01-31", "monat", 1, { nach: "2026-01-31", bis: "2026-04-30" }), ["2026-02-28", "2026-03-31", "2026-04-30"]);
  assert.deepEqual(termine("2026-01-15", "monat", 1, { von: "2025-11-01", bis: "2026-02-15", vorAnker: true }), ["2025-11-15", "2025-12-15", "2026-01-15", "2026-02-15"]);
  assert.deepEqual(termine("2026-01-15", "woche", 2, { bis: "2026-02-15", ende: "2026-02-01" }), ["2026-01-15", "2026-01-29"]);
  const r = rz("RZ-1", "-10.00", "2026-01-31", { aktiv_bis: "2026-03-31" });
  assert.deepEqual(occurrences(r, "2026-01-31", "2026-12-31"), ["2026-02-28", "2026-03-31"]);
  assert.deepEqual(termineImZeitraum(r, "2025-12-01", "2026-12-31"), ["2025-12-31", "2026-01-31", "2026-02-28", "2026-03-31"]);
  assert.equal(betragJeMonatCents(-12000, "jahr", 1), -1000);
  assert.equal(betragJeMonatCents(-1000, "woche", 1), -4333);
});

test("Regelzahlung des Darlehens bestimmt Termin und Betrag; Vertragsplan nur, wo keine gilt", () => {
  // Vertrag: Rate 1000 am 1.; Regelzahlung ab 3.4. mit 1200.
  const plan = zahlungsplan(darlehen({ zinssatz: "0.00" }), { start: { datum: "2026-01-01", rest_cents: 1000000 }, bis: "2026-06-30", regelzahlungen: [rz("RZ-1", "-1200.00", "2026-04-03")] });
  assert.deepEqual(plan.ereignisse.map((e) => [e.datum, e.zahlung_cents, e.quelle]), [
    ["2026-02-01", 100000, "vertrag"],
    ["2026-03-01", 100000, "vertrag"],
    ["2026-04-03", 120000, "regelzahlung"],
    ["2026-05-03", 120000, "regelzahlung"],
    ["2026-06-03", 120000, "regelzahlung"],
  ]);
  assert.equal(plan.ereignisse.at(-1).rest_cents, 1000000 - 2 * 100000 - 3 * 120000);
});

test("Regelzahlungsaenderung als Gueltigkeitsabschnitte", () => {
  const rzs = [rz("RZ-1", "-1000.00", "2026-02-01", { aktiv_bis: "2026-03-31" }), rz("RZ-2", "-1500.00", "2026-04-01")];
  const plan = zahlungsplan(darlehen({ zinssatz: "0.00" }), { start: { datum: "2026-01-01", rest_cents: 1000000 }, bis: "2026-05-31", regelzahlungen: rzs });
  assert.deepEqual(plan.ereignisse.map((e) => [e.datum, e.zahlung_cents, e.regelzahlung_id ?? null]), [
    ["2026-02-01", 100000, "RZ-1"], ["2026-03-01", 100000, "RZ-1"], ["2026-04-01", 150000, "RZ-2"], ["2026-05-01", 150000, "RZ-2"],
  ]);
});

test("Schlussrate am Zahlungsdatum der Regelzahlung, Rest + Zins, danach nichts", () => {
  const plan = zahlungsplan(darlehen({ zinssatz: "1.20" }), { start: { datum: "2026-01-01", rest_cents: 150000 }, bis: "2026-12-31", regelzahlungen: [rz("RZ-1", "-1000.00", "2026-01-03")] });
  assert.equal(plan.ereignisse.length, 2);
  // Zins Jan: 150000 x 1,2 % / 12 = 150; Rest 150000 + 150 - 100000 = 50150; Zins Feb 50,15 -> 50.
  assert.deepEqual(plan.schluss, { datum: "2026-02-03", via: "rate", zahlung_cents: 50200, regelzahlung_id: "RZ-1" });
  for (const e of plan.ereignisse) assert.equal(e.zahlung_cents, e.zins_cents + e.tilgung_cents);
});

test("Restschuld heute folgt den Terminen der Regelzahlung", () => {
  const d = darlehen({ zinssatz: "0.00" });
  const rzs = [rz("RZ-1", "-1200.00", "2026-02-03")];
  // Stichtag 2. Maerz: Vertrag haette am 1.3. gezahlt, die Regelzahlung zahlt erst am 3.3.
  assert.equal(restschuldHeute(d, [anker("10000.00", "2026-01-15")], "2026-03-02", rzs).wert_cents, 1000000 - 120000);
});

test("Szenario: Tilgung und Geldfluss aus derselben Quelle (abweichende Regelzahlung)", () => {
  const HEUTE = "2026-06-22";
  const data = {
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    transaktionen: [], immobilien: [], vermoegenswerte: [], vorsorge: [],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "50000.00", standdatum: HEUTE, qualitaet: "belegt" }, anker("10000.00", HEUTE)],
    darlehen: [darlehen({ zinssatz: "2.40", sollrate: "1000.00" })],
    regelzahlungen: [rz("RZ-1", "-1300.00", "2026-07-03")],
  };
  const r = rechneSzenario(data, { szenario_id: "SZN-001", name: "T", status: "entwurf", stand: HEUTE, reichweite_bis: "2027-06-30", erstellt_am: HEUTE, annahmen: [] }, HEUTE);
  const ende = r.punkte.at(-1);
  assert.equal(ende.restschuld_cents, 0);
  // Geldabfluss = Tilgung + Zinsen: liquide sinkt um Schuld plus Zinsen, keine Rate nach der Schlussrate.
  const plan = zahlungsplan(data.darlehen[0], { start: { datum: HEUTE, rest_cents: 1000000 }, bis: "2027-06-30", regelzahlungen: data.regelzahlungen });
  const zinsen = plan.ereignisse.reduce((a, e) => a + e.zins_cents, 0);
  assert.equal(5000000 - ende.liquide_cents, 1000000 + zinsen);
  assert.equal(plan.schluss.datum, "2027-02-03");
});

test("Check: Regelzahlung weicht heute von der Sollrate ab", () => {
  const data = { darlehen: [darlehen()], zeitwerte: [anker("5000.00", "2026-01-01")], regelzahlungen: [rz("RZ-1", "-1200.00", "2026-01-03")], konten: [], vorsorge: [], immobilien: [], vermoegenswerte: [], fristen: [] };
  const c = computeVermoegenChecks(data, "2026-03-01").filter((x) => x.art === "darlehen-rate-abweichung");
  assert.equal(c.length, 1);
  assert.equal(c[0].entitaet_id, "DAR-001");
  data.regelzahlungen[0].betrag = "-1000.00";
  assert.equal(computeVermoegenChecks(data, "2026-03-01").filter((x) => x.art === "darlehen-rate-abweichung").length, 0);
});

test("Review: Ende einer Regelzahlung mitten in der Periode verliert keine Rate", () => {
  // Regelzahlung am 15. bis 10.12.; Vertrag am 1.: im Dezember zahlt der Vertrag.
  const plan = zahlungsplan(darlehen({ zinssatz: "0.00" }), { start: { datum: "2026-10-31", rest_cents: 1000000 }, bis: "2027-01-31", regelzahlungen: [rz("RZ-1", "-1000.00", "2026-01-15", { aktiv_bis: "2026-12-10" })] });
  assert.deepEqual(plan.ereignisse.map((e) => [e.datum, e.quelle]), [["2026-11-15", "regelzahlung"], ["2026-12-01", "vertrag"], ["2027-01-01", "vertrag"]]);
});

test("Review: zweite verknuepfte Zahlung im anderen Rhythmus tilgt ohne Zins; Gutschriften zaehlen nicht", () => {
  const rzs = [rz("RZ-1", "-1000.00", "2026-01-01"), rz("RZ-2", "-500.00", "2026-06-01", { rhythmus_einheit: "jahr" }), rz("RZ-3", "200.00", "2026-01-01")];
  const plan = zahlungsplan(darlehen({ zinssatz: "1.20" }), { start: { datum: "2026-05-15", rest_cents: 1000000 }, bis: "2026-06-30", regelzahlungen: rzs });
  assert.deepEqual(plan.ereignisse.map((e) => [e.datum, e.regelzahlung_id, e.zins_cents]), [["2026-06-01", "RZ-1", 1000], ["2026-06-01", "RZ-2", 0]]);
});

test("Review: Szenario bucht ohne verknuepfte Regelzahlung kein Vertragsgeld (keine Doppelbuchung)", () => {
  const HEUTE = "2026-06-22";
  const data = {
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    transaktionen: [], immobilien: [], vermoegenswerte: [], vorsorge: [],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "50000.00", standdatum: HEUTE, qualitaet: "belegt" }, anker("10000.00", HEUTE)],
    darlehen: [darlehen({ zinssatz: "0.00" })],
    regelzahlungen: [rz("RZ-1", "-1000.00", "2026-07-01", { darlehen_id: undefined })],
  };
  const r = rechneSzenario(data, { szenario_id: "SZN-001", name: "T", status: "entwurf", stand: HEUTE, reichweite_bis: "2026-12-31", erstellt_am: HEUTE, annahmen: [] }, HEUTE);
  assert.equal(r.punkte.at(-1).liquide_cents, 5000000 - 6 * 100000, "nur die unverknuepfte Regelzahlung fliesst ab");
});

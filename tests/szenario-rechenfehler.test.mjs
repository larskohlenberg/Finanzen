// Szenario-Rechenfehler aus dem Architektur-Review (0A.4): Schlussrate (F4),
// Startbestand (F5), Reihenfolge von Regelzahlungsaenderungen (F7).
import { test } from "node:test";
import assert from "node:assert/strict";
import { rechneSzenario, modifizierteRegelzahlungen } from "../app/szenarien.mjs";
import { computeNettovermoegen } from "../app/vermoegen.mjs";
import { occurrences } from "../app/liquiditaet.mjs";

const HEUTE = "2026-06-22";
const giro = { konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" };
const zw = (entitaet, entitaet_id, feld, wert, standdatum = HEUTE, qualitaet = "belegt") => ({ entitaet, entitaet_id, feld, wert, standdatum, qualitaet });
const sz = (annahmen = [], reichweite_bis = "2026-12-31") => ({ szenario_id: "SZN-001", name: "T", status: "entwurf", stand: HEUTE, reichweite_bis, erstellt_am: HEUTE, annahmen });
const rate = (extra = {}) => ({ regelzahlung_id: "RZ-001", bezeichnung: "Rate", betrag: "-1000.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-01", status: "bestaetigt", qualitaet: "belegt", darlehen_id: "DAR-001", erstellt_am: HEUTE, ...extra });
const darlehen = (extra = {}) => ({ darlehen_id: "DAR-001", bezeichnung: "Kredit", status: "aktiv", anfangsdatum: "2026-01-01", zinssatz: "0.00", sollrate: "1000.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, ...extra });

function mitDarlehen({ liquide = "1000.00", rest = "1000.00", restDatum = HEUTE, dar = {}, rzs = [rate()], tx = [] } = {}) {
  return { konten: [giro], transaktionen: tx, immobilien: [], vermoegenswerte: [], vorsorge: [],
    zeitwerte: [zw("konto", "KTO-001", "kontostand", liquide), zw("darlehen", "DAR-001", "restschuld", rest, restDatum)],
    darlehen: [darlehen(dar)], regelzahlungen: rzs };
}
const ende = (r) => r.punkte.at(-1);

// ---------------------------------------------------------------- F4 Schlussrate

test("F4: Schlussrate fliesst ab, wenn sie die Schuld tilgt (1.000 liquide + 1.000 Schuld)", () => {
  const r = rechneSzenario(mitDarlehen(), sz(), HEUTE);
  assert.equal(ende(r).restschuld_cents, 0);
  assert.equal(ende(r).liquide_cents, 0);
  assert.equal(ende(r).netto_cents, r.punkte[0].netto_cents);
});

test("F4: Schlussrate = Rest + Zins, nicht die volle Sollrate", () => {
  // 1.500 Schuld, 0 % -> 1.000 am 01.07., Schlussrate 500 am 01.08., danach nichts mehr
  const r = rechneSzenario(mitDarlehen({ liquide: "5000.00", rest: "1500.00" }), sz(), HEUTE);
  assert.equal(ende(r).restschuld_cents, 0);
  assert.equal(ende(r).liquide_cents, 500000 - 150000);
  assert.equal(r.punkte.find((p) => p.monat === "2026-08").aus_cents, -50000);
});

test("F4: Schlussrate mit Zins: Rest + Zins der letzten Periode", () => {
  // 12 % p.a. monatlich: 1.000 -> Zins 10, Rate 1.000, Rest 10; dann Zins 0,10, Schlussrate 10,10
  const r = rechneSzenario(mitDarlehen({ liquide: "2000.00", dar: { zinssatz: "12.00" } }), sz(), HEUTE);
  assert.equal(ende(r).restschuld_cents, 0);
  assert.equal(ende(r).liquide_cents, 200000 - 100000 - 1010);
});

test("F4: Volltilgung durch Sondertilgung am Ratentag: Rate zuerst, keine weitere Rate", () => {
  // 3.000 Schuld; Rate 01.07. (1.000) und Sondertilgung 01.07. ueber 5.000 -> effektiv 2.000
  const r = rechneSzenario(mitDarlehen({ liquide: "10000.00", rest: "3000.00" }),
    sz([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "belegt", datum: "2026-07-01", betrag: "-5000.00", gegenbuchung: { ziel_typ: "darlehen", ziel_id: "DAR-001" } }]), HEUTE);
  assert.equal(ende(r).restschuld_cents, 0);
  assert.equal(ende(r).liquide_cents, 1000000 - 300000);
});

test("F4: historisch getilgtes Darlehen erzeugt keine Zahlung in der Zukunft", () => {
  // Anker 2026-03-31 ueber 2.000: Raten 01.04. und 01.05. tilgen vor heute (verbucht), ab Juli nichts
  const r = rechneSzenario(mitDarlehen({ liquide: "3000.00", rest: "2000.00", restDatum: "2026-03-31", rzs: [rate({ anker_datum: "2026-04-01" })] }), sz(), HEUTE);
  assert.equal(ende(r).restschuld_cents, 0);
  assert.equal(ende(r).liquide_cents, 300000);
});

test("F4: Schlussrate am Rechenstichtag selbst ist bereits verbucht und zaehlt nicht doppelt", () => {
  // Anker 2026-05-31 ueber 1.500: 01.06. Rate 1.000, Schlussrate 500 am 01.07. - heute = 01.07.
  const heute = "2026-07-01";
  const d = mitDarlehen({ liquide: "4000.00", rest: "1500.00", restDatum: "2026-05-31", rzs: [rate({ anker_datum: "2026-06-01" })] });
  d.zeitwerte[0] = zw("konto", "KTO-001", "kontostand", "4000.00", heute);
  const r = rechneSzenario(d, { ...sz(), stand: heute }, heute);
  assert.equal(ende(r).restschuld_cents, 0);
  assert.equal(ende(r).liquide_cents, 400000);
});

test("F4: Sollrate unter Zins tilgt nie und zahlt nur die Sollrate", () => {
  const r = rechneSzenario(mitDarlehen({ liquide: "10000.00", rest: "1000000.00", dar: { zinssatz: "12.00", sollrate: "1000.00" } }), sz(), HEUTE);
  assert.equal(ende(r).liquide_cents, 1000000 - 6 * 100000);
  assert.ok(ende(r).restschuld_cents > 100000000);
});

// ---------------------------------------------------------------- F5 Startbestand

function startDaten() {
  const anteil = [{ person_id: "PER-001", zaehler: 1, nenner: 1 }];
  return {
    konten: [
      giro,
      { konto_id: "KTO-002", name: "Festgeld", kontotyp: "festgeld", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: false, status: "aktiv" },
      { konto_id: "KTO-003", name: "Depot", kontotyp: "depot", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: false, status: "aktiv" },
      { konto_id: "KTO-004", name: "Altdepot", kontotyp: "depot", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: false, status: "geschlossen" },
    ],
    transaktionen: [],
    immobilien: [{ immobilie_id: "IMM-001", bezeichnung: "Haus", eigentumsanteile: anteil, status: "aktiv" }],
    vermoegenswerte: [],
    vorsorge: [],
    darlehen: [darlehen({ anfangsdatum: "2026-07-01" })],
    regelzahlungen: [],
    zeitwerte: [
      zw("konto", "KTO-001", "kontostand", "1000.00"),
      zw("konto", "KTO-002", "kontostand", "20000.00"),
      zw("konto", "KTO-003", "depotwert", "5000.00"),
      zw("konto", "KTO-004", "depotwert", "7777.00", "2025-01-01"),
      zw("immobilie", "IMM-001", "marktwert", "300000.00", HEUTE, "geschaetzt"),
      zw("darlehen", "DAR-001", "restschuld", "100000.00"),
    ],
  };
}

test("F5: Start-Nettovermoegen = Nettovermoegen der Vermoegensrechnung (nicht liquide Konten ja, geschlossene Depots nein)", () => {
  const d = startDaten();
  const r = rechneSzenario(d, sz(), HEUTE);
  const nv = computeNettovermoegen(d, HEUTE);
  assert.equal(r.punkte[0].netto_cents, nv.netto_cents);
  assert.equal(r.punkte[0].depot_cents, 500000);
  assert.equal(r.punkte[0].liquide_cents, 100000);
});

test("F5: fehlende Anker sind unbekannt, mit Warnung, und die Qualitaet ist nie belegt", () => {
  const d = startDaten();
  d.zeitwerte = d.zeitwerte.filter((z) => !(z.entitaet_id === "KTO-001" || z.entitaet_id === "DAR-001" || z.entitaet_id === "IMM-001"));
  const r = rechneSzenario(d, sz(), HEUTE);
  const ids = r.unbekannt.map((u) => u.id).sort();
  assert.deepEqual(ids, ["DAR-001", "IMM-001", "KTO-001"]);
  const w = r.warnungen.find((x) => x.code === "startbestand-unbekannt");
  assert.ok(w, "Warnung startbestand-unbekannt");
  assert.match(w.text, /Giro/);
  assert.match(w.text, /Kredit/);
  assert.notEqual(r.qualitaet, "belegt");
});

test("F5: nur fehlender Kontoanker reicht schon, damit das Szenario nicht belegt ist", () => {
  const d = { konten: [giro, { ...giro, konto_id: "KTO-009", name: "Zweitgiro" }], transaktionen: [], immobilien: [], vermoegenswerte: [], vorsorge: [], darlehen: [], regelzahlungen: [],
    zeitwerte: [zw("konto", "KTO-001", "kontostand", "1000.00")] };
  const r = rechneSzenario(d, sz(), HEUTE);
  assert.equal(r.qualitaet, "offen");
  assert.deepEqual(r.unbekannt.map((u) => u.id), ["KTO-009"]);
});

test("F5: vollstaendig belegter Start bleibt belegt und ohne Warnung", () => {
  const d = { konten: [giro], transaktionen: [], immobilien: [], vermoegenswerte: [], vorsorge: [], darlehen: [], regelzahlungen: [], zeitwerte: [zw("konto", "KTO-001", "kontostand", "1000.00")] };
  const r = rechneSzenario(d, sz(), HEUTE);
  assert.equal(r.qualitaet, "belegt");
  assert.deepEqual(r.unbekannt, []);
  assert.ok(!r.warnungen.some((w) => w.code === "startbestand-unbekannt"));
});

// ---------------------------------------------------------------- F7 Reihenfolge

const miete = { regelzahlung_id: "RZ-010", bezeichnung: "Miete", betrag: "-500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt", qualitaet: "belegt", erstellt_am: HEUTE };
const aend = (annahme_id, ab, aktion, betrag) => ({ annahme_id, art: "regelzahlung-aenderung", qualitaet: "geschaetzt", regelzahlung_id: "RZ-010", ab, aktion, ...(betrag ? { betrag } : {}) });

function plan(annahmen, rzs = [miete]) {
  const { rzs: neu } = modifizierteRegelzahlungen({ regelzahlungen: rzs }, { annahmen });
  const termine = [];
  for (const rz of neu) for (const d of occurrences(rz, "2026-06-30", "2028-12-31")) termine.push(`${d} ${rz.betrag}`);
  return termine.sort();
}

function permutationen(liste) {
  if (liste.length <= 1) return [liste];
  return liste.flatMap((x, i) => permutationen([...liste.slice(0, i), ...liste.slice(i + 1)]).map((p) => [x, ...p]));
}

test("F7: zwei Betragsaenderungen ergeben unabhaengig von der Reihenfolge denselben Plan", () => {
  const a = aend("A1", "2027-01-01", "betrag-aendern", "-600.00");
  const b = aend("A2", "2027-07-01", "betrag-aendern", "-700.00");
  const ab = plan([a, b]);
  assert.deepEqual(plan([b, a]), ab);
  assert.ok(ab.includes("2027-03-01 -600.00"));
  assert.ok(!ab.includes("2027-08-01 -600.00"), "alter Abschnitt laeuft nicht weiter");
  assert.ok(ab.includes("2027-08-01 -700.00"));
  assert.equal(ab.filter((t) => t.startsWith("2027-08-01")).length, 1);
});

test("F7: Aenderungen plus Beenden in jeder Reihenfolge: identischer Plan, nach dem Ende nichts", () => {
  const liste = [aend("A1", "2027-01-01", "betrag-aendern", "-600.00"), aend("A2", "2027-07-01", "betrag-aendern", "-700.00"), aend("A3", "2028-01-01", "beenden")];
  const referenz = plan(liste);
  for (const p of permutationen(liste)) assert.deepEqual(plan(p), referenz, p.map((x) => x.annahme_id).join(","));
  assert.ok(!referenz.some((t) => t >= "2028-01-01"));
  assert.ok(referenz.includes("2027-12-01 -700.00"));
  assert.ok(referenz.includes("2026-12-01 -500.00"));
});

test("F7: Aenderung nach dem Beenden ist wirkungslos, gleich in welcher Reihenfolge", () => {
  const liste = [aend("A1", "2027-01-01", "beenden"), aend("A2", "2027-07-01", "betrag-aendern", "-700.00")];
  for (const p of permutationen(liste)) {
    const { warnungen } = modifizierteRegelzahlungen({ regelzahlungen: [miete] }, { annahmen: p });
    assert.ok(warnungen.some((w) => w.code === "aenderung-wirkungslos" && w.text.includes("A2")));
    assert.ok(!plan(p).some((t) => t >= "2027-01-01"));
  }
});

test("F7: Betragsaenderung behaelt ein vorhandenes Ende der Regelzahlung", () => {
  const rz = { ...miete, aktiv_bis: "2027-09-30" };
  const p = plan([aend("A2", "2027-07-01", "betrag-aendern", "-700.00"), aend("A1", "2027-01-01", "betrag-aendern", "-600.00")], [rz]);
  assert.ok(p.includes("2027-09-01 -700.00"));
  assert.ok(!p.some((t) => t >= "2027-10-01"));
});

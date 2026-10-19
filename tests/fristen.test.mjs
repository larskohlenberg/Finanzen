import { vermoegenCheckText } from "../app/check-texte.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { anstehendeFristen, fristenZuObjekt } from "../app/fristen.mjs";
import { validateMasterData } from "../app/tools/validate-core.mjs";
import { computeVermoegenChecks } from "../app/vermoegen.mjs";

const HEUTE = "2026-03-10";
const leer = { fristen: [], darlehen: [], vorsorge: [], regelzahlungen: [] };

test("einmalige Frist im Fenster, mit bald und ohne Bezug", () => {
  const data = { ...leer, fristen: [{ frist_id: "FR-001", bezeichnung: "Steuererklaerung abgeben", art: "sonstiges", datum: "2026-04-15" }] };
  assert.deepEqual(anstehendeFristen(data, HEUTE), [{
    datum: "2026-04-15", art: "sonstiges", bezeichnung: "Steuererklaerung abgeben", bezug: null,
    frist_id: "FR-001", abgeleitet: false, ueberfaellig: false, bald: true,
  }]);
});

test("Fenster: nach monate Monaten ist Schluss, ueber 60 Tage ist nicht bald", () => {
  const data = { ...leer, fristen: [
    { frist_id: "FR-001", bezeichnung: "A", art: "sonstiges", datum: "2026-06-01" },
    { frist_id: "FR-002", bezeichnung: "B", art: "sonstiges", datum: "2027-03-11" },
  ] };
  const termine = anstehendeFristen(data, HEUTE);
  assert.deepEqual(termine.map((t) => t.frist_id), ["FR-001"]);
  assert.equal(termine[0].bald, false);
  assert.deepEqual(anstehendeFristen(data, HEUTE, 2).map((t) => t.frist_id), []);
});

test("wiederkehrende Frist expandiert, erledigte Termine fallen weg, offene alte sind ueberfaellig", () => {
  const frist = { frist_id: "FR-003", bezeichnung: "Dynamik widersprechen", art: "widerspruch", datum: "2025-02-01",
    rhythmus_einheit: "jahr", rhythmus_intervall: 1, vorsorge_id: "VS-001" };
  const offen = anstehendeFristen({ ...leer, fristen: [frist] }, HEUTE);
  assert.deepEqual(offen.map((t) => [t.datum, t.ueberfaellig]), [["2025-02-01", true], ["2026-02-01", true], ["2027-02-01", false]]);
  assert.deepEqual(offen[0].bezug, { typ: "vorsorge", id: "VS-001" });

  const abgehakt = anstehendeFristen({ ...leer, fristen: [{ ...frist, erledigt_bis: "2026-02-01" }] }, HEUTE);
  assert.deepEqual(abgehakt.map((t) => t.datum), ["2027-02-01"]);
});

test("einmalige Frist mit erledigt_bis = datum verschwindet", () => {
  const data = { ...leer, fristen: [{ frist_id: "FR-001", bezeichnung: "Kuendigen", art: "kuendigung", datum: "2026-01-31", erledigt_bis: "2026-01-31" }] };
  assert.deepEqual(anstehendeFristen(data, HEUTE), []);
});

test("abgeleitete Termine aus Darlehen, Vorsorge und Regelzahlungen", () => {
  const data = {
    fristen: [],
    darlehen: [
      { darlehen_id: "DAR-001", status: "aktiv", zinsbindung_bis: "2026-09-30", laufzeit_bis: "2040-01-01" },
      { darlehen_id: "DAR-002", status: "abgeloest", zinsbindung_bis: "2026-05-01" },
    ],
    vorsorge: [
      { vorsorge_id: "VS-001", status: "aktiv", leistung_beginn: "2026-12-01", kapitalwahl: "offen", aktiv_bis: "2026-11-30" },
      { vorsorge_id: "VS-002", status: "aktiv", leistung_beginn: "2026-07-01" },
      { vorsorge_id: "VS-003", status: "beendet", aktiv_bis: "2026-06-01" },
      { vorsorge_id: "VS-004", status: "aktiv", aktiv_bis: "2025-12-31" },
    ],
    regelzahlungen: [
      { regelzahlung_id: "RZ-001", status: "bestaetigt", vorsorge_id: "VS-001", aktiv_bis: "2026-11-30" },
      { regelzahlung_id: "RZ-002", status: "bestaetigt", aktiv_bis: "2026-08-31" },
      { regelzahlung_id: "RZ-003", status: "vorgeschlagen", aktiv_bis: "2026-08-31" },
    ],
  };
  const termine = anstehendeFristen(data, HEUTE);
  assert.deepEqual(termine.map((t) => [t.datum, t.art, t.bezeichnung, t.bezug.typ, t.bezug.id]), [
    ["2026-07-01", "sonstiges", "Leistungsbeginn", "vorsorge", "VS-002"],
    ["2026-08-31", "sonstiges", "Zahlung endet", "regelzahlung", "RZ-002"],
    ["2026-09-30", "entscheidung", "Zinsbindung endet", "darlehen", "DAR-001"],
    ["2026-11-30", "sonstiges", "Vertrag endet", "vorsorge", "VS-001"],
    ["2026-12-01", "entscheidung", "Kapitalwahl entscheiden", "vorsorge", "VS-001"],
  ]);
  assert.ok(termine.every((t) => t.abgeleitet && t.frist_id === null && !t.ueberfaellig));
});

test("fristenZuObjekt filtert auf einen Bezug", () => {
  const data = { ...leer,
    fristen: [
      { frist_id: "FR-001", bezeichnung: "A", art: "wiedervorlage", datum: "2026-05-01", darlehen_id: "DAR-001" },
      { frist_id: "FR-002", bezeichnung: "B", art: "wiedervorlage", datum: "2026-05-02" },
    ],
    darlehen: [{ darlehen_id: "DAR-001", status: "aktiv", zinsbindung_bis: "2026-06-30" }],
  };
  assert.deepEqual(fristenZuObjekt(data, HEUTE, "darlehen", "DAR-001").map((t) => t.datum), ["2026-05-01", "2026-06-30"]);
});

test("ueberfaellige Frist erscheint als Check", () => {
  const data = { konten: [], zeitwerte: [], transaktionen: [], immobilien: [], vermoegenswerte: [], darlehen: [], vorsorge: [], regelzahlungen: [],
    fristen: [
      { frist_id: "FR-001", bezeichnung: "Kuendigen", art: "kuendigung", datum: "2026-03-01" },
      { frist_id: "FR-002", bezeichnung: "Spaeter", art: "kuendigung", datum: "2026-04-01" },
    ] };
  const checks = computeVermoegenChecks(data, HEUTE).filter((c) => c.art === "frist-ueberfaellig");
  assert.equal(checks.length, 1);
  assert.equal(checks[0].entitaet_id, "FR-001");
  assert.match(vermoegenCheckText(checks[0]), /Kuendigen/);
});

function bestand(fristen) {
  return {
    personen: [], konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    kategorien: [], transaktionen: [], transfers: [], regelzahlungen: [], fristen,
  };
}

test("Validator: Bezug muss existieren, hoechstens einer, Rhythmus nur paarweise", () => {
  const fehler = (fristen) => validateMasterData(bestand(fristen)).errors.filter((e) => e.startsWith("fristen"));
  assert.deepEqual(fehler([{ frist_id: "FR-001", bezeichnung: "Steuer", art: "sonstiges", datum: "2026-07-31" }]), []);
  assert.deepEqual(fehler([{ frist_id: "FR-001", bezeichnung: "X", art: "sonstiges", datum: "2026-07-31", konto_id: "KTO-001" }]), []);
  assert.match(fehler([{ frist_id: "FR-001", bezeichnung: "X", art: "sonstiges", datum: "2026-07-31", konto_id: "KTO-009" }])[0], /KTO-009 existiert nicht/);
  assert.ok(fehler([{ frist_id: "FR-001", bezeichnung: "X", art: "sonstiges", datum: "2026-07-31", konto_id: "KTO-001", vorsorge_id: "VS-001" }])
    .some((e) => /hoechstens ein Bezug/.test(e)));
  assert.match(fehler([{ frist_id: "FR-001", bezeichnung: "X", art: "sonstiges", datum: "2026-07-31", rhythmus_einheit: "jahr" }])[0], /nur zusammen/);
  assert.ok(fehler([{ frist_id: "FR-1", bezeichnung: "X", art: "frist", datum: "2026-07-31", status: "offen" }]).length >= 3);
});

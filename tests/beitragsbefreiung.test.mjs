// Beitragsbefreiung am Vertrag und das Szenario-Ereignis BU/Arbeitslosigkeit:
// befreite Beitraege entfallen ab dem Ereignis, bei BU fliessen die erfassten
// BU- und Erwerbsminderungsrenten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMasterData } from "../app/tools/validate-core.mjs";
import { ereignisAnnahmen, rechneSzenario, szenarioAenderungen } from "../app/szenarien.mjs";

const TODAY = "2026-06-28";

function daten() {
  return {
    personen: [{ person_id: "PER-001", name: "Lena", status: "aktiv" }, { person_id: "PER-002", name: "Martin", status: "aktiv" }],
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", status: "aktiv", liquiditaetsrelevant: true, inhaber_person_ids: ["PER-001"] }],
    kategorien: [], transaktionen: [], transfers: [], immobilien: [], vermoegenswerte: [], darlehen: [],
    vorsorge: [
      { vorsorge_id: "VS-001", art: "ruerup", name: "Basisrente Lena", person_id: "PER-001", status: "aktiv", kapitalbildend: false, geprueft_am: "2026-01-01", beitragsbefreiung: ["bu"] },
      { vorsorge_id: "VS-002", art: "lebensversicherung", name: "LV Lena", person_id: "PER-001", status: "aktiv", kapitalbildend: true, beitragsbefreiung: ["bu", "arbeitslosigkeit"] },
      { vorsorge_id: "VS-003", art: "lebensversicherung", name: "LV ohne Befreiung", person_id: "PER-001", status: "aktiv", kapitalbildend: true },
      { vorsorge_id: "VS-004", art: "lebensversicherung", name: "LV Martin", person_id: "PER-002", status: "aktiv", kapitalbildend: true, beitragsbefreiung: ["bu"] },
    ],
    regelzahlungen: [
      { regelzahlung_id: "RZ-001", bezeichnung: "Basisrente Beitrag", vorsorge_id: "VS-001", betrag: "-400.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt", erstellt_am: "2026-01-01", qualitaet: "belegt" },
      { regelzahlung_id: "RZ-002", bezeichnung: "LV Lena Beitrag", vorsorge_id: "VS-002", betrag: "-100.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt", erstellt_am: "2026-01-01", qualitaet: "belegt" },
      { regelzahlung_id: "RZ-003", bezeichnung: "LV ohne Befreiung Beitrag", vorsorge_id: "VS-003", betrag: "-50.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt", erstellt_am: "2026-01-01", qualitaet: "belegt" },
      { regelzahlung_id: "RZ-004", bezeichnung: "LV Martin Beitrag", vorsorge_id: "VS-004", betrag: "-70.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt", erstellt_am: "2026-01-01", qualitaet: "belegt" },
    ],
    zeitwerte: [
      { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "5000.00", standdatum: "2026-06-01", qualitaet: "belegt" },
      { entitaet: "vorsorge", entitaet_id: "VS-001", feld: "bu_rente", wert: "2000.00", standdatum: "2026-01-01", qualitaet: "belegt" },
    ],
    szenarien: [],
  };
}

const szenario = (annahmen) => ({ szenario_id: "SZN-001", name: "BU", status: "entwurf", stand: TODAY, reichweite_bis: "2027-06-30", erstellt_am: TODAY, annahmen });

test("Validator: beitragsbefreiung nur bu|arbeitslosigkeit, eindeutig, nicht leer", () => {
  assert.deepEqual(validateMasterData(daten()).errors, []);
  for (const falsch of [["urlaub"], ["bu", "bu"], [], "bu"]) {
    const d = daten();
    d.vorsorge[0].beitragsbefreiung = falsch;
    assert.ok(validateMasterData(d).errors.some((e) => e.includes("beitragsbefreiung")), JSON.stringify(falsch));
  }
});

test("Validator: Ereignis braucht fall, bekannte Person, ab; bis nicht vor ab", () => {
  const d = daten();
  d.szenarien = [szenario([{ annahme_id: "A1", art: "ereignis", fall: "bu", person_id: "PER-001", ab: "2026-09-01", qualitaet: "geschaetzt" }])];
  assert.deepEqual(validateMasterData(d).errors, []);
  for (const [extra, muster] of [
    [{ fall: "krank" }, /fall ungueltig/],
    [{ person_id: "PER-009" }, /person_id PER-009 existiert nicht/],
    [{ ab: "09/2026" }, /ab fehlt/],
    [{ bis: "2026-08-01" }, /bis ungueltig/],
  ]) {
    d.szenarien = [szenario([{ annahme_id: "A1", art: "ereignis", fall: "bu", person_id: "PER-001", ab: "2026-09-01", qualitaet: "geschaetzt", ...extra }])];
    assert.ok(validateMasterData(d).errors.some((e) => muster.test(e)), JSON.stringify(extra));
  }
});

test("BU-Ereignis: befreite Beitraege der Person enden, BU-Rente fliesst; fremde und unbefreite bleiben", () => {
  const folgen = ereignisAnnahmen(daten(), { annahme_id: "A1", art: "ereignis", fall: "bu", person_id: "PER-001", ab: "2026-09-01", qualitaet: "geschaetzt" }, TODAY);
  const beendet = folgen.filter((f) => f.art === "regelzahlung-aenderung").map((f) => f.regelzahlung_id).sort();
  assert.deepEqual(beendet, ["RZ-001", "RZ-002"]);
  const renten = folgen.filter((f) => f.art === "regelzahlung-neu");
  assert.equal(renten.length, 1);
  assert.equal(renten[0].betrag, "2000.00");
  assert.equal(renten[0].name, "BU-Rente Basisrente Lena");
  assert.equal(renten[0].qualitaet, "belegt");
});

test("Arbeitslosigkeit: nur Vertraege mit dieser Befreiung, keine Rente; mit bis laufen Beitraege wieder an", () => {
  const folgen = ereignisAnnahmen(daten(), { annahme_id: "A1", art: "ereignis", fall: "arbeitslosigkeit", person_id: "PER-001", ab: "2026-09-01", bis: "2026-12-31", qualitaet: "geschaetzt" }, TODAY);
  assert.deepEqual(folgen.map((f) => [f.art, f.regelzahlung_id ?? f.name, f.ab]), [
    ["regelzahlung-aenderung", "RZ-002", "2026-09-01"],
    ["regelzahlung-neu", "LV Lena Beitrag", "2027-01-01"],
  ]);
});

test("Rechnung: BU-Szenario steht im Monat besser da als ohne Ereignis, Aenderungsliste nennt es", () => {
  const d = daten();
  const mit = rechneSzenario(d, szenario([{ annahme_id: "A1", art: "ereignis", fall: "bu", person_id: "PER-001", ab: "2026-09-01", qualitaet: "geschaetzt" }]), TODAY);
  const ohne = rechneSzenario(d, szenario([]), TODAY);
  // je Monat ab 09/2026: +400 +100 Beitraege gespart, +2000 Rente
  assert.equal(mit.punkte.at(-1).liquide_cents - ohne.punkte.at(-1).liquide_cents, 10 * 250000);
  const liste = szenarioAenderungen(d, szenario([{ annahme_id: "A1", art: "ereignis", fall: "bu", person_id: "PER-001", ab: "2026-09-01", qualitaet: "geschaetzt" }]), TODAY);
  assert.ok(liste.some((e) => e.art === "beendet" && e.regelzahlung_id === "RZ-001"));
  assert.ok(liste.some((e) => e.art === "neu" && e.name === "BU-Rente Basisrente Lena"));
});

test("Ereignis ohne passenden Vertrag warnt", () => {
  const d = daten();
  const r = rechneSzenario(d, szenario([{ annahme_id: "A1", art: "ereignis", fall: "arbeitslosigkeit", person_id: "PER-002", ab: "2026-09-01", qualitaet: "geschaetzt" }]), TODAY);
  assert.ok(r.warnungen.some((w) => w.code === "ereignis-ohne-wirkung"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMasterData } from "../app/tools/validate-core.mjs";

function basis(extra = {}) {
  return {
    personen: [{ person_id: "PER-001", name: "Lena", status: "aktiv" }],
    konten: [],
    kategorien: [],
    transaktionen: [],
    transfers: [],
    ...extra,
  };
}

test("valide Vorsorge (kapitalbildende Riester) besteht", () => {
  const data = basis({
    vorsorge: [{
      vorsorge_id: "VS-001", art: "riester", name: "Riester Lena", person_id: "PER-001",
      status: "aktiv", kapitalbildend: true, kapitalwahl: "offen", geprueft_am: "2026-01-15",
    }],
  });
  assert.deepEqual(validateMasterData(data).errors, []);
});

test("unbekannte art ist Fehler", () => {
  const data = basis({ vorsorge: [{ vorsorge_id: "VS-001", art: "krypto", name: "X", person_id: "PER-001", status: "aktiv", kapitalbildend: false }] });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("art")));
});

test("fehlendes kapitalbildend ist Fehler", () => {
  const data = basis({ vorsorge: [{ vorsorge_id: "VS-001", art: "schutzversicherung", name: "KFZ-HV", person_id: "PER-001", status: "aktiv" }] });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("kapitalbildend")));
});

test("kapitalbildend muss boolean sein", () => {
  const data = basis({ vorsorge: [{ vorsorge_id: "VS-001", art: "riester", name: "X", person_id: "PER-001", status: "aktiv", kapitalbildend: "ja" }] });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("kapitalbildend")));
});

test("vorsorge-Zeitwert mit rueckkaufswert ist valide", () => {
  const data = basis({
    vorsorge: [{ vorsorge_id: "VS-001", art: "riester", name: "R", person_id: "PER-001", status: "aktiv", kapitalbildend: true }],
    zeitwerte: [{ entitaet: "vorsorge", entitaet_id: "VS-001", feld: "rueckkaufswert", wert: "9100.00", standdatum: "2026-01-01", qualitaet: "belegt" }],
  });
  assert.deepEqual(validateMasterData(data).errors, []);
});

test("vorsorge-Zeitwert auf unbekannte vorsorge_id ist Fehler", () => {
  const data = basis({
    vorsorge: [],
    zeitwerte: [{ entitaet: "vorsorge", entitaet_id: "VS-999", feld: "erwartete_rente", wert: "1480.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" }],
  });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("VS-999")));
});

test("Regelzahlung mit gueltiger vorsorge_id ist valide", () => {
  const data = basis({
    vorsorge: [{ vorsorge_id: "VS-001", art: "schutzversicherung", name: "KFZ", person_id: "PER-001", status: "aktiv", kapitalbildend: false }],
    regelzahlungen: [{ regelzahlung_id: "RZ-001", bezeichnung: "KFZ-Beitrag", betrag: "-92.00", rhythmus_einheit: "jahr", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt", erstellt_am: "2026-01-01", vorsorge_id: "VS-001" }],
  });
  assert.deepEqual(validateMasterData(data).errors, []);
});

test("Regelzahlung mit unbekannter vorsorge_id ist Fehler", () => {
  const data = basis({
    vorsorge: [],
    regelzahlungen: [{ regelzahlung_id: "RZ-001", bezeichnung: "X", betrag: "-92.00", rhythmus_einheit: "jahr", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt", erstellt_am: "2026-01-01", vorsorge_id: "VS-404" }],
  });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("VS-404")));
});

test("Vorsorge mit unbekannter person_id ist Fehler", () => {
  const data = basis({ vorsorge: [{ vorsorge_id: "VS-001", art: "riester", name: "R", person_id: "PER-999", status: "aktiv", kapitalbildend: true }] });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("PER-999")));
});

test("ersetzt_vorsorge_id muss auf existierende Vorsorge zeigen", () => {
  const data = basis({ vorsorge: [{ vorsorge_id: "VS-002", art: "schutzversicherung", name: "KFZ neu", person_id: "PER-001", status: "aktiv", kapitalbildend: false, ersetzt_vorsorge_id: "VS-001" }] });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("ersetzt_vorsorge_id")));
});

test("vorsorge-leistung-Annahme mit unbekannter vorsorge_id ist Fehler", () => {
  const data = basis({
    vorsorge: [],
    szenarien: [{ szenario_id: "SZN-001", name: "Ruhestand", status: "entwurf", stand: "2026-06-28", reichweite_bis: "2050-12-31", erstellt_am: "2026-06-28",
      annahmen: [{ annahme_id: "A1", art: "vorsorge-leistung", vorsorge_id: "VS-777", arm: "rente", ab: "2042-01-01" }] }],
  });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("VS-777")));
});

// --- Review-Fixes ---

test("gegenbuchung(vorsorge) mit existierender vorsorge_id ist valide", () => {
  const data = basis({
    vorsorge: [{ vorsorge_id: "VS-003", art: "lebensversicherung", name: "LV", person_id: "PER-001", status: "aktiv", kapitalbildend: true }],
    szenarien: [{ szenario_id: "SZN-001", name: "Kapital", status: "entwurf", stand: "2026-06-28", reichweite_bis: "2030-12-31", erstellt_am: "2026-06-28",
      annahmen: [{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "belegt", datum: "2027-01-15", betrag: "9100.00", gegenbuchung: { ziel_typ: "vorsorge", ziel_id: "VS-003" } }] }],
  });
  assert.deepEqual(validateMasterData(data).errors, []);
});

test("gegenbuchung(vorsorge) mit unbekannter ziel_id ist Fehler", () => {
  const data = basis({
    vorsorge: [{ vorsorge_id: "VS-003", art: "lebensversicherung", name: "LV", person_id: "PER-001", status: "aktiv", kapitalbildend: true }],
    szenarien: [{ szenario_id: "SZN-001", name: "Kapital", status: "entwurf", stand: "2026-06-28", reichweite_bis: "2030-12-31", erstellt_am: "2026-06-28",
      annahmen: [{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "belegt", datum: "2027-01-15", betrag: "9100.00", gegenbuchung: { ziel_typ: "vorsorge", ziel_id: "VS-404" } }] }],
  });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("VS-404")));
});

test("doppelter Abbau derselben Vorsorge im Szenario ist Fehler", () => {
  const data = basis({
    vorsorge: [{ vorsorge_id: "VS-003", art: "lebensversicherung", name: "LV", person_id: "PER-001", status: "aktiv", kapitalbildend: true }],
    szenarien: [{ szenario_id: "SZN-001", name: "Kapital", status: "entwurf", stand: "2026-06-28", reichweite_bis: "2030-12-31", erstellt_am: "2026-06-28",
      annahmen: [
        { annahme_id: "A1", art: "einmalzahlung", qualitaet: "belegt", datum: "2027-01-15", betrag: "9100.00", gegenbuchung: { ziel_typ: "vorsorge", ziel_id: "VS-003" } },
        { annahme_id: "A2", art: "einmalzahlung", qualitaet: "belegt", datum: "2028-01-15", betrag: "9100.00", gegenbuchung: { ziel_typ: "vorsorge", ziel_id: "VS-003" } },
      ] }],
  });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("mehrfach abgebaut")));
});

test("gesetzliche-rente darf nicht kapitalbildend sein", () => {
  const data = basis({ vorsorge: [{ vorsorge_id: "VS-001", art: "gesetzliche-rente", name: "GRV Lena", person_id: "PER-001", status: "aktiv", kapitalbildend: true }] });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("kapitalbildend")));
});

test("schutzversicherung darf nicht kapitalbildend sein", () => {
  const data = basis({ vorsorge: [{ vorsorge_id: "VS-001", art: "schutzversicherung", name: "Risiko-LV", person_id: "PER-001", status: "aktiv", kapitalbildend: true }] });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("kapitalbildend")));
});

test("kapitalbildende Riester bleibt valide (Negativliste trifft nicht)", () => {
  const data = basis({ vorsorge: [{ vorsorge_id: "VS-001", art: "riester", name: "Riester", person_id: "PER-001", status: "aktiv", kapitalbildend: true }] });
  assert.deepEqual(validateMasterData(data).errors, []);
});

test("zeitwert-feld muss zur Entitaet passen (konto.rueckkaufswert ist Fehler)", () => {
  const data = basis({
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "rueckkaufswert", wert: "9100.00", standdatum: "2026-01-01", qualitaet: "belegt" }],
  });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("feld")));
});

test("zeitwert-feld passend zur Entitaet ist valide (konto.kontostand)", () => {
  const data = basis({
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "4850.00", standdatum: "2026-01-01", qualitaet: "belegt" }],
  });
  assert.deepEqual(validateMasterData(data).errors, []);
});

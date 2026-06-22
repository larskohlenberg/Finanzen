import { test } from "node:test";
import assert from "node:assert/strict";
import { aktuellerZeitwert } from "../app/vermoegen.mjs";

const ZW = [
  { entitaet: "immobilie", entitaet_id: "IMM-001", feld: "marktwert", wert: "400000.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" },
  { entitaet: "immobilie", entitaet_id: "IMM-001", feld: "marktwert", wert: "999999.00", standdatum: "2030-01-01", qualitaet: "geschaetzt" },
];

test("aktuellerZeitwert mit bis-Cutoff ignoriert spätere Stände", () => {
  assert.equal(aktuellerZeitwert(ZW, "immobilie", "IMM-001", "marktwert", "2026-06-22").wert, "400000.00");
});

test("aktuellerZeitwert ohne bis nimmt den neuesten", () => {
  assert.equal(aktuellerZeitwert(ZW, "immobilie", "IMM-001", "marktwert").wert, "999999.00");
});

import { rechneSzenario } from "../app/szenarien.mjs";

function dataMitRz(rz = []) {
  return { konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    transaktionen: [], zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-06-22", qualitaet: "belegt" }],
    darlehen: [], immobilien: [], vermoegenswerte: [], regelzahlungen: rz };
}
const sz = (annahmen = [], reichweite_bis = "2026-12-31") => ({ szenario_id: "SZN-001", name: "T", status: "entwurf", stand: "2026-06-22", reichweite_bis, erstellt_am: "2026-06-22", annahmen });

test("Basis: nur bestätigte Regelzahlungen wirken (Miete -500/Monat, 6 Monate)", () => {
  const data = dataMitRz([{ regelzahlung_id: "RZ-001", bezeichnung: "Miete", betrag: "-500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-22", status: "bestaetigt", qualitaet: "belegt", erstellt_am: "2026-06-01" }]);
  const r = rechneSzenario(data, sz([]), "2026-06-22");
  const letzte = r.punkte[r.punkte.length - 1];
  assert.equal(letzte.liquide_cents, 100000 - 6 * 50000); // 1000 - 3000 = -2000
});

test("Vorgeschlagene Regelzahlung wirkt NICHT", () => {
  const data = dataMitRz([{ regelzahlung_id: "RZ-001", bezeichnung: "X", betrag: "-500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-22", status: "vorgeschlagen", qualitaet: "geschaetzt", erstellt_am: "2026-06-01" }]);
  const r = rechneSzenario(data, sz([]), "2026-06-22");
  assert.equal(r.punkte[r.punkte.length - 1].liquide_cents, 100000);
});

test("einmalzahlung (Cash-Bein) wirkt ab Datum", () => {
  const data = dataMitRz([]);
  const r = rechneSzenario(data, sz([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2026-08-15", betrag: "2000.00" }]), "2026-06-22");
  assert.equal(r.punkte[r.punkte.length - 1].liquide_cents, 100000 + 200000);
});

test("regelzahlung-aenderung beenden stoppt die Regelzahlung", () => {
  const data = dataMitRz([{ regelzahlung_id: "RZ-001", bezeichnung: "Miete", betrag: "-500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-22", status: "bestaetigt", qualitaet: "belegt", erstellt_am: "2026-06-01" }]);
  const r = rechneSzenario(data, sz([{ annahme_id: "A1", art: "regelzahlung-aenderung", qualitaet: "geschaetzt", regelzahlung_id: "RZ-001", ab: "2026-09-01", aktion: "beenden" }]), "2026-06-22");
  // Juli + August = 2 x -500 = -1000
  assert.equal(r.punkte[r.punkte.length - 1].liquide_cents, 100000 - 100000);
});

function dataMitDarlehen() {
  return { konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    transaktionen: [], immobilien: [], vermoegenswerte: [],
    zeitwerte: [
      { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "100000.00", standdatum: "2026-06-22", qualitaet: "belegt" },
      { entitaet: "darlehen", entitaet_id: "DAR-001", feld: "restschuld", wert: "10000.00", standdatum: "2026-06-22", qualitaet: "belegt" },
    ],
    darlehen: [{ darlehen_id: "DAR-001", bezeichnung: "Rest", status: "aktiv", anfangsbetrag: "10000.00", anfangsdatum: "2026-06-22", zinssatz: "0.00", sollrate: "1000.00", rhythmus_einheit: "monat", rhythmus_intervall: 1 }],
    regelzahlungen: [{ regelzahlung_id: "RZ-001", bezeichnung: "Darlehensrate", betrag: "-1000.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-06-22", status: "bestaetigt", qualitaet: "belegt", darlehen_id: "DAR-001", erstellt_am: "2026-06-01" }] };
}

test("Sondertilgung: Restschuld Ende Juli exakt 400_000, Cash konsistent", () => {
  const data = dataMitDarlehen();
  const r = rechneSzenario(data, sz([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "belegt", datum: "2026-07-15", betrag: "-5000.00", gegenbuchung: { ziel_typ: "darlehen", ziel_id: "DAR-001" } }], "2026-09-30"), "2026-06-22");
  assert.equal(r.punkte.find((p) => p.monat === "2026-07").restschuld_cents, 400000);
  assert.equal(r.punkte[r.punkte.length - 1].liquide_cents, 9200000);
});

test("Volltilgung via Sondertilgung stoppt die Sollrate (Cash exakt)", () => {
  const data = dataMitDarlehen();
  const r = rechneSzenario(data, sz([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "belegt", datum: "2026-07-15", betrag: "-10000.00", gegenbuchung: { ziel_typ: "darlehen", ziel_id: "DAR-001" } }], "2026-12-31"), "2026-06-22");
  const letzte = r.punkte[r.punkte.length - 1];
  assert.equal(letzte.restschuld_cents, 0);
  assert.equal(letzte.liquide_cents, 9000000);
});

test("gegenbuchung(depot) Verkauf: Liquidität +, Depot −, depot-vorbehalt", () => {
  const data = { konten: [
      { konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" },
      { konto_id: "KTO-006", name: "Depot", kontotyp: "depot", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    transaktionen: [], darlehen: [], immobilien: [], vermoegenswerte: [],
    zeitwerte: [
      { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-06-22", qualitaet: "belegt" },
      { entitaet: "konto", entitaet_id: "KTO-006", feld: "depotwert", wert: "25000.00", standdatum: "2026-06-22", qualitaet: "belegt" }],
    regelzahlungen: [] };
  const r = rechneSzenario(data, sz([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2026-08-01", betrag: "10000.00", gegenbuchung: { ziel_typ: "depot", ziel_id: "KTO-006" } }], "2026-12-31"), "2026-06-22");
  const letzte = r.punkte[r.punkte.length - 1];
  assert.equal(letzte.liquide_cents, 100000 + 1000000);
  assert.equal(letzte.depot_cents, 2500000 - 1000000);
  assert.ok(r.warnungen.some((w) => w.code === "depot-vorbehalt"));
});

test("Immobilien-Verkauf: Position fällt ab Datum raus, Liquidität +, neutral", () => {
  const data = { konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    transaktionen: [], darlehen: [], vermoegenswerte: [],
    immobilien: [{ immobilie_id: "IMM-001", bezeichnung: "EFH", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }], status: "aktiv" }],
    zeitwerte: [
      { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-06-22", qualitaet: "belegt" },
      { entitaet: "immobilie", entitaet_id: "IMM-001", feld: "marktwert", wert: "400000.00", standdatum: "2026-06-22", qualitaet: "geschaetzt" }],
    regelzahlungen: [] };
  const vorher = rechneSzenario(data, sz([], "2027-01-31"), "2026-06-22").punkte[0].netto_cents;
  const r = rechneSzenario(data, sz([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2026-09-01", betrag: "400000.00", gegenbuchung: { ziel_typ: "immobilie", ziel_id: "IMM-001" } }], "2027-01-31"), "2026-06-22");
  assert.equal(r.punkte.find((p) => p.monat === "2026-08").sachwerte_cents, 40000000);
  assert.equal(r.punkte.find((p) => p.monat === "2026-09").sachwerte_cents, 0);
  const letzte = r.punkte[r.punkte.length - 1];
  assert.equal(letzte.sachwerte_cents, 0);
  assert.equal(letzte.liquide_cents, 100000 + 40000000);
  assert.equal(letzte.netto_cents, vorher);
});

test("Sachwert-Erbschaft (betrag=0 + neue_position): Nettovermögen steigt", () => {
  const data = { konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    transaktionen: [], darlehen: [], immobilien: [], vermoegenswerte: [],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-06-22", qualitaet: "belegt" }],
    regelzahlungen: [] };
  const r = rechneSzenario(data, sz([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2026-09-01", betrag: "0.00", gegenbuchung: { ziel_typ: "vermoegenswert", neue_position: { bezeichnung: "Erbe Gold", wert: "50000.00" } } }], "2027-01-31"), "2026-06-22");
  const letzte = r.punkte[r.punkte.length - 1];
  assert.equal(letzte.sachwerte_cents, 5000000);
  assert.equal(letzte.netto_cents, 100000 + 5000000);
});

test("cash-realismus: geschätzter Plan deutlich unter Ist", () => {
  const data = { konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    kategorien: [{ kategorie_id: "KAT-003", name: "Lebensmittel", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" }],
    transaktionen: [
      { konto_id: "KTO-001", buchungsdatum: "2026-03-15", betrag: "-800.00", ist_transfer: false, kategorie_id: "KAT-003", kategorisierung_status: "bestaetigt" },
      { konto_id: "KTO-001", buchungsdatum: "2026-04-15", betrag: "-800.00", ist_transfer: false, kategorie_id: "KAT-003", kategorisierung_status: "bestaetigt" },
      { konto_id: "KTO-001", buchungsdatum: "2026-05-15", betrag: "-800.00", ist_transfer: false, kategorie_id: "KAT-003", kategorisierung_status: "bestaetigt" }],
    darlehen: [], immobilien: [], vermoegenswerte: [], zeitwerte: [],
    regelzahlungen: [{ regelzahlung_id: "RZ-001", bezeichnung: "Lebensmittel-Plan", betrag: "-500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-01", status: "bestaetigt", qualitaet: "geschaetzt", kategorie_id: "KAT-003", erstellt_am: "2026-06-01" }] };
  const r = rechneSzenario(data, sz([], "2027-06-30"), "2026-06-22");
  assert.ok(r.warnungen.some((w) => w.code === "cash-realismus"));
});

test("kategorie-ungeplant: materielles Ist ohne Regelzahlung", () => {
  const data = { konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    kategorien: [{ kategorie_id: "KAT-003", name: "Lebensmittel", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" }],
    transaktionen: [
      { konto_id: "KTO-001", buchungsdatum: "2026-03-15", betrag: "-800.00", ist_transfer: false, kategorie_id: "KAT-003", kategorisierung_status: "bestaetigt" },
      { konto_id: "KTO-001", buchungsdatum: "2026-04-15", betrag: "-800.00", ist_transfer: false, kategorie_id: "KAT-003", kategorisierung_status: "bestaetigt" },
      { konto_id: "KTO-001", buchungsdatum: "2026-05-15", betrag: "-800.00", ist_transfer: false, kategorie_id: "KAT-003", kategorisierung_status: "bestaetigt" }],
    darlehen: [], immobilien: [], vermoegenswerte: [], zeitwerte: [], regelzahlungen: [] };
  const r = rechneSzenario(data, sz([], "2027-06-30"), "2026-06-22");
  assert.ok(r.warnungen.some((w) => w.code === "kategorie-ungeplant"));
});

test("belegt-Regelzahlung löst KEINE cash-realismus-Warnung aus", () => {
  const data = { konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    kategorien: [{ kategorie_id: "KAT-001", name: "Wohnen", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" }],
    transaktionen: [
      { konto_id: "KTO-001", buchungsdatum: "2026-03-15", betrag: "-1200.00", ist_transfer: false, kategorie_id: "KAT-001", kategorisierung_status: "bestaetigt" },
      { konto_id: "KTO-001", buchungsdatum: "2026-04-15", betrag: "-1200.00", ist_transfer: false, kategorie_id: "KAT-001", kategorisierung_status: "bestaetigt" },
      { konto_id: "KTO-001", buchungsdatum: "2026-05-15", betrag: "-1200.00", ist_transfer: false, kategorie_id: "KAT-001", kategorisierung_status: "bestaetigt" }],
    darlehen: [], immobilien: [], vermoegenswerte: [], zeitwerte: [],
    regelzahlungen: [{ regelzahlung_id: "RZ-001", bezeichnung: "Miete", betrag: "-1200.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-01", status: "bestaetigt", qualitaet: "belegt", kategorie_id: "KAT-001", erstellt_am: "2026-06-01" }] };
  const r = rechneSzenario(data, sz([], "2027-06-30"), "2026-06-22");
  assert.ok(!r.warnungen.some((w) => w.code === "cash-realismus"));
  assert.ok(!r.warnungen.some((w) => w.code === "kategorie-ungeplant"));
});

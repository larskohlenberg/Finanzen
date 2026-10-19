// Vorsorge (Review 0A.6): laufende Beitraege nur bestaetigt und am Stichtag
// gueltig (F8); Kapitalleistungen getrennt nach terminiert, bedingt und
// undatiert (F9).
import assert from "node:assert/strict";
import test from "node:test";
import { beitragJeJahrVertrag, beitragJeMonatVertrag, kapitalLeistungen, laufendeBeitraege, naechsterBeitrag } from "../app/vorsorge-rechnung.mjs";

const HEUTE = "2026-10-16";
const rz = (id, extra) => ({ regelzahlung_id: id, vorsorge_id: "VS-001", rhythmus_einheit: "monat", rhythmus_intervall: 1, status: "bestaetigt", ...extra });

test("F8: kuenftige und abgelehnte Regelzahlungen sind keine laufenden Beitraege", () => {
  const d = { regelzahlungen: [
    rz("RZ-001", { betrag: "-100.00", anker_datum: "2025-01-01", aktiv_bis: "2026-12-31" }),
    rz("RZ-002", { betrag: "-110.00", anker_datum: "2027-01-01" }),
    rz("RZ-003", { betrag: "-900.00", anker_datum: "2025-01-01", status: "abgelehnt" }),
    rz("RZ-004", { betrag: "-50.00", anker_datum: "2025-01-01", status: "vorgeschlagen" }),
  ] };
  assert.deepEqual(laufendeBeitraege(d, "VS-001", HEUTE).map((r) => r.regelzahlung_id), ["RZ-001"]);
  assert.equal(beitragJeMonatVertrag(d, "VS-001", HEUTE), 10000);
  assert.equal(beitragJeJahrVertrag(d, "VS-001", HEUTE), 120000);
});

test("F8: Grenzen am Stichtag: Beginn am Tag zaehlt, Ende am Tag zaehlt, Ende am Vortag nicht", () => {
  const d = { regelzahlungen: [
    rz("RZ-001", { betrag: "-10.00", anker_datum: HEUTE }),
    rz("RZ-002", { betrag: "-20.00", anker_datum: "2025-01-01", aktiv_bis: HEUTE }),
    rz("RZ-003", { betrag: "-40.00", anker_datum: "2025-01-01", aktiv_bis: "2026-10-15" }),
    rz("RZ-004", { betrag: "-80.00", anker_datum: "2026-10-17" }),
  ] };
  assert.deepEqual(laufendeBeitraege(d, "VS-001", HEUTE).map((r) => r.regelzahlung_id), ["RZ-001", "RZ-002"]);
});

test("F8: naechster Beitrag kennt die angekuendigte Folgezahlung, aber keine abgelehnte", () => {
  const d = { regelzahlungen: [
    rz("RZ-001", { betrag: "-100.00", anker_datum: "2025-01-05", aktiv_bis: "2026-10-31" }),
    rz("RZ-002", { betrag: "-110.00", anker_datum: "2026-11-01" }),
    rz("RZ-003", { betrag: "-900.00", anker_datum: "2026-10-20", status: "abgelehnt" }),
  ] };
  assert.equal(naechsterBeitrag(d, "VS-001", HEUTE).datum, "2026-11-01");
});

const zw = (id, feld, wert, standdatum = "2026-01-01") => ({ entitaet: "vorsorge", entitaet_id: id, feld, wert, standdatum, qualitaet: "belegt" });

function leistungsDaten() {
  return {
    vorsorge: [
      { vorsorge_id: "VS-001", art: "riester", name: "Riester", status: "aktiv", kapitalbildend: false, leistung_beginn: "2042-08-01" },
      { vorsorge_id: "VS-002", art: "rentenversicherung", name: "Private RV", status: "aktiv", kapitalbildend: true, leistung_beginn: "2045-05-01" },
      { vorsorge_id: "VS-003", art: "lebensversicherung", name: "Risiko-LV", status: "aktiv", kapitalbildend: false },
      { vorsorge_id: "VS-004", art: "lebensversicherung", name: "Kapital-LV ohne Ablauf", status: "aktiv", kapitalbildend: true },
      { vorsorge_id: "VS-005", art: "lebensversicherung", name: "Alt", status: "beendet", kapitalbildend: true, leistung_beginn: "2030-01-01" },
    ],
    zeitwerte: [
      zw("VS-001", "erwartete_kapitalleistung", "24000.00"),
      zw("VS-002", "erwartete_kapitalleistung", "31000.00"),
      zw("VS-003", "erwartete_kapitalleistung", "200000.00"),
      zw("VS-004", "erwartete_kapitalleistung", "15000.00"),
      zw("VS-005", "erwartete_kapitalleistung", "9999.00"),
      zw("VS-002", "erwartete_kapitalleistung", "77777.00", "2027-06-01"),
    ],
  };
}

test("F9: Kapitalleistungen getrennt: terminiert, bedingt (Risikoleistung), undatiert", () => {
  const k = kapitalLeistungen(leistungsDaten(), HEUTE);
  assert.deepEqual(k.terminiert.map((l) => l.vorsorge.vorsorge_id), ["VS-001", "VS-002"]);
  assert.deepEqual(k.bedingt.map((l) => l.vorsorge.vorsorge_id), ["VS-003"]);
  assert.deepEqual(k.undatiert.map((l) => l.vorsorge.vorsorge_id), ["VS-004"]);
  assert.equal(k.terminiert_cents, 5500000, "nur Terminiertes ist faellig, Wert bis zum Stichtag");
  assert.equal(k.bedingt_cents, 20000000);
  assert.equal(k.undatiert_cents, 1500000);
  assert.deepEqual(k.jahre, ["2042", "2045"]);
});

// Prognose-Realismus rechnet wie Plan & Ist: zwoelf volle Monate, netto je
// Kategorie, ohne Einzelposten ab 400 Euro, Plan aus allen Regelzahlungen der
// Kategorie, Investitionen und neutrale Kategorien nicht als Konsum.
import assert from "node:assert/strict";
import test from "node:test";
import { guardrailWarnungen } from "../app/szenarien.mjs";

const HEUTE = "2026-10-19";
const kat = (kategorie_id, extra = {}) => ({ kategorie_id, name: kategorie_id, typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv", ...extra });
const tx = (buchungsdatum, betrag, kategorie_id) => ({ konto_id: "KTO-001", buchungsdatum, betrag, ist_transfer: false, kategorie_id, kategorisierung_status: "bestaetigt" });
const rz = (regelzahlung_id, betrag, kategorie_id, qualitaet) => ({ regelzahlung_id, bezeichnung: regelzahlung_id, betrag, rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-06-01", status: "bestaetigt", qualitaet, kategorie_id, erstellt_am: "2026-06-01" });
// Zwoelf volle Monate 10/2025 bis 09/2026 mit demselben Betrag.
const jeMonat = (betrag, kategorie_id) => Array.from({ length: 12 }, (_, i) => tx(`${i < 3 ? 2025 : 2026}-${String(((i + 9) % 12) + 1).padStart(2, "0")}-15`, betrag, kategorie_id));
const bestand = (kategorien, transaktionen, regelzahlungen = []) => ({ konten: [], kategorien, transaktionen, regelzahlungen });

test("Einzelposten ab 400 Euro zaehlen nicht gegen den Konsumplan", () => {
  const data = bestand([kat("KAT-007")], [...jeMonat("-240.00", "KAT-007"), tx("2026-09-24", "-1500.00", "KAT-007")], [rz("RZ-1", "-245.00", "KAT-007", "geschaetzt")]);
  assert.deepEqual(guardrailWarnungen(data, HEUTE), []);
});

test("Erstattungen in derselben Kategorie mindern das Ist", () => {
  const data = bestand([kat("KAT-007")], [...jeMonat("-300.00", "KAT-007"), tx("2026-07-06", "1100.00", "KAT-007")], [rz("RZ-1", "-215.00", "KAT-007", "geschaetzt")]);
  // netto (12 x 300 - 1100) / 12 = 208,33 im Monat, Plan 215
  assert.deepEqual(guardrailWarnungen(data, HEUTE), []);
});

test("Plan zaehlt alle Regelzahlungen der Kategorie, nicht nur die geschaetzten", () => {
  const data = bestand([kat("KAT-005")], jeMonat("-380.00", "KAT-005"), [rz("RZ-1", "-350.00", "KAT-005", "belegt"), rz("RZ-2", "-30.00", "KAT-005", "geschaetzt")]);
  assert.deepEqual(guardrailWarnungen(data, HEUTE), []);
});

test("Kategorie nur mit belegten Regelzahlungen wird nicht plausibilisiert", () => {
  const data = bestand([kat("KAT-002")], jeMonat("-500.00", "KAT-002"), [rz("RZ-1", "-210.00", "KAT-002", "belegt")]);
  assert.deepEqual(guardrailWarnungen(data, HEUTE), []);
});

test("zwoelf Monate statt drei: ein teurer Sommer allein warnt nicht", () => {
  const sommer = new Set(["2026-07", "2026-08", "2026-09"]);
  const transaktionen = jeMonat("-300.00", "KAT-017").map((t) => (sommer.has(t.buchungsdatum.slice(0, 7)) ? { ...t, betrag: "-350.00" } : t));
  const data = bestand([kat("KAT-017")], transaktionen, [rz("RZ-1", "-300.00", "KAT-017", "geschaetzt")]);
  // Schnitt 312,50, 90 % davon 281,25 < Plan 300; die drei Sommermonate allein (350) wuerden warnen
  assert.deepEqual(guardrailWarnungen(data, HEUTE), []);
});

test("Plan deutlich unter dem Ist ohne Einzelposten warnt mit Monatswerten", () => {
  const data = bestand([kat("KAT-008")], [...jeMonat("-350.00", "KAT-008"), tx("2026-08-10", "-520.00", "KAT-008")], [rz("RZ-1", "-170.00", "KAT-008", "geschaetzt")]);
  const w = guardrailWarnungen(data, HEUTE);
  assert.equal(w.length, 1);
  assert.equal(w[0].code, "cash-realismus");
  assert.equal(w[0].kategorie_id, "KAT-008");
  assert.equal(w[0].plan_cents, 17000);
  assert.equal(w[0].ist_cents, 35000);
});

test("Investitionen, neutrale Kategorien und reine Einzelposten sind nicht ungeplant", () => {
  const data = bestand(
    [kat("KAT-027", { investition: true }), kat("KAT-010", { typ: "neutral", sparziel: "depot" }), kat("KAT-019")],
    [...jeMonat("-6000.00", "KAT-027"), ...jeMonat("-600.00", "KAT-010"), tx("2026-07-02", "-1200.00", "KAT-019")],
  );
  assert.deepEqual(guardrailWarnungen(data, HEUTE), []);
});

test("materielles laufendes Ist ohne Regelzahlung ist ungeplant", () => {
  const data = bestand([kat("KAT-006")], jeMonat("-70.00", "KAT-006"));
  const w = guardrailWarnungen(data, HEUTE);
  assert.equal(w.length, 1);
  assert.equal(w[0].code, "kategorie-ungeplant");
  assert.equal(w[0].ist_cents, 7000);
});

test("vollstaendigBis begrenzt das Fenster auf vollstaendig gebuchte Monate", () => {
  // September ist auf einem Konto noch nicht gebucht: nur 10/2025 bis 08/2026 zaehlen.
  const transaktionen = jeMonat("-300.00", "KAT-017").map((t) => (t.buchungsdatum.startsWith("2026-09") ? { ...t, betrag: "-390.00" } : t));
  const data = bestand([kat("KAT-017")], [...transaktionen, tx("2026-09-20", "-390.00", "KAT-017"), tx("2026-09-25", "-390.00", "KAT-017")], [rz("RZ-1", "-300.00", "KAT-017", "geschaetzt")]);
  assert.equal(guardrailWarnungen(data, HEUTE).length, 1);
  assert.deepEqual(guardrailWarnungen(data, HEUTE, { vollstaendigBis: "2026-08-31" }), []);
});

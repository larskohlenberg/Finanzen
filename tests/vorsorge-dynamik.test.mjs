import assert from "node:assert/strict";
import test from "node:test";
import { dynamikStand } from "../app/vorsorge-dynamik.mjs";

const HEUTE = "2026-10-17";
const vertrag = (dynamik) => ({ vorsorge_id: "VS-001", status: "aktiv", dynamik });
const e = (termin, entscheidung) => ({ termin, entscheidung });

test("ohne Dynamik kein Stand", () => {
  assert.equal(dynamikStand({ vorsorge_id: "VS-001" }, HEUTE), null);
});

test("zwei Ablehnungen in Folge: letzte Chance, annehmen", () => {
  const s = dynamikStand(vertrag({ termin: "12-01", verlauf: [e("2023-12-01", "angenommen"), e("2024-12-01", "abgelehnt"), e("2025-12-01", "abgelehnt")] }), HEUTE);
  assert.equal(s.naechster_termin, "2026-12-01");
  assert.equal(s.ablehnungen_in_folge, 2);
  assert.equal(s.letzte_chance, true);
  assert.equal(s.vorschlag, "annehmen");
  assert.equal(s.grund, "letzte-chance");
  assert.equal(s.erloschen, false);
  assert.equal(s.entscheidung_noetig, true);
});

test("eine Annahme in den letzten zwei Jahren: ablehnen", () => {
  const s = dynamikStand(vertrag({ termin: "11-01", verlauf: [e("2024-11-01", "abgelehnt"), e("2025-11-01", "angenommen")] }), HEUTE);
  assert.equal(s.naechster_termin, "2026-11-01");
  assert.equal(s.vorschlag, "ablehnen");
  assert.equal(s.grund, "kuerzlich-angenommen");
  assert.equal(s.letzte_chance, false);
});

test("bereits entschiedener Termin: der naechste liegt ein Jahr spaeter", () => {
  const s = dynamikStand(vertrag({ termin: "11-01", verlauf: [e("2024-11-01", "angenommen"), e("2025-11-01", "angenommen"), e("2026-11-01", "abgelehnt")] }), HEUTE);
  assert.equal(s.naechster_termin, "2027-11-01");
  assert.equal(s.letzte_entscheidung.termin, "2026-11-01");
  assert.equal(s.ablehnungen_in_folge, 1);
  assert.equal(s.vorschlag, "ablehnen");
  assert.equal(s.entscheidung_noetig, false);
});

test("Verlauf ungeordnet erfasst wird nach Termin sortiert", () => {
  const s = dynamikStand(vertrag({ termin: "11-01", verlauf: [e("2025-11-01", "abgelehnt"), e("2024-11-01", "abgelehnt")] }), HEUTE);
  assert.deepEqual(s.verlauf.map((v) => v.termin), ["2024-11-01", "2025-11-01"]);
  assert.equal(s.ablehnungen_in_folge, 2);
});

test("drei Ablehnungen in Folge: Recht erloschen, kein naechster Termin", () => {
  const s = dynamikStand(vertrag({ termin: "04-01", verlauf: [e("2024-04-01", "abgelehnt"), e("2025-04-01", "abgelehnt"), e("2026-04-01", "abgelehnt")] }), HEUTE);
  assert.equal(s.erloschen, true);
  assert.equal(s.naechster_termin, null);
  assert.equal(s.vorschlag, null);
  assert.equal(s.grund, "erloschen");
  assert.equal(s.entscheidung_noetig, false);
});

test("eigene Schwelle laut Vertrag", () => {
  const s = dynamikStand(vertrag({ termin: "04-01", erlischt_nach: 4, verlauf: [e("2024-04-01", "abgelehnt"), e("2025-04-01", "abgelehnt"), e("2026-04-01", "abgelehnt")] }), HEUTE);
  assert.equal(s.erloschen, false);
  assert.equal(s.letzte_chance, true);
  assert.equal(s.vorschlag, "annehmen");
});

test("nur eine bekannte Ablehnung: Verlauf reicht fuer keinen Vorschlag", () => {
  const s = dynamikStand(vertrag({ termin: "12-01", verlauf: [e("2025-12-01", "abgelehnt")] }), HEUTE);
  assert.equal(s.vorschlag, null);
  assert.equal(s.grund, "verlauf-unvollstaendig");
  assert.equal(s.luecke, true);
});

test("Luecke direkt vor dem naechsten Termin zaehlt nicht als Ablehnung", () => {
  const s = dynamikStand(vertrag({ termin: "12-01", verlauf: [e("2023-12-01", "abgelehnt"), e("2024-12-01", "abgelehnt")] }), HEUTE);
  assert.equal(s.naechster_termin, "2026-12-01");
  assert.equal(s.ablehnungen_in_folge, 0);
  assert.equal(s.luecke, true);
  assert.equal(s.vorschlag, null);
});

test("ohne Verlauf: naechster Termin ab heute", () => {
  const s = dynamikStand(vertrag({ termin: "12-01" }), HEUTE);
  assert.equal(s.naechster_termin, "2026-12-01");
  assert.equal(s.verlauf.length, 0);
  assert.equal(s.entscheidung_noetig, true);
});

test("kurz nach dem Termin bleibt ein unentschiedener Termin der naechste", () => {
  const s = dynamikStand(vertrag({ termin: "11-01", verlauf: [e("2024-11-01", "abgelehnt"), e("2025-11-01", "angenommen")] }), "2026-11-15");
  assert.equal(s.naechster_termin, "2026-11-01");
});

test("vorliegendes Angebot ohne Entscheidung", () => {
  const s = dynamikStand(vertrag({ termin: "07-01", verlauf: [e("2025-07-01", "angenommen"), e("2026-07-01", "angenommen"), e("2027-07-01", "offen")] }), HEUTE);
  assert.equal(s.naechster_termin, "2027-07-01");
  assert.equal(s.angebot_offen, true);
  assert.equal(s.entscheidung_noetig, true);
  assert.equal(s.vorschlag, "ablehnen");
});

test("Termin weit weg und kein Angebot: keine Entscheidung noetig", () => {
  const s = dynamikStand(vertrag({ termin: "07-01", verlauf: [e("2025-07-01", "abgelehnt"), e("2026-07-01", "angenommen")] }), HEUTE);
  assert.equal(s.naechster_termin, "2027-07-01");
  assert.equal(s.entscheidung_noetig, false);
});

test("beendeter Vertrag zeigt den Verlauf, verlangt aber nichts", () => {
  const vs = { ...vertrag({ termin: "12-01", verlauf: [e("2024-12-01", "abgelehnt"), e("2025-12-01", "abgelehnt")] }), status: "beendet" };
  const s = dynamikStand(vs, HEUTE);
  assert.equal(s.naechster_termin, null);
  assert.equal(s.entscheidung_noetig, false);
});

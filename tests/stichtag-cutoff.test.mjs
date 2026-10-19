// Stichtag-Cutoff (Review 0A.5 / F6): Werte mit Standdatum nach dem Stichtag
// duerfen in keine Bewertung zum Stichtag einfliessen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeNettovermoegen, computeVermoegenChecks, kontoWert, restschuldHeute } from "../app/vermoegen.mjs";
import { kennzahlenText } from "../app/mcp/kennzahlen.mjs";

const anteil = [{ person_id: "PER-001", zaehler: 1, nenner: 1 }];
const zw = (entitaet, entitaet_id, feld, standdatum, wert) => ({ entitaet, entitaet_id, feld, standdatum, wert, qualitaet: "belegt" });

function daten() {
  return {
    personen: [{ person_id: "PER-001", name: "Person A", status: "aktiv" }],
    konten: [
      { konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" },
      { konto_id: "KTO-002", name: "Depot", kontotyp: "depot", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: false, status: "aktiv" },
    ],
    transaktionen: [],
    immobilien: [{ immobilie_id: "IMM-001", bezeichnung: "Haus", eigentumsanteile: anteil, status: "aktiv" }],
    vermoegenswerte: [{ vermoegenswert_id: "VMW-001", typ: "edelmetall", bezeichnung: "Gold", eigentumsanteile: anteil, status: "aktiv" }],
    vorsorge: [{ vorsorge_id: "VS-001", name: "LV", art: "lebensversicherung", kapitalbildend: true, status: "aktiv", person_id: "PER-001", geprueft_am: "2024-01-01" }],
    darlehen: [{ darlehen_id: "DAR-001", bezeichnung: "Kredit", status: "aktiv", anfangsdatum: "2020-01-31", zinssatz: "0.00", sollrate: "100.00", rhythmus_einheit: "monat", rhythmus_intervall: 1 }],
    regelzahlungen: [],
    fristen: [],
    zeitwerte: [
      zw("konto", "KTO-001", "kontostand", "2024-06-30", "1000.00"),
      zw("konto", "KTO-001", "kontostand", "2025-06-30", "9999.00"),
      zw("konto", "KTO-002", "depotwert", "2024-06-30", "2000.00"),
      zw("konto", "KTO-002", "depotwert", "2025-06-30", "8888.00"),
      zw("immobilie", "IMM-001", "marktwert", "2024-01-01", "300000.00"),
      zw("immobilie", "IMM-001", "marktwert", "2025-01-01", "777777.00"),
      zw("vermoegenswert", "VMW-001", "marktwert", "2024-01-01", "500.00"),
      zw("vermoegenswert", "VMW-001", "marktwert", "2025-01-01", "666.00"),
      zw("vorsorge", "VS-001", "rueckkaufswert", "2024-01-01", "4000.00"),
      zw("vorsorge", "VS-001", "rueckkaufswert", "2025-01-01", "5555.00"),
      zw("darlehen", "DAR-001", "restschuld", "2024-11-30", "1000.00"),
      zw("darlehen", "DAR-001", "restschuld", "2025-03-31", "100.00"),
    ],
  };
}

const STICHTAG = "2024-12-31";

test("kontoWert nimmt zum Stichtag nur Anker und Depotwerte bis dahin", () => {
  const d = daten();
  assert.equal(kontoWert(d.konten[0], d.zeitwerte, d.transaktionen, STICHTAG).wert_cents, 100000);
  assert.equal(kontoWert(d.konten[1], d.zeitwerte, d.transaktionen, STICHTAG).wert_cents, 200000);
});

test("restschuldHeute schreibt vom letzten Anker bis zum Stichtag fort, nicht von einem spaeteren", () => {
  const d = daten();
  // Anker 2024-11-30 1000, Rate 100 ohne Zins am 2024-12-31 -> 900
  assert.equal(restschuldHeute(d.darlehen[0], d.zeitwerte, STICHTAG).wert_cents, 90000);
});

test("computeNettovermoegen zum Stichtag ignoriert spaetere Zeitwerte", () => {
  const nv = computeNettovermoegen(daten(), STICHTAG);
  const wert = (id) => nv.positionen.find((p) => p.id === id).wert_cents;
  assert.equal(wert("KTO-001"), 100000);
  assert.equal(wert("KTO-002"), 200000);
  assert.equal(wert("IMM-001"), 30000000);
  assert.equal(wert("VMW-001"), 50000);
  assert.equal(wert("VS-001"), 400000);
  assert.equal(wert("DAR-001"), -90000);
  for (const p of nv.positionen) assert.ok(!p.standdatum || p.standdatum <= STICHTAG, `${p.id} Stand ${p.standdatum}`);
});

test("computeNettovermoegen: nur spaetere Werte zaehlen als fehlend", () => {
  const d = daten();
  const nv = computeNettovermoegen(d, "2023-12-31");
  for (const p of nv.positionen) assert.equal(p.fehlt, true, p.id);
});

test("computeVermoegenChecks zum Stichtag sieht keine spaeteren Anker", () => {
  const checks = computeVermoegenChecks(daten(), "2023-12-31");
  const arten = (id) => checks.filter((c) => c.entitaet_id === id).map((c) => c.art);
  assert.ok(arten("KTO-001").includes("anker-fehlt"));
  assert.ok(arten("KTO-002").includes("marktwert-fehlt"));
  assert.ok(arten("IMM-001").includes("marktwert-fehlt"));
  assert.ok(arten("DAR-001").includes("anker-fehlt"));
});

test("MCP kennzahlen {stichtag} nennt keine Werte nach dem Stichtag", () => {
  const d = { ...daten(), kategorien: [], kategorisierungsregeln: [], transfers: [], validation: { valid: true, errors: [] }, checks: [], importfehler: [] };
  const text = kennzahlenText(d, STICHTAG);
  for (const spaeter of ["9.999", "9999", "8888", "777777", "666,00", "666.00", "5555"]) assert.ok(!text.includes(spaeter), `${spaeter} im Text`);
  assert.match(text, /Nettovermoegen: /);
});

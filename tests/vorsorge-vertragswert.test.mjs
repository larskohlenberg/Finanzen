import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateMasterData } from "../app/tools/validate-core.mjs";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: (key) => (key === "finance-m2-data-mode" ? "demo" : null), setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
  const cleanPath = String(path).replace(/^\.\//, "").replace(/\?.*$/, "");
  const body = readFileSync(new URL(`../app/${cleanPath}`, import.meta.url), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};
await import("../app/i18n.js");

const { data, state } = await import("../app/runtime.mjs");
const { renderVorsorge } = await import("../app/views/vorsorge.mjs");
const { computeNettovermoegen } = await import("../app/vermoegen.mjs");

const BELEG = "Belege/Vorsorge/VS-002_Muster-Riester/2026/2026_Muster_Vertragsuebersicht.pdf";

const vertraege = [
  { vorsorge_id: "VS-001", art: "ruerup", name: "Basisrente Muster", person_id: "PER-001", status: "aktiv", kapitalbildend: false, geprueft_am: "2026-01-01" },
  { vorsorge_id: "VS-002", art: "riester", name: "Riester Muster", person_id: "PER-001", status: "aktiv", kapitalbildend: true, geprueft_am: "2026-01-01" },
];
const zeitwerte = [
  { entitaet: "vorsorge", entitaet_id: "VS-001", feld: "vertragswert", wert: "35000.00", standdatum: "2026-09-30", qualitaet: "belegt" },
  { entitaet: "vorsorge", entitaet_id: "VS-002", feld: "rueckkaufswert", wert: "24000.00", standdatum: "2025-12-31", qualitaet: "belegt" },
  { entitaet: "vorsorge", entitaet_id: "VS-002", feld: "vertragswert", wert: "27000.00", standdatum: "2026-10-01", qualitaet: "belegt", quelle_hinweis: BELEG },
];

function mitFixture(fn) {
  const saved = { ...data, selectedVorsorgeId: state.selectedVorsorgeId, view: state.view, vorsorgeTab: state.vorsorgeTab };
  try {
    Object.assign(data, {
      vorsorge: vertraege, zeitwerte, personen: [{ person_id: "PER-001", name: "Lena", status: "aktiv" }],
      regelzahlungen: [], transaktionen: [], konten: [], kategorien: [], transfers: [],
      immobilien: [], darlehen: [], vermoegenswerte: [], szenarien: [],
    });
    state.view = "vorsorge";
    fn();
  } finally {
    Object.assign(data, saved);
    state.selectedVorsorgeId = saved.selectedVorsorgeId;
    state.view = saved.view;
    state.vorsorgeTab = saved.vorsorgeTab;
  }
}

test("Validator erlaubt vertragswert nur fuer Vorsorge", () => {
  const basis = {
    personen: [{ person_id: "PER-001", name: "Lena", status: "aktiv" }],
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    kategorien: [], transaktionen: [], transfers: [], vorsorge: vertraege,
  };
  assert.deepEqual(validateMasterData({ ...basis, zeitwerte }).errors, []);
  const falsch = validateMasterData({ ...basis, zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "vertragswert", wert: "1.00", standdatum: "2026-01-01", qualitaet: "belegt" }] });
  assert.ok(falsch.errors.some((e) => /vertragswert ist fuer konto nicht zulaessig/.test(e)), falsch.errors.join("\n"));
});

test("Vertragswert zaehlt nicht ins Nettovermoegen", () => {
  mitFixture(() => {
    const nv = computeNettovermoegen(data, "2026-10-12");
    const vorsorge = nv.positionen.filter((p) => p.klasse === "vorsorge");
    assert.deepEqual(vorsorge.map((p) => [p.id, p.wert_cents]), [["VS-002", 2400000]]);
  });
});

test("Vorsorge-Karten zeigen den Vertragswert neben der Rente", () => {
  mitFixture(() => {
    state.vorsorgeTab = "renten";
    state.selectedVorsorgeId = "";
    const html = renderVorsorge();
    assert.match(html, /24\.000,00/, "Rueckkaufswert der Riester-Karte");
    assert.match(html, /35\.000,00[\s\S]*Vertragswert · nicht im Vermögen/, "Vertragswert auch bei nicht kapitalbildendem Vertrag sichtbar");
  });
});

test("Vorsorge-Detail zeigt Vertragswert, Quelle und Dokumente", () => {
  mitFixture(() => {
    state.selectedVorsorgeId = "VS-002";
    const html = renderVorsorge();
    const detail = html.slice(html.indexOf("objekt-detail-titel"));
    assert.match(detail, /Rückkaufswert[\s\S]*24\.000,00[\s\S]*Vertragswert 27\.000/, "Vertragswert als Notiz am Rueckkaufswert");
    assert.match(detail, /27\.000,00\s€<\/strong> <span class="muted">Vertragswert \(nicht im Vermögen\)/);
    assert.match(detail, /#\/dokumente\/Vorsorge\/VS-002_Muster-Riester/, "Quelle des Wertstands verlinkt das Dokument");
    assert.match(detail, /Dokumente/, "Detail hat einen Dokumente-Abschnitt");
  });
});

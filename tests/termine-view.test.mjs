import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bestandAntwort } from "./hilfe-bestand.mjs";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: (key) => (key === "finance-m2-data-mode" ? "demo" : null), setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
  const bestand = bestandAntwort(path);
  if (bestand) return bestand;
  const cleanPath = String(path).replace(/^\.\//, "").replace(/\?.*$/, "");
  const body = readFileSync(new URL(`../app/${cleanPath}`, import.meta.url), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};
await import("../app/i18n.js");

const { data, state } = await import("../app/runtime.mjs");
const { renderTermine } = await import("../app/views/termine.mjs");
const { renderFristen } = await import("../app/views/fristen.mjs");

const TODAY = "2026-10-17";

function testdaten() {
  data.regelzahlungen = [
    { regelzahlung_id: "RZ-001", bezeichnung: "Miete", betrag: "-900.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt" },
  ];
  data.vorsorge = [{ vorsorge_id: "VS-001", art: "betriebsrente", name: "Testrente", person_id: "PER-001", status: "aktiv", kapitalbildend: false, leistung_beginn: "2040-03-01", kapitalwahl: "offen" }];
  data.darlehen = [];
  data.immobilien = [{ immobilie_id: "IMM-001", bezeichnung: "Testhaus", status: "aktiv" }];
  data.fristen = [
    { frist_id: "FR-001", bezeichnung: "Dynamik widersprechen", art: "widerspruch", datum: "2026-11-15", rhythmus_einheit: "jahr", rhythmus_intervall: 1, vorsorge_id: "VS-001" },
    { frist_id: "FR-002", bezeichnung: "Abrechnung pruefen", art: "wiedervorlage", datum: "2026-09-30", immobilie_id: "IMM-001" },
    { frist_id: "FR-003", bezeichnung: "Alte Kuendigung", art: "kuendigung", datum: "2026-03-31", erledigt_bis: "2026-03-31" },
  ];
}

test("Termine zeigt beide Reiter, Regelzahlungen sind Standard", () => {
  testdaten();
  state.lang = "de";
  state.termineTab = "regelzahlungen";
  const html = renderTermine();
  assert.match(html, /<h1 class="page-title">Termine<\/h1>/);
  assert.match(html, /data-action="termine-tab" data-tab="regelzahlungen"/);
  assert.match(html, /data-action="termine-tab" data-tab="fristen"/);
  assert.match(html, /1 Regelzahlungen/);
  assert.match(html, /3 Fristen/);
  assert.match(html, /Miete/);
});

test("Fristenliste: jede erfasste Frist einmal, offene nach Datum, erledigte am Ende", () => {
  testdaten();
  state.lang = "de";
  const html = renderFristen(TODAY);
  const reihenfolge = [...html.matchAll(/id="frist-(FR-\d{3})"/g)].map((m) => m[1]);
  assert.deepEqual(reihenfolge, ["FR-002", "FR-001", "FR-003"]);
  assert.match(html, /id="frist-FR-002" class="ueberfaellig"[\s\S]*?überfällig[\s\S]*?<\/tr>/);
  assert.match(html, /id="frist-FR-001" class="bald"[\s\S]*?Testrente[\s\S]*?jährlich[\s\S]*?15\.11\.2026[\s\S]*?<\/tr>/);
  assert.match(html, /id="frist-FR-003" class=""[\s\S]*?Kündigung[\s\S]*?erledigt[\s\S]*?<\/tr>/);
  // Abgeleitete Termine stehen getrennt, auch wenn sie Jahre entfernt sind.
  assert.match(html, /Aus Verträgen abgeleitet[\s\S]*?Kapitalwahl entscheiden[\s\S]*?Testrente/);
});

test("Fristen-Reiter markiert Ueberfaelliges", () => {
  testdaten();
  state.termineTab = "fristen";
  const html = renderTermine();
  assert.match(html, /data-tab="fristen">\s*<span class="vermoegen-tab-titel">3 Fristen<span class="tab-punkt"/);
  assert.match(html, /id="termine-tab-fristen"/);
  state.termineTab = "regelzahlungen";
});

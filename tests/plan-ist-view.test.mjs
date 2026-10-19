// Seite Plan & Ist und Planzeile der Uebersichtskacheln, mit den Demodaten im
// Browser-Modus (runtime.mjs mit fetch-Shim); dazu die Route #/plan-ist.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bestandAntwort } from "./hilfe-bestand.mjs";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: (key) => (key === "finance-m2-data-mode" ? "demo" : null), setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (pfad) => {
  const bestand = bestandAntwort(pfad);
  if (bestand) return bestand;
  const rein = String(pfad).replace(/^\.\//, "").replace(/\?.*$/, "").replace(/^data\/master\//, "data/demo/");
  const body = readFileSync(new URL(`../app/${rein}`, import.meta.url), "utf8");
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
};
await import("../app/i18n.js");
const { state } = await import("../app/runtime.mjs");
const { renderPlanIst, abweichungHtml } = await import("../app/views/plan-ist.mjs");
const { renderOverview } = await import("../app/views/uebersicht.mjs");
const { parseRoute, routeFromState } = await import("../app/routing.mjs");

test("Plan & Ist: Auswahl, drei Kennzahlen, Verlauf und Kategorien", () => {
  state.planIst = { granularitaet: "jahr", periode: "", darstellung: "monat" };
  const html = renderPlanIst();
  assert.match(html, /data-control="plan-ist-periode"/);
  assert.match(html, /data-action="plan-ist-gran" data-gran="quartal"/);
  assert.match(html, /data-action="plan-ist-darstellung" data-darstellung="summe"/);
  assert.equal((html.match(/vorsorge-kopf-kz/g) ?? []).length, 3);
  assert.match(html, /data-kachel="planIst\.verlauf"/);
  assert.match(html, /data-kachel="planIst\.ausgaben"/);
  assert.match(html, /data-action="plan-ist-periode" data-periode="\d{4}"/);
  assert.match(html, /data-action="plan-ist-zeile"/);
});

test("Plan & Ist: aufgeklappte Kategorie zeigt Regelzahlungen und den Sprung in die Buchungen", () => {
  state.planIst = { granularitaet: "quartal", periode: "12m", darstellung: "summe" };
  const zu = renderPlanIst();
  const key = zu.match(/data-action="plan-ist-zeile" data-zeile="([^"]+)"/)[1];
  state.planIstOffen.add(key);
  const offen = renderPlanIst();
  state.planIstOffen.clear();
  assert.match(offen, /plan-ist-detail/);
  assert.match(offen, /data-action="kategorie-transactions"/);
  assert.match(offen, /data-periode="\d{4}-Q[1-4]"/);
});

test("Uebersicht: Kacheln tragen die Planzeile mit Link auf Plan & Ist", () => {
  const html = renderOverview();
  assert.equal((html.match(/class="kpi-plan"/g) ?? []).length >= 2, true);
  assert.match(html, /data-action="plan-ist" data-periode="12m"/);
});

test("abweichungHtml: Farbe nach Wirkung, unter einem Euro neutral", () => {
  assert.match(abweichungHtml(1200, 1000), /abw-gut/);
  assert.match(abweichungHtml(1200, 1000, { mehrIstGut: false }), /abw-schlecht/);
  assert.match(abweichungHtml(1050, 1000), /abw-neutral/);
});

test("Route #/plan-ist mit und ohne Zeitraum", () => {
  assert.deepEqual(parseRoute("#/plan-ist"), { view: "planIst" });
  assert.deepEqual(parseRoute("#/plan-ist/2026-Q2"), { view: "planIst", planIstPeriode: "2026-Q2" });
  assert.deepEqual(parseRoute("#/plan-ist/unsinn"), { view: "planIst" });
  assert.equal(routeFromState({ view: "planIst", planIst: { periode: "" } }), "#/plan-ist");
  assert.equal(routeFromState({ view: "planIst", planIst: { periode: "12m" } }), "#/plan-ist/12m");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
const { renderAbsicherungKachel } = await import("../app/views/absicherung.mjs");
const { renderVorsorge } = await import("../app/views/vorsorge.mjs");

const HEUTE = "2026-10-17";
const zw = (id, feld, wert, standdatum = "2026-01-01") => ({ entitaet: "vorsorge", entitaet_id: id, feld, wert, standdatum, qualitaet: "belegt" });

function mitFixture(fn) {
  const saved = { ...data, lang: state.lang, view: state.view, selectedVorsorgeId: state.selectedVorsorgeId, klappKacheln: state.klappKacheln };
  try {
    Object.assign(data, {
      personen: [
        { person_id: "PER-001", name: "Anna Muster", status: "aktiv" },
        { person_id: "PER-002", name: "Ben Muster", status: "aktiv" },
      ],
      vorsorge: [
        { vorsorge_id: "VS-001", art: "gesetzliche-rente", name: "Gesetzliche Rente Anna", person_id: "PER-001", status: "geplant", kapitalbildend: false, geprueft_am: "2026-01-01" },
        { vorsorge_id: "VS-002", art: "schutzversicherung", name: "BU Anna", person_id: "PER-001", status: "aktiv", kapitalbildend: false, geprueft_am: "2026-01-01" },
        { vorsorge_id: "VS-003", art: "schutzversicherung", name: "Haftpflicht Ben", person_id: "PER-002", status: "aktiv", kapitalbildend: false },
      ],
      zeitwerte: [
        zw("VS-001", "erwerbsminderungsrente", "950.00", "2026-07-01"),
        zw("VS-001", "hinterbliebenenrente", "600.00", "2026-07-01"),
        zw("VS-002", "bu_rente", "1500.00", "2026-03-01"),
      ],
      regelzahlungen: [], transaktionen: [], konten: [], kategorien: [], transfers: [],
      immobilien: [], darlehen: [], vermoegenswerte: [], szenarien: [],
    });
    state.lang = "de";
    return fn();
  } finally {
    Object.assign(data, saved);
    state.lang = saved.lang;
    state.view = saved.view;
    state.selectedVorsorgeId = saved.selectedVorsorgeId;
    state.klappKacheln = saved.klappKacheln;
  }
}

test("Kachel Absicherung: Spalte je Person mit BU und Tod, Posten verlinken auf den Vertrag", () => mitFixture(() => {
  const html = renderAbsicherungKachel(HEUTE);
  assert.match(html, /<h2[^>]*><button class="linkish" data-view="vorsorge">Absicherung<\/button><\/h2>/);
  assert.equal((html.match(/class="absicherung-person"/g) ?? []).length, 2);
  const anna = html.slice(html.indexOf("Anna Muster"), html.indexOf("Ben Muster"));
  assert.match(anna, /Bei Berufsunfähigkeit<\/h4>\s*<strong>2\.450,00\s€ je Monat<\/strong>/);
  assert.match(anna, /Im Todesfall<\/h4>\s*<strong>600,00\s€ je Monat<\/strong>/);
  assert.match(anna, /data-action="open-vorsorge" data-vorsorge="VS-002"><span class="mit-logo"><span class="logo-marke [^"]*"[^>]*>[^<]*<\/span><span>BU Anna<\/span>/);
  assert.match(anna, /BU-Rente · Stand 1\.3\.2026/);
  assert.match(anna, /Erwerbsminderungsrente · Stand 1\.7\.2026/);
  assert.ok(anna.indexOf("VS-002") < anna.indexOf("VS-001"), "groesster Posten zuerst");
  const ben = html.slice(html.indexOf("Ben Muster"));
  assert.equal((ben.match(/nicht erfasst/g) ?? []).length, 2);
  assert.doesNotMatch(html, /style=/);
}));

test("Kachel Absicherung: ohne Personen mit Vertrag ein Hinweis, englische Texte", () => mitFixture(() => {
  data.vorsorge = [];
  assert.match(renderAbsicherungKachel(HEUTE), /Keine Person mit laufendem Vorsorgevertrag erfasst\./);
  state.lang = "en";
  data.vorsorge = [{ vorsorge_id: "VS-002", art: "schutzversicherung", name: "BU Anna", person_id: "PER-001", status: "aktiv", kapitalbildend: false }];
  const html = renderAbsicherungKachel(HEUTE);
  assert.match(html, />Protection</);
  assert.match(html, /On disability/);
  assert.match(html, /On death<\/h4>\s*<span class="muted">not recorded/);
}));

test("Wertstaende eines Vertrags beschriften die Absicherungswerte sprechend", () => mitFixture(() => {
  state.view = "vorsorge";
  state.selectedVorsorgeId = "VS-001";
  state.klappKacheln = { "vorsorge.anhang": true };
  const html = renderVorsorge();
  assert.match(html, /Erwerbsminderungsrente · 1\.7\.2026/);
  assert.match(html, /Hinterbliebenenrente · 1\.7\.2026/);
  assert.doesNotMatch(html, /erwerbsminderungsrente ·/);
}));

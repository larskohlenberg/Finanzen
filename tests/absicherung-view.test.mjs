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
const { renderAbsicherungKacheln } = await import("../app/views/absicherung.mjs");
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

test("Kacheln Absicherung: Personenzeilen sind per Standard zugeklappt", () => mitFixture(() => {
  const html = renderAbsicherungKacheln(HEUTE);
  assert.doesNotMatch(html, /absicherung-posten/);
  assert.match(html, /<h3><button type="button" class="klapp-knopf" data-action="klapp-kachel" data-kachel="absicherung\.bu\.PER-001" data-standard="false" aria-expanded="false"><svg[\s\S]*?<span>Anna Muster<\/span><\/button><\/h3>\s*<strong>2\.450,00\s€ je Monat<\/strong>/);
  assert.match(html, /data-kachel="absicherung\.tod\.PER-001"/);
  // Ohne Posten gibt es nichts aufzuklappen.
  assert.match(html, /<h3>Ben Muster<\/h3>/);
}));

test("Kacheln Absicherung: je eine fuer BU und Tod, darin je Person Summe und Posten mit Link", () => mitFixture(() => {
  state.klappKacheln = { "absicherung.bu.PER-001": true, "absicherung.tod.PER-001": true };
  const html = renderAbsicherungKacheln(HEUTE);
  assert.match(html, /aria-expanded="true"/);
  assert.equal((html.match(/<section class="panel panel-pad absicherung-kachel"/g) ?? []).length, 2);
  const [bu, tod] = html.split('id="absicherung-tod-titel"');
  assert.match(bu, /<h2[^>]*><button class="linkish" data-view="vorsorge"><svg[\s\S]*?<span>Absicherung bei Berufsunfähigkeit<\/span>/);
  assert.match(tod, /<span>Absicherung im Todesfall<\/span>/);
  assert.equal((bu.match(/class="absicherung-person"/g) ?? []).length, 2);
  assert.equal((tod.match(/class="absicherung-person"/g) ?? []).length, 2);
  const buAnna = bu.slice(bu.indexOf("Anna Muster"), bu.indexOf("Ben Muster"));
  assert.match(buAnna, /Anna Muster<\/span><\/button><\/h3>\s*<strong>2\.450,00\s€ je Monat<\/strong>/);
  assert.match(buAnna, /data-action="open-vorsorge" data-vorsorge="VS-002"><span class="mit-logo"><span class="logo-marke [^"]*"[^>]*>[^<]*<\/span><span>BU Anna<\/span>/);
  assert.match(buAnna, /BU-Rente · Stand 1\.3\.2026/);
  assert.match(buAnna, /Erwerbsminderungsrente · Stand 1\.7\.2026/);
  assert.ok(buAnna.indexOf("VS-002") < buAnna.indexOf("VS-001"), "groesster Posten zuerst");
  assert.doesNotMatch(buAnna, /Hinterbliebenenrente/);
  const todAnna = tod.slice(tod.indexOf("Anna Muster"), tod.indexOf("Ben Muster"));
  assert.match(todAnna, /Anna Muster<\/span><\/button><\/h3>\s*<strong>600,00\s€ je Monat<\/strong>/);
  assert.match(todAnna, /Hinterbliebenenrente · Stand 1\.7\.2026/);
  assert.match(bu.slice(bu.indexOf("Ben Muster")), /Ben Muster<\/h3>\s*<span class="muted">nicht erfasst/);
  assert.match(tod.slice(tod.indexOf("Ben Muster")), /Ben Muster<\/h3>\s*<span class="muted">nicht erfasst/);
  assert.doesNotMatch(html, /style=/);
}));

test("Kachel Absicherung: ohne Personen mit Vertrag ein Hinweis, englische Texte", () => mitFixture(() => {
  data.vorsorge = [];
  assert.equal((renderAbsicherungKacheln(HEUTE).match(/Keine Person mit laufendem Vorsorgevertrag erfasst\./g) ?? []).length, 2);
  state.lang = "en";
  data.vorsorge = [{ vorsorge_id: "VS-002", art: "schutzversicherung", name: "BU Anna", person_id: "PER-001", status: "aktiv", kapitalbildend: false }];
  const html = renderAbsicherungKacheln(HEUTE);
  assert.match(html, />Protection on disability</);
  assert.match(html, />Protection on death</);
  assert.match(html, /Anna Muster<\/h3>\s*<span class="muted">not recorded/);
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

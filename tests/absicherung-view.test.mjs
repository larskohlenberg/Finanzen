import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { apiAbwarten, bestandAntwort } from "./hilfe-bestand.mjs";

// Die Lese-APIs rechnen ueber den Bestand der App (data), den die Tests aendern.
let appDaten = null;

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: (key) => (key === "finance-m2-data-mode" ? "demo" : null), setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
  const bestand = bestandAntwort(path, { daten: appDaten });
  if (bestand) return bestand;
  const cleanPath = String(path).replace(/^\.\//, "").replace(/\?.*$/, "");
  const body = readFileSync(new URL(`../app/${cleanPath}`, import.meta.url), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};
await import("../app/i18n.js");

const { data, state } = await import("../app/runtime.mjs");
appDaten = data;
const { renderAbsicherungKacheln } = await import("../app/views/absicherung.mjs");
// Die Personen rechnet in der Uebersicht der Server (uebersicht-modell.mjs); hier direkt.
const { absicherung } = await import("../app/absicherung.mjs");
const { renderVorsorge } = await import("../app/views/vorsorge.mjs");
const { verwerfeApiCaches } = await import("../app/api-daten.mjs");
// Was Buchungen braucht, kommt vom Server (GET /api/v1/vorsorge): Antworten
// verwerfen, zeichnen, auf die Antwort warten, erneut zeichnen.
async function vorsorgeGezeichnet() {
  verwerfeApiCaches();
  renderVorsorge();
  await apiAbwarten();
  return renderVorsorge();
}

const HEUTE = "2026-10-17";
const zw = (id, feld, wert, standdatum = "2026-01-01") => ({ entitaet: "vorsorge", entitaet_id: id, feld, wert, standdatum, qualitaet: "belegt" });

async function mitFixture(fn) {
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
        { ...zw("VS-001", "waisenrente", "150.00", "2026-07-01"), qualitaet: "geschaetzt" },
        zw("VS-002", "bu_rente", "1500.00", "2026-03-01"),
      ],
      regelzahlungen: [], transaktionen: [], konten: [], kategorien: [], transfers: [],
      immobilien: [], darlehen: [], vermoegenswerte: [], szenarien: [],
    });
    state.lang = "de";
    return await fn();
  } finally {
    Object.assign(data, saved);
    state.lang = saved.lang;
    state.view = saved.view;
    state.selectedVorsorgeId = saved.selectedVorsorgeId;
    state.klappKacheln = saved.klappKacheln;
  }
}

test("Kacheln Absicherung: Personenzeilen sind per Standard zugeklappt", async () => mitFixture(async () => {
  const html = renderAbsicherungKacheln(absicherung(data, HEUTE));
  assert.doesNotMatch(html, /absicherung-posten/);
  assert.match(html, /<h3 class="absicherung-person-titel">\s*<button type="button" class="klapp-knopf absicherung-person-kopf" data-action="klapp-kachel" data-kachel="absicherung\.bu\.PER-001" data-standard="false" aria-expanded="false"><svg[\s\S]*?<span class="absicherung-person-name">Anna Muster<\/span><strong>1\.500,00\s€ je Monat<\/strong><span class="absicherung-person-zusatz">bei voller Erwerbsminderung 2\.450,00\s€<\/span><\/button>/);
  assert.match(html, /data-kachel="absicherung\.tod\.PER-001"/);
  // Ohne Posten gibt es nichts aufzuklappen.
  assert.match(html, /<h3>Ben Muster<\/h3>/);
}));

test("Kacheln Absicherung: je eine fuer BU und Tod, darin je Person Summe und Posten mit Link", async () => mitFixture(async () => {
  state.klappKacheln = { "absicherung.bu.PER-001": true, "absicherung.tod.PER-001": true };
  const html = renderAbsicherungKacheln(absicherung(data, HEUTE));
  assert.match(html, /aria-expanded="true"/);
  assert.equal((html.match(/<section class="panel panel-pad absicherung-kachel"/g) ?? []).length, 2);
  const [bu, tod] = html.split('id="absicherung-tod-titel"');
  assert.match(bu, /<h2[^>]*><button class="linkish" data-view="vorsorge"><svg[\s\S]*?<span>Absicherung bei Berufsunfähigkeit<\/span>/);
  assert.match(tod, /<span>Absicherung im Todesfall<\/span>/);
  assert.equal((bu.match(/class="absicherung-person"/g) ?? []).length, 2);
  assert.equal((tod.match(/class="absicherung-person"/g) ?? []).length, 2);
  const buAnna = bu.slice(bu.indexOf("Anna Muster"), bu.indexOf("Ben Muster"));
  // BU-Summe nur BU-Renten, die Erwerbsminderungsrente erst bei voller Erwerbsminderung (eigene Zeile).
  assert.match(buAnna, /Anna Muster<\/span><strong>1\.500,00\s€ je Monat<\/strong><span class="absicherung-person-zusatz">bei voller Erwerbsminderung 2\.450,00\s€<\/span>/);
  assert.match(buAnna, /data-action="open-vorsorge" data-vorsorge="VS-002" title="BU Anna"><span class="mit-logo"><span class="logo-marke [^"]*"[^>]*>[^<]*<\/span><span>BU Anna<\/span>/);
  assert.match(buAnna, /BU-Rente · 1\.3\.2026/);
  assert.match(buAnna, /Erwerbsminderungsrente · 1\.7\.2026/);
  assert.ok(buAnna.indexOf("VS-002") < buAnna.indexOf("VS-001"), "groesster Posten zuerst");
  assert.doesNotMatch(buAnna, /Hinterbliebenenrente/);
  const todAnna = tod.slice(tod.indexOf("Anna Muster"), tod.indexOf("Ben Muster"));
  // Die gesetzliche Witwenrente steht vor Einkommensanrechnung: Stern an der Summe und am Posten, keine Fussnote.
  assert.match(todAnna, /Anna Muster<\/span><strong>750,00\s€ je Monat\*<\/strong>/);
  assert.match(todAnna, /Witwen-\/Witwerrente · vor Anrechnung\* · 1\.7\.2026/);
  assert.match(todAnna, /Waisenrente · geschätzt · befristet · 1\.7\.2026/);
  assert.doesNotMatch(html, /absicherung-hinweis/);
  assert.match(bu.slice(bu.indexOf("Ben Muster")), /Ben Muster<\/h3>\s*<span class="muted">nicht erfasst/);
  assert.match(tod.slice(tod.indexOf("Ben Muster")), /Ben Muster<\/h3>\s*<span class="muted">nicht erfasst/);
  assert.doesNotMatch(html, /style=/);
}));

test("Kachel Absicherung: ohne Personen mit Vertrag ein Hinweis, englische Texte", async () => mitFixture(async () => {
  data.vorsorge = [];
  assert.equal((renderAbsicherungKacheln(absicherung(data, HEUTE)).match(/Keine Person mit laufendem Vorsorgevertrag erfasst\./g) ?? []).length, 2);
  state.lang = "en";
  data.vorsorge = [{ vorsorge_id: "VS-002", art: "schutzversicherung", name: "BU Anna", person_id: "PER-001", status: "aktiv", kapitalbildend: false }];
  const html = renderAbsicherungKacheln(absicherung(data, HEUTE));
  assert.match(html, />Protection on disability</);
  assert.match(html, />Protection on death</);
  assert.match(html, /Anna Muster<\/h3>\s*<span class="muted">not recorded/);
}));

test("Wertstaende eines Vertrags beschriften die Absicherungswerte sprechend", async () => mitFixture(async () => {
  state.view = "vorsorge";
  state.selectedVorsorgeId = "VS-001";
  state.klappKacheln = { "vorsorge.anhang": true };
  const html = (await vorsorgeGezeichnet());
  assert.match(html, /Erwerbsminderungsrente · 1\.7\.2026/);
  assert.match(html, /Witwen-\/Witwerrente · 1\.7\.2026/);
  assert.match(html, /Waisenrente · 1\.7\.2026/);
  assert.doesNotMatch(html, /erwerbsminderungsrente ·/);
}));

test("Vorsorgeseite: Uebersichtstab zeigt die Absicherungs-Kacheln ohne Link auf sich selbst", async () => mitFixture(async () => {
  state.view = "vorsorge";
  state.selectedVorsorgeId = null;
  state.vorsorgeTab = "uebersicht";
  const html = await vorsorgeGezeichnet();
  assert.equal((html.match(/<section class="panel panel-pad absicherung-kachel"/g) ?? []).length, 2);
  assert.match(html, /id="absicherung-tod-titel"><span class="uebersicht-kachel-titel"><svg[\s\S]*?<span>Absicherung im Todesfall<\/span><\/span><\/h2>/);
  assert.doesNotMatch(html, /absicherung-kachel[\s\S]*?data-view="vorsorge"/);
  assert.ok(html.indexOf("absicherung-kacheln") > html.indexOf("Rückkaufswerte"), "unter Rueckkaufswerten und Beitraegen");
}));

test("Kacheln Absicherung: ohne gesetzliche Witwenrente kein Stern", async () => mitFixture(async () => {
  data.vorsorge = data.vorsorge.map((vs) => (vs.vorsorge_id === "VS-001" ? { ...vs, art: "betriebsrente" } : vs));
  const html = renderAbsicherungKacheln(absicherung(data, HEUTE));
  assert.doesNotMatch(html, /\*/);
}));

test("Kacheln Absicherung: Tod mit Einmal- und laufendem Betrag, BU nur mit Erwerbsminderungsrente", async () => mitFixture(async () => {
  data.zeitwerte = [
    ...data.zeitwerte.filter((z) => z.feld !== "bu_rente"),
    zw("VS-002", "todesfallleistung", "50000.00", "2026-03-01"),
  ];
  const html = renderAbsicherungKacheln(absicherung(data, HEUTE));
  const [bu, tod] = html.split('id="absicherung-tod-titel"');
  assert.match(bu, /Anna Muster<\/span><strong>keine BU-Rente<\/strong><span class="absicherung-person-zusatz">bei voller Erwerbsminderung 950,00\s€<\/span>/);
  assert.match(tod, /Anna Muster<\/span><strong>50\.000,00\s€ einmalig<\/strong><span class="absicherung-person-zusatz">dazu 750,00\s€ je Monat\*<\/span>/);
}));

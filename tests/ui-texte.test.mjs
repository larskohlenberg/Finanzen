// tests/ui-texte.test.mjs
// UI-Texte: Sidebar nennt den Datenmodus, kein veralteter Meilenstein-Hinweis,
// Kachel ohne fehlende Kontoreferenzen nicht in Warnfarbe, Check-Meldungen mit
// lokal formatierten Betraegen und Daten. Laeuft auf den Demodaten.
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
const { renderChecks, lesbarerCheckText } = await import("../app/views/checks.mjs");
const { renderMasterdata } = await import("../app/views/stammdaten.mjs");

function t(lang, pfad) {
  let wert = window.FINANCE_I18N[lang];
  for (const teil of pfad.split(".")) wert = wert?.[teil];
  return wert;
}

test("Sidebar: Stand nennt den Datenmodus, nicht pauschal Masterdaten", () => {
  assert.equal(t("de", "chrome.releaseStateLive"), "Web-App · Echtdaten");
  assert.equal(t("de", "chrome.releaseStateDemo"), "Web-App · Demodaten");
  assert.ok(t("en", "chrome.releaseStateLive") && t("en", "chrome.releaseStateDemo"));
  assert.equal(t("de", "chrome.releaseState"), undefined, "alter Schluessel ohne Modus ist weg");
  const main = readFileSync(new URL("../app/main.js", import.meta.url), "utf8");
  assert.match(main, /state\.dataMode === "demo" \? "chrome\.releaseStateDemo" : "chrome\.releaseStateLive"/);
});

test("Liquiditaet: Hinweis ohne veraltete Meilensteine", () => {
  for (const lang of ["de", "en"]) {
    const text = t(lang, "liquiditaet.incompleteNote");
    assert.doesNotMatch(text, /\bM\d\b|folgen später|follow later/, lang);
  }
});

test("Administration: 0 fehlende Kontoreferenzen ist keine Warnung", () => {
  const vorher = data.checks;
  try {
    data.checks = [];
    const chip = () => renderMasterdata().match(/<span class="chip (\w+)">(?:(?!class="chip)[^])*?(\d+) fehlende Kontoreferenzen/)?.slice(1);
    assert.deepEqual(chip(), ["success", "0"]);
    data.checks = [{ title_key: "checks.accountReferenceMissing.title", severity: "review", scope: "konto", entity_id: data.konten[0].konto_id }];
    assert.deepEqual(chip(), ["review", "1"]);
  } finally {
    data.checks = vorher;
  }
});

test("lesbarerCheckText: Betraege und ISO-Daten lokal, IDs bleiben", () => {
  state.lang = "de";
  const lesbar = (text) => lesbarerCheckText(text).replace(/\u00a0/g, " ");
  assert.equal(
    lesbar("Konto Giro: Buchungen passen nicht zum Kontoauszug 2026-03-31 (erwartet 34792.40, belegt -12.05)"),
    "Konto Giro: Buchungen passen nicht zum Kontoauszug 31.3.2026 (erwartet 34.792,40 €, belegt -12,05 €)",
  );
  assert.equal(lesbar("Frist FR-012 Kuendigung: fällig am 2026-11-30"), "Frist FR-012 Kuendigung: fällig am 30.11.2026");
  assert.equal(lesbar("Vorsorge VS-003: Dynamik zum 12-01 entscheiden"), "Vorsorge VS-003: Dynamik zum 12-01 entscheiden");
  state.lang = "en";
  assert.match(lesbar("erwartet 34792.40 am 2026-03-31"), /€34,792\.40 am 3\/31\/2026/);
  state.lang = "de";
});

test("Checks-Seite zeigt Vermoegens-Checks ohne Rohzahlen und ISO-Daten", () => {
  const html = renderChecks();
  assert.match(html, /erwartet/, "Demodaten haben bewusst reconciliation-drift-Checks");
  assert.doesNotMatch(html, /erwartet -?\d+\.\d{2}\b/);
  assert.doesNotMatch(html, /Kontoauszug \d{4}-\d{2}-\d{2}/);
});

test("Vermoegen: kein toter Hinweis mit veraltetem Meilenstein", () => {
  for (const lang of ["de", "en"]) {
    assert.equal(t(lang, "vermoegen.incompleteNote"), undefined, lang);
  }
});

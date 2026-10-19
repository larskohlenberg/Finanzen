// tests/logo-marke.test.mjs
// logoMarke (komponenten.mjs) auf den Demodaten: Kuerzel ohne Logo, Bild aus
// dem Datenbestand mit Logo, Vererbung auf Regelzahlung. Logo-Eintrag erfunden.
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
const { data } = await import("../app/runtime.mjs");
const { logoMarke, mitLogo } = await import("../app/komponenten.mjs");

test("ohne Logo: Kuerzel in fester Farbe, ohne Bild; ohne Namen nichts", () => {
  data.logos = [];
  const html = logoMarke({ gegenpartei: "Nordstadt Pflege gGmbH" });
  assert.match(html, /^<span class="logo-marke kuerzel-farbe-\d" aria-hidden="true">NP<\/span>$/);
  assert.equal(logoMarke({ gegenpartei: "Nordstadt Pflege gGmbH" }), html, "gleiche Farbe bei jedem Aufruf");
  assert.equal(logoMarke({ gegenpartei: "" }), "");
  assert.equal(mitLogo({ gegenpartei: "Kiosk" }, "Kiosk &amp; Co"), `<span class="mit-logo">${logoMarke({ gegenpartei: "Kiosk" })}<span>Kiosk &amp; Co</span></span>`);
  assert.equal(mitLogo({ gegenpartei: "" }, ""), "", "ohne Namen kein Wrapper");
});

test("mit Logo: Bild aus dem gewaehlten Datenbestand, Kuerzel bleibt darunter", () => {
  data.logos = [{ logo_id: "LOGO-001", name: "Muster", gegenpartei_pattern: "Muster GmbH", domain: "muster.example", datei: "logos/muster.example.png", quelle: "https://x", abgerufen_am: "2026-10-16" }];
  const html = logoMarke({ gegenpartei: "Muster GmbH" });
  assert.match(html, /^<span class="logo-marke kuerzel-farbe-\d" aria-hidden="true">MU<img src="\.\/data\/demo\/logos\/muster\.example\.png" alt="" loading="lazy" decoding="async"><\/span>$/);
  assert.doesNotMatch(html, /style=/);

  // Das von Buchungen geerbte Logo einer Regelzahlung kommt mit den Grunddaten.
  const rz = { regelzahlung_id: "RZ-TEST", bezeichnung: "Gehalt" };
  data.regelzahlung_logos = { "RZ-TEST": "LOGO-001" };
  assert.match(logoMarke({ regelzahlung: rz }), /muster\.example\.png/);
  data.regelzahlung_logos = {};
  data.logos = [];
});

test("Tabellengroesse: eigene Klasse am Logo, auch ueber mitLogo", () => {
  data.logos = [];
  assert.match(logoMarke({ gegenpartei: "Kiosk" }, { groesse: "tabelle" }), /^<span class="logo-marke logo-tabelle kuerzel-farbe-\d"/);
  assert.match(mitLogo({ gegenpartei: "Kiosk" }, "Kiosk", { groesse: "tabelle" }), /^<span class="mit-logo"><span class="logo-marke logo-tabelle /);
  assert.doesNotMatch(logoMarke({ gegenpartei: "Kiosk" }), /logo-tabelle/);
});

test("Konto: Logo ueber den Kontonamen, Groessenklasse frei waehlbar", () => {
  data.logos = [{ logo_id: "LOGO-001", name: "Musterbank", gegenpartei_pattern: "MUSTERBANK", domain: "musterbank.example", datei: "logos/musterbank.example.png", quelle: "https://x", abgerufen_am: "2026-10-16" }];
  assert.match(logoMarke({ konto: { konto_id: "KTO-1", name: "Musterbank Girokonto" } }, { groesse: "tabelle" }), /^<span class="logo-marke logo-tabelle kuerzel-farbe-\d" aria-hidden="true">MU<img src="\.\/data\/demo\/logos\/musterbank\.example\.png"/);
  assert.match(logoMarke({ konto: { konto_id: "KTO-2", name: "Haushaltskasse" } }, { groesse: "vergleich" }), /^<span class="logo-marke logo-vergleich kuerzel-farbe-\d" aria-hidden="true">HA<\/span>$/);
  data.logos = [];
});

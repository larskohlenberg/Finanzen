// tests/logo-marke.test.mjs
// logoMarke (komponenten.mjs) auf den Demodaten: Kuerzel ohne Logo, Bild aus
// dem Datenbestand mit Logo, Vererbung auf Regelzahlung. Logo-Eintrag erfunden.
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

  const rz = { regelzahlung_id: "RZ-TEST", bezeichnung: "Gehalt" };
  data.transaktionen = [...data.transaktionen, { ...data.transaktionen[0], transaktion_id: "TXN-test", regelzahlung_id: "RZ-TEST" }];
  assert.match(logoMarke({ regelzahlung: rz }), /muster\.example\.png/);
  data.logos = [];
});

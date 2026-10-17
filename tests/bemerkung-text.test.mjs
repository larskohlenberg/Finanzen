// Strukturierte Bemerkungen (komponenten.mjs): Absaetze, Zwischenueberschriften, Aufzaehlungen.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (pfad) => {
  const body = readFileSync(new URL(`../app/${String(pfad).replace(/^\.\//, "").replace(/\?.*$/, "").replace(/^data\/master\//, "data/demo/")}`, import.meta.url), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};
await import("../app/i18n.js");
const { bemerkungInhalt } = await import("../app/komponenten.mjs");

test("bemerkungInhalt: einfacher Text bleibt ein Absatz", () => {
  assert.equal(bemerkungInhalt("Kapitalwahl noch offen"), "<p>Kapitalwahl noch offen</p>");
  assert.equal(bemerkungInhalt(""), "");
});

test("bemerkungInhalt: Ueberschrift mit Doppelpunkt, Aufzaehlung, Absatz", () => {
  const html = bemerkungInhalt("Kurzfassung in einem Satz.\n\nWerte:\n- Rückkauf 1.000\n- Ablauf 2.000\n\nOffen:\n- Police prüfen");
  assert.equal(html, [
    "<p>Kurzfassung in einem Satz.</p>",
    "<h4>Werte</h4><ul><li>Rückkauf 1.000</li><li>Ablauf 2.000</li></ul>",
    "<h4>Offen</h4><ul><li>Police prüfen</li></ul>",
  ].join(""));
});

test("bemerkungInhalt: Zeilen eines Absatzes, Escaping und Beleglinks", () => {
  const html = bemerkungInhalt("Zeile <a>\nzweite Zeile: siehe Belege/Vorsorge/x.pdf");
  assert.match(html, /^<p>Zeile &lt;a&gt;<br>zweite Zeile: siehe <a class="linkish quelldokument-link" href="#\/dokumente\/Vorsorge\/x.pdf"/);
});

test("bemerkungInhalt: eingerueckte Unterpunkte und lange Zeile mit Doppelpunkt", () => {
  assert.equal(bemerkungInhalt("- Dynamik:\n  - 2024 abgelehnt\n  - 2025 angenommen\n- Ende"),
    "<ul><li>Dynamik:<ul><li>2024 abgelehnt</li><li>2025 angenommen</li></ul></li><li>Ende</li></ul>");
  const lang = `${"x".repeat(70)}:`;
  assert.equal(bemerkungInhalt(lang), `<p>${lang}</p>`);
});

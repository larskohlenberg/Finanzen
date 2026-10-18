import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: (key) => (key === "finance-m2-data-mode" ? "demo" : null), setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
  const body = readFileSync(new URL(`../app/${String(path).replace(/^\.\//, "").replace(/\?.*$/, "")}`, import.meta.url), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};
await import("../app/i18n.js");
const { balkenSvg } = await import("../app/views/vermoegen-teile.mjs");
const { passendeLegende, einpassVersatz } = await import("../app/diagramm-hover.mjs");

test("balkenSvg: Abschnitte mit Titel sind hoverbar (data-titel, data-label) statt <title>", () => {
  const svg = balkenSvg([
    { anteil: 0.75, klasse: "segment-immobilie", titel: "Testhaus: 300.000,00 €" },
    { anteil: 0.25, klasse: "segment-immobilie", titel: "Testwohnung: 100.000,00 €" },
  ]);
  assert.match(svg, /<rect x="0\.000"[^>]*class="balken-segment segment-immobilie" data-titel="Testhaus: 300\.000,00 €" data-label="Testhaus"/);
  assert.match(svg, /data-label="Testwohnung"/);
  assert.doesNotMatch(svg, /<title>/);
});

test("balkenSvg: Abschnitte ohne Titel (Fortschritt) bleiben ohne Hover", () => {
  const svg = balkenSvg([{ anteil: 0.5, klasse: "fortschritt-wert" }], { klasse: "fortschritt" });
  assert.match(svg, /class="fortschritt-wert"/);
  assert.doesNotMatch(svg, /balken-segment|data-titel/);
});

test("passendeLegende: Farbe entscheidet, bei gleicher Farbe der Name", () => {
  const legende = [
    { farben: ["farbpunkt", "segment-konto"], name: "Konten" },
    { farben: ["farbpunkt", "segment-immobilie"], name: "Testhaus" },
    { farben: ["farbpunkt", "segment-immobilie"], name: "Testwohnung" },
    { farben: ["segment-darlehen"], name: "Darlehen 100.000 €" },
  ];
  assert.deepEqual(passendeLegende(["segment-konto"], "Konten", legende), [0]);
  assert.deepEqual(passendeLegende(["segment-immobilie"], "Testwohnung", legende), [2]);
  // Legenden mit Betrag im selben Text (Vermoegensseite): Name am Anfang reicht.
  assert.deepEqual(passendeLegende(["segment-darlehen"], "Darlehen", legende), [3]);
  // Unbekannter Name bei gleicher Farbe: alle Zeilen dieser Farbe.
  assert.deepEqual(passendeLegende(["segment-immobilie"], "Anderes", legende), [1, 2]);
  assert.deepEqual(passendeLegende(["segment-vorsorge"], "Rueckkauf", legende), []);
});

test("einpassVersatz: Box und Erklaertext bleiben im Fenster", () => {
  assert.equal(einpassVersatz(100, 300, 1000), 0);
  // Rechts ueber den Rand: nach links bis 8 px Abstand.
  assert.equal(einpassVersatz(900, 1080, 1000), -88);
  // Links ueber den Rand: nach rechts.
  assert.equal(einpassVersatz(-20, 150, 1000), 28);
  // Breiter als das Fenster: linke Kante gewinnt.
  assert.equal(einpassVersatz(100, 1200, 1000), -92);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
  const cleanPath = String(path).replace(/^\.\//, "").replace(/\?.*$/, "");
  const body = readFileSync(new URL(`../app/${cleanPath}`, import.meta.url), "utf8");
  return {
    ok: true,
    json: async () => JSON.parse(body),
    text: async () => body,
  };
};
await import("../app/i18n.js");

const { regelKlartext, herkunftLabel } = await import("../app/komponenten.mjs");

const kat = (id) => ({ "KAT-003": "Lebensmittel", "KAT-017": "Essen gehen" }[id] || id);

test("Gegenpartei-Pattern wird in Klartext uebersetzt", () => {
  const s = regelKlartext({ gegenpartei_pattern: "musterladenb", kategorie_id: "KAT-003" }, kat);
  assert.match(s, /Lebensmittel/);
  assert.match(s, /Gegenpartei/);
  assert.match(s, /enthält/);
  assert.match(s, /musterladenb/);
});

test("Verwendungszweck- und Vorzeichen-Bedingung werden ergaenzt", () => {
  const s = regelKlartext({ verwendungszweck_pattern: "miete", vorzeichen: "ausgabe", kategorie_id: "KAT-017" }, kat);
  assert.match(s, /Verwendungszweck/);
  assert.match(s, /Ausgabe/);
});

test("herkunftLabel kennt regel, agent, manuell", () => {
  assert.equal(herkunftLabel({ kategorie_herkunft: "regel" }), "Regel");
  assert.equal(herkunftLabel({ kategorie_herkunft: "agent" }), "Agent");
  assert.equal(herkunftLabel({ kategorie_herkunft: "manuell" }), "Manuell");
  assert.equal(herkunftLabel({}), "—");
});

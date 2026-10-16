// Gemeinsame klappbare Kachel (komponenten.mjs): Standard, Umschalten, Kopf-Extra.
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
const { state } = await import("../app/runtime.mjs");
const { klappKachel, toggleKlappKachel } = await import("../app/komponenten.mjs");

test("klappKachel: Standard offen oder zu, Umschalten je id, Kopf-Extra nur offen", () => {
  state.klappKacheln = {};
  const offen = klappKachel({ id: "test.a", titel: "Titel A", inhalt: "<p>Inhalt A</p>", kopfExtra: "<span>Extra</span>" });
  assert.match(offen, /data-kachel="test.a" data-standard="true" aria-expanded="true"/);
  assert.match(offen, /Inhalt A/);
  assert.match(offen, /Extra/);
  const zu = klappKachel({ id: "test.b", titel: "Titel B", inhalt: "<p>Inhalt B</p>", offen: false, kopfExtra: "<span>Extra</span>" });
  assert.match(zu, /aria-expanded="false"/);
  assert.match(zu, /klapp-panel zu/);
  assert.doesNotMatch(zu, /Inhalt B|Extra/);

  toggleKlappKachel("test.b", false);
  assert.match(klappKachel({ id: "test.b", titel: "Titel B", inhalt: "<p>Inhalt B</p>", offen: false }), /Inhalt B/);
  toggleKlappKachel("test.a", true);
  assert.doesNotMatch(klappKachel({ id: "test.a", titel: "Titel A", inhalt: "<p>Inhalt A</p>" }), /Inhalt A/);
  state.klappKacheln = {};
});

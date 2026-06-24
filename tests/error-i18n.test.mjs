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

const runtime = await import("../app/runtime.mjs");
const { t, state } = runtime;

for (const lang of ["de", "en"]) {
  test(`error-Keys sind in ${lang} aufgeloest (kein Pfad-Fallback)`, () => {
    state.lang = lang;
    for (const key of ["error.viewTitle", "error.detailsToggle", "error.dismiss"]) {
      assert.notEqual(t(key), key, `${key} muss in ${lang} einen Text liefern`);
    }
  });
}

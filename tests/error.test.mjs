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

const { renderErrorPanel, safeRender, guard } = await import("../app/error.mjs");

test("renderErrorPanel zeigt Meldung und Stacktrace im aufklappbaren Block", () => {
  const error = new Error("toCents is not defined");
  error.stack = "Error: toCents is not defined\n    at renderRegelzahlungen";
  const html = renderErrorPanel(error, "view:regelzahlungen");
  assert.match(html, /<details>/, "Details-Block muss vorhanden sein");
  assert.match(html, /toCents is not defined/, "Fehlermeldung muss erscheinen");
  assert.match(html, /at renderRegelzahlungen/, "Stacktrace muss erscheinen");
});

test("safeRender reicht das HTML bei Erfolg unveraendert durch", () => {
  const html = safeRender(() => "<p>ok</p>", "view:test");
  assert.equal(html, "<p>ok</p>");
});

test("safeRender liefert das Fehler-Panel statt zu werfen", () => {
  const html = safeRender(() => {
    throw new Error("boom");
  }, "view:test");
  assert.match(html, /<details>/);
  assert.match(html, /boom/);
});

test("guard ruft onError mit dem Fehler auf und wirft nicht weiter", () => {
  let captured = null;
  const wrapped = guard(() => {
    throw new Error("klick kaputt");
  }, (err) => {
    captured = err;
  });
  assert.doesNotThrow(() => wrapped({ type: "click" }));
  assert.equal(captured?.message, "klick kaputt");
});

test("guard reicht Rueckgabewert und Argumente bei Erfolg durch", () => {
  const wrapped = guard((a, b) => a + b, () => {});
  assert.equal(wrapped(2, 3), 5);
});

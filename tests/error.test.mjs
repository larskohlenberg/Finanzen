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

function withCapturedConsoleError(fn) {
  const original = console.error;
  const calls = [];
  console.error = (...args) => calls.push(args);
  try {
    return { result: fn(), calls };
  } finally {
    console.error = original;
  }
}

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
  const { result: html, calls } = withCapturedConsoleError(() => safeRender(() => {
    throw new Error("boom");
  }, "view:test"));
  assert.match(html, /<details>/);
  assert.match(html, /boom/);
  assert.equal(calls.length, 1);
});

test("guard ruft onError mit dem Fehler auf und wirft nicht weiter", () => {
  let captured = null;
  const wrapped = guard(() => {
    throw new Error("klick kaputt");
  }, (err) => {
    captured = err;
  });
  const { calls } = withCapturedConsoleError(() => {
    assert.doesNotThrow(() => wrapped({ type: "click" }));
  });
  assert.equal(captured?.message, "klick kaputt");
  assert.equal(calls.length, 1);
});

test("guard reicht Rueckgabewert und Argumente bei Erfolg durch", () => {
  const wrapped = guard((a, b) => a + b, () => {});
  assert.equal(wrapped(2, 3), 5);
});

test("guard reicht den kontext als zweites Argument an onError weiter", () => {
  let capturedKontext = null;
  const wrapped = guard(() => {
    throw new Error("x");
  }, (_err, kontext) => {
    capturedKontext = kontext;
  }, "click");
  const { calls } = withCapturedConsoleError(() => wrapped({ type: "click" }));
  assert.equal(capturedKontext, "click");
  assert.equal(calls.length, 1);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// App-Start mit strukturell kaputtem Bestand: kein Absturz, sondern Fehlerbanner
// (data.validation) und lesbare Restdaten.
globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: (key) => (key === "finance-m2-data-mode" ? "demo" : null), setItem: () => {} };
globalThis.window = globalThis;
const KAPUTT = { "konten.json": "[null]", "transfers.json": "{}" };
globalThis.fetch = async (path) => {
  const cleanPath = String(path).replace(/^\.\//, "").replace(/\?.*$/, "");
  const datei = cleanPath.split("/").pop();
  const body = Object.hasOwn(KAPUTT, datei) && cleanPath.includes("data/demo/")
    ? KAPUTT[datei]
    : readFileSync(new URL(`../app/${cleanPath}`, import.meta.url), "utf8");
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
};
await import("../app/i18n.js");

test("kaputte Collections: App startet, Validierung meldet Fehler", async () => {
  const runtime = await import("../app/runtime.mjs");
  const { data, kontenById, transfersById } = runtime;
  assert.equal(data.validation.valid, false);
  const fehler = data.validation.errors.join("\n");
  assert.match(fehler, /konten\[0\]: muss ein Objekt sein/);
  assert.match(fehler, /transfers: muss eine Liste sein/);
  assert.equal(data.metadata.validation, "failed");
  assert.equal(kontenById.size, 0);
  assert.equal(transfersById.size, 0);
  assert.ok(Array.isArray(data.transfers));
});

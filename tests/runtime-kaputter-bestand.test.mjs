import assert from "node:assert/strict";
import test from "node:test";
import { bestandAntwort } from "./hilfe-bestand.mjs";

// App-Start mit strukturell kaputtem Bestand: kein Absturz, sondern Fehlerbanner
// (data.validation) und lesbare Restdaten.
globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: (key) => (key === "finance-m2-data-mode" ? "demo" : null), setItem: () => {} };
globalThis.window = globalThis;
const KAPUTT = { "konten.json": "[null]", "transfers.json": "{}" };
globalThis.fetch = async (path) => bestandAntwort(path, { ersetze: KAPUTT });
await import("../app/i18n.js");

test("kaputte Collections: App startet, Validierung meldet Fehler", async () => {
  const runtime = await import("../app/runtime.mjs");
  const { data, kontenById } = runtime;
  assert.equal(data.validation.valid, false);
  const fehler = data.validation.errors.join("\n");
  assert.match(fehler, /konten\[0\]: muss ein Objekt sein/);
  assert.match(fehler, /transfers: muss eine Liste sein/);
  assert.equal(data.metadata.validation, "failed");
  assert.equal(kontenById.size, 0);
  // Transfers und Buchungen bleiben auf dem Server (Grunddaten ohne sie).
  assert.equal(data.transfers, undefined);
  assert.equal(data.transaktionen, undefined);
});

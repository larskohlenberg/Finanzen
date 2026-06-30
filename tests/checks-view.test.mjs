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
const checksView = await import("../app/views/checks.mjs");
const { data, state } = runtime;
const { renderChecks } = checksView;

test("Checks-View rendert ohne ReferenceError (Transfer- und Konto-Lookups)", () => {
  // Realistische Daten, die die Lookups transaktionenById/kontenById ausloesen.
  data.transfers = [
    {
      transfer_id: "TR-001",
      betrag: "100.00",
      abgang_transaktion_id: "TX-001",
      zugang_transaktion_id: "TX-002",
    },
  ];
  data.transaktionen = [
    {
      transaktion_id: "TX-001",
      ist_transfer: true,
      transfer_id: "TR-001",
      buchungsdatum: "2026-06-01",
      gegenpartei: "Sparkonto",
    },
    {
      transaktion_id: "TX-002",
      ist_transfer: true,
      transfer_id: "TR-001",
      buchungsdatum: "2026-06-01",
      gegenpartei: "Girokonto",
    },
  ];
  data.checks = [
    {
      scope: "konto",
      severity: "review",
      title_key: "checksPage.title",
      detail_key: "checksPage.lead",
      entity_id: data.konten[0]?.konto_id ?? "KON-001",
    },
  ];

  state.view = "checks";

  // Darf NICHT werfen (vorher: ReferenceError: transaktionenById is not defined).
  const html = renderChecks();
  assert.equal(typeof html, "string");
  assert.match(html, /TR-001/, "Transfer muss in der Liste erscheinen");
});

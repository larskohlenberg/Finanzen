import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Browser-global shim (same pattern as detail-rail-initial-state.test.mjs)
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

const { renderHerkunft, matchesOriginFilter } = await import("../app/views/transaktionen.mjs");

// renderHerkunft(tx) is a pure string function — no DOM, no data access needed.

test("renderHerkunft: manuell shows manual origin label", () => {
  const tx = {
    kategorie_herkunft: "manuell",
    kategorie_id: "KAT-001",
    kategorisierung_status: "bestaetigt",
  };
  const html = renderHerkunft(tx);
  assert.match(html, /Manuell/);
});

test("renderHerkunft: agent shows agent origin label", () => {
  const tx = {
    kategorie_herkunft: "agent",
    kategorie_id: "KAT-001",
    kategorisierung_status: "vorgeschlagen",
  };
  const html = renderHerkunft(tx);
  assert.match(html, /Agent/);
});

test("renderHerkunft: regel with matched_regeln shows rule id and data-rule link", () => {
  const tx = {
    kategorie_herkunft: "regel",
    kategorie_id: "KAT-001",
    kategorisierung_status: "bestaetigt",
    matched_regeln: ["REG-001"],
  };
  const html = renderHerkunft(tx);
  assert.match(html, /REG-001/);
  assert.match(html, /data-rule="REG-001"/);
});

test("renderHerkunft: conflict (offen + matched_regeln) shows conflict label and both ids", () => {
  const tx = {
    kategorisierung_status: "offen",
    matched_regeln: ["REG-001", "REG-002"],
  };
  const html = renderHerkunft(tx);
  // Conflict label (German)
  assert.match(html, /offen/);
  assert.match(html, /Regeln widersprechen/);
  assert.match(html, /REG-001/);
  assert.match(html, /REG-002/);
});

test("renderHerkunft: regel without matched_regeln shows unknown origin label", () => {
  const tx = {
    kategorie_herkunft: "regel",
    kategorie_id: "KAT-001",
    kategorisierung_status: "bestaetigt",
  };
  const html = renderHerkunft(tx);
  assert.match(html, /Quelle unbekannt/);
});

test("renderHerkunft: no herkunft and no matched_regeln returns dash", () => {
  const tx = {
    kategorisierung_status: "bestaetigt",
    kategorie_id: "KAT-001",
  };
  const html = renderHerkunft(tx);
  assert.equal(html, "—");
});

test("Herkunft-Filter matcht regel/agent/manuell", () => {
  assert.equal(matchesOriginFilter({ kategorie_herkunft: "manuell" }, "manuell"), true);
  assert.equal(matchesOriginFilter({ kategorie_herkunft: "regel" }, "manuell"), false);
  assert.equal(matchesOriginFilter({ kategorie_herkunft: "agent" }, "agent"), true);
  assert.equal(matchesOriginFilter({ kategorie_herkunft: "regel" }, ""), true); // empty filter = all
});

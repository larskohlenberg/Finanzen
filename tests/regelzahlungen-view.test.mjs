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
const regelzahlungenView = await import("../app/views/regelzahlungen.mjs");
const { data, state } = runtime;
const { renderRegelzahlungen } = regelzahlungenView;

test("Regelzahlungs-Liste rendert Eintrag mit formatiertem Betrag", () => {
  data.regelzahlungen = [
    {
      regelzahlung_id: "RZ-001",
      bezeichnung: "Gehalt Lena",
      betrag: "3200.00",
      rhythmus_einheit: "monat",
      rhythmus_intervall: 1,
      anker_datum: "2026-07-01",
      status: "bestaetigt",
      kategorie_id: "KAT-001",
    },
  ];

  state.view = "regelzahlungen";

  const html = renderRegelzahlungen();
  assert.match(html, /Gehalt Lena/, "Bezeichnung must appear in the list");
  assert.match(html, /3\.200/, "Betrag must be rendered as money (3.200)");
});

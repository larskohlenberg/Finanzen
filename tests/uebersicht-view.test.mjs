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
const overviewView = await import("../app/views/uebersicht.mjs");
const { data, state } = runtime;
const { renderOverview } = overviewView;

test("Übersicht zeigt berechnete Vermögens-Checks in der Check-Vorschau", () => {
  const personId = data.personen[0]?.person_id ?? "PER-001";
  data.validation = { valid: true, errors: [] };
  data.importfehler = [];
  data.checks = [];
  data.konten = [
    {
      konto_id: "KTO-999",
      name: "Testkonto ohne Anker",
      kontotyp: "giro",
      inhaber_person_ids: [personId],
      liquiditaetsrelevant: true,
      status: "aktiv",
    },
  ];
  data.transaktionen = [];
  data.transfers = [];
  data.regelzahlungen = [];
  data.immobilien = [];
  data.darlehen = [];
  data.vermoegenswerte = [];
  data.vorsorge = [];
  data.zeitwerte = [];
  state.view = "overview";

  const html = renderOverview();

  assert.match(html, /Anker fehlt/);
  assert.match(html, /Testkonto ohne Anker: kein belegter Kontostand/);
});

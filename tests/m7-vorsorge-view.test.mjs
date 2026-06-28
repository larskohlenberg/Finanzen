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
const vorsorgeView = await import("../app/views/vorsorge.mjs");
const { data, state } = runtime;
const { renderVorsorge } = vorsorgeView;

test("Vorsorge-Liste rendert Rueckkaufswert und ungeprueft-Badge", () => {
  data.vorsorge = [
    {
      vorsorge_id: "VS-003",
      art: "riester",
      name: "Riester Lena",
      person_id: "PER-001",
      status: "aktiv",
      kapitalbildend: true,
      kapitalwahl: "offen",
      geprueft_am: "2026-01-15",
    },
    {
      vorsorge_id: "VS-006",
      art: "betriebsrente",
      name: "bAV Lena",
      person_id: "PER-001",
      status: "geplant",
      kapitalbildend: false,
    },
  ];
  data.zeitwerte = [
    { entitaet: "vorsorge", entitaet_id: "VS-003", feld: "rueckkaufswert", wert: "9100.00", standdatum: "2026-01-01", qualitaet: "belegt" },
    { entitaet: "vorsorge", entitaet_id: "VS-006", feld: "erwartete_rente", wert: "240.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" },
  ];
  data.regelzahlungen = [];
  data.personen = [{ person_id: "PER-001", name: "Lena", status: "aktiv" }];
  data.konten = [];
  data.kategorien = [];
  data.transaktionen = [];
  data.transfers = [];
  data.immobilien = [];
  data.darlehen = [];
  data.vermoegenswerte = [];
  data.szenarien = [];
  state.view = "vorsorge";

  const html = renderVorsorge();
  assert.match(html, /Riester Lena/, "Contract name must appear in the list");
  assert.match(html, /9\.100/, "Rueckkaufswert must be rendered as money (9.100)");
  assert.match(html, /ungeprüft/, "Ungeprueft badge label must appear");
});

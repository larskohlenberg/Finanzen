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
const stammdatenView = await import("../app/views/stammdaten.mjs");
const { data, state } = runtime;
const { renderMasterdata } = stammdatenView;

test("Konten-Stammdaten zeigen die Konto-ID", () => {
  const personId = data.personen[0]?.person_id ?? "PER-001";
  data.konten = [
    {
      konto_id: "KTO-SICHTBAR",
      name: "Testkonto",
      kontotyp: "giro",
      inhaber_person_ids: [personId],
      liquiditaetsrelevant: true,
      status: "aktiv",
    },
  ];
  data.transaktionen = [];
  data.zeitwerte = [];
  state.view = "masterdata";
  state.masterSection = "konten";

  const html = renderMasterdata();

  assert.match(html, /<th>ID<\/th>/);
  assert.match(html, /<td>KTO-SICHTBAR<\/td>/);
});

test("Kategorien-Stammdaten zeigen die Kategorie-ID", () => {
  data.kategorien = [
    {
      kategorie_id: "KAT-SICHTBAR",
      name: "Testkategorie",
      typ: "ausgabe",
      lebenshaltung_relevant: true,
      status: "aktiv",
    },
  ];
  state.view = "masterdata";
  state.masterSection = "kategorien";

  const html = renderMasterdata();

  assert.match(html, /<th>ID<\/th>/);
  assert.match(html, /<td>KAT-SICHTBAR<\/td>/);
});

test("Regelliste zeigt REG-001 und Trefferanzahl 1", () => {
  data.kategorisierungsregeln = [
    {
      regel_id: "REG-001",
      gegenpartei_pattern: "musterladenb",
      kategorie_id: "KAT-001",
      status: "aktiv",
      erstellt_am: "2026-01-01",
      kommentar: "MusterladenB -> Lebensmittel",
    },
  ];
  data.transaktionen = [
    {
      transaktion_id: "TXN-1",
      buchungsdatum: "2026-01-02",
      gegenpartei: "MusterladenB Markt",
      matched_regeln: ["REG-001"],
    },
  ];

  state.view = "masterdata";
  state.masterSection = "regeln";
  state.selectedRegel = "";

  const html = renderMasterdata();
  assert.match(html, /REG-001/, "REG-001 must appear in the rule list");
  assert.match(html, /\b1\b/, "Hit count 1 must appear");
});

test("Regeldetail zeigt Klartext und Beispiel-Gegenpartei", () => {
  data.kategorisierungsregeln = [
    {
      regel_id: "REG-001",
      gegenpartei_pattern: "musterladenb",
      kategorie_id: "KAT-001",
      status: "aktiv",
      erstellt_am: "2026-01-01",
      kommentar: "MusterladenB -> Lebensmittel",
    },
  ];
  data.transaktionen = [
    {
      transaktion_id: "TXN-1",
      buchungsdatum: "2026-01-02",
      gegenpartei: "MusterladenB Markt",
      matched_regeln: ["REG-001"],
    },
  ];

  state.view = "masterdata";
  state.masterSection = "regeln";
  state.selectedRegel = "REG-001";

  const html = renderMasterdata();
  assert.match(html, /Bucht auf/, "Klartext condition must contain 'Bucht auf'");
  assert.match(html, /MusterladenB Markt/, "Example counterparty must appear in detail view");
});

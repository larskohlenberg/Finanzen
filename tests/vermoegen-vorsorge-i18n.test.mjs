import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bestandAntwort } from "./hilfe-bestand.mjs";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: (key) => (key === "finance-m2-data-mode" ? "demo" : null), setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
  const bestand = bestandAntwort(path);
  if (bestand) return bestand;
  const cleanPath = String(path).replace(/^\.\//, "").replace(/\?.*$/, "");
  const body = readFileSync(new URL(`../app/${cleanPath}`, import.meta.url), "utf8");
  return {
    ok: true,
    json: async () => JSON.parse(body),
    text: async () => body,
  };
};
await import("../app/i18n.js");

const { data, state } = await import("../app/runtime.mjs");
const { renderVermoegen } = await import("../app/views/vermoegen.mjs");

test("Vorsorge erscheint lokalisiert als Verweis-Zeile, nicht als Tab", () => {
  const originalData = {
    konten: data.konten,
    immobilien: data.immobilien,
    vermoegenswerte: data.vermoegenswerte,
    darlehen: data.darlehen,
    vorsorge: data.vorsorge,
    zeitwerte: data.zeitwerte,
  };
  const originalState = {
    lang: state.lang,
    vermoegenFilters: state.vermoegenFilters,
    selectedVermoegenId: state.selectedVermoegenId,
    vermoegenDetailRailClosed: state.vermoegenDetailRailClosed,
    vermoegenRailMode: state.vermoegenRailMode,
  };

  try {
    Object.assign(data, {
      konten: [],
      immobilien: [],
      vermoegenswerte: [],
      darlehen: [],
      vorsorge: [{
        vorsorge_id: "VS-I18N",
        name: "Testvorsorge",
        status: "aktiv",
        kapitalbildend: true,
      }],
      zeitwerte: [{
        entitaet: "vorsorge",
        entitaet_id: "VS-I18N",
        feld: "rueckkaufswert",
        wert: "1000.00",
        standdatum: "2026-08-11",
        qualitaet: "belegt",
      }],
    });
    state.vermoegenFilters = { klasse: "", qualitaet: "" };
    state.selectedVermoegenId = "";
    state.vermoegenDetailRailClosed = false;
    state.vermoegenRailMode = "position";

    for (const [lang, label] of [["de", "Vorsorge \\(Rückkaufswerte\\)"], ["en", "Pensions \\(surrender values\\)"]]) {
      state.lang = lang;
      const html = renderVermoegen();
      assert.match(html, new RegExp(`<button class="linkish" data-view="vorsorge">${label}</button>`));
      assert.doesNotMatch(html, /data-tab="vorsorge"/);
      assert.doesNotMatch(html, /vermoegen\.klasse/);
    }
  } finally {
    Object.assign(data, originalData);
    Object.assign(state, originalState);
  }
});

test("Immobilien-Tab bietet den lokalisierten Ruecklink zu den Buchungen", () => {
  const originalData = {
    konten: data.konten,
    immobilien: data.immobilien,
    vermoegenswerte: data.vermoegenswerte,
    darlehen: data.darlehen,
    vorsorge: data.vorsorge,
    zeitwerte: data.zeitwerte,
  };
  const originalState = {
    lang: state.lang,
    vermoegenFilters: state.vermoegenFilters,
    selectedVermoegenId: state.selectedVermoegenId,
    vermoegenDetailRailClosed: state.vermoegenDetailRailClosed,
    vermoegenRailMode: state.vermoegenRailMode,
  };

  try {
    Object.assign(data, {
      konten: [],
      immobilien: [{
        immobilie_id: "IMM-001",
        bezeichnung: "Testhaus",
        status: "aktiv",
        eigentumsanteile: [],
      }],
      vermoegenswerte: [],
      darlehen: [],
      vorsorge: [],
      zeitwerte: [{
        entitaet: "immobilie",
        entitaet_id: "IMM-001",
        feld: "marktwert",
        wert: "100000.00",
        standdatum: "2026-01-01",
        qualitaet: "belegt",
      }],
    });
    Object.assign(state, {
      vermoegenFilters: { klasse: "", qualitaet: "" },
      selectedVermoegenId: "immobilie:IMM-001",
      vermoegenDetailRailClosed: false,
      vermoegenRailMode: "position",
    });

    for (const [lang, label] of [["de", "Alle \\d+ Buchungen anzeigen"], ["en", "Show all \\d+ bookings"]]) {
      state.lang = lang;
      const html = renderVermoegen();
      assert.match(html, /data-action="immobilie-transactions" data-immobilie="IMM-001"/);
      assert.match(html, new RegExp(label));
    }
  } finally {
    Object.assign(data, originalData);
    Object.assign(state, originalState);
  }
});

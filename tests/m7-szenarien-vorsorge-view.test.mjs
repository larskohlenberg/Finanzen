import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { apiAbwarten, bestandAntwort } from "./hilfe-bestand.mjs";

// Die Lese-APIs rechnen ueber den Bestand der App (data), den die Tests aendern.
let appDaten = null;

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: (key) => (key === "finance-m2-data-mode" ? "demo" : null), setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
  const bestand = bestandAntwort(path, { daten: appDaten });
  if (bestand) return bestand;
  const cleanPath = String(path).replace(/^\.\//, "").replace(/\?.*$/, "");
  const body = readFileSync(new URL(`../app/${cleanPath}`, import.meta.url), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};
await import("../app/i18n.js");

const runtime = await import("../app/runtime.mjs");
const szenarienView = await import("../app/views/szenarien.mjs");
const { data, state } = runtime;
appDaten = data;
const { renderSzenarien } = szenarienView;
const { verwerfeApiCaches } = await import("../app/api-daten.mjs");
// Startbestand und Prognose-Hinweise kommen vom Server (GET /api/v1/szenarien):
// Antworten verwerfen, zeichnen, auf die Antwort warten, erneut zeichnen.
async function szenarienGezeichnet() {
  verwerfeApiCaches();
  renderSzenarien();
  await apiAbwarten();
  return renderSzenarien();
}

function setBasis() {
  data.personen = [{ person_id: "PER-001", name: "Lena", status: "aktiv" }];
  data.konten = [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", status: "aktiv", liquiditaetsrelevant: true }];
  data.kategorien = [];
  data.transaktionen = [];
  data.transfers = [];
  data.immobilien = [];
  data.darlehen = [];
  data.vermoegenswerte = [];
  data.regelzahlungen = [];
}

test("Szenario-Detail rendert vorsorge-leistung (Renten-Arm) statt Platzhalter", async () => {
  setBasis();
  data.vorsorge = [{ vorsorge_id: "VS-001", art: "gesetzliche-rente", name: "GRV Lena", person_id: "PER-001", status: "geplant", kapitalbildend: false, geprueft_am: "2026-01-15" }];
  data.zeitwerte = [
    { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "5000.00", standdatum: "2026-06-01", qualitaet: "belegt" },
    { entitaet: "vorsorge", entitaet_id: "VS-001", feld: "erwartete_rente", wert: "1480.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" },
  ];
  data.szenarien = [{
    szenario_id: "SZN-004", name: "Ruhestand Lena", status: "entwurf", stand: "2026-06-22", reichweite_bis: "2048-12-31", erstellt_am: "2026-06-22",
    annahmen: [{ annahme_id: "A2", art: "vorsorge-leistung", vorsorge_id: "VS-001", arm: "rente", ab: "2042-08-01", qualitaet: "geschaetzt", begruendung: "Gesetzliche Rente Lena" }],
  }];
  state.selectedSzenarioId = "SZN-004";
  state.szenarioPhaseOffen = new Set([0]); // Annahmen stehen in der aufgeklappten Phase

  const html = (await szenarienGezeichnet());
  assert.match(html, /Vorsorgeleistung/, "Annahme-Art muss lokalisiert erscheinen");
  assert.match(html, /VS-001/, "Inhalt muss die vorsorge_id zeigen (kein — Platzhalter)");
  assert.match(html, /Rente/, "Arm-Label 'rente' muss lokalisiert erscheinen");
  assert.doesNotMatch(html, /szenarien\.art\.vorsorge-leistung/, "Roher i18n-Key darf nicht durchschlagen");
});

test("Szenario-Detail rendert vorsorge-leistung (Kapital-Arm)", async () => {
  setBasis();
  data.vorsorge = [{ vorsorge_id: "VS-005", art: "schutzversicherung", name: "Risiko-LV", person_id: "PER-001", status: "aktiv", kapitalbildend: false, geprueft_am: "2026-01-15" }];
  data.zeitwerte = [
    { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "5000.00", standdatum: "2026-06-01", qualitaet: "belegt" },
    { entitaet: "vorsorge", entitaet_id: "VS-005", feld: "erwartete_kapitalleistung", wert: "200000.00", standdatum: "2026-01-01", qualitaet: "belegt" },
  ];
  data.szenarien = [{
    szenario_id: "SZN-005", name: "Todesfall Martin", status: "entwurf", stand: "2026-06-22", reichweite_bis: "2040-12-31", erstellt_am: "2026-06-22",
    annahmen: [{ annahme_id: "A2", art: "vorsorge-leistung", vorsorge_id: "VS-005", arm: "kapital", ab: "2028-03-15", qualitaet: "belegt", begruendung: "Todesfallleistung" }],
  }];
  state.selectedSzenarioId = "SZN-005";
  state.szenarioPhaseOffen = new Set([0]); // Annahmen stehen in der aufgeklappten Phase

  const html = (await szenarienGezeichnet());
  assert.match(html, /Vorsorgeleistung/);
  assert.match(html, /VS-005/);
  assert.match(html, /Kapitalleistung/, "Arm-Label 'kapital' muss lokalisiert erscheinen");
});

test("Szenario-Detail nennt die Fortfuehrung beitragsfrei mit Datum", async () => {
  setBasis();
  data.vorsorge = [{ vorsorge_id: "VS-007", art: "lebensversicherung", name: "Klassik-LV", person_id: "PER-001", status: "aktiv", kapitalbildend: true, geprueft_am: "2026-01-15" }];
  data.zeitwerte = [
    { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "5000.00", standdatum: "2026-06-01", qualitaet: "belegt" },
    { entitaet: "vorsorge", entitaet_id: "VS-007", feld: "beitragsfreie_kapitalleistung", wert: "6000.00", standdatum: "2026-01-01", qualitaet: "belegt" },
  ];
  data.szenarien = [{
    szenario_id: "SZN-006", name: "LV beitragsfrei", status: "entwurf", stand: "2026-06-22", reichweite_bis: "2030-12-31", erstellt_am: "2026-06-22",
    annahmen: [{ annahme_id: "A1", art: "vorsorge-leistung", vorsorge_id: "VS-007", arm: "kapital", ab: "2028-03-15", fortfuehrung: "beitragsfrei", beitragsfrei_ab: "2026-01-01", qualitaet: "belegt" }],
  }];
  state.selectedSzenarioId = "SZN-006";
  state.szenarioPhaseOffen = new Set([0]);

  const html = (await szenarienGezeichnet());
  assert.match(html, /Kapitalleistung · beitragsfrei ab 1\.1\.2026/);
  assert.doesNotMatch(html, /szenarien\.fortfuehrung/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { computeVermoegenChecks } from "../app/vermoegen.mjs";

globalThis.window = globalThis;
await import("../app/i18n.js");

function t(lang, path) {
  const parts = path.split(".");
  let current = window.FINANCE_I18N[lang];
  for (const part of parts) {
    current = current?.[part];
  }
  return typeof current === "string" ? current : path;
}

const TODAY = "2026-06-28";

function checkArts() {
  const data = {
    konten: [
      { konto_id: "KTO-001", name: "Ohne Anker", kontotyp: "giro", status: "aktiv" },
      { konto_id: "KTO-002", name: "Drift", kontotyp: "giro", status: "aktiv" },
      { konto_id: "KTO-003", name: "Depot ohne Wert", kontotyp: "depot", status: "aktiv" },
      { konto_id: "KTO-004", name: "Depot alt", kontotyp: "depot", status: "aktiv" },
    ],
    immobilien: [{ immobilie_id: "IMM-001", bezeichnung: "Haus ohne Wert", status: "aktiv" }],
    vermoegenswerte: [{ vermoegenswert_id: "VMW-001", bezeichnung: "Gold ohne Wert", typ: "edelmetall", status: "aktiv" }],
    darlehen: [{ darlehen_id: "DAR-001", bezeichnung: "Darlehen ohne Rate", status: "aktiv" }],
    vorsorge: [
      { vorsorge_id: "VS-001", art: "betriebsrente", name: "Ungeprueft", person_id: "PER-001", status: "geplant", kapitalbildend: false },
      { vorsorge_id: "VS-002", art: "gesetzliche-rente", name: "Wiedervorlage", person_id: "PER-001", status: "geplant", kapitalbildend: false, geprueft_am: "2024-01-01" },
      { vorsorge_id: "VS-003", art: "schutzversicherung", name: "Wechsel", person_id: "PER-001", status: "aktiv", kapitalbildend: false, geprueft_am: "2026-01-01" },
    ],
    regelzahlungen: [
      { regelzahlung_id: "RZ-001", bezeichnung: "Vorsorge endet", betrag: "-10.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", aktiv_bis: "2027-01-31", status: "bestaetigt", vorsorge_id: "VS-003" },
    ],
    transaktionen: [
      { konto_id: "KTO-002", buchungsdatum: "2026-01-15", betrag: "10.00" },
      { konto_id: "KTO-004", buchungsdatum: "2026-06-10", betrag: "5.00" },
    ],
    zeitwerte: [
      { entitaet: "konto", entitaet_id: "KTO-002", feld: "kontostand", wert: "100.00", standdatum: "2026-01-01", qualitaet: "belegt" },
      { entitaet: "konto", entitaet_id: "KTO-002", feld: "kontostand", wert: "120.00", standdatum: "2026-01-31", qualitaet: "belegt" },
      { entitaet: "konto", entitaet_id: "KTO-004", feld: "depotwert", wert: "1000.00", standdatum: "2026-05-01", qualitaet: "belegt" },
      { entitaet: "darlehen", entitaet_id: "DAR-001", feld: "restschuld", wert: "10000.00", standdatum: "2026-01-01", qualitaet: "belegt" },
      { entitaet: "vorsorge", entitaet_id: "VS-002", feld: "erwartete_rente", wert: "100.00", standdatum: "2024-01-01", qualitaet: "geschaetzt" },
    ],
  };
  return new Set(computeVermoegenChecks(data, TODAY).map((check) => check.art));
}

test("alle erzeugbaren Vermoegens-Check-Arten haben i18n-Titel", () => {
  const arts = checkArts();
  assert.deepEqual(
    [...arts].sort(),
    [
      "anker-fehlt",
      "bewertung-veraltet",
      "darlehen-ohne-regelzahlung",
      "marktwert-fehlt",
      "reconciliation-drift",
      "vorsorge-ungeprueft",
      "vorsorge-wechsel",
      "vorsorge-wiedervorlage",
    ],
  );

  for (const lang of ["de", "en"]) {
    for (const art of arts) {
      const key = `vermoegen.checkArt.${art}`;
      assert.notEqual(t(lang, key), key, `${key} muss in ${lang} aufgeloest werden`);
    }
  }
});

test("alle Demo-Kontotypen haben i18n-Labels", async () => {
  const konten = JSON.parse(await readFile(new URL("../app/data/demo/konten.json", import.meta.url), "utf8"));
  const kontotypen = new Set(konten.map((konto) => konto.kontotyp));

  for (const lang of ["de", "en"]) {
    for (const typ of kontotypen) {
      const key = `accountTypes.${typ}`;
      assert.notEqual(t(lang, key), key, `${key} muss in ${lang} aufgeloest werden`);
    }
  }
});

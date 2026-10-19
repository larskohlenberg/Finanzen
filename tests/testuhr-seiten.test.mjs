// Testuhr fuer die restlichen Seiten (Review Welle 2, 2.4): Vermoegen,
// Stammdaten, Regelzahlungen und die Fristen eines Objekts rechnen mit
// heuteIso() (state.heute), nicht mit der Systemuhr. Je Grenze davor, am Tag,
// danach.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { apiAbwarten, bestandAntwort } from "./hilfe-bestand.mjs";

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

const { data, state, kontenById } = await import("../app/runtime.mjs");
appDaten = data;
const { verwerfeApiCaches } = await import("../app/api-daten.mjs");
const { renderRegelzahlungen } = await import("../app/views/regelzahlungen.mjs");
const { renderVermoegen } = await import("../app/views/vermoegen.mjs");
const { renderMasterdata } = await import("../app/views/stammdaten.mjs");
const { fristenText } = await import("../app/views/vermoegen-teile.mjs");

async function gezeichnet(render) {
  verwerfeApiCaches();
  render();
  await apiAbwarten();
  return render();
}

function leererBestand() {
  Object.assign(data, {
    validation: { valid: true, errors: [] }, importfehler: [], checks: [], personen: [],
    konten: [], transaktionen: [], transfers: [], regelzahlungen: [], immobilien: [], darlehen: [],
    vermoegenswerte: [], vorsorge: [], fristen: [], zeitwerte: [], kategorien: [], kategorisierungsregeln: [],
  });
  state.lang = "de";
}

const ruhigesDepot = () => {
  data.konten = [{ konto_id: "KTO-951", name: "Ruhiges Depot", kontotyp: "depot", inhaber_person_ids: [], liquiditaetsrelevant: false, status: "aktiv" }];
  data.zeitwerte = [{ entitaet: "konto", entitaet_id: "KTO-951", feld: "depotwert", standdatum: "2026-09-15", wert: "1000.00", qualitaet: "belegt" }];
  kontenById.clear();
  for (const k of data.konten) kontenById.set(k.konto_id, k);
};

test("Testuhr Regelzahlungen: naechster Termin strikt nach dem Stichtag", (t) => {
  t.after(() => { delete state.heute; });
  leererBestand();
  data.regelzahlungen = [{ regelzahlung_id: "RZ-901", bezeichnung: "Miete", betrag: "-900.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-01", status: "bestaetigt", kategorie_id: "KAT-003" }];
  const naechste = (heute) => {
    state.heute = heute;
    return renderRegelzahlungen().match(/<tr id="regelzahlung-RZ-901"[\s\S]*?<\/tr>/)[0];
  };
  assert.match(naechste("2026-08-31"), /1\.9\.2026/);
  assert.match(naechste("2026-09-01"), /1\.10\.2026/);
  assert.doesNotMatch(naechste("2026-09-01"), /1\.9\.2026/);
});

test("Testuhr Vermoegen: offene Punkte mit veraltetem Depotwert erst ab drei Monaten", async (t) => {
  t.after(() => { delete state.heute; });
  leererBestand();
  ruhigesDepot();
  state.view = "vermoegen";
  state.vermoegenTab = "uebersicht";
  const seite = async (heute) => { state.heute = heute; return gezeichnet(renderVermoegen); };
  assert.doesNotMatch(await seite("2026-12-14"), /Bewertung veraltet/);
  assert.match(await seite("2026-12-15"), /Bewertung veraltet/);
});

test("Testuhr Stammdaten: Wert im Konto-Detail nur aus Staenden bis zum Stichtag", async (t) => {
  t.after(() => { delete state.heute; delete state.selectedKonto; state.selectedVermoegenId = ""; state.view = "masterdata"; });
  leererBestand();
  ruhigesDepot();
  // Das Konto-Detail liegt unter Vermoegen -> Konten.
  state.view = "vermoegen";
  state.vermoegenTab = "konten";
  state.selectedVermoegenId = "konto:KTO-951";
  state.selectedKonto = "KTO-951";
  const seite = async (heute) => { state.heute = heute; return (await gezeichnet(renderVermoegen)).replace(/\u00a0/g, " "); };
  // Vor dem ersten Depotwert: kein Stand (die Wertstaende darunter listen die ganze Historie).
  assert.match(await seite("2026-09-14"), /Kein Depotwert/);
  assert.doesNotMatch(await seite("2026-09-15"), /Kein Depotwert/);
});

test("Testuhr Fristen eines Objekts: ueberfaellig erst nach dem Faelligkeitstag", (t) => {
  t.after(() => { delete state.heute; });
  leererBestand();
  data.fristen = [{ frist_id: "FR-901", bezeichnung: "Kuendigungsfrist", art: "kuendigung", datum: "2026-11-30", konto_id: "KTO-951" }];
  ruhigesDepot();
  state.heute = "2026-11-30";
  assert.doesNotMatch(fristenText("konto", "KTO-951"), /überfällig/);
  state.heute = "2026-12-01";
  assert.match(fristenText("konto", "KTO-951"), /überfällig/);
});

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
const { renderMasterdata } = await import("../app/views/stammdaten.mjs");

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

test("Kontentabelle zeigt belegte Depot- und Kontostaende statt fester 'noch nicht belegt'-Texte", () => {
  const personId = data.personen[0]?.person_id ?? "PER-001";
  data.validation = { valid: true, errors: [] };
  data.importfehler = [];
  data.checks = [];
  const basis = { inhaber_person_ids: [personId], liquiditaetsrelevant: true, status: "aktiv", kontoreferenz: "DE00TEST" };
  data.konten = [
    { ...basis, konto_id: "KTO-901", name: "Depot belegt", kontotyp: "depot" },
    { ...basis, konto_id: "KTO-902", name: "Depot ohne Wert", kontotyp: "depot" },
    { ...basis, konto_id: "KTO-903", name: "Giro belegt", kontotyp: "giro" },
    { ...basis, konto_id: "KTO-904", name: "Giro ohne Anker", kontotyp: "giro" },
    { ...basis, konto_id: "KTO-905", name: "Kasse", kontotyp: "bar", liquiditaetsrelevant: false },
  ];
  data.transaktionen = [
    { transaktion_id: "TXN-T1", konto_id: "KTO-903", buchungsdatum: "2026-05-01", betrag: "-4000.00" },
    { transaktion_id: "TXN-T2", konto_id: "KTO-903", buchungsdatum: "2026-06-10", betrag: "-50.00" },
  ];
  data.transfers = [];
  data.regelzahlungen = [];
  data.immobilien = [];
  data.darlehen = [];
  data.vermoegenswerte = [];
  data.vorsorge = [];
  data.zeitwerte = [
    { entitaet: "konto", entitaet_id: "KTO-901", feld: "depotwert", standdatum: "2026-09-15", wert: "4321.09", qualitaet: "belegt" },
    { entitaet: "konto", entitaet_id: "KTO-903", feld: "kontostand", standdatum: "2026-06-08", wert: "1200.00", qualitaet: "belegt" },
  ];
  state.view = "overview";
  state.lang = "de";

  const html = renderOverview();
  const zeile = (id) => html.match(new RegExp(`<tr[^>]*id="konto-${id}"[\\s\\S]*?</tr>`))[0];

  assert.match(zeile("KTO-901"), /4\.321,09/);
  assert.match(zeile("KTO-901"), /chip success[^"]*"[\s\S]*belegt · 15\.9\.2026/);
  assert.doesNotMatch(zeile("KTO-901"), /veraltet/);
  assert.match(zeile("KTO-901"), /15\.9\.2026/);
  assert.doesNotMatch(zeile("KTO-901"), /noch nicht belegt/);

  assert.match(zeile("KTO-902"), /chip danger[\s\S]*Depotwert noch nicht belegt/);

  assert.match(zeile("KTO-903"), /1\.150,00/);
  assert.doesNotMatch(zeile("KTO-903"), /-4\.050,00|−4\.050,00/);
  assert.match(zeile("KTO-903"), /belegt · 10\.6\.2026 · veraltet/);
  assert.doesNotMatch(html, /Letzte Buchung/);
  assert.doesNotMatch(zeile("KTO-903"), /noch nicht belegt/);

  assert.match(zeile("KTO-904"), /chip danger[\s\S]*Kontostand noch nicht belegt · nicht enthalten/);

  // Kachel = Summenzeile der Konten (nur KTO-903, KTO-904 ohne Beleg), Depots getrennt summiert.
  assert.match(html, /Verfügbares Geld[\s\S]*?1\.150,00[\s\S]*?Stand 10\.6\.2026 · <button class="linkish" data-view="liquiditaet">Zur Liquidität<\/button>/);
  assert.doesNotMatch(html, /in der Tabelle/);
  assert.match(html, /<tr class="table-sum"[\s\S]*?Summe Konten = Verfügbares Geld[\s\S]*?1\.150,00/);
  assert.match(html, /<tr class="table-sum"[\s\S]*?Summe Depots[\s\S]*?4\.321,09/);
  assert.doesNotMatch(html, /Summe geladener Bewegungen/);
  assert.match(zeile("KTO-905"), /chip neutral[\s\S]*Bargeld wird nicht bewertet/);

  // Konten, Depots und Weitere als eigene Kacheln mit je eigener Tabelle.
  const kachel = (titel) => html.match(new RegExp(`<section class="panel panel-pad">\\s*<h2 class="section-title">${titel}</h2>[\\s\\S]*?</section>`))?.[0] ?? "";
  assert.match(kachel("Konten"), /KTO-903[\s\S]*Summe Konten = Verfügbares Geld/);
  assert.doesNotMatch(kachel("Konten"), /KTO-901|KTO-905/);
  assert.match(kachel("Depots"), /KTO-901[\s\S]*Summe Depots/);
  assert.doesNotMatch(kachel("Depots"), /KTO-903/);
  assert.match(kachel("Weitere Konten \\(nicht im verfügbaren Geld\\)"), /KTO-905/);
  assert.equal((html.match(/<table class="account-table">/g) ?? []).length, 3);
  assert.doesNotMatch(html, /class="group-row"/);

  // Drei Kacheln oben: Verfuegbares Geld, Depotstand (= Summe Depots), Vermoegen.
  assert.equal((html.match(/class="panel hero-kpi"/g) ?? []).length, 3);
  assert.match(html, /Depotstand[\s\S]*?4\.321,09[\s\S]*?Stand 15\.9\.2026 · <button class="linkish" data-view="vermoegen">Zur Vermögensseite<\/button>/);
  assert.match(html, /id="kpi-networth-label"[\s\S]*?<div class="kpi-note">Stand [\d.]+ · <button class="linkish" data-view="vermoegen">Zur Vermögensseite<\/button>/);

  // Stammdaten: nur Stammdaten, keine Werte, Belegstaende oder Summen.
  state.view = "masterdata";
  state.masterSection = "konten";
  const stamm = renderMasterdata();
  const kontenTabelle = stamm.match(/<table class="master-account-table">[\s\S]*?<\/table>/)?.[0] ?? "";
  for (const id of ["KTO-901", "KTO-902", "KTO-903", "KTO-904", "KTO-905"]) assert.match(kontenTabelle, new RegExp(id));
  assert.match(kontenTabelle, /Liquiditätsrelevant/);
  assert.doesNotMatch(kontenTabelle, /Wert heute|Belegter Stand|table-sum|1\.150,00|noch nicht belegt/);
  state.view = "overview";
  assert.match(zeile("KTO-903"), /chip review/);
});

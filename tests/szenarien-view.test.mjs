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
const { data, state } = await import("../app/runtime.mjs");
appDaten = data;
const { renderSzenarien } = await import("../app/views/szenarien.mjs");
const { verwerfeApiCaches } = await import("../app/api-daten.mjs");
// Startbestand und Prognose-Hinweise kommen vom Server (GET /api/v1/szenarien):
// Antworten verwerfen, zeichnen, auf die Antwort warten, erneut zeichnen.
async function szenarienGezeichnet() {
  verwerfeApiCaches();
  renderSzenarien();
  await apiAbwarten();
  return renderSzenarien();
}

const JAHR = Number(new Date().toISOString().slice(0, 4));
function setDaten() {
  data.personen = [{ person_id: "PER-001", name: "Person A", status: "aktiv" }];
  data.konten = [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", status: "aktiv", liquiditaetsrelevant: true }];
  data.kategorien = [{ kategorie_id: "KAT-001", name: "Gehalt", typ: "einnahme", lebenshaltung_relevant: true, status: "aktiv" }];
  data.transaktionen = [];
  data.transfers = [];
  data.immobilien = [];
  data.darlehen = [];
  data.vermoegenswerte = [];
  data.vorsorge = [];
  data.zeitwerte = [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "20000.00", standdatum: `${JAHR - 1}-12-31`, qualitaet: "belegt" }];
  data.regelzahlungen = [{ regelzahlung_id: "RZ-001", bezeichnung: "Gehalt", betrag: "3000.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: `${JAHR}-01-27`, aktiv_bis: `${JAHR + 2}-12-31`, status: "bestaetigt", qualitaet: "belegt", kategorie_id: "KAT-001", erstellt_am: `${JAHR}-01-01` }];
  data.szenarien = [
    {
      szenario_id: "SZN-001", name: "Pause und Verkauf", status: "entwurf", stand: `${JAHR}-01-01`, reichweite_bis: `${JAHR + 8}-12-31`, erstellt_am: `${JAHR}-01-01`,
      beschreibung: "Erst arbeiten, dann Pause. Danach reicht es eine Weile.",
      phasen: [{ name: "Arbeit", ab: `${JAHR}-01-01` }, { name: "Pause", ab: `${JAHR + 3}-01-01` }],
      annahmen: [
        { annahme_id: "A1", art: "regelzahlung-neu", qualitaet: "geschaetzt", name: "Lebenshaltung", betrag: "-2500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, ab: `${JAHR + 1}-01-01` },
        { annahme_id: "A2", art: "einmalzahlung", qualitaet: "geschaetzt", datum: `${JAHR + 4}-06-15`, betrag: "50000.00", begruendung: "Erbschaft" },
      ],
    },
    { szenario_id: "SZN-002", name: "Ohne alles", status: "entwurf", stand: `${JAHR}-01-01`, reichweite_bis: `${JAHR + 3}-12-31`, erstellt_am: `${JAHR}-01-01`, annahmen: [] },
  ];
  state.selectedSzenarioId = "";
  state.szenarioVergleichIds = [];
  state.szenarioVergleichMit = "";
  state.szenarioAuswahl = new Set();
  state.szenarioPhaseOffen = new Set();
}

test("Liste: Kennzahlen je Szenario, Auswahl und Vergleichshinweis", async () => {
  setDaten();
  const html = (await szenarienGezeichnet());
  assert.match(html, /Liquidität reicht bis/);
  assert.match(html, /data-action="toggle-szenario-auswahl"/);
  assert.match(html, /Zwei oder mehr Szenarien anhaken/);
  state.szenarioAuswahl = new Set(["SZN-001", "SZN-002"]);
  assert.match((await szenarienGezeichnet()), /data-action="szenarien-vergleichen"/);
});

test("Detail: Antwortzeile, Zeitstrahl mit Phasen und Ereignis, Phasentabelle", async () => {
  setDaten();
  state.selectedSzenarioId = "SZN-001";
  const html = (await szenarienGezeichnet());
  assert.match(html, /<h1 class="page-title">Pause und Verkauf<\/h1>/);
  assert.match(html, /Erst arbeiten, dann Pause\./);
  assert.doesNotMatch(html, /Danach reicht es/, "Beschreibung zunaechst gekuerzt");
  assert.match(html, /class="phase-band /);
  assert.match(html, />Erbschaft 50k €</);
  assert.match(html, /data-action="toggle-szenario-phase" data-phase="0"/);
  assert.match(html, /Vorlauf|Arbeit/);
  assert.match(html, /data-control="szenario-vergleich"/);
  // Ergebnis als Basis, Szenario, Differenz und der Startbestand mit Bezug aufs Vermoegen.
  assert.match(html, /<table class="szenario-ergebnis karten-tabelle">[\s\S]*?<th class="amount">Pause und Verkauf<\/th><th class="amount">Basis<\/th><th class="amount">Differenz<\/th>/);
  assert.match(html, /class="muted szenario-start"[\s\S]*?href="#\/vermoegen"/);
});

test("Detail: aufgeklappte Phase zeigt Annahmen mit Wirkung pro Monat", async () => {
  setDaten();
  state.selectedSzenarioId = "SZN-001";
  state.szenarioPhaseOffen = new Set([0]);
  const html = (await szenarienGezeichnet());
  assert.match(html, /Lebenshaltung/);
  assert.match(html, /-2\.500,00\s€ \/ Monat/);
});

test("Detail: Vergleich gegen ein anderes Szenario und Differenzmodus", async () => {
  setDaten();
  state.selectedSzenarioId = "SZN-001";
  state.szenarioVergleichMit = "SZN-002";
  state.szenarioDiagrammModus = "differenz";
  const html = (await szenarienGezeichnet());
  assert.match(html, /<option value="SZN-002" selected>/);
  assert.match(html, /zeitstrahl-linie differenz/);
  state.szenarioDiagrammModus = "absolut";
});

test("Vergleich: eine Linie je Szenario und Kennzahlentabelle", async () => {
  setDaten();
  state.szenarioVergleichIds = ["SZN-001", "SZN-002"];
  const html = (await szenarienGezeichnet());
  assert.match(html, /Szenarien im Vergleich/);
  assert.match(html, /zeitstrahl-linie serie-0/);
  assert.match(html, /zeitstrahl-linie serie-1/);
  assert.match(html, /data-action="open-szenario" data-szenario="SZN-002"/);
});

test("Detail: Abschnitt 'Was sich aendert' mit Monatsgruppe, Ersetzung und Durchstreichung", async () => {
  setDaten();
  data.regelzahlungen[0].aktiv_bis = `${JAHR + 1}-12-31`;
  data.szenarien[0].annahmen.push({ annahme_id: "A3", art: "regelzahlung-neu", qualitaet: "geschaetzt", name: "Gehalt neu", kategorie_id: "KAT-001", betrag: "3500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, ab: `${JAHR + 2}-01-27` });
  state.selectedSzenarioId = "SZN-001";
  const html = (await szenarienGezeichnet());
  assert.match(html, /Was sich ändert/);
  assert.match(html, /<s class="alt-wert">Gehalt<\/s><br>Gehalt neu/);
  assert.match(html, /class="quelle-chip bestand">Bestand/);
  assert.match(html, /class="aenderung-monat"><th colspan="2">Januar/);
  assert.match(html, /\+500,00\s€/);
});

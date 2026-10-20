// app/runtime.mjs
// Gemeinsames Fundament der UI: geladener Bestand, Laufzeit-Zustand, i18n und
// abgeleitete Nachschlage-Maps. main.js (Orchestrierung) und die View-Module
// importieren von hier — so teilen sie EINE Zustands-/Datenquelle (Objekte per
// Referenz). Bewusst ohne DOM-Render-Logik (die liegt in main.js/views/).
import { loadFinanceData, normalizeDataMode } from "./data-loader.mjs";
import { escapeHtml, formatierer, fuelle } from "./format.mjs";
import { LEERE_FILTER } from "./navigation.mjs";
import { defaultHorizonEnd, localTodayIso, toCents } from "./liquiditaet.mjs";

export const app = document.querySelector("#app");
const DATA_MODE_STORAGE_KEY = "finance-m2-data-mode";

function showBootstrapError(error) {
  if (!app) return;
  app.innerHTML = `
    <div class="bootstrap-error" role="alert">
      <h1>Daten konnten nicht geladen werden</h1>
      <p>Die Masterdaten (<code>data/master/*</code>) oder die Sprachdatei (<code>i18n.js</code>) wurden nicht oder unvollständig geladen.</p>
      <p>Bitte die Seite über den lokalen Webserver öffnen und neu laden. Falls das Problem bestehen bleibt, Datenbestand und Serverpfade prüfen.</p>
      <p><code>${escapeHtml(error?.message || "Unbekannter Ladefehler")}</code></p>
    </div>`;
}

async function bootstrap() {
  try {
    const dataMode = normalizeDataMode(localStorage.getItem(DATA_MODE_STORAGE_KEY));
    const loadedData = await loadFinanceData({ dataMode });
    const loadedDictionaries = window.FINANCE_I18N;
    // Kaputte Collections sind kein Ladefehler: sie meldet unten der Validator im Banner.
    if (!loadedData || typeof loadedData !== "object" || !loadedDictionaries) {
      throw new Error("FINANCE_I18N oder geladene Masterdaten fehlen/unvollstaendig.");
    }
    return { data: loadedData, dictionaries: loadedDictionaries };
  } catch (error) {
    showBootstrapError(error);
    throw error;
  }
}

const bootstrapped = await bootstrap();
export const data = bootstrapped.data;
const dictionaries = bootstrapped.dictionaries;

// "Das Tool prueft" gilt auch in der UI: den Validator-Befund (data.validation)
// liefert der Server mit den Grunddaten, dieselbe Logik wie das CLI. Er treibt
// Status-Chip und Fehlerbanner. Die Listen sind strukturell lesbar: was keine
// Liste oder kein Objekt ist, hat der Server herausgenommen und als Fehler
// gemeldet.

export const storageKeys = {
  lang: "finance-m2-language",
  theme: "finance-m2-theme",
  dataMode: DATA_MODE_STORAGE_KEY,
  sidebarCollapsed: "finance-m2-sidebar-collapsed",
  pageSize: "finance-m2-page-size",
};

// Reihenfolge gilt fuer Desktop-Sidebar UND mobile Tab-Bar/Mehr-Menue
// (beide leiten sie hieraus ab). vermoegen vor termine, damit die
// Kernsichten der mobilen Tab-Bar zusammenhaengen.
export const navItems = [
  ["overview", "nav.overview", "overview"],
  ["transactions", "nav.transactions", "transactions"],
  ["liquiditaet", "nav.liquiditaet", "liquiditaet"],
  ["vermoegen", "nav.vermoegen", "vermoegen"],
  ["vorsorge", "nav.vorsorge", "vorsorge"],
  // Plan & Ist: Regelzahlungen gegen Buchungen, direkt vor den Terminen,
  // die die Regelzahlungen fuehren (hinter den Kernsichten der Tab-Bar).
  ["planIst", "nav.planIst", "planIst"],
  // Termine buendelt Regelzahlungen und Fristen (Reiter der Seite).
  ["termine", "nav.termine", "termine"],
  ["szenarien", "nav.szenarien", "szenarien"],
  ["belege", "nav.belege", "belege"],
  ["upload", "nav.upload", "upload"],
  // Administration buendelt Stammdaten, Checks und Export (Bereiche der Seite).
  ["masterdata", "nav.masterdata", "masterdata"],
];

// Mobile Bottom-Tab-Bar: die vier Kernsichten als Tabs, der Rest im Mehr-Menü.
// Liquidität bleibt Tab, weil sie die führende Geldsicht ist (ADR 0016).
export const TABBAR_VIEWS = ["overview", "transactions", "liquiditaet", "vermoegen"];

export const state = {
  view: "overview",
  uiError: null,
  lang: localStorage.getItem(storageKeys.lang) || "de",
  theme: localStorage.getItem(storageKeys.theme) || "system",
  dataMode: normalizeDataMode(data.metadata?.dataMode),
  sidebarCollapsed: localStorage.getItem(storageKeys.sidebarCollapsed) === "true",
  // Filter der Buchungsliste (navigation.mjs: LEERE_FILTER, Spruenge, URL).
  transactionFilters: { ...LEERE_FILTER },
  transactionSort: { key: "date", dir: "desc" },
  transactionPage: 1,
  // Buchungs-Id, auf deren Seite gesprungen werden soll (rechnet der Server).
  transactionJumpTo: "",
  // Zeilen je Seite der Buchungsliste; gemerkt im Browser.
  pageSize: [10, 20, 50, 100].includes(Number(localStorage.getItem(storageKeys.pageSize))) ? Number(localStorage.getItem(storageKeys.pageSize)) : 50,
  selectedTransactionId: "",
  detailRailClosed: false,
  masterSection: "konten",
  selectedKonto: "",
  selectedRegel: "",
  moreMenuOpen: false,
  nextActionCopied: false,
  nextActionMenuOpen: false,
  settingsMenuOpen: false,
  nextActionPromptFallback: "",
  // Name des Datumsfelds, dessen Kalender offen ist ("" = keiner).
  kalenderOffen: "",
  liquiditaet: {
    granularitaet: "monat",
    bisDatum: defaultHorizonEnd(localTodayIso()),
  },
  liquiditaetExpanded: new Set(),
  // Plan & Ist: Granularitaet der Auswahl, Zeitraum ("" Bestand, "12m", "2026",
  // "2026-Q2", "2026-05"), Darstellung Ø je Monat oder Summe; offene Kategorien.
  planIst: { granularitaet: "jahr", periode: "", darstellung: "monat" },
  planIstOffen: new Set(),
  // Termine, Regelzahlungen: Auswahl (termine-modell.mjs ZEIGEN) und Sortierung.
  regelzahlungZeigen: "aktiv",
  // Schnellsuche (Cmd/Strg+K): offen, Suchtext, ausgewaehlter Treffer.
  schnellsuche: { offen: false, text: "", index: 0 },
  regelzahlungSort: { key: "bezeichnung", dir: "asc" },
  // Vermoegensseite: aktiver Tab und ausgewaehltes Objekt ("klasse:id").
  vermoegenTab: "uebersicht",
  selectedVermoegenId: "",
  immobilieOhneRate: false,
  immobilieDrill: "",
  // Vorsorgeseite: aktiver Tab und Personenfilter im Tab.
  vorsorgeTab: "uebersicht",
  vorsorgeFilters: { person: "" },
  // Auf-/zugeklappte Kacheln (komponenten.mjs klappKachel) je id; leer = Standard der Ansicht.
  klappKacheln: {},
  wertstaendeFilters: { search: "", klasse: "", qualitaet: "" },
  wertstaendeSort: { key: "stand", dir: "desc" },
  selectedVorsorgeId: "",
  vermoegenDetailRailClosed: false,
  selectedSzenarioId: "",
  // Szenarien: Detail gegen Basis oder ein anderes Szenario, Vergleich mehrerer,
  // Anzeige-Schalter und aufgeklappte Abschnitte.
  szenarioVergleichMit: "",
  szenarioVergleichIds: [],
  szenarioAuswahl: new Set(),
  szenarioAufloesung: "jahr",
  szenarioDiagrammModus: "absolut",
  szenarioPhaseOffen: new Set(),
  szenarioBeschreibungOffen: false,
  szenarioNettoOffen: false,
  szenarioNettoTabelle: false,
  szenarioGrundlageOffen: false,
  szenarioBasisExpanded: false,
  selectedRegelzahlungId: "",
  termineTab: "regelzahlungen",
  // Dokumente (#/dokumente): ausgewaehlte Datei oder ausgewaehlter Ordner, App-relativ.
  selectedBeleg: "",
};

export const personenById = new Map();
export const kontenById = new Map();
export const kategorienById = new Map();

function fuelleNachschlagen() {
  const tabellen = [
    [personenById, data.personen, "person_id"],
    [kontenById, data.konten, "konto_id"],
    [kategorienById, data.kategorien, "kategorie_id"],
  ];
  for (const [map, liste, schluessel] of tabellen) {
    map.clear();
    for (const eintrag of liste ?? []) map.set(eintrag[schluessel], eintrag);
  }
}
fuelleNachschlagen();

// Zaehlt die Bestandswechsel ohne Seiten-Reload (ersetzeDaten). Was aus dem
// Bestand abgeleitet und zwischengespeichert wird, merkt sich den Zaehler und
// rechnet neu, wenn er sich geaendert hat.
let datenWechsel = 0;
export function datenVersion() {
  return datenWechsel;
}

// Neuer Stand vom Server (stand-wechsel.mjs): data wird an Ort und Stelle
// ersetzt, damit alle Module, die data importieren, ihn sofort sehen. Zustand,
// Filter und Auswahl (state) bleiben.
export function ersetzeDaten(neu) {
  for (const schluessel of Object.keys(data)) delete data[schluessel];
  Object.assign(data, neu);
  fuelleNachschlagen();
  datenWechsel += 1;
}

export function t(path) {
  const parts = path.split(".");
  let current = dictionaries[state.lang] || dictionaries.de;
  for (const part of parts) {
    current = current?.[part];
  }
  if (typeof current === "string") return current;
  return path;
}

export { escapeHtml };

// t() mit benannten Platzhaltern: { n: 3 } ersetzt "{n}" im Text des Schluessels.
export function tf(path, werte = {}) {
  return fuelle(t(path), werte);
}

// Die Formatierer der aktuellen Sprache (format.mjs).
export function fmt() {
  return formatierer(state.lang);
}

export const cents = toCents;

// Sitzungssperre (sitzung.mjs): geladenen Bestand und alles daraus Abgeleitete
// aus dem Speicher werfen, bevor die Seite neu laedt oder abmeldet.
export function verwerfeDaten() {
  for (const schluessel of Object.keys(data)) delete data[schluessel];
  for (const map of [personenById, kontenById, kategorienById]) map.clear();
  state.liquiditaetExpanded.clear();
  state.nextActionPromptFallback = "";
  state.transactionFilters.search = "";
  state.vorsorgeFilters.person = "";
}

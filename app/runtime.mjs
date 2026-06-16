// app/runtime.mjs
// Gemeinsames Fundament der UI: geladener Bestand, Laufzeit-Zustand, i18n und
// abgeleitete Nachschlage-Maps. main.js (Orchestrierung) und die View-Module
// importieren von hier — so teilen sie EINE Zustands-/Datenquelle (Objekte per
// Referenz). Bewusst ohne DOM-Render-Logik (die liegt in main.js/views/).
import { loadFinanceData } from "./data-loader.mjs";
import { validateMasterData } from "./tools/validate-core.mjs";
import { defaultHorizonEnd, localTodayIso, toCents } from "./liquiditaet.mjs";

export const app = document.querySelector("#app");

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
    const loadedData = await loadFinanceData();
    const loadedDictionaries = window.FINANCE_I18N;
    if (!loadedData || !Array.isArray(loadedData.personen) || !Array.isArray(loadedData.konten) || !loadedDictionaries) {
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
export const dictionaries = bootstrapped.dictionaries;
data.regelzahlungen = data.regelzahlungen ?? [];

// "Das Tool prueft" gilt auch in der UI: dieselbe Validator-Logik wie das CLI
// laeuft einmal beim Laden ueber den geladenen Bestand (Reload = voller Page-
// Reload, also reicht einmal). Ergebnis treibt Status-Chip und Fehlerbanner.
data.validation = validateMasterData(data);
data.metadata = { ...data.metadata, validation: data.validation.valid ? "passed" : "failed" };

export const storageKeys = {
  lang: "finance-m2-language",
  theme: "finance-m2-theme",
  sidebarCollapsed: "finance-m2-sidebar-collapsed",
};

// Reihenfolge gilt fuer Desktop-Sidebar UND mobile Tab-Bar/Mehr-Menue
// (beide leiten sie hieraus ab). vermoegen vor regelzahlungen, damit die
// Kernsichten der mobilen Tab-Bar zusammenhaengen.
export const navItems = [
  ["overview", "nav.overview", "overview"],
  ["transactions", "nav.transactions", "transactions"],
  ["liquiditaet", "nav.liquiditaet", "liquiditaet"],
  ["vermoegen", "nav.vermoegen", "vermoegen"],
  ["regelzahlungen", "nav.regelzahlungen", "regelzahlungen"],
  ["masterdata", "nav.masterdata", "masterdata"],
  ["checks", "nav.checks", "checks"],
  ["export", "nav.export", "export"],
];

// Mobile Bottom-Tab-Bar: die vier Kernsichten als Tabs, der Rest im Mehr-Menü.
// Liquidität bleibt Tab, weil sie die führende Geldsicht ist (ADR 0016).
export const TABBAR_VIEWS = ["overview", "transactions", "liquiditaet", "vermoegen"];

export const state = {
  view: "overview",
  lang: localStorage.getItem(storageKeys.lang) || "de",
  theme: localStorage.getItem(storageKeys.theme) || "system",
  sidebarCollapsed: localStorage.getItem(storageKeys.sidebarCollapsed) === "true",
  transactionFilters: {
    account: "",
    status: "",
    category: "",
    transfer: "",
    search: "",
    timeMode: "none",
    dateFrom: "",
    dateTo: "",
    month: "",
    quarterYear: "",
    quarter: "1",
    year: "",
  },
  transactionPage: 1,
  pageSize: 10,
  selectedTransactionId: "",
  detailRailClosed: false,
  masterSection: "konten",
  selectedKonto: "",
  moreMenuOpen: false,
  liquiditaet: {
    granularitaet: "monat",
    bisDatum: defaultHorizonEnd(data.regelzahlungen, localTodayIso()),
  },
  liquiditaetExpanded: new Set(),
  vermoegenFilters: {
    klasse: "",
    qualitaet: "",
  },
  vermoegenSort: { key: "klasse", dir: "asc" },
  selectedVermoegenId: "",
  vermoegenDetailRailClosed: false,
  vermoegenRailMode: "position",
  vermoegenRailWide: false,
};

export const personenById = new Map(data.personen.map((person) => [person.person_id, person]));
export const kontenById = new Map(data.konten.map((konto) => [konto.konto_id, konto]));
export const kategorienById = new Map(data.kategorien.map((kategorie) => [kategorie.kategorie_id, kategorie]));
export const transaktionenById = new Map(data.transaktionen.map((transaktion) => [transaktion.transaktion_id, transaktion]));
export const transfersById = new Map(data.transfers.map((transfer) => [transfer.transfer_id, transfer]));

export function t(path) {
  const parts = path.split(".");
  let current = dictionaries[state.lang] || dictionaries.de;
  for (const part of parts) {
    current = current?.[part];
  }
  if (typeof current === "string") return current;
  return path;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export const cents = toCents;

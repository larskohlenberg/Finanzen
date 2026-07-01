import { defaultHorizonEnd } from "./liquiditaet.mjs";
import { iconSvg } from "./icons.js";
import { buildNextAgentActions } from "./next-action.mjs";
import { routeFromState, parseRoute } from "./routing.mjs";
import { renderVermoegen } from "./views/vermoegen.mjs";
import { renderVorsorge } from "./views/vorsorge.mjs";
import { renderSzenarien } from "./views/szenarien.mjs";
import { renderTransactions, filteredTransactions, applyTransactionTimeModeDefaults, clearTransactionTimeFilter } from "./views/transaktionen.mjs";
import { renderLiquiditaet } from "./views/liquiditaet.mjs";
import { renderRegelzahlungen } from "./views/regelzahlungen.mjs";
import { renderOverview } from "./views/uebersicht.mjs";
import { renderMasterdata } from "./views/stammdaten.mjs";
import { renderChecks } from "./views/checks.mjs";
import { renderExport } from "./views/export.mjs";
import {
  app, data, state, storageKeys, navItems, TABBAR_VIEWS, transaktionenById,
  t, escapeHtml, cents,
} from "./runtime.mjs";
import { formatMoney, heuteIso } from "./komponenten.mjs";
import { openCategoryTransactions } from "./selektoren.mjs";
import { renderErrorPanel, safeRender, guard } from "./error.mjs";
import { bindDiagrammHover } from "./diagramm-hover.mjs";

let nextActionCopiedTimer = null;

function applyTheme() {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = state.theme === "system" ? (systemDark ? "dark" : "light") : state.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.lang = state.lang;
}

const FOCUS_ATTRS = [
  "id", "data-view", "data-action", "data-account", "data-transaction",
  "data-vermoegen", "data-szenario", "data-liquiditaet-toggle", "data-liquiditaet-gran", "data-master-section",
  "data-vermoegen-sort", "data-transaction-sort", "data-control", "data-filter-name", "data-scope", "data-entity",
  "data-rule", "data-regel-sort", "data-next-action-type",
];
const SCROLL_SELECTORS = [".nav", ".table-wrap"];

// render() ersetzt den kompletten DOM (app.innerHTML). Ohne Gegenmassnahme
// springt der Fokus auf <body> und horizontale Scrollpositionen gehen verloren.
// Vor jedem Re-Render Fokus + Scroll sichern und danach wiederherstellen.
function captureFocus() {
  const el = document.activeElement;
  if (!el || el === document.body || !app.contains(el)) return null;
  const parts = [];
  for (const attr of FOCUS_ATTRS) {
    const value = el.getAttribute?.(attr);
    if (value != null) parts.push(`[${attr}="${CSS.escape(value)}"]`);
  }
  if (!parts.length) return null;
  const selectionStart = typeof el.selectionStart === "number" ? el.selectionStart : null;
  const selectionEnd = typeof el.selectionEnd === "number" ? el.selectionEnd : null;
  return { selector: el.tagName.toLowerCase() + parts.join(""), selectionStart, selectionEnd };
}

function restoreFocus(snap) {
  if (!snap) return;
  let target = null;
  try {
    target = app.querySelector(snap.selector);
  } catch {
    target = null;
  }
  if (!target) return;
  target.focus({ preventScroll: true });
  if (snap.selectionStart != null && typeof target.setSelectionRange === "function") {
    try {
      target.setSelectionRange(snap.selectionStart, snap.selectionEnd);
    } catch {
      /* z. B. input[type=date] erlaubt keine Selektion – ignorieren */
    }
  }
}

function captureScroll() {
  const map = {};
  for (const sel of SCROLL_SELECTORS) {
    map[sel] = [...app.querySelectorAll(sel)].map((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
  }
  return { x: window.scrollX, y: window.scrollY, map };
}

function restoreScroll(snap) {
  if (!snap) return;
  for (const sel of SCROLL_SELECTORS) {
    const els = app.querySelectorAll(sel);
    (snap.map[sel] || []).forEach((pos, i) => {
      const el = els[i];
      if (el) {
        el.scrollLeft = pos.left;
        el.scrollTop = pos.top;
      }
    });
  }
  window.scrollTo(snap.x, snap.y);
}

// Schlanke Statusmeldung fuer Screenreader. Sitzt in #sr-status ausserhalb von
// #app, damit nicht bei jedem Re-Render die komplette Oberflaeche vorgelesen wird.
function statusMessage() {
  const navLabel = navItems.find(([view]) => view === state.view)?.[1];
  const title = navLabel ? t(navLabel) : "";
  if (state.view === "transactions") {
    const rows = filteredTransactions();
    const balance = rows.reduce((sum, tx) => sum + cents(tx.betrag), 0);
    return `${title}: ${rows.length} ${t("transactions.hits")}, ${t("transactions.filteredBalance")} ${formatMoney(balance)}`;
  }
  return title;
}

function announceStatus() {
  const region = document.querySelector("#sr-status");
  if (!region) return;
  const msg = statusMessage();
  if (region.textContent !== msg) region.textContent = msg;
}

function render() {
  applyTheme();
  const focusSnap = captureFocus();
  const scrollSnap = captureScroll();
  app.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  app.innerHTML = `
    ${renderSidebar()}
    <main class="main" id="main-content" tabindex="-1">
      ${renderTopbar()}
      ${renderValidationBanner()}
      ${renderUiErrorBanner()}
      ${renderPromptFallback()}
      ${safeRender(renderView, "view:" + state.view)}
    </main>
    ${renderTabbar()}
  `;
  restoreScroll(scrollSnap);
  restoreFocus(focusSnap);
  announceStatus();
}

function renderSidebar() {
  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">FM</div>
        <div class="brand-copy">
          <div class="brand-title">${escapeHtml(t("appTitle"))}</div>
        </div>
        <button class="sidebar-toggle" data-action="toggle-sidebar" aria-label="${escapeHtml(state.sidebarCollapsed ? t("chrome.expandNav") : t("chrome.collapseNav"))}" title="${escapeHtml(state.sidebarCollapsed ? t("chrome.expandNav") : t("chrome.collapseNav"))}">
          ${state.sidebarCollapsed ? iconSvg("chevronRight") : iconSvg("chevronLeft")}
        </button>
      </div>
      <nav class="nav" aria-label="${escapeHtml(t("chrome.mainNav"))}">
        ${navItems
          .map(([view, labelKey, icon]) => `
            <button class="nav-button ${state.view === view ? "active" : ""}" data-view="${view}" aria-label="${escapeHtml(t(labelKey))}" title="${escapeHtml(t(labelKey))}">
              <span class="nav-icon">${iconSvg(icon)}</span>
              <span class="nav-label">${escapeHtml(t(labelKey))}</span>
            </button>
          `)
          .join("")}
      </nav>
      <div class="sidebar-meta">
        <span>${escapeHtml(t("chrome.workState"))}</span>
        <strong>${escapeHtml(t("chrome.releaseState"))}</strong>
      </div>
    </aside>
  `;
}

function renderTabbar() {
  const primary = navItems.filter(([view]) => TABBAR_VIEWS.includes(view));
  const secondary = navItems.filter(([view]) => !TABBAR_VIEWS.includes(view));
  const moreActive = secondary.some(([view]) => view === state.view);
  return `
    <nav class="tabbar" aria-label="${escapeHtml(t("chrome.mobileNav"))}">
      ${state.moreMenuOpen ? `
        <div class="tabbar-more-menu">
          ${secondary
            .map(([view, labelKey, icon]) => `
              <button class="tabbar-more-item ${state.view === view ? "active" : ""}" data-view="${view}">
                <span class="nav-icon">${iconSvg(icon)}</span>${escapeHtml(t(labelKey))}
              </button>
            `)
            .join("")}
        </div>` : ""}
      <div class="tabbar-row">
        ${primary
          .map(([view, labelKey, icon]) => `
            <button class="tabbar-button ${state.view === view ? "active" : ""}" data-view="${view}" aria-label="${escapeHtml(t(labelKey))}">
              <span class="nav-icon">${iconSvg(icon)}</span>
              <span class="tabbar-label">${escapeHtml(t(labelKey))}</span>
            </button>
          `)
          .join("")}
        <button class="tabbar-button ${moreActive ? "active" : ""}" data-action="toggle-more-menu" aria-expanded="${state.moreMenuOpen}" aria-label="${escapeHtml(t("chrome.more"))}">
          <span class="nav-icon">${iconSvg("more")}</span>
          <span class="tabbar-label">${escapeHtml(t("chrome.more"))}</span>
        </button>
      </div>
    </nav>
  `;
}

function renderTopbar() {
  const demoActive = state.dataMode === "demo";
  return `
    <header class="topbar">
      <div class="work-status">
        <strong>${escapeHtml(t("chrome.workStatus"))}</strong>
        <span class="chip ${demoActive ? "demo" : "neutral"}" title="${escapeHtml(demoActive ? t("chrome.demoDataHint") : t("chrome.liveDataHint"))}">
          ${iconSvg("masterdata")}${escapeHtml(demoActive ? t("chrome.demoData") : t("chrome.liveData"))}
        </span>
        ${data.validation?.valid
          ? `<span class="chip success" title="${escapeHtml(t("chrome.validationPassedHint"))}">${iconSvg("success")}${escapeHtml(t("chrome.validationPassed"))}</span>`
          : `<button class="chip danger linkish" data-action="show-validation" title="${escapeHtml(t("chrome.validationFailedHint"))}">${iconSvg("warning")}${data.validation?.errors.length ?? 0} ${escapeHtml(t("chrome.validationFailed"))}</button>`}
        <button class="chip neutral linkish" data-action="reload-data" aria-label="${escapeHtml(t("chrome.reloadData"))}" title="${escapeHtml(t("chrome.reloadData"))}">${iconSvg("regelzahlungen")}${escapeHtml(t("chrome.reloadData"))}</button>
        <button class="chip review linkish" data-action="filter-open-category">${iconSvg("review")}${openCategoryTransactions().length} ${escapeHtml(t("chrome.categoryOpen"))}</button>
        ${(data.importfehler?.length ?? 0) > 0 ? `<button class="chip danger linkish" data-action="show-import-errors">${iconSvg("warning")}${data.importfehler.length} ${escapeHtml(t("chrome.importErrors"))}</button>` : ""}
        ${renderNextActionButton()}
      </div>
      <div class="controls">
        <select class="control-select mode-select" data-control="data-mode" aria-label="${escapeHtml(t("chrome.dataMode"))}" title="${escapeHtml(t("chrome.dataMode"))}">
          <option value="live" ${state.dataMode === "live" ? "selected" : ""}>${escapeHtml(t("chrome.liveDataShort"))}</option>
          <option value="demo" ${state.dataMode === "demo" ? "selected" : ""}>${escapeHtml(t("chrome.demoDataShort"))}</option>
        </select>
        <select class="control-select icon-select" data-control="lang" aria-label="${escapeHtml(t("chrome.language"))}" title="${escapeHtml(t("chrome.language"))}">
          <option value="de" ${state.lang === "de" ? "selected" : ""}>🇩🇪</option>
          <option value="en" ${state.lang === "en" ? "selected" : ""}>🇬🇧</option>
        </select>
        <select class="control-select icon-select" data-control="theme" aria-label="${escapeHtml(t("chrome.appearance"))}" title="${escapeHtml(t("chrome.appearance"))}">
          <option value="system" ${state.theme === "system" ? "selected" : ""}>◐</option>
          <option value="light" ${state.theme === "light" ? "selected" : ""}>☀</option>
          <option value="dark" ${state.theme === "dark" ? "selected" : ""}>☾</option>
        </select>
      </div>
    </header>
  `;
}

function renderNextActionButton() {
  const nextActionActions = buildNextAgentActions(data);
  const nextAction = nextActionActions[0] ?? { type: "none", label: t("chrome.noAgentAction"), prompt: "" };
  const disabled = nextAction.type === "none" ? " disabled" : "";
  const label = state.nextActionCopied ? t("chrome.agentPromptCopied") : t("chrome.copyAgentPrompt");
  const detail = nextAction.type === "none" ? t("chrome.noAgentAction") : nextAction.label;
  const hasMenu = nextActionActions.length > 1;
  const menuOpen = hasMenu && state.nextActionMenuOpen;
  return `
    <span class="next-action-control">
      <button class="chip neutral linkish next-action-copy" data-action="copy-next-agent-prompt" data-next-action-type="${escapeHtml(nextAction.type)}"${disabled} title="${escapeHtml(detail)}">
        ${iconSvg("copy")}${escapeHtml(label)} · ${escapeHtml(detail)}
      </button>
      ${hasMenu ? `
        <button class="chip neutral linkish next-action-menu-toggle" data-action="toggle-next-action-menu" aria-expanded="${menuOpen}" title="${escapeHtml(t("chrome.nextAction"))}">
          ${iconSvg("chevronDown")}
        </button>
        ${menuOpen ? `
          <div class="next-action-menu" role="menu">
            ${nextActionActions.map((candidate) => `
              <button class="next-action-menu-item linkish" role="menuitem" data-action="copy-next-agent-prompt" data-next-action-type="${escapeHtml(candidate.type)}" title="${escapeHtml(candidate.label)}">
                ${iconSvg("copy")}<span>${escapeHtml(candidate.count)} · ${escapeHtml(candidate.label)}</span>
              </button>
            `).join("")}
          </div>` : ""}
      ` : ""}
    </span>
  `;
}

function renderPromptFallback() {
  if (!state.nextActionPromptFallback) return "";
  return `
    <section class="prompt-fallback panel panel-pad" aria-labelledby="prompt-fallback-title">
      <h2 class="section-title" id="prompt-fallback-title">${escapeHtml(t("chrome.agentPromptFallbackTitle"))}</h2>
      <p class="page-lead">${escapeHtml(t("chrome.agentPromptFallbackLead"))}</p>
      <textarea readonly rows="10">${escapeHtml(state.nextActionPromptFallback)}</textarea>
      <button class="linkish" data-action="close-prompt-fallback">${escapeHtml(t("chrome.closeDetails"))}</button>
    </section>
  `;
}

// Rotes Banner ueber jeder Ansicht, wenn der geladene Bestand den Datenvertrag
// verletzt — gleiche Logik wie `npm run validate:master`. Sichtbar machen statt
// still falsch rechnen. Liste gedeckelt, damit ein kaputter Bestand die UI nicht sprengt.
function renderValidationBanner() {
  const v = data.validation;
  if (!v || v.valid) return "";
  const MAX = 50;
  const shown = v.errors.slice(0, MAX);
  const rest = v.errors.length - shown.length;
  return `
    <section id="validation-banner" class="validation-banner" role="alert" tabindex="-1">
      <div class="validation-banner-head">
        ${iconSvg("warning")}
        <strong>${escapeHtml(t("chrome.validationBannerTitle"))}</strong>
        <span class="chip danger">${v.errors.length}</span>
      </div>
      <p class="validation-banner-lead">${escapeHtml(t("chrome.validationBannerLead"))}</p>
      <ul class="validation-banner-list">
        ${shown.map((e) => `<li><code>${escapeHtml(e)}</code></li>`).join("")}
      </ul>
      ${rest > 0 ? `<p class="muted">+${rest} ${escapeHtml(t("chrome.validationBannerMore"))}</p>` : ""}
    </section>`;
}

// Aktions-Grenze: ein in einem Handler geworfener Fehler wird als schliessbares
// Banner sichtbar, statt nur in der Konsole zu landen.
function setUiError(error, kontext = "aktion") {
  state.uiError = {
    message: error?.message ?? String(error ?? ""),
    stack: error?.stack ?? "",
    kontext,
  };
  render();
}

function renderUiErrorBanner() {
  if (!state.uiError) return "";
  return `
    <div class="error-banner">
      ${renderErrorPanel(state.uiError, state.uiError.kontext)}
      <button class="chip neutral linkish error-banner-dismiss" data-error-dismiss>
        ${escapeHtml(t("error.dismiss"))}
      </button>
    </div>`;
}

function renderView() {
  if (state.view === "transactions") return renderTransactions();
  if (state.view === "liquiditaet") return renderLiquiditaet();
  if (state.view === "regelzahlungen") return renderRegelzahlungen();
  if (state.view === "vermoegen") return renderVermoegen();
  if (state.view === "vorsorge") return renderVorsorge();
  if (state.view === "szenarien") return renderSzenarien();
  if (state.view === "masterdata") return renderMasterdata();
  if (state.view === "checks") return renderChecks();
  if (state.view === "export") return renderExport();
  return renderOverview();
}

app.addEventListener("click", guard((event) => {
  const errorDismiss = event.target.closest("[data-error-dismiss]");
  if (errorDismiss) {
    state.uiError = null;
    render();
    return;
  }

  const transferCell = event.target.closest(".transfer-link-cell");
  if (transferCell) {
    event.stopPropagation();
    handleAction(transferCell);
    return;
  }

  const navButton = event.target.closest("[data-view]");
  if (navButton) {
    state.view = navButton.dataset.view;
    state.moreMenuOpen = false;
    commitNavigation();
    return;
  }

  const liquiditaetToggle = event.target.closest("[data-liquiditaet-toggle]");
  if (liquiditaetToggle) {
    const key = liquiditaetToggle.dataset.liquiditaetToggle;
    if (state.liquiditaetExpanded.has(key)) state.liquiditaetExpanded.delete(key);
    else state.liquiditaetExpanded.add(key);
    render();
    return;
  }

  const liquiditaetGran = event.target.closest("[data-liquiditaet-gran]");
  if (liquiditaetGran) {
    state.liquiditaet.granularitaet = liquiditaetGran.dataset.liquiditaetGran;
    state.liquiditaetExpanded.clear();
    render();
    return;
  }

  const vermoegenSort = event.target.closest("[data-vermoegen-sort]");
  if (vermoegenSort) {
    const key = vermoegenSort.dataset.vermoegenSort;
    if (state.vermoegenSort.key === key) {
      state.vermoegenSort.dir = state.vermoegenSort.dir === "asc" ? "desc" : "asc";
    } else {
      state.vermoegenSort = { key, dir: "asc" };
    }
    render();
    return;
  }

  const transactionSort = event.target.closest("[data-transaction-sort]");
  if (transactionSort) {
    const key = transactionSort.dataset.transactionSort;
    if (state.transactionSort.key === key) {
      state.transactionSort.dir = state.transactionSort.dir === "asc" ? "desc" : "asc";
    } else {
      state.transactionSort = { key, dir: "asc" };
    }
    state.transactionPage = 1;
    render();
    return;
  }

  const regelSort = event.target.closest("[data-regel-sort]");
  if (regelSort) {
    const key = regelSort.dataset.regelSort;
    if (state.regelSort && state.regelSort.key === key) {
      state.regelSort = { key, dir: state.regelSort.dir === "asc" ? "desc" : "asc" };
    } else {
      state.regelSort = { key, dir: "asc" };
    }
    render();
    return;
  }

  const action = event.target.closest("[data-action]");
  if (action) {
    void handleAction(action);
    return;
  }

  const ruleRow = event.target.closest("[data-rule]");
  if (ruleRow) {
    state.view = "masterdata";
    state.masterSection = "regeln";
    state.selectedRegel = ruleRow.dataset.rule;
    commitNavigation();
    return;
  }

  const masterSection = event.target.closest("[data-master-section]");
  if (masterSection) {
    state.masterSection = masterSection.dataset.masterSection;
    state.selectedRegel = "";
    state.regelRailWide = false;
    commitNavigation();
  }
}, setUiError, "click"));

// Tastatur-Aktivierung fuer fokussierbare, nicht-native Bedienelemente
// (z. B. auswaehlbare Tabellenzellen/-zeilen mit tabindex="0" + data-action).
// Native Buttons/Links/Inputs bringen Enter/Space selbst mit.
const KEY_ACTIVATION_SELECTOR = "[data-action], [data-view], [data-master-section], [data-liquiditaet-toggle], [data-liquiditaet-gran], [data-vermoegen-sort], [data-transaction-sort], [data-regel-sort], [data-rule]";
app.addEventListener("keydown", guard((event) => {
  if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
  const el = event.target;
  if (!el || typeof el.matches !== "function") return;
  if (el.matches("button, a, input, select, textarea")) return;
  if (el.getAttribute("tabindex") == null) return;
  if (!el.matches(KEY_ACTIVATION_SELECTOR)) return;
  event.preventDefault();
  el.click();
}, setUiError, "keydown"));

// Live-Suche: Textfilter wirken pro Tastendruck; Fokus/Cursor uebersteht das
// Re-Render via captureFocus/restoreFocus (Selektor ueber die id des Inputs).
app.addEventListener("input", guard((event) => {
  const filter = event.target.closest("input[data-filter]");
  if (!filter) return;
  state.transactionFilters[filter.dataset.filter] = filter.value;
  state.transactionPage = 1;
  render();
}, setUiError, "input"));

app.addEventListener("change", guard((event) => {
  const control = event.target.closest("[data-control]");
  if (control?.dataset.control === "data-mode") {
    state.dataMode = control.value === "demo" ? "demo" : "live";
    localStorage.setItem(storageKeys.dataMode, state.dataMode);
    const url = new URL(window.location.href);
    url.searchParams.set("_reload", String(Date.now()));
    window.location.assign(url);
    return;
  }
  if (control?.dataset.control === "lang") {
    state.lang = control.value;
    localStorage.setItem(storageKeys.lang, state.lang);
    render();
    return;
  }
  if (control?.dataset.control === "theme") {
    state.theme = control.value;
    localStorage.setItem(storageKeys.theme, state.theme);
    render();
    return;
  }
  if (control?.dataset.control === "liquiditaet-bis") {
    state.liquiditaet.bisDatum = control.value || defaultHorizonEnd(data.regelzahlungen, heuteIso());
    state.liquiditaetExpanded.clear();
    render();
    return;
  }

  const filter = event.target.closest("[data-filter]");
  if (filter) {
    if (filter.dataset.filter === "pageSize") {
      state.pageSize = Number(filter.value);
      state.transactionPage = 1;
      state.view = "transactions";
      commitNavigation();
      return;
    }
    state.transactionFilters[filter.dataset.filter] = filter.value;
    if (filter.dataset.filter === "timeMode") {
      applyTransactionTimeModeDefaults(filter.value);
    }
    state.view = "transactions";
    state.transactionPage = 1;
    commitNavigation();
    return;
  }

  const vermoegenFilter = event.target.closest("[data-vermoegen-filter]");
  if (vermoegenFilter) {
    state.vermoegenFilters[vermoegenFilter.dataset.vermoegenFilter] = vermoegenFilter.value;
    state.view = "vermoegen";
    render();
  }
}, setUiError, "change"));

// Diagramm-Hover: delegierter pointermove-Handler auf dem App-Container.
bindDiagrammHover(app);

async function copyNextAgentPrompt(type = "") {
  const nextActionActions = buildNextAgentActions(data);
  const nextAction = nextActionActions.find((candidate) => candidate.type === type) ?? nextActionActions[0];
  if (!nextAction?.prompt) return;
  try {
    await navigator.clipboard.writeText(nextAction.prompt);
    if (nextActionCopiedTimer) clearTimeout(nextActionCopiedTimer);
    state.nextActionCopied = true;
    state.nextActionMenuOpen = false;
    state.nextActionPromptFallback = "";
    render();
    nextActionCopiedTimer = window.setTimeout(() => {
      state.nextActionCopied = false;
      nextActionCopiedTimer = null;
      render();
    }, 1800);
  } catch {
    if (nextActionCopiedTimer) {
      clearTimeout(nextActionCopiedTimer);
      nextActionCopiedTimer = null;
    }
    state.nextActionCopied = false;
    state.nextActionMenuOpen = false;
    state.nextActionPromptFallback = nextAction.prompt;
    render();
  }
}

async function handleAction(element) {
  const action = element.dataset.action;
  if (action === "toggle-next-action-menu") {
    state.nextActionMenuOpen = !state.nextActionMenuOpen;
    render();
    return;
  }
  if (action === "copy-next-agent-prompt") {
    await copyNextAgentPrompt(element.dataset.nextActionType);
    return;
  }
  if (action === "close-prompt-fallback") {
    state.nextActionPromptFallback = "";
    render();
    return;
  }
  if (action === "reload-data") {
    const url = new URL(window.location.href);
    url.searchParams.set("_reload", String(Date.now()));
    window.location.assign(url);
    return;
  }
  if (action === "toggle-more-menu") {
    state.moreMenuOpen = !state.moreMenuOpen;
    render();
    return;
  }
  if (action === "toggle-sidebar") {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    localStorage.setItem(storageKeys.sidebarCollapsed, String(state.sidebarCollapsed));
    render();
    return;
  }
  if (action === "go-overview") {
    state.view = "overview";
    commitNavigation();
    return;
  }
  if (action === "show-import-errors") {
    state.view = "checks";
    commitNavigation();
    return;
  }
  if (action === "show-validation") {
    const banner = document.getElementById("validation-banner");
    if (banner) {
      banner.scrollIntoView({ behavior: "smooth", block: "start" });
      banner.focus();
    }
    return;
  }
  if (action === "open-account-master") {
    state.view = "masterdata";
    state.masterSection = "konten";
    state.selectedKonto = element.dataset.account || "";
    commitNavigation();
    return;
  }
  if (action === "filter-open-category") {
    state.view = "transactions";
    state.transactionFilters.status = "offen";
    state.transactionFilters.account = "";
    state.transactionFilters.category = "";
    state.transactionFilters.transfer = "";
    state.transactionFilters.search = "";
    clearTransactionTimeFilter();
    state.transactionPage = 1;
    state.selectedTransactionId = "";
    state.detailRailClosed = false;
    commitNavigation();
    return;
  }
  if (action === "clear-transaction-filter") {
    if (Object.hasOwn(state.transactionFilters, element.dataset.filterName)) {
      state.transactionFilters[element.dataset.filterName] = "";
      state.transactionPage = 1;
      commitNavigation();
    }
    return;
  }
  if (action === "reset-transaction-filters") {
    state.transactionFilters = {
      account: "",
      status: "",
      category: "",
      transfer: "",
      origin: "",
      search: "",
      timeMode: "none",
      dateFrom: "",
      dateTo: "",
      month: "",
      quarterYear: "",
      quarter: "1",
      year: "",
    };
    state.transactionPage = 1;
    commitNavigation();
    return;
  }
  if (action === "account-transactions") {
    state.view = "transactions";
    state.transactionFilters.account = element.dataset.account;
    state.transactionFilters.status = "";
    state.transactionFilters.category = "";
    state.transactionFilters.transfer = "";
    state.transactionFilters.search = "";
    clearTransactionTimeFilter();
    state.transactionPage = 1;
    state.selectedTransactionId = "";
    state.detailRailClosed = false;
    commitNavigation();
    return;
  }
  if (action === "select-transaction") {
    state.selectedTransactionId = element.dataset.transaction;
    state.detailRailClosed = false;
    commitNavigation();
    return;
  }
  if (action === "open-transaction") {
    // Aus einer anderen Ansicht (z. B. Regel-Detail) eine konkrete Buchung
    // oeffnen: alle Filter leeren, damit die Zielbuchung sicher im gefilterten
    // Bestand liegt und das Detail-Rail sie zeigt.
    state.view = "transactions";
    state.transactionFilters.account = "";
    state.transactionFilters.status = "";
    state.transactionFilters.category = "";
    state.transactionFilters.transfer = "";
    state.transactionFilters.search = "";
    state.transactionFilters.origin = "";
    clearTransactionTimeFilter();
    state.transactionPage = 1;
    state.selectedTransactionId = element.dataset.transaction;
    state.detailRailClosed = false;
    commitNavigation();
    return;
  }
  if (action === "close-detail-rail") {
    state.detailRailClosed = true;
    commitNavigation();
    return;
  }
  if (action === "close-regel-rail") {
    state.selectedRegel = "";
    state.regelRailWide = false;
    commitNavigation();
    return;
  }
  if (action === "toggle-regel-rail-width") {
    state.regelRailWide = !state.regelRailWide;
    commitNavigation();
    return;
  }
  if (action === "close-vermoegen-detail-rail") {
    state.vermoegenDetailRailClosed = true;
    commitNavigation();
    return;
  }
  if (action === "toggle-vermoegen-rail-width") {
    state.vermoegenRailWide = !state.vermoegenRailWide;
    state.vermoegenDetailRailClosed = false;
    commitNavigation();
    return;
  }
  if (action === "page-first" || action === "page-prev" || action === "page-next" || action === "page-last" || action === "page-jump") {
    state.view = "transactions";
    if (action === "page-first") state.transactionPage = 1;
    if (action === "page-prev") state.transactionPage -= 1;
    if (action === "page-next") state.transactionPage += 1;
    if (action === "page-last") state.transactionPage = Number.MAX_SAFE_INTEGER;
    if (action === "page-jump") state.transactionPage = Number(element.dataset.page);
    commitNavigation();
    return;
  }
  if (action === "paired-transfer") {
    state.view = "transactions";
    state.selectedTransactionId = element.dataset.transaction;
    const paired = transaktionenById.get(element.dataset.transaction);
    if (paired) {
      state.transactionFilters.account = paired.konto_id;
      state.transactionFilters.status = "";
      state.transactionFilters.category = "";
      state.transactionFilters.transfer = "";
      state.transactionPage = 1;
    }
    commitNavigation();
    return;
  }
  if (action === "select-vermoegen") {
    state.selectedVermoegenId = element.dataset.vermoegen;
    state.vermoegenRailMode = "position";
    state.vermoegenRailWide = false;
    state.vermoegenDetailRailClosed = false;
    commitNavigation();
    return;
  }
  if (action === "select-szenario") {
    // Klick auf ein Szenario oeffnet das Uebersichts-Rail (Liste bleibt), nicht die Vollansicht.
    state.selectedSzenarioId = element.dataset.szenario;
    state.szenarioDetailRailClosed = false;
    state.szenarioVollansicht = false;
    state.szenarioBasisExpanded = false;
    commitNavigation();
    return;
  }
  if (action === "close-szenario-rail") {
    state.szenarioDetailRailClosed = true;
    commitNavigation();
    return;
  }
  if (action === "open-szenario-vollansicht") {
    state.szenarioVollansicht = true;
    commitNavigation();
    return;
  }
  if (action === "toggle-szenario-basis") {
    state.szenarioBasisExpanded = !state.szenarioBasisExpanded;
    commitNavigation();
    return;
  }
  if (action === "back-to-szenarien") {
    // Aus der Vollansicht zurueck zu Liste + Rail (Auswahl bleibt erhalten).
    state.szenarioVollansicht = false;
    commitNavigation();
    return;
  }
  if (action === "open-szenario") {
    state.view = "szenarien";
    state.selectedSzenarioId = element.dataset.szenario;
    state.szenarioDetailRailClosed = false;
    state.szenarioVollansicht = false;
    commitNavigation();
    return;
  }
  if (action === "open-regelzahlung") {
    // Querlink aus der Szenario-Rechengrundlage auf die konkrete Regelzahlung.
    state.view = "regelzahlungen";
    state.selectedRegelzahlungId = element.dataset.regelzahlung || "";
    commitNavigation();
    return;
  }
  if (action === "show-vermoegen-wertstaende") {
    state.vermoegenRailMode = "wertstaende";
    state.vermoegenRailWide = true;
    state.vermoegenDetailRailClosed = false;
    commitNavigation();
    return;
  }
  if (action === "clear-vermoegen-filter") {
    if (Object.hasOwn(state.vermoegenFilters, element.dataset.filterName)) {
      state.vermoegenFilters[element.dataset.filterName] = "";
      commitNavigation();
    }
    return;
  }
  if (action === "reset-vermoegen-filters") {
    state.vermoegenFilters = {
      klasse: "",
      qualitaet: "",
    };
    commitNavigation();
    return;
  }
  if (action === "open-vermoegen-entity") {
    state.view = "vermoegen";
    state.vermoegenFilters = { klasse: "", qualitaet: "" };
    state.selectedVermoegenId = `${element.dataset.vklasse}:${element.dataset.vid}`;
    state.vermoegenRailMode = "position";
    state.vermoegenRailWide = false;
    state.vermoegenDetailRailClosed = false;
    commitNavigation();
    return;
  }
  if (action === "show-checks-for" || action === "open-entity") {
    const scope = element.dataset.scope;
    const entity = element.dataset.entity;
    if (scope === "konto") {
      state.view = "transactions";
      state.transactionFilters.account = entity;
    } else if (scope === "transaktion") {
      state.view = "transactions";
      state.selectedTransactionId = entity;
      state.transactionFilters.account = "";
      state.transactionFilters.status = "";
      state.transactionFilters.category = "";
      state.transactionFilters.transfer = "";
      state.transactionPage = 1;
    } else {
      state.view = "checks";
    }
    commitNavigation();
  }
}


function snapshotState() {
  return {
    view: state.view,
    transactionFilters: { ...state.transactionFilters },
    selectedTransactionId: state.selectedTransactionId,
    transactionPage: state.transactionPage,
    masterSection: state.masterSection,
    selectedKonto: state.selectedKonto,
    selectedRegel: state.selectedRegel,
    selectedVermoegenId: state.selectedVermoegenId,
    selectedSzenarioId: state.selectedSzenarioId,
    vermoegenRailMode: state.vermoegenRailMode,
    vermoegenRailWide: state.vermoegenRailWide,
  };
}

function restoreState(snapshot) {
  if (!snapshot) return;
  state.view = snapshot.view || "overview";
  state.transactionFilters = { ...state.transactionFilters, ...(snapshot.transactionFilters || {}) };
  state.selectedTransactionId = snapshot.selectedTransactionId || "";
  state.transactionPage = snapshot.transactionPage || 1;
  state.masterSection = snapshot.masterSection || "konten";
  state.selectedKonto = snapshot.selectedKonto || "";
  state.selectedRegel = snapshot.selectedRegel || "";
  state.selectedVermoegenId = snapshot.selectedVermoegenId || "";
  state.selectedSzenarioId = snapshot.selectedSzenarioId || "";
  state.vermoegenRailMode = snapshot.vermoegenRailMode || "position";
  state.vermoegenRailWide = Boolean(snapshot.vermoegenRailWide);
}

// Neuer History-Eintrag nur bei echtem View-Wechsel. Zustandsaenderungen
// innerhalb einer View (Filter, Seite, Auswahl) ersetzen den aktuellen Eintrag,
// damit der Zurueck-Button nicht durch jeden Klick zugemuellt wird.
let lastCommittedView = state.view;
function commitNavigation() {
  state.uiError = null;
  const route = routeFromState(state);
  if (state.view !== lastCommittedView) {
    history.pushState(snapshotState(), "", route);
  } else {
    history.replaceState(snapshotState(), "", route);
  }
  lastCommittedView = state.view;
  render();
}

// Hash-Route auf den Zustand anwenden (Deep-Link von außen oder beim Laden).
// Für adressierte Detailansichten Filter zurücksetzen, damit der verlinkte
// Datensatz sichtbar ist, und bei Transaktionen auf die richtige Seite springen.
function applyRoute(route) {
  if (!route || !route.view) return;
  state.view = route.view;
  state.moreMenuOpen = false;
  if (route.masterSection) state.masterSection = route.masterSection;
  if (route.selectedKonto) state.selectedKonto = route.selectedKonto;
  if (route.selectedRegel) state.selectedRegel = route.selectedRegel;

  if (route.selectedTransactionId && transaktionenById.has(route.selectedTransactionId)) {
    Object.assign(state.transactionFilters, {
      account: "", status: "", category: "", transfer: "", search: "",
      timeMode: "none", dateFrom: "", dateTo: "", month: "", quarterYear: "", quarter: "1", year: "",
    });
    state.selectedTransactionId = route.selectedTransactionId;
    state.detailRailClosed = false;
    const idx = filteredTransactions().findIndex((tx) => tx.transaktion_id === route.selectedTransactionId);
    state.transactionPage = idx >= 0 ? Math.floor(idx / state.pageSize) + 1 : 1;
  }

  if (route.selectedVermoegenId) {
    state.vermoegenFilters.klasse = "";
    state.vermoegenFilters.qualitaet = "";
    state.selectedVermoegenId = route.selectedVermoegenId;
    state.vermoegenRailMode = "position";
    state.vermoegenRailWide = false;
    state.vermoegenDetailRailClosed = false;
  }
  if (route.selectedSzenarioId) {
    state.selectedSzenarioId = route.selectedSzenarioId;
  }
}

window.addEventListener("popstate", (event) => {
  restoreState(event.state);
  lastCommittedView = state.view;
  render();
});

// Direkt eingefügte/extern verlinkte Hash-Route (kein pushState von uns).
window.addEventListener("hashchange", () => {
  if (location.hash === routeFromState(state)) return; // selbst gesetzte Route ignorieren
  applyRoute(parseRoute(location.hash));
  lastCommittedView = state.view;
  history.replaceState(snapshotState(), "", routeFromState(state));
  render();
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (state.theme === "system") render();
});

applyRoute(parseRoute(location.hash));
lastCommittedView = state.view;
history.replaceState(snapshotState(), "", routeFromState(state));
render();

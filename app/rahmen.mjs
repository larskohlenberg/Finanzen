// app/rahmen.mjs
// Rahmen der App um die Ansichten: Sidebar, mobile Tab-Leiste, Kopfzeile mit
// Statuschips und Einstellungsmenue, Banner fuer Validierung und Fehler.
// rahmen haelt, was nur der Rahmen kennt (Version, Sitzungskonfiguration).
import { renderErrorPanel } from "./error.mjs";
import { data, state, navItems, TABBAR_VIEWS, t, tf, escapeHtml, datenVersion } from "./runtime.mjs";
import { DEMO_STICHTAG } from "./demo-modus.mjs";
import { formatDate } from "./komponenten.mjs";
import { routeFromState } from "./routing.mjs";
import { suchIndex, suche } from "./schnellsuche.mjs";
import { versionAnzeige } from "./version.mjs";
import { kopfleisteAntwort, kopfleisteFehler } from "./views/kopfleiste-daten.mjs";
import { iconSvg } from "./icons.js";

// Schnellsuche als feste Suchleiste in der Kopfzeile (schnellsuche.mjs):
// Eingabe als Combobox, Treffer klappen als Liste von Links darunter auf.
// offen = Trefferliste sichtbar; Text, Auswahl und offen stehen in state.schnellsuche.
let suchStand = null;
function suchtreffer() {
  const seiten = navItems.map(([view, labelKey]) => ({ name: t(labelKey), route: routeFromState({ view }), view }));
  if (suchStand?.version !== datenVersion() || suchStand.lang !== state.lang) {
    suchStand = { version: datenVersion(), lang: state.lang, index: suchIndex(data, { seiten }) };
  }
  return suche(suchStand.index, state.schnellsuche.text);
}

export function schnellsucheTreffer() {
  return state.schnellsuche.offen ? suchtreffer() : [];
}

export function renderSchnellsuche() {
  const s = state.schnellsuche;
  const offen = s.offen && s.text.trim() !== "";
  const treffer = offen ? suchtreffer() : [];
  const aktiv = Math.min(s.index, Math.max(0, treffer.length - 1));
  const liste = treffer.map((tr, i) => `
    <li role="option" id="suchtreffer-${i}" aria-selected="${i === aktiv}" class="${i === aktiv ? "aktiv" : ""}">
      <a href="${escapeHtml(tr.route)}" data-action="schnellsuche-ziel" data-route="${escapeHtml(tr.route)}" data-ziel-view="${escapeHtml(tr.view ?? "")}" tabindex="-1">
        <span class="such-art">${escapeHtml(t(`chrome.suchArt.${tr.art}`))}</span>
        <span class="such-name">${escapeHtml(tr.name || tr.id)}</span>
        ${tr.id && tr.name ? `<span class="such-id muted">${escapeHtml(tr.id)}</span>` : ""}
      </a>
    </li>`).join("");
  return `
    <div class="schnellsuche" role="search">
      <span class="schnellsuche-icon" aria-hidden="true">${iconSvg("search")}</span>
      <input id="schnellsuche-eingabe" type="search" autocomplete="off" role="combobox" aria-label="${escapeHtml(t("chrome.schnellsuche"))}" aria-expanded="${treffer.length > 0}" aria-controls="suchtreffer" aria-autocomplete="list" ${treffer.length ? `aria-activedescendant="suchtreffer-${aktiv}"` : ""} placeholder="${escapeHtml(t("chrome.schnellsuchePlatzhalter"))}" title="${escapeHtml(t("chrome.schnellsucheKuerzel"))}" value="${escapeHtml(s.text)}" data-schnellsuche>
      <kbd class="schnellsuche-kuerzel" aria-hidden="true">${/Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? "") ? "⌘K" : escapeHtml(t("chrome.schnellsucheTaste"))}</kbd>
      ${offen ? `
      <div class="schnellsuche-treffer">
        ${treffer.length ? `<ul id="suchtreffer" role="listbox">${liste}</ul>` : `<p class="muted schnellsuche-leer">${escapeHtml(t("chrome.schnellsucheLeer"))}</p>`}
        <p class="muted schnellsuche-hilfe">${escapeHtml(t("chrome.schnellsucheHilfe"))}</p>
      </div>` : ""}
    </div>`;
}

// undefined = Version noch nicht geladen (nichts anzeigen), null = keine
// version.json. sitzungKonfig null = Sitzungsschutz noch nicht geladen.
export const rahmen = {
  appVersion: undefined,
  sitzungKonfig: null,
  sitzungswaechter: null,
  nextActionCopiedTimer: null,
};

export function renderSidebar() {
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
            <button class="nav-button ${state.view === view ? "active" : ""}" data-view="${view}"${state.view === view ? ' aria-current="page"' : ""} aria-label="${escapeHtml(t(labelKey))}" title="${escapeHtml(t(labelKey))}">
              <span class="nav-icon">${iconSvg(icon)}</span>
              <span class="nav-label">${escapeHtml(t(labelKey))}</span>
            </button>
          `)
          .join("")}
      </nav>
      <div class="sidebar-fuss">
        <div class="sidebar-meta">
          <span>${escapeHtml(t("chrome.workState"))}</span>
          <strong>${escapeHtml(t(state.dataMode === "demo" ? "chrome.releaseStateDemo" : "chrome.releaseStateLive"))}</strong>
          ${renderVersion()}
        </div>
        ${renderAbmelden()}
      </div>
    </aside>
  `;
}

function renderVersion() {
  if (rahmen.appVersion === undefined) return "";
  const v = versionAnzeige(rahmen.appVersion, {
    lang: state.lang,
    lokal: t("chrome.versionLocal"),
  });
  if (v.lokal) return `<span class="sidebar-version">${escapeHtml(v.text)}</span>`;
  const rest = [v.datum, v.branch].filter(Boolean).map(escapeHtml).join(" · ");
  return `
    <span class="sidebar-version">
      <a href="${escapeHtml(v.href)}" target="_blank" rel="noopener" title="${escapeHtml(t("chrome.versionCommitHint"))}">${escapeHtml(v.kurz)}</a> · ${rest}
    </span>`;
}

// Nur mit konfigurierter Logout-URL (sitzung.json); lokal gibt es nichts abzumelden.
function renderAbmelden() {
  if (!rahmen.sitzungKonfig?.abmeldenUrl) return "";
  return `
    <button type="button" class="nav-button sidebar-abmelden" data-action="abmelden" aria-label="${escapeHtml(t("chrome.signOut"))}" title="${escapeHtml(t("chrome.signOut"))}">
      <span class="nav-icon">${iconSvg("logout")}</span>
      <span class="nav-label">${escapeHtml(t("chrome.signOut"))}</span>
    </button>`;
}

export function renderTabbar() {
  const primary = navItems.filter(([view]) => TABBAR_VIEWS.includes(view));
  const secondary = navItems.filter(([view]) => !TABBAR_VIEWS.includes(view));
  const moreActive = secondary.some(([view]) => view === state.view);
  return `
    <nav class="tabbar" aria-label="${escapeHtml(t("chrome.mobileNav"))}">
      ${state.moreMenuOpen ? `
        <div class="tabbar-more-menu">
          ${secondary
            .map(([view, labelKey, icon]) => `
              <button class="tabbar-more-item ${state.view === view ? "active" : ""}" data-view="${view}"${state.view === view ? ' aria-current="page"' : ""}>
                <span class="nav-icon">${iconSvg(icon)}</span>${escapeHtml(t(labelKey))}
              </button>
            `)
            .join("")}
          ${rahmen.sitzungKonfig?.abmeldenUrl ? `
            <button type="button" class="tabbar-more-item" data-action="abmelden">
              <span class="nav-icon">${iconSvg("logout")}</span>${escapeHtml(t("chrome.signOut"))}
            </button>` : ""}
        </div>` : ""}
      <div class="tabbar-row">
        ${primary
          .map(([view, labelKey, icon]) => `
            <button class="tabbar-button ${state.view === view ? "active" : ""}" data-view="${view}"${state.view === view ? ' aria-current="page"' : ""} aria-label="${escapeHtml(t(labelKey))}">
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

export function renderTopbar() {
  const demoActive = state.dataMode === "demo";
  // Zaehler und naechste Aktion rechnet der Server (GET /api/v1/kopfleiste).
  const kopf = kopfleisteAntwort();
  const openCategories = kopf?.offene_kategorien ?? 0;
  const offeneChecks = kopf?.offene_checks ?? 0;
  return `
    <header class="topbar">
      <div class="work-status" role="group" aria-label="${escapeHtml(t("chrome.workStatus"))}">
        ${demoActive ? `<span class="chip demo" title="${escapeHtml(tf("chrome.demoDataHint", { datum: formatDate(DEMO_STICHTAG) }))}">${iconSvg("masterdata")}${escapeHtml(t("chrome.demoData"))} · ${escapeHtml(formatDate(DEMO_STICHTAG))}</span>` : ""}
        ${data.validation?.valid
          ? `<span class="chip success icon-chip" role="img" aria-label="${escapeHtml(t("chrome.validationPassed"))}" title="${escapeHtml(`${t("chrome.validationPassed")} – ${t("chrome.validationPassedHint")}`)}">${iconSvg("success")}</span>`
          : `<button class="chip danger linkish" data-action="show-validation" title="${escapeHtml(t("chrome.validationFailedHint"))}">${iconSvg("warning")}${data.validation?.errors.length ?? 0} ${escapeHtml(t("chrome.validationFailed"))}</button>`}
        <button class="chip neutral linkish icon-chip" data-action="reload-data" aria-label="${escapeHtml(t("chrome.reloadData"))}" title="${escapeHtml(t("chrome.reloadData"))}">${iconSvg("regelzahlungen")}</button>
        ${kopfleisteFehler() ? `<button class="chip danger linkish" data-action="reload-data" title="${escapeHtml(kopfleisteFehler().message)}">${iconSvg("warning")}${escapeHtml(t("chrome.kopfleisteFehler"))}</button>` : ""}
        ${openCategories > 0 ? `<button class="chip review linkish" data-action="filter-open-category">${iconSvg("review")}${openCategories} ${escapeHtml(t("chrome.categoryOpen"))}</button>` : ""}
        ${offeneChecks > 0 ? `<button class="chip review linkish" data-action="show-checks">${iconSvg("review")}${offeneChecks} ${escapeHtml(t("chrome.openChecks"))}</button>` : ""}
        ${(data.importfehler?.length ?? 0) > 0 ? `<button class="chip danger linkish" data-action="show-import-errors">${iconSvg("warning")}${data.importfehler.length} ${escapeHtml(t("chrome.importErrors"))}</button>` : ""}
        ${renderNextActionButton(kopf?.aktionen ?? [])}
      </div>
      ${renderSchnellsuche()}
      ${renderSettingsMenu()}
    </header>
  `;
}

// Ein Zahnrad statt drei Auswahlfeldern: Datenmodus, Sprache und Darstellung
// als Knopfreihen im aufklappbaren Menue (Muster wie die Granularitaet in Liquiditaet).
function renderSettingsMenu() {
  const gruppe = (setting, label, optionen) => `
    <div class="settings-group" role="group" aria-label="${escapeHtml(label)}">
      <span class="settings-label">${escapeHtml(label)}</span>
      <div class="settings-options">
        ${optionen.map(([value, text, aktiv]) => `<button class="chip ${aktiv ? "success" : "neutral"} linkish" data-action="set-setting" data-setting="${setting}" data-value="${value}" aria-pressed="${aktiv}">${escapeHtml(text)}</button>`).join("")}
      </div>
    </div>`;
  return `
    <div class="settings-control">
      <button class="chip neutral linkish icon-chip settings-toggle" data-action="toggle-settings-menu" aria-haspopup="true" aria-expanded="${state.settingsMenuOpen}" aria-label="${escapeHtml(t("chrome.settings"))}" title="${escapeHtml(t("chrome.settings"))}">${iconSvg("settings")}</button>
      ${state.settingsMenuOpen ? `
        <div class="settings-menu">
          ${gruppe("data-mode", t("chrome.dataMode"), [["live", t("chrome.liveDataShort"), state.dataMode !== "demo"], ["demo", t("chrome.demoDataShort"), state.dataMode === "demo"]])}
          ${gruppe("lang", t("chrome.language"), [["de", "Deutsch", state.lang === "de"], ["en", "English", state.lang === "en"]])}
          ${gruppe("theme", t("chrome.appearance"), [["system", t("chrome.themeSystem"), state.theme === "system"], ["light", t("chrome.themeLight"), state.theme === "light"], ["dark", t("chrome.themeDark"), state.theme === "dark"]])}
        </div>` : ""}
    </div>
  `;
}

function renderNextActionButton(nextActionActions) {
  const nextAction = nextActionActions[0] ?? { type: "none", label: t("chrome.noAgentAction"), prompt: "" };
  const disabled = nextAction.type === "none" ? " disabled" : "";
  const label = state.nextActionCopied ? t("chrome.agentPromptCopied") : t("chrome.copyPromptShort");
  const detail = nextAction.type === "none" ? t("chrome.noAgentAction") : nextAction.label;
  const hasMenu = nextActionActions.length > 1;
  const menuOpen = hasMenu && state.nextActionMenuOpen;
  return `
    <span class="next-action-control">
      <button class="chip neutral linkish next-action-copy" data-action="copy-next-agent-prompt" data-next-action-type="${escapeHtml(nextAction.type)}"${disabled} title="${escapeHtml(`${t("chrome.copyAgentPrompt")}: ${detail}`)}">
        ${iconSvg("copy")}<span class="chip-text">${escapeHtml(label)} · ${escapeHtml(detail)}</span>
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

export function renderPromptFallback() {
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
export function renderValidationBanner() {
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

export function renderUiErrorBanner() {
  if (!state.uiError) return "";
  return `
    <div class="error-banner">
      ${renderErrorPanel(state.uiError, state.uiError.kontext)}
      <button class="chip neutral linkish error-banner-dismiss" data-error-dismiss>
        ${escapeHtml(t("error.dismiss"))}
      </button>
    </div>`;
}

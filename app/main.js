import { defaultHorizonEnd, naechsteFaelligkeit, localTodayIso } from "./liquiditaet.mjs";
import { formatIban } from "./tools/lib/text.mjs";
import { iconSvg } from "./icons.js";
import { computeVermoegenChecks } from "./vermoegen.mjs";
import { routeFromState, parseRoute } from "./routing.mjs";
import { renderVermoegen } from "./views/vermoegen.mjs";
import { renderTransactions, filteredTransactions, applyTransactionTimeModeDefaults, clearTransactionTimeFilter } from "./views/transaktionen.mjs";
import { renderLiquiditaet } from "./views/liquiditaet.mjs";
import {
  app, data, state, storageKeys, navItems, TABBAR_VIEWS,
  personenById, kontenById, kategorienById, transaktionenById, transfersById,
  t, escapeHtml, cents,
} from "./runtime.mjs";
import {
  formatMoney, formatDate, accountOwnerNames, accountTypeLabel,
  statusChip, renderPageHead, heuteIso,
} from "./komponenten.mjs";
import {
  openCategoryTransactions, missingReferenceChecks, accountBalance,
  loadedTotalAccountsBalance, currentNettovermoegen, overviewAccountStandDate, sortedOverviewAccounts,
} from "./selektoren.mjs";

function applyTheme() {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = state.theme === "system" ? (systemDark ? "dark" : "light") : state.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.lang = state.lang;
}

const FOCUS_ATTRS = [
  "id", "data-view", "data-action", "data-account", "data-transaction",
  "data-vermoegen", "data-liquiditaet-toggle", "data-liquiditaet-gran", "data-master-section",
  "data-vermoegen-sort", "data-control", "data-filter-name", "data-scope", "data-entity",
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
      ${renderView()}
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
  return `
    <header class="topbar">
      <div class="work-status">
        <strong>${escapeHtml(t("chrome.workStatus"))}</strong>
        ${data.validation?.valid
          ? `<span class="chip success" title="${escapeHtml(t("chrome.validationPassedHint"))}">${iconSvg("success")}${escapeHtml(t("chrome.validationPassed"))}</span>`
          : `<button class="chip danger linkish" data-action="show-validation" title="${escapeHtml(t("chrome.validationFailedHint"))}">${iconSvg("warning")}${data.validation?.errors.length ?? 0} ${escapeHtml(t("chrome.validationFailed"))}</button>`}
        <button class="chip neutral linkish" data-action="reload-data" aria-label="${escapeHtml(t("chrome.reloadData"))}" title="${escapeHtml(t("chrome.reloadData"))}">${iconSvg("regelzahlungen")}${escapeHtml(t("chrome.reloadData"))}</button>
        <button class="chip review linkish" data-action="filter-open-category">${iconSvg("review")}${openCategoryTransactions().length} ${escapeHtml(t("chrome.categoryOpen"))}</button>
        ${(data.importfehler?.length ?? 0) > 0 ? `<button class="chip danger linkish" data-action="show-import-errors">${iconSvg("warning")}${data.importfehler.length} ${escapeHtml(t("chrome.importErrors"))}</button>` : ""}
        <button class="chip neutral linkish" data-action="next-action">${escapeHtml(t("chrome.nextAction"))}: ${openCategoryTransactions().length} ${escapeHtml(t("overview.nextActionText"))}</button>
      </div>
      <div class="controls">
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

function renderView() {
  if (state.view === "transactions") return renderTransactions();
  if (state.view === "liquiditaet") return renderLiquiditaet();
  if (state.view === "regelzahlungen") return renderRegelzahlungen();
  if (state.view === "vermoegen") return renderVermoegen();
  if (state.view === "masterdata") return renderMasterdata();
  if (state.view === "checks") return renderChecks();
  if (state.view === "export") return renderExport();
  return renderOverview();
}

function renderOverview() {
  return `
    ${renderPageHead(t("overview.title"), "")}
    <div class="layout-with-rail">
      <div class="stack">
        <div class="overview-kpis">
          <section class="panel hero-kpi" aria-labelledby="kpi-balance-label">
            <div>
              <div class="kpi-label" id="kpi-balance-label">${escapeHtml(t("overview.totalBalance"))}</div>
              <div class="kpi-value">${escapeHtml(formatMoney(loadedTotalAccountsBalance()))}</div>
              <div class="kpi-note">${escapeHtml(t("overview.balanceNote"))}</div>
            </div>
          </section>
          <section class="panel hero-kpi" aria-labelledby="kpi-networth-label">
            <div>
              <div class="kpi-label" id="kpi-networth-label">${escapeHtml(t("nav.vermoegen"))}</div>
              <div class="kpi-value">${escapeHtml(formatMoney(currentNettovermoegen().netto_cents))}</div>
              <div class="kpi-note">${escapeHtml(t("overview.netWorthNote"))}</div>
            </div>
          </section>
        </div>
        <section class="panel panel-pad">
          <h2 class="section-title">${escapeHtml(t("overview.accountBalances"))}</h2>
          ${renderAccountTable()}
        </section>
      </div>
      <aside class="rail overview-rail">
        <section class="panel panel-pad next-action">
          <h2 class="section-title">${escapeHtml(t("chrome.nextAction"))}</h2>
          <button class="linkish" data-action="filter-open-category">${openCategoryTransactions().length} ${escapeHtml(t("overview.nextActionText"))}</button>
          <p class="page-lead">${escapeHtml(t("checks.categoryOpen.detail"))}</p>
        </section>
        <section class="panel panel-pad checks-rail">
          <h2 class="section-title">${escapeHtml(t("overview.checksPreview"))}</h2>
          <div class="rail-list">${renderCheckItems(data.checks.slice(0, 4))}</div>
        </section>
      </aside>
    </div>
  `;
}

function renderAccountTable() {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(t("labels.account"))}</th>
            <th>${escapeHtml(t("labels.accountReference"))}</th>
            <th>${escapeHtml(t("labels.owner"))}</th>
            <th>${escapeHtml(t("labels.type"))}</th>
            <th>${escapeHtml(t("labels.stand"))}</th>
            <th class="amount">${escapeHtml(t("labels.loadedBalance"))}</th>
            <th>${escapeHtml(t("labels.status"))}</th>
          </tr>
        </thead>
        <tbody>
          ${renderAccountRows(sortedOverviewAccounts())}
        </tbody>
      </table>
    </div>
  `;
}

function renderAccountRows(accounts) {
  return accounts
    .map((konto) => {
      const isDepot = konto.kontotyp === "depot";
      const latestDate = overviewAccountStandDate(konto);
      const balanceCell = isDepot
        ? `<span class="muted">—</span>`
        : escapeHtml(formatMoney(accountBalance(konto.konto_id)));
      const status = isDepot
        ? t("labels.depotValueMissing")
        : konto.kontoreferenz
          ? t("labels.accountStatusMissing")
          : t("labels.referenceMissing");
      const chipClass = isDepot ? "neutral" : konto.kontoreferenz ? "neutral" : "review";
      const chipIcon = isDepot || konto.kontoreferenz ? "neutral" : "review";
      return `
        <tr class="clickable ${konto.konto_id === state.selectedKonto ? "selected" : ""}" id="konto-${escapeHtml(konto.konto_id)}" data-action="account-transactions" data-account="${escapeHtml(konto.konto_id)}">
          <td><button class="linkish" data-action="account-transactions" data-account="${escapeHtml(konto.konto_id)}">${escapeHtml(konto.name)}</button></td>
          <td>${konto.kontoreferenz ? escapeHtml(formatIban(konto.kontoreferenz)) : `<span class="muted">—</span>`}</td>
          <td>${escapeHtml(accountOwnerNames(konto))}</td>
          <td>${escapeHtml(accountTypeLabel(konto.kontotyp))}</td>
          <td>${latestDate ? escapeHtml(formatDate(latestDate)) : `<span class="muted">${escapeHtml(t("labels.noStand"))}</span>`}</td>
          <td class="amount">${balanceCell}</td>
          <td><span class="chip ${chipClass}">${iconSvg(chipIcon)}${escapeHtml(status)}</span></td>
        </tr>
      `;
    })
    .join("");
}


// Prognose-Saldo je erwartetem Termin als flache Punktserie (Startsaldo + jeder Posten).

function formatRhythmus(einheit, intervall) {
  const key = intervall === 1 ? "eins" : "mehr";
  return t(`rhythmus.${einheit}.${key}`).replace("{n}", String(intervall));
}

function renderRegelzahlungen() {
  const today = localTodayIso();
  const rows = data.regelzahlungen.map((rz) => {
    // Abgelehnte Regelzahlungen haben keine erwartete Zukunft; sonst der naechste Termin.
    const naechste = rz.status === "abgelehnt" ? null : naechsteFaelligkeit(rz, today);
    return `
    <tr>
      <td>${escapeHtml(rz.bezeichnung)}</td>
      <td class="amount">${escapeHtml(formatMoney(toCents(rz.betrag)))}</td>
      <td>${escapeHtml(formatRhythmus(rz.rhythmus_einheit, rz.rhythmus_intervall))}</td>
      <td>${escapeHtml(formatDate(rz.anker_datum))}</td>
      <td>${naechste ? escapeHtml(formatDate(naechste)) : `<span class="muted">—</span>`}</td>
      <td>${rz.aktiv_bis ? escapeHtml(formatDate(rz.aktiv_bis)) : `<span class="chip neutral">${escapeHtml(t("liquiditaet.qualityOpenEnded"))}</span>`}</td>
      <td>${statusChip(rz.status)}</td>
    </tr>
  `;
  }).join("");
  return `
    ${renderPageHead(t("regelzahlungen.title"), t("regelzahlungen.lead"))}
    <section class="panel panel-pad section-spacing">
      ${data.regelzahlungen.length ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(t("regelzahlungen.bezeichnung"))}</th>
              <th class="amount">${escapeHtml(t("labels.amount"))}</th>
              <th>${escapeHtml(t("regelzahlungen.rhythmus"))}</th>
              <th>${escapeHtml(t("regelzahlungen.anker"))}</th>
              <th>${escapeHtml(t("regelzahlungen.naechsteFaelligkeit"))}</th>
              <th>${escapeHtml(t("regelzahlungen.aktivBis"))}</th>
              <th>${escapeHtml(t("labels.status"))}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : `<p class="muted">${escapeHtml(t("regelzahlungen.empty"))}</p>`}
    </section>
  `;
}

function renderMasterdata() {
  const missingRefs = missingReferenceChecks().length;
  return `
    ${renderPageHead(t("masterdata.title"), t("masterdata.lead"))}
    <div class="tile-grid">
      <button class="tile ${state.masterSection === "personen" ? "active" : ""}" data-master-section="personen">
        <strong>${escapeHtml(t("masterdata.people"))}</strong>
        <div class="count">${data.personen.length}</div>
        <span class="chip success">${iconSvg("success")}${escapeHtml(t("masterdata.active"))}</span>
      </button>
      <button class="tile ${state.masterSection === "konten" ? "active" : ""}" data-master-section="konten">
        <strong>${escapeHtml(t("masterdata.accounts"))}</strong>
        <div class="count">${data.konten.length}</div>
        <span class="chip review">${iconSvg("review")}${missingRefs} ${escapeHtml(t("masterdata.missingRefs"))}</span>
      </button>
      <button class="tile ${state.masterSection === "kategorien" ? "active" : ""}" data-master-section="kategorien">
        <strong>${escapeHtml(t("masterdata.categories"))}</strong>
        <div class="count">${data.kategorien.length}</div>
        <span class="chip success">${iconSvg("success")}${escapeHtml(t("masterdata.active"))}</span>
      </button>
    </div>
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(sectionTitle())}</h2>
      ${renderMasterSection()}
    </section>
  `;
}

function sectionTitle() {
  if (state.masterSection === "personen") return t("masterdata.people");
  if (state.masterSection === "kategorien") return t("masterdata.categories");
  return t("masterdata.accounts");
}

function renderMasterSection() {
  if (state.masterSection === "personen") {
    return renderSimpleTable([t("masterdata.people"), t("labels.status")], data.personen.map((person) => [person.name, t(`status.${person.status}`)]));
  }
  if (state.masterSection === "kategorien") {
    return renderSimpleTable([t("labels.category"), t("labels.type"), t("labels.status")], data.kategorien.map((category) => [category.name, category.typ, t(`status.${category.status}`)]));
  }
  return renderAccountTable();
}

function renderSimpleTable(headers, rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function transferChecks() {
  return (data.transfers || []).map((transfer) => {
    const abgang = transaktionenById.get(transfer.abgang_transaktion_id);
    const zugang = transaktionenById.get(transfer.zugang_transaktion_id);
    const ok =
      !!abgang &&
      !!zugang &&
      abgang.ist_transfer === true &&
      zugang.ist_transfer === true &&
      abgang.transfer_id === transfer.transfer_id &&
      zugang.transfer_id === transfer.transfer_id;
    return { transfer_id: transfer.transfer_id, betrag: transfer.betrag, ok };
  });
}

function renderChecks() {
  const transferResults = transferChecks();
  const m5 = computeVermoegenChecks(data, localTodayIso());
  const groups = [
    [t("checksPage.validation"), data.checks.filter((check) => check.scope === "datenstand")],
    [t("checksPage.categories"), data.checks.filter((check) => check.scope === "transaktion")],
    [t("checksPage.accountReferences"), data.checks.filter((check) => check.scope === "konto")],
    [t("checksPage.transfers"), transferResults.map((tc) => ({ severity: tc.ok ? "success" : "review" }))],
    [t("nav.vermoegen"), m5.map(() => ({ severity: "review" }))],
  ];
  return `
    ${renderPageHead(t("checksPage.title"), t("checksPage.lead"))}
    <div class="tile-grid">
      ${groups.map(([label, checks]) => `
        <div class="tile tile-static">
          <strong>${escapeHtml(label)}</strong>
          <div class="count">${checks.length}</div>
          <span class="chip ${checks.some((check) => check.severity === "review") ? "review" : "success"}">${checks.some((check) => check.severity === "review") ? iconSvg("review") : iconSvg("success")}${escapeHtml(checks.some((check) => check.severity === "review") ? t("status.review") : t("status.success"))}</span>
        </div>
      `).join("")}
    </div>
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(t("checksPage.title"))}</h2>
      <div class="rail-list">${renderCheckItems(data.checks)}</div>
    </section>
    ${(data.importfehler?.length ?? 0) > 0 ? `
      <section class="panel panel-pad section-spacing">
        <h2 class="section-title">${escapeHtml(t("checksPage.importErrors"))}</h2>
        <p class="page-lead">${escapeHtml(t("checksPage.importErrorsLead"))}</p>
        <div class="rail-list">
          ${data.importfehler.map((fehler) => `
            <div class="rail-item">
              <span class="chip danger">${iconSvg("warning")}${escapeHtml(fehler.reason)}</span>
              <span>${escapeHtml(fehler.rohquelle)} · ${escapeHtml(t("labels.row"))} ${escapeHtml(String(fehler.row ?? "-"))}</span>
              <span class="muted">${escapeHtml(fehler.detail)}</span>
            </div>
          `).join("")}
        </div>
      </section>
    ` : ""}
    ${transferResults.length > 0 ? `
      <section class="panel panel-pad section-spacing">
        <h2 class="section-title">${escapeHtml(t("checksPage.transfers"))}</h2>
        <p class="page-lead">${escapeHtml(t("checksPage.transfersLead"))}</p>
        <div class="rail-list">
          ${transferResults.map((tc) => `
            <div class="rail-item">
              <span class="chip ${tc.ok ? "success" : "review"}">${tc.ok ? iconSvg("success") : iconSvg("review")}${escapeHtml(tc.ok ? t("checksPage.transferOk") : t("checksPage.transferIncomplete"))}</span>
              <span>${escapeHtml(tc.transfer_id)} · ${escapeHtml(formatMoney(cents(tc.betrag)))}</span>
            </div>
          `).join("")}
        </div>
      </section>
    ` : ""}
    ${m5.length > 0 ? `
      <section class="panel panel-pad section-spacing">
        <h2 class="section-title">${escapeHtml(t("nav.vermoegen"))}</h2>
        <div class="rail-list">
          ${m5.map((check) => `
            <div class="rail-item">
              <span class="chip review">${iconSvg("review")}${escapeHtml(t(`vermoegen.checkArt.${check.art}`))}</span>
              <button class="linkish" data-action="open-vermoegen-entity" data-vklasse="${escapeHtml(check.entitaet)}" data-vid="${escapeHtml(check.entitaet_id)}">${escapeHtml(check.entitaet_id)}</button>
              <span class="muted">${escapeHtml(check.text)}</span>
            </div>
          `).join("")}
        </div>
      </section>
    ` : ""}
  `;
}

function renderCheckItems(checks) {
  return checks.map((check) => {
    const title = t(check.title_key);
    const detail = t(check.detail_key);
    const affected = check.entity_id ? affectedLabel(check) : data.metadata.label;
    return `
      <div class="rail-item">
        <span class="chip ${check.severity === "success" ? "success" : "review"}">${check.severity === "success" ? iconSvg("success") : iconSvg("review")}${escapeHtml(title)}</span>
        <button class="linkish" data-action="open-entity" data-scope="${escapeHtml(check.scope)}" data-entity="${escapeHtml(check.entity_id || "")}">${escapeHtml(affected)}</button>
        <span class="muted">${escapeHtml(detail)}</span>
      </div>
    `;
  }).join("");
}

function affectedLabel(check) {
  if (check.scope === "konto") return kontenById.get(check.entity_id)?.name || check.entity_id;
  if (check.scope === "transaktion") {
    const tx = transaktionenById.get(check.entity_id);
    return tx ? `${tx.buchungsdatum} · ${tx.gegenpartei}` : check.entity_id;
  }
  return check.entity_id;
}

function renderExport() {
  return `
    ${renderPageHead(t("exportPage.title"), t("exportPage.lead"))}
    <section class="panel empty-state">
      <div>
        <h2>${escapeHtml(t("exportPage.lead"))}</h2>
        <p class="page-lead">${escapeHtml(t("exportPage.body"))}</p>
      </div>
    </section>
  `;
}

app.addEventListener("click", (event) => {
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

  const action = event.target.closest("[data-action]");
  if (action) {
    handleAction(action);
    return;
  }

  const masterSection = event.target.closest("[data-master-section]");
  if (masterSection) {
    state.masterSection = masterSection.dataset.masterSection;
    commitNavigation();
  }
});

// Tastatur-Aktivierung fuer fokussierbare, nicht-native Bedienelemente
// (z. B. auswaehlbare Tabellenzellen/-zeilen mit tabindex="0" + data-action).
// Native Buttons/Links/Inputs bringen Enter/Space selbst mit.
const KEY_ACTIVATION_SELECTOR = "[data-action], [data-view], [data-master-section], [data-liquiditaet-toggle], [data-liquiditaet-gran], [data-vermoegen-sort]";
app.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
  const el = event.target;
  if (!el || typeof el.matches !== "function") return;
  if (el.matches("button, a, input, select, textarea")) return;
  if (el.getAttribute("tabindex") == null) return;
  if (!el.matches(KEY_ACTIVATION_SELECTOR)) return;
  event.preventDefault();
  el.click();
});

// Live-Suche: Textfilter wirken pro Tastendruck; Fokus/Cursor uebersteht das
// Re-Render via captureFocus/restoreFocus (Selektor ueber die id des Inputs).
app.addEventListener("input", (event) => {
  const filter = event.target.closest("input[data-filter]");
  if (!filter) return;
  state.transactionFilters[filter.dataset.filter] = filter.value;
  state.transactionPage = 1;
  render();
});

app.addEventListener("change", (event) => {
  const control = event.target.closest("[data-control]");
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
});

function handleAction(element) {
  const action = element.dataset.action;
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
  if (action === "filter-open-category" || action === "next-action") {
    state.view = "transactions";
    state.transactionFilters.status = "offen";
    state.transactionFilters.account = "";
    state.transactionFilters.category = "";
    state.transactionFilters.transfer = "";
    state.transactionFilters.search = "";
    clearTransactionTimeFilter();
    state.transactionPage = 1;
    state.selectedTransactionId = openCategoryTransactions()[0]?.transaktion_id || state.selectedTransactionId;
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
    state.selectedTransactionId = data.transaktionen.find((tx) => tx.konto_id === element.dataset.account)?.transaktion_id || "";
    commitNavigation();
    return;
  }
  if (action === "select-transaction") {
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
    selectedVermoegenId: state.selectedVermoegenId,
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
  state.selectedVermoegenId = snapshot.selectedVermoegenId || "";
  state.vermoegenRailMode = snapshot.vermoegenRailMode || "position";
  state.vermoegenRailWide = Boolean(snapshot.vermoegenRailWide);
}

// Neuer History-Eintrag nur bei echtem View-Wechsel. Zustandsaenderungen
// innerhalb einer View (Filter, Seite, Auswahl) ersetzen den aktuellen Eintrag,
// damit der Zurueck-Button nicht durch jeden Klick zugemuellt wird.
let lastCommittedView = state.view;
function commitNavigation() {
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

import { computeLiquiditaetIst, computeLiquiditaetPrognoseDetail, defaultHorizonEnd, naechsteFaelligkeit, localTodayIso } from "./liquiditaet.mjs";
import { formatIban, matchesQuery } from "./tools/lib/text.mjs";
import { iconSvg } from "./icons.js";
import { computeNettovermoegen, computeVermoegenChecks, aktuellerZeitwert, anteilWertCents, restschuldHeute } from "./vermoegen.mjs";
import { routeFromState, parseRoute } from "./routing.mjs";
import {
  app, data, state, storageKeys, navItems, TABBAR_VIEWS,
  personenById, kontenById, kategorienById, transaktionenById, transfersById,
  t, escapeHtml, cents,
} from "./runtime.mjs";
import {
  formatMoney, formatDate, formatMonth, accountOwnerNames, accountTypeLabel, categoryName,
  statusChip, renderPageHead, detailRow, heuteIso, saldoLinie, renderTableFilters, renderFilterSelect,
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

function transactionSearchFields(tx) {
  return [
    tx.gegenpartei,
    tx.verwendungszweck,
    tx.empfaenger,
    tx.empfaenger_iban,
    tx.transaktion_id,
    tx.betrag,
    String(tx.betrag ?? "").replace(".", ","),
    kontenById.get(tx.konto_id)?.name,
    tx.kategorie_id ? categoryName(tx.kategorie_id) : "",
    tx.kundenreferenz,
    tx.mandatsreferenz,
    tx.bank_referenz,
  ];
}

function filteredTransactions() {
  return data.transaktionen.filter((tx) => {
    if (state.transactionFilters.account && tx.konto_id !== state.transactionFilters.account) return false;
    if (state.transactionFilters.status && tx.kategorisierung_status !== state.transactionFilters.status) return false;
    if (state.transactionFilters.category && tx.kategorie_id !== state.transactionFilters.category) return false;
    if (state.transactionFilters.transfer === "only" && !tx.ist_transfer) return false;
    if (state.transactionFilters.transfer === "without" && tx.ist_transfer) return false;
    if (!transactionMatchesTimeFilter(tx)) return false;
    if (state.transactionFilters.search && !matchesQuery(transactionSearchFields(tx), state.transactionFilters.search)) return false;
    return true;
  }).sort((a, b) => b.buchungsdatum.localeCompare(a.buchungsdatum));
}

function transactionMatchesTimeFilter(tx) {
  const date = tx.buchungsdatum;
  const filters = state.transactionFilters;
  if (!date || filters.timeMode === "none") return true;
  if (filters.timeMode === "range") {
    if (filters.dateFrom && date < filters.dateFrom) return false;
    if (filters.dateTo && date > filters.dateTo) return false;
    return true;
  }
  if (filters.timeMode === "month") {
    return !filters.month || date.startsWith(filters.month);
  }
  if (filters.timeMode === "quarter") {
    if (!filters.quarterYear) return true;
    const month = Number(date.slice(5, 7));
    const quarter = Math.ceil(month / 3);
    return date.startsWith(`${filters.quarterYear}-`) && String(quarter) === filters.quarter;
  }
  if (filters.timeMode === "year") {
    return !filters.year || date.startsWith(`${filters.year}-`);
  }
  return true;
}

function renderTransactions() {
  const allRows = filteredTransactions();
  const pageCount = Math.max(1, Math.ceil(allRows.length / state.pageSize));
  state.transactionPage = Math.min(Math.max(1, state.transactionPage), pageCount);
  const pageStart = (state.transactionPage - 1) * state.pageSize;
  const rows = allRows.slice(pageStart, pageStart + state.pageSize);
  const inFilter = state.selectedTransactionId && allRows.some((tx) => tx.transaktion_id === state.selectedTransactionId);
  if (!inFilter) {
    state.selectedTransactionId = rows[0]?.transaktion_id || allRows[0]?.transaktion_id || "";
  }
  const selectedInFilter = transaktionenById.get(state.selectedTransactionId);
  const filterBalance = allRows.reduce((sum, tx) => sum + cents(tx.betrag), 0);
  const openCount = allRows.filter((tx) => tx.kategorisierung_status === "offen").length;
  const accountName = state.transactionFilters.account ? kontenById.get(state.transactionFilters.account)?.name : "";
  const breadcrumb = renderBreadcrumb(accountName);

  return `
    ${renderPageHead(t("transactions.title"), "", breadcrumb)}
    <div class="layout-with-rail ${state.detailRailClosed ? "rail-closed" : ""}">
      <div class="stack">
        <section class="summary-strip">
          <div class="summary-cell"><span class="muted">${escapeHtml(t("transactions.hits"))}</span><strong>${allRows.length}</strong></div>
          <div class="summary-cell"><span class="muted">${escapeHtml(t("transactions.filteredBalance"))}</span><strong>${escapeHtml(formatMoney(filterBalance))}</strong></div>
          <div class="summary-cell"><span class="muted">${escapeHtml(t("chrome.categoryOpen"))}</span><strong>${openCount}</strong></div>
        </section>
        ${renderTransactionFilters()}
        <section class="panel">
          ${renderTransactionTableToolbar()}
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>${escapeHtml(t("labels.date"))}</th>
                  <th>${escapeHtml(t("labels.account"))}</th>
                  <th>${escapeHtml(t("labels.counterparty"))}</th>
                  <th>${escapeHtml(t("labels.purpose"))}</th>
                  <th class="amount">${escapeHtml(t("labels.amount"))}</th>
                  <th>${escapeHtml(t("labels.category"))}</th>
                  <th>${escapeHtml(t("labels.status"))}</th>
                  <th>${escapeHtml(t("labels.transfer"))}</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((tx) => renderTransactionRow(tx)).join("")}
              </tbody>
            </table>
          </div>
          ${renderPagination(allRows.length, pageCount)}
        </section>
      </div>
      ${state.detailRailClosed ? "" : `
        <aside class="panel panel-pad detail-panel">
          <div class="detail-head">
            <h2 class="section-title">${escapeHtml(t("transactions.details"))}</h2>
            <button class="icon-button" data-action="close-detail-rail" aria-label="${escapeHtml(t("chrome.closeDetails"))}" title="${escapeHtml(t("chrome.closeDetails"))}">${iconSvg("close")}</button>
          </div>
          ${selectedInFilter ? renderTransactionDetail(selectedInFilter) : `<p>${escapeHtml(t("transactions.noSelection"))}</p>`}
        </aside>
      `}
    </div>
  `;
}

function renderTransactionTableToolbar() {
  return `
    <div class="table-toolbar">
      <label class="table-page-size">
        <span>${escapeHtml(t("transactions.rowsPerPage"))}</span>
        <select data-filter="pageSize" aria-label="${escapeHtml(t("transactions.rowsPerPage"))}">
          ${[["10", "10"], ["20", "20"], ["50", "50"], ["100", "100"]].map(([value, label]) => `<option value="${value}" ${String(state.pageSize) === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}

function renderPagination(totalRows, pageCount) {
  const from = totalRows === 0 ? 0 : (state.transactionPage - 1) * state.pageSize + 1;
  const to = Math.min(totalRows, state.transactionPage * state.pageSize);
  const items = paginationItems(state.transactionPage, pageCount);
  return `
    <div class="pagination">
      <span>${escapeHtml(t("transactions.page"))} ${state.transactionPage} / ${pageCount} · ${from}-${to} ${escapeHtml(t("transactions.of"))} ${totalRows}</span>
      <div class="pagination-actions">
        <button class="pager-button" data-action="page-first" ${state.transactionPage === 1 ? "disabled" : ""}>${escapeHtml(t("transactions.firstPage"))}</button>
        <button class="pager-button" data-action="page-prev" ${state.transactionPage === 1 ? "disabled" : ""}>${escapeHtml(t("transactions.previousPage"))}</button>
        <div class="pagination-pages" aria-label="${escapeHtml(t("transactions.pageJumps"))}">
          ${items.map((item) => item === "ellipsis"
            ? `<span class="pagination-ellipsis">…</span>`
            : `<button class="page-number ${item === state.transactionPage ? "active" : ""}" data-action="page-jump" data-page="${item}" ${item === state.transactionPage ? "aria-current=\"page\"" : ""}>${item}</button>`).join("")}
        </div>
        <button class="pager-button" data-action="page-next" ${state.transactionPage === pageCount ? "disabled" : ""}>${escapeHtml(t("transactions.nextPage"))}</button>
        <button class="pager-button" data-action="page-last" ${state.transactionPage === pageCount ? "disabled" : ""}>${escapeHtml(t("transactions.lastPage"))}</button>
      </div>
    </div>
  `;
}

function paginationItems(currentPage, pageCount) {
  const pages = new Set([1, pageCount]);
  for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
    if (page >= 1 && page <= pageCount) pages.add(page);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((page, index) => {
    if (index === 0) return [page];
    const previous = sorted[index - 1];
    return page - previous > 1 ? ["ellipsis", page] : [page];
  });
}

function renderBreadcrumb(accountName) {
  if (!accountName) {
    return `<div class="breadcrumb"><button class="linkish" data-action="go-overview">${escapeHtml(t("overview.title"))}</button><span>/</span><span>${escapeHtml(t("transactions.title"))}</span></div>`;
  }
  return `
    <div class="breadcrumb">
      <button class="linkish" data-action="go-overview">${escapeHtml(t("overview.title"))}</button>
      <span>/</span>
      <button class="linkish" data-action="open-account-master">${escapeHtml(accountName)}</button>
      <span>/</span>
      <span>${escapeHtml(t("transactions.title"))}</span>
    </div>
  `;
}

function renderTransactionFilters() {
  return renderTableFilters({
    searchFields: [
      {
        name: "search",
        type: "search",
        label: t("transactions.filterSearch"),
        placeholder: t("transactions.searchPlaceholder"),
      },
    ],
    timeFields: transactionTimeFilterFields(),
    fields: [
      {
        name: "account",
        label: t("transactions.filterAccount"),
        options: [
        ["", t("transactions.allAccounts")],
        ...data.konten.map((konto) => [konto.konto_id, konto.name]),
        ],
      },
      {
        name: "status",
        label: t("transactions.filterStatus"),
        options: [
        ["", t("transactions.allStatuses")],
        ["offen", t("status.offen")],
        ["vorgeschlagen", t("status.vorgeschlagen")],
        ["bestaetigt", t("status.bestaetigt")],
        ["abgelehnt", t("status.abgelehnt")],
        ],
      },
      {
        name: "category",
        label: t("transactions.filterCategory"),
        options: [
        ["", t("transactions.allCategories")],
        ...data.kategorien.map((kategorie) => [kategorie.kategorie_id, kategorie.name]),
        ],
      },
      {
        name: "transfer",
        label: t("transactions.filterTransfer"),
        options: [
        ["", t("transactions.allTransfers")],
        ["only", t("transactions.onlyTransfers")],
        ["without", t("transactions.withoutTransfers")],
        ],
      },
    ],
    filters: state.transactionFilters,
    filterAttr: "filter",
    clearAction: "clear-transaction-filter",
    resetAction: "reset-transaction-filters",
    activeCount: transactionFilterActiveCount(),
  });
}

function hasActiveFilters(filters) {
  return Object.values(filters).some(Boolean);
}

function transactionTimeFilterFields() {
  const filters = state.transactionFilters;
  const fields = [
    {
      name: "timeMode",
      label: t("transactions.filterTime"),
      options: [
        ["none", t("transactions.timeModeAll")],
        ["range", t("transactions.timeModeRange")],
        ["month", t("transactions.timeModeMonth")],
        ["quarter", t("transactions.timeModeQuarter")],
        ["year", t("transactions.timeModeYear")],
      ],
    },
  ];
  if (filters.timeMode === "range") {
    fields.push(
      { name: "dateFrom", type: "date", label: t("transactions.dateFrom") },
      { name: "dateTo", type: "date", label: t("transactions.dateTo") },
    );
  }
  if (filters.timeMode === "month") {
    fields.push({
      name: "month",
      label: t("transactions.month"),
      options: transactionMonthOptions(),
    });
  }
  if (filters.timeMode === "quarter") {
    fields.push(
      {
        name: "quarterYear",
        label: t("transactions.year"),
        options: transactionYearOptions(),
      },
      {
        name: "quarter",
        label: t("transactions.quarter"),
        options: ["1", "2", "3", "4"].map((quarter) => [quarter, `Q${quarter}`]),
      },
    );
  }
  if (filters.timeMode === "year") {
    fields.push({
      name: "year",
      label: t("transactions.year"),
      options: transactionYearOptions(),
    });
  }
  return fields;
}

function transactionMonthOptions() {
  return distinctTransactionDateParts(0, 7).map((month) => [month, formatMonth(month)]);
}

function transactionYearOptions() {
  return [
    ["", t("transactions.allYears")],
    ...distinctTransactionDateParts(0, 4).map((year) => [year, year]),
  ];
}

function distinctTransactionDateParts(start, end) {
  return [...new Set(data.transaktionen
    .map((tx) => String(tx.buchungsdatum ?? "").slice(start, end))
    .filter((value) => value.length === end - start))]
    .sort((a, b) => b.localeCompare(a));
}

function applyTransactionTimeModeDefaults(mode) {
  if (mode === "none") {
    clearTransactionTimeFilter();
    return;
  }
  if (mode === "month" && !state.transactionFilters.month) {
    state.transactionFilters.month = transactionMonthOptions()[0]?.[0] || "";
  }
  if (mode === "quarter" && !state.transactionFilters.quarterYear) {
    const latestMonth = distinctTransactionDateParts(0, 7)[0] || "";
    state.transactionFilters.quarterYear = latestMonth.slice(0, 4) || transactionYearOptions()[1]?.[0] || "";
    state.transactionFilters.quarter = latestMonth ? String(Math.ceil(Number(latestMonth.slice(5, 7)) / 3)) : "1";
  }
  if (mode === "year" && !state.transactionFilters.year) {
    state.transactionFilters.year = transactionYearOptions()[1]?.[0] || "";
  }
}

function transactionFilterActiveCount() {
  const filters = state.transactionFilters;
  const regular = ["account", "status", "category", "transfer", "search"].filter((name) => Boolean(filters[name])).length;
  return regular + (transactionTimeFilterIsActive() ? 1 : 0);
}

function transactionTimeFilterIsActive() {
  const filters = state.transactionFilters;
  if (filters.timeMode === "range") return Boolean(filters.dateFrom || filters.dateTo);
  if (filters.timeMode === "month") return Boolean(filters.month);
  if (filters.timeMode === "quarter") return Boolean(filters.quarterYear);
  if (filters.timeMode === "year") return Boolean(filters.year);
  return false;
}

function renderTransactionRow(tx) {
  const konto = kontenById.get(tx.konto_id);
  const category = tx.kategorie_id ? categoryName(tx.kategorie_id) : t("labels.noCategory");
  const selectAttrs = `data-action="select-transaction" data-transaction="${escapeHtml(tx.transaktion_id)}"`;
  return `
    <tr class="transaction-row ${tx.transaktion_id === state.selectedTransactionId ? "selected" : ""} ${tx.kategorisierung_status === "offen" ? "open" : ""}">
      <td class="row-select-cell" tabindex="0" ${selectAttrs}>${escapeHtml(formatDate(tx.buchungsdatum))}</td>
      <td><button class="linkish" data-action="open-account-master" data-account="${escapeHtml(tx.konto_id)}">${escapeHtml(konto?.name || tx.konto_id)}</button></td>
      <td class="row-select-cell" tabindex="0" ${selectAttrs}>${escapeHtml(tx.gegenpartei)}</td>
      <td class="row-select-cell" tabindex="0" ${selectAttrs}>${escapeHtml(tx.verwendungszweck)}</td>
      <td class="amount row-select-cell" tabindex="0" ${selectAttrs}>${escapeHtml(formatMoney(cents(tx.betrag)))}</td>
      <td class="row-select-cell" tabindex="0" ${selectAttrs}>${escapeHtml(category)}</td>
      <td class="row-select-cell" tabindex="0" ${selectAttrs}>${statusChip(tx.kategorisierung_status)}</td>
      ${renderTransferCell(tx)}
    </tr>
  `;
}

function renderTransferCell(tx) {
  if (!tx.ist_transfer) return `<td><span class="muted">${escapeHtml(t("labels.no"))}</span></td>`;
  const paired = pairedTransferTransaction(tx);
  if (!paired) return `<td><span class="chip neutral">${iconSvg("transfer")}${escapeHtml(t("labels.yes"))}</span></td>`;
  return `<td class="transfer-link-cell" data-action="paired-transfer" data-transaction="${escapeHtml(paired.transaktion_id)}" title="${escapeHtml(t("transactions.pairedTransfer"))}"><span class="chip neutral linkish transfer-anchor">${iconSvg("transfer")}${escapeHtml(t("labels.yes"))}</span></td>`;
}

function pairedTransferTransaction(tx) {
  const transfer = tx.transfer_id ? transfersById.get(tx.transfer_id) : undefined;
  if (!transfer) return undefined;
  const pairedId = transfer.abgang_transaktion_id === tx.transaktion_id
    ? transfer.zugang_transaktion_id
    : transfer.abgang_transaktion_id;
  return pairedId ? transaktionenById.get(pairedId) : undefined;
}

function renderTransactionDetail(tx) {
  const konto = kontenById.get(tx.konto_id);
  const paired = pairedTransferTransaction(tx);
  const bankDetails = [
    [t("transactions.bankReference"), tx.bank_referenz],
    [t("transactions.valueDate"), tx.wertstellungsdatum, "date"],
    [t("transactions.transactionType"), tx.transaktionstyp],
    [t("transactions.customerReference"), tx.kundenreferenz],
    [t("transactions.recipient"), tx.empfaenger],
    [transactionIbanLabel(tx), formatIban(tx.empfaenger_iban)],
    [t("transactions.mandateReference"), tx.mandatsreferenz],
    [t("transactions.creditorId"), tx.glaeubiger_id],
  ].filter(([, value]) => hasDetailValue(value));
  return `
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t("transactions.booking"))}</div>
      <div class="detail-value">
        <strong>${escapeHtml(formatMoney(cents(tx.betrag)))}</strong><br>
        ${escapeHtml(formatDate(tx.buchungsdatum))}
        ${tx.wertstellungsdatum ? `<span class="muted"> · ${escapeHtml(t("transactions.valueDateShort"))} ${escapeHtml(formatDate(tx.wertstellungsdatum))}</span>` : ""}<br>
        ${escapeHtml(tx.gegenpartei)}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t("labels.account"))}</div>
      <div class="detail-value">
        <button class="linkish" data-action="open-account-master" data-account="${escapeHtml(tx.konto_id)}">${escapeHtml(konto?.name || tx.konto_id)}</button>
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t("transactions.coreData"))}</div>
      <div class="detail-list">
        ${transactionDetailRow(t("labels.date"), formatDate(tx.buchungsdatum))}
        ${transactionDetailRow(t("labels.counterparty"), tx.gegenpartei)}
        ${transactionDetailRow(t("labels.purpose"), tx.verwendungszweck)}
        ${transactionDetailRow(t("labels.amount"), formatMoney(cents(tx.betrag)))}
        ${transactionDetailRow(t("transactions.transactionId"), tx.transaktion_id)}
      </div>
    </div>
    ${bankDetails.length ? `
      <div class="detail-section">
        <div class="detail-label">${escapeHtml(t("transactions.bankDetails"))}</div>
        <div class="detail-list">
          ${bankDetails.map(([label, value, format]) => transactionDetailRow(label, format === "date" ? formatDate(value) : value)).join("")}
        </div>
      </div>
    ` : ""}
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t("labels.category"))}</div>
      <div class="detail-value">${escapeHtml(tx.kategorie_id ? categoryName(tx.kategorie_id) : t("labels.noCategory"))}<br>${statusChip(tx.kategorisierung_status)}</div>
    </div>
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t("transactions.rawSource"))}</div>
      <div class="detail-value muted">${escapeHtml(tx.rohquelle)}</div>
    </div>
    ${paired ? `
      <div class="detail-section">
        <div class="detail-label">${escapeHtml(t("labels.transfer"))}</div>
        <button class="linkish" data-action="paired-transfer" data-transaction="${escapeHtml(paired.transaktion_id)}">${escapeHtml(t("transactions.pairedTransfer"))}</button>
      </div>
    ` : ""}
    <div class="detail-section">
      <button class="linkish" data-action="show-checks-for" data-entity="${escapeHtml(tx.transaktion_id)}">${escapeHtml(t("transactions.showInChecks"))}</button>
    </div>
  `;
}

function hasDetailValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function transactionIbanLabel(tx) {
  return tx.transaktionstyp === "Eingang" ? t("transactions.senderIban") : t("transactions.recipientIban");
}

function transactionDetailRow(label, value) {
  return `
    <div class="detail-list-row">
      <span class="detail-list-label">${escapeHtml(label)}</span>
      <span class="detail-list-value">${escapeHtml(value)}</span>
    </div>
  `;
}

// Prognose-Saldo je erwartetem Termin als flache Punktserie (Startsaldo + jeder Posten).
function prognosePunkte(prognose) {
  const punkte = [{ wert: prognose.start_saldo_cents }];
  for (const periode of prognose.perioden) {
    for (const monat of periode.monate) {
      for (const posten of monat.posten) punkte.push({ wert: posten.saldo_cents });
    }
  }
  return punkte;
}

function renderSaldoVerlauf(verlauf, emptyKey) {
  if (!verlauf.length) return `<p class="muted">${escapeHtml(t(emptyKey))}</p>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(t("labels.date"))}</th>
            <th class="amount">${escapeHtml(t("liquiditaet.movement"))}</th>
            <th class="amount">${escapeHtml(t("liquiditaet.balance"))}</th>
          </tr>
        </thead>
        <tbody>
          ${verlauf.map((punkt) => `
            <tr>
              <td>${escapeHtml(formatDate(punkt.datum))}${punkt.bezeichnung ? ` · ${escapeHtml(punkt.bezeichnung)}` : ""}</td>
              <td class="amount">${escapeHtml(formatMoney(punkt.bewegung_cents))}</td>
              <td class="amount">${escapeHtml(formatMoney(punkt.saldo_cents))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderLiquiditaet() {
  const today = heuteIso();
  const ist = computeLiquiditaetIst(data, { today });
  const prognose = computeLiquiditaetPrognoseDetail(data, {
    today,
    horizonEnd: state.liquiditaet.bisDatum,
    granularitaet: state.liquiditaet.granularitaet,
  });
  const istChipClass = ist.qualitaet.fehlende_anker > 0 ? "review" : "success";
  const istChipIcon = ist.qualitaet.fehlende_anker > 0 ? iconSvg("review") : iconSvg("success");
  const vorschlaegeChip = prognose.qualitaet.vorschlaege_nicht_enthalten > 0
    ? `<span class="chip review">${iconSvg("review")}${escapeHtml(String(prognose.qualitaet.vorschlaege_nicht_enthalten))} ${escapeHtml(t("liquiditaet.qualityProposalsExcluded"))}</span>`
    : "";
  const unbefristetChip = prognose.qualitaet.unbefristete_regelzahlungen > 0
    ? `<span class="chip neutral">${escapeHtml(String(prognose.qualitaet.unbefristete_regelzahlungen))} ${escapeHtml(t("liquiditaet.qualityOpenEnded"))}</span>`
    : "";
  const granButtons = ["monat", "quartal", "jahr"]
    .map((g) => `<button class="chip ${state.liquiditaet.granularitaet === g ? "success" : "neutral"} linkish" data-liquiditaet-gran="${g}">${escapeHtml(t(`liquiditaet.gran.${g}`))}</button>`)
    .join("");
  return `
    ${renderPageHead(t("liquiditaet.title"), t("liquiditaet.lead"))}
    <div class="tile-grid">
      <div class="tile tile-static">
        <strong>${escapeHtml(t("liquiditaet.ist"))}</strong>
        <div class="count">${escapeHtml(formatMoney(ist.saldo_cents))}</div>
        <span class="chip ${istChipClass}">${istChipIcon}${escapeHtml(String(ist.qualitaet.fehlende_anker))} ${escapeHtml(t("liquiditaet.qualityMissingAnchors"))}</span>
      </div>
      <div class="tile tile-static">
        <strong>${escapeHtml(t("liquiditaet.prognose"))}</strong>
        <div class="count">${escapeHtml(formatMoney(prognose.end_saldo_cents))}</div>
        <span class="chip neutral">${escapeHtml(String(prognose.qualitaet.bestaetigte_regelzahlungen))} ${escapeHtml(t("liquiditaet.qualityConfirmed"))}</span>
        ${vorschlaegeChip}
        ${unbefristetChip}
        <span class="chip neutral">${escapeHtml(t("liquiditaet.horizonTo"))} ${escapeHtml(prognose.horizont_ende)}</span>
      </div>
    </div>
    <p class="page-lead section-note">${escapeHtml(t("liquiditaet.incompleteNote"))}</p>
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(t("liquiditaet.ist"))} · ${escapeHtml(t("liquiditaet.monthlyTable"))}</h2>
      ${saldoLinie(ist.monatsverlauf.map((p) => ({ wert: p.saldo_cents })), `${t("liquiditaet.balance")}: ${formatMoney(ist.monatsverlauf.at(0)?.saldo_cents ?? 0)} → ${formatMoney(ist.monatsverlauf.at(-1)?.saldo_cents ?? 0)}`)}
      ${renderSaldoVerlauf(ist.monatsverlauf, "liquiditaet.emptyIst")}
    </section>
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(t("liquiditaet.prognose"))} · ${escapeHtml(t("liquiditaet.forecastTable"))}</h2>
      <div class="liquiditaet-filter">
        <span>${granButtons}</span>
        <label class="liquiditaet-bis">${escapeHtml(t("liquiditaet.forecastUntil"))}
          <input type="date" data-control="liquiditaet-bis" value="${escapeHtml(state.liquiditaet.bisDatum)}" />
        </label>
      </div>
      ${saldoLinie(prognosePunkte(prognose), `${t("liquiditaet.prognose")}: ${formatMoney(prognose.start_saldo_cents)} → ${formatMoney(prognose.end_saldo_cents)}`)}
      ${renderLiquiditaetPrognoseDetail(prognose)}
    </section>
  `;
}

function formatMonat(monat) {
  return new Intl.DateTimeFormat(state.lang === "de" ? "de-DE" : "en-US", { month: "long", year: "numeric" }).format(new Date(`${monat}-01T00:00:00`));
}

function formatPeriode(periode) {
  if (periode.includes("-Q")) {
    const [jahr, q] = periode.split("-");
    return `${q} ${jahr}`;
  }
  if (/^\d{4}$/.test(periode)) return periode;
  return formatMonat(periode);
}

function laufendMarkup(istLaufend) {
  if (!istLaufend) return "";
  return `<span class="chip neutral">${escapeHtml(t("liquiditaet.running"))}</span><div class="running-note muted">${escapeHtml(t("liquiditaet.runningNote"))}</div>`;
}

function renderLiquiditaetPostenRows(posten) {
  return posten.map((p) => `
    <tr class="row-posten">
      <td class="posten-cell">${escapeHtml(formatDate(p.datum))} · ${escapeHtml(p.bezeichnung)}</td>
      <td class="amount">${escapeHtml(formatMoney(p.bewegung_cents))}</td>
      <td class="amount">${escapeHtml(formatMoney(p.saldo_cents))}</td>
    </tr>
  `).join("");
}

function renderLiquiditaetMonatRows(monat, nested) {
  const expanded = state.liquiditaetExpanded.has(monat.monat);
  const monthRow = `
    <tr class="row-month ${nested ? "nested" : ""}">
      <td>
        <button class="row-toggle" data-liquiditaet-toggle="${escapeHtml(monat.monat)}">
          <span class="toggle-icon">${expanded ? iconSvg("chevronDown") : iconSvg("chevronRight")}</span>${escapeHtml(formatMonat(monat.monat))}
        </button>
        ${laufendMarkup(monat.ist_laufend)}
      </td>
      <td class="amount">${escapeHtml(formatMoney(monat.bewegung_cents))}</td>
      <td class="amount">${escapeHtml(formatMoney(monat.saldo_cents))}</td>
    </tr>
  `;
  return monthRow + (expanded ? renderLiquiditaetPostenRows(monat.posten) : "");
}

function renderLiquiditaetPrognoseDetail(prognose) {
  if (!prognose.perioden.length) return `<p class="muted">${escapeHtml(t("liquiditaet.emptyForecast"))}</p>`;
  const gran = state.liquiditaet.granularitaet;
  const body = prognose.perioden.map((periode) => {
    if (gran === "monat") {
      return periode.monate.map((monat) => renderLiquiditaetMonatRows(monat, false)).join("");
    }
    const expanded = state.liquiditaetExpanded.has(periode.periode);
    const periodRow = `
      <tr class="row-period">
        <td>
          <button class="row-toggle" data-liquiditaet-toggle="${escapeHtml(periode.periode)}">
            <span class="toggle-icon">${expanded ? iconSvg("chevronDown") : iconSvg("chevronRight")}</span>${escapeHtml(formatPeriode(periode.periode))}
          </button>
          ${laufendMarkup(periode.ist_laufend)}
        </td>
        <td class="amount">${escapeHtml(formatMoney(periode.bewegung_cents))}</td>
        <td class="amount">${escapeHtml(formatMoney(periode.saldo_cents))}</td>
      </tr>
    `;
    const monatsZeilen = expanded ? periode.monate.map((monat) => renderLiquiditaetMonatRows(monat, true)).join("") : "";
    return periodRow + monatsZeilen;
  }).join("");
  return `
    <div class="table-wrap">
      <table class="liquiditaet-detail">
        <thead>
          <tr>
            <th>${escapeHtml(t("liquiditaet.period"))}</th>
            <th class="amount">${escapeHtml(t("liquiditaet.movement"))}</th>
            <th class="amount">${escapeHtml(t("liquiditaet.balance"))}</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

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

function positionKey(p) {
  return `${p.klasse}:${p.id}`;
}

function entityLabel(entitaet, entitaetId) {
  if (entitaet === "konto") return kontenById.get(entitaetId)?.name || entitaetId;
  if (entitaet === "immobilie") return data.immobilien?.find((i) => i.immobilie_id === entitaetId)?.bezeichnung || entitaetId;
  if (entitaet === "vermoegenswert") return data.vermoegenswerte?.find((v) => v.vermoegenswert_id === entitaetId)?.bezeichnung || entitaetId;
  if (entitaet === "darlehen") return data.darlehen?.find((d) => d.darlehen_id === entitaetId)?.bezeichnung || entitaetId;
  return entitaetId;
}

function zeitwertLabel(zw) {
  const fieldKey = `vermoegen.feld.${zw.feld}`;
  const field = t(fieldKey) === fieldKey ? zw.feld : t(fieldKey);
  return `${entityLabel(zw.entitaet, zw.entitaet_id)} · ${field}`;
}

function filterVermoegenPositions(positionen) {
  const f = state.vermoegenFilters;
  return positionen.filter((p) => {
    if (f.klasse && p.klasse !== f.klasse) return false;
    if (f.qualitaet === "fehlend" && !p.fehlt) return false;
    if (f.qualitaet === "belegt" && p.qualitaet !== "belegt") return false;
    if (f.qualitaet === "geschaetzt" && p.qualitaet !== "geschaetzt") return false;
    return true;
  });
}

function sortVermoegenPositions(positionen) {
  const { key, dir } = state.vermoegenSort;
  const factor = dir === "asc" ? 1 : -1;
  const qualitaetRank = (p) => (p.fehlt ? 2 : p.qualitaet === "geschaetzt" ? 1 : 0);
  return positionen.slice().sort((a, b) => {
    let cmp;
    if (key === "wert") cmp = a.wert_cents - b.wert_cents;
    else if (key === "stand") cmp = String(a.standdatum ?? "").localeCompare(String(b.standdatum ?? ""));
    else if (key === "qualitaet") cmp = qualitaetRank(a) - qualitaetRank(b);
    else if (key === "position") cmp = a.name.localeCompare(b.name);
    else cmp = t(`vermoegen.klasse.${a.klasse}`).localeCompare(t(`vermoegen.klasse.${b.klasse}`));
    if (cmp === 0) cmp = a.name.localeCompare(b.name);
    return cmp * factor;
  });
}

function vermoegenSortIndicator(key) {
  if (state.vermoegenSort.key !== key) return "";
  return state.vermoegenSort.dir === "asc" ? " ▲" : " ▼";
}

function vermoegenSortHeader(key, labelKey, amount = false) {
  return `<th${amount ? ' class="amount"' : ""}><button class="linkish sort-th" data-vermoegen-sort="${key}">${escapeHtml(t(labelKey))}${escapeHtml(vermoegenSortIndicator(key))}</button></th>`;
}

function qualitaetChip(p) {
  if (p.fehlt || !p.qualitaet) return `<span class="chip review">${iconSvg("review")}${escapeHtml(t("vermoegen.qualityFehlend"))}</span>`;
  return `<span class="chip ${p.qualitaet === "belegt" ? "success" : "neutral"}">${p.qualitaet === "belegt" ? iconSvg("success") : ""}${escapeHtml(t(`vermoegen.quality${p.qualitaet === "belegt" ? "Belegt" : "Geschaetzt"}`))}</span>`;
}

// Worst-of-Badge: traegt die schlechteste Qualitaet aller Positionen als eine
// ehrliche Gesamtaussage (belegt < geschaetzt < offen). Quelle: vermoegen.mjs.
function gesamtQualitaetChip(gesamt) {
  if (!gesamt) return "";
  const stil = { belegt: ["success", "success", "Belegt"], geschaetzt: ["neutral", null, "Geschaetzt"], offen: ["review", "review", "Offen"] };
  const [cls, icon, wort] = stil[gesamt];
  return `<span class="chip ${cls}">${icon ? iconSvg(icon) : ""}${escapeHtml(t("vermoegen.qualityOverall"))}: ${escapeHtml(t(`vermoegen.quality${wort}`))}</span>`;
}

function renderVermoegen() {
  const today = localTodayIso();
  const r = computeNettovermoegen(data, today);
  const visible = sortVermoegenPositions(filterVermoegenPositions(r.positionen));
  let selected = visible.find((p) => positionKey(p) === state.selectedVermoegenId);
  if (!selected) selected = visible[0];
  if (selected) state.selectedVermoegenId = positionKey(selected);
  const railWide = state.vermoegenRailWide;

  const rows = visible.map((p) => {
    const key = positionKey(p);
    return `
    <tr class="clickable ${key === state.selectedVermoegenId ? "selected" : ""} ${p.fehlt ? "open" : ""}" data-action="select-vermoegen" data-vermoegen="${escapeHtml(key)}" tabindex="0" role="button" aria-label="${escapeHtml(p.name)}">
      <td>${escapeHtml(t(`vermoegen.klasse.${p.klasse}`))}</td>
      <td>${escapeHtml(p.name)}</td>
      <td class="amount">${p.fehlt ? `<span class="muted">${escapeHtml(t("vermoegen.standOhne"))}</span>` : escapeHtml(formatMoney(p.wert_cents))}</td>
      <td>${p.standdatum ? escapeHtml(formatDate(p.standdatum)) : "—"}</td>
      <td>${qualitaetChip(p)}</td>
    </tr>`;
  }).join("");

  return `
    ${renderPageHead(t("vermoegen.title"), t("vermoegen.lead"))}
    <div class="layout-with-rail ${state.vermoegenDetailRailClosed ? "rail-closed" : ""} ${railWide && !state.vermoegenDetailRailClosed ? "rail-wide" : ""}">
      <div class="stack">
        <div class="tile-grid">
          <div class="tile tile-static">
            <strong>${escapeHtml(t("vermoegen.netto"))}</strong>
            <div class="count">${escapeHtml(formatMoney(r.netto_cents))}</div>
            <div class="kpi-note">${escapeHtml(t("vermoegen.aktiva"))}: ${escapeHtml(formatMoney(r.aktiva_cents))} · ${escapeHtml(t("vermoegen.passiva"))}: ${escapeHtml(formatMoney(r.passiva_cents))}</div>
          </div>
          <div class="tile tile-static">
            <strong>${escapeHtml(t("vermoegen.qualitaetTitle"))}</strong>
            <div class="count">${r.positionen.length}</div>
            ${gesamtQualitaetChip(r.qualitaet.gesamt)}
            <span class="chip success">${iconSvg("success")}${r.qualitaet.belegt} ${escapeHtml(t("vermoegen.qualityBelegt"))}</span>
            <span class="chip neutral">${r.qualitaet.geschaetzt} ${escapeHtml(t("vermoegen.qualityGeschaetzt"))}</span>
            ${r.qualitaet.fehlend > 0 ? `<span class="chip review">${iconSvg("review")}${r.qualitaet.fehlend} ${escapeHtml(t("vermoegen.qualityFehlend"))}</span>` : ""}
          </div>
          <button class="tile ${state.vermoegenRailMode === "wertstaende" ? "active" : ""}" data-action="show-vermoegen-wertstaende">
            <strong>${escapeHtml(t("vermoegen.wertstaende"))}</strong>
            <div class="count">${escapeHtml(String(data.zeitwerte?.length ?? 0))}</div>
            <span class="chip neutral">${escapeHtml(t("vermoegen.allWertstaende"))}</span>
          </button>
        </div>
        <p class="page-lead">${escapeHtml(t("vermoegen.incompleteNote"))}</p>
        ${renderVermoegenFilters()}
        <section class="panel">
          <div class="table-wrap">
            <table>
              <thead><tr>
                ${vermoegenSortHeader("klasse", "vermoegen.klasseHead")}
                ${vermoegenSortHeader("position", "vermoegen.position")}
                ${vermoegenSortHeader("wert", "vermoegen.wert", true)}
                ${vermoegenSortHeader("stand", "vermoegen.stand")}
                ${vermoegenSortHeader("qualitaet", "vermoegen.qualitaetHead")}
              </tr></thead>
              <tbody>${rows || `<tr><td colspan="5" class="muted">${escapeHtml(t("vermoegen.noMatches"))}</td></tr>`}</tbody>
            </table>
          </div>
        </section>
      </div>
      ${state.vermoegenDetailRailClosed ? "" : `
        <aside class="panel panel-pad detail-panel">
          <div class="detail-head">
            <h2 class="section-title">${escapeHtml(state.vermoegenRailMode === "wertstaende" ? t("vermoegen.wertstaende") : t("vermoegen.detailTitle"))}</h2>
            <div class="detail-actions">
              ${state.vermoegenRailMode === "wertstaende" ? `<button class="icon-button" data-action="toggle-vermoegen-rail-width" aria-label="${escapeHtml(railWide ? t("vermoegen.railNarrow") : t("vermoegen.railWide"))}" title="${escapeHtml(railWide ? t("vermoegen.railNarrow") : t("vermoegen.railWide"))}">${iconSvg(railWide ? "chevronRight" : "chevronLeft")}</button>` : ""}
              <button class="icon-button" data-action="close-vermoegen-detail-rail" aria-label="${escapeHtml(t("chrome.closeDetails"))}" title="${escapeHtml(t("chrome.closeDetails"))}">${iconSvg("close")}</button>
            </div>
          </div>
          ${state.vermoegenRailMode === "wertstaende" ? renderWertstaendeRail() : (selected ? renderVermoegenDetail(selected, today) : `<p>${escapeHtml(t("vermoegen.noSelection"))}</p>`)}
        </aside>
      `}
    </div>`;
}

function renderVermoegenFilters() {
  return renderTableFilters({
    fields: [
      {
        name: "klasse",
        label: t("vermoegen.filterKlasse"),
        options: [
        ["", t("vermoegen.filterAll")],
        ["konto", t("vermoegen.klasse.konto")],
        ["immobilie", t("vermoegen.klasse.immobilie")],
        ["vermoegenswert", t("vermoegen.klasse.vermoegenswert")],
        ["darlehen", t("vermoegen.klasse.darlehen")],
        ],
      },
      {
        name: "qualitaet",
        label: t("vermoegen.filterQualitaet"),
        options: [
        ["", t("vermoegen.filterAll")],
        ["belegt", t("vermoegen.qualityBelegt")],
        ["geschaetzt", t("vermoegen.qualityGeschaetzt")],
        ["fehlend", t("vermoegen.qualityFehlend")],
        ],
      },
    ],
    filters: state.vermoegenFilters,
    filterAttr: "vermoegen-filter",
    clearAction: "clear-vermoegen-filter",
    resetAction: "reset-vermoegen-filters",
  });
}

function basisLabel(basis) {
  const key = `vermoegen.basisLabels.${basis}`;
  const text = t(key);
  return text === key ? basis : text;
}

function anteileHtml(eigentumsanteile, marktwertCents) {
  return (eigentumsanteile ?? []).map((a) => {
    const name = a.extern === true || !a.person_id
      ? t("vermoegen.externerAnteil")
      : (personenById.get(a.person_id)?.name || a.person_id);
    const teilCents = a.extern === true || !a.person_id ? 0 : anteilWertCents(marktwertCents, [a]);
    const teil = a.extern === true || !a.person_id ? "—" : formatMoney(teilCents);
    return `<div>${escapeHtml(name)}: <strong>${escapeHtml(String(a.zaehler))}/${escapeHtml(String(a.nenner))}</strong> · ${escapeHtml(teil)}</div>`;
  }).join("");
}

function zeitwerteForPosition(p) {
  if (!p) return [];
  const fieldsByKlasse = {
    konto: ["kontostand", "depotwert"],
    immobilie: ["marktwert"],
    vermoegenswert: ["marktwert"],
    darlehen: ["restschuld"],
  };
  const fields = fieldsByKlasse[p.klasse] ?? [];
  return (data.zeitwerte ?? [])
    .filter((zw) => zw.entitaet === p.klasse && zw.entitaet_id === p.id && fields.includes(zw.feld))
    .sort((a, b) => b.standdatum.localeCompare(a.standdatum) || b.feld.localeCompare(a.feld));
}

function zeitwertQualityChip(zw) {
  return qualitaetChip({ qualitaet: zw.qualitaet, fehlt: false });
}

function renderPositionWertstaende(p) {
  const rows = zeitwerteForPosition(p);
  if (!rows.length) {
    return detailRow(t("vermoegen.wertstaende"), `<span class="muted">${escapeHtml(t("vermoegen.noWertstaende"))}</span>`);
  }
  const html = rows.slice(0, 5).map((zw) => `
    <div class="wertstand-item">
      <div><strong>${escapeHtml(formatMoney(cents(zw.wert)))}</strong> <span class="muted">${escapeHtml(formatDate(zw.standdatum))}</span></div>
      <div>${zeitwertQualityChip(zw)}</div>
      ${zw.quelle_hinweis ? `<div class="muted">${escapeHtml(zw.quelle_hinweis)}</div>` : ""}
    </div>`).join("");
  const more = rows.length > 5
    ? `<button class="linkish" data-action="show-vermoegen-wertstaende">${escapeHtml(t("vermoegen.showAllWertstaende"))}</button>`
    : "";
  return detailRow(t("vermoegen.wertstaende"), `<div class="wertstand-list">${html}${more}</div>`);
}

function renderWertstaendeRail() {
  const rows = (data.zeitwerte ?? [])
    .slice()
    .sort((a, b) => b.standdatum.localeCompare(a.standdatum) || zeitwertLabel(a).localeCompare(zeitwertLabel(b)))
    .map((zw) => `
      <tr>
        <td>${escapeHtml(zeitwertLabel(zw))}<br><span class="muted">${escapeHtml(zw.entitaet_id)}</span></td>
        <td>${escapeHtml(formatDate(zw.standdatum))}</td>
        <td class="amount">${escapeHtml(formatMoney(cents(zw.wert)))}</td>
        <td>${zeitwertQualityChip(zw)}</td>
        <td>${zw.quelle_hinweis ? escapeHtml(zw.quelle_hinweis) : "—"}</td>
      </tr>`).join("");
  return `
    <p class="page-lead">${escapeHtml(t("vermoegen.wertstaendeLead"))}</p>
    <div class="table-wrap wertstaende-table">
      <table>
        <thead><tr>
          <th>${escapeHtml(t("vermoegen.position"))}</th>
          <th>${escapeHtml(t("vermoegen.stand"))}</th>
          <th class="amount">${escapeHtml(t("vermoegen.wert"))}</th>
          <th>${escapeHtml(t("vermoegen.qualitaetHead"))}</th>
          <th>${escapeHtml(t("transactions.rawSource"))}</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="muted">${escapeHtml(t("vermoegen.noWertstaende"))}</td></tr>`}</tbody>
      </table>
    </div>`;
}

function renderVermoegenDetail(p, today) {
  const head = `
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t(`vermoegen.klasse.${p.klasse}`))}</div>
      <div class="detail-value"><strong>${escapeHtml(p.name)}</strong><br>${qualitaetChip(p)}</div>
    </div>`;

  if (p.klasse === "konto") {
    const konto = kontenById.get(p.id);
    const istDepot = konto?.kontotyp === "depot";
    const feld = istDepot ? "depotwert" : "kontostand";
    const zw = aktuellerZeitwert(data.zeitwerte, "konto", p.id, feld);
    let buchungenHtml = "";
    if (!istDepot && zw) {
      let summe = 0;
      for (const tx of data.transaktionen ?? []) {
        if (tx.konto_id !== p.id) continue;
        if (tx.buchungsdatum <= zw.standdatum) continue;
        if (tx.buchungsdatum > today) continue;
        summe += cents(tx.betrag);
      }
      buchungenHtml = detailRow(t("vermoegen.buchungenSeitAnker"), escapeHtml(formatMoney(summe)));
    }
    return head
      + detailRow(t("labels.owner"), escapeHtml(accountOwnerNames(konto || {})))
      + detailRow(t("labels.type"), escapeHtml(accountTypeLabel(konto?.kontotyp || "")))
      + (zw
        ? detailRow(istDepot ? t("vermoegen.depotwert") : t("vermoegen.anker"),
            `<strong>${escapeHtml(formatMoney(cents(zw.wert)))}</strong><br>${escapeHtml(formatDate(zw.standdatum))} · ${qualitaetChip({ qualitaet: zw.qualitaet })}${zw.quelle_hinweis ? `<br><span class="muted">${escapeHtml(zw.quelle_hinweis)}</span>` : ""}`)
        : detailRow(t("vermoegen.anker"), `<span class="chip review">${iconSvg("review")}${escapeHtml(t("vermoegen.qualityFehlend"))}</span>`))
      + buchungenHtml
      + detailRow(t("vermoegen.aktuellerSaldo"),
          `${p.fehlt ? `<span class="muted">${escapeHtml(t("vermoegen.standOhne"))}</span>` : `<strong>${escapeHtml(formatMoney(p.wert_cents))}</strong>`}<br><span class="muted">${escapeHtml(basisLabel(p.basis))}</span>`)
      + renderPositionWertstaende(p);
  }

  if (p.klasse === "immobilie" || p.klasse === "vermoegenswert") {
    const entitaet = p.klasse === "immobilie" ? "immobilie" : "vermoegenswert";
    const entity = (p.klasse === "immobilie" ? data.immobilien : data.vermoegenswerte)?.find((e) => (e.immobilie_id || e.vermoegenswert_id) === p.id);
    const mw = aktuellerZeitwert(data.zeitwerte, entitaet, p.id, "marktwert");
    const mwCents = mw ? cents(mw.wert) : 0;
    return head
      + (entity?.typ ? detailRow(t("labels.type"), escapeHtml(t(`vermoegen.typ.${entity.typ}`))) : "")
      + (entity?.adresse ? detailRow(t("vermoegen.adresse"), escapeHtml(entity.adresse)) : "")
      + (mw
        ? detailRow(t("vermoegen.marktwert"),
            `<strong>${escapeHtml(formatMoney(mwCents))}</strong><br>${escapeHtml(formatDate(mw.standdatum))} · ${qualitaetChip({ qualitaet: mw.qualitaet })}${mw.quelle_hinweis ? `<br><span class="muted">${escapeHtml(mw.quelle_hinweis)}</span>` : ""}`)
        : detailRow(t("vermoegen.marktwert"), `<span class="chip review">${iconSvg("review")}${escapeHtml(t("vermoegen.qualityFehlend"))}</span>`))
      + (entity?.eigentumsanteile ? detailRow(t("vermoegen.eigentumsanteile"), anteileHtml(entity.eigentumsanteile, mwCents)) : "")
      + detailRow(t("vermoegen.anteiligerWert"),
          p.fehlt ? `<span class="muted">${escapeHtml(t("vermoegen.standOhne"))}</span>` : `<strong>${escapeHtml(formatMoney(p.wert_cents))}</strong>`)
      + renderPositionWertstaende(p);
  }

  if (p.klasse === "darlehen") {
    const dar = data.darlehen?.find((d) => d.darlehen_id === p.id);
    const anker = aktuellerZeitwert(data.zeitwerte, "darlehen", p.id, "restschuld");
    const verknuepft = [];
    if (dar?.immobilie_id) {
      const imm = data.immobilien?.find((i) => i.immobilie_id === dar.immobilie_id);
      verknuepft.push(`<button class="linkish" data-action="open-vermoegen-entity" data-vklasse="immobilie" data-vid="${escapeHtml(dar.immobilie_id)}">${escapeHtml(imm?.bezeichnung || dar.immobilie_id)}</button>`);
    }
    if (dar?.konto_id) {
      verknuepft.push(escapeHtml(kontenById.get(dar.konto_id)?.name || dar.konto_id));
    }
    return head
      + (anker
        ? detailRow(t("vermoegen.anker"),
            `<strong>${escapeHtml(formatMoney(cents(anker.wert)))}</strong><br>${escapeHtml(formatDate(anker.standdatum))} · ${qualitaetChip({ qualitaet: anker.qualitaet })}${anker.quelle_hinweis ? `<br><span class="muted">${escapeHtml(anker.quelle_hinweis)}</span>` : ""}`)
        : detailRow(t("vermoegen.anker"), `<span class="chip review">${iconSvg("review")}${escapeHtml(t("vermoegen.qualityFehlend"))}</span>`))
      + detailRow(t("vermoegen.restschuld"),
          `${p.fehlt ? `<span class="muted">${escapeHtml(t("vermoegen.standOhne"))}</span>` : `<strong>${escapeHtml(formatMoney(Math.abs(p.wert_cents)))}</strong>`}<br><span class="muted">${escapeHtml(basisLabel(p.basis))}</span>`)
      + restschuldVerlaufRow(dar, today)
      + (dar?.zinssatz ? detailRow(t("vermoegen.zinssatz"), `${escapeHtml(dar.zinssatz)} %`) : "")
      + (dar?.sollrate ? detailRow(t("vermoegen.rate"), `${escapeHtml(formatMoney(cents(dar.sollrate)))} / ${escapeHtml(rhythmusLabel(dar.rhythmus_einheit, dar.rhythmus_intervall))}`) : "")
      + (verknuepft.length ? detailRow(t("vermoegen.verknuepft"), verknuepft.join(" · ")) : "")
      + renderPositionWertstaende(p);
  }

  return head;
}

// Restschuld-Verlauf seit Anker als Linie (Anker + je Ratentermin). Die Nulllinie
// der Komponente zeigt den Weg zur Null (abbezahlt). Erst ab zwei Punkten.
function restschuldVerlaufRow(dar, today) {
  if (!dar) return "";
  const r = restschuldHeute(dar, data.zeitwerte, today);
  if (!r.punkte || r.punkte.length < 2) return "";
  const svg = saldoLinie(
    r.punkte.map((pt) => ({ wert: pt.wert_cents })),
    `${t("vermoegen.restschuldVerlauf")}: ${formatMoney(r.punkte[0].wert_cents)} → ${formatMoney(r.punkte.at(-1).wert_cents)}`,
  );
  return svg ? detailRow(t("vermoegen.restschuldVerlauf"), svg) : "";
}

function rhythmusLabel(einheit, intervall) {
  const e = t(`vermoegen.rhythmus.${einheit}`);
  const einheitText = e === `vermoegen.rhythmus.${einheit}` ? einheit : e;
  return Number(intervall) > 1 ? `${intervall} ${einheitText}` : einheitText;
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

function clearTransactionTimeFilter() {
  state.transactionFilters.timeMode = "none";
  state.transactionFilters.dateFrom = "";
  state.transactionFilters.dateTo = "";
  state.transactionFilters.month = "";
  state.transactionFilters.quarterYear = "";
  state.transactionFilters.quarter = "1";
  state.transactionFilters.year = "";
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

const data = window.FINANCE_REVIEW_DATA;
const dictionaries = window.FINANCE_I18N;

const storageKeys = {
  lang: "finance-m2-language",
  theme: "finance-m2-theme",
  sidebarCollapsed: "finance-m2-sidebar-collapsed",
};

const navItems = [
  ["overview", "nav.overview", "⌂"],
  ["transactions", "nav.transactions", "≡"],
  ["masterdata", "nav.masterdata", "◫"],
  ["checks", "nav.checks", "✓"],
  ["export", "nav.export", "⇩"],
];

const state = {
  view: "overview",
  lang: localStorage.getItem(storageKeys.lang) || "de",
  theme: localStorage.getItem(storageKeys.theme) || "system",
  sidebarCollapsed: localStorage.getItem(storageKeys.sidebarCollapsed) === "true",
  transactionFilters: {
    account: "",
    status: "",
    category: "",
    transfer: "",
  },
  transactionPage: 1,
  pageSize: 10,
  selectedTransactionId: "",
  masterSection: "konten",
};

const app = document.querySelector("#app");

const personenById = new Map(data.personen.map((person) => [person.person_id, person]));
const kontenById = new Map(data.konten.map((konto) => [konto.konto_id, konto]));
const kategorienById = new Map(data.kategorien.map((kategorie) => [kategorie.kategorie_id, kategorie]));
const transaktionenById = new Map(data.transaktionen.map((transaktion) => [transaktion.transaktion_id, transaktion]));
const transfersById = new Map(data.transfers.map((transfer) => [transfer.transfer_id, transfer]));

function t(path) {
  const parts = path.split(".");
  let current = dictionaries[state.lang] || dictionaries.de;
  for (const part of parts) {
    current = current?.[part];
  }
  if (typeof current === "string") return current;
  return path;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cents(decimalString) {
  const [euros, centsPart] = decimalString.replace("-", "").split(".");
  const sign = decimalString.startsWith("-") ? -1 : 1;
  return sign * (Number(euros) * 100 + Number(centsPart || 0));
}

function formatMoney(amountInCents) {
  return new Intl.NumberFormat(state.lang === "de" ? "de-DE" : "en-US", {
    style: "currency",
    currency: "EUR",
  }).format(amountInCents / 100);
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat(state.lang === "de" ? "de-DE" : "en-US").format(new Date(`${dateString}T00:00:00`));
}

function accountOwnerNames(konto) {
  return konto.inhaber_person_ids.map((id) => personenById.get(id)?.name || id).join(", ");
}

function accountTypeLabel(type) {
  return t(`accountTypes.${type}`) || (type.charAt(0).toUpperCase() + type.slice(1));
}

function categoryName(categoryId) {
  return kategorienById.get(categoryId)?.name || t("labels.noCategory");
}

function statusChip(status) {
  const className = status === "offen" ? "review" : status === "bestaetigt" ? "success" : "neutral";
  const icon = status === "offen" ? "?" : status === "bestaetigt" ? "✓" : "•";
  return `<span class="chip ${className}"><span>${icon}</span>${escapeHtml(t(`status.${status}`))}</span>`;
}

function reviewChecks() {
  return data.checks.filter((check) => check.severity === "review");
}

function openCategoryTransactions() {
  return data.transaktionen.filter((tx) => tx.kategorisierung_status === "offen");
}

function missingReferenceChecks() {
  return data.checks.filter((check) => check.title_key === "checks.accountReferenceMissing.title");
}

function accountBalance(kontoId) {
  return data.transaktionen
    .filter((tx) => tx.konto_id === kontoId)
    .reduce((sum, tx) => sum + cents(tx.betrag), 0);
}

function loadedTotalAccountsBalance() {
  const accountIds = data.konten
    .filter((konto) => konto.kontotyp !== "depot" && konto.liquiditaetsrelevant)
    .map((konto) => konto.konto_id);
  return data.transaktionen
    .filter((tx) => accountIds.includes(tx.konto_id))
    .reduce((sum, tx) => sum + cents(tx.betrag), 0);
}

function applyTheme() {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = state.theme === "system" ? (systemDark ? "dark" : "light") : state.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.lang = state.lang;
}

function render() {
  applyTheme();
  app.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  app.innerHTML = `
    ${renderSidebar()}
    <main class="main">
      ${renderTopbar()}
      ${renderView()}
    </main>
  `;
}

function renderSidebar() {
  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">FM</div>
        <div class="brand-copy">
          <div class="brand-title">${escapeHtml(t("appTitle"))}</div>
          <div class="brand-subtitle">${escapeHtml(t("appSubtitle"))}</div>
        </div>
        <button class="sidebar-toggle" data-action="toggle-sidebar" aria-label="${escapeHtml(state.sidebarCollapsed ? t("chrome.expandNav") : t("chrome.collapseNav"))}" title="${escapeHtml(state.sidebarCollapsed ? t("chrome.expandNav") : t("chrome.collapseNav"))}">
          ${state.sidebarCollapsed ? "›" : "‹"}
        </button>
      </div>
      <nav class="nav" aria-label="${escapeHtml(t("chrome.mainNav"))}">
        ${navItems
          .map(([view, labelKey, icon]) => `
            <button class="nav-button ${state.view === view ? "active" : ""}" data-view="${view}" aria-label="${escapeHtml(t(labelKey))}" title="${escapeHtml(t(labelKey))}">
              <span class="nav-icon">${icon}</span>
              <span class="nav-label">${escapeHtml(t(labelKey))}</span>
            </button>
          `)
          .join("")}
      </nav>
    </aside>
  `;
}

function renderTopbar() {
  return `
    <header class="topbar">
      <div class="work-status">
        <strong>${escapeHtml(t("chrome.workStatus"))}</strong>
        <span class="chip success">✓ ${escapeHtml(t("chrome.validationPassed"))}</span>
        <button class="chip review linkish" data-action="filter-open-category">? ${openCategoryTransactions().length} ${escapeHtml(t("chrome.categoryOpen"))}</button>
        ${(data.importfehler?.length ?? 0) > 0 ? `<button class="chip danger linkish" data-action="show-import-errors">⚠ ${data.importfehler.length} ${escapeHtml(t("chrome.importErrors"))}</button>` : ""}
        <button class="chip neutral linkish" data-action="next-action">${escapeHtml(t("chrome.nextAction"))}: ${escapeHtml(t("overview.nextActionText"))}</button>
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

function renderView() {
  if (state.view === "transactions") return renderTransactions();
  if (state.view === "masterdata") return renderMasterdata();
  if (state.view === "checks") return renderChecks();
  if (state.view === "export") return renderExport();
  return renderOverview();
}

function renderPageHead(title, lead, extra = "") {
  return `
    <div class="page-head">
      <div>
        ${extra}
        <h1 class="page-title">${escapeHtml(title)}</h1>
        <p class="page-lead">${escapeHtml(lead)}</p>
      </div>
    </div>
  `;
}

function renderOverview() {
  return `
    ${renderPageHead(t("overview.title"), t("overview.lead"))}
    <div class="layout-with-rail">
      <div class="stack">
        <section class="panel hero-kpi">
          <div>
            <div class="kpi-label">${escapeHtml(t("overview.totalBalance"))}</div>
            <div class="kpi-value">${escapeHtml(formatMoney(loadedTotalAccountsBalance()))}</div>
            <div class="kpi-note">${escapeHtml(t("overview.balanceNote"))}</div>
          </div>
        </section>
        <section class="panel panel-pad">
          <h2 class="section-title">${escapeHtml(t("overview.accountBalances"))}</h2>
          ${renderAccountTable()}
        </section>
        <section class="panel panel-pad">
          <h2 class="section-title">${escapeHtml(t("overview.roadmap"))}</h2>
          <div class="roadmap roadmap-large">
            <div class="roadmap-card"><strong>${escapeHtml(t("overview.cashflowRoadmap"))}</strong><span class="muted">${escapeHtml(t("overview.plannedLater"))}</span></div>
            <div class="roadmap-card"><strong>${escapeHtml(t("overview.wealthRoadmap"))}</strong><span class="muted">${escapeHtml(t("overview.plannedLater"))}</span></div>
          </div>
        </section>
      </div>
      <aside class="rail">
        <section class="panel panel-pad next-action">
          <h2 class="section-title">${escapeHtml(t("chrome.nextAction"))}</h2>
          <button class="linkish" data-action="filter-open-category">${escapeHtml(t("overview.nextActionText"))}</button>
          <p class="page-lead">${escapeHtml(t("checks.categoryOpen.detail"))}</p>
        </section>
        <section class="panel panel-pad">
          <h2 class="section-title">${escapeHtml(t("overview.checksPreview"))}</h2>
          <div class="rail-list">${renderCheckItems(data.checks.slice(0, 4))}</div>
        </section>
      </aside>
    </div>
  `;
}

function renderAccountTable() {
  const accounts = data.konten.filter((konto) => konto.kontotyp !== "depot");
  const depots = data.konten.filter((konto) => konto.kontotyp === "depot");
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(t("labels.account"))}</th>
            <th>${escapeHtml(t("labels.owner"))}</th>
            <th>${escapeHtml(t("labels.type"))}</th>
            <th class="amount">${escapeHtml(t("labels.loadedBalance"))}</th>
            <th>${escapeHtml(t("labels.status"))}</th>
          </tr>
        </thead>
        <tbody>
          ${renderAccountGroup(t("overview.accounts"), accounts)}
          ${renderAccountGroup(t("overview.depots"), depots)}
        </tbody>
      </table>
    </div>
  `;
}

function renderAccountGroup(label, accounts) {
  return `
    <tr class="group-row"><td colspan="5">${escapeHtml(label)}</td></tr>
    ${accounts
      .map((konto) => {
        const isDepot = konto.kontotyp === "depot";
        const balanceCell = isDepot
          ? `<span class="muted">—</span>`
          : escapeHtml(formatMoney(accountBalance(konto.konto_id)));
        const status = isDepot
          ? t("labels.depotValueMissing")
          : konto.kontoreferenz
            ? t("labels.accountStatusMissing")
            : t("labels.referenceMissing");
        const chipClass = isDepot ? "neutral" : konto.kontoreferenz ? "neutral" : "review";
        const chipIcon = isDepot || konto.kontoreferenz ? "•" : "?";
        return `
          <tr class="clickable" data-action="account-transactions" data-account="${escapeHtml(konto.konto_id)}">
            <td><button class="linkish" data-action="account-transactions" data-account="${escapeHtml(konto.konto_id)}">${escapeHtml(konto.name)}</button></td>
            <td>${escapeHtml(accountOwnerNames(konto))}</td>
            <td>${escapeHtml(accountTypeLabel(konto.kontotyp))}</td>
            <td class="amount">${balanceCell}</td>
            <td><span class="chip ${chipClass}">${chipIcon} ${escapeHtml(status)}</span></td>
          </tr>
        `;
      })
      .join("")}
  `;
}

function filteredTransactions() {
  return data.transaktionen.filter((tx) => {
    if (state.transactionFilters.account && tx.konto_id !== state.transactionFilters.account) return false;
    if (state.transactionFilters.status && tx.kategorisierung_status !== state.transactionFilters.status) return false;
    if (state.transactionFilters.category && tx.kategorie_id !== state.transactionFilters.category) return false;
    if (state.transactionFilters.transfer === "only" && !tx.ist_transfer) return false;
    if (state.transactionFilters.transfer === "without" && tx.ist_transfer) return false;
    return true;
  }).sort((a, b) => b.buchungsdatum.localeCompare(a.buchungsdatum));
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
    ${renderPageHead(t("transactions.title"), t("transactions.lead"), breadcrumb)}
    <div class="layout-with-rail">
      <div class="stack">
        <section class="summary-strip">
          <div class="summary-cell"><span class="muted">${escapeHtml(t("transactions.hits"))}</span><strong>${allRows.length}</strong></div>
          <div class="summary-cell"><span class="muted">${escapeHtml(t("transactions.filteredBalance"))}</span><strong>${escapeHtml(formatMoney(filterBalance))}</strong></div>
          <div class="summary-cell"><span class="muted">${escapeHtml(t("chrome.categoryOpen"))}</span><strong>${openCount}</strong></div>
        </section>
        ${renderTransactionFilters()}
        <section class="panel">
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
      <aside class="panel panel-pad detail-panel">
        <h2 class="section-title">${escapeHtml(t("transactions.details"))}</h2>
        ${selectedInFilter ? renderTransactionDetail(selectedInFilter) : `<p>${escapeHtml(t("transactions.noSelection"))}</p>`}
      </aside>
    </div>
  `;
}

function renderPagination(totalRows, pageCount) {
  const from = totalRows === 0 ? 0 : (state.transactionPage - 1) * state.pageSize + 1;
  const to = Math.min(totalRows, state.transactionPage * state.pageSize);
  return `
    <div class="pagination">
      <span>${escapeHtml(t("transactions.page"))} ${state.transactionPage} / ${pageCount} · ${from}-${to} ${escapeHtml(t("transactions.of"))} ${totalRows}</span>
      <div class="pagination-actions">
        <button class="pager-button" data-action="page-prev" ${state.transactionPage === 1 ? "disabled" : ""}>${escapeHtml(t("transactions.previousPage"))}</button>
        <button class="pager-button" data-action="page-next" ${state.transactionPage === pageCount ? "disabled" : ""}>${escapeHtml(t("transactions.nextPage"))}</button>
      </div>
    </div>
  `;
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
  return `
    <section class="filter-bar">
      ${renderSelect("account", t("transactions.filterAccount"), [
        ["", t("transactions.allAccounts")],
        ...data.konten.map((konto) => [konto.konto_id, konto.name]),
      ])}
      ${renderSelect("status", t("transactions.filterStatus"), [
        ["", t("transactions.allStatuses")],
        ["offen", t("status.offen")],
        ["vorgeschlagen", t("status.vorgeschlagen")],
        ["bestaetigt", t("status.bestaetigt")],
        ["abgelehnt", t("status.abgelehnt")],
      ])}
      ${renderSelect("category", t("transactions.filterCategory"), [
        ["", t("transactions.allCategories")],
        ...data.kategorien.map((kategorie) => [kategorie.kategorie_id, kategorie.name]),
      ])}
      ${renderSelect("transfer", t("transactions.filterTransfer"), [
        ["", t("transactions.allTransfers")],
        ["only", t("transactions.onlyTransfers")],
        ["without", t("transactions.withoutTransfers")],
      ])}
    </section>
  `;
}

function renderSelect(name, label, options) {
  return `
    <div class="filter-field ${state.transactionFilters[name] ? "active" : ""}">
      <label for="filter-${name}">${escapeHtml(label)}</label>
      <select id="filter-${name}" data-filter="${name}">
        ${options.map(([value, text]) => `<option value="${escapeHtml(value)}" ${state.transactionFilters[name] === value ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}
      </select>
    </div>
  `;
}

function renderTransactionRow(tx) {
  const konto = kontenById.get(tx.konto_id);
  const category = tx.kategorie_id ? categoryName(tx.kategorie_id) : t("labels.noCategory");
  const selectAttrs = `data-action="select-transaction" data-transaction="${escapeHtml(tx.transaktion_id)}"`;
  return `
    <tr class="transaction-row ${tx.transaktion_id === state.selectedTransactionId ? "selected" : ""} ${tx.kategorisierung_status === "offen" ? "open" : ""}">
      <td class="row-select-cell" ${selectAttrs}>${escapeHtml(formatDate(tx.buchungsdatum))}</td>
      <td><button class="linkish" data-action="account-transactions" data-account="${escapeHtml(tx.konto_id)}">${escapeHtml(konto?.name || tx.konto_id)}</button></td>
      <td class="row-select-cell" ${selectAttrs}>${escapeHtml(tx.gegenpartei)}</td>
      <td class="row-select-cell" ${selectAttrs}>${escapeHtml(tx.verwendungszweck)}</td>
      <td class="amount row-select-cell" ${selectAttrs}>${escapeHtml(formatMoney(cents(tx.betrag)))}</td>
      <td class="row-select-cell" ${selectAttrs}>${escapeHtml(category)}</td>
      <td class="row-select-cell" ${selectAttrs}>${statusChip(tx.kategorisierung_status)}</td>
      ${renderTransferCell(tx)}
    </tr>
  `;
}

function renderTransferCell(tx) {
  if (!tx.ist_transfer) return `<td><span class="muted">${escapeHtml(t("labels.no"))}</span></td>`;
  const paired = pairedTransferTransaction(tx);
  if (!paired) return `<td><span class="chip neutral">↔ ${escapeHtml(t("labels.yes"))}</span></td>`;
  return `<td class="transfer-link-cell" data-action="paired-transfer" data-transaction="${escapeHtml(paired.transaktion_id)}" title="${escapeHtml(t("transactions.pairedTransfer"))}"><span class="chip neutral linkish transfer-anchor">↔ ${escapeHtml(t("labels.yes"))}</span></td>`;
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
  return `
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t("transactions.booking"))}</div>
      <div class="detail-value">
        <strong>${escapeHtml(formatMoney(cents(tx.betrag)))}</strong><br>
        ${escapeHtml(formatDate(tx.buchungsdatum))}<br>
        ${escapeHtml(tx.gegenpartei)}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t("labels.account"))}</div>
      <div class="detail-value">
        <button class="linkish" data-action="account-transactions" data-account="${escapeHtml(tx.konto_id)}">${escapeHtml(konto?.name || tx.konto_id)}</button>
      </div>
    </div>
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

function renderMasterdata() {
  const missingRefs = missingReferenceChecks().length;
  return `
    ${renderPageHead(t("masterdata.title"), t("masterdata.lead"))}
    <div class="tile-grid">
      <button class="tile ${state.masterSection === "personen" ? "active" : ""}" data-master-section="personen">
        <strong>${escapeHtml(t("masterdata.people"))}</strong>
        <div class="count">${data.personen.length}</div>
        <span class="chip success">✓ ${escapeHtml(t("masterdata.active"))}</span>
      </button>
      <button class="tile ${state.masterSection === "konten" ? "active" : ""}" data-master-section="konten">
        <strong>${escapeHtml(t("masterdata.accounts"))}</strong>
        <div class="count">${data.konten.length}</div>
        <span class="chip review">? ${missingRefs} ${escapeHtml(t("masterdata.missingRefs"))}</span>
      </button>
      <button class="tile ${state.masterSection === "kategorien" ? "active" : ""}" data-master-section="kategorien">
        <strong>${escapeHtml(t("masterdata.categories"))}</strong>
        <div class="count">${data.kategorien.length}</div>
        <span class="chip success">✓ ${escapeHtml(t("masterdata.active"))}</span>
      </button>
    </div>
    <section class="panel panel-pad" style="margin-top: 16px;">
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

function renderChecks() {
  const groups = [
    [t("checksPage.validation"), data.checks.filter((check) => check.scope === "datenstand")],
    [t("checksPage.categories"), data.checks.filter((check) => check.scope === "transaktion")],
    [t("checksPage.accountReferences"), data.checks.filter((check) => check.scope === "konto")],
    [t("checksPage.transfers"), []],
  ];
  return `
    ${renderPageHead(t("checksPage.title"), t("checksPage.lead"))}
    <div class="tile-grid">
      ${groups.map(([label, checks]) => `
        <button class="tile">
          <strong>${escapeHtml(label)}</strong>
          <div class="count">${checks.length}</div>
          <span class="chip ${checks.some((check) => check.severity === "review") ? "review" : "success"}">${checks.some((check) => check.severity === "review") ? "?" : "✓"} ${escapeHtml(checks.length ? t("status.review") : t("status.success"))}</span>
        </button>
      `).join("")}
    </div>
    <section class="panel panel-pad" style="margin-top: 16px;">
      <h2 class="section-title">${escapeHtml(t("checksPage.title"))}</h2>
      <div class="rail-list">${renderCheckItems(data.checks)}</div>
    </section>
    ${(data.importfehler?.length ?? 0) > 0 ? `
      <section class="panel panel-pad" style="margin-top: 16px;">
        <h2 class="section-title">${escapeHtml(t("checksPage.importErrors"))}</h2>
        <p class="page-lead">${escapeHtml(t("checksPage.importErrorsLead"))}</p>
        <div class="rail-list">
          ${data.importfehler.map((fehler) => `
            <div class="rail-item">
              <span class="chip danger">⚠ ${escapeHtml(fehler.reason)}</span>
              <span>${escapeHtml(fehler.rohquelle)} · ${escapeHtml(t("labels.row"))} ${escapeHtml(String(fehler.row ?? "-"))}</span>
              <span class="muted">${escapeHtml(fehler.detail)}</span>
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
        <span class="chip ${check.severity === "success" ? "success" : "review"}">${check.severity === "success" ? "✓" : "?"} ${escapeHtml(title)}</span>
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
    commitNavigation();
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

  const filter = event.target.closest("[data-filter]");
  if (filter) {
    state.transactionFilters[filter.dataset.filter] = filter.value;
    state.view = "transactions";
    state.transactionPage = 1;
    commitNavigation();
  }
});

function handleAction(element) {
  const action = element.dataset.action;
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
  if (action === "open-account-master") {
    state.view = "masterdata";
    state.masterSection = "konten";
    commitNavigation();
    return;
  }
  if (action === "filter-open-category" || action === "next-action") {
    state.view = "transactions";
    state.transactionFilters.status = "offen";
    state.transactionFilters.account = "";
    state.transactionFilters.category = "";
    state.transactionFilters.transfer = "";
    state.transactionPage = 1;
    state.selectedTransactionId = openCategoryTransactions()[0]?.transaktion_id || state.selectedTransactionId;
    commitNavigation();
    return;
  }
  if (action === "account-transactions") {
    state.view = "transactions";
    state.transactionFilters.account = element.dataset.account;
    state.transactionFilters.status = "";
    state.transactionFilters.category = "";
    state.transactionFilters.transfer = "";
    state.transactionPage = 1;
    state.selectedTransactionId = data.transaktionen.find((tx) => tx.konto_id === element.dataset.account)?.transaktion_id || "";
    commitNavigation();
    return;
  }
  if (action === "select-transaction") {
    state.selectedTransactionId = element.dataset.transaction;
    commitNavigation();
    return;
  }
  if (action === "page-prev" || action === "page-next") {
    state.view = "transactions";
    state.transactionPage += action === "page-next" ? 1 : -1;
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
  };
}

function restoreState(snapshot) {
  if (!snapshot) return;
  state.view = snapshot.view || "overview";
  state.transactionFilters = { ...state.transactionFilters, ...(snapshot.transactionFilters || {}) };
  state.selectedTransactionId = snapshot.selectedTransactionId || "";
  state.transactionPage = snapshot.transactionPage || 1;
  state.masterSection = snapshot.masterSection || "konten";
}

function commitNavigation() {
  history.pushState(snapshotState(), "", "");
  render();
}

window.addEventListener("popstate", (event) => {
  restoreState(event.state);
  render();
});


window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (state.theme === "system") render();
});

history.replaceState(snapshotState(), "", "");
render();

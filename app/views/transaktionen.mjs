// app/views/transaktionen.mjs
// Transaktions-Ansicht: Tabelle, Filter (inkl. Zeitfilter), Pagination, Detail-Rail.
import { data, state, t, escapeHtml, cents, kontenById, transaktionenById, transfersById } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { formatMoney, formatDate, formatMonth, statusChip, renderPageHead, renderTableFilters, categoryName } from "../komponenten.mjs";
import { matchesQuery, formatIban } from "../tools/lib/text.mjs";

function transactionSearchFields(tx) {
  return [
    tx.gegenpartei,
    tx.verwendungszweck,
    tx.empfaenger,
    tx.empfaenger_iban,
    tx.transaktion_id,
    tx.betrag,
    String(tx.betrag ?? "").replace(".", ","),
    // Konto und Kategorie bewusst NICHT durchsuchbar: beide haben einen eigenen
    // Dropdown-Filter. Im Freitext erzeugten sie nur Substring-Kollisionen
    // (z. B. "MusterbankA" matchte jede Buchung auf dem MusterbankA-Konto statt nur den Text).
    tx.kundenreferenz,
    tx.mandatsreferenz,
    tx.bank_referenz,
  ];
}

export function filteredTransactions() {
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

export function renderTransactions() {
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

export function applyTransactionTimeModeDefaults(mode) {
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

export function clearTransactionTimeFilter() {
  state.transactionFilters.timeMode = "none";
  state.transactionFilters.dateFrom = "";
  state.transactionFilters.dateTo = "";
  state.transactionFilters.month = "";
  state.transactionFilters.quarterYear = "";
  state.transactionFilters.quarter = "1";
  state.transactionFilters.year = "";
}

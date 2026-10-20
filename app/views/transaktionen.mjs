// app/views/transaktionen.mjs
// Transaktions-Ansicht: Tabelle, Filter (inkl. Zeitfilter), Pagination, Detail-Rail.
import { data, state, t, tf, escapeHtml, cents, kontenById } from "../runtime.mjs";
import { zielRoute } from "../routing.mjs";
import { iconSvg } from "../icons.js";
import { formatMoney, formatDate, formatMonth, mitLogo, statusChip, renderPageHead, renderTableFilters, categoryName, detailRow, quelleHtml } from "../komponenten.mjs";
import { formatIban } from "../tools/lib/text.mjs";
import { dokumentRoute } from "../belege.mjs";
import { erstelleApiCache } from "../api-daten.mjs";
import { aktiveFilter, ohneZeitfilter, BETRAG_MUSTER, filterAlsQuery } from "../navigation.mjs";

// Die Liste rechnet der App-Server (GET /api/v1/transaktionen, Filter, Sortierung,
// Seite, Sprung zu einer Buchung, Detail der Auswahl); der Browser bekommt nur
// die angezeigte Seite. Rechenlogik: app/transaktionen-abfrage.mjs.
const cache = erstelleApiCache();

function anfragePfad({ seite = state.transactionPage, auswahl = state.selectedTransactionId, zeige = state.transactionJumpTo } = {}) {
  const suche = new URLSearchParams();
  if (state.dataMode === "demo") suche.set("quelle", "demo");
  for (const [name, wert] of Object.entries(state.transactionFilters)) {
    // Halb getippte Betraege ("12,") nicht schicken; das Feld zeigt sie als ungueltig.
    if (name.startsWith("betrag") && !BETRAG_MUSTER.test(wert)) continue;
    if (wert) suche.set(name, wert);
  }
  suche.set("sort", state.transactionSort.key);
  suche.set("dir", state.transactionSort.dir);
  suche.set("groesse", String(state.pageSize));
  if (zeige) suche.set("zeige", zeige);
  // "Letzte Seite" setzt eine beliebig grosse Zahl; der Server begrenzt sie (hoechstens 9 Stellen).
  else suche.set("seite", String(Number.isFinite(seite) && seite > 0 ? Math.min(Math.floor(seite), 999999) : 1));
  if (auswahl) suche.set("auswahl", auswahl);
  suche.set("ohneKategorie", t("labels.noCategory"));
  return `./api/v1/transaktionen?${suche}`;
}

// Antwort zum aktuellen Zustand (oder null, solange sie laedt). Seite,
// Sprung und Auswahl uebernimmt der Zustand aus der Antwort: die Seite ist
// begrenzt, der Sprung erledigt, eine Auswahl ausserhalb des Filters faellt
// weg. Unter dem so normalisierten Pfad liegt die Antwort ebenfalls.
export function transaktionenAntwort() {
  const { antwort, laedt, fehler, veraltet } = cache.hole(anfragePfad());
  if (!antwort || veraltet) return { antwort, laedt, fehler, veraltet };
  state.transactionPage = antwort.seite;
  state.transactionJumpTo = "";
  if (state.selectedTransactionId && !antwort.auswahl) state.selectedTransactionId = "";
  cache.merke(anfragePfad(), antwort);
  return { antwort, laedt: false, fehler: null, veraltet: false };
}

function transactionAccountLabel(tx) {
  return kontenById.get(tx.konto_id)?.name || tx.konto_id || "";
}

function transactionCategoryLabel(tx) {
  return tx.kategorie_id ? categoryName(tx.kategorie_id) : t("labels.noCategory");
}

function transactionSortIndicator(key) {
  if (state.transactionSort.key !== key) return "";
  return state.transactionSort.dir === "asc" ? " ▲" : " ▼";
}

function transactionSortHeader(key, labelKey, amount = false) {
  const sort = state.transactionSort;
  const ariaSort = sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
  return `<th${amount ? ' class="amount"' : ""} aria-sort="${ariaSort}"><button class="linkish sort-th" data-transaction-sort="${key}">${escapeHtml(t(labelKey))}${escapeHtml(transactionSortIndicator(key))}</button></th>`;
}

export function renderTransactions() {
  const { antwort, laedt, fehler, veraltet } = transaktionenAntwort();
  const accountName = state.transactionFilters.account ? kontenById.get(state.transactionFilters.account)?.name : "";
  const breadcrumb = renderBreadcrumb(accountName);
  if (!antwort) {
    return `
      ${renderPageHead(t("transactions.title"), "", breadcrumb)}
      <section class="panel panel-pad"><p class="muted" role="status">${escapeHtml(fehler ? `${t("transactions.loadFailed")} (${fehler.message})` : t("transactions.loading"))}</p></section>`;
  }
  const rows = antwort.zeilen;
  const pageCount = antwort.seiten;
  // Solange die neue Seite laedt, zeigt die Leiste die gewuenschte Seite, aber
  // nie ausserhalb der bekannten Seiten (state.transactionPage kann nach
  // "Letzte Seite" beliebig gross sein).
  const seite = veraltet ? Math.min(Math.max(1, Math.floor(Number(state.transactionPage)) || 1), pageCount) : antwort.seite;
  const auswahl = antwort.auswahl?.transaktion.transaktion_id === state.selectedTransactionId ? antwort.auswahl : null;
  const detailRailOpen = !state.detailRailClosed && Boolean(auswahl);

  return `
    ${renderPageHead(t("transactions.title"), "", breadcrumb)}
    <div class="layout-with-rail ${detailRailOpen ? "" : "rail-closed"}">
      <div class="stack">
        <section class="summary-strip">
          <div class="summary-cell"><span class="muted">${escapeHtml(t("transactions.hits"))}</span><strong>${antwort.treffer}</strong></div>
          <div class="summary-cell"><span class="muted">${escapeHtml(t("transactions.filteredBalance"))}</span><strong>${escapeHtml(formatMoney(antwort.saldo_cent))}</strong></div>
          <div class="summary-cell"><span class="muted">${escapeHtml(t("chrome.categoryOpen"))}</span><strong>${antwort.offen}</strong></div>
        </section>
        ${renderTransactionFilters(antwort)}
        ${renderGruppen(antwort)}
        <section class="panel${laedt ? " laedt" : ""}" aria-busy="${laedt ? "true" : "false"}">
          ${renderTransactionTableToolbar()}
          <div class="table-wrap">
            <table class="transaction-table">
              <colgroup>
                <col class="col-datum"><col class="col-konto"><col class="col-gegenpartei"><col class="col-zweck">
                <col class="col-betrag"><col class="col-kategorie">
              </colgroup>
              <thead>
                <tr>
                  ${transactionSortHeader("date", "labels.date")}
                  ${transactionSortHeader("account", "labels.account")}
                  ${transactionSortHeader("counterparty", "labels.counterparty")}
                  ${transactionSortHeader("purpose", "labels.purpose")}
                  ${transactionSortHeader("amount", "labels.amount", true)}
                  ${transactionSortHeader("category", "labels.category")}
                </tr>
              </thead>
              <tbody>
                ${rows.map((tx) => renderTransactionRow(tx)).join("")}
              </tbody>
            </table>
          </div>
          ${renderPagination(antwort.treffer, pageCount, seite)}
        </section>
      </div>
      ${detailRailOpen ? `
        <aside class="panel panel-pad detail-panel">
          <div class="detail-head">
            <h2 class="section-title">${escapeHtml(t("transactions.details"))}</h2>
            <button class="icon-button" data-action="close-detail-rail" aria-label="${escapeHtml(t("chrome.closeDetails"))}" title="${escapeHtml(t("chrome.closeDetails"))}">${iconSvg("close")}</button>
          </div>
          ${renderTransactionDetail(auswahl)}
        </aside>
      ` : ""}
    </div>
  `;
}

// Summen je Gruppe ueber alle Treffer (nicht nur die Seite). Eine Zeile
// schraenkt die Liste auf ihre Buchungen ein.
function renderGruppen(antwort) {
  const gruppe = state.transactionFilters.gruppe;
  if (!gruppe || !antwort.gruppen) return "";
  const name = (g) => (gruppe === "monat" ? formatMonth(g.schluessel) : g.name || "—");
  return `
    <section class="panel panel-pad transaktion-gruppen" aria-labelledby="gruppen-titel">
      <h2 class="section-title" id="gruppen-titel">${escapeHtml(tf("transactions.gruppenTitel", { gruppe: t(`transactions.gruppe.${gruppe}`) }))}</h2>
      <ul class="gruppen-liste">
        <li class="gruppen-kopf" aria-hidden="true"><span>${escapeHtml(t(`transactions.gruppe.${gruppe}`))}</span><span class="amount">${escapeHtml(t("transactions.gruppeAnzahl"))}</span><span class="amount">${escapeHtml(t("transactions.gruppeSumme"))}</span></li>
        ${antwort.gruppen.map((g) => `
          <li>
            ${["gegenpartei", "regelzahlung"].includes(gruppe) && !g.schluessel ? `<span class="muted">—</span>` : `<button class="linkish" data-action="gruppe-filtern" data-gruppe="${escapeHtml(gruppe)}" data-schluessel="${escapeHtml(g.schluessel)}" title="${escapeHtml(t("transactions.gruppeFiltern"))}">${escapeHtml(name(g))}</button>`}
            <span class="amount muted">${g.anzahl}</span>
            <span class="amount">${escapeHtml(formatMoney(g.summe_cent))}</span>
          </li>`).join("")}
      </ul>
    </section>`;
}

function renderTransactionTableToolbar() {
  return `
    <div class="table-toolbar">
      <label class="table-page-size">
        <span>${escapeHtml(t("transactions.gruppieren"))}</span>
        <select data-filter="gruppe" aria-label="${escapeHtml(t("transactions.gruppieren"))}">
          ${["", "kategorie", "monat", "gegenpartei", "regelzahlung"].map((g) => `<option value="${g}" ${state.transactionFilters.gruppe === g ? "selected" : ""}>${escapeHtml(t(`transactions.gruppe.${g}`))}</option>`).join("")}
        </select>
      </label>
      <label class="table-page-size">
        <span>${escapeHtml(t("transactions.rowsPerPage"))}</span>
        <select data-filter="pageSize" aria-label="${escapeHtml(t("transactions.rowsPerPage"))}">
          ${[["10", "10"], ["20", "20"], ["50", "50"], ["100", "100"]].map(([value, label]) => `<option value="${value}" ${String(state.pageSize) === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}

function renderPagination(totalRows, pageCount, seite) {
  const from = totalRows === 0 ? 0 : (seite - 1) * state.pageSize + 1;
  const to = Math.min(totalRows, seite * state.pageSize);
  const items = paginationItems(seite, pageCount);
  return `
    <div class="pagination">
      <span>${escapeHtml(t("transactions.page"))} ${seite} / ${pageCount} · ${from}-${to} ${escapeHtml(t("transactions.of"))} ${totalRows}</span>
      <div class="pagination-actions">
        <button class="pager-button" data-action="page-first" ${seite === 1 ? "disabled" : ""}>${escapeHtml(t("transactions.firstPage"))}</button>
        <button class="pager-button" data-action="page-prev" ${seite === 1 ? "disabled" : ""}>${escapeHtml(t("transactions.previousPage"))}</button>
        <div class="pagination-pages" aria-label="${escapeHtml(t("transactions.pageJumps"))}">
          ${items.map((item) => item === "ellipsis"
            ? `<span class="pagination-ellipsis">…</span>`
            : `<button class="page-number ${item === seite ? "active" : ""}" data-action="page-jump" data-page="${item}" ${item === seite ? "aria-current=\"page\"" : ""}>${item}</button>`).join("")}
        </div>
        <button class="pager-button" data-action="page-next" ${seite === pageCount ? "disabled" : ""}>${escapeHtml(t("transactions.nextPage"))}</button>
        <button class="pager-button" data-action="page-last" ${seite === pageCount ? "disabled" : ""}>${escapeHtml(t("transactions.lastPage"))}</button>
      </div>
    </div>
  `;
}

function paginationItems(currentPage, pageCount) {
  const pages = new Set([1, pageCount]);
  // Fester Schrittzaehler: bei sehr grossen Zahlen aendert page += 1 den Wert nicht mehr.
  for (let schritt = -2; schritt <= 2; schritt += 1) {
    const page = currentPage + schritt;
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
      <a class="linkish" href="${escapeHtml(zielRoute("open-account-master", state.transactionFilters.account))}" data-action="open-account-master" data-account="${escapeHtml(state.transactionFilters.account)}">${escapeHtml(accountName)}</a>
      <span>/</span>
      <span>${escapeHtml(t("transactions.title"))}</span>
    </div>
  `;
}

// Ein Chip je aktivem Filter (navigation.mjs aktiveFilter): Name, Wert und
// ein Knopf, der genau diesen Filter entfernt. Die Freitextsuche hat ihren
// eigenen Loeschknopf im Feld.
function renderFilterChips() {
  const chips = aktiveFilter(state.transactionFilters).map(({ name }) => filterChip(name)).filter(Boolean);
  if (!chips.length) return "";
  return `<div class="filter-chips" role="group" aria-label="${escapeHtml(t("transactions.aktiveFilter"))}">${chips.join("")}</div>`;
}

function filterChip(name) {
  const f = state.transactionFilters;
  const chip = ({ icon = "", label, wertHtml, titel = "", entfernen = `${t("chrome.clearFilter")}: ${label}` }) => `
      <span class="filter-chip"${titel ? ` title="${escapeHtml(titel)}"` : ""}>
        ${icon ? iconSvg(icon) : ""}<span>${escapeHtml(label)}:</span>
        ${wertHtml}
        <button class="filter-chip-clear" data-action="clear-transaction-filter" data-filter-name="${escapeHtml(name)}" aria-label="${escapeHtml(entfernen)}" title="${escapeHtml(entfernen)}">${iconSvg("clear")}</button>
      </span>`;
  const text = (wert) => `<strong>${escapeHtml(wert)}</strong>`;
  if (name === "beleg") {
    const name = f.beleg.slice(f.beleg.lastIndexOf("/") + 1);
    return chip({ icon: "belege", label: t("dokumente.filterChip"), titel: f.beleg, entfernen: t("dokumente.filterEntfernen"), wertHtml: `<a class="linkish" href="${escapeHtml(dokumentRoute(f.beleg))}">${escapeHtml(name)}</a>` });
  }
  if (name === "vorsorge") {
    const vs = (data.vorsorge ?? []).find((v) => v.vorsorge_id === f.vorsorge);
    return chip({ icon: "vorsorge", label: t("transactions.vorsorgeFilterChip"), titel: f.vorsorge, entfernen: t("transactions.vorsorgeFilterEntfernen"), wertHtml: `<a class="linkish" href="${escapeHtml(zielRoute("open-vorsorge", f.vorsorge))}" data-action="open-vorsorge" data-vorsorge="${escapeHtml(f.vorsorge)}">${escapeHtml(vs?.name || f.vorsorge)}</a>` });
  }
  if (name === "account") return chip({ label: t("transactions.filterAccount"), wertHtml: text(kontenById.get(f.account)?.name || f.account) });
  if (name === "status") return chip({ label: t("transactions.filterStatus"), wertHtml: text(t(`status.${f.status}`)) });
  if (name === "category") return chip({ label: t("transactions.filterCategory"), wertHtml: text(f.category === "ohne" ? t("labels.noCategory") : categoryName(f.category)) });
  if (name === "gegenpartei") return chip({ label: t("labels.counterparty"), wertHtml: text(f.gegenpartei) });
  if (name === "transfer") return chip({ label: t("transactions.filterTransfer"), wertHtml: text(t(f.transfer === "only" ? "transactions.onlyTransfers" : "transactions.withoutTransfers")) });
  if (name === "origin") return chip({ label: t("transactions.filterOrigin"), wertHtml: text(t({ regel: "transactions.originRule", agent: "transactions.originAgent", manuell: "transactions.originManual" }[f.origin] ?? f.origin)) });
  if (name === "zeit") return chip({ label: t("transactions.filterTime"), wertHtml: text(zeitfilterText(f)) });
  if (name === "klasse") return chip({ label: t("transactions.filterKlasse"), wertHtml: text(t(`transactions.klasse.${f.klasse}`)) });
  if (name === "richtung") return chip({ label: t("transactions.filterRichtung"), wertHtml: text(t(`transactions.${f.richtung}`)) });
  if (name === "betrag") return chip({ label: t("transactions.filterBetrag"), wertHtml: text(betragText(f)) });
  if (name === "regelzahlung") {
    const rz = (data.regelzahlungen ?? []).find((r) => r.regelzahlung_id === f.regelzahlung);
    return chip({ icon: "regelzahlungen", label: t("transactions.filterRegelzahlung"), titel: f.regelzahlung, wertHtml: `<a class="linkish" href="${escapeHtml(zielRoute("open-regelzahlung", f.regelzahlung))}" data-action="open-regelzahlung" data-regelzahlung="${escapeHtml(f.regelzahlung)}">${escapeHtml(rz?.bezeichnung || f.regelzahlung)}</a>` });
  }
  return "";
}

// "ab 500 €", "bis 50 €", "100 € – 500 €"
function betragText(f) {
  const euro = (wert) => formatMoney(Math.round(Number(String(wert).replace(",", ".")) * 100));
  if (f.betragVon && f.betragBis) return `${euro(f.betragVon)} – ${euro(f.betragBis)}`;
  return f.betragVon ? `≥ ${euro(f.betragVon)}` : `≤ ${euro(f.betragBis)}`;
}

function zeitfilterText(f) {
  if (f.timeMode === "month") return formatMonth(f.month);
  if (f.timeMode === "quarter") return `Q${f.quarter} ${f.quarterYear}`;
  if (f.timeMode === "year") return f.year;
  return `${f.dateFrom ? formatDate(f.dateFrom) : "…"} – ${f.dateTo ? formatDate(f.dateTo) : "…"}`;
}

function renderTransactionFilters(antwort) {
  return renderTableFilters({
    prefix: renderFilterChips(),
    searchFields: [
      {
        name: "search",
        type: "search",
        label: t("transactions.filterSearch"),
        placeholder: t("transactions.searchPlaceholder"),
      },
    ],
    timeFields: transactionTimeFilterFields(antwort),
    groups: [
      {
        label: t("transactions.filterGruppe.woWas"),
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
            name: "category",
            label: t("transactions.filterCategory"),
            options: [
            ["", t("transactions.allCategories")],
            ["ohne", t("labels.noCategory")],
            ...data.kategorien.map((kategorie) => [kategorie.kategorie_id, kategorie.name]),
            ],
          },
          {
            name: "regelzahlung",
            label: t("transactions.filterRegelzahlung"),
            options: [
              ["", t("transactions.alleRegelzahlungen")],
              ...[...(data.regelzahlungen ?? [])]
                .sort((a, b) => String(a.bezeichnung).localeCompare(String(b.bezeichnung), "de"))
                .map((rz) => [rz.regelzahlung_id, rz.bezeichnung || rz.regelzahlung_id]),
            ],
          },
        ],
      },
      {
        label: t("transactions.filterGruppe.betrag"),
        fields: [
          {
            name: "richtung",
            label: t("transactions.filterRichtung"),
            options: [
              ["", t("transactions.alleRichtungen")],
              ["einnahme", t("transactions.einnahme")],
              ["ausgabe", t("transactions.ausgabe")],
            ],
          },
          { name: "betragVon", type: "betrag", label: t("transactions.betragVon") },
          { name: "betragBis", type: "betrag", label: t("transactions.betragBis") },
        ],
      },
      {
        label: t("transactions.filterGruppe.bearbeitung"),
        fields: [
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
            name: "origin",
            label: t("transactions.filterOrigin"),
            options: [
            ["", t("transactions.allOrigins")],
            ["regel", t("transactions.originRule")],
            ["agent", t("transactions.originAgent")],
            ["manuell", t("transactions.originManual")],
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
      },
    ],
    filters: state.transactionFilters,
    filterAttr: "filter",
    clearAction: "clear-transaction-filter",
    resetAction: "reset-transaction-filters",
    activeCount: transactionFilterActiveCount(),
    resultCount: antwort.treffer,
    totalCount: antwort.gesamt,
  });
}

function transactionTimeFilterFields(antwort) {
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
      options: transactionMonthOptions(antwort),
    });
  }
  if (filters.timeMode === "quarter") {
    fields.push(
      {
        name: "quarterYear",
        label: t("transactions.year"),
        options: transactionYearOptions(antwort),
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
      options: transactionYearOptions(antwort),
    });
  }
  return fields;
}

// Monate und Jahre mit Buchungen (aus der Antwort, unabhaengig vom Filter).
function transactionMonthOptions(antwort) {
  return (antwort?.monate ?? []).map((month) => [month, formatMonth(month)]);
}

function transactionYearOptions(antwort) {
  return [
    ["", t("transactions.allYears")],
    ...(antwort?.jahre ?? []).map((year) => [year, year]),
  ];
}

export function applyTransactionTimeModeDefaults(mode) {
  if (mode === "none") {
    clearTransactionTimeFilter();
    return;
  }
  const { antwort } = cache.hole(anfragePfad());
  if (mode === "month" && !state.transactionFilters.month) {
    state.transactionFilters.month = transactionMonthOptions(antwort)[0]?.[0] || "";
  }
  if (mode === "quarter" && !state.transactionFilters.quarterYear) {
    const latestMonth = antwort?.monate?.[0] || "";
    state.transactionFilters.quarterYear = latestMonth.slice(0, 4) || transactionYearOptions(antwort)[1]?.[0] || "";
    state.transactionFilters.quarter = latestMonth ? String(Math.ceil(Number(latestMonth.slice(5, 7)) / 3)) : "1";
  }
  if (mode === "year" && !state.transactionFilters.year) {
    state.transactionFilters.year = transactionYearOptions(antwort)[1]?.[0] || "";
  }
}

function transactionFilterActiveCount() {
  return aktiveFilter(state.transactionFilters).length + (state.transactionFilters.search ? 1 : 0);
}

function renderTransactionRow(tx) {
  // Die Zellen sind per Maus waehlbar; per Tastatur genau ein Halt je Zeile: das Datum als Link.
  const selectAttrs = `data-action="select-transaction" data-transaction="${escapeHtml(tx.transaktion_id)}"`;
  const detailHref = `#/transaktionen/${encodeURIComponent(tx.transaktion_id)}${filterAlsQuery(state.transactionFilters, { pfadfilter: true })}`;
  return `
    <tr class="transaction-row ${tx.transaktion_id === state.selectedTransactionId ? "selected" : ""} ${tx.kategorisierung_status === "offen" ? "open" : ""} ${tx.kategorisierung_status === "vorgeschlagen" ? "vorgeschlagen" : ""}">
      <td class="row-select-cell" ${selectAttrs}><a class="linkish zeilen-link" href="${escapeHtml(detailHref)}" ${selectAttrs}${tx.transaktion_id === state.selectedTransactionId ? ' aria-current="true"' : ""}>${escapeHtml(formatDate(tx.buchungsdatum))}</a></td>
      <td><a class="linkish" href="${escapeHtml(zielRoute("open-account-master", tx.konto_id))}" data-action="open-account-master" data-account="${escapeHtml(tx.konto_id)}">${escapeHtml(transactionAccountLabel(tx))}</a></td>
      <td class="row-select-cell" ${selectAttrs}>${mitLogo({ gegenpartei: tx.gegenpartei }, escapeHtml(tx.gegenpartei), { groesse: "tabelle" })}</td>
      <td class="row-select-cell" ${selectAttrs}>${escapeHtml(tx.verwendungszweck)}${tx.bemerkung ? `<div class="tx-bemerkung" title="${escapeHtml(t("transactions.bemerkung"))}">${escapeHtml(tx.bemerkung)}</div>` : ""}</td>
      <td class="amount row-select-cell" ${selectAttrs}>${escapeHtml(formatMoney(cents(tx.betrag)))}</td>
      <td class="row-select-cell" ${selectAttrs}>${escapeHtml(transactionCategoryLabel(tx))}${herkunftMarke(tx)}${renderTransferMarke(tx)}</td>
    </tr>
  `;
}

// Wer die Kategorie gesetzt hat, als Wort (die Regel ist der Normalfall und
// bleibt ohne Marke).
function herkunftMarke(tx) {
  const schluessel = { manuell: "transactions.originManual", agent: "transactions.originAgent" }[tx.kategorie_herkunft];
  return schluessel ? ` <span class="herkunft-marke muted">${escapeHtml(t(schluessel))}</span>` : "";
}

// Transfer-Symbol in der Kategorie-Zelle; bei gepaartem Transfer ein Sprung zur Gegenbuchung.
function renderTransferMarke(tx) {
  if (!tx.ist_transfer) return "";
  const paired = tx.gegenbuchung;
  if (!paired) {
    const label = escapeHtml(t("labels.transfer"));
    return `<span class="chip neutral transfer-marke" title="${label}" aria-label="${label}">${iconSvg("transfer")}</span>`;
  }
  const label = escapeHtml(t("transactions.pairedTransfer"));
  return `<button class="chip neutral transfer-marke transfer-link" data-action="paired-transfer" data-transaction="${escapeHtml(paired.transaktion_id)}" data-account="${escapeHtml(paired.konto_id)}" title="${label}" aria-label="${label}">${iconSvg("transfer")}</button>`;
}

export function renderHerkunft(tx) {
  if (tx.kategorie_herkunft === "manuell") return escapeHtml(t("transactions.originManual"));
  if (tx.kategorie_herkunft === "agent") return escapeHtml(t("transactions.originAgent"));
  const ids = tx.matched_regeln ?? [];
  if (tx.kategorisierung_status === "offen" && ids.length) {
    return `${escapeHtml(t("transactions.originRuleConflict"))} (${ids.map((id) => escapeHtml(id)).join(", ")})`;
  }
  if (tx.kategorie_herkunft === "regel" && ids.length) {
    return ids.map((id) => `<button class="linkish" data-rule="${escapeHtml(id)}">${escapeHtml(id)}</button>`).join(", ");
  }
  if (tx.kategorie_herkunft === "regel") return escapeHtml(t("transactions.originUnknown"));
  return "—";
}

// detail: { transaktion, regelzahlung, vorsorge, immobilie } aus der Antwort.
export function renderTransactionDetail({ transaktion: tx, regelzahlung, vorsorge, immobilie }) {
  const konto = kontenById.get(tx.konto_id);
  const paired = tx.gegenbuchung;
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
        ${mitLogo({ gegenpartei: tx.gegenpartei }, escapeHtml(tx.gegenpartei))}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t("labels.account"))}</div>
      <div class="detail-value">
        <a class="linkish" href="${escapeHtml(zielRoute("open-account-master", tx.konto_id))}" data-action="open-account-master" data-account="${escapeHtml(tx.konto_id)}">${escapeHtml(konto?.name || tx.konto_id)}</a>
      </div>
    </div>
    ${immobilie ? detailRow(
      t("transactions.immobilie"),
      `<a class="linkish" href="${escapeHtml(zielRoute("open-vermoegen-entity", `immobilie:${immobilie.immobilie_id}`))}" data-action="open-vermoegen-entity" data-vklasse="immobilie" data-vid="${escapeHtml(immobilie.immobilie_id)}">${escapeHtml(`${immobilie.immobilie_id} · ${immobilie.bezeichnung}`)}</a>`,
    ) : ""}
    ${tx.bemerkung ? detailRow(t("transactions.bemerkung"), escapeHtml(tx.bemerkung)) : ""}
    ${regelzahlung ? detailRow(
      t("transactions.regelzahlung"),
      `<a class="linkish" href="${escapeHtml(zielRoute("open-regelzahlung", regelzahlung.regelzahlung_id))}" data-action="open-regelzahlung" data-regelzahlung="${escapeHtml(regelzahlung.regelzahlung_id)}">${escapeHtml(`${regelzahlung.regelzahlung_id} · ${regelzahlung.bezeichnung}`)}</a>`,
    ) : ""}
    ${vorsorge ? detailRow(
      t("transactions.vorsorge"),
      `<a class="linkish" href="${escapeHtml(zielRoute("open-vorsorge", vorsorge.vorsorge_id))}" data-action="open-vorsorge" data-vorsorge="${escapeHtml(vorsorge.vorsorge_id)}">${escapeHtml(`${vorsorge.vorsorge_id} · ${vorsorge.name}`)}</a>`,
    ) : ""}
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t("transactions.coreData"))}</div>
      <div class="detail-list">
        ${transactionDetailRow(t("transactions.bookingDate"), formatDate(tx.buchungsdatum))}
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
      <div class="detail-value">${escapeHtml(tx.kategorie_id ? categoryName(tx.kategorie_id) : t("labels.noCategory"))}<br>${statusChip(tx.kategorisierung_status)}<br><span class="detail-sub">${escapeHtml(t("transactions.origin"))}: ${renderHerkunft(tx)}</span></div>
    </div>
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t("transactions.rawSource"))}</div>
      <div class="detail-value muted">${quelleHtml(tx.rohquelle)}</div>
    </div>
    ${paired ? `
      <div class="detail-section">
        <div class="detail-label">${escapeHtml(t("labels.transfer"))}</div>
        <button class="linkish" data-action="paired-transfer" data-transaction="${escapeHtml(paired.transaktion_id)}" data-account="${escapeHtml(paired.konto_id)}">${escapeHtml(t("transactions.pairedTransfer"))}</button>
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

function clearTransactionTimeFilter() {
  state.transactionFilters = ohneZeitfilter(state.transactionFilters);
}

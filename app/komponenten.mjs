// app/komponenten.mjs
// Geteilte, view-uebergreifende UI-Bausteine und Formatierer. Beziehen Zustand,
// i18n und Nachschlage-Maps aus runtime.mjs; kein view-spezifisches Wissen.
import { state, t, escapeHtml, personenById, kategorienById } from "./runtime.mjs";
import { iconSvg } from "./icons.js";
import { linienDiagramm } from "./charts.mjs";
import { localTodayIso } from "./liquiditaet.mjs";
import { formatIban } from "./tools/lib/text.mjs";
import { overviewAccountRow, sortedOverviewAccounts } from "./selektoren.mjs";
import { belegTextHtml } from "./belege.mjs";

export function formatMoney(amountInCents) {
  return new Intl.NumberFormat(state.lang === "de" ? "de-DE" : "en-US", {
    style: "currency",
    currency: "EUR",
  }).format(amountInCents / 100);
}

export function formatDate(dateString) {
  return new Intl.DateTimeFormat(state.lang === "de" ? "de-DE" : "en-US").format(new Date(`${dateString}T00:00:00`));
}

export function formatMonth(monthString) {
  return new Intl.DateTimeFormat(state.lang === "de" ? "de-DE" : "en-US", { month: "long", year: "numeric" })
    .format(new Date(`${monthString}-01T00:00:00`));
}

export function accountOwnerNames(konto) {
  return konto.inhaber_person_ids.map((id) => personenById.get(id)?.name || id).join(", ");
}

export function accountTypeLabel(type) {
  return t(`accountTypes.${type}`) || (type.charAt(0).toUpperCase() + type.slice(1));
}

export function categoryName(categoryId) {
  return kategorienById.get(categoryId)?.name || t("labels.noCategory");
}

// Deterministische Klartext-Erklaerung einer Regel aus ihren Feldern. Macht die
// Match-Semantik ("enthaelt", Gross-/Kleinschreibung egal) explizit, damit z.B.
// "amzn.mktp" nicht als Regex missverstanden wird. Reine Ableitung, kein Feld.
export function regelKlartext(regel, kategorieAufloesen = categoryName) {
  const teile = [];
  if (regel.gegenpartei_pattern) teile.push(`die Gegenpartei den Text »${regel.gegenpartei_pattern}« enthält`);
  if (regel.verwendungszweck_pattern) teile.push(`der Verwendungszweck den Text »${regel.verwendungszweck_pattern}« enthält`);
  if (regel.konto_id) teile.push(`die Buchung auf Konto ${regel.konto_id} liegt`);
  if (regel.vorzeichen === "ausgabe") teile.push(`es eine Ausgabe ist`);
  if (regel.vorzeichen === "einnahme") teile.push(`es eine Einnahme ist`);
  const bedingung = teile.length ? teile.join(" und ") : "die Buchung passt";
  return `Bucht auf ${kategorieAufloesen(regel.kategorie_id)}, wenn ${bedingung} (Groß-/Kleinschreibung egal).`;
}

export function herkunftLabel(tx) {
  if (tx.kategorie_herkunft === "regel") return "Regel";
  if (tx.kategorie_herkunft === "agent") return "Agent";
  if (tx.kategorie_herkunft === "manuell") return "Manuell";
  return "—";
}

export function statusChip(status) {
  const className = status === "offen" ? "review" : status === "bestaetigt" ? "success" : "neutral";
  const icon = status === "offen" ? "review" : status === "bestaetigt" ? "success" : "neutral";
  return `<span class="chip ${className}">${iconSvg(icon)}${escapeHtml(t(`status.${status}`))}</span>`;
}

export function renderPageHead(title, lead, extra = "") {
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

// Quellfeld (rohquelle, quelle_hinweis) als HTML: Text escaped, enthaltene
// Belege/...-Pfade als Link "Quelldokument" auf die Dokumente-Ansicht.
export function quelleHtml(text) {
  return belegTextHtml(text, { titel: t("dokumente.quelldokument"), escape: escapeHtml });
}

export function detailRow(label, valueHtml) {
  return `
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(label)}</div>
      <div class="detail-value">${valueHtml}</div>
    </div>`;
}

export function heuteIso() {
  return localTodayIso();
}

// Saldo-Punktserie als Liniendiagramm (Beträge in Cent). Leere/zu kurze Serien
// liefern nichts — die zugehörige Tabelle bleibt die Quelle der Wahrheit.
export function saldoLinie(punkte, ariaLabel) {
  if (!punkte || punkte.length < 2) return "";
  const svg = linienDiagramm(punkte, { formatWert: (cents) => formatMoney(cents), ariaLabel });
  return svg ? `<div class="diagramm-wrap">${svg}</div>` : "";
}

export function renderTableFilters({ prefix = "", searchFields = [], timeFields = [], fields, filters, filterAttr, clearAction, resetAction, activeCount, resultCount, totalCount }) {
  const effectiveActiveCount = activeCount ?? Object.values(filters).filter(Boolean).length;
  const activeLabel = t(effectiveActiveCount === 1 ? "chrome.filterActiveOne" : "chrome.filterActiveOther");
  const hasResultCount = Number.isFinite(resultCount) && Number.isFinite(totalCount);
  const resetDisabled = effectiveActiveCount === 0;
  return `
    <section class="filter-bar">
      ${prefix}
      ${searchFields.length ? `
      <div class="filter-grid filter-search-row">
        ${searchFields.map((field) => renderFilterSelect({ ...field, filters, filterAttr, clearAction })).join("")}
      </div>` : ""}
      ${timeFields.length ? `
      <div class="filter-grid filter-time-row">
        ${timeFields.map((field) => renderFilterSelect({ ...field, filters, filterAttr, clearAction })).join("")}
      </div>` : ""}
      <div class="filter-grid filter-primary-row">
        ${fields.map((field) => renderFilterSelect({ ...field, filters, filterAttr, clearAction })).join("")}
      </div>
      ${hasResultCount || effectiveActiveCount > 0 ? `
        <div class="filter-actions">
          ${hasResultCount ? `<span class="filter-result-count">${escapeHtml(String(resultCount))} ${escapeHtml(t("chrome.of"))} ${escapeHtml(String(totalCount))} ${escapeHtml(t("chrome.hits"))}</span>` : ""}
          <span class="filter-reset-group ${resetDisabled ? "is-disabled" : ""}">
            <span class="filter-active-count">${effectiveActiveCount > 0 ? `${effectiveActiveCount} ${escapeHtml(activeLabel)}` : ""}</span>
            <button class="filter-reset" data-action="${escapeHtml(resetAction)}"${resetDisabled ? " disabled" : ""}>${iconSvg("clear")}${escapeHtml(t("chrome.clearAllFilters"))}</button>
          </span>
        </div>` : ""}
    </section>
  `;
}

export function renderFilterSelect({ name, label, options, type, placeholder, filters, filterAttr, clearAction }) {
  const active = Boolean(filters[name]);
  const controlId = `${filterAttr}-${name}`;
  let control = "";
  if (type === "search") {
    control = `<input type="search" id="${escapeHtml(controlId)}" data-${escapeHtml(filterAttr)}="${escapeHtml(name)}" value="${escapeHtml(filters[name])}" placeholder="${escapeHtml(placeholder ?? "")}" autocomplete="off">`;
  } else if (type === "date") {
    control = `<input type="date" id="${escapeHtml(controlId)}" data-${escapeHtml(filterAttr)}="${escapeHtml(name)}" value="${escapeHtml(filters[name])}">`;
  } else {
    control = `<select id="${escapeHtml(controlId)}" data-${escapeHtml(filterAttr)}="${escapeHtml(name)}">
        ${options.map(([value, text]) => `<option value="${escapeHtml(value)}" ${filters[name] === value ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}
      </select>`;
  }
  return `
    <div class="filter-field ${active ? "active" : ""} ${type === "search" ? "filter-field-search" : ""}">
      <label for="${escapeHtml(controlId)}">${escapeHtml(label)}</label>
      <div class="filter-control-row">
        ${control}
        ${type === "search" && active ? `<button class="filter-clear" data-action="${escapeHtml(clearAction)}" data-filter-name="${escapeHtml(name)}" aria-label="${escapeHtml(t("chrome.clearFilter"))}" title="${escapeHtml(t("chrome.clearFilter"))}">${iconSvg("clear")}</button>` : ""}
      </div>
    </div>
  `;
}

export function renderAccountTable({ showId = false, rowAction = "account-transactions" } = {}) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${showId ? `<th>${escapeHtml(t("labels.id"))}</th>` : ""}
            <th>${escapeHtml(t("labels.account"))}</th>
            <th>${escapeHtml(t("labels.accountReference"))}</th>
            <th>${escapeHtml(t("labels.owner"))}</th>
            <th>${escapeHtml(t("labels.type"))}</th>
            <th class="amount" title="${escapeHtml(t("labels.valueTodayHint"))}">${escapeHtml(t("labels.valueToday"))}</th>
            <th>${escapeHtml(t("labels.evidence"))}</th>
          </tr>
        </thead>
        <tbody>
          ${renderAccountRows(sortedOverviewAccounts(), { showId, rowAction })}
        </tbody>
      </table>
    </div>
  `;
}

export function renderAccountRows(accounts, { showId = false, rowAction = "account-transactions" } = {}) {
  return accounts
    .map((konto) => {
      const isDepot = konto.kontotyp === "depot";
      const zeile = overviewAccountRow(konto);
      const hatWert = zeile.wert_cents !== null;
      const balanceCell = hatWert
        ? escapeHtml(formatMoney(zeile.wert_cents))
        : `<span class="muted">—</span>`;
      const status = hatWert
        ? `${t(zeile.qualitaet === "belegt" ? "vermoegen.qualityBelegt" : "vermoegen.qualityGeschaetzt")} · ${formatDate(zeile.belegdatum)}${zeile.veraltet ? ` · ${t("labels.standOutdated")}` : ""}`
        : zeile.basis === "bar-ignoriert"
          ? t("labels.cashNotValued")
          : isDepot
            ? t("labels.depotValueMissing")
            : konto.kontoreferenz
              ? t("labels.accountStatusMissing")
              : t("labels.referenceMissing");
      // Rot = kein Beleg (fehlt im Nettovermoegen), Gelb = belegt, aber veraltet.
      const chipClass = !hatWert ? "danger" : zeile.veraltet ? "review" : zeile.qualitaet === "belegt" ? "success" : "neutral";
      const chipIcon = chipClass === "danger" ? "review" : chipClass;
      const selectableAttrs = rowAction === "select-master-account"
        ? ` tabindex="0" role="button" aria-label="${escapeHtml(konto.name)}"`
        : "";
      const accountName = rowAction === "select-master-account"
        ? `<span class="linkish">${escapeHtml(konto.name)}</span>`
        : `<button class="linkish" data-action="${escapeHtml(rowAction)}" data-account="${escapeHtml(konto.konto_id)}">${escapeHtml(konto.name)}</button>`;
      return `
        <tr class="clickable ${konto.konto_id === state.selectedKonto ? "selected" : ""}" id="konto-${escapeHtml(konto.konto_id)}" data-action="${escapeHtml(rowAction)}" data-account="${escapeHtml(konto.konto_id)}"${selectableAttrs}>
          ${showId ? `<td>${escapeHtml(konto.konto_id)}</td>` : ""}
          <td>${accountName}</td>
          <td>${konto.kontoreferenz ? escapeHtml(formatIban(konto.kontoreferenz)) : `<span class="muted">—</span>`}</td>
          <td>${escapeHtml(accountOwnerNames(konto))}</td>
          <td>${escapeHtml(accountTypeLabel(konto.kontotyp))}</td>
          <td class="amount">${balanceCell}</td>
          <td><span class="chip ${chipClass}">${iconSvg(chipIcon)}${escapeHtml(status)}</span></td>
        </tr>
      `;
    })
    .join("");
}

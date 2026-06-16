// app/komponenten.mjs
// Geteilte, view-uebergreifende UI-Bausteine und Formatierer. Beziehen Zustand,
// i18n und Nachschlage-Maps aus runtime.mjs; kein view-spezifisches Wissen.
import { state, t, escapeHtml, personenById, kategorienById } from "./runtime.mjs";
import { iconSvg } from "./icons.js";
import { linienDiagramm } from "./charts.mjs";
import { localTodayIso } from "./liquiditaet.mjs";

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

export function renderTableFilters({ prefix = "", searchFields = [], timeFields = [], fields, filters, filterAttr, clearAction, resetAction, activeCount }) {
  const effectiveActiveCount = activeCount ?? Object.values(filters).filter(Boolean).length;
  const activeLabel = t(effectiveActiveCount === 1 ? "chrome.filterActiveOne" : "chrome.filterActiveOther");
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
      ${effectiveActiveCount > 0 ? `
        <div class="filter-actions">
          <span class="filter-active-count">${effectiveActiveCount} ${escapeHtml(activeLabel)}</span>
          <button class="filter-reset" data-action="${escapeHtml(resetAction)}">${iconSvg("clear")}${escapeHtml(t("chrome.clearAllFilters"))}</button>
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

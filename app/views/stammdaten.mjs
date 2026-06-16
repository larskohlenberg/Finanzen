// app/views/stammdaten.mjs
// Stammdaten: Personen, Konten, Kategorien.
import { data, state, t, escapeHtml } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { renderPageHead, renderAccountTable } from "../komponenten.mjs";
import { missingReferenceChecks } from "../selektoren.mjs";

export function renderMasterdata() {
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


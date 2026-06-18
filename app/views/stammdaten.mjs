// app/views/stammdaten.mjs
// Stammdaten: Personen, Konten, Kategorien, Regeln.
import { data, state, t, escapeHtml } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { renderPageHead, renderAccountTable, regelKlartext, categoryName } from "../komponenten.mjs";
import { missingReferenceChecks, regelWirkung } from "../selektoren.mjs";

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
      <button class="tile ${state.masterSection === "regeln" ? "active" : ""}" data-master-section="regeln">
        <strong>${escapeHtml(t("masterdata.rules"))}</strong>
        <div class="count">${data.kategorisierungsregeln.length}</div>
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
  if (state.masterSection === "regeln") return t("masterdata.rules");
  return t("masterdata.accounts");
}

function renderMasterSection() {
  if (state.masterSection === "personen") {
    return renderSimpleTable([t("masterdata.people"), t("labels.status")], data.personen.map((person) => [person.name, t(`status.${person.status}`)]));
  }
  if (state.masterSection === "kategorien") {
    return renderSimpleTable([t("labels.category"), t("labels.type"), t("labels.status")], data.kategorien.map((category) => [category.name, category.typ, t(`status.${category.status}`)]));
  }
  if (state.masterSection === "regeln") {
    return state.selectedRegel ? renderRegelDetail(state.selectedRegel) : renderRegelListe();
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

function renderRegelListe() {
  const wirkung = regelWirkung();
  const rows = data.kategorisierungsregeln.map((regel) => {
    const treffer = wirkung.get(regel.regel_id)?.anzahl ?? 0;
    const tot = treffer === 0 ? `<span class="chip review">${iconSvg("review")}${escapeHtml(t("masterdata.ruleDead"))}</span>` : "";
    return `
      <tr class="rule-row linkish" data-rule="${escapeHtml(regel.regel_id)}" tabindex="0">
        <td>${escapeHtml(regel.regel_id)}</td>
        <td>${escapeHtml(regelKlartext(regel, categoryName))}</td>
        <td>${escapeHtml(t(`status.${regel.status}`))}</td>
        <td>${treffer} ${tot}</td>
      </tr>`;
  }).join("");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>${escapeHtml(t("labels.id"))}</th>
          <th>${escapeHtml(t("masterdata.ruleCondition"))}</th>
          <th>${escapeHtml(t("labels.status"))}</th>
          <th>${escapeHtml(t("masterdata.ruleHits"))}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderRegelDetail(regelId) {
  const regel = data.kategorisierungsregeln.find((r) => r.regel_id === regelId);
  if (!regel) return renderRegelListe();
  const treffer = regelWirkung().get(regelId)?.transaktionen ?? [];
  const beispiele = [...new Set(treffer.map((tx) => tx.gegenpartei).filter(Boolean))].slice(0, 5);
  const txRows = treffer.slice(0, 50).map((tx) => `
    <tr class="linkish" data-action="open-transaction" data-transaction="${escapeHtml(tx.transaktion_id)}" tabindex="0">
      <td>${escapeHtml(tx.buchungsdatum || "")}</td>
      <td>${escapeHtml(tx.gegenpartei || "")}</td>
    </tr>`).join("");
  return `
    <button class="linkish" data-master-section="regeln">← ${escapeHtml(t("masterdata.rules"))}</button>
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t("masterdata.ruleCondition"))}</div>
      <div class="detail-value">${escapeHtml(regelKlartext(regel, categoryName))}</div>
    </div>
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t("masterdata.ruleNote"))}</div>
      <div class="detail-value">${escapeHtml(regel.kommentar)}</div>
    </div>
    ${beispiele.length ? `<div class="detail-section">
      <div class="detail-label">${escapeHtml(t("masterdata.ruleExamples"))}</div>
      <div class="detail-value muted">${beispiele.map((b) => escapeHtml(b)).join(" · ")}</div>
    </div>` : ""}
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t("masterdata.ruleMatchedTx"))} (${treffer.length})</div>
      <div class="table-wrap"><table><tbody>${txRows}</tbody></table></div>
    </div>`;
}


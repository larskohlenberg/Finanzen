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
    ${state.masterSection === "regeln" ? renderRegelSection() : `
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(sectionTitle())}</h2>
      ${renderMasterSection()}
    </section>`}
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

function regelSortState() {
  return state.regelSort && state.regelSort.key ? state.regelSort : { key: "id", dir: "asc" };
}

function regelSortIndicator(key) {
  const s = regelSortState();
  if (s.key !== key) return "";
  return s.dir === "asc" ? " ▲" : " ▼";
}

function regelSortHeader(key, label) {
  return `<th><button class="linkish sort-th" data-regel-sort="${key}">${escapeHtml(label)}${escapeHtml(regelSortIndicator(key))}</button></th>`;
}

function renderRegelListe() {
  const wirkung = regelWirkung();
  const treffer = (r) => wirkung.get(r.regel_id)?.anzahl ?? 0;
  const s = regelSortState();
  const factor = s.dir === "asc" ? 1 : -1;
  const sorted = [...data.kategorisierungsregeln].sort((a, b) => {
    let cmp = 0;
    if (s.key === "treffer") cmp = treffer(a) - treffer(b);
    else if (s.key === "status") cmp = String(a.status).localeCompare(String(b.status), "de");
    else if (s.key === "bedingung") cmp = regelKlartext(a, categoryName).localeCompare(regelKlartext(b, categoryName), "de");
    if (cmp === 0) cmp = a.regel_id.localeCompare(b.regel_id); // stabiler Tiebreak auf ID
    return cmp * factor;
  });
  const rows = sorted.map((regel) => {
    const n = treffer(regel);
    const tot = n === 0 ? `<span class="chip review">${iconSvg("review")}${escapeHtml(t("masterdata.ruleDead"))}</span>` : "";
    return `
      <tr class="rule-row linkish ${regel.regel_id === state.selectedRegel ? "selected" : ""}" data-rule="${escapeHtml(regel.regel_id)}" tabindex="0">
        <td>${escapeHtml(regel.regel_id)}</td>
        <td>${escapeHtml(regelKlartext(regel, categoryName))}</td>
        <td>${escapeHtml(t(`status.${regel.status}`))}</td>
        <td><span class="rule-hits-cell">${n}${tot}</span></td>
      </tr>`;
  }).join("");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          ${regelSortHeader("id", t("labels.id"))}
          ${regelSortHeader("bedingung", t("masterdata.ruleCondition"))}
          ${regelSortHeader("status", t("labels.status"))}
          ${regelSortHeader("treffer", t("masterdata.ruleHits"))}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// Regel-Bereich als layout-with-rail: Liste bleibt links stehen, das Detail
// oeffnet als Seiten-Rail rechts (analog zum Transaktions-Detail), statt den
// ganzen Bereich auszutauschen.
function renderRegelSection() {
  const regel = state.selectedRegel
    ? data.kategorisierungsregeln.find((r) => r.regel_id === state.selectedRegel)
    : null;
  const railOpen = Boolean(regel);
  const railWide = state.regelRailWide && railOpen;
  return `
    <div class="layout-with-rail ${railOpen ? "" : "rail-closed"} ${railWide ? "rail-wide" : ""} section-spacing">
      <div class="stack">
        <section class="panel panel-pad">
          <h2 class="section-title">${escapeHtml(t("masterdata.rules"))}</h2>
          ${renderRegelListe()}
        </section>
      </div>
      ${railOpen ? `
        <aside class="panel panel-pad detail-panel">
          <div class="detail-head">
            <h2 class="section-title">${escapeHtml(regel.regel_id)}</h2>
            <div class="detail-actions">
              <button class="icon-button" data-action="toggle-regel-rail-width" aria-label="${escapeHtml(state.regelRailWide ? t("masterdata.railNarrow") : t("masterdata.railWide"))}" title="${escapeHtml(state.regelRailWide ? t("masterdata.railNarrow") : t("masterdata.railWide"))}">${iconSvg(state.regelRailWide ? "chevronRight" : "chevronLeft")}</button>
              <button class="icon-button" data-action="close-regel-rail" aria-label="${escapeHtml(t("chrome.closeDetails"))}" title="${escapeHtml(t("chrome.closeDetails"))}">${iconSvg("close")}</button>
            </div>
          </div>
          ${renderRegelDetailBody(regel)}
        </aside>` : ""}
    </div>`;
}

function renderRegelDetailBody(regel) {
  const treffer = regelWirkung().get(regel.regel_id)?.transaktionen ?? [];
  const beispiele = [...new Set(treffer.map((tx) => tx.gegenpartei).filter(Boolean))].slice(0, 5);
  const txRows = treffer.slice(0, 50).map((tx) => `
    <tr class="linkish" data-action="open-transaction" data-transaction="${escapeHtml(tx.transaktion_id)}" tabindex="0">
      <td class="regel-tx-date">${escapeHtml(tx.buchungsdatum || "")}</td>
      <td>${escapeHtml(tx.gegenpartei || "")}</td>
    </tr>`).join("");
  return `
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
      <table class="regel-tx-table"><tbody>${txRows}</tbody></table>
    </div>`;
}


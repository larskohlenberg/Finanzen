// app/views/stammdaten.mjs
// Administration: Stammdaten (Personen, Konten, Kategorien, Regeln), Checks und Export.
import { data, state, t, tf, escapeHtml } from "../runtime.mjs";
import { LEERE_FILTER, filterAlsQuery } from "../navigation.mjs";
import { addInterval } from "../liquiditaet.mjs";
import { iconSvg } from "../icons.js";
import { renderPageHead, renderMasterAccountTable, regelKlartext, categoryName, formatMoney, formatDate } from "../komponenten.mjs";
import { heuteIso, missingReferenceChecks } from "../selektoren.mjs";
import { erstelleApiCache } from "../api-daten.mjs";
import { kontenAntwort } from "./konten-daten.mjs";
import { renderChecks, offeneChecksAnzahl } from "./checks.mjs";
import { renderExport } from "./export.mjs";

export function renderMasterdata() {
  const missingRefs = missingReferenceChecks().length;
  const offeneChecks = offeneChecksAnzahl();
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
        <span class="chip ${missingRefs ? "review" : "success"}">${iconSvg(missingRefs ? "review" : "success")}${missingRefs} ${escapeHtml(t("masterdata.missingRefs"))}</span>
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
      <button class="tile ${state.masterSection === "checks" ? "active" : ""}" data-master-section="checks">
        <strong>${escapeHtml(t("checksPage.title"))}</strong>
        <div class="count">${offeneChecks}</div>
        <span class="chip ${offeneChecks ? "review" : "success"}">${iconSvg(offeneChecks ? "review" : "success")}${escapeHtml(offeneChecks ? t("chrome.openChecks") : t("status.success"))}</span>
      </button>
      <button class="tile ${state.masterSection === "export" ? "active" : ""}" data-master-section="export">
        <strong>${escapeHtml(t("exportPage.title"))}</strong>
        <div class="count">ZIP</div>
        <span class="chip neutral">${iconSvg("download")}${escapeHtml(t("exportPage.herunterladen"))}</span>
      </button>
    </div>
    ${state.masterSection === "checks" ? renderChecks() : state.masterSection === "export" ? renderExport() : state.masterSection === "regeln" ? renderRegelSection() : state.masterSection === "konten" ? renderKontoSection() : `
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
  if (state.masterSection === "kategorien") return renderKategorien();
  return "";
}

function renderKontoSection() {
  // Reihenfolge der Tabelle rechnet der App-Server; das Detail eines Kontos
  // liegt unter Vermoegen -> Konten (eine Zeile fuehrt dorthin).
  const { antwort: konten, fehler } = kontenAntwort(heuteIso());
  if (!konten) {
    return `
    <section class="panel panel-pad section-spacing"><p class="muted" role="status">${escapeHtml(fehler ? `${t("masterdata.kontenLoadFailed")} (${fehler.message})` : t("masterdata.kontenLoading"))}</p></section>`;
  }
  return `
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(t("masterdata.accounts"))}</h2>
      ${renderMasterAccountTable(konten)}
    </section>`;
}

// Kategorien mit Anzahl und Summe ihrer Buchungen der letzten zwoelf Monate
// (Gruppen der Buchungsliste, vom Server). Name und Zahlen fuehren in genau
// diese Buchungen mit demselben Zeitraum.
const kategorienCache = erstelleApiCache({ maxEintraege: 2 });
// Die letzten zwoelf abgeschlossenen Monate (wie Trend und Plan & Ist "12m").
function zwoelfMonate(heute) {
  const monatsAnfang = `${heute.slice(0, 7)}-01`;
  return { von: addInterval(monatsAnfang, "monat", -12), bis: addInterval(monatsAnfang, "tag", -1) };
}
function renderKategorien() {
  const { von, bis } = zwoelfMonate(heuteIso());
  const suche = new URLSearchParams({ gruppe: "kategorie", timeMode: "range", dateFrom: von, dateTo: bis, groesse: "10" });
  if (state.dataMode === "demo") suche.set("quelle", "demo");
  const { antwort } = kategorienCache.hole(`./api/v1/transaktionen?${suche}`);
  const je = new Map((antwort?.gruppen ?? []).map((g) => [g.schluessel, g]));
  const ziel = (id) => {
    const filter = { category: id, timeMode: "range", dateFrom: von, dateTo: bis };
    return `href="${escapeHtml(`#/transaktionen${filterAlsQuery({ ...LEERE_FILTER, ...filter })}`)}" data-action="kategorie-transactions" data-kategorie="${escapeHtml(id)}" data-von="${escapeHtml(von)}" data-bis="${escapeHtml(bis)}" data-transfer="all"`;
  };
  const zeilen = data.kategorien.map((k) => {
    const g = je.get(k.kategorie_id);
    const zahl = (wert) => (antwort ? wert : `<span class="muted">…</span>`);
    return `
      <tr>
        <td><a class="linkish" ${ziel(k.kategorie_id)}>${escapeHtml(k.name)}</a><div class="id-zeile muted">${escapeHtml(k.kategorie_id)}</div></td>
        <td>${escapeHtml(k.typ ?? "")}</td>
        <td>${escapeHtml(t(`status.${k.status}`))}</td>
        <td class="amount">${zahl(g ? g.anzahl : 0)}</td>
        <td class="amount">${zahl(g ? escapeHtml(formatMoney(g.summe_cent)) : `<span class="muted">—</span>`)}</td>
      </tr>`;
  }).join("");
  return `
    <section class="panel panel-pad section-spacing">
      <p class="muted">${escapeHtml(tf("masterdata.kategorienZeitraum", { von: formatDate(von), bis: formatDate(bis) }))}</p>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>${escapeHtml(t("labels.category"))}</th>
            <th>${escapeHtml(t("labels.type"))}</th>
            <th>${escapeHtml(t("labels.status"))}</th>
            <th class="amount">${escapeHtml(t("masterdata.kategorienAnzahl12"))}</th>
            <th class="amount">${escapeHtml(t("masterdata.kategorienSumme12"))}</th>
          </tr></thead>
          <tbody>${zeilen}</tbody>
        </table>
      </div>
    </section>`;
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

// Treffer je Regel zaehlt der Server (GET /api/v1/regelwirkung); fuer die
// gewaehlte Regel kommen dazu die ersten Buchungen und Beispiele.
const wirkungCache = erstelleApiCache();
function regelWirkung(regel = "") {
  const suche = new URLSearchParams();
  if (state.dataMode === "demo") suche.set("quelle", "demo");
  if (regel) suche.set("regel", regel);
  const { antwort, veraltet } = wirkungCache.hole(`./api/v1/regelwirkung?${suche}`);
  // Eine veraltete Antwort gehoert evtl. zu einer anderen Regel.
  return regel && veraltet ? null : antwort;
}

function renderRegelListe() {
  const anzahl = regelWirkung()?.anzahl;
  const treffer = (r) => (anzahl ? anzahl[r.regel_id] ?? 0 : null);
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
        <td><span class="rule-hits-cell">${n ?? "…"}${tot}</span></td>
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
  const wirkung = regelWirkung(regel.regel_id)?.regel;
  const beispiele = wirkung?.beispiele ?? [];
  const txRows = (wirkung?.zeilen ?? []).map((tx) => `
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
      <div class="detail-label">${escapeHtml(t("masterdata.ruleMatchedTx"))} (${wirkung ? wirkung.anzahl : "…"})</div>
      <table class="regel-tx-table"><tbody>${txRows}</tbody></table>
    </div>`;
}

// app/views/vorsorge.mjs
// Read-only Vorsorge-Ansicht: Vertraege, Werte, Pruefstatus und Beitragsbezug.
import { data, state, t, escapeHtml, cents, personenById } from "../runtime.mjs";
import { formatMoney, formatDate, renderPageHead, renderTableFilters, detailRow } from "../komponenten.mjs";
import { iconSvg } from "../icons.js";
import { aktuellerZeitwert } from "../vermoegen.mjs";
import { matchesQuery } from "../tools/lib/text.mjs";

const VORSORGE_ARTEN = ["lebensversicherung", "rentenversicherung", "gesetzliche-rente", "betriebsrente", "riester", "ruerup", "schutzversicherung", "sonstig"];
const VORSORGE_STATUS = ["aktiv", "gekuendigt", "ruhend", "geplant", "laufend", "beendet"];

function personName(personId) {
  return personenById.get(personId)?.name
    || (data.personen ?? []).find((person) => person.person_id === personId)?.name
    || personId
    || "—";
}

function statusLabel(status) {
  const key = `status.${status}`;
  const label = t(key);
  return label === key ? status : label;
}

function vorsorgeArtLabel(art) {
  const key = `vorsorge.art.${art}`;
  const label = t(key);
  return label === key ? art : label;
}

export function setVorsorgeFilter(name, value) {
  if (Object.hasOwn(state.vorsorgeFilters, name)) state.vorsorgeFilters[name] = value;
}

export function resetVorsorgeFilters() {
  state.vorsorgeFilters = { search: "", art: "", person: "", status: "", pruefstatus: "" };
}

export function toggleVorsorgeSort(key) {
  state.vorsorgeSort = state.vorsorgeSort.key === key
    ? { key, dir: state.vorsorgeSort.dir === "asc" ? "desc" : "asc" }
    : { key, dir: "asc" };
}

function vorsorgeWert(vs) {
  if (vs.kapitalbildend) {
    return aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, "rueckkaufswert");
  }
  return aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, "erwartete_rente")
    || aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, "erwartete_kapitalleistung");
}

function sortVorsorge(rows) {
  const { key, dir } = state.vorsorgeSort;
  const factor = dir === "asc" ? 1 : -1;
  const locale = state.lang === "de" ? "de" : "en";
  return rows.slice().sort((a, b) => {
    if (key === "wert") {
      const aw = vorsorgeWert(a);
      const bw = vorsorgeWert(b);
      if (!aw && !bw) return a.vorsorge_id.localeCompare(b.vorsorge_id);
      if (!aw) return 1;
      if (!bw) return -1;
      const cmp = cents(aw.wert) - cents(bw.wert);
      return cmp === 0 ? a.vorsorge_id.localeCompare(b.vorsorge_id) : cmp * factor;
    }
    const value = (vs) => {
      if (key === "name") return vs.name;
      if (key === "art") return vorsorgeArtLabel(vs.art);
      if (key === "person") return personName(vs.person_id);
      if (key === "status") return statusLabel(vs.status);
      return vs.vorsorge_id;
    };
    const av = value(a);
    const bv = value(b);
    const missing = (value) => value == null || value === "" || value === "—";
    if (missing(av) && missing(bv)) return a.vorsorge_id.localeCompare(b.vorsorge_id);
    if (missing(av)) return 1;
    if (missing(bv)) return -1;
    const cmp = String(av).localeCompare(String(bv), locale);
    return cmp === 0 ? a.vorsorge_id.localeCompare(b.vorsorge_id) : cmp * factor;
  });
}

export function vorsorgeRows() {
  const f = state.vorsorgeFilters;
  const rows = (data.vorsorge ?? []).filter((vs) => {
    if (f.art && vs.art !== f.art) return false;
    if (f.person && vs.person_id !== f.person) return false;
    if (f.status && vs.status !== f.status) return false;
    if (f.pruefstatus === "geprueft" && !vs.geprueft_am) return false;
    if (f.pruefstatus === "ungeprueft" && vs.geprueft_am) return false;
    return matchesQuery([
      vs.vorsorge_id,
      vs.name,
      vs.art,
      vorsorgeArtLabel(vs.art),
      personName(vs.person_id),
      vs.status,
      statusLabel(vs.status),
      vs.bemerkung,
      vs.quelle_hinweis,
    ], f.search);
  });
  return sortVorsorge(rows);
}

export function gebuchteBeitraege(vorsorgeId) {
  const regelzahlungIds = new Set(
    (data.regelzahlungen ?? [])
      .filter((rz) => rz.vorsorge_id === vorsorgeId)
      .map((rz) => rz.regelzahlung_id),
  );
  return (data.transaktionen ?? [])
    .filter((tx) => regelzahlungIds.has(tx.regelzahlung_id))
    .slice()
    .sort((a, b) => String(b.buchungsdatum).localeCompare(String(a.buchungsdatum))
      || String(b.transaktion_id).localeCompare(String(a.transaktion_id)))
    .slice(0, 5);
}

function statusChip(vs) {
  const className = vs.status === "aktiv" ? "success" : vs.status === "gekuendigt" || vs.status === "beendet" ? "review" : "neutral";
  return `<span class="chip ${className}">${escapeHtml(statusLabel(vs.status))}</span>`;
}

function vorsorgeBadges(vs) {
  return `
    ${vs.kapitalbildend ? `<span class="chip kapitalbildend">${escapeHtml(t("vorsorge.kapitalbildend"))}</span>` : ""}
    ${vs.geprueft_am
      ? `<span class="chip success">${escapeHtml(t("vorsorge.geprueft"))}: ${escapeHtml(formatDate(vs.geprueft_am))}</span>`
      : `<span class="chip ungeprueft">${escapeHtml(t("vorsorge.ungeprueft"))}</span>`}
  `;
}

function wertHtml(vs) {
  const zw = vorsorgeWert(vs);
  if (!zw) return `<span class="muted">—</span>`;
  if (vs.kapitalbildend) {
    return `
      <strong>${escapeHtml(formatMoney(cents(zw.wert)))}</strong>
      <div class="muted">${escapeHtml(t("vorsorge.rueckkaufswert"))} · ${escapeHtml(formatDate(zw.standdatum))}</div>
    `;
  }
  const labelKey = zw.feld === "erwartete_rente" ? "vorsorge.erwarteteRente" : "vorsorge.erwarteteKapitalleistung";
  return `
    <strong>${escapeHtml(formatMoney(cents(zw.wert)))}</strong>
    <div class="muted">${escapeHtml(t(labelKey))} · ${escapeHtml(t("vorsorge.anwartschaft"))} · ${escapeHtml(formatDate(zw.standdatum))}</div>
  `;
}

function vorsorgeArtOptions() {
  return [["", t("vorsorge.allArten")], ...VORSORGE_ARTEN.map((art) => [art, vorsorgeArtLabel(art)])];
}

function vorsorgePersonOptions() {
  const locale = state.lang === "de" ? "de" : "en";
  return [["", t("vorsorge.allPersonen")], ...(data.personen ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, locale))
    .map((person) => [person.person_id, person.name])];
}

function vorsorgeStatusOptions() {
  return [["", t("vorsorge.allStatus")], ...VORSORGE_STATUS.map((status) => [status, statusLabel(status)])];
}

function renderVorsorgeFilters(resultCount) {
  return renderTableFilters({
    searchFields: [{ name: "search", label: t("vorsorge.filterSearch"), type: "search", placeholder: t("vorsorge.searchPlaceholder") }],
    fields: [
      { name: "art", label: t("vorsorge.filterArt"), options: vorsorgeArtOptions() },
      { name: "person", label: t("vorsorge.filterPerson"), options: vorsorgePersonOptions() },
      { name: "status", label: t("vorsorge.filterStatus"), options: vorsorgeStatusOptions() },
      { name: "pruefstatus", label: t("vorsorge.filterPruefstatus"), options: [["", t("vorsorge.allPruefstatus")], ["geprueft", t("vorsorge.geprueft")], ["ungeprueft", t("vorsorge.ungeprueft")]] },
    ],
    filters: state.vorsorgeFilters,
    filterAttr: "vorsorge-filter",
    clearAction: "clear-vorsorge-filter",
    resetAction: "reset-vorsorge-filters",
    resultCount,
    totalCount: (data.vorsorge ?? []).length,
  });
}

function renderVorsorgeHinweis() {
  return `
    <section class="panel panel-pad section-spacing vorsorge-hint">
      <span class="chip ungeprueft">${escapeHtml(t("vorsorge.ungeprueft"))}</span>
      <p>${escapeHtml(t("vorsorge.ungeprueftHinweis"))}</p>
    </section>`;
}

function vorsorgeSortHeader(key, label, amount = false) {
  const indicator = state.vorsorgeSort.key === key ? (state.vorsorgeSort.dir === "asc" ? " ▲" : " ▼") : "";
  return `<th${amount ? ' class="amount"' : ""}><button class="linkish sort-th" data-vorsorge-sort="${escapeHtml(key)}">${escapeHtml(label)}${escapeHtml(indicator)}</button></th>`;
}

function renderVorsorgeRow(vs) {
  return `
    <tr class="clickable ${vs.vorsorge_id === state.selectedVorsorgeId ? "selected" : ""}" data-action="select-vorsorge" data-vorsorge="${escapeHtml(vs.vorsorge_id)}" tabindex="0" role="button" aria-label="${escapeHtml(vs.name)}">
      <td>${escapeHtml(vs.vorsorge_id)}</td>
      <td><strong>${escapeHtml(vs.name)}</strong>${beitraegeHtml(vs.vorsorge_id)}${nachfolgerHtml(vs)}</td>
      <td>${escapeHtml(vorsorgeArtLabel(vs.art))}</td>
      <td>${escapeHtml(personName(vs.person_id))}</td>
      <td class="amount">${wertHtml(vs)}</td>
      <td><div class="vorsorge-status">${statusChip(vs)}${vorsorgeBadges(vs)}</div></td>
    </tr>`;
}

function renderVorsorgeTabelle(rows) {
  return `
    <section class="panel panel-pad section-spacing">
      ${renderVorsorgeFilters(rows.length)}
      ${rows.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr>
              ${vorsorgeSortHeader("id", t("labels.id"))}
              ${vorsorgeSortHeader("name", t("regelzahlungen.bezeichnung"))}
              ${vorsorgeSortHeader("art", t("labels.type"))}
              ${vorsorgeSortHeader("person", t("labels.owner"))}
              ${vorsorgeSortHeader("wert", t("vermoegen.wert"), true)}
              ${vorsorgeSortHeader("status", t("labels.status"))}
            </tr></thead>
            <tbody>${rows.map(renderVorsorgeRow).join("")}</tbody>
          </table>
        </div>` : `<p class="muted">${escapeHtml(t("vorsorge.noMatches"))}</p>`}
    </section>`;
}

function beitraegeHtml(vorsorgeId) {
  const beitraege = (data.regelzahlungen ?? []).filter((rz) => rz.vorsorge_id === vorsorgeId);
  if (!beitraege.length) return "";
  return `
    <div class="vorsorge-beitraege">
      ${beitraege.map((rz) => `
        <div>
          <span class="muted">${escapeHtml(t("vorsorge.beitrag"))}:</span>
          ${escapeHtml(rz.bezeichnung)} · ${escapeHtml(formatMoney(cents(rz.betrag)))}
        </div>
      `).join("")}
    </div>
  `;
}

function nachfolgerHtml(vs) {
  const nachfolger = (data.vorsorge ?? []).find((candidate) => candidate.ersetzt_vorsorge_id === vs.vorsorge_id);
  if (!vs.kapitalwahl && !nachfolger) return "";
  return `
    <div class="vorsorge-meta">
      ${vs.kapitalwahl ? `<div><span class="muted">${escapeHtml(t("vorsorge.kapitalwahl"))}:</span> ${escapeHtml(vs.kapitalwahl)}</div>` : ""}
      ${nachfolger ? `<div><span class="muted">${escapeHtml(t("vorsorge.nachfolger"))}:</span> ${escapeHtml(nachfolger.name)}</div>` : ""}
    </div>
  `;
}

export function renderVorsorge() {
  const rows = vorsorgeRows();
  const selected = state.selectedVorsorgeId
    ? rows.find((vs) => vs.vorsorge_id === state.selectedVorsorgeId)
    : undefined;
  const railOpen = Boolean(selected);

  return `
    ${renderPageHead(t("vorsorge.title"), t("vorsorge.lead"))}
    <div class="layout-with-rail ${railOpen ? "" : "rail-closed"}">
      <div class="stack">
        ${renderVorsorgeHinweis()}
        ${renderVorsorgeTabelle(rows)}
      </div>
      ${railOpen ? `
        <aside class="panel panel-pad detail-panel">
          <div class="detail-head">
            <h2 class="section-title">${escapeHtml(t("vorsorge.detailTitle"))}</h2>
            <button class="icon-button" data-action="close-vorsorge-rail" aria-label="${escapeHtml(t("chrome.closeDetails"))}">${iconSvg("close")}</button>
          </div>
          ${renderVorsorgeDetail(selected)}
        </aside>` : ""}
    </div>
  `;
}

export function renderVorsorgeDetail(vs) {
  const beitraege = (data.regelzahlungen ?? []).filter((rz) => rz.vorsorge_id === vs.vorsorge_id);
  const gebuchte = gebuchteBeitraege(vs.vorsorge_id);
  const zeitwerte = aktuelleVorsorgeZeitwerte(vs.vorsorge_id);
  const nachfolger = (data.vorsorge ?? []).find((candidate) => candidate.ersetzt_vorsorge_id === vs.vorsorge_id);
  const vorgaenger = vs.ersetzt_vorsorge_id
    ? (data.vorsorge ?? []).find((candidate) => candidate.vorsorge_id === vs.ersetzt_vorsorge_id)
    : undefined;

  return `
    ${detailRow(t("labels.id"), escapeHtml(vs.vorsorge_id))}
    ${detailRow(t("regelzahlungen.bezeichnung"), `<strong>${escapeHtml(vs.name)}</strong>`)}
    ${detailRow(t("labels.type"), escapeHtml(vorsorgeArtLabel(vs.art)))}
    ${detailRow(t("labels.owner"), escapeHtml(personName(vs.person_id)))}
    ${detailRow(t("labels.status"), statusChip(vs))}
    ${renderVorsorgeDates(vs)}
    ${renderVorsorgeZeitwerte(zeitwerte)}
    ${renderVorsorgeNachfolge(vorgaenger, nachfolger)}
    ${renderVorsorgeQuelle(vs)}
    ${vs.bemerkung ? detailRow(t("vorsorge.bemerkung"), escapeHtml(vs.bemerkung)) : ""}
    ${renderErwarteteBeitraege(beitraege)}
    ${renderGebuchteBeitraege(gebuchte)}
  `;
}

function aktuelleVorsorgeZeitwerte(vorsorgeId) {
  return ["rueckkaufswert", "erwartete_rente", "erwartete_kapitalleistung"]
    .map((feld) => aktuellerZeitwert(data.zeitwerte, "vorsorge", vorsorgeId, feld))
    .filter(Boolean);
}

function renderVorsorgeDates(vs) {
  return [
    detailRow(t("vorsorge.kapitalbildendLabel"), escapeHtml(vs.kapitalbildend ? t("labels.yes") : t("labels.no"))),
    vs.kapitalwahl ? detailRow(t("vorsorge.kapitalwahl"), escapeHtml(vs.kapitalwahl)) : "",
    vs.leistung_beginn ? detailRow(t("vorsorge.leistungBeginn"), escapeHtml(formatDate(vs.leistung_beginn))) : "",
    vs.aktiv_bis ? detailRow(t("vorsorge.aktivBis"), escapeHtml(formatDate(vs.aktiv_bis))) : "",
    vs.geprueft_am ? detailRow(t("vorsorge.geprueftAm"), escapeHtml(formatDate(vs.geprueft_am))) : "",
  ].join("");
}

function renderVorsorgeZeitwerte(zeitwerte) {
  if (!zeitwerte.length) return "";
  const feldLabel = {
    rueckkaufswert: t("vorsorge.rueckkaufswert"),
    erwartete_rente: t("vorsorge.erwarteteRente"),
    erwartete_kapitalleistung: t("vorsorge.erwarteteKapitalleistung"),
  };
  const rows = zeitwerte.map((zw) => `
    <div class="rail-item">
      <strong>${escapeHtml(feldLabel[zw.feld] || zw.feld)}</strong>
      <span>${escapeHtml(formatMoney(cents(zw.wert)))}</span>
      <span class="muted">${escapeHtml(formatDate(zw.standdatum))} · ${escapeHtml(t(`vorsorge.qualitaet.${zw.qualitaet}`))}</span>
    </div>`).join("");
  return detailRow(t("vorsorge.zeitwerte"), `<div class="rail-list">${rows}</div>`);
}

function renderVorsorgeNachfolge(vorgaenger, nachfolger) {
  return [
    vorgaenger ? detailRow(t("vorsorge.vorgaenger"), escapeHtml(`${vorgaenger.vorsorge_id} · ${vorgaenger.name}`)) : "",
    nachfolger ? detailRow(t("vorsorge.nachfolger"), escapeHtml(`${nachfolger.vorsorge_id} · ${nachfolger.name}`)) : "",
  ].join("");
}

function renderVorsorgeQuelle(vs) {
  if (!vs.quelle_hinweis && !vs.quelle_standdatum) return "";
  const value = [
    vs.quelle_hinweis ? escapeHtml(vs.quelle_hinweis) : "",
    vs.quelle_standdatum ? escapeHtml(formatDate(vs.quelle_standdatum)) : "",
  ].filter(Boolean).join(" · ");
  return detailRow(t("vorsorge.vertragsquelle"), value);
}

function renderErwarteteBeitraege(beitraege) {
  if (!beitraege.length) return "";
  const rows = beitraege.map((rz) => `
    <div class="rail-item">
      <strong>${escapeHtml(`${rz.regelzahlung_id} · ${rz.bezeichnung}`)}</strong>
      <span>${escapeHtml(formatMoney(cents(rz.betrag)))}</span>
    </div>`).join("");
  return detailRow(t("vorsorge.erwarteteBeitraege"), `<div class="rail-list">${rows}</div>`);
}

function renderGebuchteBeitraege(beitraege) {
  if (!beitraege.length) return "";
  const rows = beitraege.map((tx) => `
    <div class="rail-item">
      <button class="linkish" data-action="open-transaction" data-transaction="${escapeHtml(tx.transaktion_id)}">${escapeHtml(formatDate(tx.buchungsdatum))} · ${escapeHtml(tx.gegenpartei)} · ${escapeHtml(formatMoney(cents(tx.betrag)))}</button>
    </div>`).join("");
  return detailRow(t("vorsorge.gebuchteBeitraege"), `<div class="rail-list">${rows}</div>`);
}

// app/views/vorsorge.mjs
// Read-only Vorsorge-Ansicht: Vertraege, Werte, Pruefstatus und Beitragsbezug.
import { data, t, escapeHtml, cents, personenById } from "../runtime.mjs";
import { formatMoney, formatDate, renderPageHead } from "../komponenten.mjs";
import { aktuellerZeitwert } from "../vermoegen.mjs";

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
  if (vs.kapitalbildend) {
    const rw = aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, "rueckkaufswert");
    if (!rw) return `<span class="muted">—</span>`;
    return `
      <strong>${escapeHtml(formatMoney(cents(rw.wert)))}</strong>
      <div class="muted">${escapeHtml(t("vorsorge.rueckkaufswert"))} · ${escapeHtml(formatDate(rw.standdatum))}</div>
    `;
  }

  const rente = aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, "erwartete_rente");
  const kapital = aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, "erwartete_kapitalleistung");
  const zw = rente || kapital;
  if (!zw) return `<span class="muted">—</span>`;
  const labelKey = zw.feld === "erwartete_rente" ? "vorsorge.erwarteteRente" : "vorsorge.erwarteteKapitalleistung";
  return `
    <strong>${escapeHtml(formatMoney(cents(zw.wert)))}</strong>
    <div class="muted">${escapeHtml(t(labelKey))} · ${escapeHtml(t("vorsorge.anwartschaft"))} · ${escapeHtml(formatDate(zw.standdatum))}</div>
  `;
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
  const vorsorge = data.vorsorge ?? [];
  const rows = vorsorge.map((vs) => `
    <tr>
      <td>
        <strong>${escapeHtml(vs.name)}</strong>
        ${beitraegeHtml(vs.vorsorge_id)}
        ${nachfolgerHtml(vs)}
      </td>
      <td>${escapeHtml(vs.art)}</td>
      <td>${escapeHtml(personName(vs.person_id))}</td>
      <td class="amount">${wertHtml(vs)}</td>
      <td>
        <div class="vorsorge-status">
          ${statusChip(vs)}
          ${vorsorgeBadges(vs)}
        </div>
      </td>
    </tr>
  `).join("");

  return `
    ${renderPageHead(t("vorsorge.title"), t("vorsorge.lead"))}
    <section class="panel panel-pad section-spacing vorsorge-hint">
      <span class="chip ungeprueft">${escapeHtml(t("vorsorge.ungeprueft"))}</span>
      <p>${escapeHtml(t("vorsorge.ungeprueftHinweis"))}</p>
    </section>
    <section class="panel panel-pad section-spacing">
      ${vorsorge.length ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(t("regelzahlungen.bezeichnung"))}</th>
              <th>${escapeHtml(t("labels.type"))}</th>
              <th>${escapeHtml(t("labels.owner"))}</th>
              <th class="amount">${escapeHtml(t("vermoegen.wert"))}</th>
              <th>${escapeHtml(t("labels.status"))}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : `<p class="muted">—</p>`}
    </section>
  `;
}

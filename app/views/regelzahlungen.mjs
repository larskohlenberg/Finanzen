// app/views/regelzahlungen.mjs
// Regelzahlungs-Liste inkl. "Nächste Fälligkeit" je Eintrag.
import { data, t, escapeHtml } from "../runtime.mjs";
import { formatMoney, formatDate, statusChip, renderPageHead } from "../komponenten.mjs";
import { naechsteFaelligkeit, localTodayIso, toCents } from "../liquiditaet.mjs";

function formatRhythmus(einheit, intervall) {
  const key = intervall === 1 ? "eins" : "mehr";
  return t(`rhythmus.${einheit}.${key}`).replace("{n}", String(intervall));
}

export function renderRegelzahlungen() {
  const today = localTodayIso();
  const rows = data.regelzahlungen.map((rz) => {
    // Abgelehnte Regelzahlungen haben keine erwartete Zukunft; sonst der naechste Termin.
    const naechste = rz.status === "abgelehnt" ? null : naechsteFaelligkeit(rz, today);
    return `
    <tr>
      <td>${escapeHtml(rz.bezeichnung)}</td>
      <td class="amount">${escapeHtml(formatMoney(toCents(rz.betrag)))}</td>
      <td>${escapeHtml(formatRhythmus(rz.rhythmus_einheit, rz.rhythmus_intervall))}</td>
      <td>${escapeHtml(formatDate(rz.anker_datum))}</td>
      <td>${naechste ? escapeHtml(formatDate(naechste)) : `<span class="muted">—</span>`}</td>
      <td>${rz.aktiv_bis ? escapeHtml(formatDate(rz.aktiv_bis)) : `<span class="chip neutral">${escapeHtml(t("liquiditaet.qualityOpenEnded"))}</span>`}</td>
      <td>${statusChip(rz.status)}</td>
    </tr>
  `;
  }).join("");
  return `
    ${renderPageHead(t("regelzahlungen.title"), t("regelzahlungen.lead"))}
    <section class="panel panel-pad section-spacing">
      ${data.regelzahlungen.length ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(t("regelzahlungen.bezeichnung"))}</th>
              <th class="amount">${escapeHtml(t("labels.amount"))}</th>
              <th>${escapeHtml(t("regelzahlungen.rhythmus"))}</th>
              <th>${escapeHtml(t("regelzahlungen.anker"))}</th>
              <th>${escapeHtml(t("regelzahlungen.naechsteFaelligkeit"))}</th>
              <th>${escapeHtml(t("regelzahlungen.aktivBis"))}</th>
              <th>${escapeHtml(t("labels.status"))}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : `<p class="muted">${escapeHtml(t("regelzahlungen.empty"))}</p>`}
    </section>
  `;
}


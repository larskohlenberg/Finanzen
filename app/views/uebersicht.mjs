// app/views/uebersicht.mjs
// Übersicht: KPIs (Verfügbares Geld, Nettovermögen), Kacheln für Konten und Depots
// und in der Seitenleiste die anstehenden jährlichen Zahlungen.
import { data, t, escapeHtml } from "../runtime.mjs";
import { formatDate, formatMoney, renderPageHead, renderAccountPanels } from "../komponenten.mjs";
import { buildNextAgentAction } from "../next-action.mjs";
import { currentNettovermoegen, overviewAccountGroups, overviewJahreszahlungen } from "../selektoren.mjs";
import { toCents } from "../liquiditaet.mjs";

// Kachel-Fusszeile: nur der Stand (aeltestes eingerechnetes Datum) und ein Link.
function kpiNote(datum, view, linkKey) {
  const stand = datum ? `${t("labels.stand")} ${formatDate(datum)}` : t("labels.noStand");
  return `${escapeHtml(stand)} · <button class="linkish" data-view="${escapeHtml(view)}">${escapeHtml(t(linkKey))}</button>`;
}

// Jaehrliche Regelzahlungen der naechsten drei Monate; ein Klick fuehrt zur Regelzahlung.
function renderJahreszahlungen() {
  const termine = overviewJahreszahlungen(3);
  const liste = termine.length
    ? `<div class="rail-list">${termine.map(({ datum, regelzahlung: rz }) => `
        <div class="rail-item">
          <button class="linkish" data-action="open-regelzahlung" data-regelzahlung="${escapeHtml(rz.regelzahlung_id)}">${escapeHtml(rz.bezeichnung)}</button>
          <span class="muted">${escapeHtml(formatDate(datum))} · ${escapeHtml(formatMoney(toCents(rz.betrag)))}</span>
        </div>`).join("")}</div>`
    : `<p class="muted">${escapeHtml(t("overview.jahreszahlungenLeer"))}</p>`;
  return `
        <section class="panel panel-pad jahreszahlungen-rail">
          <h2 class="section-title"><button class="linkish" data-view="regelzahlungen">${escapeHtml(t("overview.jahreszahlungen"))}</button></h2>
          <p class="page-lead">${escapeHtml(t("overview.jahreszahlungenLead"))}</p>
          ${liste}
        </section>`;
}

export function renderOverview() {
  const nextAction = buildNextAgentAction(data);
  const gruppen = overviewAccountGroups();
  const verfuegbar = gruppen.konten;
  const netto = currentNettovermoegen();
  const nettoStand = netto.positionen.map((p) => p.standdatum).filter(Boolean).sort()[0] ?? "";
  return `
    ${renderPageHead(t("overview.title"), "")}
    <div class="layout-with-rail">
      <div class="stack">
        <div class="overview-kpis">
          <section class="panel hero-kpi" aria-labelledby="kpi-balance-label">
            <div>
              <div class="kpi-label" id="kpi-balance-label">${escapeHtml(t("overview.availableMoney"))}</div>
              <div class="kpi-value">${escapeHtml(formatMoney(verfuegbar.summe_cents))}</div>
              <div class="kpi-note">${kpiNote(verfuegbar.aeltester, "liquiditaet", "overview.liquidityLink")}</div>
            </div>
          </section>
          <section class="panel hero-kpi" aria-labelledby="kpi-depot-label">
            <div>
              <div class="kpi-label" id="kpi-depot-label">${escapeHtml(t("overview.depotTotal"))}</div>
              <div class="kpi-value">${escapeHtml(formatMoney(gruppen.depots.summe_cents))}</div>
              <div class="kpi-note">${kpiNote(gruppen.depots.aeltester, "vermoegen", "overview.netWorthLink")}</div>
            </div>
          </section>
          <section class="panel hero-kpi" aria-labelledby="kpi-networth-label">
            <div>
              <div class="kpi-label" id="kpi-networth-label">${escapeHtml(t("nav.vermoegen"))}</div>
              <div class="kpi-value">${escapeHtml(formatMoney(netto.netto_cents))}</div>
              <div class="kpi-note">${kpiNote(nettoStand, "vermoegen", "overview.netWorthLink")}</div>
            </div>
          </section>
        </div>
        ${renderAccountPanels()}
      </div>
      <aside class="rail overview-rail">
        <section class="panel panel-pad next-action">
          <h2 class="section-title">${escapeHtml(t("chrome.nextAction"))}</h2>
          <button class="linkish" data-action="copy-next-agent-prompt" ${nextAction.type === "none" ? "disabled" : ""}>${escapeHtml(nextAction.type === "none" ? t("chrome.noAgentAction") : nextAction.label)}</button>
          <p class="page-lead">${escapeHtml(t("chrome.copyAgentPrompt"))}</p>
        </section>
        ${renderJahreszahlungen()}
      </aside>
    </div>
  `;
}

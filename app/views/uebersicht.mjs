// app/views/uebersicht.mjs
// Übersicht: KPIs (Verfügbares Geld, Nettovermögen) + Kacheln für Konten und Depots.
import { data, t, escapeHtml } from "../runtime.mjs";
import { accountGroupCoverage, formatMoney, renderPageHead, renderAccountPanels } from "../komponenten.mjs";
import { buildNextAgentAction } from "../next-action.mjs";
import { currentNettovermoegen, overviewAccountGroups, overviewCheckPreviewItems } from "../selektoren.mjs";
import { renderCheckItems } from "./checks.mjs";

export function renderOverview() {
  const nextAction = buildNextAgentAction(data);
  const verfuegbar = overviewAccountGroups().konten;
  return `
    ${renderPageHead(t("overview.title"), "")}
    <div class="layout-with-rail">
      <div class="stack">
        <div class="overview-kpis">
          <section class="panel hero-kpi" aria-labelledby="kpi-balance-label">
            <div>
              <div class="kpi-label" id="kpi-balance-label">${escapeHtml(t("overview.availableMoney"))}</div>
              <div class="kpi-value">${escapeHtml(formatMoney(verfuegbar.summe_cents))}</div>
              <div class="kpi-note">${escapeHtml(`${t("overview.availableNote")} · ${accountGroupCoverage(verfuegbar)}`)}</div>
            </div>
          </section>
          <section class="panel hero-kpi" aria-labelledby="kpi-networth-label">
            <div>
              <div class="kpi-label" id="kpi-networth-label">${escapeHtml(t("nav.vermoegen"))}</div>
              <div class="kpi-value">${escapeHtml(formatMoney(currentNettovermoegen().netto_cents))}</div>
              <div class="kpi-note">${escapeHtml(t("overview.netWorthNote"))} · <button class="linkish" data-view="vermoegen">${escapeHtml(t("overview.netWorthLink"))}</button></div>
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
        <section class="panel panel-pad checks-rail">
          <h2 class="section-title">${escapeHtml(t("overview.checksPreview"))}</h2>
          <div class="rail-list">${renderCheckItems(overviewCheckPreviewItems())}</div>
        </section>
      </aside>
    </div>
  `;
}

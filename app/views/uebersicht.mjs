// app/views/uebersicht.mjs
// Übersicht: KPIs (Nettovermögen, geladene Salden) + Konten-Tabelle.
import { data, t, escapeHtml } from "../runtime.mjs";
import { formatMoney, renderPageHead, renderAccountTable } from "../komponenten.mjs";
import { buildNextAgentAction } from "../next-action.mjs";
import { currentNettovermoegen, loadedTotalAccountsBalance } from "../selektoren.mjs";
import { renderCheckItems } from "./checks.mjs";

export function renderOverview() {
  const nextAction = buildNextAgentAction(data);
  return `
    ${renderPageHead(t("overview.title"), "")}
    <div class="layout-with-rail">
      <div class="stack">
        <div class="overview-kpis">
          <section class="panel hero-kpi" aria-labelledby="kpi-balance-label">
            <div>
              <div class="kpi-label" id="kpi-balance-label">${escapeHtml(t("overview.totalBalance"))}</div>
              <div class="kpi-value">${escapeHtml(formatMoney(loadedTotalAccountsBalance()))}</div>
              <div class="kpi-note">${escapeHtml(t("overview.balanceNote"))}</div>
            </div>
          </section>
          <section class="panel hero-kpi" aria-labelledby="kpi-networth-label">
            <div>
              <div class="kpi-label" id="kpi-networth-label">${escapeHtml(t("nav.vermoegen"))}</div>
              <div class="kpi-value">${escapeHtml(formatMoney(currentNettovermoegen().netto_cents))}</div>
              <div class="kpi-note">${escapeHtml(t("overview.netWorthNote"))}</div>
            </div>
          </section>
        </div>
        <section class="panel panel-pad">
          <h2 class="section-title">${escapeHtml(t("overview.accountBalances"))}</h2>
          ${renderAccountTable()}
        </section>
      </div>
      <aside class="rail overview-rail">
        <section class="panel panel-pad next-action">
          <h2 class="section-title">${escapeHtml(t("chrome.nextAction"))}</h2>
          <button class="linkish" data-action="copy-next-agent-prompt" ${nextAction.type === "none" ? "disabled" : ""}>${escapeHtml(nextAction.type === "none" ? t("chrome.noAgentAction") : nextAction.label)}</button>
          <p class="page-lead">${escapeHtml(t("chrome.copyAgentPrompt"))}</p>
        </section>
        <section class="panel panel-pad checks-rail">
          <h2 class="section-title">${escapeHtml(t("overview.checksPreview"))}</h2>
          <div class="rail-list">${renderCheckItems(data.checks.slice(0, 4))}</div>
        </section>
      </aside>
    </div>
  `;
}

// app/views/checks.mjs
// Prüfungen: Transfer-Checks + Vermögens-Checks.
import { data, t, escapeHtml, cents, transaktionenById, kontenById } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { formatMoney, renderPageHead } from "../komponenten.mjs";
import { currentVermoegenChecks } from "../selektoren.mjs";

function transferChecks() {
  return (data.transfers || []).map((transfer) => {
    const abgang = transaktionenById.get(transfer.abgang_transaktion_id);
    const zugang = transaktionenById.get(transfer.zugang_transaktion_id);
    const ok =
      !!abgang &&
      !!zugang &&
      abgang.ist_transfer === true &&
      zugang.ist_transfer === true &&
      abgang.transfer_id === transfer.transfer_id &&
      zugang.transfer_id === transfer.transfer_id;
    return { transfer_id: transfer.transfer_id, betrag: transfer.betrag, ok };
  });
}

export function renderChecks() {
  const transferResults = transferChecks();
  const m5 = currentVermoegenChecks();
  const groups = [
    [t("checksPage.validation"), data.checks.filter((check) => check.scope === "datenstand")],
    [t("checksPage.categories"), data.checks.filter((check) => check.scope === "transaktion")],
    [t("checksPage.accountReferences"), data.checks.filter((check) => check.scope === "konto")],
    [t("checksPage.transfers"), transferResults.map((tc) => ({ severity: tc.ok ? "success" : "review" }))],
    [t("nav.vermoegen"), m5.map(() => ({ severity: "review" }))],
  ];
  return `
    ${renderPageHead(t("checksPage.title"), t("checksPage.lead"))}
    <div class="tile-grid">
      ${groups.map(([label, checks]) => `
        <div class="tile tile-static">
          <strong>${escapeHtml(label)}</strong>
          <div class="count">${checks.length}</div>
          <span class="chip ${checks.some((check) => check.severity === "review") ? "review" : "success"}">${checks.some((check) => check.severity === "review") ? iconSvg("review") : iconSvg("success")}${escapeHtml(checks.some((check) => check.severity === "review") ? t("status.review") : t("status.success"))}</span>
        </div>
      `).join("")}
    </div>
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(t("checksPage.title"))}</h2>
      <div class="rail-list">${renderCheckItems(data.checks)}</div>
    </section>
    ${(data.importfehler?.length ?? 0) > 0 ? `
      <section class="panel panel-pad section-spacing">
        <h2 class="section-title">${escapeHtml(t("checksPage.importErrors"))}</h2>
        <p class="page-lead">${escapeHtml(t("checksPage.importErrorsLead"))}</p>
        <div class="rail-list">
          ${data.importfehler.map((fehler) => `
            <div class="rail-item">
              <span class="chip danger">${iconSvg("warning")}${escapeHtml(fehler.reason)}</span>
              <span>${escapeHtml(fehler.rohquelle)} · ${escapeHtml(t("labels.row"))} ${escapeHtml(String(fehler.row ?? "-"))}</span>
              <span class="muted">${escapeHtml(fehler.detail)}</span>
            </div>
          `).join("")}
        </div>
      </section>
    ` : ""}
    ${transferResults.length > 0 ? `
      <section class="panel panel-pad section-spacing">
        <h2 class="section-title">${escapeHtml(t("checksPage.transfers"))}</h2>
        <p class="page-lead">${escapeHtml(t("checksPage.transfersLead"))}</p>
        <div class="rail-list">
          ${transferResults.map((tc) => `
            <div class="rail-item">
              <span class="chip ${tc.ok ? "success" : "review"}">${tc.ok ? iconSvg("success") : iconSvg("review")}${escapeHtml(tc.ok ? t("checksPage.transferOk") : t("checksPage.transferIncomplete"))}</span>
              <span>${escapeHtml(tc.transfer_id)} · ${escapeHtml(formatMoney(cents(tc.betrag)))}</span>
            </div>
          `).join("")}
        </div>
      </section>
    ` : ""}
    ${m5.length > 0 ? `
      <section class="panel panel-pad section-spacing">
        <h2 class="section-title">${escapeHtml(t("nav.vermoegen"))}</h2>
        <div class="rail-list">
          ${m5.map((check) => `
            <div class="rail-item">
              <span class="chip review">${iconSvg("review")}${escapeHtml(t(`vermoegen.checkArt.${check.art}`))}</span>
              <button class="linkish" data-action="open-vermoegen-entity" data-vklasse="${escapeHtml(check.entitaet)}" data-vid="${escapeHtml(check.entitaet_id)}">${escapeHtml(check.entitaet_id)}</button>
              <span class="muted">${escapeHtml(check.text)}</span>
            </div>
          `).join("")}
        </div>
      </section>
    ` : ""}
  `;
}

export function renderCheckItems(checks) {
  return checks.map((check) => {
    const title = check.title ?? t(check.title_key);
    const detail = check.detail ?? t(check.detail_key);
    const affected = check.entity_id ? affectedLabel(check) : data.metadata.label;
    const buttonAttrs = check.scope === "vermoegen"
      ? `data-action="open-vermoegen-entity" data-vklasse="${escapeHtml(check.entitaet || "")}" data-vid="${escapeHtml(check.entity_id || "")}"`
      : `data-action="open-entity" data-scope="${escapeHtml(check.scope)}" data-entity="${escapeHtml(check.entity_id || "")}"`;
    return `
      <div class="rail-item">
        <span class="chip ${check.severity === "success" ? "success" : "review"}">${check.severity === "success" ? iconSvg("success") : iconSvg("review")}${escapeHtml(title)}</span>
        <button class="linkish" ${buttonAttrs}>${escapeHtml(affected)}</button>
        <span class="muted">${escapeHtml(detail)}</span>
      </div>
    `;
  }).join("");
}

function affectedLabel(check) {
  if (check.scope === "vermoegen") return check.entity_id;
  if (check.scope === "konto") return kontenById.get(check.entity_id)?.name || check.entity_id;
  if (check.scope === "transaktion") {
    const tx = transaktionenById.get(check.entity_id);
    return tx ? `${tx.buchungsdatum} · ${tx.gegenpartei}` : check.entity_id;
  }
  return check.entity_id;
}

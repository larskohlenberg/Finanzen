// app/views/liquiditaet.mjs
// Liquiditäts-Ansicht: Ist-Saldo + Prognose (Tabellen und Liniendiagramme).
import { data, state, t, escapeHtml } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { formatMoney, formatDate, renderPageHead, saldoLinie, heuteIso } from "../komponenten.mjs";
import { computeLiquiditaetIst, computeLiquiditaetPrognoseDetail } from "../liquiditaet.mjs";

function prognosePunkte(prognose) {
  const punkte = [{ wert: prognose.start_saldo_cents }];
  for (const periode of prognose.perioden) {
    for (const monat of periode.monate) {
      for (const posten of monat.posten) punkte.push({ wert: posten.saldo_cents });
    }
  }
  return punkte;
}

function renderSaldoVerlauf(verlauf, emptyKey) {
  if (!verlauf.length) return `<p class="muted">${escapeHtml(t(emptyKey))}</p>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(t("labels.date"))}</th>
            <th class="amount">${escapeHtml(t("liquiditaet.movement"))}</th>
            <th class="amount">${escapeHtml(t("liquiditaet.balance"))}</th>
          </tr>
        </thead>
        <tbody>
          ${verlauf.map((punkt) => `
            <tr>
              <td>${escapeHtml(formatDate(punkt.datum))}${punkt.bezeichnung ? ` · ${escapeHtml(punkt.bezeichnung)}` : ""}</td>
              <td class="amount">${escapeHtml(formatMoney(punkt.bewegung_cents))}</td>
              <td class="amount">${escapeHtml(formatMoney(punkt.saldo_cents))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function renderLiquiditaet() {
  const today = heuteIso();
  const ist = computeLiquiditaetIst(data, { today });
  const prognose = computeLiquiditaetPrognoseDetail(data, {
    today,
    horizonEnd: state.liquiditaet.bisDatum,
    granularitaet: state.liquiditaet.granularitaet,
  });
  const istChipClass = ist.qualitaet.fehlende_anker > 0 ? "review" : "success";
  const istChipIcon = ist.qualitaet.fehlende_anker > 0 ? iconSvg("review") : iconSvg("success");
  const vorschlaegeChip = prognose.qualitaet.vorschlaege_nicht_enthalten > 0
    ? `<span class="chip review">${iconSvg("review")}${escapeHtml(String(prognose.qualitaet.vorschlaege_nicht_enthalten))} ${escapeHtml(t("liquiditaet.qualityProposalsExcluded"))}</span>`
    : "";
  const unbefristetChip = prognose.qualitaet.unbefristete_regelzahlungen > 0
    ? `<span class="chip neutral">${escapeHtml(String(prognose.qualitaet.unbefristete_regelzahlungen))} ${escapeHtml(t("liquiditaet.qualityOpenEnded"))}</span>`
    : "";
  const granButtons = ["monat", "quartal", "jahr"]
    .map((g) => `<button class="chip ${state.liquiditaet.granularitaet === g ? "success" : "neutral"} linkish" data-liquiditaet-gran="${g}">${escapeHtml(t(`liquiditaet.gran.${g}`))}</button>`)
    .join("");
  return `
    ${renderPageHead(t("liquiditaet.title"), t("liquiditaet.lead"))}
    <div class="tile-grid">
      <div class="tile tile-static">
        <strong>${escapeHtml(t("liquiditaet.ist"))}</strong>
        <div class="count">${escapeHtml(formatMoney(ist.saldo_cents))}</div>
        <span class="chip ${istChipClass}">${istChipIcon}${escapeHtml(String(ist.qualitaet.fehlende_anker))} ${escapeHtml(t("liquiditaet.qualityMissingAnchors"))}</span>
      </div>
      <div class="tile tile-static">
        <strong>${escapeHtml(t("liquiditaet.prognose"))}</strong>
        <div class="count">${escapeHtml(formatMoney(prognose.end_saldo_cents))}</div>
        <span class="chip neutral">${escapeHtml(String(prognose.qualitaet.bestaetigte_regelzahlungen))} ${escapeHtml(t("liquiditaet.qualityConfirmed"))}</span>
        ${vorschlaegeChip}
        ${unbefristetChip}
        <span class="chip neutral">${escapeHtml(t("liquiditaet.horizonTo"))} ${escapeHtml(prognose.horizont_ende)}</span>
      </div>
    </div>
    <p class="page-lead section-note">${escapeHtml(t("liquiditaet.incompleteNote"))}</p>
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(t("liquiditaet.ist"))} · ${escapeHtml(t("liquiditaet.monthlyTable"))}</h2>
      ${saldoLinie(ist.monatsverlauf.map((p) => ({ wert: p.saldo_cents })), `${t("liquiditaet.balance")}: ${formatMoney(ist.monatsverlauf.at(0)?.saldo_cents ?? 0)} → ${formatMoney(ist.monatsverlauf.at(-1)?.saldo_cents ?? 0)}`)}
      ${renderSaldoVerlauf(ist.monatsverlauf, "liquiditaet.emptyIst")}
    </section>
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(t("liquiditaet.prognose"))} · ${escapeHtml(t("liquiditaet.forecastTable"))}</h2>
      <div class="liquiditaet-filter">
        <span>${granButtons}</span>
        <label class="liquiditaet-bis">${escapeHtml(t("liquiditaet.forecastUntil"))}
          <input type="date" data-control="liquiditaet-bis" value="${escapeHtml(state.liquiditaet.bisDatum)}" />
        </label>
      </div>
      ${saldoLinie(prognosePunkte(prognose), `${t("liquiditaet.prognose")}: ${formatMoney(prognose.start_saldo_cents)} → ${formatMoney(prognose.end_saldo_cents)}`)}
      ${renderLiquiditaetPrognoseDetail(prognose)}
    </section>
  `;
}

function formatMonat(monat) {
  return new Intl.DateTimeFormat(state.lang === "de" ? "de-DE" : "en-US", { month: "long", year: "numeric" }).format(new Date(`${monat}-01T00:00:00`));
}

function formatPeriode(periode) {
  if (periode.includes("-Q")) {
    const [jahr, q] = periode.split("-");
    return `${q} ${jahr}`;
  }
  if (/^\d{4}$/.test(periode)) return periode;
  return formatMonat(periode);
}

function laufendMarkup(istLaufend) {
  if (!istLaufend) return "";
  return `<span class="chip neutral">${escapeHtml(t("liquiditaet.running"))}</span><div class="running-note muted">${escapeHtml(t("liquiditaet.runningNote"))}</div>`;
}

function renderLiquiditaetPostenRows(posten) {
  return posten.map((p) => `
    <tr class="row-posten">
      <td class="posten-cell">${escapeHtml(formatDate(p.datum))} · ${escapeHtml(p.bezeichnung)}</td>
      <td class="amount">${escapeHtml(formatMoney(p.bewegung_cents))}</td>
      <td class="amount">${escapeHtml(formatMoney(p.saldo_cents))}</td>
    </tr>
  `).join("");
}

function renderLiquiditaetMonatRows(monat, nested) {
  const expanded = state.liquiditaetExpanded.has(monat.monat);
  const monthRow = `
    <tr class="row-month ${nested ? "nested" : ""}">
      <td>
        <button class="row-toggle" data-liquiditaet-toggle="${escapeHtml(monat.monat)}">
          <span class="toggle-icon">${expanded ? iconSvg("chevronDown") : iconSvg("chevronRight")}</span>${escapeHtml(formatMonat(monat.monat))}
        </button>
        ${laufendMarkup(monat.ist_laufend)}
      </td>
      <td class="amount">${escapeHtml(formatMoney(monat.bewegung_cents))}</td>
      <td class="amount">${escapeHtml(formatMoney(monat.saldo_cents))}</td>
    </tr>
  `;
  return monthRow + (expanded ? renderLiquiditaetPostenRows(monat.posten) : "");
}

function renderLiquiditaetPrognoseDetail(prognose) {
  if (!prognose.perioden.length) return `<p class="muted">${escapeHtml(t("liquiditaet.emptyForecast"))}</p>`;
  const gran = state.liquiditaet.granularitaet;
  const body = prognose.perioden.map((periode) => {
    if (gran === "monat") {
      return periode.monate.map((monat) => renderLiquiditaetMonatRows(monat, false)).join("");
    }
    const expanded = state.liquiditaetExpanded.has(periode.periode);
    const periodRow = `
      <tr class="row-period">
        <td>
          <button class="row-toggle" data-liquiditaet-toggle="${escapeHtml(periode.periode)}">
            <span class="toggle-icon">${expanded ? iconSvg("chevronDown") : iconSvg("chevronRight")}</span>${escapeHtml(formatPeriode(periode.periode))}
          </button>
          ${laufendMarkup(periode.ist_laufend)}
        </td>
        <td class="amount">${escapeHtml(formatMoney(periode.bewegung_cents))}</td>
        <td class="amount">${escapeHtml(formatMoney(periode.saldo_cents))}</td>
      </tr>
    `;
    const monatsZeilen = expanded ? periode.monate.map((monat) => renderLiquiditaetMonatRows(monat, true)).join("") : "";
    return periodRow + monatsZeilen;
  }).join("");
  return `
    <div class="table-wrap">
      <table class="liquiditaet-detail">
        <thead>
          <tr>
            <th>${escapeHtml(t("liquiditaet.period"))}</th>
            <th class="amount">${escapeHtml(t("liquiditaet.movement"))}</th>
            <th class="amount">${escapeHtml(t("liquiditaet.balance"))}</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

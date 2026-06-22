// app/views/szenarien.mjs
// Szenarien-Liste + Detail (Szenario vs. Basis). App ist nur Anzeige (ADR 0006) —
// Szenarien und Annahmen entstehen ausschliesslich ueber den Agenten.
import { data, state, t, escapeHtml, cents } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { formatMoney, formatDate, renderPageHead } from "../komponenten.mjs";
import { linienDiagramm } from "../charts.mjs";
import { computeSzenario } from "../szenarien.mjs";
import { localTodayIso, addInterval } from "../liquiditaet.mjs";

function qualitaetChip(q) {
  const stil = { belegt: ["success", "success", "Belegt"], geschaetzt: ["neutral", "", "Geschaetzt"], offen: ["review", "review", "Offen"] };
  const [cls, icon, wort] = stil[q] ?? stil.offen;
  return `<span class="chip ${cls}">${icon ? iconSvg(icon) : ""}${escapeHtml(t(`szenarien.quality${wort}`))}</span>`;
}

function statusChip(status) {
  const stil = { entwurf: "neutral", bestaetigt: "success", verworfen: "review" };
  return `<span class="chip ${stil[status] ?? "neutral"}">${escapeHtml(t(`szenarien.status.${status}`))}</span>`;
}

function rhythmusLabel(einheit, intervall) {
  const e = t(`vermoegen.rhythmus.${einheit}`);
  const einheitText = e === `vermoegen.rhythmus.${einheit}` ? einheit : e;
  return Number(intervall) > 1 ? `${intervall} ${einheitText}` : einheitText;
}

function gegenbuchungLabel(g) {
  const ziel = g.ziel_id ? g.ziel_id : (g.neue_position?.bezeichnung ?? "—");
  return `${escapeHtml(t(`szenarien.zielTyp.${g.ziel_typ}`))}: ${escapeHtml(ziel)}`;
}

function annahmeInhalt(a) {
  if (a.art === "einmalzahlung") {
    const teile = [escapeHtml(formatDate(a.datum)), escapeHtml(formatMoney(cents(a.betrag)))];
    if (a.gegenbuchung) teile.push(gegenbuchungLabel(a.gegenbuchung));
    return teile.join(" · ");
  }
  if (a.art === "regelzahlung-neu") {
    const teile = [
      `${escapeHtml(t("szenarien.ab"))} ${escapeHtml(formatDate(a.ab))}`,
      `${escapeHtml(formatMoney(cents(a.betrag)))} / ${escapeHtml(rhythmusLabel(a.rhythmus_einheit, a.rhythmus_intervall))}`,
    ];
    if (a.gegenbuchung) teile.push(gegenbuchungLabel(a.gegenbuchung));
    return teile.join(" · ");
  }
  if (a.art === "regelzahlung-aenderung") {
    const aktion = a.aktion === "beenden"
      ? escapeHtml(t("szenarien.aktionBeenden"))
      : `${escapeHtml(t("szenarien.aktionBetragAendern"))}: ${escapeHtml(formatMoney(cents(a.betrag)))}`;
    return `${escapeHtml(a.regelzahlung_id)} · ${escapeHtml(t("szenarien.ab"))} ${escapeHtml(formatDate(a.ab))} · ${aktion}`;
  }
  return "—";
}

function staleNote(szenario, today) {
  if (addInterval(szenario.stand, "monat", 6) >= today) return "";
  const text = `${t("szenarien.stalenessVon")} ${formatDate(szenario.stand)} ${t("szenarien.stalenessHinweis")}`;
  return `<p class="page-lead"><span class="chip review">${iconSvg("review")}${escapeHtml(text)}</span></p>`;
}

export function renderSzenarien() {
  const today = localTodayIso();
  const szenarien = data.szenarien ?? [];
  const selected = state.selectedSzenarioId ? szenarien.find((s) => s.szenario_id === state.selectedSzenarioId) : undefined;
  if (state.selectedSzenarioId && !selected) state.selectedSzenarioId = "";

  if (selected) return renderSzenarioDetail(selected, today);

  const rows = szenarien.map((sz) => {
    const r = computeSzenario(data, sz, today);
    const ende = r.szenario.punkte[r.szenario.punkte.length - 1];
    return `
    <tr class="clickable" data-action="select-szenario" data-szenario="${escapeHtml(sz.szenario_id)}" tabindex="0" role="button" aria-label="${escapeHtml(sz.name)}">
      <td>${escapeHtml(sz.name)}</td>
      <td>${statusChip(sz.status)}</td>
      <td>${escapeHtml(String(sz.annahmen?.length ?? 0))}</td>
      <td>${escapeHtml(formatDate(sz.reichweite_bis))}</td>
      <td class="amount ${ende && ende.liquide_cents < 0 ? "amount-negativ" : ""}">${ende ? escapeHtml(formatMoney(ende.liquide_cents)) : "—"}</td>
      <td>${qualitaetChip(r.szenario.qualitaet)}</td>
    </tr>`;
  }).join("");

  return `
    ${renderPageHead(t("szenarien.title"), t("szenarien.lead"))}
    <section class="panel">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>${escapeHtml(t("szenarien.name"))}</th>
            <th>${escapeHtml(t("szenarien.statusHead"))}</th>
            <th>${escapeHtml(t("szenarien.annahmenAnzahl"))}</th>
            <th>${escapeHtml(t("szenarien.reichweite"))}</th>
            <th class="amount">${escapeHtml(t("szenarien.liquideEnde"))}</th>
            <th>${escapeHtml(t("szenarien.qualitaetHead"))}</th>
          </tr></thead>
          <tbody>${rows || `<tr><td colspan="6" class="muted">${escapeHtml(t("szenarien.noSzenarien"))}</td></tr>`}</tbody>
        </table>
      </div>
    </section>`;
}

function renderSzenarioDetail(szenario, today) {
  const r = computeSzenario(data, szenario, today);
  const sEnde = r.szenario.punkte[r.szenario.punkte.length - 1];
  const bEnde = r.basis.punkte[r.basis.punkte.length - 1];

  const liquideSerie = r.szenario.punkte.map((p) => ({ wert: p.liquide_cents }));
  const liquideBasis = r.basis.punkte.map((p) => ({ wert: p.liquide_cents }));
  const nettoSerie = r.szenario.punkte.map((p) => ({ wert: p.netto_cents }));
  const nettoBasis = r.basis.punkte.map((p) => ({ wert: p.netto_cents }));

  const warnungenHtml = r.szenario.warnungen.length ? `
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(t("szenarien.warnungenTitle"))}</h2>
      <div class="rail-list">
        ${r.szenario.warnungen.map((w) => `
          <div class="rail-item">
            <span class="chip ${w.code === "liquiditaet-negativ" ? "danger" : "review"}">${iconSvg("review")}${escapeHtml(w.code)}</span>
            <span>${escapeHtml(w.text)}</span>
          </div>
        `).join("")}
      </div>
    </section>` : "";

  const annahmenHtml = `
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(t("szenarien.annahmenTitle"))}</h2>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>${escapeHtml(t("szenarien.artHead"))}</th>
            <th>${escapeHtml(t("szenarien.inhalt"))}</th>
            <th>${escapeHtml(t("szenarien.qualitaetHead"))}</th>
            <th>${escapeHtml(t("szenarien.begruendung"))}</th>
          </tr></thead>
          <tbody>
            ${(szenario.annahmen ?? []).map((a) => `
              <tr>
                <td>${escapeHtml(t(`szenarien.art.${a.art}`))}</td>
                <td>${annahmeInhalt(a)}</td>
                <td>${qualitaetChip(a.qualitaet)}</td>
                <td>${a.begruendung ? escapeHtml(a.begruendung) : "—"}</td>
              </tr>
            `).join("") || `<tr><td colspan="4" class="muted">${escapeHtml(t("szenarien.noAnnahmen"))}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>`;

  return `
    ${renderPageHead(szenario.name, szenario.beschreibung || "", `<button class="linkish" data-action="back-to-szenarien">${iconSvg("chevronLeft")}${escapeHtml(t("szenarien.backToList"))}</button>`)}
    ${staleNote(szenario, today)}
    <div class="tile-grid">
      <div class="tile tile-static">
        <strong>${escapeHtml(t("szenarien.liquideEnde"))}</strong>
        <div class="count ${sEnde && sEnde.liquide_cents < 0 ? "amount-negativ" : ""}">${sEnde ? escapeHtml(formatMoney(sEnde.liquide_cents)) : "—"}</div>
        <div class="kpi-note">${escapeHtml(t("szenarien.basis"))}: ${bEnde ? escapeHtml(formatMoney(bEnde.liquide_cents)) : "—"}</div>
      </div>
      <div class="tile tile-static">
        <strong>${escapeHtml(t("szenarien.nettoEnde"))}</strong>
        <div class="count">${sEnde ? escapeHtml(formatMoney(sEnde.netto_cents)) : "—"}</div>
        <div class="kpi-note">${escapeHtml(t("szenarien.basis"))}: ${bEnde ? escapeHtml(formatMoney(bEnde.netto_cents)) : "—"}</div>
      </div>
      <div class="tile tile-static">
        <strong>${escapeHtml(t("szenarien.qualitaetHead"))}</strong>
        ${qualitaetChip(r.szenario.qualitaet)}
      </div>
    </div>
    ${warnungenHtml}
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(t("szenarien.liquiditaetVerlauf"))}</h2>
      ${liquideSerie.length > 1 ? `<div class="diagramm-wrap">${linienDiagramm(liquideSerie, { vergleich: liquideBasis, formatWert: (c) => formatMoney(c), ariaLabel: t("szenarien.liquiditaetVerlauf") })}</div>` : `<p class="muted">${escapeHtml(t("szenarien.zuWenigPunkte"))}</p>`}
    </section>
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(t("szenarien.nettovermoegenVerlauf"))}</h2>
      ${nettoSerie.length > 1 ? `<div class="diagramm-wrap">${linienDiagramm(nettoSerie, { vergleich: nettoBasis, formatWert: (c) => formatMoney(c), ariaLabel: t("szenarien.nettovermoegenVerlauf") })}</div>` : `<p class="muted">${escapeHtml(t("szenarien.zuWenigPunkte"))}</p>`}
      <p class="page-lead">${escapeHtml(t("szenarien.sachwerteEingefroren"))}</p>
    </section>
    ${annahmenHtml}
  `;
}

// app/views/vermoegen.mjs
// Vermögens-/Nettovermögens-Ansicht inkl. Detail-Rail und Wertstände.
import { data, state, t, escapeHtml, cents, kontenById, personenById } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { formatMoney, formatDate, detailRow, renderPageHead, saldoLinie, renderTableFilters, accountOwnerNames, accountTypeLabel } from "../komponenten.mjs";
import { computeNettovermoegen, aktuellerZeitwert, anteilWertCents, restschuldHeute } from "../vermoegen.mjs";
import { localTodayIso } from "../liquiditaet.mjs";

function positionKey(p) {
  return `${p.klasse}:${p.id}`;
}

function entityLabel(entitaet, entitaetId) {
  if (entitaet === "konto") return kontenById.get(entitaetId)?.name || entitaetId;
  if (entitaet === "immobilie") return data.immobilien?.find((i) => i.immobilie_id === entitaetId)?.bezeichnung || entitaetId;
  if (entitaet === "vermoegenswert") return data.vermoegenswerte?.find((v) => v.vermoegenswert_id === entitaetId)?.bezeichnung || entitaetId;
  if (entitaet === "darlehen") return data.darlehen?.find((d) => d.darlehen_id === entitaetId)?.bezeichnung || entitaetId;
  return entitaetId;
}

function zeitwertLabel(zw) {
  const fieldKey = `vermoegen.feld.${zw.feld}`;
  const field = t(fieldKey) === fieldKey ? zw.feld : t(fieldKey);
  return `${entityLabel(zw.entitaet, zw.entitaet_id)} · ${field}`;
}

function filterVermoegenPositions(positionen) {
  const f = state.vermoegenFilters;
  return positionen.filter((p) => {
    if (f.klasse && p.klasse !== f.klasse) return false;
    if (f.qualitaet === "fehlend" && !p.fehlt) return false;
    if (f.qualitaet === "belegt" && p.qualitaet !== "belegt") return false;
    if (f.qualitaet === "geschaetzt" && p.qualitaet !== "geschaetzt") return false;
    return true;
  });
}

function sortVermoegenPositions(positionen) {
  const { key, dir } = state.vermoegenSort;
  const factor = dir === "asc" ? 1 : -1;
  const qualitaetRank = (p) => (p.fehlt ? 2 : p.qualitaet === "geschaetzt" ? 1 : 0);
  return positionen.slice().sort((a, b) => {
    let cmp;
    if (key === "wert") cmp = a.wert_cents - b.wert_cents;
    else if (key === "stand") cmp = String(a.standdatum ?? "").localeCompare(String(b.standdatum ?? ""));
    else if (key === "qualitaet") cmp = qualitaetRank(a) - qualitaetRank(b);
    else if (key === "position") cmp = a.name.localeCompare(b.name);
    else cmp = t(`vermoegen.klasse.${a.klasse}`).localeCompare(t(`vermoegen.klasse.${b.klasse}`));
    if (cmp === 0) cmp = a.name.localeCompare(b.name);
    return cmp * factor;
  });
}

function vermoegenSortIndicator(key) {
  if (state.vermoegenSort.key !== key) return "";
  return state.vermoegenSort.dir === "asc" ? " ▲" : " ▼";
}

function vermoegenSortHeader(key, labelKey, amount = false) {
  return `<th${amount ? ' class="amount"' : ""}><button class="linkish sort-th" data-vermoegen-sort="${key}">${escapeHtml(t(labelKey))}${escapeHtml(vermoegenSortIndicator(key))}</button></th>`;
}

function qualitaetChip(p) {
  if (p.fehlt || !p.qualitaet) return `<span class="chip review">${iconSvg("review")}${escapeHtml(t("vermoegen.qualityFehlend"))}</span>`;
  return `<span class="chip ${p.qualitaet === "belegt" ? "success" : "neutral"}">${p.qualitaet === "belegt" ? iconSvg("success") : ""}${escapeHtml(t(`vermoegen.quality${p.qualitaet === "belegt" ? "Belegt" : "Geschaetzt"}`))}</span>`;
}

// Read-only Rückverweis: Szenarien, die eine Sondertilgung auf dieses Darlehen
// planen. Hat KEINEN Einfluss auf restschuldHeute/p.wert_cents — rein informativ.
function sondertilgungsRueckverweise(darlehenId) {
  const treffer = [];
  for (const sz of data.szenarien ?? []) {
    for (const a of sz.annahmen ?? []) {
      if (a.gegenbuchung?.ziel_typ === "darlehen" && a.gegenbuchung.ziel_id === darlehenId) {
        treffer.push({ szenario_id: sz.szenario_id, name: sz.name, status: sz.status, qualitaet: a.qualitaet });
      }
    }
  }
  return treffer;
}

function annahmeQualitaetChip(q) {
  const stil = { belegt: ["success", "success", "Belegt"], geschaetzt: ["neutral", "", "Geschaetzt"], offen: ["review", "review", "Offen"] };
  const [cls, icon, wort] = stil[q] ?? stil.offen;
  return `<span class="chip ${cls}">${icon ? iconSvg(icon) : ""}${escapeHtml(t(`szenarien.quality${wort}`))}</span>`;
}

function szenarioStatusChip(status) {
  const stil = { entwurf: "neutral", bestaetigt: "success", verworfen: "review" };
  return `<span class="chip ${stil[status] ?? "neutral"}">${escapeHtml(t(`szenarien.status.${status}`))}</span>`;
}

function sondertilgungenRow(darlehenId) {
  const treffer = sondertilgungsRueckverweise(darlehenId);
  if (!treffer.length) return "";
  const rows = treffer.map((tr) => `
    <div class="rail-item">
      <button class="linkish" data-action="open-szenario" data-szenario="${escapeHtml(tr.szenario_id)}">${escapeHtml(tr.name)}</button>
      ${szenarioStatusChip(tr.status)}
      ${annahmeQualitaetChip(tr.qualitaet)}
    </div>`).join("");
  return detailRow(t("vermoegen.sondertilgungenTitle"), `<div class="rail-list">${rows}</div><p class="muted">${escapeHtml(t("vermoegen.sondertilgungenHinweis"))}</p>`);
}

// Worst-of-Badge: traegt die schlechteste Qualitaet aller Positionen als eine
// ehrliche Gesamtaussage (belegt < geschaetzt < offen). Quelle: vermoegen.mjs.
function gesamtQualitaetChip(gesamt) {
  if (!gesamt) return "";
  const stil = { belegt: ["success", "success", "Belegt"], geschaetzt: ["neutral", null, "Geschaetzt"], offen: ["review", "review", "Offen"] };
  const [cls, icon, wort] = stil[gesamt];
  return `<span class="chip ${cls}">${icon ? iconSvg(icon) : ""}${escapeHtml(t("vermoegen.qualityOverall"))}: ${escapeHtml(t(`vermoegen.quality${wort}`))}</span>`;
}

export function renderVermoegen() {
  const today = localTodayIso();
  const r = computeNettovermoegen(data, today);
  const visible = sortVermoegenPositions(filterVermoegenPositions(r.positionen));
  const selected = state.selectedVermoegenId ? visible.find((p) => positionKey(p) === state.selectedVermoegenId) : undefined;
  if (state.selectedVermoegenId && !selected) state.selectedVermoegenId = "";
  const railWide = state.vermoegenRailWide;
  const detailRailOpen = !state.vermoegenDetailRailClosed && (state.vermoegenRailMode === "wertstaende" || Boolean(selected));

  const rows = visible.map((p) => {
    const key = positionKey(p);
    return `
    <tr class="clickable ${key === state.selectedVermoegenId ? "selected" : ""} ${p.fehlt ? "open" : ""}" data-action="select-vermoegen" data-vermoegen="${escapeHtml(key)}" tabindex="0" role="button" aria-label="${escapeHtml(p.name)}">
      <td>${escapeHtml(t(`vermoegen.klasse.${p.klasse}`))}</td>
      <td>${escapeHtml(p.name)}</td>
      <td class="amount">${p.fehlt ? `<span class="muted">${escapeHtml(t("vermoegen.standOhne"))}</span>` : escapeHtml(formatMoney(p.wert_cents))}</td>
      <td>${p.standdatum ? escapeHtml(formatDate(p.standdatum)) : "—"}</td>
      <td>${qualitaetChip(p)}</td>
    </tr>`;
  }).join("");

  return `
    ${renderPageHead(t("vermoegen.title"), t("vermoegen.lead"))}
    <div class="layout-with-rail ${detailRailOpen ? "" : "rail-closed"} ${railWide && detailRailOpen ? "rail-wide" : ""}">
      <div class="stack">
        <div class="tile-grid">
          <div class="tile tile-static">
            <strong>${escapeHtml(t("vermoegen.netto"))}</strong>
            <div class="count">${escapeHtml(formatMoney(r.netto_cents))}</div>
            <div class="kpi-note">${escapeHtml(t("vermoegen.aktiva"))}: ${escapeHtml(formatMoney(r.aktiva_cents))} · ${escapeHtml(t("vermoegen.passiva"))}: ${escapeHtml(formatMoney(r.passiva_cents))}</div>
          </div>
          <div class="tile tile-static">
            <strong>${escapeHtml(t("vermoegen.qualitaetTitle"))}</strong>
            <div class="count">${r.positionen.length}</div>
            ${gesamtQualitaetChip(r.qualitaet.gesamt)}
            <span class="chip success">${iconSvg("success")}${r.qualitaet.belegt} ${escapeHtml(t("vermoegen.qualityBelegt"))}</span>
            <span class="chip neutral">${r.qualitaet.geschaetzt} ${escapeHtml(t("vermoegen.qualityGeschaetzt"))}</span>
            ${r.qualitaet.fehlend > 0 ? `<span class="chip review">${iconSvg("review")}${r.qualitaet.fehlend} ${escapeHtml(t("vermoegen.qualityFehlend"))}</span>` : ""}
          </div>
          <button class="tile ${state.vermoegenRailMode === "wertstaende" ? "active" : ""}" data-action="show-vermoegen-wertstaende">
            <strong>${escapeHtml(t("vermoegen.wertstaende"))}</strong>
            <div class="count">${escapeHtml(String(data.zeitwerte?.length ?? 0))}</div>
            <span class="chip neutral">${escapeHtml(t("vermoegen.allWertstaende"))}</span>
          </button>
        </div>
        <p class="page-lead">${escapeHtml(t("vermoegen.incompleteNote"))}</p>
        ${renderVermoegenFilters(visible.length, r.positionen.length)}
        <section class="panel">
          <div class="table-wrap">
            <table>
              <thead><tr>
                ${vermoegenSortHeader("klasse", "vermoegen.klasseHead")}
                ${vermoegenSortHeader("position", "vermoegen.position")}
                ${vermoegenSortHeader("wert", "vermoegen.wert", true)}
                ${vermoegenSortHeader("stand", "vermoegen.stand")}
                ${vermoegenSortHeader("qualitaet", "vermoegen.qualitaetHead")}
              </tr></thead>
              <tbody>${rows || `<tr><td colspan="5" class="muted">${escapeHtml(t("vermoegen.noMatches"))}</td></tr>`}</tbody>
            </table>
          </div>
        </section>
      </div>
      ${detailRailOpen ? `
        <aside class="panel panel-pad detail-panel">
          <div class="detail-head">
            <h2 class="section-title">${escapeHtml(state.vermoegenRailMode === "wertstaende" ? t("vermoegen.wertstaende") : t("vermoegen.detailTitle"))}</h2>
            <div class="detail-actions">
              ${state.vermoegenRailMode === "wertstaende" ? `<button class="icon-button" data-action="toggle-vermoegen-rail-width" aria-label="${escapeHtml(railWide ? t("vermoegen.railNarrow") : t("vermoegen.railWide"))}" title="${escapeHtml(railWide ? t("vermoegen.railNarrow") : t("vermoegen.railWide"))}">${iconSvg(railWide ? "chevronRight" : "chevronLeft")}</button>` : ""}
              <button class="icon-button" data-action="close-vermoegen-detail-rail" aria-label="${escapeHtml(t("chrome.closeDetails"))}" title="${escapeHtml(t("chrome.closeDetails"))}">${iconSvg("close")}</button>
            </div>
          </div>
          ${state.vermoegenRailMode === "wertstaende" ? renderWertstaendeRail() : renderVermoegenDetail(selected, today)}
        </aside>
      ` : ""}
    </div>`;
}

function renderVermoegenFilters(resultCount, totalCount) {
  return renderTableFilters({
    fields: [
      {
        name: "klasse",
        label: t("vermoegen.filterKlasse"),
        options: [
        ["", t("vermoegen.filterAll")],
        ["konto", t("vermoegen.klasse.konto")],
        ["immobilie", t("vermoegen.klasse.immobilie")],
        ["vermoegenswert", t("vermoegen.klasse.vermoegenswert")],
        ["darlehen", t("vermoegen.klasse.darlehen")],
        ],
      },
      {
        name: "qualitaet",
        label: t("vermoegen.filterQualitaet"),
        options: [
        ["", t("vermoegen.filterAll")],
        ["belegt", t("vermoegen.qualityBelegt")],
        ["geschaetzt", t("vermoegen.qualityGeschaetzt")],
        ["fehlend", t("vermoegen.qualityFehlend")],
        ],
      },
    ],
    filters: state.vermoegenFilters,
    filterAttr: "vermoegen-filter",
    clearAction: "clear-vermoegen-filter",
    resetAction: "reset-vermoegen-filters",
    resultCount,
    totalCount,
  });
}

function basisLabel(basis) {
  const key = `vermoegen.basisLabels.${basis}`;
  const text = t(key);
  return text === key ? basis : text;
}

function anteileHtml(eigentumsanteile, marktwertCents) {
  return (eigentumsanteile ?? []).map((a) => {
    const name = a.extern === true || !a.person_id
      ? t("vermoegen.externerAnteil")
      : (personenById.get(a.person_id)?.name || a.person_id);
    const teilCents = a.extern === true || !a.person_id ? 0 : anteilWertCents(marktwertCents, [a]);
    const teil = a.extern === true || !a.person_id ? "—" : formatMoney(teilCents);
    return `<div>${escapeHtml(name)}: <strong>${escapeHtml(String(a.zaehler))}/${escapeHtml(String(a.nenner))}</strong> · ${escapeHtml(teil)}</div>`;
  }).join("");
}

function zeitwerteForPosition(p) {
  if (!p) return [];
  const fieldsByKlasse = {
    konto: ["kontostand", "depotwert"],
    immobilie: ["marktwert"],
    vermoegenswert: ["marktwert"],
    darlehen: ["restschuld"],
  };
  const fields = fieldsByKlasse[p.klasse] ?? [];
  return (data.zeitwerte ?? [])
    .filter((zw) => zw.entitaet === p.klasse && zw.entitaet_id === p.id && fields.includes(zw.feld))
    .sort((a, b) => b.standdatum.localeCompare(a.standdatum) || b.feld.localeCompare(a.feld));
}

function zeitwertQualityChip(zw) {
  return qualitaetChip({ qualitaet: zw.qualitaet, fehlt: false });
}

function renderPositionWertstaende(p) {
  const rows = zeitwerteForPosition(p);
  if (!rows.length) {
    return detailRow(t("vermoegen.wertstaende"), `<span class="muted">${escapeHtml(t("vermoegen.noWertstaende"))}</span>`);
  }
  const html = rows.slice(0, 5).map((zw) => `
    <div class="wertstand-item">
      <div><strong>${escapeHtml(formatMoney(cents(zw.wert)))}</strong> <span class="muted">${escapeHtml(formatDate(zw.standdatum))}</span></div>
      <div>${zeitwertQualityChip(zw)}</div>
      ${zw.quelle_hinweis ? `<div class="muted">${escapeHtml(zw.quelle_hinweis)}</div>` : ""}
    </div>`).join("");
  const more = rows.length > 5
    ? `<button class="linkish" data-action="show-vermoegen-wertstaende">${escapeHtml(t("vermoegen.showAllWertstaende"))}</button>`
    : "";
  return detailRow(t("vermoegen.wertstaende"), `<div class="wertstand-list">${html}${more}</div>`);
}

function renderWertstaendeRail() {
  const rows = (data.zeitwerte ?? [])
    .slice()
    .sort((a, b) => b.standdatum.localeCompare(a.standdatum) || zeitwertLabel(a).localeCompare(zeitwertLabel(b)))
    .map((zw) => `
      <tr>
        <td>${escapeHtml(zeitwertLabel(zw))}<br><span class="muted">${escapeHtml(zw.entitaet_id)}</span></td>
        <td>${escapeHtml(formatDate(zw.standdatum))}</td>
        <td class="amount">${escapeHtml(formatMoney(cents(zw.wert)))}</td>
        <td>${zeitwertQualityChip(zw)}</td>
        <td>${zw.quelle_hinweis ? escapeHtml(zw.quelle_hinweis) : "—"}</td>
      </tr>`).join("");
  return `
    <p class="page-lead">${escapeHtml(t("vermoegen.wertstaendeLead"))}</p>
    <div class="table-wrap wertstaende-table">
      <table>
        <thead><tr>
          <th>${escapeHtml(t("vermoegen.position"))}</th>
          <th>${escapeHtml(t("vermoegen.stand"))}</th>
          <th class="amount">${escapeHtml(t("vermoegen.wert"))}</th>
          <th>${escapeHtml(t("vermoegen.qualitaetHead"))}</th>
          <th>${escapeHtml(t("transactions.rawSource"))}</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="muted">${escapeHtml(t("vermoegen.noWertstaende"))}</td></tr>`}</tbody>
      </table>
    </div>`;
}

function renderVermoegenDetail(p, today) {
  const head = `
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t(`vermoegen.klasse.${p.klasse}`))}</div>
      <div class="detail-value"><strong>${escapeHtml(p.name)}</strong><br>${qualitaetChip(p)}</div>
    </div>`;

  if (p.klasse === "konto") {
    const konto = kontenById.get(p.id);
    const istDepot = konto?.kontotyp === "depot";
    const feld = istDepot ? "depotwert" : "kontostand";
    const zw = aktuellerZeitwert(data.zeitwerte, "konto", p.id, feld);
    let buchungenHtml = "";
    if (!istDepot && zw) {
      let summe = 0;
      for (const tx of data.transaktionen ?? []) {
        if (tx.konto_id !== p.id) continue;
        if (tx.buchungsdatum <= zw.standdatum) continue;
        if (tx.buchungsdatum > today) continue;
        summe += cents(tx.betrag);
      }
      buchungenHtml = detailRow(t("vermoegen.buchungenSeitAnker"), escapeHtml(formatMoney(summe)));
    }
    return head
      + detailRow(t("labels.owner"), escapeHtml(accountOwnerNames(konto || {})))
      + detailRow(t("labels.type"), escapeHtml(accountTypeLabel(konto?.kontotyp || "")))
      + (zw
        ? detailRow(istDepot ? t("vermoegen.depotwert") : t("vermoegen.anker"),
            `<strong>${escapeHtml(formatMoney(cents(zw.wert)))}</strong><br>${escapeHtml(formatDate(zw.standdatum))} · ${qualitaetChip({ qualitaet: zw.qualitaet })}${zw.quelle_hinweis ? `<br><span class="muted">${escapeHtml(zw.quelle_hinweis)}</span>` : ""}`)
        : detailRow(t("vermoegen.anker"), `<span class="chip review">${iconSvg("review")}${escapeHtml(t("vermoegen.qualityFehlend"))}</span>`))
      + buchungenHtml
      + detailRow(t("vermoegen.aktuellerSaldo"),
          `${p.fehlt ? `<span class="muted">${escapeHtml(t("vermoegen.standOhne"))}</span>` : `<strong>${escapeHtml(formatMoney(p.wert_cents))}</strong>`}<br><span class="muted">${escapeHtml(basisLabel(p.basis))}</span>`)
      + renderPositionWertstaende(p);
  }

  if (p.klasse === "immobilie" || p.klasse === "vermoegenswert") {
    const entitaet = p.klasse === "immobilie" ? "immobilie" : "vermoegenswert";
    const entity = (p.klasse === "immobilie" ? data.immobilien : data.vermoegenswerte)?.find((e) => (e.immobilie_id || e.vermoegenswert_id) === p.id);
    const mw = aktuellerZeitwert(data.zeitwerte, entitaet, p.id, "marktwert");
    const mwCents = mw ? cents(mw.wert) : 0;
    return head
      + (entity?.typ ? detailRow(t("labels.type"), escapeHtml(t(`vermoegen.typ.${entity.typ}`))) : "")
      + (entity?.adresse ? detailRow(t("vermoegen.adresse"), escapeHtml(entity.adresse)) : "")
      + (mw
        ? detailRow(t("vermoegen.marktwert"),
            `<strong>${escapeHtml(formatMoney(mwCents))}</strong><br>${escapeHtml(formatDate(mw.standdatum))} · ${qualitaetChip({ qualitaet: mw.qualitaet })}${mw.quelle_hinweis ? `<br><span class="muted">${escapeHtml(mw.quelle_hinweis)}</span>` : ""}`)
        : detailRow(t("vermoegen.marktwert"), `<span class="chip review">${iconSvg("review")}${escapeHtml(t("vermoegen.qualityFehlend"))}</span>`))
      + (entity?.eigentumsanteile ? detailRow(t("vermoegen.eigentumsanteile"), anteileHtml(entity.eigentumsanteile, mwCents)) : "")
      + detailRow(t("vermoegen.anteiligerWert"),
          p.fehlt ? `<span class="muted">${escapeHtml(t("vermoegen.standOhne"))}</span>` : `<strong>${escapeHtml(formatMoney(p.wert_cents))}</strong>`)
      + renderPositionWertstaende(p);
  }

  if (p.klasse === "darlehen") {
    const dar = data.darlehen?.find((d) => d.darlehen_id === p.id);
    const anker = aktuellerZeitwert(data.zeitwerte, "darlehen", p.id, "restschuld");
    const verknuepft = [];
    if (dar?.immobilie_id) {
      const imm = data.immobilien?.find((i) => i.immobilie_id === dar.immobilie_id);
      verknuepft.push(`<button class="linkish" data-action="open-vermoegen-entity" data-vklasse="immobilie" data-vid="${escapeHtml(dar.immobilie_id)}">${escapeHtml(imm?.bezeichnung || dar.immobilie_id)}</button>`);
    }
    if (dar?.konto_id) {
      verknuepft.push(escapeHtml(kontenById.get(dar.konto_id)?.name || dar.konto_id));
    }
    return head
      + (anker
        ? detailRow(t("vermoegen.anker"),
            `<strong>${escapeHtml(formatMoney(cents(anker.wert)))}</strong><br>${escapeHtml(formatDate(anker.standdatum))} · ${qualitaetChip({ qualitaet: anker.qualitaet })}${anker.quelle_hinweis ? `<br><span class="muted">${escapeHtml(anker.quelle_hinweis)}</span>` : ""}`)
        : detailRow(t("vermoegen.anker"), `<span class="chip review">${iconSvg("review")}${escapeHtml(t("vermoegen.qualityFehlend"))}</span>`))
      + detailRow(t("vermoegen.restschuld"),
          `${p.fehlt ? `<span class="muted">${escapeHtml(t("vermoegen.standOhne"))}</span>` : `<strong>${escapeHtml(formatMoney(Math.abs(p.wert_cents)))}</strong>`}<br><span class="muted">${escapeHtml(basisLabel(p.basis))}</span>`)
      + restschuldVerlaufRow(dar, today)
      + sondertilgungenRow(p.id)
      + (dar?.zinssatz ? detailRow(t("vermoegen.zinssatz"), `${escapeHtml(dar.zinssatz)} %`) : "")
      + (dar?.sollrate ? detailRow(t("vermoegen.rate"), `${escapeHtml(formatMoney(cents(dar.sollrate)))} / ${escapeHtml(rhythmusLabel(dar.rhythmus_einheit, dar.rhythmus_intervall))}`) : "")
      + (verknuepft.length ? detailRow(t("vermoegen.verknuepft"), verknuepft.join(" · ")) : "")
      + renderPositionWertstaende(p);
  }

  return head;
}

// Restschuld-Verlauf seit Anker als Linie (Anker + je Ratentermin). Die Nulllinie
// der Komponente zeigt den Weg zur Null (abbezahlt). Erst ab zwei Punkten.
function restschuldVerlaufRow(dar, today) {
  if (!dar) return "";
  const r = restschuldHeute(dar, data.zeitwerte, today);
  if (!r.punkte || r.punkte.length < 2) return "";
  const svg = saldoLinie(
    r.punkte.map((pt) => ({ wert: pt.wert_cents })),
    `${t("vermoegen.restschuldVerlauf")}: ${formatMoney(r.punkte[0].wert_cents)} → ${formatMoney(r.punkte.at(-1).wert_cents)}`,
  );
  return svg ? detailRow(t("vermoegen.restschuldVerlauf"), svg) : "";
}

function rhythmusLabel(einheit, intervall) {
  const e = t(`vermoegen.rhythmus.${einheit}`);
  const einheitText = e === `vermoegen.rhythmus.${einheit}` ? einheit : e;
  return Number(intervall) > 1 ? `${intervall} ${einheitText}` : einheitText;
}

// app/views/szenarien.mjs
// Szenarien-Liste + Detail (Szenario vs. Basis). App ist nur Anzeige (ADR 0006) —
// Szenarien und Annahmen entstehen ausschliesslich ueber den Agenten.
// Einstieg wie im Rest der App: Liste + Detail-Rail (Uebersicht); die schwere
// Vollansicht (Diagramme, Rechengrundlage, Objektwirkungen) oeffnet ein Button.
import { data, state, t, escapeHtml, cents } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { formatMoney, formatDate, formatMonth, categoryName, renderPageHead } from "../komponenten.mjs";
import { linienDiagramm } from "../charts.mjs";
import { computeSzenario, guardrailWarnungen } from "../szenarien.mjs";
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
  if (a.art === "vorsorge-leistung") {
    const arm = t(`szenarien.arm.${a.arm}`);
    const armText = arm === `szenarien.arm.${a.arm}` ? a.arm : arm;
    return `${escapeHtml(a.vorsorge_id)} · ${escapeHtml(armText)} · ${escapeHtml(t("szenarien.ab"))} ${escapeHtml(formatDate(a.ab))}`;
  }
  return "—";
}

function staleNote(szenario, today) {
  if (addInterval(szenario.stand, "monat", 6) >= today) return "";
  const text = `${t("szenarien.stalenessVon")} ${formatDate(szenario.stand)} ${t("szenarien.stalenessHinweis")}`;
  return `<p class="page-lead"><span class="chip review">${iconSvg("review")}${escapeHtml(text)}</span></p>`;
}

// Monat eines ISO-Datums ("YYYY-MM-DD") als "Monat Jahr". Szenarien rechnen im
// Monatsraster — der Horizont-Tag suggeriert sonst eine Praezision, die es nicht gibt.
function monatLabel(datumIso) {
  return datumIso ? formatMonth(String(datumIso).slice(0, 7)) : "—";
}

// Klartext eines Warnungscodes (i18n); faellt auf den Code zurueck, falls kein Text.
function warnKlartext(code) {
  const titel = t(`szenarien.warnCode.${code}.titel`);
  return titel === `szenarien.warnCode.${code}.titel` ? code : titel;
}

function warnGefahr(code) {
  return code === "liquiditaet-negativ" || code === "depot-ueberzogen";
}

function warnZeileVoll(w) {
  const herkunft = t(`szenarien.warnCode.${w.code}.herkunft`);
  const herkunftText = herkunft === `szenarien.warnCode.${w.code}.herkunft` ? "" : herkunft;
  return `
    <div class="rail-item">
      <span class="chip ${warnGefahr(w.code) ? "danger" : "review"}">${iconSvg("review")}${escapeHtml(warnKlartext(w.code))}</span>
      <div>
        <div>${escapeHtml(w.text)}</div>
        ${herkunftText ? `<div class="muted">${escapeHtml(herkunftText)}</div>` : ""}
      </div>
    </div>`;
}

// --- Liste + Rail-Einstieg --------------------------------------------------

export function renderSzenarien() {
  const today = localTodayIso();
  const szenarien = data.szenarien ?? [];
  const selected = state.selectedSzenarioId ? szenarien.find((s) => s.szenario_id === state.selectedSzenarioId) : undefined;
  if (state.selectedSzenarioId && !selected) state.selectedSzenarioId = "";

  if (selected && state.szenarioVollansicht) return renderSzenarioVollansicht(selected, today);

  const railOpen = Boolean(selected) && !state.szenarioDetailRailClosed;

  const rows = szenarien.map((sz) => {
    const r = computeSzenario(data, sz, today);
    const ende = r.szenario.punkte[r.szenario.punkte.length - 1];
    const sel = sz.szenario_id === state.selectedSzenarioId ? "selected" : "";
    return `
    <tr class="clickable ${sel}" data-action="select-szenario" data-szenario="${escapeHtml(sz.szenario_id)}" tabindex="0" role="button" aria-label="${escapeHtml(sz.name)}">
      <td>${escapeHtml(sz.name)}</td>
      <td>${statusChip(sz.status)}</td>
      <td>${escapeHtml(String(sz.annahmen?.length ?? 0))}</td>
      <td>${escapeHtml(monatLabel(sz.reichweite_bis))}</td>
      <td class="amount ${ende && ende.liquide_cents < 0 ? "amount-negativ" : ""}">${ende ? escapeHtml(formatMoney(ende.liquide_cents)) : "—"}</td>
      <td>${qualitaetChip(r.szenario.qualitaet)}</td>
    </tr>`;
  }).join("");

  return `
    ${renderPageHead(t("szenarien.title"), t("szenarien.lead"))}
    <div class="layout-with-rail ${railOpen ? "" : "rail-closed"}">
      <div class="stack">
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
        </section>
      </div>
      ${railOpen ? renderSzenarioRail(selected, today) : ""}
    </div>`;
}

function renderSzenarioRail(szenario, today) {
  const r = computeSzenario(data, szenario, today);
  const sEnde = r.szenario.punkte[r.szenario.punkte.length - 1];
  const bEnde = r.basis.punkte[r.basis.punkte.length - 1];
  const endeMonat = sEnde?.monat ? formatMonth(sEnde.monat) : monatLabel(szenario.reichweite_bis);
  const warnungen = r.szenario.warnungen ?? [];

  const kpi = (label, wert, basis, negativ) => `
    <div class="rail-kpi">
      <span class="muted">${escapeHtml(label)} (${escapeHtml(endeMonat)})</span>
      <strong class="${negativ ? "amount-negativ" : ""}">${wert}</strong>
      <span class="muted">${escapeHtml(t("szenarien.basis"))}: ${basis}</span>
    </div>`;

  return `
    <aside class="panel panel-pad detail-panel">
      <div class="detail-head">
        <h2 class="section-title">${escapeHtml(szenario.name)}</h2>
        <button class="icon-button" data-action="close-szenario-rail" aria-label="${escapeHtml(t("chrome.closeDetails"))}" title="${escapeHtml(t("chrome.closeDetails"))}">${iconSvg("close")}</button>
      </div>
      <p class="kpi-note">${escapeHtml(t("szenarien.prognoseBis"))} ${escapeHtml(endeMonat)}</p>
      ${kpi(t("szenarien.liquideEnde"), sEnde ? escapeHtml(formatMoney(sEnde.liquide_cents)) : "—", bEnde ? escapeHtml(formatMoney(bEnde.liquide_cents)) : "—", sEnde && sEnde.liquide_cents < 0)}
      ${kpi(t("szenarien.nettoEnde"), sEnde ? escapeHtml(formatMoney(sEnde.netto_cents)) : "—", bEnde ? escapeHtml(formatMoney(bEnde.netto_cents)) : "—", false)}
      <p class="kpi-note">${escapeHtml(t("szenarien.qualitaetHead"))}: ${qualitaetChip(r.szenario.qualitaet)}</p>
      ${warnungen.length ? `<div class="rail-list">${warnungen.map((w) => `<div class="rail-item"><span class="chip ${warnGefahr(w.code) ? "danger" : "review"}">${iconSvg("review")}${escapeHtml(warnKlartext(w.code))}</span></div>`).join("")}</div>` : ""}
      <button class="linkish section-spacing" data-action="open-szenario-vollansicht">${iconSvg("chevronRight")}${escapeHtml(t("szenarien.vollansichtOeffnen"))}</button>
    </aside>`;
}

// --- Vollansicht ------------------------------------------------------------

function renderSzenarioVollansicht(szenario, today) {
  const r = computeSzenario(data, szenario, today);
  const sEnde = r.szenario.punkte[r.szenario.punkte.length - 1];
  const bEnde = r.basis.punkte[r.basis.punkte.length - 1];
  const endeMonat = sEnde?.monat ? formatMonth(sEnde.monat) : monatLabel(szenario.reichweite_bis);

  const liquideSerie = r.szenario.punkte.map((p) => ({ wert: p.liquide_cents, monat: p.monat }));
  const liquideBasis = r.basis.punkte.map((p) => ({ wert: p.liquide_cents }));
  const nettoSerie = r.szenario.punkte.map((p) => ({ wert: p.netto_cents, monat: p.monat }));
  const nettoBasis = r.basis.punkte.map((p) => ({ wert: p.netto_cents }));
  const diagrammOpt = (ariaKey) => ({
    vergleich: undefined,
    formatWert: (c) => formatMoney(c),
    formatMonat: (m) => formatMonth(m),
    ariaLabel: t(ariaKey),
    szenarioLabel: t("szenarien.nachher"),
    basisLabel: t("szenarien.basis"),
  });

  const warnungen = r.szenario.warnungen ?? [];
  const warnungenHtml = warnungen.length ? `
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(t("szenarien.warnungenTitle"))}</h2>
      <div class="rail-list">${warnungen.map(warnZeileVoll).join("")}</div>
    </section>` : "";

  const guardrails = guardrailWarnungen(data, today);
  const prognoseHinweis = guardrails.length ? `
    <p class="page-lead">
      <span class="chip neutral">${iconSvg("review")}${escapeHtml(t("szenarien.prognosebasisHinweis").replace("{n}", String(guardrails.length)))}</span>
      <button class="linkish" data-view="checks">${escapeHtml(t("szenarien.zuChecks"))}</button>
    </p>` : "";

  return `
    ${renderPageHead(szenario.name, szenario.beschreibung || "", `<button class="linkish" data-action="back-to-szenarien">${iconSvg("chevronLeft")}${escapeHtml(t("szenarien.backToList"))}</button>`)}
    ${staleNote(szenario, today)}
    <p class="page-lead">${escapeHtml(t("szenarien.prognoseBis"))} <strong>${escapeHtml(endeMonat)}</strong> · ${escapeHtml(t("szenarien.standLabel"))}: ${escapeHtml(formatDate(szenario.stand))}</p>
    <div class="tile-grid">
      <div class="tile tile-static">
        <strong>${escapeHtml(t("szenarien.liquideEnde"))} (${escapeHtml(endeMonat)})</strong>
        <div class="count ${sEnde && sEnde.liquide_cents < 0 ? "amount-negativ" : ""}">${sEnde ? escapeHtml(formatMoney(sEnde.liquide_cents)) : "—"}</div>
        <div class="kpi-note">${escapeHtml(t("szenarien.basis"))}: ${bEnde ? escapeHtml(formatMoney(bEnde.liquide_cents)) : "—"}</div>
      </div>
      <div class="tile tile-static">
        <strong>${escapeHtml(t("szenarien.nettoEnde"))} (${escapeHtml(endeMonat)})</strong>
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
      ${liquideSerie.length > 1 ? `<div class="diagramm-wrap">${linienDiagramm(liquideSerie, { ...diagrammOpt("szenarien.liquiditaetVerlauf"), vergleich: liquideBasis })}</div>` : `<p class="muted">${escapeHtml(t("szenarien.zuWenigPunkte"))}</p>`}
    </section>
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(t("szenarien.nettovermoegenVerlauf"))}</h2>
      ${nettoSerie.length > 1 ? `<div class="diagramm-wrap">${linienDiagramm(nettoSerie, { ...diagrammOpt("szenarien.nettovermoegenVerlauf"), vergleich: nettoBasis })}</div>` : `<p class="muted">${escapeHtml(t("szenarien.zuWenigPunkte"))}</p>`}
      <p class="page-lead">${escapeHtml(t("szenarien.sachwerteEingefroren"))}</p>
    </section>
    ${renderRechengrundlage(szenario, r, endeMonat)}
    ${prognoseHinweis}
  `;
}

// --- Rechengrundlage: Abweichungen (vorher -> nachher), Objektwirkungen,
// aufklappbare Basis-Regelzahlungen. -----------------------------------------

function abweichungBlock(titelHtml, qChip, basisText, nachherText, begrHtml) {
  return `
    <div class="rail-item">
      <div><strong>${titelHtml}</strong> ${qChip}</div>
      <div><span class="muted">${escapeHtml(t("szenarien.basis"))}:</span> ${basisText} <span class="muted">→</span> <span class="muted">${escapeHtml(t("szenarien.nachher"))}:</span> ${nachherText}</div>
      ${begrHtml}
    </div>`;
}

function abweichungZeile(a) {
  const q = qualitaetChip(a.qualitaet);
  const begr = a.begruendung ? `<div class="muted">${escapeHtml(a.begruendung)}</div>` : "";
  if (a.art === "regelzahlung-aenderung") {
    const orig = (data.regelzahlungen ?? []).find((r) => r.regelzahlung_id === a.regelzahlung_id);
    const name = orig ? orig.bezeichnung : a.regelzahlung_id;
    const nameLink = `<button class="linkish" data-action="open-regelzahlung" data-regelzahlung="${escapeHtml(a.regelzahlung_id)}">${escapeHtml(name)}</button>`;
    const basisText = orig
      ? `${escapeHtml(formatMoney(cents(orig.betrag)))} / ${escapeHtml(rhythmusLabel(orig.rhythmus_einheit, orig.rhythmus_intervall))}`
      : escapeHtml(t("szenarien.nichtVorgesehen"));
    const nachher = a.aktion === "beenden"
      ? `${escapeHtml(t("szenarien.aktionBeenden"))} ${escapeHtml(t("szenarien.ab"))} ${escapeHtml(formatDate(a.ab))}`
      : `${escapeHtml(formatMoney(cents(a.betrag)))} / ${escapeHtml(rhythmusLabel(orig?.rhythmus_einheit ?? "monat", orig?.rhythmus_intervall ?? 1))} ${escapeHtml(t("szenarien.ab"))} ${escapeHtml(formatDate(a.ab))}`;
    return abweichungBlock(nameLink, q, basisText, nachher, begr);
  }
  const titel = escapeHtml(t(`szenarien.art.${a.art}`));
  return abweichungBlock(titel, q, escapeHtml(t("szenarien.nichtVorgesehen")), annahmeInhalt(a), begr);
}

function objektZeile(bezeichnungHtml, text) {
  return `<div class="rail-item"><div><strong>${bezeichnungHtml}</strong></div><div>${text}</div></div>`;
}

function vermoegenLink(zielTyp, zielId, bezeichnung) {
  if ((zielTyp === "immobilie" || zielTyp === "vermoegenswert") && zielId) {
    return `<button class="linkish" data-action="open-vermoegen-entity" data-vklasse="${escapeHtml(zielTyp)}" data-vid="${escapeHtml(zielId)}">${escapeHtml(bezeichnung)}</button>`;
  }
  if (zielTyp === "depot" && zielId) {
    return `<button class="linkish" data-action="open-account-master" data-account="${escapeHtml(zielId)}">${escapeHtml(bezeichnung)}</button>`;
  }
  return escapeHtml(bezeichnung);
}

function renderObjektwirkungen(r) {
  const items = [];

  const basisDarlehen = new Map((r.basis.darlehen ?? []).map((d) => [d.darlehen_id, d]));
  for (const d of r.szenario.darlehen ?? []) {
    const b = basisDarlehen.get(d.darlehen_id);
    if (!b) continue;
    if (d.abbezahlt_am !== b.abbezahlt_am) {
      // Tilgung faellt in den Horizont und verschiebt sich — der klarste Effekt.
      const szT = d.abbezahlt_am ? monatLabel(d.abbezahlt_am) : t("szenarien.nichtGetilgt");
      const baT = b.abbezahlt_am ? monatLabel(b.abbezahlt_am) : t("szenarien.nichtGetilgt");
      items.push(objektZeile(escapeHtml(d.bezeichnung), `${escapeHtml(t("szenarien.darlehenAbbezahlt"))}: ${escapeHtml(baT)} <span class="muted">→</span> ${escapeHtml(szT)}`));
    } else if (d.ende_cents !== b.ende_cents) {
      // Tilgung liegt jenseits des Horizonts, aber die Restschuld am Ende sinkt (z. B. Sondertilgung).
      items.push(objektZeile(escapeHtml(d.bezeichnung), `${escapeHtml(t("szenarien.restschuldEnde"))}: ${escapeHtml(formatMoney(b.ende_cents))} <span class="muted">→</span> ${escapeHtml(formatMoney(d.ende_cents))}`));
    }
  }

  const basisDepot = new Map((r.basis.depots ?? []).map((d) => [d.konto_id, d]));
  for (const d of r.szenario.depots ?? []) {
    const b = basisDepot.get(d.konto_id);
    if (!b || d.ende_cents === b.ende_cents) continue;
    items.push(objektZeile(vermoegenLink("depot", d.konto_id, d.bezeichnung), `${escapeHtml(t("szenarien.depotWert"))}: ${escapeHtml(formatMoney(b.ende_cents))} <span class="muted">→</span> ${escapeHtml(formatMoney(d.ende_cents))}`));
  }

  for (const s of r.szenario.sachwertwirkungen ?? []) {
    const vz = s.art === "aufbau" ? "+" : "−";
    items.push(objektZeile(vermoegenLink(s.ziel_typ, s.ziel_id, s.bezeichnung), `${escapeHtml(formatDate(s.datum))} · ${vz} ${escapeHtml(formatMoney(s.wert_cents))}`));
  }

  for (const v of r.szenario.vorsorgewirkungen ?? []) {
    items.push(objektZeile(escapeHtml(v.bezeichnung), `${escapeHtml(formatDate(v.datum))} · − ${escapeHtml(formatMoney(v.rueckkaufswert_cents))}`));
  }

  if (!items.length) return "";
  return `
    <h3 class="section-title">${escapeHtml(t("szenarien.objektwirkungTitle"))}</h3>
    <div class="rail-list section-spacing">${items.join("")}</div>`;
}

function renderBasisRegelzahlungen(r, endeMonat) {
  const rz = r.szenario.basisRegelzahlungen ?? [];
  const expanded = state.szenarioBasisExpanded;
  const kopf = `
    <button class="row-toggle" data-action="toggle-szenario-basis" aria-expanded="${expanded}">
      <span class="toggle-icon">${iconSvg(expanded ? "chevronDown" : "chevronRight")}</span>${escapeHtml(t("szenarien.basisRzTitle"))}
      <span class="muted">· ${rz.length} ${escapeHtml(t("szenarien.ausDerBasis"))}</span>
    </button>`;
  if (!expanded) return kopf;
  const rows = rz.map((x) => {
    const bis = x.aktiv_bis ? formatDate(x.aktiv_bis) : t("szenarien.unbefristetBis").replace("{monat}", endeMonat);
    return `
    <tr>
      <td><button class="linkish" data-action="open-regelzahlung" data-regelzahlung="${escapeHtml(x.regelzahlung_id)}">${escapeHtml(x.bezeichnung)}</button></td>
      <td class="amount">${escapeHtml(formatMoney(cents(x.betrag)))} / ${escapeHtml(rhythmusLabel(x.rhythmus_einheit, x.rhythmus_intervall))}</td>
      <td>${x.kategorie_id ? escapeHtml(categoryName(x.kategorie_id)) : "—"}</td>
      <td>${escapeHtml(bis)}</td>
    </tr>`;
  }).join("");
  return `
    ${kopf}
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>${escapeHtml(t("regelzahlungen.bezeichnung"))}</th>
          <th class="amount">${escapeHtml(t("labels.amount"))}</th>
          <th>${escapeHtml(t("szenarien.kategorieHead"))}</th>
          <th>${escapeHtml(t("szenarien.gueltigBis"))}</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="muted">${escapeHtml(t("szenarien.keineBasisRz"))}</td></tr>`}</tbody>
      </table>
    </div>`;
}

function renderRechengrundlage(szenario, r, endeMonat) {
  const annahmen = szenario.annahmen ?? [];
  const abweichungen = annahmen.length
    ? `<div class="rail-list">${annahmen.map(abweichungZeile).join("")}</div>`
    : `<p class="muted">${escapeHtml(t("szenarien.keineAbweichungen"))}</p>`;

  return `
    <section class="panel panel-pad section-spacing">
      <h2 class="section-title">${escapeHtml(t("szenarien.rechengrundlageTitle"))}</h2>
      <h3 class="section-title">${escapeHtml(t("szenarien.abweichungenTitle"))}</h3>
      <p class="muted">${escapeHtml(t("szenarien.abweichungenLead"))}</p>
      ${abweichungen}
      ${renderObjektwirkungen(r)}
      <div class="section-spacing">${renderBasisRegelzahlungen(r, endeMonat)}</div>
    </section>`;
}

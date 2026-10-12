// app/views/vermoegen.mjs
// Vermoegensseite: Kopf (Nettovermoegen, offene Punkte) ueber allen Tabs, darunter
// je Klasse ein Tab (Uebersicht, Konten & Depots, Immobilien, Darlehen, Sonstige
// Werte). Vorsorge hat keinen Tab: die Vorsorge-Seite traegt die Details, hier
// steht nur der Verweis. Immobilien und Darlehen rendert vermoegen-objekte.mjs.
import { data, state, t, escapeHtml, cents, kontenById, personenById } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { formatMoney, formatDate, detailRow, renderPageHead, renderAccountPanels, accountOwnerNames, accountTypeLabel, quelleHtml, saldoLinie } from "../komponenten.mjs";
import { computeNettovermoegen, computeVermoegenChecks, aktuellerZeitwert, anteilWertCents } from "../vermoegen.mjs";
import { immobilienKennzahlen, kontoSaldoVerlauf } from "../vermoegen-details.mjs";
import { VERMOEGEN_TABS, TAB_FUER_KLASSE } from "../vermoegen-routen.mjs";
import { localTodayIso } from "../liquiditaet.mjs";
import { renderImmobilienTab, renderDarlehenTab } from "./vermoegen-objekte.mjs";
import { balkenSvg, geld, qualitaetChip, rateJeMonatCents, renderPositionWertstaende, tf } from "./vermoegen-teile.mjs";

const KLASSEN = ["konto", "immobilie", "darlehen", "vermoegenswert", "vorsorge"];

// Worst-of-Badge: traegt die schlechteste Qualitaet aller Positionen als eine
// ehrliche Gesamtaussage (belegt < geschaetzt < offen). Quelle: vermoegen.mjs.
function gesamtQualitaetChip(gesamt) {
  if (!gesamt) return "";
  const stil = { belegt: ["success", "success", "Belegt"], geschaetzt: ["neutral", null, "Geschaetzt"], offen: ["review", "review", "Offen"] };
  const [cls, icon, wort] = stil[gesamt];
  return `<span class="chip ${cls}">${icon ? iconSvg(icon) : ""}${escapeHtml(t("vermoegen.qualityOverall"))}: ${escapeHtml(t(`vermoegen.quality${wort}`))}</span>`;
}

// Je Klasse: Summe, Anzahl, fehlende Positionen und Objekte mit offenen Checks.
function klassenUebersicht(r, checks) {
  const je = Object.fromEntries(KLASSEN.map((k) => [k, { summe: 0, anzahl: 0, fehlend: 0, offen: new Set(), arten: new Set() }]));
  for (const p of r.positionen) {
    const e = je[p.klasse];
    e.anzahl += 1;
    e.summe += p.wert_cents;
    if (p.fehlt) {
      e.fehlend += 1;
      e.offen.add(p.id);
    }
  }
  for (const c of checks) {
    const e = je[c.entitaet];
    if (!e) continue;
    e.offen.add(c.entitaet_id);
    e.arten.add(c.art);
  }
  return je;
}

const sonstigeSichtbar = () => (data.vermoegenswerte ?? []).some((v) => v.status !== "veraeussert");

function aktiverTab() {
  const [klasse] = String(state.selectedVermoegenId ?? "").split(":");
  if (klasse && TAB_FUER_KLASSE[klasse]) state.vermoegenTab = TAB_FUER_KLASSE[klasse];
  let tab = VERMOEGEN_TABS.includes(state.vermoegenTab) ? state.vermoegenTab : "uebersicht";
  if (tab === "sonstige" && !sonstigeSichtbar()) tab = "uebersicht";
  return tab;
}

function tabZiel(klasse) {
  return klasse === "vorsorge" ? `data-view="vorsorge"` : `data-action="vermoegen-tab" data-tab="${TAB_FUER_KLASSE[klasse]}"`;
}

export function renderVermoegen() {
  const today = localTodayIso();
  const r = computeNettovermoegen(data, today);
  const checks = computeVermoegenChecks(data, today);
  const je = klassenUebersicht(r, checks);
  const tab = aktiverTab();

  let inhalt;
  if (tab === "konten") inhalt = renderKontenTab(r, today);
  else if (tab === "immobilien") inhalt = renderImmobilienTab(today);
  else if (tab === "darlehen") inhalt = renderDarlehenTab(today);
  else if (tab === "sonstige") inhalt = renderSonstigeTab(r, today);
  else inhalt = renderUebersichtTab(r, je, today);

  return `
    ${renderPageHead(t("vermoegen.title"), t("vermoegen.lead"))}
    ${renderKopf(r, je)}
    ${renderTabs(tab, je)}
    <div class="vermoegen-tab-inhalt" role="tabpanel" id="vermoegen-tab-${tab}">${inhalt}</div>`;
}

// ------------------------------------------------------------- Kopf

function renderKopf(r, je) {
  const aktiva = Math.max(r.aktiva_cents, 1);
  const segmente = ["konto", "immobilie", "vermoegenswert", "vorsorge"]
    .map((k) => ({ anteil: je[k].summe / aktiva, klasse: `segment-${k}`, titel: `${t(`vermoegen.klassePlural.${k}`)}: ${formatMoney(je[k].summe)}` }));
  const legende = ["konto", "immobilie", "vermoegenswert", "vorsorge", "darlehen"]
    .filter((k) => je[k].summe !== 0)
    .map((k) => `<span><i class="segment-${k}"></i>${escapeHtml(t(`vermoegen.klassePlural.${k}`))} ${escapeHtml(formatMoney(je[k].summe))}</span>`)
    .join("");

  const luecken = KLASSEN
    .filter((k) => je[k].offen.size)
    .map((k) => {
      const arten = [...je[k].arten].map((a) => t(`vermoegen.checkArt.${a}`));
      if (je[k].fehlend && !je[k].arten.size) arten.push(t("vermoegen.ohneWert"));
      return `
        <li>
          <button class="linkish" ${tabZiel(k)}>${escapeHtml(t(`vermoegen.klassePlural.${k}`))}</button>:
          ${escapeHtml(tf("vermoegen.offenAnzahl", { n: je[k].offen.size }))}
          <span class="muted">(${escapeHtml(arten.join(", "))})</span>
        </li>`;
    })
    .join("");

  return `
    <div class="vermoegen-kopf">
      <section class="panel panel-pad">
        <div class="muted">${escapeHtml(t("vermoegen.netto"))}</div>
        <div class="vermoegen-netto">${escapeHtml(formatMoney(r.netto_cents))}</div>
        <div class="kpi-note">${escapeHtml(t("vermoegen.aktiva"))}: ${escapeHtml(formatMoney(r.aktiva_cents))} · ${escapeHtml(t("vermoegen.passiva"))}: ${escapeHtml(formatMoney(r.passiva_cents))}</div>
        ${balkenSvg(segmente)}
        ${balkenSvg([{ anteil: 1, klasse: "segment-darlehen", titel: `${t("vermoegen.passiva")}: ${formatMoney(r.passiva_cents)}` }], { laenge: r.passiva_cents / aktiva })}
        <div class="vermoegen-legende">${legende}</div>
      </section>
      <section class="panel panel-pad">
        <div class="panel-kopf">
          <div class="muted">${escapeHtml(t("vermoegen.qualitaetTitle"))}</div>
          ${gesamtQualitaetChip(r.qualitaet.gesamt)}
        </div>
        <div class="chip-zeile">
          <span class="chip success">${iconSvg("success")}${r.qualitaet.belegt} ${escapeHtml(t("vermoegen.qualityBelegt"))}</span>
          <span class="chip neutral">${r.qualitaet.geschaetzt} ${escapeHtml(t("vermoegen.qualityGeschaetzt"))}</span>
          ${r.qualitaet.fehlend > 0 ? `<span class="chip review">${iconSvg("review")}${r.qualitaet.fehlend} ${escapeHtml(t("vermoegen.qualityFehlend"))}</span>` : ""}
        </div>
        ${luecken ? `<ul class="luecken-liste">${luecken}</ul>` : `<p class="muted">${escapeHtml(t("vermoegen.keineLuecken"))}</p>`}
      </section>
    </div>`;
}

function renderTabs(aktiv, je) {
  const tabs = [
    ["uebersicht", null],
    ["konten", "konto"],
    ["immobilien", "immobilie"],
    ["darlehen", "darlehen"],
    ...(sonstigeSichtbar() ? [["sonstige", "vermoegenswert"]] : []),
  ];
  const knoepfe = tabs.map(([tab, klasse]) => {
    const e = klasse ? je[klasse] : null;
    const unter = e ? `${e.anzahl} · ${formatMoney(e.summe)}` : t("vermoegen.tabUebersichtUnter");
    const punkt = e && e.offen.size ? `<span class="tab-punkt" title="${escapeHtml(tf("vermoegen.offenAnzahl", { n: e.offen.size }))}"></span>` : "";
    return `
      <button class="vermoegen-tab ${tab === aktiv ? "active" : ""}" role="tab" aria-selected="${tab === aktiv}" aria-controls="vermoegen-tab-${tab}" data-action="vermoegen-tab" data-tab="${tab}">
        <span class="vermoegen-tab-titel">${escapeHtml(t(`vermoegen.tabs.${tab}`))}${punkt}</span>
        <span class="vermoegen-tab-unter">${escapeHtml(unter)}</span>
      </button>`;
  }).join("");
  return `<div class="vermoegen-tabs" role="tablist" aria-label="${escapeHtml(t("vermoegen.title"))}">${knoepfe}</div>`;
}

// ------------------------------------------------------------- Rail (Konten, Sonstige, Wertstaende)

function mitRail(inhalt, railHtml, titel, { breitSchalter = false } = {}) {
  if (!railHtml || state.vermoegenDetailRailClosed) return inhalt;
  const railWide = breitSchalter && state.vermoegenRailWide;
  return `
    <div class="layout-with-rail ${railWide ? "rail-wide" : ""}">
      <div class="stack">${inhalt}</div>
      <aside class="panel panel-pad detail-panel">
        <div class="detail-head">
          <h2 class="section-title">${escapeHtml(titel)}</h2>
          <div class="detail-actions">
            ${breitSchalter ? `<button class="icon-button" data-action="toggle-vermoegen-rail-width" aria-label="${escapeHtml(railWide ? t("vermoegen.railNarrow") : t("vermoegen.railWide"))}" title="${escapeHtml(railWide ? t("vermoegen.railNarrow") : t("vermoegen.railWide"))}">${iconSvg(railWide ? "chevronRight" : "chevronLeft")}</button>` : ""}
            <button class="icon-button" data-action="close-vermoegen-detail-rail" aria-label="${escapeHtml(t("chrome.closeDetails"))}" title="${escapeHtml(t("chrome.closeDetails"))}">${iconSvg("close")}</button>
          </div>
        </div>
        ${railHtml}
      </aside>
    </div>`;
}

function ausgewaehltePosition(r, klasse) {
  const [k, id] = String(state.selectedVermoegenId ?? "").split(":");
  if (k !== klasse) return null;
  return r.positionen.find((p) => p.klasse === klasse && p.id === id) ?? null;
}

// ------------------------------------------------------------- Uebersicht

function renderUebersichtTab(r, je, today) {
  const konten = (data.konten ?? []).filter((k) => k.status !== "geschlossen" && k.kontotyp !== "bar");
  const depots = konten.filter((k) => k.kontotyp === "depot").length;
  const immobilien = (data.immobilien ?? []).filter((i) => i.status !== "verkauft");
  const eigenkapital = immobilien.reduce((summe, i) => summe + (immobilienKennzahlen(data, i.immobilie_id, today).eigenkapital_cents ?? 0), 0);
  const darlehen = (data.darlehen ?? []).filter((d) => d.status !== "abgeloest");
  const rate = darlehen.reduce((summe, d) => summe + rateJeMonatCents(d), 0);
  const kapitalbildend = (data.vorsorge ?? []).filter((v) => v.kapitalbildend);
  const mitWert = r.positionen.filter((p) => p.klasse === "vorsorge" && !p.fehlt).length;

  const karte = (klasse, zeile, extra = "") => {
    const e = je[klasse];
    const chip = e.offen.size
      ? `<span class="chip review">${iconSvg("review")}${escapeHtml(tf("vermoegen.offenAnzahl", { n: e.offen.size }))}</span>`
      : `<span class="chip success">${iconSvg("success")}${escapeHtml(t("vermoegen.vollstaendig"))}</span>`;
    return `
      <button class="tile klassen-karte" ${tabZiel(klasse)}>
        <strong>${escapeHtml(t(`vermoegen.klassePlural.${klasse}`))}</strong>
        <div class="count">${geld(e.summe, { negativ: true })}</div>
        <div class="kpi-note">${escapeHtml(zeile)}</div>
        ${extra}
        ${chip}
      </button>`;
  };

  const karten = [
    karte("konto", tf("vermoegen.karte.konten", { konten: konten.length - depots, depots })),
    karte("immobilie", tf("vermoegen.karte.immobilien", { n: immobilien.length, ek: formatMoney(eigenkapital) })),
    karte("darlehen", tf("vermoegen.karte.darlehen", { n: darlehen.length, rate: formatMoney(rate) })),
    ...(sonstigeSichtbar() ? [karte("vermoegenswert", tf("vermoegen.karte.sonstige", { n: je.vermoegenswert.anzahl }))] : []),
    karte("vorsorge", tf("vermoegen.karte.vorsorge", { mit: mitWert, gesamt: kapitalbildend.length }), `<div class="kpi-note">${escapeHtml(t("vermoegen.karte.vorsorgeHinweis"))}</div>`),
  ].join("");

  const inhalt = `
    <div class="tile-grid klassen-karten">${karten}</div>
    <section class="panel panel-pad section-spacing">
      <div class="panel-kopf">
        <h2 class="section-title">${escapeHtml(t("vermoegen.wertstaende"))}</h2>
        <button class="linkish" data-action="show-vermoegen-wertstaende">${escapeHtml(tf("vermoegen.alleWertstaendeAnzahl", { n: data.zeitwerte?.length ?? 0 }))}</button>
      </div>
      <p class="muted">${escapeHtml(t("vermoegen.wertstaendeLead"))}</p>
    </section>`;
  const rail = state.vermoegenRailMode === "wertstaende" ? renderWertstaendeRail() : "";
  return mitRail(inhalt, rail, t("vermoegen.wertstaende"), { breitSchalter: true });
}

// ------------------------------------------------------------- Konten & Depots

function renderKontenTab(r, today) {
  const p = ausgewaehltePosition(r, "konto");
  const inhalt = `<div class="stack">${renderAccountPanels({ rowAction: "select-vermoegen-konto" })}</div>`;
  if (state.vermoegenRailMode === "wertstaende") return mitRail(inhalt, renderWertstaendeRail(), t("vermoegen.wertstaende"), { breitSchalter: true });
  if (!p) return inhalt;
  const konto = kontenById.get(p.id);
  const verlauf = konto ? kontoSaldoVerlauf(data, konto, today) : [];
  const linie = saldoLinie(verlauf.map((pt) => ({ wert: pt.wert_cents })), t("vermoegen.konto.saldoVerlauf"));
  const rail = `
    ${renderVermoegenDetail(p, today)}
    ${linie ? detailRow(t("vermoegen.konto.saldoVerlauf"), linie) : ""}
    <div class="detail-section">
      <button class="linkish" data-action="account-transactions" data-account="${escapeHtml(p.id)}">${escapeHtml(t("vermoegen.konto.buchungen"))}</button>
      · <button class="linkish" data-action="select-master-account" data-account="${escapeHtml(p.id)}">${escapeHtml(t("vermoegen.konto.stammdaten"))}</button>
    </div>`;
  return mitRail(inhalt, rail, t("vermoegen.detailTitle"));
}

// ------------------------------------------------------------- Sonstige Werte

function renderSonstigeTab(r, today) {
  const positionen = r.positionen.filter((p) => p.klasse === "vermoegenswert");
  const zeilen = positionen.map((p) => {
    const vmw = data.vermoegenswerte.find((v) => v.vermoegenswert_id === p.id);
    const key = `vermoegenswert:${p.id}`;
    return `
      <tr class="clickable ${key === state.selectedVermoegenId ? "selected" : ""}" data-action="select-vermoegen" data-vermoegen="${escapeHtml(key)}" tabindex="0" role="button" aria-label="${escapeHtml(p.name)}">
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(vmw?.typ ? t(`vermoegen.typ.${vmw.typ}`) : "")}</td>
        <td class="amount">${p.fehlt ? `<span class="muted">${escapeHtml(t("vermoegen.standOhne"))}</span>` : escapeHtml(formatMoney(p.wert_cents))}</td>
        <td>${p.standdatum ? escapeHtml(formatDate(p.standdatum)) : "—"}</td>
        <td>${qualitaetChip(p)}</td>
      </tr>`;
  }).join("");
  const inhalt = `
    <section class="panel">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>${escapeHtml(t("vermoegen.position"))}</th>
            <th>${escapeHtml(t("labels.type"))}</th>
            <th class="amount">${escapeHtml(t("vermoegen.wert"))}</th>
            <th>${escapeHtml(t("vermoegen.stand"))}</th>
            <th>${escapeHtml(t("vermoegen.qualitaetHead"))}</th>
          </tr></thead>
          <tbody>${zeilen}</tbody>
        </table>
      </div>
    </section>`;
  const p = ausgewaehltePosition(r, "vermoegenswert");
  return p ? mitRail(inhalt, renderVermoegenDetail(p, today), t("vermoegen.detailTitle")) : inhalt;
}

// ------------------------------------------------------------- Wertstaende (Rail)

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

function renderWertstaendeRail() {
  const rows = (data.zeitwerte ?? [])
    .slice()
    .sort((a, b) => b.standdatum.localeCompare(a.standdatum) || zeitwertLabel(a).localeCompare(zeitwertLabel(b)))
    .map((zw) => `
      <tr>
        <td>${escapeHtml(zeitwertLabel(zw))}<br><span class="muted">${escapeHtml(zw.entitaet_id)}</span></td>
        <td>${escapeHtml(formatDate(zw.standdatum))}</td>
        <td class="amount">${escapeHtml(formatMoney(cents(zw.wert)))}</td>
        <td>${qualitaetChip({ qualitaet: zw.qualitaet, fehlt: false })}</td>
        <td>${zw.quelle_hinweis ? quelleHtml(zw.quelle_hinweis) : "—"}</td>
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

// ------------------------------------------------------------- Detail einer Position (Konto, Sonstige)

function basisLabel(basis) {
  const key = `vermoegen.basisLabels.${basis}`;
  const text = t(key);
  return text === key ? basis : text;
}

function anteileHtml(eigentumsanteile, marktwertCents) {
  return (eigentumsanteile ?? []).map((a) => {
    const extern = a.extern === true || !a.person_id;
    const name = extern ? t("vermoegen.externerAnteil") : (personenById.get(a.person_id)?.name || a.person_id);
    const teil = extern ? "—" : formatMoney(anteilWertCents(marktwertCents, [a]));
    return `<div>${escapeHtml(name)}: <strong>${escapeHtml(String(a.zaehler))}/${escapeHtml(String(a.nenner))}</strong> · ${escapeHtml(teil)}</div>`;
  }).join("");
}

// Auch von den Stammdaten (Konto-Rail) genutzt.
export function renderVermoegenDetail(p, today) {
  const head = `
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t(`vermoegen.klasse.${p.klasse}`))}</div>
      <div class="detail-value"><strong>${escapeHtml(p.name)}</strong><br>${qualitaetChip(p)}</div>
    </div>`;

  if (p.klasse === "konto") {
    const konto = kontenById.get(p.id);
    const istDepot = konto?.kontotyp === "depot";
    const zw = aktuellerZeitwert(data.zeitwerte, "konto", p.id, istDepot ? "depotwert" : "kontostand");
    let buchungenHtml = "";
    if (!istDepot && zw) {
      let summe = 0;
      for (const tx of data.transaktionen ?? []) {
        if (tx.konto_id !== p.id || tx.buchungsdatum <= zw.standdatum || tx.buchungsdatum > today) continue;
        summe += cents(tx.betrag);
      }
      buchungenHtml = detailRow(t("vermoegen.buchungenSeitAnker"), escapeHtml(formatMoney(summe)));
    }
    return head
      + detailRow(t("labels.owner"), escapeHtml(accountOwnerNames(konto || {})))
      + detailRow(t("labels.type"), escapeHtml(accountTypeLabel(konto?.kontotyp || "")))
      + (zw
        ? detailRow(istDepot ? t("vermoegen.depotwert") : t("vermoegen.anker"),
            `<strong>${escapeHtml(formatMoney(cents(zw.wert)))}</strong><br>${escapeHtml(formatDate(zw.standdatum))} · ${qualitaetChip({ qualitaet: zw.qualitaet })}${zw.quelle_hinweis ? `<br><span class="muted">${quelleHtml(zw.quelle_hinweis)}</span>` : ""}`)
        : detailRow(t("vermoegen.anker"), `<span class="chip review">${iconSvg("review")}${escapeHtml(t("vermoegen.qualityFehlend"))}</span>`))
      + buchungenHtml
      + detailRow(t("vermoegen.aktuellerSaldo"),
          `${p.fehlt ? `<span class="muted">${escapeHtml(t("vermoegen.standOhne"))}</span>` : `<strong>${escapeHtml(formatMoney(p.wert_cents))}</strong>`}<br><span class="muted">${escapeHtml(basisLabel(p.basis))}</span>`)
      + renderPositionWertstaende(p);
  }

  if (p.klasse === "immobilie" || p.klasse === "vermoegenswert") {
    const entity = (p.klasse === "immobilie" ? data.immobilien : data.vermoegenswerte)?.find((e) => (e.immobilie_id || e.vermoegenswert_id) === p.id);
    const mw = aktuellerZeitwert(data.zeitwerte, p.klasse, p.id, "marktwert");
    const mwCents = mw ? cents(mw.wert) : 0;
    return head
      + (entity?.typ ? detailRow(t("labels.type"), escapeHtml(t(`vermoegen.typ.${entity.typ}`))) : "")
      + (entity?.adresse ? detailRow(t("vermoegen.adresse"), escapeHtml(entity.adresse)) : "")
      + (mw
        ? detailRow(t("vermoegen.marktwert"),
            `<strong>${escapeHtml(formatMoney(mwCents))}</strong><br>${escapeHtml(formatDate(mw.standdatum))} · ${qualitaetChip({ qualitaet: mw.qualitaet })}${mw.quelle_hinweis ? `<br><span class="muted">${quelleHtml(mw.quelle_hinweis)}</span>` : ""}`)
        : detailRow(t("vermoegen.marktwert"), `<span class="chip review">${iconSvg("review")}${escapeHtml(t("vermoegen.qualityFehlend"))}</span>`))
      + (entity?.eigentumsanteile ? detailRow(t("vermoegen.eigentumsanteile"), anteileHtml(entity.eigentumsanteile, mwCents)) : "")
      + detailRow(t("vermoegen.anteiligerWert"),
          p.fehlt ? `<span class="muted">${escapeHtml(t("vermoegen.standOhne"))}</span>` : `<strong>${escapeHtml(formatMoney(p.wert_cents))}</strong>`)
      + renderPositionWertstaende(p);
  }

  return head;
}

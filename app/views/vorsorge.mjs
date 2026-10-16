// app/views/vorsorge.mjs
// Vorsorgeseite im Aufbau der Vermoegensseite: Kopf (erwartetes Alterseinkommen,
// Kapitalleistungen, Rueckkaufswerte, Beitraege), darunter je Vertragsart ein Tab
// (Renten, Lebensversicherungen, Versicherungen). Im Tab eine Karte je Vertrag,
// darunter der gewaehlte Vertrag in voller Breite. Rechnen in vorsorge-rechnung.mjs.
import { data, state, t, escapeHtml, cents, personenById, kontenById } from "../runtime.mjs";
import { formatMoney, formatDate, renderPageHead, detailRow, quelleHtml } from "../komponenten.mjs";
import { iconSvg } from "../icons.js";
import { aktuellerZeitwert, computeNettovermoegen, computeVermoegenChecks } from "../vermoegen.mjs";
import { localTodayIso } from "../liquiditaet.mjs";
import { beitragsBalken, zeitstrahlDiagramm } from "../charts.mjs";
import { belegOrdnerAusText } from "../belege.mjs";
import {
  VORSORGE_TABS, beitragJeJahrVertrag, beitragJeMonatVertrag, beitragsVerlauf, beitragVorjahr, gebuchteBeitraegeAlle,
  gesetzlicherRentenbeginn, istBeendet, laufendeBeitraege, leistungsZeitstrahl, monateBis, naechsterBeitrag,
  rentenStufen, tabFuerVorsorge, vermoegensBezug,
} from "../vorsorge-rechnung.mjs";
import { balkenSvg, dokumenteBrowserHtml, geld, kennzahl, qualitaetChip, rhythmusLabel, tf } from "./vermoegen-teile.mjs";

const GRUPPEN_TABS = VORSORGE_TABS.filter((tab) => tab !== "uebersicht");

function personName(personId) {
  return personenById.get(personId)?.name
    || (data.personen ?? []).find((person) => person.person_id === personId)?.name
    || personId
    || "—";
}

function statusLabel(status) {
  const key = `status.${status}`;
  const label = t(key);
  return label === key ? status : label;
}

function vorsorgeArtLabel(art) {
  const key = `vorsorge.art.${art}`;
  const label = t(key);
  return label === key ? art : label;
}

const zeitwert = (vs, feld) => aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, feld);
const vertraegeIm = (tab) => (data.vorsorge ?? []).filter((vs) => tabFuerVorsorge(vs) === tab);
const geldOhneCent = (c) => new Intl.NumberFormat(state.lang === "en" ? "en-GB" : "de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(c / 100);
const einheit = (text) => `<span class="betrag-einheit">${escapeHtml(text)}</span>`;
const jaehrlichGezahlt = (vs, today) => {
  const rz = laufendeBeitraege(data, vs.vorsorge_id, today);
  return rz.length > 0 && rz.every((r) => r.rhythmus_einheit === "jahr" || (r.rhythmus_einheit === "monat" && Number(r.rhythmus_intervall) % 12 === 0));
};

// Links auf die Vermoegensgegenstaende eines Vertrags (oeffnet das Objekt auf der Vermoegensseite).
function bezugLinks(vs) {
  return vermoegensBezug(data, vs.vorsorge_id).map((b) => {
    const name = (data.immobilien ?? []).find((i) => i.immobilie_id === b.id)?.bezeichnung || b.id;
    return `<button class="linkish" data-action="select-vermoegen-objekt" data-vermoegen="${escapeHtml(`${b.klasse}:${b.id}`)}" title="${escapeHtml(t("vorsorge.bezugOeffnen"))}">${escapeHtml(name)}</button>`;
  });
}

export function resetVorsorgeFilters() {
  state.vorsorgeFilters = { person: "" };
}

// Die fuenf neuesten gebuchten Beitraege eines Vertrags.
export function gebuchteBeitraege(vorsorgeId) {
  return gebuchteBeitraegeAlle(data, vorsorgeId).slice(0, 5);
}

// Ein gewaehlter Vertrag bestimmt den Tab; sonst gilt der gemerkte Tab.
function aktiverTab() {
  const vs = (data.vorsorge ?? []).find((v) => v.vorsorge_id === state.selectedVorsorgeId);
  if (vs) state.vorsorgeTab = tabFuerVorsorge(vs);
  const tab = VORSORGE_TABS.includes(state.vorsorgeTab) ? state.vorsorgeTab : "uebersicht";
  return tab !== "uebersicht" && !vertraegeIm(tab).length ? "uebersicht" : tab;
}

// Offene Pruefpunkte je Vertrag aus den Vermoegens-Checks.
function offenePunkte(today) {
  const je = new Map();
  for (const c of computeVermoegenChecks(data, today)) {
    if (c.entitaet !== "vorsorge") continue;
    if (!je.has(c.entitaet_id)) je.set(c.entitaet_id, []);
    je.get(c.entitaet_id).push(c);
  }
  return je;
}

export function renderVorsorge() {
  const today = localTodayIso();
  const offen = offenePunkte(today);
  const tab = aktiverTab();
  const inhalt = tab === "uebersicht" ? renderUebersichtTab(today, offen) : renderGruppenTab(tab, today, offen);
  return `
    ${renderPageHead(t("vorsorge.title"), t("vorsorge.lead"))}
    ${renderKopf(today)}
    ${renderTabs(tab, today, offen)}
    <div class="vermoegen-tab-inhalt" role="tabpanel" id="vorsorge-tab-${tab}">${inhalt}</div>`;
}

// ------------------------------------------------------------- Kopf

function renderKopf(today) {
  const { renten, stufen, gesamt_cents: gesamt, ohne_beginn: ohneBeginn } = rentenStufen(data);
  const notizen = [];
  const gesetzlich = gesetzlicherRentenbeginn(data);
  const abGesetzlich = stufen.find((s) => s.datum === gesetzlich);
  if (abGesetzlich && abGesetzlich !== stufen.at(-1)) notizen.push(tf("vorsorge.kopf.abDatum", { datum: formatDate(abGesetzlich.datum), betrag: formatMoney(abGesetzlich.summe_cents) }));
  if (stufen.length) notizen.push(tf("vorsorge.kopf.vollAb", { datum: formatDate(stufen.at(-1).datum) }));
  if (ohneBeginn.length) notizen.push(tf("vorsorge.kopf.ohneBeginn", { n: ohneBeginn.length }));

  const mehrerePersonen = new Set(renten.map((l) => l.vorsorge.person_id)).size > 1;
  const sortiert = [...renten].sort((a, b) => b.wert_cents - a.wert_cents);
  const name = (l) => `${vorsorgeArtLabel(l.vorsorge.art)}${mehrerePersonen ? ` (${personName(l.vorsorge.person_id)})` : ""}`;
  const segmente = sortiert.map((l, i) => ({ anteil: l.wert_cents / Math.max(gesamt, 1), klasse: `segment-rente-${i % 4}`, titel: `${name(l)}: ${formatMoney(l.wert_cents)}` }));
  const legende = sortiert.map((l, i) => `<span><i class="segment-rente-${i % 4}"></i>${escapeHtml(name(l))} ${escapeHtml(geldOhneCent(l.wert_cents))}</span>`).join("");

  const kapital = kapitalLeistungen();
  const nv = computeNettovermoegen(data, today);
  const vorsorgePositionen = nv.positionen.filter((p) => p.klasse === "vorsorge");
  const rkw = vorsorgePositionen.reduce((a, p) => a + p.wert_cents, 0);
  const aktiv = (data.vorsorge ?? []).filter((vs) => !istBeendet(vs));
  const beitragVorsorge = aktiv.filter((vs) => tabFuerVorsorge(vs) !== "versicherungen").reduce((a, vs) => a + beitragJeMonatVertrag(data, vs.vorsorge_id, today), 0);
  const beitragVersicherung = aktiv.filter((vs) => tabFuerVorsorge(vs) === "versicherungen").reduce((a, vs) => a + beitragJeJahrVertrag(data, vs.vorsorge_id, today), 0);

  const kz = (label, wert, notiz) => `
      <div class="vorsorge-kopf-kz">
        <div class="muted">${escapeHtml(label)}</div>
        <div class="vorsorge-kopf-wert">${wert}</div>
        ${notiz ? `<div class="kpi-note">${notiz}</div>` : ""}
      </div>`;

  return `
    <div class="vermoegen-kopf">
      <section class="panel panel-pad vorsorge-kopf">
        <div>
          <div class="muted">${escapeHtml(t("vorsorge.kopf.alterseinkommen"))}</div>
          <div class="vermoegen-netto">${escapeHtml(formatMoney(gesamt))} ${einheit(t("vorsorge.jeMonatBrutto"))}</div>
          <div class="kpi-note">${escapeHtml(renten.length ? notizen.join(" · ") : t("vorsorge.kopf.keineRenten"))}</div>
          ${renten.length ? `${balkenSvg(segmente)}<div class="vermoegen-legende">${legende}</div>` : ""}
        </div>
        ${kz(t("vorsorge.kopf.kapital"), escapeHtml(formatMoney(kapital.summe)), kapital.jahre.length ? escapeHtml(tf("vorsorge.kopf.kapitalFaellig", { jahre: kapital.jahre.join(", ") })) : "")}
        ${kz(t("vorsorge.kopf.rueckkaufswerte"), escapeHtml(formatMoney(rkw)), escapeHtml(tf("vorsorge.kopf.bewertet", { mit: vorsorgePositionen.filter((p) => !p.fehlt).length, gesamt: vorsorgePositionen.length })))}
        ${kz(t("vorsorge.kopf.beitraege"), `${escapeHtml(formatMoney(beitragVorsorge))} ${einheit(t("vorsorge.jeMonat"))}`, escapeHtml(tf("vorsorge.kopf.beitraegeNotiz", { betrag: formatMoney(beitragVersicherung) })))}
      </section>
    </div>`;
}

function kapitalLeistungen() {
  const liste = (data.vorsorge ?? []).filter((vs) => !istBeendet(vs)).map((vs) => ({ vs, zw: zeitwert(vs, "erwartete_kapitalleistung") })).filter((x) => x.zw);
  return {
    summe: liste.reduce((a, x) => a + cents(x.zw.wert), 0),
    jahre: [...new Set(liste.map((x) => x.vs.leistung_beginn?.slice(0, 4)).filter(Boolean))].sort(),
  };
}

// ------------------------------------------------------------- Tabs

// Kennzahl je Tab: erwartete Monatsrente, Rueckkaufswerte bzw. Jahresbeitraege.
function tabBetrag(tab, today) {
  const aktiv = vertraegeIm(tab).filter((vs) => !istBeendet(vs));
  const summeZeitwert = (feld) => aktiv.reduce((a, vs) => a + (zeitwert(vs, feld) ? cents(zeitwert(vs, feld).wert) : 0), 0);
  if (tab === "renten") return summeZeitwert("erwartete_rente");
  if (tab === "lebensversicherungen") return summeZeitwert("rueckkaufswert");
  return aktiv.reduce((a, vs) => a + beitragJeJahrVertrag(data, vs.vorsorge_id, today), 0);
}

const tabUnter = (tab, today) => `${geldOhneCent(tabBetrag(tab, today))} ${t(`vorsorge.tabEinheit.${tab}`)}`;

function renderTabs(aktiv, today, offen) {
  const knopf = (tab) => {
    const liste = tab === "uebersicht" ? null : vertraegeIm(tab);
    if (liste && !liste.length) return "";
    const titel = liste ? `${liste.length} ${t(`vorsorge.tabs.${tab}`)}` : t("vorsorge.tabs.uebersicht");
    const unter = liste ? tabUnter(tab, today) : t("vorsorge.tabUebersichtUnter");
    const n = liste ? liste.filter((vs) => offen.has(vs.vorsorge_id)).length : 0;
    const punkt = n ? `<span class="tab-punkt" title="${escapeHtml(tf("vermoegen.offenAnzahl", { n }))}"></span>` : "";
    return `
      <button class="vermoegen-tab ${tab === aktiv ? "active" : ""}" role="tab" aria-selected="${tab === aktiv}" aria-controls="vorsorge-tab-${tab}" data-action="vorsorge-tab" data-tab="${tab}">
        <span class="vermoegen-tab-titel">${escapeHtml(titel)}${punkt}</span>
        <span class="vermoegen-tab-unter">${escapeHtml(unter)}</span>
      </button>`;
  };
  return `<div class="vermoegen-tabs" role="tablist" aria-label="${escapeHtml(t("vorsorge.title"))}">${VORSORGE_TABS.map(knopf).join("")}</div>`;
}

// ------------------------------------------------------------- Uebersicht

function renderUebersichtTab(today, offen) {
  const karten = GRUPPEN_TABS.filter((tab) => vertraegeIm(tab).length).map((tab) => {
    const liste = vertraegeIm(tab);
    const n = liste.filter((vs) => offen.has(vs.vorsorge_id)).length;
    const ungeprueft = liste.filter((vs) => !istBeendet(vs) && !vs.geprueft_am).length;
    const arten = [...new Set(liste.map((vs) => vorsorgeArtLabel(vs.art)))].join(", ");
    const zeile = ungeprueft ? tf("vorsorge.karte.ungeprueft", { n: ungeprueft }) : arten;
    const chip = n
      ? `<span class="chip review">${iconSvg("review")}${escapeHtml(tf("vermoegen.offenAnzahl", { n }))}</span>`
      : `<span class="chip success">${iconSvg("success")}${escapeHtml(t("vermoegen.vollstaendig"))}</span>`;
    return `
      <button class="tile klassen-karte" data-action="vorsorge-tab" data-tab="${tab}">
        <strong>${escapeHtml(t(`vorsorge.tabs.${tab}`))}</strong>
        <div class="count">${escapeHtml(geldOhneCent(tabBetrag(tab, today)))}</div>
        <div class="kpi-note">${escapeHtml(t(`vorsorge.tabEinheit.${tab}`))} · ${escapeHtml(zeile)}</div>
        ${chip}
      </button>`;
  }).join("");

  return `
    <div class="klassen-karten">${karten}</div>
    <div class="vorsorge-uebersicht-raster">
      ${renderZeitstrahlPanel(today)}
      ${renderOffenePunkte(offen)}
    </div>`;
}

function renderZeitstrahlPanel(today) {
  const z = leistungsZeitstrahl(data, today);
  const titel = `<h2 class="section-title">${escapeHtml(t("vorsorge.zeitstrahl.titel"))}</h2>`;
  if (!z) return `<section class="panel panel-pad">${titel}<p class="muted">${escapeHtml(t("vorsorge.zeitstrahl.leer"))}</p></section>`;
  // Ein Marker je Jahr, sonst ueberlagern sich die Beschriftungen naher Termine.
  const jeJahr = new Map();
  for (const l of z.leistungen) {
    const jahr = Math.floor(l.pos);
    if (!jeJahr.has(jahr)) jeJahr.set(jahr, { pos: l.pos, rente: 0, kapital: 0 });
    jeJahr.get(jahr)[l.typ] += l.wert_cents;
  }
  const ereignisse = [...jeJahr.values()].map((e) => ({
    pos: e.pos,
    label: [
      e.rente ? tf("vorsorge.zeitstrahl.rentePlus", { betrag: geldOhneCent(e.rente) }) : "",
      e.kapital ? `${t("vorsorge.zeitstrahl.kapital")} ${geldOhneCent(e.kapital)}` : "",
    ].filter(Boolean).join(" · "),
  }));
  const svg = zeitstrahlDiagramm({
    spalten: z.jahre.map((j) => ({ label: String(j), titel: String(j) })),
    serien: [{ klasse: "vorsorge-rente", label: t("vorsorge.zeitstrahl.monatsrente"), werte: z.rente }],
    ereignisse,
    formatWert: (c) => formatMoney(c),
    formatAchse: geldOhneCent,
    ariaLabel: t("vorsorge.zeitstrahl.titel"),
  });
  return `
    <section class="panel panel-pad">
      ${titel}
      <p class="muted diagramm-lead">${escapeHtml(t("vorsorge.zeitstrahl.lead"))}</p>
      <div class="diagramm-wrap">${svg}</div>
    </section>`;
}

function renderOffenePunkte(offen) {
  const vertraege = (data.vorsorge ?? []).filter((vs) => offen.has(vs.vorsorge_id));
  const titel = `<h2 class="section-title">${escapeHtml(t("vorsorge.offen.titel"))}</h2>`;
  if (!vertraege.length) return `<section class="panel panel-pad">${titel}<p class="muted">${escapeHtml(t("vorsorge.offen.keine"))}</p></section>`;
  // Ungepruefte Vertraege einer Person in einer Zeile, sonst je Vertrag und Check.
  const zeilen = [];
  const ungeprueft = new Map();
  for (const vs of vertraege) {
    for (const c of offen.get(vs.vorsorge_id)) {
      if (c.art === "vorsorge-ungeprueft") {
        if (!ungeprueft.has(vs.person_id)) ungeprueft.set(vs.person_id, []);
        ungeprueft.get(vs.person_id).push(vs);
      } else zeilen.push({ vs, titel: vs.name, text: t(`vermoegen.checkArt.${c.art}`), detail: c.text });
    }
  }
  for (const [personId, liste] of ungeprueft) {
    zeilen.push({
      vs: liste[0],
      titel: liste.length > 1 ? tf("vorsorge.offen.ungeprueftGruppe", { n: liste.length, person: personName(personId) }) : liste[0].name,
      text: t("vermoegen.checkArt.vorsorge-ungeprueft"),
      detail: liste.map((vs) => vs.name).join(", "),
    });
  }
  return `
    <section class="panel panel-pad">
      ${titel}
      <ul class="vorsorge-offen-liste">${zeilen.map((z) => `
        <li>
          <span>
            <button class="linkish" data-action="select-vorsorge" data-vorsorge="${escapeHtml(z.vs.vorsorge_id)}" title="${escapeHtml(z.detail)}">${escapeHtml(z.titel)}</button>
            <span class="muted">${escapeHtml(z.text)}</span>
          </span>
          <span class="chip review">${escapeHtml(t("vorsorge.offen.chip"))}</span>
        </li>`).join("")}
      </ul>
    </section>`;
}

// ------------------------------------------------------------- Tab je Vertragsart

function renderGruppenTab(tab, today, offen) {
  const alle = vertraegeIm(tab);
  const personen = [...new Set(alle.map((vs) => vs.person_id))].sort((a, b) => personName(a).localeCompare(personName(b)));
  const person = personen.includes(state.vorsorgeFilters?.person) ? state.vorsorgeFilters.person : "";
  const liste = alle.filter((vs) => !person || vs.person_id === person);
  const laufend = liste.filter((vs) => !istBeendet(vs) && vs.geprueft_am);
  const ungeprueft = liste.filter((vs) => !istBeendet(vs) && !vs.geprueft_am);
  const beendet = liste.filter(istBeendet);
  const reihenfolge = [...laufend, ...ungeprueft, ...beendet];
  const auswahl = reihenfolge.find((vs) => vs.vorsorge_id === state.selectedVorsorgeId) || reihenfolge[0] || null;

  const filter = personen.length > 1 ? `
    <div class="segment" role="group" aria-label="${escapeHtml(t("vorsorge.filterPerson"))}">
      ${[["", t("vorsorge.allePersonen"), alle.length], ...personen.map((p) => [p, personName(p), alle.filter((vs) => vs.person_id === p).length])].map(([p, name, n]) => `
        <button class="${person === p ? "active" : ""}" data-action="vorsorge-person" data-person="${escapeHtml(p)}" aria-pressed="${person === p}">${escapeHtml(name)} ${n}</button>`).join("")}
    </div>` : "";
  const karten = (vertraege) => `<div class="objekt-karten">${vertraege.map((vs) => renderKarte(vs, tab, vs === auswahl, today, offen)).join("")}</div>`;
  const gruppe = (vertraege, titel, lead = "") => vertraege.length ? `
    <div class="vorsorge-gruppe-titel">${escapeHtml(titel)} (${vertraege.length})</div>
    ${lead ? `<p class="muted vorsorge-gruppe-lead">${escapeHtml(lead)}</p>` : ""}
    ${karten(vertraege)}` : "";

  return `
    <div class="vorsorge-tab-kopf"><span class="muted">${escapeHtml(tf("vorsorge.tabLead", { n: liste.length }))}</span>${filter}</div>
    ${laufend.length ? karten(laufend) : ""}
    ${gruppe(ungeprueft, t("vorsorge.gruppe.ungeprueft"), t("vorsorge.ungeprueftHinweis"))}
    ${gruppe(beendet, t("vorsorge.gruppe.beendet"))}
    ${auswahl ? renderDetail(auswahl, tab, today, offen) : `<section class="panel panel-pad"><p class="muted">${escapeHtml(t("vorsorge.noMatches"))}</p></section>`}`;
}

function renderKarte(vs, tab, aktiv, today, offen) {
  const rente = zeitwert(vs, "erwartete_rente");
  const rkw = zeitwert(vs, "rueckkaufswert");
  const kapital = zeitwert(vs, "erwartete_kapitalleistung");
  const vertragswert = zeitwert(vs, "vertragswert");
  const fehlt = `<span class="chip review">${escapeHtml(t("vorsorge.keinWert"))}</span>`;
  const beginn = vs.leistung_beginn ? tf("vorsorge.karte.leistungAb", { datum: formatDate(vs.leistung_beginn) }) : "";
  const zeilen = [];
  let wert;
  if (tab === "versicherungen") {
    const jahr = beitragJeJahrVertrag(data, vs.vorsorge_id, today);
    wert = jahr ? `${escapeHtml(formatMoney(jahr))} ${einheit(t("vorsorge.jeJahr"))}` : `<span class="muted">—</span>`;
    const naechster = naechsterBeitrag(data, vs.vorsorge_id, today);
    zeilen.push([personName(vs.person_id), naechster ? tf("vorsorge.karte.faellig", { datum: formatDate(naechster.datum) }) : ""].filter(Boolean).join(" · "));
    const vj = beitragVorjahr(data, vs.vorsorge_id);
    if (vj?.vorjahr_cents) zeilen.push(`${tf("vorsorge.karte.vorjahr", { betrag: formatMoney(vj.vorjahr_cents) })} · ${veraenderungText(vj)}`);
  } else if (tab === "renten") {
    // Hauptwert ist die Rente; ohne Rente der Rueckkaufs- bzw. Vertragswert.
    const ersatz = rkw || vertragswert;
    wert = rente ? `${escapeHtml(formatMoney(cents(rente.wert)))} ${einheit(t("vorsorge.jeMonat"))}` : ersatz ? escapeHtml(formatMoney(cents(ersatz.wert))) : fehlt;
    zeilen.push([personName(vs.person_id), beginn].filter(Boolean).join(" · "));
    if (rente && rkw) zeilen.push(`${t("vorsorge.rueckkaufswert")} ${formatMoney(cents(rkw.wert))}`);
    else if (rente && vertragswert) zeilen.push(`${t("vorsorge.vertragswert")} ${formatMoney(cents(vertragswert.wert))} · ${t("vorsorge.nichtImVermoegen")}`);
    else if (!rente && !rkw && vertragswert) zeilen.push(`${t("vorsorge.vertragswert")} · ${t("vorsorge.nichtImVermoegen")}`);
  } else {
    wert = rkw ? escapeHtml(formatMoney(cents(rkw.wert))) : fehlt;
    zeilen.push([personName(vs.person_id), beginn].filter(Boolean).join(" · "));
    if (kapital) zeilen.push(tf("vorsorge.karte.kapital", { betrag: formatMoney(cents(kapital.wert)) }));
    else {
      const beitrag = beitragJeMonatVertrag(data, vs.vorsorge_id, today);
      if (beitrag) zeilen.push(`${t("vorsorge.beitrag")} ${formatMoney(beitrag)} ${t("vorsorge.jeMonat")}`);
    }
  }
  const checks = offen.get(vs.vorsorge_id) ?? [];
  const chips = [
    vs.status !== "aktiv" ? statusChip(vs) : "",
    !vs.geprueft_am && !istBeendet(vs) ? `<span class="chip ungeprueft">${escapeHtml(t("vorsorge.ungeprueft"))}</span>` : "",
    checks.some((c) => c.art === "vorsorge-wiedervorlage") ? `<span class="chip review">${escapeHtml(t("vorsorge.wiedervorlage"))}</span>` : "",
    checks.some((c) => c.art === "vorsorge-wechsel") ? `<span class="chip review">${escapeHtml(t("vermoegen.checkArt.vorsorge-wechsel"))}</span>` : "",
    vs.kapitalbildend && tab !== "versicherungen" ? `<span class="chip kapitalbildend">${escapeHtml(t("vorsorge.kapitalbildend"))}</span>` : "",
  ].join("");
  const bezug = bezugLinks(vs);
  // Kein <button>: die Karte enthaelt mit dem Bezug einen eigenen Link.
  return `
    <div class="objekt-karte ${aktiv ? "active" : ""} ${vs.geprueft_am || istBeendet(vs) ? "" : "objekt-karte-ungeprueft"}" role="button" tabindex="0" data-action="select-vorsorge" data-vorsorge="${escapeHtml(vs.vorsorge_id)}" aria-pressed="${aktiv}">
      <span class="objekt-karte-kopf"><strong>${escapeHtml(vs.name)}</strong>${tab === "versicherungen" ? "" : `<span class="chip neutral">${escapeHtml(vorsorgeArtLabel(vs.art))}</span>`}</span>
      <span class="objekt-karte-wert">${wert}</span>
      ${zeilen.filter(Boolean).map((z) => `<span class="objekt-karte-zeile">${escapeHtml(z)}</span>`).join("")}
      ${bezug.length ? `<span class="objekt-karte-zeile objekt-karte-bezug">${iconSvg("vermoegen")}${escapeHtml(t("vorsorge.gehoertZu"))} ${bezug.join(", ")}</span>` : ""}
      ${chips ? `<span class="objekt-karte-chips">${chips}</span>` : ""}
    </div>`;
}

function veraenderungText(vj) {
  const diff = vj.letzte_cents - vj.vorjahr_cents;
  const prozent = vj.vorjahr_cents ? Math.round((diff / vj.vorjahr_cents) * 100) : 0;
  return `${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${Math.abs(prozent)} %`;
}

function statusChip(vs) {
  const className = vs.status === "aktiv" ? "success" : istBeendet(vs) ? "review" : "neutral";
  return `<span class="chip ${className}">${escapeHtml(statusLabel(vs.status))}</span>`;
}

// ------------------------------------------------------------- Detail in voller Breite

function renderDetail(vs, tab, today, offen) {
  return `
    <div class="objekt-detail-titel">
      <span class="muted">${escapeHtml(t("vermoegen.detailVon"))}</span>
      <h2 class="section-title">${escapeHtml(vs.name)}</h2>
    </div>
    <div class="objekt-detail">
      <div class="kennzahl-raster">${tab === "versicherungen" ? kennzahlenVersicherung(vs, today) : kennzahlenVorsorge(vs, today)}</div>
      <div class="vorsorge-detail-raster">
        ${renderVertragsdaten(vs, tab, offen)}
        ${renderBeitraege(vs, today)}
      </div>
      ${renderAnhang(vs)}
    </div>`;
}

function zeitwertNotiz(zw) {
  return `${qualitaetChip({ qualitaet: zw.qualitaet })} ${escapeHtml(formatDate(zw.standdatum))}`;
}

function kennzahlenVorsorge(vs, today) {
  const rkw = zeitwert(vs, "rueckkaufswert");
  const vertragswert = zeitwert(vs, "vertragswert");
  const rente = zeitwert(vs, "erwartete_rente");
  const kapital = zeitwert(vs, "erwartete_kapitalleistung");

  let wert;
  if (rkw) {
    const zusatz = vertragswert ? ` · ${escapeHtml(t("vorsorge.vertragswert"))} ${escapeHtml(geldOhneCent(cents(vertragswert.wert)))}` : "";
    wert = kennzahl(t("vorsorge.rueckkaufswert"), geld(cents(rkw.wert)), zeitwertNotiz(rkw) + zusatz);
  } else if (vertragswert) {
    wert = kennzahl(t("vorsorge.vertragswert"), geld(cents(vertragswert.wert)), `${escapeHtml(formatDate(vertragswert.standdatum))} · ${escapeHtml(t("vorsorge.nichtImVermoegen"))}`);
  } else if (vs.kapitalbildend) {
    wert = kennzahl(t("vorsorge.rueckkaufswert"), `<span class="chip review">${escapeHtml(t("vermoegen.qualityFehlend"))}</span>`, escapeHtml(t("vorsorge.nochNichtImVermoegen")));
  } else {
    wert = kennzahl(t("vorsorge.wert"), `<span class="muted">${escapeHtml(t("vorsorge.anwartschaftKurz"))}</span>`, escapeHtml(t("vorsorge.nichtImVermoegen")));
  }

  const leistung = rente
    ? kennzahl(t("vorsorge.erwarteteRente"), `${geld(cents(rente.wert))} ${einheit(t("vorsorge.jeMonat"))}`, zeitwertNotiz(rente))
    : kapital
      ? kennzahl(t("vorsorge.kapitalBeiAblauf"), geld(cents(kapital.wert)), zeitwertNotiz(kapital))
      : kennzahl(t("vorsorge.erwarteteLeistung"), `<span class="muted">—</span>`, escapeHtml(t("vorsorge.keineLeistung")));

  let beginnNotiz = "";
  if (vs.leistung_beginn) {
    const monate = monateBis(today, vs.leistung_beginn);
    const teile = [monate > 0 ? tf("vorsorge.inJahrenMonaten", { j: Math.floor(monate / 12), m: monate % 12 }) : t("vorsorge.laeuft")];
    const gesetzlich = vs.art === "gesetzliche-rente" ? null : gesetzlicherRentenbeginn(data, vs.person_id);
    if (gesetzlich) {
      const abstand = monateBis(gesetzlich, vs.leistung_beginn);
      teile.push(abstand === 0 ? t("vorsorge.mitGesetzlicherRente") : tf(abstand < 0 ? "vorsorge.vorGesetzlicherRente" : "vorsorge.nachGesetzlicherRente", { m: Math.abs(abstand) }));
    }
    beginnNotiz = escapeHtml(teile.join(" · "));
  }
  const beginn = kennzahl(t("vorsorge.leistungBeginn"), vs.leistung_beginn ? escapeHtml(formatDate(vs.leistung_beginn)) : `<span class="muted">—</span>`, vs.leistung_beginn ? beginnNotiz : escapeHtml(t("vorsorge.nichtHinterlegt")));

  const monat = beitragJeMonatVertrag(data, vs.vorsorge_id, today);
  const jahr = beitragJeJahrVertrag(data, vs.vorsorge_id, today);
  const jaehrlich = jaehrlichGezahlt(vs, today);
  const beitrag = jahr
    ? kennzahl(t("vorsorge.beitrag"), jaehrlich ? `${geld(jahr)} ${einheit(t("vorsorge.jeJahr"))}` : `${geld(monat)} ${einheit(t("vorsorge.jeMonat"))}`, escapeHtml(jaehrlich ? `${formatMoney(monat)} ${t("vorsorge.jeMonat")}` : `${formatMoney(jahr)} ${t("vorsorge.jeJahr")}`))
    : kennzahl(t("vorsorge.beitrag"), `<span class="muted">—</span>`, escapeHtml(t("vorsorge.keinBeitrag")));
  return wert + leistung + beginn + beitrag;
}

function kennzahlenVersicherung(vs, today) {
  const monat = beitragJeMonatVertrag(data, vs.vorsorge_id, today);
  const jahr = beitragJeJahrVertrag(data, vs.vorsorge_id, today);
  const naechster = naechsterBeitrag(data, vs.vorsorge_id, today);
  const vj = beitragVorjahr(data, vs.vorsorge_id);
  const konto = naechster?.regelzahlung.konto_id ? (kontenById.get(naechster.regelzahlung.konto_id)?.name || naechster.regelzahlung.konto_id) : "";
  let veraenderung;
  if (vj?.vorjahr_cents) {
    const diff = vj.letzte_cents - vj.vorjahr_cents;
    veraenderung = kennzahl(t("vorsorge.veraenderungVorjahr"), `<span class="${diff > 0 ? "betrag-negativ" : ""}">${diff > 0 ? "+" : ""}${escapeHtml(formatMoney(diff))}</span>`,
      escapeHtml(`${veraenderungText(vj)} · ${formatDate(vj.vorjahr_datum)}: ${formatMoney(vj.vorjahr_cents)} → ${formatDate(vj.letzte_datum)}: ${formatMoney(vj.letzte_cents)}`));
  } else {
    veraenderung = kennzahl(t("vorsorge.veraenderungVorjahr"), `<span class="muted">—</span>`, escapeHtml(t(vj ? "vorsorge.nurEineBuchung" : "vorsorge.keineBuchung")));
  }
  return kennzahl(t("vorsorge.jahresbeitrag"), jahr ? geld(jahr) : `<span class="muted">—</span>`, jahr ? escapeHtml(`${formatMoney(monat)} ${t("vorsorge.jeMonatUmgelegt")}`) : escapeHtml(t("vorsorge.keinBeitrag")))
    + kennzahl(t("vorsorge.naechsteFaelligkeit"), naechster ? escapeHtml(formatDate(naechster.datum)) : `<span class="muted">—</span>`, konto ? escapeHtml(tf("vorsorge.lastschriftVon", { konto })) : "")
    + veraenderung
    + kennzahl(t("vorsorge.geprueftAm"), vs.geprueft_am ? escapeHtml(formatDate(vs.geprueft_am)) : `<span class="chip ungeprueft">${escapeHtml(t("vorsorge.ungeprueft"))}</span>`, "");
}

function renderVertragsdaten(vs, tab, offen) {
  const vorgaenger = vs.ersetzt_vorsorge_id ? (data.vorsorge ?? []).find((v) => v.vorsorge_id === vs.ersetzt_vorsorge_id) : null;
  const nachfolger = (data.vorsorge ?? []).find((v) => v.ersetzt_vorsorge_id === vs.vorsorge_id);
  const verweis = (v) => `<button class="linkish" data-action="select-vorsorge" data-vorsorge="${escapeHtml(v.vorsorge_id)}">${escapeHtml(`${v.vorsorge_id} · ${v.name}`)}</button>`;
  const beitraege = (data.regelzahlungen ?? []).filter((rz) => rz.vorsorge_id === vs.vorsorge_id);
  const beitragZeilen = beitraege.map((rz) => `<div><button class="linkish" data-action="open-regelzahlung" data-regelzahlung="${escapeHtml(rz.regelzahlung_id)}">${escapeHtml(`${rz.regelzahlung_id} · ${rz.bezeichnung}`)}</button> <span class="muted">${escapeHtml(`${formatMoney(cents(rz.betrag))} · ${rhythmusLabel(rz.rhythmus_einheit, rz.rhythmus_intervall)}${rz.aktiv_bis ? ` · ${t("vorsorge.aktivBis")} ${formatDate(rz.aktiv_bis)}` : ""}`)}</span></div>`).join("");
  const wiedervorlage = (offen.get(vs.vorsorge_id) ?? []).some((c) => c.art === "vorsorge-wiedervorlage");
  const quelle = [vs.quelle_hinweis ? quelleHtml(vs.quelle_hinweis) : "", vs.quelle_standdatum ? escapeHtml(formatDate(vs.quelle_standdatum)) : ""].filter(Boolean).join(" · ");
  return `
    <section class="panel panel-pad">
      <h2 class="section-title">${escapeHtml(t("vorsorge.vertragsdaten"))}</h2>
      <div class="stammdaten-raster">
        ${detailRow(t("labels.id"), escapeHtml(vs.vorsorge_id))}
        ${detailRow(t("labels.type"), escapeHtml(vorsorgeArtLabel(vs.art)))}
        ${detailRow(t("labels.owner"), escapeHtml(personName(vs.person_id)))}
        ${detailRow(t("labels.status"), statusChip(vs))}
        ${tab === "versicherungen" ? "" : detailRow(t("vorsorge.kapitalbildendLabel"), escapeHtml(vs.kapitalbildend ? t("labels.yes") : t("labels.no")))}
        ${vs.kapitalwahl ? detailRow(t("vorsorge.kapitalwahl"), escapeHtml(vs.kapitalwahl)) : ""}
        ${vs.aktiv_bis ? detailRow(t("vorsorge.aktivBis"), escapeHtml(formatDate(vs.aktiv_bis))) : ""}
        ${detailRow(t("vorsorge.geprueftAm"), vs.geprueft_am
          ? `${escapeHtml(formatDate(vs.geprueft_am))}${wiedervorlage ? ` <span class="chip review">${escapeHtml(t("vorsorge.wiedervorlage"))}</span>` : ""}`
          : `<span class="chip ungeprueft">${escapeHtml(t("vorsorge.ungeprueft"))}</span>`)}
        ${bezugLinks(vs).length ? detailRow(t("vorsorge.gehoertZu"), bezugLinks(vs).join("<br>")) : ""}
        ${vorgaenger ? detailRow(t("vorsorge.vorgaenger"), verweis(vorgaenger)) : ""}
        ${nachfolger ? detailRow(t("vorsorge.nachfolger"), verweis(nachfolger)) : ""}
      </div>
      ${quelle ? detailRow(t("vorsorge.vertragsquelle"), quelle) : ""}
      ${beitraege.length ? detailRow(t("vorsorge.erwarteteBeitraege"), beitragZeilen) : ""}
    </section>`;
}

function renderBeitraege(vs, today) {
  const titel = `<h2 class="section-title">${escapeHtml(t("vorsorge.gebuchteBeitraege"))}</h2>`;
  if (!(data.regelzahlungen ?? []).some((rz) => rz.vorsorge_id === vs.vorsorge_id)) {
    return `<section class="panel panel-pad">${titel}<p class="muted">${escapeHtml(t("vorsorge.keinBeitrag"))}</p></section>`;
  }
  const verlauf = beitragsVerlauf(data, vs.vorsorge_id, today);
  const monatsName = (p) => {
    const [jahr, mon] = p.split("-").map(Number);
    return new Intl.DateTimeFormat(state.lang === "en" ? "en-GB" : "de-DE", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(jahr, mon - 1, 1)));
  };
  const svg = beitragsBalken({
    perioden: verlauf.perioden,
    werte: verlauf.werte,
    formatWert: (c) => formatMoney(c),
    formatAchse: geldOhneCent,
    formatPeriode: verlauf.einheit === "jahr" ? String : monatsName,
    label: t("vorsorge.beitrag"),
    ariaLabel: t("vorsorge.gebuchteBeitraege"),
  });
  const buchungen = gebuchteBeitraege(vs.vorsorge_id);
  return `
    <section class="panel panel-pad">
      ${titel}
      ${svg ? `<p class="muted diagramm-lead">${escapeHtml(t(verlauf.einheit === "jahr" ? "vorsorge.beitraegeJahreLead" : "vorsorge.beitraegeMonateLead"))}</p><div class="diagramm-wrap">${svg}</div>` : ""}
      ${buchungen.length ? `
        <ul class="vorsorge-buchungen">${buchungen.map((tx) => `
          <li>
            <button class="linkish" data-action="open-transaction" data-transaction="${escapeHtml(tx.transaktion_id)}">${escapeHtml(formatDate(tx.buchungsdatum))} · ${escapeHtml(tx.gegenpartei ?? "")}</button>
            <span class="amount">${escapeHtml(formatMoney(cents(tx.betrag)))}</span>
          </li>`).join("")}
        </ul>` : `<p class="muted">${escapeHtml(t("vorsorge.keineBuchung"))}</p>`}
    </section>`;
}

const FELD_LABEL = {
  rueckkaufswert: "vorsorge.rueckkaufswert",
  vertragswert: "vorsorge.vertragswert",
  erwartete_rente: "vorsorge.erwarteteRente",
  erwartete_kapitalleistung: "vorsorge.erwarteteKapitalleistung",
};

function renderAnhang(vs) {
  const staende = (data.zeitwerte ?? [])
    .filter((zw) => zw.entitaet === "vorsorge" && zw.entitaet_id === vs.vorsorge_id)
    .sort((a, b) => b.standdatum.localeCompare(a.standdatum) || a.feld.localeCompare(b.feld));
  const wertstaende = staende.length
    ? staende.map((zw) => `
      <div class="wertstand-item">
        <div><strong>${escapeHtml(formatMoney(cents(zw.wert)))}</strong> <span class="muted">${escapeHtml(t(FELD_LABEL[zw.feld] ?? zw.feld))}${zw.feld === "vertragswert" ? ` (${escapeHtml(t("vorsorge.nichtImVermoegen"))})` : ""} · ${escapeHtml(formatDate(zw.standdatum))}</span></div>
        <div>${qualitaetChip({ qualitaet: zw.qualitaet })}</div>
        ${zw.quelle_hinweis ? `<div class="muted">${quelleHtml(zw.quelle_hinweis)}</div>` : ""}
      </div>`).join("")
    : `<p class="muted">${escapeHtml(t("vermoegen.noWertstaende"))}</p>`;
  // Bemerkungen sind oft lange Arbeitsnotizen: eingeklappt.
  const bemerkung = vs.bemerkung
    ? `<details class="bemerkung"><summary>${escapeHtml(t("vorsorge.bemerkung"))}</summary><p>${escapeHtml(vs.bemerkung)}</p></details>`
    : "";
  return `
    <section class="panel panel-pad objekt-anhang">
      <h2 class="section-title">${escapeHtml(t("vorsorge.anhangTitel"))}</h2>
      ${bemerkung}
      <h3 class="section-subtitle">${escapeHtml(t("vermoegen.wertstaende"))}</h3>
      ${wertstaende}
      <h3 class="section-subtitle">${escapeHtml(t("vermoegen.dokumente.titel"))}</h3>
      ${dokumenteBrowserHtml([vs.vorsorge_id], belegOrdnerAusText(vs.quelle_hinweis))}
    </section>`;
}

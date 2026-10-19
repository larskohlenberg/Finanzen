// app/views/vermoegen.mjs
// Vermoegensseite: je Klasse ein Tab (Uebersicht, Konten & Depots, Immobilien,
// Darlehen, Sonstige Werte); die Kennzahlen stehen im Uebersichtstab. Vorsorge hat nur einen Verweis-Reiter auf die Vorsorge-Seite, die die
// Details traegt. Immobilien und Darlehen rendert vermoegen-objekte.mjs.
import { data, state, t, tf, fmt, escapeHtml, cents, kontenById, personenById } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { formatMoney, formatDate, formatMonth, detailRow, renderPageHead, renderAccountPanels, accountOwnerNames, accountTypeLabel, quelleHtml, saldoLinie, kennzahlKachel, kachelZeile, zeitverlaufKlein } from "../komponenten.mjs";
import { donutDiagramm } from "../charts.mjs";
import { aktuellerZeitwert, anteilWertCents, restschuldJahre } from "../vermoegen.mjs";
import { immobilienKennzahlen } from "../vermoegen-details.mjs";
import { VERMOEGEN_TABS, TAB_FUER_KLASSE } from "../vermoegen-routen.mjs";
import { localTodayIso } from "../liquiditaet.mjs";
import { renderImmobilienTab, renderDarlehenTab } from "./vermoegen-objekte.mjs";
import { balkenSvg, dokumenteHtml, geld, qualitaetChip, rateJeMonatCents, renderPositionWertstaende } from "./vermoegen-teile.mjs";
import { renderWertstaendeTabelle } from "./vermoegen-wertstaende.mjs";
import { kontenAntwort } from "./konten-daten.mjs";
import { erstelleApiCache } from "../api-daten.mjs";

// Was Buchungen braucht (Nettovermoegen, offene Punkte, Verlauf, Monate und
// Investitionen der Immobilien), rechnet der App-Server (GET /api/v1/vermoegen,
// app/vermoegen-modell.mjs), die Werte der Konten GET /api/v1/konten. Darlehen,
// Kennzahlen einer Immobilie und Wertstaende rechnet weiter der Browser aus
// Stammdaten und Zeitwerten.
const cache = erstelleApiCache({ maxEintraege: 4 });

function vermoegenAntwort(heute) {
  const suche = new URLSearchParams();
  if (state.dataMode === "demo") suche.set("quelle", "demo");
  suche.set("heute", heute);
  return cache.hole(`./api/v1/vermoegen?${suche}`);
}

const KLASSEN = ["konto", "immobilie", "darlehen", "vermoegenswert", "vorsorge"];

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

export function renderVermoegen() {
  const today = localTodayIso();
  const vm = vermoegenAntwort(today);
  const km = kontenAntwort(today);
  if (!vm.antwort || !km.antwort) {
    const fehler = vm.fehler ?? km.fehler;
    return `
    ${renderPageHead(t("vermoegen.title"), t("vermoegen.lead"))}
    <section class="panel panel-pad"><p class="muted" role="status">${escapeHtml(fehler ? `${t("vermoegen.loadFailed")} (${fehler.message})` : t("vermoegen.loading"))}</p></section>`;
  }
  const modell = vm.antwort;
  const konten = km.antwort;
  const r = modell.netto;
  const checks = modell.checks;
  const je = klassenUebersicht(r, checks);
  const tab = aktiverTab();

  let inhalt;
  if (tab === "konten") inhalt = renderKontenTab(r, today, konten);
  else if (tab === "immobilien") inhalt = renderImmobilienTab(today, modell);
  else if (tab === "darlehen") inhalt = renderDarlehenTab(today);
  else if (tab === "sonstige") inhalt = renderSonstigeTab(r, today);
  else inhalt = renderUebersichtTab(r, je, today, checks, modell);

  return `
    ${renderPageHead(t("vermoegen.title"), t("vermoegen.lead"))}
    ${renderTabs(tab, je)}
    <div class="vermoegen-tab-inhalt" role="tabpanel" id="vermoegen-tab-${tab}">${inhalt}</div>`;
}

// ------------------------------------------------------------- Tabs

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
    // Anzahl vor dem Titel ("4 Immobilien"), darunter nur die Summe.
    const titel = e ? `${e.anzahl} ${t(`vermoegen.tabs.${tab}`)}` : t(`vermoegen.tabs.${tab}`);
    const unter = e ? formatMoney(e.summe) : t("vermoegen.tabUebersichtUnter");
    const punkt = e && e.offen.size ? `<span class="tab-punkt" title="${escapeHtml(tf("vermoegen.offenAnzahl", { n: e.offen.size }))}"></span>` : "";
    return `
      <button class="vermoegen-tab ${tab === aktiv ? "active" : ""}" role="tab" aria-selected="${tab === aktiv}" aria-controls="vermoegen-tab-${tab}" data-action="vermoegen-tab" data-tab="${tab}">
        <span class="vermoegen-tab-titel">${escapeHtml(titel)}${punkt}</span>
        <span class="vermoegen-tab-unter">${escapeHtml(unter)}</span>
      </button>`;
  }).join("");
  // Vorsorge hat keinen eigenen Tab-Inhalt: der Reiter fuehrt auf die Vorsorge-Seite.
  const vorsorge = `
      <button class="vermoegen-tab vermoegen-tab-verweis" data-view="vorsorge" title="${escapeHtml(t("vermoegen.tabVorsorgeHinweis"))}">
        <span class="vermoegen-tab-titel">${escapeHtml(`${je.vorsorge.anzahl} ${t("vermoegen.klassePlural.vorsorge")}`)}${iconSvg("chevronRight")}</span>
        <span class="vermoegen-tab-unter">${escapeHtml(formatMoney(je.vorsorge.summe))}</span>
      </button>`;
  return `<div class="vermoegen-tabs" role="tablist" aria-label="${escapeHtml(t("vermoegen.title"))}">${knoepfe}${vorsorge}</div>`;
}

// ------------------------------------------------------------- Rail (Konten, Sonstige, Wertstaende)

function mitRail(inhalt, railHtml, titel) {
  if (!railHtml || state.vermoegenDetailRailClosed) return inhalt;
  return `
    <div class="layout-with-rail">
      <div class="stack">${inhalt}</div>
      <aside class="panel panel-pad detail-panel">
        <div class="detail-head">
          <h2 class="section-title">${escapeHtml(titel)}</h2>
          <div class="detail-actions">
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

// Gleicher Aufbau wie die Vorsorge-Uebersicht: Kacheln paarweise, je Wert,
// Notiz, flacher Verlauf und Aufschluesselung. Oben Nettovermoegen und
// Restschuld, darunter Konten und die uebrigen Werte, dann die offenen Punkte
// und die Wertstaende (zu). Die Klassensummen stehen schon in den Tabs.
const geldOhneCent = (c) => fmt().geldGanz(c);
const positionLink = (klasse, id, name) => `<button class="linkish" data-action="select-vermoegen" data-vermoegen="${escapeHtml(`${klasse}:${id}`)}" title="${escapeHtml(name)}">${escapeHtml(name)}</button>`;
const KONTOTYPEN = ["giro", "tagesgeld", "spar", "festgeld", "kreditkarte", "depot"];

function renderUebersichtTab(r, je, today, checks, modell) {
  return `
    <div class="kachel-paare kachel-paare-oben">
      ${nettoKachel(r, je, modell.verlauf)}
      ${restschuldKachel(r, today)}
    </div>
    <div class="kachel-paare">
      ${kontenKachel(r, je)}
      ${werteKachel(r, je, today)}
    </div>
    ${renderOffenePunkte(checks)}
    ${renderWertstaendeTabelle()}`;
}

function nettoKachel(r, je, verlauf) {
  const aktiva = Math.max(r.aktiva_cents, 1);
  const segmente = ["konto", "immobilie", "vermoegenswert", "vorsorge"]
    .map((k) => ({ anteil: je[k].summe / aktiva, klasse: `segment-${k}`, titel: `${t(`vermoegen.klassePlural.${k}`)}: ${formatMoney(je[k].summe)}` }));
  const legende = ["konto", "immobilie", "vermoegenswert", "vorsorge", "darlehen"]
    .filter((k) => je[k].summe !== 0)
    .map((k) => `<span><i class="segment-${k}"></i>${escapeHtml(t(`vermoegen.klassePlural.${k}`))} ${escapeHtml(geldOhneCent(je[k].summe))}</span>`)
    .join("");
  // Veraenderung gegen den Stand vor zwoelf Monaten (oder den aeltesten).
  const vorher = verlauf.length > 1 ? verlauf[Math.max(0, verlauf.length - 13)] : null;
  const diff = vorher ? r.netto_cents - vorher.netto_cents : 0;
  const notiz = [
    `${escapeHtml(t("vermoegen.aktiva"))}: ${escapeHtml(geldOhneCent(r.aktiva_cents))} · ${escapeHtml(t("vermoegen.passiva"))}: ${escapeHtml(geldOhneCent(r.passiva_cents))}`,
    vorher ? escapeHtml(tf("vermoegen.uebersicht.veraenderung", { betrag: `${diff > 0 ? "+" : ""}${geldOhneCent(diff)}`, seit: formatMonth(vorher.monat) })) : "",
  ].filter(Boolean).join("<br>");
  const unten = `${verlauf.length > 1 ? zeitverlaufKlein({
    spalten: verlauf.map((p) => ({ label: p.monat.endsWith("-01") ? p.monat.slice(0, 4) : "", titel: formatMonth(p.monat) })),
    serien: [{ klasse: "vermoegen-netto-linie", label: t("vermoegen.netto"), werte: verlauf.map((p) => p.netto_cents) }],
    formatWert: (c) => formatMoney(c),
    formatAchse: geldOhneCent,
    labelSchritt: 1,
    ariaLabel: t("vermoegen.uebersicht.nettoVerlauf"),
  }) : ""}
    ${balkenSvg(segmente)}
    ${balkenSvg([{ anteil: 1, klasse: "segment-darlehen", titel: `${t("vermoegen.passiva")}: ${formatMoney(r.passiva_cents)}` }], { laenge: r.passiva_cents / aktiva })}
    <div class="vermoegen-legende">${legende}</div>`;
  return kennzahlKachel({ label: t("vermoegen.netto"), wert: escapeHtml(geldOhneCent(r.netto_cents)), notiz, unten, info: t("vermoegen.uebersicht.nettoInfo") });
}

function restschuldKachel(r, today) {
  const darlehen = (data.darlehen ?? []).filter((d) => d.status !== "abgeloest");
  const rate = darlehen.reduce((summe, d) => summe + rateJeMonatCents(d), 0);
  const z = restschuldJahre(data, today);
  const freiJahr = z?.frei_ab?.slice(0, 4);
  const notiz = escapeHtml(freiJahr ? tf("vermoegen.uebersicht.rateFrei", { rate: formatMoney(rate), jahr: freiJahr }) : tf("vermoegen.uebersicht.rate", { rate: formatMoney(rate) }));
  // Ein Marker je Jahr, sonst ueberlagern sich die Beschriftungen naher Termine.
  const jeJahr = new Map();
  for (const e of z?.ereignisse ?? []) {
    const jahr = Number(e.datum.slice(0, 4));
    const pos = jahr - z.jahre[0] + (Number(e.datum.slice(5, 7)) - 1) / 12;
    if (!jeJahr.has(jahr)) jeJahr.set(jahr, { pos, texte: new Set() });
    jeJahr.get(jahr).texte.add(t(`vermoegen.uebersicht.ereignis.${e.typ}`));
  }
  const unten = z && z.jahre.length > 1 ? zeitverlaufKlein({
    spalten: z.jahre.map((j) => ({ label: String(j), titel: tf("vermoegen.uebersicht.jahresende", { jahr: j }) })),
    serien: [{ klasse: "vermoegen-restschuld-linie", label: t("vermoegen.uebersicht.restschuld"), werte: z.rest }],
    ereignisse: [...jeJahr.values()].map((e) => ({ pos: e.pos, label: [...e.texte].join(" · ") })),
    formatWert: (c) => formatMoney(c),
    formatAchse: geldOhneCent,
    ariaLabel: t("vermoegen.uebersicht.restschuldVerlauf"),
  }) : "";
  const frei = new Map((z?.ereignisse ?? []).filter((e) => e.typ === "frei").map((e) => [e.darlehen.darlehen_id, e.datum.slice(0, 4)]));
  const zeilen = r.positionen.filter((p) => p.klasse === "darlehen")
    .sort((a, b) => a.wert_cents - b.wert_cents)
    .map((p) => kachelZeile(positionLink("darlehen", p.id, p.name), p.fehlt ? "—" : geldOhneCent(p.wert_cents), frei.has(p.id) ? tf("vermoegen.uebersicht.freiJahr", { jahr: frei.get(p.id) }) : "", "segment-darlehen"));
  return kennzahlKachel({ label: t("vermoegen.uebersicht.restschuld"), wert: geld(-r.passiva_cents, { negativ: true, ganz: true }), notiz, zeilen, unten });
}

function kontenKachel(r, je) {
  const positionen = r.positionen.filter((p) => p.klasse === "konto");
  const typ = (id) => kontenById.get(id)?.kontotyp;
  const konten = (data.konten ?? []).filter((k) => k.status !== "geschlossen" && k.kontotyp !== "bar");
  const depots = konten.filter((k) => k.kontotyp === "depot").length;
  const jeTyp = KONTOTYPEN.map((k) => ({ k, wert: positionen.filter((p) => typ(p.id) === k).reduce((a, p) => a + p.wert_cents, 0) })).filter((x) => x.wert > 0);
  const grafik = donutDiagramm({ teile: jeTyp.map((x) => ({ wert: x.wert, klasse: `kontotyp-farbe-${x.k}`, label: accountTypeLabel(x.k) })), formatWert: formatMoney, ariaLabel: t("vermoegen.uebersicht.kontenAnteile") });
  const zeilen = [...positionen]
    .sort((a, b) => Number(a.fehlt) - Number(b.fehlt) || b.wert_cents - a.wert_cents)
    .map((p) => kachelZeile(positionLink("konto", p.id, p.name), p.fehlt ? "—" : formatMoney(p.wert_cents), "", KONTOTYPEN.includes(typ(p.id)) ? `kontotyp-farbe-${typ(p.id)}` : ""));
  return kennzahlKachel({
    label: t("vermoegen.klassePlural.konto"),
    wert: geld(je.konto.summe, { negativ: true, ganz: true }),
    notiz: escapeHtml(tf("vermoegen.karte.konten", { konten: konten.length - depots, depots })),
    zeilen,
    grafik,
  });
}

// Immobilien, Sonstige Werte und Rueckkaufswerte der Vorsorge (die Vorsorge als
// eine Zeile mit Verweis auf ihre Seite).
function werteKachel(r, je, today) {
  const klassen = ["immobilie", "vermoegenswert", "vorsorge"];
  const summe = klassen.reduce((a, k) => a + je[k].summe, 0);
  const immobilien = (data.immobilien ?? []).filter((i) => i.status !== "verkauft");
  const eigenkapital = immobilien.reduce((a, i) => a + (immobilienKennzahlen(data, i.immobilie_id, today).eigenkapital_cents ?? 0), 0);
  const grafik = donutDiagramm({ teile: klassen.filter((k) => je[k].summe > 0).map((k) => ({ wert: je[k].summe, klasse: `segment-${k}`, label: t(`vermoegen.klassePlural.${k}`) })), formatWert: formatMoney, ariaLabel: t("vermoegen.uebersicht.werteAnteile") });
  const zeilen = [
    ...r.positionen.filter((p) => p.klasse === "immobilie" || p.klasse === "vermoegenswert")
      .sort((a, b) => b.wert_cents - a.wert_cents)
      .map((p) => kachelZeile(positionLink(p.klasse, p.id, p.name), p.fehlt ? "—" : formatMoney(p.wert_cents), "", `segment-${p.klasse}`)),
    ...(je.vorsorge.anzahl ? [kachelZeile(`<button class="linkish" data-view="vorsorge">${escapeHtml(t("vermoegen.uebersicht.vorsorgeZeile"))}</button>`, formatMoney(je.vorsorge.summe), "", "segment-vorsorge")] : []),
  ];
  return kennzahlKachel({
    label: t("vermoegen.uebersicht.werte"),
    wert: escapeHtml(geldOhneCent(summe)),
    notiz: immobilien.length ? escapeHtml(tf("vermoegen.uebersicht.eigenkapital", { ek: geldOhneCent(eigenkapital) })) : "",
    zeilen,
    grafik,
  });
}

// Offene Pruefpunkte je Objekt; die der Vorsorge als eine Zeile mit Verweis,
// denn ihre Details stehen auf der Vorsorge-Seite.
function renderOffenePunkte(checks) {
  const titel = `<h2 class="section-title">${escapeHtml(t("vermoegen.uebersicht.offenTitel"))}</h2>`;
  const NAMEN = {
    konto: (id) => kontenById.get(id)?.name,
    immobilie: (id) => (data.immobilien ?? []).find((x) => x.immobilie_id === id)?.bezeichnung,
    darlehen: (id) => (data.darlehen ?? []).find((x) => x.darlehen_id === id)?.bezeichnung,
    vermoegenswert: (id) => (data.vermoegenswerte ?? []).find((x) => x.vermoegenswert_id === id)?.bezeichnung,
  };
  const je = new Map();
  let vorsorge = 0;
  for (const c of checks) {
    if (c.entitaet === "vorsorge") { vorsorge += 1; continue; }
    const key = `${c.entitaet}:${c.entitaet_id}`;
    if (!je.has(key)) je.set(key, { c, arten: new Set(), texte: [] });
    je.get(key).arten.add(t(`vermoegen.checkArt.${c.art}`));
    je.get(key).texte.push(c.text);
  }
  if (!je.size && !vorsorge) return `<p class="vorsorge-offen-keine"><span class="chip success">${iconSvg("success")}${escapeHtml(t("vermoegen.uebersicht.offenKeine"))}</span></p>`;
  const zeilen = [...je.values()].map(({ c, arten, texte }) => {
    const name = NAMEN[c.entitaet]?.(c.entitaet_id) ?? c.entitaet_id;
    const link = NAMEN[c.entitaet]
      ? `<button class="linkish" data-action="select-vermoegen" data-vermoegen="${escapeHtml(`${c.entitaet}:${c.entitaet_id}`)}" title="${escapeHtml(texte.join("\n"))}">${escapeHtml(name)}</button>`
      : `<span title="${escapeHtml(texte.join("\n"))}">${escapeHtml(name)}</span>`;
    return `<li><span>${link} <span class="muted">${escapeHtml([...arten].join(", "))}</span></span><span class="chip review">${escapeHtml(t("vorsorge.offen.chip"))}</span></li>`;
  });
  if (vorsorge) zeilen.push(`<li><span><button class="linkish" data-view="vorsorge">${escapeHtml(tf("vermoegen.uebersicht.vorsorgeOffen", { n: vorsorge }))}</button></span><span class="chip review">${escapeHtml(t("vorsorge.offen.chip"))}</span></li>`);
  return `<section class="panel panel-pad vorsorge-offen">${titel}<ul class="vorsorge-offen-liste">${zeilen.join("")}</ul></section>`;
}

// ------------------------------------------------------------- Konten & Depots

function renderKontenTab(r, today, konten) {
  const p = ausgewaehltePosition(r, "konto");
  const inhalt = `<div class="stack">${renderAccountPanels(konten, { rowAction: "select-vermoegen-konto" })}</div>`;
  if (!p) return inhalt;
  const verlauf = konten.konten[p.id]?.saldo_verlauf ?? [];
  const linie = saldoLinie(verlauf.map((wert) => ({ wert })), t("vermoegen.konto.saldoVerlauf"));
  const rail = `
    ${renderVermoegenDetail(p, today, konten)}
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

// Auch von den Stammdaten (Konto-Rail) genutzt. konten: Antwort von
// GET /api/v1/konten (Buchungen seit dem Anker einer Kontoposition).
export function renderVermoegenDetail(p, today, konten) {
  const head = `
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t(`vermoegen.klasse.${p.klasse}`))}</div>
      <div class="detail-value"><strong>${escapeHtml(p.name)}</strong><br>${qualitaetChip(p)}</div>
    </div>`;

  if (p.klasse === "konto") {
    const konto = kontenById.get(p.id);
    const istDepot = konto?.kontotyp === "depot";
    const zw = aktuellerZeitwert(data.zeitwerte, "konto", p.id, istDepot ? "depotwert" : "kontostand", today);
    let buchungenHtml = "";
    if (!istDepot && zw) {
      buchungenHtml = detailRow(t("vermoegen.buchungenSeitAnker"), escapeHtml(formatMoney(konten.konten[p.id]?.seit_anker_cents ?? 0)));
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
    const mw = aktuellerZeitwert(data.zeitwerte, p.klasse, p.id, "marktwert", today);
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
      + renderPositionWertstaende(p)
      + (p.klasse === "vermoegenswert" ? detailRow(t("vermoegen.dokumente.titel"), dokumenteHtml([p.id])) : "");
  }

  return head;
}

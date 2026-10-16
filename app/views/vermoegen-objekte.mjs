// app/views/vermoegen-objekte.mjs
// Tabs Immobilien und Darlehen der Vermoegensseite: oben eine Karte je Objekt,
// darunter das gewaehlte Objekt in voller Breite: Kennzahlen und Stammdaten,
// dann Diagramme und Tabelle, zuletzt Bemerkung, Wertstaende und Dokumente.
// Rechnen in vermoegen-details.mjs, hier nur Darstellung.
import { data, state, t, escapeHtml, cents, personenById, kontenById } from "../runtime.mjs";
import { formatMoney, formatDate, formatMonth, detailRow, categoryName } from "../komponenten.mjs";
import { monatsBalken, jahresBalken, restschuldVerlauf } from "../charts.mjs";
import { darlehenKennzahlen, darlehensKategorien, immobilienKennzahlen, immobilienMonate } from "../vermoegen-details.mjs";
import {
  balkenSvg, dokumenteBrowserHtml, geld, kennzahl, laufzeitText, prozent, qualitaetChip, rateJeMonatCents,
  renderPositionWertstaende, rhythmusLabel, sondertilgungenRow, tf,
} from "./vermoegen-teile.mjs";

const aktiveImmobilien = () => (data.immobilien ?? []).filter((i) => i.status !== "verkauft");
const aktiveDarlehen = () => (data.darlehen ?? []).filter((d) => d.status !== "abgeloest");

// Gewaehltes Objekt der Klasse; ohne (gueltige) Auswahl das erste.
function gewaehlt(klasse, liste, idFeld) {
  const [k, id] = String(state.selectedVermoegenId ?? "").split(":");
  return (k === klasse && liste.find((e) => e[idFeld] === id)) || liste[0] || null;
}

// Bemerkungen sind oft lange Arbeitsnotizen: eingeklappt, damit die Stammdaten lesbar bleiben.
function bemerkungHtml(text) {
  if (!text) return "";
  return `<details class="bemerkung"><summary>${escapeHtml(t("vermoegen.immobilie.bemerkung"))}</summary><p>${escapeHtml(text)}</p></details>`;
}

function karte({ klasse, id, aktiv, titel, chip = "", wertHtml, zeilen = [], fortschritt = null }) {
  return `
    <button class="objekt-karte ${aktiv ? "active" : ""}" data-action="select-vermoegen-objekt" data-vermoegen="${escapeHtml(`${klasse}:${id}`)}" aria-pressed="${aktiv}">
      <span class="objekt-karte-kopf"><strong>${escapeHtml(titel)}</strong>${chip}</span>
      <span class="objekt-karte-wert">${wertHtml}</span>
      ${fortschritt === null ? "" : balkenSvg([{ anteil: Math.max(0, fortschritt), klasse: "fortschritt-wert" }], { klasse: "fortschritt" })}
      ${zeilen.map((z) => `<span class="objekt-karte-zeile">${z}</span>`).join("")}
    </button>`;
}

// ------------------------------------------------------------- Immobilien

// "Okt 25" fuer die Achse; die Tabelle nutzt den vollen Monatsnamen.
function kurzMonat(monat) {
  const [jahr, mon] = monat.split("-").map(Number);
  const name = new Intl.DateTimeFormat(state.lang === "en" ? "en-GB" : "de-DE", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(jahr, mon - 1, 1)));
  return `${name.replace(".", "")} ${String(jahr).slice(2)}`;
}

// Achsenbeschriftung ohne Cent, damit der linke Rand schmal bleibt.
function achsenGeld(centsWert) {
  return new Intl.NumberFormat(state.lang === "en" ? "en-GB" : "de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(centsWert / 100);
}

// Trennt die Auswahlkarten optisch vom Detail des gewaehlten Objekts.
function detailTitel(name) {
  return `
    <div class="objekt-detail-titel">
      <span class="muted">${escapeHtml(t("vermoegen.detailVon"))}</span>
      <h2 class="section-title">${escapeHtml(name)}</h2>
    </div>`;
}

// Betrag in der Monatstabelle als Sprung in die gefilterten Transaktionen.
// transfer: "only" fuer die Eigenanteil-Spalte, "all" wenn der Saldo Eigenanteil enthaelt.
function buchungenLink(html, { immobilie, monat = "", von = "", bis = "", kategorie = "", transfer = "" }) {
  const attr = (name, wert) => (wert ? ` data-${name}="${escapeHtml(wert)}"` : "");
  return `<button class="linkish betrag-link" data-action="immobilie-transactions"${attr("immobilie", immobilie)}${attr("monat", monat)}${attr("von", von)}${attr("bis", bis)}${attr("kategorie", kategorie)}${attr("transfer", transfer)} title="${escapeHtml(t("vermoegen.immobilie.buchungenZeigen"))}">${html}</button>`;
}

// Wertstaende unter Tabelle und Diagramm, darunter die Dokumente in voller Breite
// als Ausschnitt der Dokumentenansicht.
function anhangPanel(titel, { bemerkung = "", wertstaende, dokumente, extra = "" }) {
  return `
    <section class="panel panel-pad objekt-anhang">
      <h2 class="section-title">${escapeHtml(titel)}</h2>
      ${bemerkung}
      <div>${wertstaende}${extra}</div>
      <h3 class="section-subtitle">${escapeHtml(t("vermoegen.dokumente.titel"))}</h3>
      ${dokumente}
    </section>`;
}

function nutzungLabel(nutzung) {
  return nutzung ? t(`vermoegen.immobilie.nutzungen.${nutzung}`) : "";
}

function anteileText(eigentumsanteile) {
  return (eigentumsanteile ?? []).map((a) => {
    const name = a.extern === true || !a.person_id ? t("vermoegen.externerAnteil") : (personenById.get(a.person_id)?.name || a.person_id);
    return `${escapeHtml(name)} ${escapeHtml(String(a.zaehler))}/${escapeHtml(String(a.nenner))}`;
  }).join(" · ");
}

export function renderImmobilienTab(today) {
  const liste = aktiveImmobilien();
  if (!liste.length) return `<section class="panel panel-pad"><p class="muted">${escapeHtml(t("vermoegen.immobilie.keine"))}</p></section>`;
  const auswahl = gewaehlt("immobilie", liste, "immobilie_id");

  // Die Karte waehlt nur aus: Name, Nutzung, Wert. Kennzahlen stehen darunter im Detail.
  const karten = liste.map((imm) => {
    const k = immobilienKennzahlen(data, imm.immobilie_id, today);
    return karte({
      klasse: "immobilie",
      id: imm.immobilie_id,
      aktiv: imm === auswahl,
      titel: imm.bezeichnung,
      chip: imm.nutzung ? `<span class="chip neutral">${escapeHtml(nutzungLabel(imm.nutzung))}</span>` : "",
      wertHtml: k.anteilig_cents === null ? `<span class="chip review">${escapeHtml(t("vermoegen.qualityFehlend"))}</span>` : escapeHtml(formatMoney(k.anteilig_cents)),
    });
  }).join("");

  return `
    <div class="objekt-karten">${karten}</div>
    ${renderImmobilieDetail(auswahl, today)}`;
}

function renderImmobilieDetail(imm, today) {
  const id = imm.immobilie_id;
  const k = immobilienKennzahlen(data, id, today);
  const ohneRate = state.immobilieOhneRate;
  const rateKategorien = darlehensKategorien(data, k.darlehen_ids);
  const m = immobilienMonate(data, id, today, { ohneKategorien: ohneRate ? rateKategorien : [], mitEigenanteil: !ohneRate });
  const mitBuchungen = immobilienMonate(data, id, today);

  const durchschnitt = m.anzahl_buchungen ? Math.round(m.summe.saldo / m.monate.length) : null;
  let viertesLabel = t("vermoegen.immobilie.monatssaldo");
  let viertesNotiz = "";
  if (imm.nutzung === "selbstgenutzt" && durchschnitt !== null) viertesLabel = t("vermoegen.immobilie.wohnkosten");
  if ((imm.nutzung === "vermietet" || imm.nutzung === "teilvermietet") && k.marktwert_cents) {
    viertesNotiz = `${escapeHtml(t("vermoegen.immobilie.mietrendite"))} ${escapeHtml(prozent(mitBuchungen.summe.einnahmen / k.marktwert_cents, 1))}`;
  }

  const marktwertNotiz = k.marktwert
    ? `${qualitaetChip({ qualitaet: k.marktwert.qualitaet })} ${escapeHtml(formatDate(k.marktwert.standdatum))}${k.anteilig_cents !== k.marktwert_cents ? ` · ${escapeHtml(t("vermoegen.immobilie.gesamt"))} ${escapeHtml(formatMoney(k.marktwert_cents))}` : ""}`
    : "";
  const kennzahlen = `
    <div class="kennzahl-raster">
      ${kennzahl(t("vermoegen.immobilie.marktwertAnteilig"), k.anteilig_cents === null ? `<span class="chip review">${escapeHtml(t("vermoegen.qualityFehlend"))}</span>` : geld(k.anteilig_cents), marktwertNotiz)}
      ${kennzahl(t("vermoegen.immobilie.restschuldZugeordnet"), k.darlehen_ids.length ? geld(-k.restschuld_cents, { negativ: true }) : `<span class="muted">${escapeHtml(t("vermoegen.immobilie.schuldenfrei"))}</span>`, k.darlehen_ids.length && !k.restschuld_vollstaendig ? escapeHtml(t("vermoegen.immobilie.restschuldUnvollstaendig")) : "")}
      ${kennzahl(t("vermoegen.immobilie.eigenkapital"), geld(k.eigenkapital_cents), k.restschuld_cents && k.beleihung !== null ? `${escapeHtml(t("vermoegen.immobilie.beleihung"))} ${escapeHtml(prozent(k.beleihung))}` : "")}
      ${kennzahl(viertesLabel, durchschnitt === null ? `<span class="muted">—</span>` : geld(durchschnitt, { negativ: true }), viertesNotiz)}
    </div>`;

  const formatMonat = (monat) => formatMonth(monat);
  const diagramm = monatsBalken({
    monate: m.monate, einnahmen: m.einnahmen, ausgaben: m.ausgaben, saldo: m.saldo,
    formatWert: (c) => formatMoney(c), formatAchse: achsenGeld, formatMonat: kurzMonat, formatTitel: formatMonat,
    labels: { einnahmen: t("vermoegen.immobilie.einnahmen"), ausgaben: t("vermoegen.immobilie.ausgaben"), saldo: t("vermoegen.immobilie.saldo") },
    achsenTitel: t("vermoegen.immobilie.achse"),
    ariaLabel: t("vermoegen.immobilie.monateTitel"),
  });
  // Spalten: Einnahmen und Ausgaben fassen alle Kategorien ausser Rate und Eigenanteil
  // zusammen; ein Klick klappt die Aufteilung nach Kategorie auf (Drill-down).
  const kategorien = m.kategorien;
  const rest = kategorien.filter((kat) => !kat.eigenanteil && !rateKategorien.has(kat.kategorie_id));
  const rate = kategorien.filter((kat) => !kat.eigenanteil && rateKategorien.has(kat.kategorie_id));
  const eigen = kategorien.find((kat) => kat.eigenanteil);
  const summiere = (liste, feld) => m.monate.map((_, i) => liste.reduce((a, kat) => a + kat[feld][i], 0));
  const zeitraum = { von: `${m.monate[0]}-01`, bis: `${m.monate.at(-1)}-31` };
  const mitTransfer = eigen ? { transfer: "all" } : {};
  const spalten = [
    { art: "ein", name: t("vermoegen.immobilie.einnahmen"), werte: summiere(rest, "ein"), drill: true },
    { art: "aus", name: t("vermoegen.immobilie.ausgaben"), werte: summiere(rest, "aus"), drill: true },
    ...(rate.length ? [{ art: "rate", name: categoryName(rate[0].kategorie_id), werte: summiere(rate, "werte"), filter: rate.length === 1 ? { kategorie: rate[0].kategorie_id } : {} }] : []),
    ...(eigen ? [{ art: "eigen", name: t("vermoegen.immobilie.eigenanteil"), titel: t("vermoegen.immobilie.eigenanteilHinweis"), werte: eigen.werte, filter: { kategorie: eigen.kategorie_id, transfer: "only" } }] : []),
  ];
  const summe = (werte) => werte.reduce((a, b) => a + b, 0);
  const kopf = spalten.map((sp) => `<th class="amount"${sp.titel ? ` title="${escapeHtml(sp.titel)}"` : ""}>${escapeHtml(sp.name)}</th>`).join("");
  const offen = state.immobilieDrill || "";
  const zelle = (sp, wert, schluessel, filter) => {
    if (!wert) return `<span class="muted">—</span>`;
    if (!sp.drill) return buchungenLink(geld(wert, { negativ: true }), { immobilie: id, ...filter, ...sp.filter });
    const auf = offen === `${schluessel}:${sp.art}`;
    return `<button class="linkish betrag-link drill-knopf" data-action="immobilie-drill" data-drill="${escapeHtml(`${schluessel}:${sp.art}`)}" aria-expanded="${auf}" title="${escapeHtml(t("vermoegen.immobilie.drillZeigen"))}">${geld(wert, { negativ: true })} <span aria-hidden="true">${auf ? "▾" : "▸"}</span></button>`;
  };
  // Aufteilung einer Einnahmen- bzw. Ausgabenzelle nach Kategorie, als Zeile darunter.
  const drillZeile = (schluessel, filter, index) => {
    const [offenSchluessel, art] = offen.split(":");
    if (offenSchluessel !== schluessel || !["ein", "aus"].includes(art)) return "";
    const posten = rest
      .map((kat) => ({ kat, wert: index === null ? summe(kat[art]) : kat[art][index] }))
      .filter((p) => p.wert)
      .sort((a, b) => Math.abs(b.wert) - Math.abs(a.wert));
    // Je Kategorie eine Unterzeile, der Betrag steht genau unter der aufgeklappten Summe.
    return posten.map((p) => `
    <tr class="drill-zeile">
      <td class="drill-name">${escapeHtml(p.kat.kategorie_id ? categoryName(p.kat.kategorie_id) : t("vermoegen.immobilie.ohneKategorie"))}</td>
      ${spalten.map((sp) => `<td class="amount">${sp.art === art ? `${buchungenLink(geld(p.wert, { negativ: true }), { immobilie: id, ...filter, kategorie: p.kat.kategorie_id })}<span class="drill-platz" aria-hidden="true"> ▸</span>` : ""}</td>`).join("")}
      <td></td>
    </tr>`).join("");
  };
  const zeilen = m.monate.map((monat, i) => `
    <tr>
      <td>${buchungenLink(escapeHtml(formatMonat(monat)), { immobilie: id, monat, ...mitTransfer })}</td>
      ${spalten.map((sp) => `<td class="amount">${zelle(sp, sp.werte[i], monat, { monat })}</td>`).join("")}
      <td class="amount"><strong>${buchungenLink(geld(m.saldo[i], { negativ: true }), { immobilie: id, monat, ...mitTransfer })}</strong></td>
    </tr>${drillZeile(monat, { monat }, i)}`).join("");
  const summenZeile = `
    <tr class="table-sum">
      <td>${buchungenLink(escapeHtml(t("vermoegen.immobilie.summe12")), { immobilie: id, ...zeitraum, ...mitTransfer })}</td>
      ${spalten.map((sp) => `<td class="amount">${zelle(sp, summe(sp.werte), "summe", zeitraum)}</td>`).join("")}
      <td class="amount"><strong>${buchungenLink(geld(m.summe.saldo, { negativ: true }), { immobilie: id, ...zeitraum, ...mitTransfer })}</strong></td>
    </tr>${drillZeile("summe", zeitraum, null)}`;
  const umschalter = rateKategorien.size
    ? `<div class="segment" role="group" aria-label="${escapeHtml(t("vermoegen.immobilie.monateTitel"))}">
        <button class="${ohneRate ? "" : "active"}" data-action="immobilie-rate" data-rate="mit" aria-pressed="${!ohneRate}">${escapeHtml(t("vermoegen.immobilie.mitRate"))}</button>
        <button class="${ohneRate ? "active" : ""}" data-action="immobilie-rate" data-rate="ohne" aria-pressed="${ohneRate}">${escapeHtml(t("vermoegen.immobilie.ohneRate"))}</button>
      </div>`
    : "";
  const monatsPanel = `
    <section class="panel panel-pad">
      <div class="panel-kopf">
        <h2 class="section-title">${escapeHtml(t("vermoegen.immobilie.monateTitel"))}</h2>
        ${umschalter}
      </div>
      ${m.anzahl_buchungen ? `
        <p class="muted diagramm-lead">${escapeHtml(t("vermoegen.immobilie.monateLead"))}</p>
        <div class="diagramm-wrap">${diagramm}</div>
        <div class="diagramm-legende-html"><span class="swatch einnahme"></span>${escapeHtml(t("vermoegen.immobilie.einnahmen"))}<span class="swatch ausgabe"></span>${escapeHtml(t("vermoegen.immobilie.ausgaben"))}<span class="swatch saldo"></span>${escapeHtml(t("vermoegen.immobilie.saldo"))}</div>
        <div class="table-wrap">
          <table class="monats-tabelle">
            <thead><tr><th>${escapeHtml(t("vermoegen.immobilie.monat"))}</th>${kopf}<th class="amount">${escapeHtml(t("vermoegen.immobilie.saldo"))}</th></tr></thead>
            <tbody>${zeilen}${summenZeile}</tbody>
          </table>
        </div>
        <p class="muted">${escapeHtml(t("vermoegen.immobilie.tabelleHinweis"))}</p>
        ${ohneRate ? `<p class="muted">${escapeHtml(t("vermoegen.immobilie.rateHinweis"))}</p>` : ""}
        ${eigen ? `<p class="muted">${escapeHtml(t("vermoegen.immobilie.eigenanteilHinweis"))}</p>` : ""}`
        : `<p class="muted">${escapeHtml(t("vermoegen.immobilie.keineBuchungen"))}</p>`}
    </section>`;

  const darlehenLinks = k.darlehen_ids.map((did) => {
    const d = data.darlehen.find((x) => x.darlehen_id === did);
    return `<button class="linkish" data-action="select-vermoegen-objekt" data-vermoegen="${escapeHtml(`darlehen:${did}`)}">${escapeHtml(d?.bezeichnung || did)}</button>`;
  });
  const stammdaten = `
    <section class="panel panel-pad">
      <h2 class="section-title">${escapeHtml(t("vermoegen.immobilie.stammdaten"))}</h2>
      <div class="stammdaten-raster">
        ${imm.adresse ? detailRow(t("vermoegen.adresse"), escapeHtml(imm.adresse)) : ""}
        ${imm.nutzung ? detailRow(t("vermoegen.immobilie.nutzung"), escapeHtml(nutzungLabel(imm.nutzung))) : ""}
        ${imm.wohnflaeche ? detailRow(t("vermoegen.immobilie.wohnflaeche"), `${escapeHtml(new Intl.NumberFormat("de-DE").format(Number(imm.wohnflaeche)))} m²`) : ""}
        ${imm.eigentumsanteile?.length ? detailRow(t("vermoegen.eigentumsanteile"), anteileText(imm.eigentumsanteile)) : ""}
        ${imm.anschaffungsdatum || imm.anschaffungskosten ? detailRow(t("vermoegen.immobilie.angeschafft"), [imm.anschaffungsdatum ? escapeHtml(formatDate(imm.anschaffungsdatum)) : "", imm.anschaffungskosten ? escapeHtml(formatMoney(cents(imm.anschaffungskosten))) : ""].filter(Boolean).join(" · ")) : ""}
        ${k.wertaenderung_cents !== null ? detailRow(t("vermoegen.immobilie.wertaenderung"), geld(k.wertaenderung_cents, { negativ: true })) : ""}
        ${darlehenLinks.length ? detailRow(t("vermoegen.immobilie.darlehen"), darlehenLinks.join("<br>")) : ""}
      </div>
    </section>`;

  const anhang = anhangPanel(t("vermoegen.immobilie.wertstaendeDokumente"), {
    bemerkung: bemerkungHtml(imm.bemerkung),
    wertstaende: renderPositionWertstaende({ klasse: "immobilie", id }),
    dokumente: `${dokumenteBrowserHtml([id, ...k.darlehen_ids])}
      <p><button class="linkish" data-action="immobilie-transactions" data-immobilie="${escapeHtml(id)}">${escapeHtml(t("vermoegen.dokumente.alleBuchungen"))}</button></p>`,
  });

  return `
    ${detailTitel(imm.bezeichnung)}
    ${kennzahlen}
    <div class="objekt-detail">
      ${stammdaten}
      ${monatsPanel}
      ${anhang}
    </div>`;
}

// ------------------------------------------------------------- Darlehen

export function renderDarlehenTab(today) {
  const liste = aktiveDarlehen();
  if (!liste.length) return `<section class="panel panel-pad"><p class="muted">${escapeHtml(t("vermoegen.darlehen.keine"))}</p></section>`;
  const kennzahlenJe = new Map(liste.map((d) => [d.darlehen_id, darlehenKennzahlen(d, data.zeitwerte, today)]));
  const auswahl = gewaehlt("darlehen", liste, "darlehen_id");

  let rest = 0;
  let anfang = 0;
  let getilgt = 0;
  let rate = 0;
  for (const d of liste) {
    const k = kennzahlenJe.get(d.darlehen_id);
    rate += rateJeMonatCents(d);
    if (!k) continue;
    rest += k.rest_heute_cents;
    if (k.anfangsbetrag_cents !== null) {
      anfang += k.anfangsbetrag_cents;
      getilgt += k.getilgt_cents;
    }
  }
  const naechste = liste
    .filter((d) => d.zinsbindung_bis && d.zinsbindung_bis > today)
    .sort((a, b) => a.zinsbindung_bis.localeCompare(b.zinsbindung_bis))[0];
  const kopf = `
    <div class="kennzahl-raster">
      ${kennzahl(t("vermoegen.darlehen.restschuldGesamt"), geld(-rest, { negativ: true }), escapeHtml(tf("vermoegen.darlehen.anzahl", { n: liste.length })))}
      ${kennzahl(t("vermoegen.darlehen.rateGesamt"), geld(rate), escapeHtml(t("vermoegen.darlehen.jeMonat")))}
      ${kennzahl(t("vermoegen.darlehen.getilgtSeitAufnahme"), anfang ? geld(getilgt) : `<span class="muted">—</span>`, anfang ? escapeHtml(tf("vermoegen.darlehen.vonAnfangsbetrag", { anteil: prozent(getilgt / anfang) })) : "")}
      ${kennzahl(t("vermoegen.darlehen.naechsteZinsbindung"), naechste ? escapeHtml(formatDate(naechste.zinsbindung_bis)) : `<span class="muted">—</span>`, naechste ? `${escapeHtml(laufzeitText(today, naechste.zinsbindung_bis))} · ${escapeHtml(naechste.bezeichnung)}` : "")}
    </div>`;

  const karten = liste.map((d) => {
    const k = kennzahlenJe.get(d.darlehen_id);
    const anteil = k && k.anfangsbetrag_cents ? k.getilgt_cents / k.anfangsbetrag_cents : null;
    const bald = d.zinsbindung_bis && d.zinsbindung_bis > today && d.zinsbindung_bis <= addJahre(today, 3);
    const zeilen = [
      `${anteil === null ? "" : `${escapeHtml(prozent(anteil))} ${escapeHtml(t("vermoegen.darlehen.getilgt"))} · `}${escapeHtml(formatMoney(cents(d.sollrate)))} / ${escapeHtml(rhythmusLabel(d.rhythmus_einheit, d.rhythmus_intervall))} · ${escapeHtml(d.zinssatz)} %`,
    ];
    if (d.zinsbindung_bis) zeilen.push(`${escapeHtml(t("vermoegen.zinsbindungBis"))} ${escapeHtml(formatDate(d.zinsbindung_bis))}${bald ? ` <span class="chip review">${escapeHtml(t("vermoegen.darlehen.bald"))}</span>` : ""}`);
    return karte({
      klasse: "darlehen",
      id: d.darlehen_id,
      aktiv: d === auswahl,
      titel: d.bezeichnung,
      wertHtml: k ? geld(-k.rest_heute_cents, { negativ: true }) : `<span class="chip review">${escapeHtml(t("vermoegen.qualityFehlend"))}</span>`,
      fortschritt: anteil,
      zeilen,
    });
  }).join("");

  return `
    ${kopf}
    <div class="objekt-karten">${karten}</div>
    ${renderDarlehenDetail(auswahl, kennzahlenJe.get(auswahl.darlehen_id), today)}`;
}

function addJahre(iso, jahre) {
  return `${Number(iso.slice(0, 4)) + jahre}${iso.slice(4)}`;
}

function renderDarlehenDetail(d, k, today) {
  const id = d.darlehen_id;
  const verlauf = k ? restschuldVerlauf({
    punkte: [
      ...(d.anfangsdatum && d.anfangsbetrag && d.anfangsdatum < k.anker.standdatum ? [{ datum: d.anfangsdatum, wert_cents: cents(d.anfangsbetrag) }] : []),
      { datum: k.anker.standdatum, wert_cents: cents(k.anker.wert) },
      ...k.raten.map((r) => ({ datum: r.datum, wert_cents: r.rest_cents, tilgung_cents: r.tilgung_cents, zins_cents: r.zins_cents })),
    ],
    heute: today,
    zinsbindungBis: d.zinsbindung_bis ?? null,
    belegte: (data.zeitwerte ?? []).filter((zw) => zw.entitaet === "darlehen" && zw.entitaet_id === id && zw.feld === "restschuld").map((zw) => ({ datum: zw.standdatum, wert_cents: cents(zw.wert) })),
    formatWert: (c) => formatMoney(c),
    formatAchse: achsenGeld,
    formatDatum: formatDate,
    labels: {
      heute: t("vermoegen.darlehen.heute"), zinsbindung: t("vermoegen.darlehen.zinsbindung"),
      restschuld: t("vermoegen.restschuld"), restschuldPlan: t("vermoegen.darlehen.restschuldPlan"),
      tilgung: t("vermoegen.darlehen.tilgung"), zins: t("vermoegen.darlehen.zins"), beleg: t("vermoegen.darlehen.belegterStand"),
    },
    achsenTitel: t("vermoegen.darlehen.achseRestschuld"),
    ariaLabel: t("vermoegen.restschuldVerlauf"),
  }) : "";
  const jahre = k ? jahresBalken({
    jahre: k.jahre, formatWert: (c) => formatMoney(c), formatAchse: achsenGeld,
    labels: { tilgung: t("vermoegen.darlehen.tilgung"), zins: t("vermoegen.darlehen.zins"), summe: t("vermoegen.darlehen.summe"), plan: t("vermoegen.darlehen.planKurz") },
    achsenTitel: t("vermoegen.darlehen.achseJahr"),
    ariaLabel: t("vermoegen.darlehen.zinsTilgung"),
  }) : "";

  const diagramme = `
    <section class="panel panel-pad">
      <div class="panel-kopf">
        <h2 class="section-title">${escapeHtml(t("vermoegen.restschuldVerlauf"))}</h2>
        <span class="muted">${escapeHtml(t("vermoegen.darlehen.verlaufHinweis"))}</span>
      </div>
      ${k ? `<p class="muted diagramm-lead">${escapeHtml(t("vermoegen.darlehen.verlaufLead"))}</p><div class="diagramm-wrap">${verlauf}</div>` : `<p class="muted">${escapeHtml(t("vermoegen.darlehen.keinAnker"))}</p>`}
      ${jahre ? `
        <h3 class="section-subtitle">${escapeHtml(t("vermoegen.darlehen.zinsTilgung"))}</h3>
        <p class="muted diagramm-lead">${escapeHtml(t("vermoegen.darlehen.zinsTilgungLead"))}</p>
        <div class="diagramm-wrap">${jahre}</div>
        <div class="diagramm-legende-html"><span class="swatch tilgung"></span>${escapeHtml(t("vermoegen.darlehen.tilgung"))}<span class="swatch zins"></span>${escapeHtml(t("vermoegen.darlehen.zins"))}<span class="swatch plan"></span>${escapeHtml(t("vermoegen.darlehen.plan"))}</div>` : ""}
    </section>`;

  const verknuepft = [];
  if (d.immobilie_id) {
    const imm = data.immobilien?.find((i) => i.immobilie_id === d.immobilie_id);
    verknuepft.push(`<button class="linkish" data-action="select-vermoegen-objekt" data-vermoegen="${escapeHtml(`immobilie:${d.immobilie_id}`)}">${escapeHtml(imm?.bezeichnung || d.immobilie_id)}</button>`);
  }
  if (d.konto_id) verknuepft.push(escapeHtml(kontenById.get(d.konto_id)?.name || d.konto_id));
  const regelzahlung = (data.regelzahlungen ?? []).find((rz) => rz.darlehen_id === id);
  if (regelzahlung) verknuepft.push(`<a class="linkish" href="#/regelzahlungen/${encodeURIComponent(regelzahlung.regelzahlung_id)}">${escapeHtml(regelzahlung.bezeichnung || regelzahlung.regelzahlung_id)}</a>`);

  const kennzahlenPanel = `
    <section class="panel panel-pad">
      <h2 class="section-title">${escapeHtml(t("vermoegen.darlehen.kennzahlen"))}</h2>
      ${k ? `<div class="detail-zweispaltig">
        ${detailRow(t("vermoegen.darlehen.restHeute"), `<strong>${geld(-k.rest_heute_cents, { negativ: true })}</strong>`)}
        ${k.getilgt_cents !== null ? detailRow(t("vermoegen.darlehen.getilgt"), `${escapeHtml(formatMoney(k.getilgt_cents))} ${escapeHtml(tf("vermoegen.darlehen.von", { betrag: formatMoney(k.anfangsbetrag_cents) }))}`) : ""}
        ${k.rest_zinsbindung_cents !== null ? detailRow(t("vermoegen.darlehen.restZinsbindung"), `<strong>${escapeHtml(formatMoney(k.rest_zinsbindung_cents))}</strong> · ${escapeHtml(formatDate(d.zinsbindung_bis))}`) : ""}
        ${k.naechste_rate ? detailRow(t("vermoegen.darlehen.naechsteRate"), `${escapeHtml(formatDate(k.naechste_rate.datum))} · ${escapeHtml(t("vermoegen.darlehen.tilgung"))} ${escapeHtml(formatMoney(k.naechste_rate.tilgung_cents))}, ${escapeHtml(t("vermoegen.darlehen.zins"))} ${escapeHtml(formatMoney(k.naechste_rate.zins_cents))}`) : ""}
        ${k.abbezahlt_am ? detailRow(t("vermoegen.darlehen.abbezahlt"), escapeHtml(formatDate(k.abbezahlt_am))) : k.rest_ende_cents > 0 && d.laufzeit_bis ? detailRow(t("vermoegen.restschuldLaufzeitende"), escapeHtml(formatMoney(k.rest_ende_cents))) : ""}</div>`
        : `<p class="muted">${escapeHtml(t("vermoegen.darlehen.keinAnker"))}</p>`}
    </section>`;

  const stammdatenPanel = `
    <section class="panel panel-pad">
      <h2 class="section-title">${escapeHtml(t("vermoegen.immobilie.stammdaten"))}</h2>
      <div class="detail-zweispaltig">
      ${d.anfangsdatum ? detailRow(t("vermoegen.aufgenommenAm"), escapeHtml(formatDate(d.anfangsdatum))) : ""}
      ${d.anfangsbetrag ? detailRow(t("vermoegen.anfangsbetrag"), escapeHtml(formatMoney(cents(d.anfangsbetrag)))) : ""}
      ${d.zinssatz ? detailRow(t("vermoegen.zinssatz"), `${escapeHtml(d.zinssatz)} %`) : ""}
      ${d.sollrate ? detailRow(t("vermoegen.rate"), `${escapeHtml(formatMoney(cents(d.sollrate)))} / ${escapeHtml(rhythmusLabel(d.rhythmus_einheit, d.rhythmus_intervall))}`) : ""}
      ${d.zinsbindung_bis ? detailRow(t("vermoegen.zinsbindungBis"), escapeHtml(formatDate(d.zinsbindung_bis))) : ""}
      ${d.laufzeit_bis ? detailRow(t("vermoegen.laufzeit"), `${escapeHtml(laufzeitText(d.anfangsdatum, d.laufzeit_bis))}<br><span class="muted">${escapeHtml(t("vermoegen.bis"))} ${escapeHtml(formatDate(d.laufzeit_bis))}</span>`) : ""}
      ${verknuepft.length ? detailRow(t("vermoegen.verknuepft"), verknuepft.join("<br>")) : ""}
      </div>
    </section>`;

  const anhang = anhangPanel(t("vermoegen.darlehen.weiteres"), {
    bemerkung: bemerkungHtml(d.bemerkung),
    wertstaende: renderPositionWertstaende({ klasse: "darlehen", id }),
    extra: sondertilgungenRow(id),
    dokumente: dokumenteBrowserHtml([id]),
  });

  return `
    ${detailTitel(d.bezeichnung)}
    <div class="objekt-detail">
      ${kennzahlenPanel}
      ${diagramme}
      ${stammdatenPanel}
      ${anhang}
    </div>`;
}

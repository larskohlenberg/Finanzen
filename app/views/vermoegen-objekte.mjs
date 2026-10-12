// app/views/vermoegen-objekte.mjs
// Tabs Immobilien und Darlehen der Vermoegensseite: oben eine Karte je Objekt,
// darunter das gewaehlte Objekt mit Kennzahlen, Diagrammen, Stammdaten und
// Dokumenten. Rechnen in vermoegen-details.mjs, hier nur Darstellung.
import { data, state, t, escapeHtml, cents, personenById, kontenById } from "../runtime.mjs";
import { formatMoney, formatDate, formatMonth, detailRow, categoryName } from "../komponenten.mjs";
import { monatsBalken, jahresBalken, restschuldVerlauf } from "../charts.mjs";
import { darlehenKennzahlen, darlehensKategorien, immobilienKennzahlen, immobilienMonate } from "../vermoegen-details.mjs";
import {
  dokumenteHtml, geld, kennzahl, laufzeitText, prozent, qualitaetChip, rateJeMonatCents,
  renderPositionWertstaende, rhythmusLabel, sondertilgungenRow, tf,
} from "./vermoegen-teile.mjs";

const aktiveImmobilien = () => (data.immobilien ?? []).filter((i) => i.status !== "verkauft");
const aktiveDarlehen = () => (data.darlehen ?? []).filter((d) => d.status !== "abgeloest");

// Gewaehltes Objekt der Klasse; ohne (gueltige) Auswahl das erste.
function gewaehlt(klasse, liste, idFeld) {
  const [k, id] = String(state.selectedVermoegenId ?? "").split(":");
  return (k === klasse && liste.find((e) => e[idFeld] === id)) || liste[0] || null;
}

function karte({ klasse, id, aktiv, titel, chip = "", wertHtml, zeilen = [], fortschritt = null }) {
  return `
    <button class="objekt-karte ${aktiv ? "active" : ""}" data-action="select-vermoegen-objekt" data-vermoegen="${escapeHtml(`${klasse}:${id}`)}" aria-pressed="${aktiv}">
      <span class="objekt-karte-kopf"><strong>${escapeHtml(titel)}</strong>${chip}</span>
      <span class="objekt-karte-wert">${wertHtml}</span>
      ${fortschritt === null ? "" : `<span class="fortschritt" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, fortschritt * 100)).toFixed(1)}%"></span></span>`}
      ${zeilen.map((z) => `<span class="objekt-karte-zeile">${z}</span>`).join("")}
    </button>`;
}

// ------------------------------------------------------------- Immobilien

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

  const karten = liste.map((imm) => {
    const k = immobilienKennzahlen(data, imm.immobilie_id, today);
    const m = immobilienMonate(data, imm.immobilie_id, today);
    const zeilen = [];
    if (k.eigenkapital_cents !== null) {
      zeilen.push(`${escapeHtml(t("vermoegen.immobilie.eigenkapital"))} ${escapeHtml(formatMoney(k.eigenkapital_cents))}${k.restschuld_cents ? ` · ${escapeHtml(t("vermoegen.immobilie.beleihung"))} ${escapeHtml(prozent(k.beleihung))}` : ` · ${escapeHtml(t("vermoegen.immobilie.schuldenfrei"))}`}`);
    }
    if (m.anzahl_buchungen) zeilen.push(`${escapeHtml(t("vermoegen.immobilie.saldo12"))} ${geld(m.summe.saldo, { negativ: true })}`);
    return karte({
      klasse: "immobilie",
      id: imm.immobilie_id,
      aktiv: imm === auswahl,
      titel: imm.bezeichnung,
      chip: imm.nutzung ? `<span class="chip neutral">${escapeHtml(nutzungLabel(imm.nutzung))}</span>` : "",
      wertHtml: k.anteilig_cents === null ? `<span class="chip review">${escapeHtml(t("vermoegen.qualityFehlend"))}</span>` : escapeHtml(formatMoney(k.anteilig_cents)),
      zeilen,
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
  const m = immobilienMonate(data, id, today, { ohneKategorien: ohneRate ? rateKategorien : [] });
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
    formatWert: (c) => formatMoney(c), formatMonat,
    ariaLabel: t("vermoegen.immobilie.monateTitel"),
  });
  const kategorien = m.kategorien;
  const kopf = kategorien.map((kat) => `<th class="amount">${escapeHtml(kat.kategorie_id ? categoryName(kat.kategorie_id) : t("vermoegen.immobilie.ohneKategorie"))}</th>`).join("");
  const zeilen = m.monate.map((monat, i) => `
    <tr>
      <td>${escapeHtml(formatMonat(monat))}</td>
      ${kategorien.map((kat) => `<td class="amount">${kat.werte[i] ? geld(kat.werte[i], { negativ: true }) : `<span class="muted">—</span>`}</td>`).join("")}
      <td class="amount"><strong>${geld(m.saldo[i], { negativ: true })}</strong></td>
    </tr>`).join("");
  const summenZeile = `
    <tr class="table-sum">
      <td>${escapeHtml(t("vermoegen.immobilie.summe12"))}</td>
      ${kategorien.map((kat) => `<td class="amount">${geld(kat.summe_cents, { negativ: true })}</td>`).join("")}
      <td class="amount"><strong>${geld(m.summe.saldo, { negativ: true })}</strong></td>
    </tr>`;
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
        <div class="diagramm-wrap">${diagramm}</div>
        <div class="diagramm-legende-html"><span class="swatch einnahme"></span>${escapeHtml(t("vermoegen.immobilie.einnahmen"))}<span class="swatch ausgabe"></span>${escapeHtml(t("vermoegen.immobilie.ausgaben"))}<span class="swatch saldo"></span>${escapeHtml(t("vermoegen.immobilie.saldo"))}</div>
        <div class="table-wrap">
          <table class="monats-tabelle">
            <thead><tr><th>${escapeHtml(t("vermoegen.immobilie.monat"))}</th>${kopf}<th class="amount">${escapeHtml(t("vermoegen.immobilie.saldo"))}</th></tr></thead>
            <tbody>${zeilen}${summenZeile}</tbody>
          </table>
        </div>
        ${ohneRate ? `<p class="muted">${escapeHtml(t("vermoegen.immobilie.rateHinweis"))}</p>` : ""}`
        : `<p class="muted">${escapeHtml(t("vermoegen.immobilie.keineBuchungen"))}</p>`}
    </section>`;

  const darlehenLinks = k.darlehen_ids.map((did) => {
    const d = data.darlehen.find((x) => x.darlehen_id === did);
    return `<button class="linkish" data-action="select-vermoegen-objekt" data-vermoegen="${escapeHtml(`darlehen:${did}`)}">${escapeHtml(d?.bezeichnung || did)}</button>`;
  });
  const stammdaten = `
    <section class="panel panel-pad detail-panel-flach">
      <h2 class="section-title">${escapeHtml(t("vermoegen.immobilie.stammdaten"))}</h2>
      ${imm.adresse ? detailRow(t("vermoegen.adresse"), escapeHtml(imm.adresse)) : ""}
      ${imm.nutzung ? detailRow(t("vermoegen.immobilie.nutzung"), escapeHtml(nutzungLabel(imm.nutzung))) : ""}
      ${imm.wohnflaeche ? detailRow(t("vermoegen.immobilie.wohnflaeche"), `${escapeHtml(new Intl.NumberFormat("de-DE").format(Number(imm.wohnflaeche)))} m²`) : ""}
      ${imm.eigentumsanteile?.length ? detailRow(t("vermoegen.eigentumsanteile"), anteileText(imm.eigentumsanteile)) : ""}
      ${imm.anschaffungsdatum || imm.anschaffungskosten ? detailRow(t("vermoegen.immobilie.angeschafft"), [imm.anschaffungsdatum ? escapeHtml(formatDate(imm.anschaffungsdatum)) : "", imm.anschaffungskosten ? escapeHtml(formatMoney(cents(imm.anschaffungskosten))) : ""].filter(Boolean).join(" · ")) : ""}
      ${k.wertaenderung_cents !== null ? detailRow(t("vermoegen.immobilie.wertaenderung"), geld(k.wertaenderung_cents, { negativ: true })) : ""}
      ${darlehenLinks.length ? detailRow(t("vermoegen.immobilie.darlehen"), darlehenLinks.join("<br>")) : ""}
      ${imm.bemerkung ? detailRow(t("vermoegen.immobilie.bemerkung"), escapeHtml(imm.bemerkung)) : ""}
      ${renderPositionWertstaende({ klasse: "immobilie", id })}
      <h3 class="section-subtitle">${escapeHtml(t("vermoegen.dokumente.titel"))}</h3>
      ${dokumenteHtml([id, ...k.darlehen_ids])}
      <p><button class="linkish" data-action="immobilie-transactions" data-immobilie="${escapeHtml(id)}">${escapeHtml(t("vermoegen.dokumente.alleBuchungen"))}</button></p>
    </section>`;

  return `
    ${kennzahlen}
    <div class="objekt-detail">
      ${monatsPanel}
      ${stammdaten}
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
      ...k.raten.map((r) => ({ datum: r.datum, wert_cents: r.rest_cents })),
    ],
    heute: today,
    zinsbindungBis: d.zinsbindung_bis ?? null,
    belegte: (data.zeitwerte ?? []).filter((zw) => zw.entitaet === "darlehen" && zw.entitaet_id === id && zw.feld === "restschuld").map((zw) => ({ datum: zw.standdatum, wert_cents: cents(zw.wert) })),
    formatWert: (c) => formatMoney(c),
    labels: { heute: t("vermoegen.darlehen.heute"), zinsbindung: t("vermoegen.darlehen.zinsbindung") },
    ariaLabel: t("vermoegen.restschuldVerlauf"),
  }) : "";
  const jahre = k ? jahresBalken({ jahre: k.jahre, formatWert: (c) => formatMoney(c), ariaLabel: t("vermoegen.darlehen.zinsTilgung") }) : "";

  const diagramme = `
    <section class="panel panel-pad">
      <div class="panel-kopf">
        <h2 class="section-title">${escapeHtml(t("vermoegen.restschuldVerlauf"))}</h2>
        <span class="muted">${escapeHtml(t("vermoegen.darlehen.verlaufHinweis"))}</span>
      </div>
      ${k ? `<div class="diagramm-wrap">${verlauf}</div>` : `<p class="muted">${escapeHtml(t("vermoegen.darlehen.keinAnker"))}</p>`}
      ${jahre ? `
        <h3 class="section-subtitle">${escapeHtml(t("vermoegen.darlehen.zinsTilgung"))}</h3>
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

  const seite = `
    <section class="panel panel-pad detail-panel-flach">
      <h2 class="section-title">${escapeHtml(t("vermoegen.darlehen.kennzahlen"))}</h2>
      ${k ? `
        ${detailRow(t("vermoegen.darlehen.restHeute"), `<strong>${geld(-k.rest_heute_cents, { negativ: true })}</strong>`)}
        ${detailRow(t("vermoegen.anker"), `${escapeHtml(formatMoney(cents(k.anker.wert)))} · ${escapeHtml(formatDate(k.anker.standdatum))} ${qualitaetChip({ qualitaet: k.anker.qualitaet })}`)}
        ${k.getilgt_cents !== null ? detailRow(t("vermoegen.darlehen.getilgt"), `${escapeHtml(formatMoney(k.getilgt_cents))} ${escapeHtml(tf("vermoegen.darlehen.von", { betrag: formatMoney(k.anfangsbetrag_cents) }))}`) : ""}
        ${detailRow(t("vermoegen.darlehen.zinsenSeitAnker"), escapeHtml(formatMoney(k.zinsen_seit_anker_cents)))}
        ${k.rest_zinsbindung_cents !== null ? detailRow(t("vermoegen.darlehen.restZinsbindung"), `<strong>${escapeHtml(formatMoney(k.rest_zinsbindung_cents))}</strong> · ${escapeHtml(formatDate(d.zinsbindung_bis))}`) : ""}
        ${k.naechste_rate ? detailRow(t("vermoegen.darlehen.naechsteRate"), `${escapeHtml(formatDate(k.naechste_rate.datum))} · ${escapeHtml(t("vermoegen.darlehen.tilgung"))} ${escapeHtml(formatMoney(k.naechste_rate.tilgung_cents))}, ${escapeHtml(t("vermoegen.darlehen.zins"))} ${escapeHtml(formatMoney(k.naechste_rate.zins_cents))}`) : ""}
        ${k.abbezahlt_am ? detailRow(t("vermoegen.darlehen.abbezahlt"), escapeHtml(formatDate(k.abbezahlt_am))) : k.rest_ende_cents > 0 && d.laufzeit_bis ? detailRow(t("vermoegen.restschuldLaufzeitende"), escapeHtml(formatMoney(k.rest_ende_cents))) : ""}`
        : `<p class="muted">${escapeHtml(t("vermoegen.darlehen.keinAnker"))}</p>`}
      <h3 class="section-subtitle">${escapeHtml(t("vermoegen.immobilie.stammdaten"))}</h3>
      ${d.anfangsdatum ? detailRow(t("vermoegen.aufgenommenAm"), escapeHtml(formatDate(d.anfangsdatum))) : ""}
      ${d.anfangsbetrag ? detailRow(t("vermoegen.anfangsbetrag"), escapeHtml(formatMoney(cents(d.anfangsbetrag)))) : ""}
      ${d.zinssatz ? detailRow(t("vermoegen.zinssatz"), `${escapeHtml(d.zinssatz)} %`) : ""}
      ${d.sollrate ? detailRow(t("vermoegen.rate"), `${escapeHtml(formatMoney(cents(d.sollrate)))} / ${escapeHtml(rhythmusLabel(d.rhythmus_einheit, d.rhythmus_intervall))}`) : ""}
      ${d.zinsbindung_bis ? detailRow(t("vermoegen.zinsbindungBis"), escapeHtml(formatDate(d.zinsbindung_bis))) : ""}
      ${d.laufzeit_bis ? detailRow(t("vermoegen.laufzeit"), `${escapeHtml(laufzeitText(d.anfangsdatum, d.laufzeit_bis))}<br><span class="muted">${escapeHtml(t("vermoegen.bis"))} ${escapeHtml(formatDate(d.laufzeit_bis))}</span>`) : ""}
      ${verknuepft.length ? detailRow(t("vermoegen.verknuepft"), verknuepft.join("<br>")) : ""}
      ${d.bemerkung ? detailRow(t("vermoegen.immobilie.bemerkung"), escapeHtml(d.bemerkung)) : ""}
      ${sondertilgungenRow(id)}
      ${renderPositionWertstaende({ klasse: "darlehen", id })}
      <h3 class="section-subtitle">${escapeHtml(t("vermoegen.dokumente.titel"))}</h3>
      ${dokumenteHtml([id])}
    </section>`;

  return `
    <div class="objekt-detail">
      ${diagramme}
      ${seite}
    </div>`;
}

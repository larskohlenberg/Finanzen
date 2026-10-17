// app/views/uebersicht.mjs
// Übersicht als Dashboard: je Bereich (Liquidität, Vermögen, Vorsorge) eine Kachel
// mit Kennzahl und Zeilen, die ins Detail führen; Vermögen breit mit zwei
// Unterkacheln (schnell verfügbar, langfristig gebunden). Darunter die
// Termine der nächsten zwölf Monate (Fristen und jährliche Zahlungen) und die
// Absicherung bei Berufsunfähigkeit und im Todesfall als zwei Kacheln. Konten- und Depottabellen stehen nur noch
// unter Vermögen, die nächste Aktion im Arbeitsstatus oben.
import { data, state, t, escapeHtml } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { formatDate, formatMoney, renderPageHead, heuteIso } from "../komponenten.mjs";
import { currentNettovermoegen, overviewAccountGroups, overviewJahreszahlungen } from "../selektoren.mjs";
import { addInterval, toCents } from "../liquiditaet.mjs";
import { anstehendeFristen } from "../fristen.mjs";
import { renderAbsicherungKacheln } from "./absicherung.mjs";
import { bezugLink, fristChip, fristKlasse } from "./fristen.mjs";
import { terminLeiste } from "../charts.mjs";
import { erwarteteLeistungen, gesetzlicherRentenbeginn, rentenStufen, vertragsFarben } from "../vorsorge-rechnung.mjs";
import { balkenSvg, tf } from "./vermoegen-teile.mjs";

const HORIZONT_MONATE = 12;

const geldOhneCent = (c) => new Intl.NumberFormat(state.lang === "en" ? "en-GB" : "de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(c / 100);
const standText = (datum) => (datum ? `${t("labels.stand")} ${formatDate(datum)}` : t("labels.noStand"));
const farbPunkt = (klasse) => `<i class="farbpunkt ${klasse}" aria-hidden="true"></i>`;

// Eine Zeile unter der Kennzahl: Link ins Detail, optional Zusatz und Betrag.
function zeile(linkHtml, betrag, { zusatz = "", punkt = "" } = {}) {
  return `<li>${punkt ? farbPunkt(punkt) : ""}${linkHtml}${zusatz ? `<span class="muted">${escapeHtml(zusatz)}</span>` : ""}<span class="amount">${betrag}</span></li>`;
}

const link = (ziel, text) => `<button class="linkish" ${ziel}>${escapeHtml(text)}</button>`;
const ZIEL = {
  liquiditaet: `data-view="liquiditaet"`,
  vermoegen: `data-view="vermoegen"`,
  vorsorge: `data-view="vorsorge"`,
  termine: `data-view="termine"`,
  termineTab: (tab) => `data-action="termine-tab" data-tab="${escapeHtml(tab)}"`,
  vermoegenTab: (tab) => `data-action="vermoegen-tab" data-tab="${escapeHtml(tab)}"`,
  vorsorgeTab: (tab) => `data-action="vorsorge-tab" data-tab="${escapeHtml(tab)}"`,
};

// Bereichskachel: Kopf mit Titel als Link, Kennzahl, Notiz, Grafik, Zeilen.
function bereichsKachel({ id, icon, titel, ziel, wert, notiz = "", grafik = "", zeilen = [], zusatz = "" }) {
  return `
    <section class="panel panel-pad uebersicht-kachel" aria-labelledby="kachel-${id}">
      <h2 class="uebersicht-kachel-kopf" id="kachel-${id}">
        <button class="linkish" ${ziel}>${iconSvg(icon)}<span>${escapeHtml(titel)}</span>${iconSvg("chevronRight")}</button>
      </h2>
      <div class="kpi-value">${wert}</div>
      ${notiz ? `<div class="kpi-note">${notiz}</div>` : ""}
      ${grafik}
      ${zeilen.length ? `<ul class="vorsorge-kopf-liste">${zeilen.join("")}</ul>` : ""}
      ${zusatz}
    </section>`;
}

// ------------------------------------------------------------- Liquiditaet

// Nur der Ist-Stand je Konto; die Prognose steht auf der Liquiditaetsseite.
function renderLiquiditaetKachel() {
  const verfuegbar = overviewAccountGroups().konten;
  const zeilen = verfuegbar.zeilen.map(({ konto, zeile: z }) => zeile(
    link(ZIEL.vermoegenTab("konten"), konto.name),
    z.wert_cents === null ? `<span class="muted">${escapeHtml(t("overview.nichtBelegt"))}</span>` : escapeHtml(formatMoney(z.wert_cents)),
  ));
  return bereichsKachel({
    id: "liquiditaet",
    icon: "liquiditaet",
    titel: t("overview.liquiditaet"),
    ziel: ZIEL.liquiditaet,
    wert: escapeHtml(formatMoney(verfuegbar.summe_cents)),
    notiz: `${escapeHtml(t("overview.availableMoney"))} · ${escapeHtml(standText(verfuegbar.aeltester))}`,
    zeilen,
  });
}

// ------------------------------------------------------------- Vermoegen

// Unterkachel der Vermoegenskachel: Teilsumme, Balken, Zeilen je Klasse.
function vermoegenTeil({ titel, positionen, klassen, darlehenKlasse = null }) {
  const summe = (filter) => positionen.filter(filter).reduce((a, p) => a + p.wert_cents, 0);
  const sichtbar = klassen.filter((k) => positionen.some(k.filter));
  const aktiva = sichtbar.filter((k) => k !== darlehenKlasse).reduce((a, k) => a + summe(k.filter), 0);
  const basis = Math.max(aktiva, 1);
  const segmente = sichtbar.filter((k) => k !== darlehenKlasse).map((k) => ({
    anteil: summe(k.filter) / basis,
    klasse: k.punkt,
    titel: `${k.titel}: ${formatMoney(summe(k.filter))}`,
  }));
  const schulden = darlehenKlasse && sichtbar.includes(darlehenKlasse) ? -summe(darlehenKlasse.filter) : 0;
  const balken = aktiva || schulden
    ? `<div class="uebersicht-balken">${balkenSvg(segmente)}${schulden ? balkenSvg([{ anteil: 1, klasse: "segment-darlehen", titel: `${t("vermoegen.passiva")}: ${formatMoney(schulden)}` }], { laenge: schulden / basis }) : ""}</div>`
    : "";
  const zeilen = sichtbar.map((k) => zeile(link(k.ziel, k.titel), escapeHtml(formatMoney(summe(k.filter))), { punkt: k.punkt }));
  return `
        <div class="vermoegen-teil">
          <h3 class="vermoegen-teil-titel">${escapeHtml(titel)}</h3>
          <div class="vermoegen-teil-wert">${escapeHtml(formatMoney(summe(() => true)))}</div>
          ${balken}
          ${zeilen.length ? `<ul class="vorsorge-kopf-liste">${zeilen.join("")}</ul>` : `<p class="muted">${escapeHtml(t("overview.vermoegenTeilLeer"))}</p>`}
        </div>`;
}

// Breite Kachel: oben das Nettovermoegen, darunter schnell verfuegbar (Konten,
// Depots) und langfristig gebunden (Immobilien, Sachwerte, Vorsorge minus Darlehen).
function renderVermoegenKachel() {
  const r = currentNettovermoegen();
  const depots = new Set(data.konten.filter((k) => k.kontotyp === "depot").map((k) => k.konto_id));
  const istDepot = (p) => p.klasse === "konto" && depots.has(p.id);
  const schnell = (p) => p.klasse === "konto";
  const klasse = (key, ziel) => ({ titel: t(`vermoegen.klassePlural.${key}`), filter: (p) => p.klasse === key, ziel, punkt: `segment-${key}` });
  const darlehen = klasse("darlehen", ZIEL.vermoegenTab("darlehen"));
  const stand = r.positionen.map((p) => p.standdatum).filter(Boolean).sort()[0] ?? "";
  return `
    <section class="panel panel-pad uebersicht-kachel uebersicht-kachel-breit" aria-labelledby="kachel-vermoegen">
      <h2 class="uebersicht-kachel-kopf" id="kachel-vermoegen">
        <button class="linkish" ${ZIEL.vermoegen}>${iconSvg("vermoegen")}<span>${escapeHtml(t("nav.vermoegen"))}</span>${iconSvg("chevronRight")}</button>
      </h2>
      <div class="kpi-value">${escapeHtml(formatMoney(r.netto_cents))}</div>
      <div class="kpi-note">${escapeHtml(t("vermoegen.netto"))} · ${escapeHtml(standText(stand))}</div>
      <div class="vermoegen-teile">
        ${vermoegenTeil({
          titel: t("overview.vermoegenSchnell"),
          positionen: r.positionen.filter(schnell),
          klassen: [
            { titel: t("overview.accounts"), filter: (p) => !istDepot(p), ziel: ZIEL.vermoegenTab("konten"), punkt: "segment-konto" },
            { titel: t("overview.depots"), filter: istDepot, ziel: ZIEL.vermoegenTab("konten"), punkt: "segment-depot" },
          ],
        })}
        ${vermoegenTeil({
          titel: t("overview.vermoegenLangfristig"),
          positionen: r.positionen.filter((p) => !schnell(p)),
          klassen: [
            klasse("immobilie", ZIEL.vermoegenTab("immobilien")),
            klasse("vermoegenswert", ZIEL.vermoegenTab("sonstige")),
            { ...klasse("vorsorge", ZIEL.vorsorge), titel: t("overview.vorsorgeRueckkauf") },
            darlehen,
          ],
          darlehenKlasse: darlehen,
        })}
      </div>
    </section>`;
}

// ------------------------------------------------------------- Vorsorge

// Zwei gleich grosse Werte: die monatliche Rente und die faelligen Einmalzahlungen.
// Beitraege und offene Punkte stehen auf der Vorsorgeseite.
function renderVorsorgeKachel() {
  const { renten, stufen, gesamt_cents: gesamt } = rentenStufen(data);
  const farben = vertragsFarben(data);
  const farbKlasse = (id) => (farben.has(id) ? `vertrag-farbe-${farben.get(id)}` : "vertrag-farbe-rest");
  const gesetzlich = gesetzlicherRentenbeginn(data);
  const abGesetzlich = stufen.find((s) => s.datum === gesetzlich);
  const notizen = [];
  if (abGesetzlich && abGesetzlich !== stufen.at(-1)) notizen.push(tf("vorsorge.kopf.abDatum", { datum: formatDate(abGesetzlich.datum), betrag: geldOhneCent(abGesetzlich.summe_cents) }));
  if (stufen.length) notizen.push(tf("vorsorge.kopf.vollAb", { datum: formatDate(stufen.at(-1).datum) }));
  const sortiert = [...renten].sort((a, b) => b.wert_cents - a.wert_cents);
  const segmente = sortiert.map((l) => ({ anteil: l.wert_cents / Math.max(gesamt, 1), klasse: farbKlasse(l.vorsorge.vorsorge_id), titel: `${l.vorsorge.name}: ${formatMoney(l.wert_cents)}` }));

  // Faellig ist nur, was ein Datum hat; eine Todesfallsumme ohne Ablauf zaehlt nicht.
  const kapital = erwarteteLeistungen(data).filter((l) => l.typ === "kapital" && l.beginn);
  const kapitalJahre = [...new Set(kapital.map((l) => l.beginn?.slice(0, 4)).filter(Boolean))].sort();
  // Einmalzahlungen = erwartete Kapitalleistung je Vertrag (Ablaufleistung laut
  // Vertrag/Standmitteilung), deshalb hoeher als der heutige Rueckkaufswert.
  const kapitalSumme = kapital.reduce((a, l) => a + l.wert_cents, 0);
  const kapitalSegmente = [...kapital].sort((a, b) => b.wert_cents - a.wert_cents)
    .map((l) => ({ anteil: l.wert_cents / Math.max(kapitalSumme, 1), klasse: farbKlasse(l.vorsorge.vorsorge_id), titel: `${l.vorsorge.name}: ${formatMoney(l.wert_cents)}` }));
  const kapitalZeilen = kapital.map((l) => zeile(
    `<button class="linkish" data-action="open-vorsorge" data-vorsorge="${escapeHtml(l.vorsorge.vorsorge_id)}">${escapeHtml(l.vorsorge.name)}</button>`,
    escapeHtml(geldOhneCent(l.wert_cents)),
    { zusatz: formatDate(l.beginn), punkt: farbKlasse(l.vorsorge.vorsorge_id) },
  ));
  const einmal = kapital.length ? `
      <div class="uebersicht-zweitwert">
        <h3 class="vermoegen-teil-titel">${link(ZIEL.vorsorgeTab("lebensversicherungen"), t("overview.kapitalFaellig"))}</h3>
        <div class="kpi-value">${escapeHtml(formatMoney(kapitalSumme))} <span class="betrag-einheit">${escapeHtml(t("overview.einmalig"))}</span></div>
        <div class="kpi-note">${escapeHtml(tf("vorsorge.kopf.kapitalFaellig", { jahre: kapitalJahre.join(" · ") }))}</div>
        <div class="uebersicht-balken">${balkenSvg(kapitalSegmente)}</div>
        <ul class="vorsorge-kopf-liste">${kapitalZeilen.join("")}</ul>
      </div>` : "";
  return bereichsKachel({
    id: "vorsorge",
    icon: "vorsorge",
    titel: t("nav.vorsorge"),
    ziel: ZIEL.vorsorge,
    wert: `${escapeHtml(formatMoney(gesamt))} <span class="betrag-einheit">${escapeHtml(t("vorsorge.jeMonatBrutto"))}</span>`,
    notiz: escapeHtml(renten.length ? notizen.join(" · ") : t("vorsorge.kopf.keineRenten")),
    grafik: renten.length ? `<div class="uebersicht-balken">${balkenSvg(segmente)}</div>` : "",
    zusatz: einmal,
  });
}

// ------------------------------------------------------------- Termine

function kontoName(kontoId) {
  return data.konten.find((k) => k.konto_id === kontoId)?.name ?? kontoId;
}

// Ein Klick fuehrt zum Vertrag (Vorsorgeobjekt), sonst zur Regelzahlung.
function zielLink(rz) {
  const ziel = rz.vorsorge_id
    ? `data-action="open-vorsorge" data-vorsorge="${escapeHtml(rz.vorsorge_id)}"`
    : `data-action="open-regelzahlung" data-regelzahlung="${escapeHtml(rz.regelzahlung_id)}"`;
  return `<button class="linkish" ${ziel}>${escapeHtml(rz.bezeichnung)}</button>`;
}

const formatMonatKurz = (iso) => new Intl.DateTimeFormat(state.lang === "de" ? "de-DE" : "en-US", { month: "short" }).format(new Date(`${iso}T00:00:00`));

function terminSpalte(titel, ziel, zeilen, leer) {
  return `
        <div class="termine-spalte">
          <h3 class="termine-titel">${ziel ? link(ziel, titel) : escapeHtml(titel)}</h3>
          ${zeilen.length ? `<ul class="termine-liste">${zeilen.join("")}</ul>` : `<p class="muted">${escapeHtml(leer)}</p>`}
        </div>`;
}

function renderTermineKachel(today) {
  const fristen = anstehendeFristen(data, today, HORIZONT_MONATE);
  const fristZeilen = fristen.map((f) => `
            <li class="${fristKlasse(f)}" data-datum="${escapeHtml(f.datum)}">
              <span class="termine-datum">${escapeHtml(formatDate(f.datum))}</span>
              <span class="termine-text"><span>${escapeHtml(f.bezeichnung)}</span>${f.bezug ? `<span class="muted">${bezugLink(f.bezug)}</span>` : ""}</span>
              <span class="amount">${fristChip(f, today)}</span>
            </li>`);
  const zahlungen = overviewJahreszahlungen(HORIZONT_MONATE);
  const zahlungZeilen = zahlungen.map(({ datum, regelzahlung: rz }) => `
            <li data-datum="${escapeHtml(datum)}">
              <span class="termine-datum">${escapeHtml(formatDate(datum))}</span>
              <span class="termine-text">${zielLink(rz)}<span class="muted">${escapeHtml(rz.konto_id ? t("overview.jahreszahlungenKonto").replace("{konto}", kontoName(rz.konto_id)) : t("overview.jahreszahlungenOhneKonto"))}</span></span>
              <span class="amount">${escapeHtml(formatMoney(toCents(rz.betrag)))}</span>
            </li>`);
  const leiste = terminLeiste({
    von: today,
    bis: addInterval(today, "monat", HORIZONT_MONATE),
    spuren: [
      { label: t("overview.fristen"), form: "raute", marker: fristen.map((f) => ({ datum: f.datum, klasse: fristKlasse(f), label: f.bezeichnung })) },
      { label: t("overview.zahlungen"), form: "kreis", marker: zahlungen.map(({ datum, regelzahlung: rz }) => ({ datum, klasse: "zahlung", label: `${rz.bezeichnung} · ${formatMoney(toCents(rz.betrag))}` })) },
    ],
    formatMonat: formatMonatKurz,
    ariaLabel: t("overview.termine"),
  });
  return `
    <section class="panel panel-pad uebersicht-termine" aria-labelledby="kachel-termine">
      <h2 class="uebersicht-kachel-kopf" id="kachel-termine">
        <button class="linkish" ${ZIEL.termine}>${iconSvg("termine")}<span>${escapeHtml(t("overview.termine"))}</span>${iconSvg("chevronRight")}</button>
      </h2>
      ${leiste ? `<div class="diagramm-wrap">${leiste}</div>` : ""}
      <div class="termine-spalten">
        ${terminSpalte(t("overview.fristen"), ZIEL.termineTab("fristen"), fristZeilen, t("overview.fristenLeer"))}
        ${terminSpalte(t("overview.jahreszahlungen"), ZIEL.termineTab("regelzahlungen"), zahlungZeilen, t("overview.jahreszahlungenLeer"))}
      </div>
    </section>`;
}

export function renderOverview() {
  const today = heuteIso();
  return `
    ${renderPageHead(t("overview.title"), "")}
    <div class="uebersicht-kacheln">
      ${renderLiquiditaetKachel()}
      ${renderVermoegenKachel()}
      ${renderVorsorgeKachel()}
    </div>
    ${renderTermineKachel(today)}
    ${renderAbsicherungKacheln(today)}
  `;
}

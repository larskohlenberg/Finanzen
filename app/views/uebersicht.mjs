// app/views/uebersicht.mjs
// Übersicht als Dashboard: je Bereich (Liquidität, Vermögen, Vorsorge) eine Kachel
// mit Kennzahl, kleinem Diagramm und Zeilen, die ins Detail führen; darunter die
// Termine der nächsten zwölf Monate (Fristen und jährliche Zahlungen) und die
// Absicherung je Person bei Berufsunfähigkeit und Tod. Konten- und Depottabellen stehen nur noch
// unter Vermögen, die nächste Aktion im Arbeitsstatus oben.
import { data, state, t, escapeHtml } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { formatDate, formatMoney, renderPageHead, heuteIso } from "../komponenten.mjs";
import { currentNettovermoegen, overviewAccountGroups, overviewJahreszahlungen } from "../selektoren.mjs";
import { addInterval, computeLiquiditaetPrognoseDetail, saldoJeTag, toCents } from "../liquiditaet.mjs";
import { computeVermoegenChecks } from "../vermoegen.mjs";
import { anstehendeFristen } from "../fristen.mjs";
import { renderAbsicherungKachel } from "./absicherung.mjs";
import { bezugLink, fristChip, fristKlasse } from "./fristen.mjs";
import { linienDiagramm, terminLeiste } from "../charts.mjs";
import {
  beitragJeJahrVertrag, beitragJeMonatVertrag, erwarteteLeistungen, gesetzlicherRentenbeginn, istBeendet,
  rentenStufen, tabFuerVorsorge, vertragsFarben,
} from "../vorsorge-rechnung.mjs";
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
function bereichsKachel({ id, icon, titel, ziel, wert, notiz = "", grafik = "", zeilen = [] }) {
  return `
    <section class="panel panel-pad uebersicht-kachel" aria-labelledby="kachel-${id}">
      <h2 class="uebersicht-kachel-kopf" id="kachel-${id}">
        <button class="linkish" ${ziel}>${iconSvg(icon)}<span>${escapeHtml(titel)}</span>${iconSvg("chevronRight")}</button>
      </h2>
      <div class="kpi-value">${wert}</div>
      ${notiz ? `<div class="kpi-note">${notiz}</div>` : ""}
      ${grafik}
      ${zeilen.length ? `<ul class="vorsorge-kopf-liste">${zeilen.join("")}</ul>` : ""}
    </section>`;
}

// ------------------------------------------------------------- Liquiditaet

// Prognose ab heute: Startsaldo, dann je Buchungstag der Saldo am Tagesende.
function prognosePunkte(prognose, today) {
  const verlauf = [{ datum: today, saldo_cents: prognose.start_saldo_cents }];
  for (const periode of prognose.perioden) {
    for (const monat of periode.monate) {
      for (const posten of monat.posten) verlauf.push({ datum: posten.datum, saldo_cents: posten.saldo_cents });
    }
  }
  return saldoJeTag(verlauf);
}

function renderLiquiditaetKachel(today) {
  const verfuegbar = overviewAccountGroups().konten;
  const prognose = computeLiquiditaetPrognoseDetail(data, { today, horizonEnd: addInterval(today, "monat", HORIZONT_MONATE), granularitaet: "monat" });
  const punkte = prognosePunkte(prognose, today);
  const tief = punkte.reduce((min, p) => (min === null || p.wert < min.wert ? p : min), null);
  const zeilen = tief ? [
    zeile(link(ZIEL.liquiditaet, t("overview.tiefpunkt")), escapeHtml(formatMoney(tief.wert)), { zusatz: formatDate(tief.datum) }),
    zeile(link(ZIEL.liquiditaet, t("overview.in12Monaten")), escapeHtml(formatMoney(prognose.end_saldo_cents))),
  ] : [];
  return bereichsKachel({
    id: "liquiditaet",
    icon: "liquiditaet",
    titel: t("overview.liquiditaet"),
    ziel: ZIEL.liquiditaet,
    wert: escapeHtml(formatMoney(verfuegbar.summe_cents)),
    notiz: `${escapeHtml(t("overview.availableMoney"))} · ${escapeHtml(standText(verfuegbar.aeltester))}`,
    // Kompakte Linie ohne Achsen: die Kachel ist schmal, Details stehen auf der Liquiditaetsseite.
    grafik: punkte.length > 1
      ? `<div class="diagramm-wrap">${linienDiagramm(punkte.map((p) => ({ wert: p.wert, label: formatDate(p.datum) })), { width: 320, height: 110, padBottom: 8, padTop: 8, formatWert: formatMoney, ariaLabel: t("overview.prognose") })}</div>`
      : "",
    zeilen,
  });
}

// ------------------------------------------------------------- Vermoegen

function renderVermoegenKachel() {
  const r = currentNettovermoegen();
  const summe = (filter) => r.positionen.filter(filter).reduce((a, p) => a + p.wert_cents, 0);
  const anzahl = (filter) => r.positionen.filter(filter).length;
  const depots = new Set(data.konten.filter((k) => k.kontotyp === "depot").map((k) => k.konto_id));
  const istDepot = (p) => p.klasse === "konto" && depots.has(p.id);
  const klassen = [
    { key: "konten", titel: t("overview.accounts"), filter: (p) => p.klasse === "konto" && !istDepot(p), ziel: ZIEL.vermoegenTab("konten"), punkt: "segment-konto" },
    { key: "depots", titel: t("overview.depots"), filter: istDepot, ziel: ZIEL.vermoegenTab("konten"), punkt: "segment-konto" },
    { key: "immobilie", titel: t("vermoegen.klassePlural.immobilie"), filter: (p) => p.klasse === "immobilie", ziel: ZIEL.vermoegenTab("immobilien"), punkt: "segment-immobilie" },
    { key: "vermoegenswert", titel: t("vermoegen.klassePlural.vermoegenswert"), filter: (p) => p.klasse === "vermoegenswert", ziel: ZIEL.vermoegenTab("sonstige"), punkt: "segment-vermoegenswert" },
    { key: "vorsorge", titel: t("vermoegen.klassePlural.vorsorge"), filter: (p) => p.klasse === "vorsorge", ziel: ZIEL.vorsorge, punkt: "segment-vorsorge" },
    { key: "darlehen", titel: t("vermoegen.klassePlural.darlehen"), filter: (p) => p.klasse === "darlehen", ziel: ZIEL.vermoegenTab("darlehen"), punkt: "segment-darlehen" },
  ].filter((k) => anzahl(k.filter));
  const aktiva = Math.max(r.aktiva_cents, 1);
  const segmente = ["konto", "immobilie", "vermoegenswert", "vorsorge"].map((k) => ({
    anteil: summe((p) => p.klasse === k) / aktiva,
    klasse: `segment-${k}`,
    titel: `${t(`vermoegen.klassePlural.${k}`)}: ${formatMoney(summe((p) => p.klasse === k))}`,
  }));
  const stand = r.positionen.map((p) => p.standdatum).filter(Boolean).sort()[0] ?? "";
  return bereichsKachel({
    id: "vermoegen",
    icon: "vermoegen",
    titel: t("nav.vermoegen"),
    ziel: ZIEL.vermoegen,
    wert: escapeHtml(formatMoney(r.netto_cents)),
    notiz: `${escapeHtml(t("vermoegen.netto"))} · ${escapeHtml(standText(stand))}`,
    grafik: `<div class="uebersicht-balken">${balkenSvg(segmente)}${balkenSvg([{ anteil: 1, klasse: "segment-darlehen", titel: `${t("vermoegen.passiva")}: ${formatMoney(r.passiva_cents)}` }], { laenge: r.passiva_cents / aktiva })}</div>`,
    zeilen: klassen.map((k) => zeile(link(k.ziel, k.titel), escapeHtml(formatMoney(summe(k.filter))), { punkt: k.punkt })),
  });
}

// ------------------------------------------------------------- Vorsorge

function renderVorsorgeKachel(today) {
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

  const kapital = erwarteteLeistungen(data).filter((l) => l.typ === "kapital");
  const kapitalJahre = [...new Set(kapital.map((l) => l.beginn?.slice(0, 4)).filter(Boolean))].sort();
  const aktiv = (data.vorsorge ?? []).filter((vs) => !istBeendet(vs));
  const versicherung = (vs) => tabFuerVorsorge(vs) === "versicherungen";
  const beitragMonat = aktiv.filter((vs) => !versicherung(vs)).reduce((a, vs) => a + beitragJeMonatVertrag(data, vs.vorsorge_id, today), 0);
  const beitragJahr = aktiv.filter(versicherung).reduce((a, vs) => a + beitragJeJahrVertrag(data, vs.vorsorge_id, today), 0);
  const offen = new Set(computeVermoegenChecks(data, today).filter((c) => c.entitaet === "vorsorge").map((c) => c.entitaet_id)).size;

  const zeilen = [
    ...(kapital.length ? [zeile(link(ZIEL.vorsorgeTab("lebensversicherungen"), t("overview.kapitalFaellig")), escapeHtml(geldOhneCent(kapital.reduce((a, l) => a + l.wert_cents, 0))), { zusatz: kapitalJahre.join(" · ") })] : []),
    zeile(link(ZIEL.vorsorgeTab("renten"), t("overview.beitraegeAltersvorsorge")), `${escapeHtml(formatMoney(beitragMonat))} ${escapeHtml(t("vorsorge.jeMonat"))}`),
    ...(beitragJahr ? [zeile(link(ZIEL.vorsorgeTab("versicherungen"), t("overview.beitraegeVersicherungen")), `${escapeHtml(formatMoney(beitragJahr))} ${escapeHtml(t("vorsorge.jeJahr"))}`)] : []),
    zeile(link(ZIEL.vorsorge, t("overview.offenePunkte")), offen
      ? `<span class="chip review">${escapeHtml(tf(offen === 1 ? "overview.offenePunkteEins" : "overview.offenePunkteAnzahl", { n: offen }))}</span>`
      : escapeHtml(t("overview.keineOffenen"))),
  ];
  return bereichsKachel({
    id: "vorsorge",
    icon: "vorsorge",
    titel: t("nav.vorsorge"),
    ziel: ZIEL.vorsorge,
    wert: `${escapeHtml(formatMoney(gesamt))} <span class="betrag-einheit">${escapeHtml(t("vorsorge.jeMonatBrutto"))}</span>`,
    notiz: escapeHtml(renten.length ? notizen.join(" · ") : t("vorsorge.kopf.keineRenten")),
    grafik: renten.length ? `<div class="uebersicht-balken">${balkenSvg(segmente)}</div>` : "",
    zeilen,
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
            <li class="${fristKlasse(f)}">
              <span class="termine-datum">${escapeHtml(formatDate(f.datum))}</span>
              <span class="termine-text"><span>${escapeHtml(f.bezeichnung)}</span>${f.bezug ? `<span class="muted">${bezugLink(f.bezug)}</span>` : ""}</span>
              <span class="amount">${fristChip(f, today)}</span>
            </li>`);
  const zahlungen = overviewJahreszahlungen(HORIZONT_MONATE);
  const zahlungZeilen = zahlungen.map(({ datum, regelzahlung: rz }) => `
            <li>
              <span class="termine-datum">${escapeHtml(formatDate(datum))}</span>
              <span class="termine-text">${zielLink(rz)}<span class="muted">${escapeHtml(rz.konto_id ? t("overview.jahreszahlungenKonto").replace("{konto}", kontoName(rz.konto_id)) : t("overview.jahreszahlungenOhneKonto"))}</span></span>
              <span class="amount">${escapeHtml(formatMoney(toCents(rz.betrag)))}</span>
            </li>`);
  const leiste = terminLeiste({
    von: today,
    bis: addInterval(today, "monat", HORIZONT_MONATE),
    spuren: [
      { label: t("overview.fristen"), form: "raute", marker: fristen.map((f) => ({ datum: f.datum, klasse: fristKlasse(f), label: `${formatDate(f.datum)} · ${f.bezeichnung}` })) },
      { label: t("overview.zahlungen"), form: "kreis", marker: zahlungen.map(({ datum, regelzahlung: rz }) => ({ datum, klasse: "zahlung", label: `${formatDate(datum)} · ${rz.bezeichnung} · ${formatMoney(toCents(rz.betrag))}` })) },
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
      ${renderLiquiditaetKachel(today)}
      ${renderVermoegenKachel()}
      ${renderVorsorgeKachel(today)}
    </div>
    ${renderTermineKachel(today)}
    ${renderAbsicherungKachel(today)}
  `;
}

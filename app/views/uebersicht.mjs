// app/views/uebersicht.mjs
// Ganz oben drei flache Kacheln: monatliche Einnahmen, Ausgaben und Sparquote
// (Ø der letzten zwoelf Monate aus den Buchungen, nach Kategorie).
// Übersicht als Dashboard: je Bereich (Liquidität, Vermögen, Vorsorge) eine Kachel
// mit Kennzahl und Zeilen, die ins Detail führen; Vermögen breit mit zwei
// Unterkacheln (schnell verfügbar, langfristig gebunden). Darunter die
// Termine der nächsten zwölf Monate (Fristen und jährliche Zahlungen) und die
// Absicherung bei Berufsunfähigkeit und im Todesfall als zwei Kacheln. Konten- und Depottabellen stehen nur noch
// unter Vermögen, die nächste Aktion im Arbeitsstatus oben.
import { state, t, tf, fmt, escapeHtml } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { formatDate, formatMoney, infoTipp, renderPageHead, heuteIso, trendPfeil } from "../komponenten.mjs";
import { addInterval, toCents } from "../liquiditaet.mjs";
import { renderAbsicherungKacheln } from "./absicherung.mjs";
import { verteileRundung } from "../uebersicht-rechnung.mjs";
import { abweichungHtml } from "./plan-ist.mjs";
import { bezugLink, fristChip, fristKlasse } from "./fristen.mjs";
import { terminLeiste } from "../charts.mjs";
import { balkenSvg } from "./vermoegen-teile.mjs";
import { erstelleApiCache } from "../api-daten.mjs";
import { HORIZONT_MONATE } from "../uebersicht-modell.mjs";

// Die Kennzahlen rechnet der App-Server (GET /api/v1/uebersicht, Modell in
// app/uebersicht-modell.mjs); hier wird nur gezeichnet.
const cache = erstelleApiCache({ maxEintraege: 4 });

function uebersichtAntwort(heute) {
  const suche = new URLSearchParams();
  if (state.dataMode === "demo") suche.set("quelle", "demo");
  suche.set("heute", heute);
  return cache.hole(`./api/v1/uebersicht?${suche}`);
}

const geldOhneCent = (c) => fmt().geldGanz(c);
const standText = (datum) => (datum ? `${t("labels.stand")} ${formatDate(datum)}` : t("labels.noStand"));
const farbPunkt = (klasse) => `<i class="farbpunkt ${klasse}" aria-hidden="true"></i>`;

// Eine Zeile unter der Kennzahl: Link ins Detail, optional Zusatz und Betrag.
function zeile(linkHtml, betrag, { zusatz = "", punkt = "" } = {}) {
  return `<li>${punkt ? farbPunkt(punkt) : ""}${linkHtml}${zusatz ? `<span class="muted">${escapeHtml(zusatz)}</span>` : ""}<span class="amount">${betrag}</span></li>`;
}

const link = (ziel, text, { title = "" } = {}) => `<button class="linkish" ${ziel}${title ? ` title="${escapeHtml(title)}"` : ""}>${escapeHtml(text)}</button>`;
const ZIEL = {
  liquiditaet: `data-view="liquiditaet"`,
  vermoegen: `data-view="vermoegen"`,
  vorsorge: `data-view="vorsorge"`,
  termine: `data-view="termine"`,
  termineTab: (tab) => `data-action="termine-tab" data-tab="${escapeHtml(tab)}"`,
  vermoegenTab: (tab) => `data-action="vermoegen-tab" data-tab="${escapeHtml(tab)}"`,
  vorsorgeTab: (tab) => `data-action="vorsorge-tab" data-tab="${escapeHtml(tab)}"`,
  vermoegenObjekt: (klasse, id) => `data-action="open-vermoegen-entity" data-vklasse="${escapeHtml(klasse)}" data-vid="${escapeHtml(id)}"`,
};

// Bereichskachel: Kopf mit Titel als Link, Kennzahl, Notiz, Grafik, Zeilen.
function bereichsKachel({ id, icon, titel, ziel, wertTitel = "", wert, notiz = "", grafik = "", zeilen = [], zusatz = "" }) {
  return `
    <section class="panel panel-pad uebersicht-kachel" aria-labelledby="kachel-${id}">
      <h2 class="uebersicht-kachel-kopf" id="kachel-${id}">
        <button class="linkish" ${ziel}>${iconSvg(icon)}<span>${escapeHtml(titel)}</span>${iconSvg("chevronRight")}</button>
      </h2>
      ${wertTitel ? `<h3 class="vermoegen-teil-titel uebersicht-werttitel">${wertTitel}</h3>` : ""}
      <div class="kpi-value">${wert}</div>
      ${notiz ? `<div class="kpi-note">${notiz}</div>` : ""}
      ${grafik}
      ${zeilen.length ? `<ul class="vorsorge-kopf-liste">${zeilen.join("")}</ul>` : ""}
      ${zusatz}
    </section>`;
}

// ------------------------------------------------------------- Einnahmen/Ausgaben/Sparquote

// Wie viele Kategorien einzeln stehen; der Rest klappt unter "Übrige" auf.
// Die Reihenfolge ergibt sich je Zeitraum neu aus den Betraegen.
const TOP_KATEGORIEN = 3;
const TOP_AUSGABEN = 5;
const formatMonatLang = (ym) => fmt().monatJahrKurz(ym);
const formatProzent = (anteil) => fmt().prozent(anteil);

const kategorieZiel = (id, mittel) => `data-action="kategorie-transactions" data-kategorie="${escapeHtml(id)}" data-von="${escapeHtml(mittel.von)}" data-bis="${escapeHtml(mittel.bis)}"`;

// Die groessten Kategorien einzeln (als Link in die Buchungen des Zeitraums), der
// Rest als aufklappbares "Übrige" mit allen weiteren Kategorien.
// vergleich (Jahresvergleich der Seite, optional): je Kategorie ein kleiner
// Pfeil, nur wenn sie sich spuerbar veraendert hat.
function kategorieTeile(kategorien, mittel, top = TOP_KATEGORIEN, { vergleich = null, mehrIstGut = true } = {}) {
  const pfeil = (k) => trendPfeil(vergleich?.kategorien[k.kategorie_id], { mehrIstGut, kurz: true, ohneSeitwaerts: true });
  const weitere = kategorien.slice(top);
  const rest = weitere.reduce((a, k) => a + k.mittel_cents, 0);
  return [
    ...kategorien.slice(0, top).map((k, i) => ({ ...k, klasse: `vertrag-farbe-${i}`, ziel: kategorieZiel(k.kategorie_id, mittel), trend: pfeil(k) })),
    ...(rest > 0 ? [{ name: t("overview.uebrige"), mittel_cents: rest, klasse: "vertrag-farbe-rest", ziel: "", unter: weitere.map((k) => ({ ...k, ziel: kategorieZiel(k.kategorie_id, mittel), trend: pfeil(k) })) }] : []),
  ];
}

function legendenZeile(k) {
  const name = k.ziel ? `<button class="linkish" ${k.ziel} title="${escapeHtml(k.name)}">${escapeHtml(k.name)}</button>` : `<span title="${escapeHtml(k.name)}">${escapeHtml(k.name)}</span>`;
  const betrag = `<span class="amount">${k.mitVorzeichen && k.mittel_cents > 0 ? "+" : ""}${escapeHtml(geldOhneCent(k.mittel_cents))}</span>`;
  if (!k.unter?.length) return `<li${k.zeilenKlasse ? ` class="${k.zeilenKlasse}"` : ""}>${k.klasse ? farbPunkt(k.klasse) : ""}${name}${k.trend ?? ""}${betrag}</li>`;
  return `<li class="flach-uebrige"><details><summary>${farbPunkt(k.klasse)}<span>${escapeHtml(k.name)}</span>${betrag}</summary><ul class="flach-unterliste">${k.unter.map(legendenZeile).join("")}</ul></details></li>`;
}

// Rundet die Legende so, dass jede Ebene genau aufgeht: die Teile ergeben die
// angezeigte Summe, aufgeklappte Teile ihre Zeile. Gibt es darin Gruppen-Koepfe
// (Zwischensummen), gehen erst die Koepfe auf die Zeile auf, dann ihre Teile auf den Kopf.
function rundeTeile(teile, zielCents) {
  const gerundet = verteileRundung(teile.map((k) => k.mittel_cents), zielCents);
  return teile.map((k, i) => (k.unter?.length
    ? { ...k, mittel_cents: gerundet[i], unter: rundeUnter(k.unter, gerundet[i]) }
    : { ...k, mittel_cents: gerundet[i] }));
}

function rundeUnter(unter, zielCents) {
  const istKopf = (k) => String(k.zeilenKlasse ?? "").includes("flach-gruppe");
  if (!unter.some(istKopf)) return rundeTeile(unter, zielCents);
  const gruppen = [];
  for (const k of unter) {
    if (istKopf(k)) gruppen.push({ kopf: k, teile: [] });
    else gruppen.at(-1)?.teile.push(k);
  }
  const koepfe = verteileRundung(gruppen.map((g) => g.kopf.mittel_cents), zielCents);
  return gruppen.flatMap((g, i) => [{ ...g.kopf, mittel_cents: koepfe[i] }, ...rundeTeile(g.teile, koepfe[i])]);
}

// Flache Kachel: Kennzahl und Notiz, darunter links die kurze Leiste und
// rechts die Legende untereinander. Teile mit negativem Betrag stehen nur in der Legende.
function flacheKachel({ id, titel, info = "", wert, trend = "", notiz, plan = "", teile: roh, summe_cents }) {
  const teile = summe_cents === undefined ? roh : rundeTeile(roh, summe_cents);
  const basis = Math.max(teile.filter((k) => k.mittel_cents > 0).reduce((a, k) => a + k.mittel_cents, 0), 1);
  const segmente = teile.filter((k) => k.mittel_cents > 0).map((k) => ({ anteil: k.mittel_cents / basis, klasse: k.klasse, titel: `${k.name}: ${formatMoney(k.mittel_cents)}` }));
  const legende = teile.map(legendenZeile).join("");
  return `
    <section class="panel panel-pad uebersicht-flach-kachel" aria-labelledby="kachel-${id}">
      <h2 class="uebersicht-kachel-kopf" id="kachel-${id}">
        <button class="linkish" ${ZIEL.liquiditaet}>${iconSvg("liquiditaet")}<span>${escapeHtml(titel)}</span>${iconSvg("chevronRight")}</button>${info ? infoTipp(info) : ""}
      </h2>
      <div class="kpi-value">${wert}${trend ? ` <span class="kpi-trend">${trend}</span>` : ""}</div>
      <div class="kpi-note">${notiz}</div>
      ${plan ? `<div class="kpi-plan">${plan}</div>` : ""}
      ${teile.length ? `
      <div class="flach-inhalt">
        <div class="uebersicht-balken">${segmente.length ? balkenSvg(segmente) : ""}</div>
        <ul class="flach-legende">${legende}</ul>
      </div>` : ""}
    </section>`;
}

// Pfeil der Sparquote: Veraenderung in Prozentpunkten gegen die zwoelf Monate
// davor; unter einem Prozentpunkt seitwaerts.
function quotePfeil(sq) {
  if (!sq || sq.aenderung_pp === null) return "";
  const pp = sq.aenderung_pp;
  const richtung = Math.abs(pp) < 1 ? "seitwaerts" : pp > 0 ? "hoch" : "runter";
  const klasse = richtung === "seitwaerts" ? "abw-neutral" : richtung === "hoch" ? "abw-gut" : "abw-schlecht";
  const aenderung = fmt().zahlMitVorzeichen(pp, 1);
  const titel = tf("trend.quoteTitel", { aenderung, vorher: formatProzent(sq.vorher_quote) });
  return `<span class="trend-pfeil ${klasse}" title="${escapeHtml(titel)}" aria-label="${escapeHtml(titel)}">${{ hoch: "↗", runter: "↘", seitwaerts: "→" }[richtung]} ${escapeHtml(aenderung)} ${escapeHtml(t("trend.pp"))}</span>`;
}

function renderEinnahmenAusgaben(modell) {
  // Nur Monate, die auf allen Konten vollstaendig gebucht sind (Stand wie in der Liquiditaet).
  const { mittel, plan, trend } = modell;
  if (!mittel.anzahl_monate) return "";
  const zeitraum = mittel.anzahl_monate === 1 ? formatMonatLang(mittel.monate[0]) : `${formatMonatLang(mittel.monate[0])} – ${formatMonatLang(mittel.monate.at(-1))}`;
  const basisNotiz = `${escapeHtml(tf(mittel.anzahl_monate === 1 ? "overview.mittelEins" : "overview.mittelMonate", { n: mittel.anzahl_monate }))} · ${escapeHtml(zeitraum)}`;
  const jeMonat = (cents) => `${escapeHtml(geldOhneCent(cents))} <span class="betrag-einheit">${escapeHtml(t("vorsorge.jeMonat"))}</span>`;
  const { sparen } = mittel;
  // Planzeile: Plan aus den Regelzahlungen im selben Zeitraum, Abweichung
  // gefaerbt; der Link oeffnet Plan & Ist mit den letzten zwoelf Monaten.
  const planMittel = (c) => Math.round(c / mittel.anzahl_monate);
  const planLink = (text) => `<button class="linkish" data-action="plan-ist" data-periode="12m">${escapeHtml(text)}</button>`;
  const planZeile = (ist, planCents, mehrIstGut) => `${planLink(tf("planIst.kachelPlan", { betrag: geldOhneCent(planCents) }))} · ${abweichungHtml(ist, planCents, { mehrIstGut })}`;
  const quotePlan = plan.quote;
  const quoteDiff = sparen.quote !== null && quotePlan !== null ? Math.round((sparen.quote - quotePlan) * 100) : null;
  const quoteZeile = quotePlan === null ? "" : `${planLink(tf("planIst.kachelPlan", { betrag: formatProzent(quotePlan) }))}${quoteDiff === null ? "" : ` · <span class="${quoteDiff > 0 ? "abw-gut" : quoteDiff < 0 ? "abw-schlecht" : "abw-neutral"}">${quoteDiff > 0 ? "+" : quoteDiff < 0 ? "−" : "±"}${Math.abs(quoteDiff)} ${escapeHtml(t("planIst.prozentpunkte"))}</span>`}`;
  const zielLinkFuer = (ids) => (ids.length === 1 ? `data-action="kategorie-transactions" data-kategorie="${escapeHtml(ids[0])}" data-von="${escapeHtml(mittel.von)}" data-bis="${escapeHtml(mittel.bis)}"` : "");
  const ZIEL_KLASSE = { liquide: "segment-konto", depot: "segment-depot", versicherung: "segment-vorsorge" };
  // Kurzfristig liquide in seine Teile: liquide Kategorien (Festgeld) mit Link in
  // die Buchungen, der Rest auf Konten und Tagesgeld mit Link auf die
  // Umbuchungen zwischen eigenen Konten im Zeitraum.
  const sparTeile = sparen.ziele.flatMap((z) => {
    if (z.ziel !== "liquide") {
      return z.mittel_cents ? [{ name: t(`overview.sparziel.${z.ziel}`), mittel_cents: z.mittel_cents, klasse: ZIEL_KLASSE[z.ziel], ziel: zielLinkFuer(z.kategorien) }] : [];
    }
    return [
      ...z.teile.map((k) => ({ name: k.name, mittel_cents: k.mittel_cents, klasse: "segment-liquide-teil", ziel: kategorieZiel(k.kategorie_id, mittel) })),
      ...(z.konten_cents ? [{
        name: t(z.konten_cents < 0 ? "overview.kontenEntnommen" : "overview.kontenTagesgeld"),
        mittel_cents: z.konten_cents,
        klasse: ZIEL_KLASSE.liquide,
        ziel: "",
        // Aufgeklappt: tatsaechliche Veraenderung je Konto (Link auf dessen Buchungen
        // im Zeitraum), dazu der Abgleich mit Sondereffekten und Investitionen.
        // Zwei Gruppen, jede mit ihrer Zwischensumme als Kopf: die Veraenderung je
        // Konto und, mit Vorzeichen, was nicht aus dem laufenden Ueberschuss kommt.
        unter: [
          { name: t("overview.kontenVeraenderung"), mittel_cents: z.veraenderung_cents, ziel: "", zeilenKlasse: "flach-gruppe" },
          ...z.konten.map((k) => ({ name: k.name, mittel_cents: k.mittel_cents, ziel: `data-action="kategorie-transactions" data-konto="${escapeHtml(k.konto_id)}" data-von="${escapeHtml(mittel.von)}" data-bis="${escapeHtml(mittel.bis)}"` })),
          ...(z.bestandteile.length ? [
            { name: t("overview.kontenSondereffekte"), mittel_cents: z.abgleich_cents, mitVorzeichen: true, ziel: "", zeilenKlasse: "flach-gruppe flach-gruppe-folge" },
            ...z.bestandteile.map((b) => ({
              name: b.art === "umbuchungen" || b.art === "rest" ? t(`overview.abgleich.${b.art}`) : tf(`overview.abgleich.${b.art}`, { name: b.name }),
              mittel_cents: b.mittel_cents,
              mitVorzeichen: true,
              ziel: b.art === "rest" ? "" : b.art === "umbuchungen"
                ? `data-action="kategorie-transactions" data-transfer="only" data-von="${escapeHtml(mittel.von)}" data-bis="${escapeHtml(mittel.bis)}"`
                : kategorieZiel(b.kategorie_id, mittel),
            })),
          ] : []),
        ],
      }] : []),
    ];
  });
  return `
    <div class="uebersicht-flach">
      ${flacheKachel({ id: "einnahmen", titel: t("overview.monatlicheEinnahmen"), wert: jeMonat(mittel.einnahmen.mittel_cents), trend: trendPfeil(trend?.einnahmen.summe, { mehrIstGut: true }), notiz: basisNotiz, plan: planZeile(mittel.einnahmen.mittel_cents, planMittel(plan.einnahmen_plan_cents), true), teile: kategorieTeile(mittel.einnahmen.kategorien, mittel, TOP_KATEGORIEN, { vergleich: trend?.einnahmen, mehrIstGut: true }), summe_cents: mittel.einnahmen.mittel_cents })}
      ${flacheKachel({ id: "ausgaben", titel: t("overview.monatlicheAusgaben"), wert: jeMonat(mittel.ausgaben.mittel_cents), trend: trendPfeil(trend?.ausgaben.summe, { mehrIstGut: false }), notiz: basisNotiz, plan: planZeile(mittel.ausgaben.mittel_cents, planMittel(plan.ausgaben_plan_cents), false), teile: kategorieTeile(mittel.ausgaben.kategorien, mittel, TOP_AUSGABEN, { vergleich: trend?.ausgaben, mehrIstGut: false }), summe_cents: mittel.ausgaben.mittel_cents })}
      ${flacheKachel({
        id: "sparquote",
        titel: t("overview.sparquote"),
        info: t("overview.sparquoteInfo"),
        wert: sparen.quote === null ? "–" : escapeHtml(formatProzent(sparen.quote)),
        trend: quotePfeil(trend?.sparquote),
        notiz: `${escapeHtml(tf("overview.sparquoteNotiz", { betrag: geldOhneCent(sparen.ueberschuss_cents) }))} · ${basisNotiz}`,
        plan: quoteZeile,
        teile: sparTeile,
        summe_cents: sparen.ueberschuss_cents,
      })}
    </div>`;
}

// ------------------------------------------------------------- Liquiditaet

// Nur der Ist-Stand je Konto; die Prognose steht auf der Liquiditaetsseite.
function renderLiquiditaetKachel(modell) {
  const verfuegbar = modell.konten;
  const zeilen = verfuegbar.zeilen.map((z) => zeile(
    link(ZIEL.vermoegenTab("konten"), z.name),
    z.wert_cents === null ? `<span class="muted">${escapeHtml(t("overview.nichtBelegt"))}</span>` : escapeHtml(geldOhneCent(z.wert_cents)),
  ));
  return bereichsKachel({
    id: "liquiditaet",
    icon: "liquiditaet",
    titel: t("overview.liquiditaet"),
    ziel: ZIEL.liquiditaet,
    wert: escapeHtml(geldOhneCent(verfuegbar.summe_cents)),
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
  const zeilen = sichtbar.map((k) => zeile(link(k.ziel, k.titel, { title: k.titel }), escapeHtml(geldOhneCent(summe(k.filter))), { punkt: k.punkt }));
  return `
        <div class="vermoegen-teil">
          <h3 class="vermoegen-teil-titel">${escapeHtml(titel)}</h3>
          <div class="vermoegen-teil-wert">${escapeHtml(geldOhneCent(summe(() => true)))}</div>
          ${balken}
          ${zeilen.length ? `<ul class="vorsorge-kopf-liste">${zeilen.join("")}</ul>` : `<p class="muted">${escapeHtml(t("overview.vermoegenTeilLeer"))}</p>`}
        </div>`;
}

// Breite Kachel: oben das Nettovermoegen, darunter schnell verfuegbar (Konten,
// Festgeld, Depots) und langfristig gebunden (Immobilien einzeln, Sachwerte, Vorsorge minus Darlehen).
function renderVermoegenKachel(modell) {
  const r = modell.vermoegen;
  const kontotyp = new Map(Object.entries(r.kontotyp));
  const istDepot = (p) => p.klasse === "konto" && kontotyp.get(p.id) === "depot";
  const istFestgeld = (p) => p.klasse === "konto" && kontotyp.get(p.id) === "festgeld";
  const schnell = (p) => p.klasse === "konto";
  const klasse = (key, ziel) => ({ titel: t(`vermoegen.klassePlural.${key}`), filter: (p) => p.klasse === key, ziel, punkt: `segment-${key}` });
  const darlehen = klasse("darlehen", ZIEL.vermoegenTab("darlehen"));
  // Immobilien einzeln, die wertvollste zuerst; der Link oeffnet ihre Details.
  const immobilien = r.positionen.filter((p) => p.klasse === "immobilie").sort((a, b) => b.wert_cents - a.wert_cents)
    .map((imm) => ({ titel: imm.name, filter: (p) => p.klasse === "immobilie" && p.id === imm.id, ziel: ZIEL.vermoegenObjekt("immobilie", imm.id), punkt: "segment-immobilie" }));
  // Rueckkaufswerte fuehren in den Vorsorge-Reiter, der den groessten Teil davon haelt.
  const rueckkaufTab = r.rueckkauf_tab;
  const stand = r.positionen.map((p) => p.standdatum).filter(Boolean).sort()[0] ?? "";
  return `
    <section class="panel panel-pad uebersicht-kachel uebersicht-kachel-breit" aria-labelledby="kachel-vermoegen">
      <h2 class="uebersicht-kachel-kopf" id="kachel-vermoegen">
        <button class="linkish" ${ZIEL.vermoegen}>${iconSvg("vermoegen")}<span>${escapeHtml(t("nav.vermoegen"))}</span>${iconSvg("chevronRight")}</button>
      </h2>
      <div class="kpi-value">${escapeHtml(geldOhneCent(r.netto_cents))}</div>
      <div class="kpi-note">${escapeHtml(t("vermoegen.netto"))} · ${escapeHtml(standText(stand))}</div>
      <div class="vermoegen-teile">
        ${vermoegenTeil({
          titel: t("overview.vermoegenSchnell"),
          positionen: r.positionen.filter(schnell),
          klassen: [
            { titel: t("overview.accounts"), filter: (p) => !istDepot(p) && !istFestgeld(p), ziel: ZIEL.vermoegenTab("konten"), punkt: "segment-konto" },
            { titel: t("overview.festgeld"), filter: istFestgeld, ziel: ZIEL.vermoegenTab("konten"), punkt: "segment-festgeld" },
            { titel: t("overview.depots"), filter: istDepot, ziel: ZIEL.vermoegenTab("konten"), punkt: "segment-depot" },
          ],
        })}
        ${vermoegenTeil({
          titel: t("overview.vermoegenLangfristig"),
          positionen: r.positionen.filter((p) => !schnell(p)),
          klassen: [
            ...immobilien,
            klasse("vermoegenswert", ZIEL.vermoegenTab("sonstige")),
            { ...klasse("vorsorge", ZIEL.vorsorgeTab(rueckkaufTab)), titel: t("overview.vorsorgeRueckkauf") },
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
function renderVorsorgeKachel(modell) {
  const { renten, stufen, gesamt_cents: gesamt, farben, gesetzlich } = modell.vorsorge;
  const farbKlasse = (id) => (Object.hasOwn(farben, id) ? `vertrag-farbe-${farben[id]}` : "vertrag-farbe-rest");
  const abGesetzlich = stufen.find((s) => s.datum === gesetzlich);
  const notizen = [];
  if (abGesetzlich && abGesetzlich !== stufen.at(-1)) notizen.push(tf("vorsorge.kopf.abDatum", { datum: formatDate(abGesetzlich.datum), betrag: geldOhneCent(abGesetzlich.summe_cents) }));
  if (stufen.length) notizen.push(tf("vorsorge.kopf.vollAb", { datum: formatDate(stufen.at(-1).datum) }));
  const sortiert = [...renten].sort((a, b) => b.wert_cents - a.wert_cents);
  const segmente = sortiert.map((l) => ({ anteil: l.wert_cents / Math.max(gesamt, 1), klasse: farbKlasse(l.vorsorge_id), titel: `${l.name}: ${formatMoney(l.wert_cents)}` }));

  // Faellig ist nur, was ein Datum hat; bedingte (z. B. Todesfallsumme) und
  // undatierte Leistungen nennt die Notiz, ohne sie einzurechnen. Gleiche Rechnung
  // wie die Vorsorgeseite. Einmalzahlungen = erwartete Kapitalleistung je Vertrag
  // (Ablaufleistung laut Vertrag/Standmitteilung), deshalb hoeher als der Rueckkaufswert;
  // fondsgebundene Lebensversicherungen ohne Garantie zaehlen mit dem Rueckkaufswert
  // von heute und sind als "Stand heute" markiert.
  const gruppen = modell.vorsorge.kapital;
  const kapital = gruppen.terminiert;
  const kapitalJahre = gruppen.jahre;
  const kapitalSumme = gruppen.terminiert_cents;
  const nichtFaellig = gruppen.nicht_faellig_cents;
  const kapitalSegmente = [...kapital].sort((a, b) => b.wert_cents - a.wert_cents)
    .map((l) => ({ anteil: l.wert_cents / Math.max(kapitalSumme, 1), klasse: farbKlasse(l.vorsorge_id), titel: `${l.name}: ${formatMoney(l.wert_cents)}` }));
  const kapitalZeilen = kapital.map((l) => zeile(
    `<button class="linkish" data-action="open-vorsorge" data-vorsorge="${escapeHtml(l.vorsorge_id)}">${escapeHtml(l.name)}</button>`,
    escapeHtml(geldOhneCent(l.wert_cents)),
    { zusatz: [formatDate(l.beginn), l.ersatz ? t("vorsorge.standHeute") : ""].filter(Boolean).join(" · "), punkt: farbKlasse(l.vorsorge_id) },
  ));
  const einmal = kapital.length ? `
      <div class="uebersicht-zweitwert">
        <h3 class="vermoegen-teil-titel">${link(ZIEL.vorsorgeTab("lebensversicherungen"), t("overview.kapitalFaellig"))}</h3>
        <div class="kpi-value">${escapeHtml(geldOhneCent(kapitalSumme))} <span class="betrag-einheit">${escapeHtml(t("overview.einmalig"))}</span></div>
        <div class="kpi-note">${escapeHtml([tf("vorsorge.kopf.kapitalFaellig", { jahre: kapitalJahre.join(" · ") }), nichtFaellig ? tf("vorsorge.kopf.nichtFaellig", { betrag: geldOhneCent(nichtFaellig) }) : ""].filter(Boolean).join(" · "))}</div>
        <div class="uebersicht-balken">${balkenSvg(kapitalSegmente)}</div>
        <ul class="vorsorge-kopf-liste">${kapitalZeilen.join("")}</ul>
      </div>` : "";
  return bereichsKachel({
    id: "vorsorge",
    icon: "vorsorge",
    titel: t("nav.vorsorge"),
    ziel: ZIEL.vorsorge,
    wertTitel: link(ZIEL.vorsorgeTab("renten"), t("overview.monatlicheRenten")),
    wert: `${escapeHtml(geldOhneCent(gesamt))} <span class="betrag-einheit">${escapeHtml(t("vorsorge.jeMonatBrutto"))}</span>`,
    notiz: escapeHtml(renten.length ? notizen.join(" · ") : t("vorsorge.kopf.keineRenten")),
    grafik: renten.length ? `<div class="uebersicht-balken">${balkenSvg(segmente)}</div>` : "",
    zusatz: einmal,
  });
}

// ------------------------------------------------------------- Termine

// Ein Klick fuehrt zum Vertrag (Vorsorgeobjekt), sonst zur Regelzahlung.
function zielLink(rz) {
  const ziel = rz.vorsorge_id
    ? `data-action="open-vorsorge" data-vorsorge="${escapeHtml(rz.vorsorge_id)}"`
    : `data-action="open-regelzahlung" data-regelzahlung="${escapeHtml(rz.regelzahlung_id)}"`;
  return `<button class="linkish" ${ziel}>${escapeHtml(rz.bezeichnung)}</button>`;
}

const formatMonatKurz = (iso) => fmt().monatKurz(iso);

// Text einer Terminzeile: einzeilig, Bezug wird zuerst gekuerzt (CSS); der volle
// Text steht im Tooltip. Die Teile sind schon escapetes HTML, daher nur Tags weg.
function terminText(teile) {
  const voll = teile.map((html) => html.replace(/<[^>]*>/g, "")).filter(Boolean).join(" · ");
  return `<span class="termine-text" title="${voll}">${teile.map((html, i) => (i ? `<span class="muted">${html}</span>` : html)).join("")}</span>`;
}

function terminSpalte(titel, ziel, zeilen, leer) {
  return `
        <div class="termine-spalte">
          <h3 class="termine-titel">${ziel ? link(ziel, titel) : escapeHtml(titel)}</h3>
          ${zeilen.length ? `<ul class="termine-liste">${zeilen.join("")}</ul>` : `<p class="muted">${escapeHtml(leer)}</p>`}
        </div>`;
}

function renderTermineKachel(modell) {
  const today = modell.heute;
  const { fristen } = modell;
  const fristZeilen = fristen.map((f) => `
            <li class="${fristKlasse(f)}" data-datum="${escapeHtml(f.datum)}">
              <span class="termine-datum">${escapeHtml(formatDate(f.datum))}</span>
              ${terminText([`<span>${escapeHtml(f.bezeichnung)}</span>`, ...(f.bezug ? [bezugLink(f.bezug)] : [])])}
              <span class="amount">${fristChip(f, today)}</span>
            </li>`);
  const zahlungen = modell.zahlungen;
  const zahlungZeilen = zahlungen.map(({ datum, regelzahlung: rz, konto_name: kontoName }) => `
            <li data-datum="${escapeHtml(datum)}">
              <span class="termine-datum">${escapeHtml(formatDate(datum))}</span>
              ${terminText([zielLink(rz), escapeHtml(rz.konto_id ? tf("overview.jahreszahlungenKonto", { konto: kontoName }) : t("overview.jahreszahlungenOhneKonto"))])}
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
  const { antwort: modell, fehler } = uebersichtAntwort(heuteIso());
  if (!modell) {
    return `
    ${renderPageHead(t("overview.title"), "")}
    <section class="panel panel-pad"><p class="muted" role="status">${escapeHtml(fehler ? `${t("overview.loadFailed")} (${fehler.message})` : t("overview.loading"))}</p></section>`;
  }
  return `
    ${renderPageHead(t("overview.title"), "")}
    ${renderEinnahmenAusgaben(modell)}
    <div class="uebersicht-kacheln">
      ${renderLiquiditaetKachel(modell)}
      ${renderVermoegenKachel(modell)}
      ${renderVorsorgeKachel(modell)}
    </div>
    ${renderTermineKachel(modell)}
    ${renderAbsicherungKacheln(modell.absicherung)}
  `;
}

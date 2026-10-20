// app/views/liquiditaet.mjs
// Liquiditaets-Ansicht im Aufbau der Bereichsseiten: oben zwei Kacheln (heute
// mit den letzten zwoelf Monaten, Prognose bis zum Horizont), darunter
// Einnahmen und Ausgaben im Trend (gleitendes 12-Monats-Mittel) und die
// Tabellen als zugeklappte Kacheln.
import { state, t, tf, fmt, escapeHtml } from "../runtime.mjs";
import { zielRoute } from "../routing.mjs";
import { iconSvg } from "../icons.js";
import { formatMoney, formatDate, formatMonth, renderPageHead, heuteIso, kennzahlKachel, kachelZeile, zeitverlaufKlein, klappKachel, trendPfeil, trendZeitraumText } from "../komponenten.mjs";
import { miniKurve } from "../charts.mjs";
import { toCents } from "../liquiditaet.mjs";
import { erstelleApiCache } from "../api-daten.mjs";
import { LEERE_FILTER, filterAlsQuery } from "../navigation.mjs";

// Salden, Verlaeufe und Prognose rechnet der App-Server (GET /api/v1/liquiditaet,
// Modell in app/liquiditaet-modell.mjs); hier wird nur gezeichnet.
const cache = erstelleApiCache({ maxEintraege: 8 });

function liquiditaetAntwort(heute) {
  const suche = new URLSearchParams();
  if (state.dataMode === "demo") suche.set("quelle", "demo");
  suche.set("heute", heute);
  if (state.liquiditaet.bisDatum) suche.set("bis", state.liquiditaet.bisDatum);
  suche.set("granularitaet", state.liquiditaet.granularitaet);
  return cache.hole(`./api/v1/liquiditaet?${suche}`);
}

const geldOhneCent = (c) => fmt().geldGanz(c);
// Kurzer Monatsname als Achsenbeschriftung, im Januar mit Jahr.
const monatKurz = (monat) => {
  const name = fmt().monatKurz(monat);
  return monat.endsWith("-01") ? monat.slice(0, 4) : name.replace(".", "");
};
// Kurzbetrag in Tausend Euro mit hoechstens einer Nachkommastelle ("-20 T€", "+4,8 T€").
const tausend = (c) => fmt().tausend(c);
// Ueber zwoelf Monate nur Quartalsanfaenge beschriften (Januar mit Jahr), sonst wird es eng.
const monatsAchse = (monate) => monate.map((m) => ({
  label: monate.length <= 12 || ["01", "04", "07", "10"].includes(m.slice(5, 7)) ? monatKurz(m) : "",
  titel: formatMonth(m),
}));

function renderSaldoVerlauf(verlauf, emptyKey) {
  if (!verlauf.length) return `<p class="muted">${escapeHtml(t(emptyKey))}</p>`;
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(t("labels.date"))}</th>
            <th class="amount">${escapeHtml(t("liquiditaet.movement"))}</th>
            <th class="amount">${escapeHtml(t("liquiditaet.balance"))}</th>
          </tr>
        </thead>
        <tbody>
          ${verlauf.map((punkt) => `
            <tr>
              <td>${escapeHtml(formatDate(punkt.datum))}${punkt.bezeichnung ? ` · ${escapeHtml(punkt.bezeichnung)}` : ""}</td>
              <td class="amount">${escapeHtml(formatMoney(punkt.bewegung_cents))}</td>
              <td class="amount">${escapeHtml(formatMoney(punkt.saldo_cents))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function renderLiquiditaet() {
  const { antwort: modell, fehler } = liquiditaetAntwort(heuteIso());
  if (!modell) {
    return `
    ${renderPageHead(t("liquiditaet.title"), t("liquiditaet.lead"))}
    <section class="panel panel-pad"><p class="muted" role="status">${escapeHtml(fehler ? `${t("liquiditaet.loadFailed")} (${fehler.message})` : t("liquiditaet.loading"))}</p></section>`;
  }
  const { ist, prognose } = modell;
  return `
    ${renderPageHead(t("liquiditaet.title"), t("liquiditaet.lead"))}
    <div class="kachel-paare kachel-paare-oben">
      ${istKachel(ist, modell.verlauf)}
      ${prognoseKachel(prognose, modell.zahlungen)}
    </div>
    ${modell.trend.monate.length ? `
    <div class="kachel-paare section-spacing">
      ${trendKachel("einnahmen", modell.trend)}
      ${trendKachel("ausgaben", modell.trend)}
    </div>
    ${klappKachel({ id: "liquiditaet.kategorienTrend", titel: `${t("liquiditaet.kategorienTrend")} · ${tf("liquiditaet.trendStandTitel", { datum: formatDate(modell.trend.bis) })}`, inhalt: kategorienTrendTabelle(modell.trend), offen: false, klasse: "section-spacing" })}` : `<p class="muted section-spacing">${escapeHtml(t("liquiditaet.trendLeer"))}</p>`}
    ${klappKachel({ id: "liquiditaet.bewegungen", titel: `${t("liquiditaet.ist")} · ${t("liquiditaet.monthlyTable")}`, inhalt: renderSaldoVerlauf(ist.monatsverlauf, "liquiditaet.emptyIst"), offen: false, klasse: "section-spacing" })}
    ${klappKachel({ id: "liquiditaet.prognose", titel: `${t("liquiditaet.prognose")} · ${t("liquiditaet.forecastTable")}`, kopfExtra: granKnoepfe(), inhalt: renderLiquiditaetPrognoseDetail(prognose), offen: false, klasse: "section-spacing" })}
    <p class="page-lead section-note">${escapeHtml(t("liquiditaet.incompleteNote"))}</p>
  `;
}

function granKnoepfe() {
  return `<span>${["monat", "quartal", "jahr"]
    .map((g) => `<button class="chip ${state.liquiditaet.granularitaet === g ? "success" : "neutral"} linkish" data-liquiditaet-gran="${g}">${escapeHtml(t(`liquiditaet.gran.${g}`))}</button>`)
    .join("")}</span>`;
}

// Heute: Saldo der liquiden Konten, Verlauf der letzten zwoelf Monatsenden,
// darunter der Stand je Konto.
function istKachel(ist, verlauf) {
  const chipKlasse = ist.qualitaet.fehlende_anker > 0 ? "review" : "success";
  // Trend der letzten sechs Monate (gleitende Regression): Steigung je Monat mit
  // Pfeil; unter 100 Euro je Monat gilt er als seitwaerts.
  const jeMonat = verlauf.at(-1)?.steigung_cents ?? null;
  const pfeil = jeMonat === null ? "" : Math.abs(jeMonat) < 10000 ? "→" : jeMonat > 0 ? "↗" : "↘";
  const notiz = [
    `<span class="chip ${chipKlasse}">${iconSvg(chipKlasse)}${escapeHtml(String(ist.qualitaet.fehlende_anker))} ${escapeHtml(t("liquiditaet.qualityMissingAnchors"))}</span>`,
    jeMonat === null ? "" : `<span class="liquiditaet-trend-notiz">${escapeHtml(tf("liquiditaet.trendNotiz", { pfeil, betrag: `${jeMonat > 0 ? "+" : ""}${geldOhneCent(jeMonat)}` }))}</span>`,
  ].join(" ");
  // Grosse Buchungen erklaeren die Spruenge: am Monat ein Marker mit ihrer
  // Summe in Tausend (kurz, damit sich nichts ueberlagert), im Hover jede mit
  // Tag, kurzer Bezeichnung und Betrag.
  const tagMonat = (iso) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.`;
  const spalten = monatsAchse(verlauf.map((p) => p.monat)).map((sp, i) => ({
    ...sp,
    zusatz: verlauf[i].grosse.map((g) => ({ klasse: "keine", label: `${tagMonat(g.datum)} ${g.label}`, wert: formatMoney(g.betrag_cents) })),
  }));
  const ereignisse = verlauf.flatMap((p, i) => {
    if (!p.grosse.length) return [];
    const summe = p.grosse.reduce((a, g) => a + g.betrag_cents, 0);
    return [{ pos: i + 0.5, label: `${summe > 0 ? "+" : ""}${tausend(summe)}` }];
  });
  const unten = zeitverlaufKlein({
    spalten,
    ereignisse,
    // Belegt durchgezogen, zurueckgerechnet gestrichelt; der erste belegte
    // Monat nach einer Rueckrechnung gehoert zu beiden, damit die Linie anschliesst.
    serien: [
      { klasse: "liquiditaet-linie", teil: true, label: t("liquiditaet.balance"), werte: verlauf.map((p) => (p.modelliert ? null : p.saldo_cents)) },
      ...(verlauf.some((p) => p.modelliert) ? [{
        klasse: "liquiditaet-linie liquiditaet-modelliert",
        teil: true,
        label: `${t("liquiditaet.balance")} (${t("liquiditaet.modelliert")})`,
        werte: verlauf.map((p, i) => (p.modelliert || verlauf[i - 1]?.modelliert || verlauf[i + 1]?.modelliert ? p.saldo_cents : null)),
      }] : []),
      { klasse: "liquiditaet-trend-linie", label: t("liquiditaet.trend"), werte: verlauf.map((p) => p.trend_cents) },
    ],
    formatWert: (c) => formatMoney(c),
    formatAchse: geldOhneCent,
    labelSchritt: 1,
    ariaLabel: t("liquiditaet.verlaufIst"),
  });
  const zeilen = [...ist.konten]
    .sort((a, b) => (b.saldo_cents ?? -Infinity) - (a.saldo_cents ?? -Infinity))
    .map((k) => kachelZeile(`<button class="linkish" data-action="account-transactions" data-account="${escapeHtml(k.konto_id)}" title="${escapeHtml(k.name)}">${escapeHtml(k.name)}</button>`, k.saldo_cents === null ? "—" : formatMoney(k.saldo_cents)));
  const modelliert = verlauf.some((p) => p.modelliert)
    ? `<span title="${escapeHtml(t("liquiditaet.modelliertHinweis"))}"><i class="legende-linie liquiditaet-linie liquiditaet-modelliert"></i>${escapeHtml(t("liquiditaet.modelliert"))}</span>`
    : "";
  const legende = unten ? `<div class="vermoegen-legende liquiditaet-legende"><span><i class="legende-linie liquiditaet-linie"></i>${escapeHtml(t("liquiditaet.balance"))}</span>${modelliert}<span><i class="legende-linie liquiditaet-trend-linie"></i>${escapeHtml(t("liquiditaet.trend"))}</span></div>` : "";
  return kennzahlKachel({ label: t("liquiditaet.ist"), wert: escapeHtml(geldOhneCent(ist.saldo_cents)), notiz, zeilen, unten: unten + legende });
}

// Einnahmen bzw. Ausgaben im Trend: Wert ist das Mittel der letzten zwoelf
// Monate (wie die Kachel der Uebersicht), der Pfeil vergleicht mit den zwoelf
// davor. Im Verlauf blass die Monatswerte, kraeftig das gleitende Mittel;
// darunter die fuenf groessten Kategorien mit ihrem Pfeil.
const TREND_TOP = 5;
const kategorieLink = (k, trend) => `<button class="linkish" data-action="kategorie-transactions" data-kategorie="${escapeHtml(k.kategorie_id)}" data-von="${escapeHtml(trend.von)}" data-bis="${escapeHtml(trend.bis)}" title="${escapeHtml(k.name)}">${escapeHtml(k.name)}</button>`;

// Stand (Ende des letzten voll belegten Monats) und die beiden verglichenen
// Zeitraeume, etwa "Stand 30.09.2026 · Okt. 2025 – Sept. 2026 gegen Okt. 2024 – Sept. 2025".
function trendStand(trend) {
  const z = trend.vergleich?.zeitraum;
  const werte = { datum: formatDate(trend.bis), zeitraum: trendZeitraumText(trend.von, trend.bis) };
  return z ? tf("liquiditaet.trendStand", { ...werte, vorher: trendZeitraumText(z.vorher_von, z.vorher_bis) }) : tf("liquiditaet.trendStandOhneVorjahr", werte);
}

function trendKachel(seite, trend) {
  const mehrIstGut = seite === "einnahmen";
  const v = trend.vergleich?.[seite];
  const zeitraum = trend.vergleich?.zeitraum;
  const reihe = trend[seite];
  const notiz = `${v
    ? `${trendPfeil(v.summe, { mehrIstGut, zeitraum })} <span class="muted">${escapeHtml(tf("liquiditaet.trendVorjahr", { betrag: geldOhneCent(v.summe.vorher_cents) }))}</span>`
    : `<span class="muted">${escapeHtml(t("liquiditaet.trendOhneVorjahr"))}</span>`}<span class="trend-stand muted">${escapeHtml(trendStand(trend))}</span>`;
  // Jeder Monat fuehrt in seine laufenden Buchungen, nach Kategorie summiert
  // (so rechnet auch der Trend: Saldo je Kategorie und Monat).
  const spalten = monatsAchse(trend.monate).map((s, i) => ({
    ...s,
    href: `#/transaktionen${filterAlsQuery({ ...LEERE_FILTER, timeMode: "month", month: trend.monate[i], klasse: "laufend", gruppe: "kategorie" })}`,
    linkLabel: tf("transactions.spalteBuchungen", { monat: formatMonth(trend.monate[i]) }),
  }));
  const unten = zeitverlaufKlein({
    spalten,
    serien: [
      { klasse: "trend-monat-linie", label: t("liquiditaet.trendMonat"), werte: reihe.monat_cents },
      { klasse: `trend-mittel-linie trend-${seite}`, label: t("liquiditaet.trendMittel"), werte: reihe.mittel_cents },
    ],
    formatWert: (c) => formatMoney(c),
    formatAchse: geldOhneCent,
    labelSchritt: 1,
    ariaLabel: `${t(`liquiditaet.trendSeite.${seite}`)}: ${t("liquiditaet.trendVerlauf")}`,
  });
  const legende = unten ? `<div class="vermoegen-legende liquiditaet-legende"><span><i class="legende-linie trend-mittel-linie trend-${seite}"></i>${escapeHtml(t("liquiditaet.trendMittel"))}</span><span><i class="legende-linie trend-monat-linie"></i>${escapeHtml(t("liquiditaet.trendMonat"))}</span></div>` : "";
  const zeilen = trend.kategorien[seite].slice(0, TREND_TOP).map((k) => kachelZeile(
    `${kategorieLink(k, trend)}${trendPfeil(v?.kategorien[k.kategorie_id], { mehrIstGut, kurz: true, ohneSeitwaerts: true, zeitraum })}`,
    geldOhneCent(k.mittel_cents.at(-1)),
  ));
  return kennzahlKachel({
    label: t(seite === "einnahmen" ? "liquiditaet.trendEinnahmen" : "liquiditaet.trendAusgaben"),
    info: t("liquiditaet.trendInfo"),
    wert: `${escapeHtml(geldOhneCent(reihe.mittel_cents.at(-1)))} <span class="betrag-einheit">${escapeHtml(t("vorsorge.jeMonat"))}</span>`,
    notiz,
    unten: unten + legende,
    zeilen,
  });
}

// Alle Kategorien im Trend, je Seite nach Groesse: Mittel der letzten zwoelf
// Monate, Mittel der zwoelf davor, Veraenderung mit Pfeil und eine Minikurve
// des gleitenden Mittels.
function kategorienTrendTabelle(trend) {
  const zeilen = (seite) => {
    const mehrIstGut = seite === "einnahmen";
    const vergleich = trend.vergleich?.[seite]?.kategorien ?? {};
    return trend.kategorien[seite].map((k) => {
      const v = vergleich[k.kategorie_id];
      return `
        <tr>
          <td>${kategorieLink(k, trend)}</td>
          <td class="amount">${escapeHtml(geldOhneCent(k.mittel_cents.at(-1)))}</td>
          <td class="amount">${v ? escapeHtml(geldOhneCent(v.vorher_cents)) : "—"}</td>
          <td class="amount">${v ? trendPfeil(v, { mehrIstGut, zeitraum: trend.vergleich.zeitraum }) : "—"}</td>
          <td class="trend-kurve-zelle">${miniKurve(k.mittel_cents, { klasse: `trend-${seite}`, ariaLabel: `${k.name}: ${t("liquiditaet.trendVerlauf")}` })}</td>
        </tr>`;
    }).join("");
  };
  const kopf = (seite) => `<tr class="row-period"><th colspan="5" scope="colgroup">${escapeHtml(t(`liquiditaet.trendSeite.${seite}`))}</th></tr>`;
  const sp = (key) => escapeHtml(t(`liquiditaet.trendSpalte.${key}`));
  // Die Spalten nennen ihre zwoelf Monate; darueber Stand und Vergleich.
  const z = trend.vergleich?.zeitraum;
  const spalteZeitraum = (von, bis) => escapeHtml(tf("liquiditaet.trendSpalteZeitraum", { zeitraum: trendZeitraumText(von, bis) }));
  return `
    <p class="muted trend-stand-tabelle">${escapeHtml(trendStand(trend))}</p>
    <div class="table-wrap">
      <table class="trend-tabelle">
        <thead>
          <tr>
            <th>${sp("kategorie")}</th>
            <th class="amount">${spalteZeitraum(trend.von, trend.bis)}</th>
            <th class="amount">${z ? spalteZeitraum(z.vorher_von, z.vorher_bis) : sp("vorher")}</th>
            <th class="amount">${sp("aenderung")}</th>
            <th>${sp("verlauf")}</th>
          </tr>
        </thead>
        <tbody>${kopf("einnahmen")}${zeilen("einnahmen")}${kopf("ausgaben")}${zeilen("ausgaben")}</tbody>
      </table>
    </div>`;
}

// Prognose: Stand am Horizont, Verlauf je Monatsende bis dahin, darunter die
// naechsten grossen Zahlungen (jaehrliche Abfluesse der naechsten drei Monate).
function prognoseKachel(prognose, zahlungen) {
  const q = prognose.qualitaet;
  const notiz = [
    `<span class="chip neutral">${escapeHtml(String(q.bestaetigte_regelzahlungen))} ${escapeHtml(t("liquiditaet.qualityConfirmed"))}</span>`,
    q.vorschlaege_nicht_enthalten > 0 ? `<span class="chip review">${iconSvg("review")}${escapeHtml(String(q.vorschlaege_nicht_enthalten))} ${escapeHtml(t("liquiditaet.qualityProposalsExcluded"))}</span>` : "",
    q.unbefristete_regelzahlungen > 0 ? `<span class="chip neutral">${escapeHtml(String(q.unbefristete_regelzahlungen))} ${escapeHtml(t("liquiditaet.qualityOpenEnded"))}</span>` : "",
  ].join("");
  const grafik = `
    <label class="liquiditaet-bis">${escapeHtml(t("liquiditaet.forecastUntil"))}
      <input type="date" data-control="liquiditaet-bis" value="${escapeHtml(state.liquiditaet.bisDatum)}" />
    </label>`;
  const monate = prognose.perioden.flatMap((p) => p.monate);
  const unten = monate.length > 1 ? zeitverlaufKlein({
    spalten: monatsAchse(monate.map((m) => m.monat)),
    serien: [{ klasse: "liquiditaet-prognose-linie", label: t("liquiditaet.balance"), werte: monate.map((m) => m.saldo_cents) }],
    formatWert: (c) => formatMoney(c),
    formatAchse: geldOhneCent,
    labelSchritt: monate.length > 24 ? null : 1,
    ariaLabel: t("liquiditaet.verlaufPrognose"),
  }) : "";
  const zeilen = zahlungen.map(({ datum, regelzahlung: rz }) => kachelZeile(
    `<a class="linkish" href="${escapeHtml(zielRoute("open-regelzahlung", rz.regelzahlung_id))}" data-action="open-regelzahlung" data-regelzahlung="${escapeHtml(rz.regelzahlung_id)}" title="${escapeHtml(rz.bezeichnung)}">${escapeHtml(rz.bezeichnung)}</a>`,
    formatMoney(toCents(rz.betrag)),
    formatDate(datum),
  ));
  const liste = zeilen.length ? [`<li class="muted">${escapeHtml(t("liquiditaet.naechsteZahlungen"))}</li>`, ...zeilen] : [];
  return kennzahlKachel({
    label: tf("liquiditaet.prognoseBis", { datum: formatDate(prognose.horizont_ende) }),
    wert: escapeHtml(geldOhneCent(prognose.end_saldo_cents)),
    notiz,
    zeilen: liste,
    grafik,
    unten,
  });
}

function formatMonat(monat) {
  return fmt().monat(monat);
}

function formatPeriode(periode) {
  if (periode.includes("-Q")) {
    const [jahr, q] = periode.split("-");
    return `${q} ${jahr}`;
  }
  if (/^\d{4}$/.test(periode)) return periode;
  return formatMonat(periode);
}

function laufendMarkup(istLaufend) {
  if (!istLaufend) return "";
  return `<span class="chip neutral">${escapeHtml(t("liquiditaet.running"))}</span><div class="running-note muted">${escapeHtml(t("liquiditaet.runningNote"))}</div>`;
}

function renderLiquiditaetPostenRows(posten) {
  return posten.map((p) => `
    <tr class="row-posten">
      <td class="posten-cell">${escapeHtml(formatDate(p.datum))} · ${p.regelzahlung_id ? `<a class="linkish" href="${escapeHtml(zielRoute("open-regelzahlung", p.regelzahlung_id))}" data-action="open-regelzahlung" data-regelzahlung="${escapeHtml(p.regelzahlung_id)}">${escapeHtml(p.bezeichnung)}</a>` : escapeHtml(p.bezeichnung)}</td>
      <td class="amount">${escapeHtml(formatMoney(p.bewegung_cents))}</td>
      <td class="amount">${escapeHtml(formatMoney(p.saldo_cents))}</td>
    </tr>
  `).join("");
}

function renderLiquiditaetMonatRows(monat, nested) {
  const expanded = state.liquiditaetExpanded.has(monat.monat);
  const monthRow = `
    <tr class="row-month ${nested ? "nested" : ""}">
      <td>
        <button class="row-toggle" data-liquiditaet-toggle="${escapeHtml(monat.monat)}">
          <span class="toggle-icon">${expanded ? iconSvg("chevronDown") : iconSvg("chevronRight")}</span>${escapeHtml(formatMonat(monat.monat))}
        </button>
        ${laufendMarkup(monat.ist_laufend)}
      </td>
      <td class="amount">${escapeHtml(formatMoney(monat.bewegung_cents))}</td>
      <td class="amount">${escapeHtml(formatMoney(monat.saldo_cents))}</td>
    </tr>
  `;
  return monthRow + (expanded ? renderLiquiditaetPostenRows(monat.posten) : "");
}

function renderLiquiditaetPrognoseDetail(prognose) {
  if (!prognose.perioden.length) return `<p class="muted">${escapeHtml(t("liquiditaet.emptyForecast"))}</p>`;
  const gran = state.liquiditaet.granularitaet;
  const body = prognose.perioden.map((periode) => {
    if (gran === "monat") {
      return periode.monate.map((monat) => renderLiquiditaetMonatRows(monat, false)).join("");
    }
    const expanded = state.liquiditaetExpanded.has(periode.periode);
    const periodRow = `
      <tr class="row-period">
        <td>
          <button class="row-toggle" data-liquiditaet-toggle="${escapeHtml(periode.periode)}">
            <span class="toggle-icon">${expanded ? iconSvg("chevronDown") : iconSvg("chevronRight")}</span>${escapeHtml(formatPeriode(periode.periode))}
          </button>
          ${laufendMarkup(periode.ist_laufend)}
        </td>
        <td class="amount">${escapeHtml(formatMoney(periode.bewegung_cents))}</td>
        <td class="amount">${escapeHtml(formatMoney(periode.saldo_cents))}</td>
      </tr>
    `;
    const monatsZeilen = expanded ? periode.monate.map((monat) => renderLiquiditaetMonatRows(monat, true)).join("") : "";
    return periodRow + monatsZeilen;
  }).join("");
  return `
    <div class="table-wrap">
      <table class="liquiditaet-detail">
        <thead>
          <tr>
            <th>${escapeHtml(t("liquiditaet.period"))}</th>
            <th class="amount">${escapeHtml(t("liquiditaet.movement"))}</th>
            <th class="amount">${escapeHtml(t("liquiditaet.balance"))}</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

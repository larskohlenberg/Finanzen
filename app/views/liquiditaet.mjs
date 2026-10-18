// app/views/liquiditaet.mjs
// Liquiditaets-Ansicht im Aufbau der Bereichsseiten: oben zwei Kacheln (heute
// mit den letzten zwoelf Monaten, Prognose bis zum Horizont), darunter die
// Tabellen als zugeklappte Kacheln.
import { data, state, t, escapeHtml } from "../runtime.mjs";
import { iconSvg } from "../icons.js";
import { formatMoney, formatDate, formatMonth, renderPageHead, heuteIso, kennzahlKachel, kachelZeile, zeitverlaufKlein, klappKachel } from "../komponenten.mjs";
import { anstehendeJahreszahlungen, computeLiquiditaetIst, computeLiquiditaetPrognoseDetail, liquiditaetVerlauf, toCents } from "../liquiditaet.mjs";

const geldOhneCent = (c) => new Intl.NumberFormat(state.lang === "en" ? "en-GB" : "de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(c / 100);
const tf = (key, werte) => Object.entries(werte).reduce((text, [k, v]) => text.replaceAll(`{${k}}`, String(v)), t(key));
// Kurzer Monatsname als Achsenbeschriftung, im Januar mit Jahr.
const monatKurz = (monat) => {
  const name = new Intl.DateTimeFormat(state.lang === "de" ? "de-DE" : "en-US", { month: "short" }).format(new Date(`${monat}-01T00:00:00`));
  return monat.endsWith("-01") ? monat.slice(0, 4) : name.replace(".", "");
};
// Kurzbetrag in Tausend Euro mit hoechstens einer Nachkommastelle ("-20 T€", "+4,8 T€").
const tausend = (c) => `${new Intl.NumberFormat(state.lang === "en" ? "en-GB" : "de-DE", { maximumFractionDigits: 1 }).format(c / 100000)} ${state.lang === "en" ? "k€" : "T€"}`;
const monatsAchse = (monate) => monate.map((m) => ({ label: monatKurz(m), titel: formatMonth(m) }));

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
  const today = heuteIso();
  const ist = computeLiquiditaetIst(data, { today });
  const prognose = computeLiquiditaetPrognoseDetail(data, {
    today,
    horizonEnd: state.liquiditaet.bisDatum,
    granularitaet: state.liquiditaet.granularitaet,
  });
  return `
    ${renderPageHead(t("liquiditaet.title"), t("liquiditaet.lead"))}
    <div class="kachel-paare kachel-paare-oben">
      ${istKachel(ist, today)}
      ${prognoseKachel(prognose, today)}
    </div>
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
function istKachel(ist, today) {
  const chipKlasse = ist.qualitaet.fehlende_anker > 0 ? "review" : "success";
  const notiz = `<span class="chip ${chipKlasse}">${iconSvg(chipKlasse)}${escapeHtml(String(ist.qualitaet.fehlende_anker))} ${escapeHtml(t("liquiditaet.qualityMissingAnchors"))}</span>`;
  const verlauf = liquiditaetVerlauf(data, today);
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
    serien: [{ klasse: "liquiditaet-linie", label: t("liquiditaet.balance"), werte: verlauf.map((p) => p.saldo_cents) }],
    formatWert: (c) => formatMoney(c),
    formatAchse: geldOhneCent,
    labelSchritt: 1,
    ariaLabel: t("liquiditaet.verlaufIst"),
  });
  const zeilen = [...ist.konten]
    .sort((a, b) => (b.saldo_cents ?? -Infinity) - (a.saldo_cents ?? -Infinity))
    .map((k) => kachelZeile(`<button class="linkish" data-action="account-transactions" data-account="${escapeHtml(k.konto_id)}" title="${escapeHtml(k.name)}">${escapeHtml(k.name)}</button>`, k.saldo_cents === null ? "—" : formatMoney(k.saldo_cents)));
  return kennzahlKachel({ label: t("liquiditaet.ist"), wert: escapeHtml(formatMoney(ist.saldo_cents)), notiz, zeilen, unten });
}

// Prognose: Stand am Horizont, Verlauf je Monatsende bis dahin, darunter die
// naechsten grossen Zahlungen (jaehrliche Abfluesse der naechsten drei Monate).
function prognoseKachel(prognose, today) {
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
  const zahlungen = anstehendeJahreszahlungen(data.regelzahlungen, today, 3);
  const zeilen = zahlungen.map(({ datum, regelzahlung: rz }) => kachelZeile(
    `<button class="linkish" data-action="open-regelzahlung" data-regelzahlung="${escapeHtml(rz.regelzahlung_id)}" title="${escapeHtml(rz.bezeichnung)}">${escapeHtml(rz.bezeichnung)}</button>`,
    formatMoney(toCents(rz.betrag)),
    formatDate(datum),
  ));
  const liste = zeilen.length ? [`<li class="muted">${escapeHtml(t("liquiditaet.naechsteZahlungen"))}</li>`, ...zeilen] : [];
  return kennzahlKachel({
    label: tf("liquiditaet.prognoseBis", { datum: formatDate(prognose.horizont_ende) }),
    wert: escapeHtml(formatMoney(prognose.end_saldo_cents)),
    notiz,
    zeilen: liste,
    grafik,
    unten,
  });
}

function formatMonat(monat) {
  return new Intl.DateTimeFormat(state.lang === "de" ? "de-DE" : "en-US", { month: "long", year: "numeric" }).format(new Date(`${monat}-01T00:00:00`));
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
      <td class="posten-cell">${escapeHtml(formatDate(p.datum))} · ${escapeHtml(p.bezeichnung)}</td>
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

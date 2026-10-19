// app/views/plan-ist.mjs
// Seite Plan & Ist: was laut Regelzahlungen geplant war gegen das, was gebucht
// wurde, ueber den ganzen Bestand. Oben die Auswahl (Granularitaet Jahr, Quartal,
// Monat und ein Zeitraum daraus, dazu "Gesamter Bestand" und "Letzte 12 Monate"
// wie die Kacheln der Uebersicht) und die Darstellung (Ø je Monat oder Summe).
// Darunter drei Kennzahlen (Einnahmen, Ausgaben, Sparquote) mit dem Verlauf je
// Zeitraum, dann klappbare Kacheln: Verlauf als Tabelle (Zeile waehlt den
// Zeitraum), Einnahmen und Ausgaben je Kategorie (aufklappbar: Regelzahlungen,
// Einzelposten ab 400 Euro, Sprung in die Buchungen), Sparen und die Termine von
// Regelzahlungen ohne zugeordnete Buchung. Gerechnet wird in app/plan-ist.mjs.
import { state, t, tf, fmt, escapeHtml } from "../runtime.mjs";
import { zielRoute } from "../routing.mjs";
import { formatDate, formatMonth, heuteIso, infoTipp, kennzahlKachel, kachelZeile, klappKachel, renderPageHead, zeitverlaufKlein } from "../komponenten.mjs";
import { perioden } from "../plan-ist.mjs";
import { erstelleApiCache } from "../api-daten.mjs";

// Plan und Ist rechnet der App-Server (GET /api/v1/plan-ist, Modell in
// app/plan-ist-modell.mjs); hier wird nur gezeichnet. Die Darstellung
// (Ø je Monat oder Summe) teilt hier die Summen.
const cache = erstelleApiCache({ maxEintraege: 12 });

function planIstAntwort(heute) {
  const suche = new URLSearchParams();
  if (state.dataMode === "demo") suche.set("quelle", "demo");
  suche.set("heute", heute);
  if (state.planIst.periode) suche.set("periode", state.planIst.periode);
  suche.set("granularitaet", state.planIst.granularitaet);
  return cache.hole(`./api/v1/plan-ist?${suche}`);
}

const geld = (c) => fmt().geldGanz(c);
const prozent = (q) => fmt().prozent(q);
const mitVorzeichen = (c) => `${c > 0 ? "+" : c < 0 ? "−" : "±"}${geld(Math.abs(c))}`;

// Abweichung Ist − Plan, gefaerbt nach Wirkung: bei Einnahmen und Sparen ist
// mehr gut, bei Ausgaben weniger. Unter einem Euro neutral.
export function abweichungHtml(ist, plan, { mehrIstGut = true } = {}) {
  const diff = ist - plan;
  const klasse = Math.abs(diff) < 100 ? "abw-neutral" : (diff > 0) === mehrIstGut ? "abw-gut" : "abw-schlecht";
  return `<span class="${klasse}">${escapeHtml(mitVorzeichen(diff))}</span>`;
}

// Zeitraum-Name: Jahr "2026", Quartal "Q2 2026", Monat "Mai 2026".
function periodeName(schluessel) {
  if (!schluessel) return t("planIst.gesamt");
  if (schluessel === "12m") return t("planIst.letzte12");
  if (/^\d{4}$/.test(schluessel)) return schluessel;
  if (/-Q\d$/.test(schluessel)) return `${schluessel.slice(5)} ${schluessel.slice(0, 4)}`;
  return formatMonth(schluessel);
}

function zeitraumText(r) {
  if (!r.anzahl_monate) return "";
  const monate = tf(r.anzahl_monate === 1 ? "planIst.einMonat" : "planIst.monate", { n: r.anzahl_monate });
  return `${formatMonth(r.monate[0])}${r.anzahl_monate > 1 ? ` – ${formatMonth(r.monate.at(-1))}` : ""} · ${monate}`;
}

export function renderPlanIst() {
  const { antwort: modell, fehler } = planIstAntwort(heuteIso());
  if (!modell) {
    return `
    ${renderPageHead(t("planIst.title"), t("planIst.lead"))}
    <section class="panel panel-pad"><p class="muted" role="status">${escapeHtml(fehler ? `${t("planIst.loadFailed")} (${fehler.message})` : t("planIst.loading"))}</p>
      ${fehler && state.planIst.periode ? `<button class="linkish" data-action="plan-ist-periode" data-periode="">${escapeHtml(t("planIst.gesamt"))}</button>` : ""}</section>`;
  }
  const { alle, r } = modell;
  const auswahl = state.planIst.periode;
  const jeMonat = state.planIst.darstellung !== "summe";
  const wert = (c) => (jeMonat && r.anzahl_monate ? Math.round(c / r.anzahl_monate) : c);
  const einheit = jeMonat ? ` <span class="betrag-einheit">${escapeHtml(t("vorsorge.jeMonat"))}</span>` : "";
  const kopf = renderPageHead(t("planIst.title"), t("planIst.lead"));
  if (!alle.length) return `${kopf}<p class="muted">${escapeHtml(t("planIst.leer"))}</p>`;

  const verlauf = modell.verlauf;
  const ziel = (von, bis) => `data-von="${escapeHtml(von)}" data-bis="${escapeHtml(bis)}"`;
  return `
    ${kopf}
    ${auswahlLeiste(alle)}
    <p class="page-lead section-note">${escapeHtml(periodeName(auswahl))} · ${escapeHtml(zeitraumText(r))}${infoTipp(t("planIst.info"))}</p>
    <div class="kachel-dreier">
      ${kennzahl({ label: t("planIst.einnahmen"), ist: wert(r.einnahmen.ist_cents), plan: wert(r.einnahmen.plan_cents), einheit, mehrIstGut: true, verlauf, feld: (x) => [x.einnahmen.ist_cents, x.einnahmen.plan_cents] })}
      ${kennzahl({ label: t("planIst.ausgaben"), ist: wert(r.ausgaben.ist_cents), plan: wert(r.ausgaben.plan_cents), einheit, mehrIstGut: false, verlauf, feld: (x) => [x.ausgaben.ist_cents, x.ausgaben.plan_cents], zusatz: r.ausgaben.einzel_cents ? tf("planIst.davonEinzel", { betrag: geld(wert(r.ausgaben.einzel_cents)) }) : "" })}
      ${sparquoteKachel(r, wert, einheit, verlauf)}
    </div>
    ${klappKachel({ id: "planIst.verlauf", titel: t("planIst.verlaufTitel"), kopfExtra: granKnoepfe(), inhalt: verlaufTabelle(verlauf), klasse: "section-spacing" })}
    ${klappKachel({ id: "planIst.einnahmen", titel: t("planIst.einnahmenKategorien"), inhalt: kategorieTabelle(r.einnahmen, { wert, mehrIstGut: true, ziel: ziel(r.von, r.bis), einzel: false }), klasse: "section-spacing" })}
    ${klappKachel({ id: "planIst.ausgaben", titel: t("planIst.ausgabenKategorien"), inhalt: kategorieTabelle(r.ausgaben, { wert, mehrIstGut: false, ziel: ziel(r.von, r.bis), einzel: true }), klasse: "section-spacing" })}
    ${klappKachel({ id: "planIst.sparen", titel: t("planIst.sparenTitel"), inhalt: sparTabelle(r, wert), klasse: "section-spacing" })}
    ${klappKachel({ id: "planIst.luecken", titel: `${t("planIst.lueckenTitel")} (${r.luecken.length})`, inhalt: lueckenListe(r), offen: false, klasse: "section-spacing" })}
  `;
}

// Auswahl: Granularitaet als Chips, Zeitraum als Liste (neueste zuerst),
// Darstellung Ø je Monat oder Summe.
function auswahlLeiste(alle) {
  const gran = state.planIst.granularitaet;
  const optionen = [
    ["", t("planIst.gesamt")],
    ["12m", t("planIst.letzte12")],
    ...perioden(alle, gran).reverse().map((p) => [p.schluessel, `${periodeName(p.schluessel)}${p.vollstaendig ? "" : ` (${t("planIst.angeschnitten")})`}`]),
  ];
  const chip = (aktiv, attr, text) => `<button class="chip ${aktiv ? "success" : "neutral"} linkish" ${attr}>${escapeHtml(text)}</button>`;
  return `
    <div class="plan-ist-leiste">
      <span class="plan-ist-gruppe">${["jahr", "quartal", "monat"].map((g) => chip(gran === g, `data-action="plan-ist-gran" data-gran="${g}"`, t(`planIst.gran.${g}`))).join("")}</span>
      <label class="plan-ist-gruppe"><span class="muted">${escapeHtml(t("planIst.zeitraum"))}</span>
        <select data-control="plan-ist-periode">${optionen.map(([v, text]) => `<option value="${escapeHtml(v)}"${v === state.planIst.periode ? " selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select>
      </label>
      <span class="plan-ist-gruppe">${["monat", "summe"].map((d) => chip((state.planIst.darstellung || "monat") === d, `data-action="plan-ist-darstellung" data-darstellung="${d}"`, t(`planIst.darstellung.${d}`))).join("")}</span>
    </div>`;
}

function granKnoepfe() {
  return `<span>${["jahr", "quartal", "monat"]
    .map((g) => `<button class="chip ${state.planIst.granularitaet === g ? "success" : "neutral"} linkish" data-action="plan-ist-gran" data-gran="${g}">${escapeHtml(t(`planIst.gran.${g}`))}</button>`)
    .join("")}</span>`;
}

// Flacher Verlauf je Zeitraum. Betraege als Ø je Monat, damit angeschnittene
// Zeitraeume vergleichbar bleiben; Quoten (in Prozent) unveraendert.
function verlaufGrafik(verlauf, feld, { quote = false } = {}) {
  if (verlauf.length < 2) return "";
  // Hoechstens sechs Beschriftungen, sonst wird es in der Kachel eng.
  const schritt = Math.ceil(verlauf.length / 6);
  const werte = (i) => verlauf.map((p) => {
    const v = feld(p.r)[i];
    return v === null || quote ? v : Math.round(v / p.monate.length);
  });
  const format = quote ? (v) => `${v} %` : geld;
  const svg = zeitverlaufKlein({
    spalten: verlauf.map((p, i) => ({ label: i % schritt === 0 ? periodeName(p.schluessel) : "", titel: periodeName(p.schluessel) })),
    serien: [
      { klasse: "liquiditaet-linie", label: t("planIst.ist"), werte: werte(0) },
      { klasse: "liquiditaet-trend-linie", label: t("planIst.plan"), werte: werte(1) },
    ],
    formatWert: format,
    formatAchse: format,
    labelSchritt: 1,
    ariaLabel: t("planIst.verlaufTitel"),
  });
  return svg ? `${svg}<div class="vermoegen-legende liquiditaet-legende"><span><i class="legende-linie liquiditaet-linie"></i>${escapeHtml(t("planIst.ist"))}</span><span><i class="legende-linie liquiditaet-trend-linie"></i>${escapeHtml(t("planIst.plan"))}</span></div>` : "";
}

function kennzahl({ label, ist, plan, einheit, mehrIstGut, verlauf, feld, zusatz = "" }) {
  const notiz = `${escapeHtml(t("planIst.plan"))} ${escapeHtml(geld(plan))} · ${abweichungHtml(ist, plan, { mehrIstGut })}${zusatz ? ` · <span class="muted">${escapeHtml(zusatz)}</span>` : ""}`;
  return kennzahlKachel({ label, wert: `${escapeHtml(geld(ist))}${einheit}`, notiz, unten: verlaufGrafik(verlauf, feld) });
}

function sparquoteKachel(r, wert, einheit, verlauf) {
  const { ist, plan } = r.sparen;
  const quoteDiff = ist.quote !== null && plan.quote !== null ? Math.round((ist.quote - plan.quote) * 100) : null;
  const klasse = quoteDiff === null || quoteDiff === 0 ? "abw-neutral" : quoteDiff > 0 ? "abw-gut" : "abw-schlecht";
  const notiz = `${escapeHtml(t("planIst.plan"))} ${escapeHtml(prozent(plan.quote))}${quoteDiff === null ? "" : ` · <span class="${klasse}">${quoteDiff > 0 ? "+" : quoteDiff < 0 ? "−" : "±"}${Math.abs(quoteDiff)} ${escapeHtml(t("planIst.prozentpunkte"))}</span>`}`;
  const zeilen = [
    kachelZeile(escapeHtml(t("planIst.ueberschuss")), `${geld(wert(ist.ueberschuss_cents))} / ${geld(wert(plan.ueberschuss_cents))}`),
    kachelZeile(escapeHtml(t("overview.sparziel.depot")), `${geld(wert(ist.depot_cents))} / ${geld(wert(plan.depot_cents))}`),
    kachelZeile(escapeHtml(t("overview.sparziel.versicherung")), `${geld(wert(ist.versicherung_cents))} / ${geld(wert(plan.versicherung_cents))}`),
    kachelZeile(escapeHtml(t("overview.sparziel.liquide")), `${geld(wert(ist.liquide_cents))} / ${geld(wert(plan.liquide_cents))}`),
  ];
  const quoteFeld = (x) => [x.sparen.ist.quote === null ? null : Math.round(x.sparen.ist.quote * 100), x.sparen.plan.quote === null ? null : Math.round(x.sparen.plan.quote * 100)];
  return kennzahlKachel({
    label: t("planIst.sparquote"),
    info: t("planIst.sparquoteInfo"),
    wert: escapeHtml(prozent(ist.quote)),
    notiz,
    zeilen: [`<li><span class="muted">${escapeHtml(t("planIst.istSlashPlan"))}${einheit ? ` ${escapeHtml(t("vorsorge.jeMonat"))}` : ""}</span></li>`, ...zeilen],
    unten: verlaufGrafik(verlauf, quoteFeld, { quote: true }),
  });
}

// Verlauf als Tabelle, neueste Zeitraeume zuerst; die Zeile waehlt den Zeitraum.
function verlaufTabelle(verlauf) {
  const zelle = (ist, plan, mehrIstGut) => `<td class="amount">${escapeHtml(geld(ist))}</td><td class="amount muted">${escapeHtml(geld(plan))}</td><td class="amount">${abweichungHtml(ist, plan, { mehrIstGut })}</td>`;
  const mittel = (c, p) => (state.planIst.darstellung === "summe" ? c : Math.round(c / p.monate.length));
  return `
    <div class="table-wrap">
      <table class="plan-ist-tabelle">
        <thead>
          <tr><th rowspan="2">${escapeHtml(t("planIst.zeitraum"))}</th><th colspan="3" class="amount">${escapeHtml(t("planIst.einnahmen"))}</th><th colspan="3" class="amount">${escapeHtml(t("planIst.ausgaben"))}</th><th colspan="3" class="amount">${escapeHtml(t("planIst.ueberschuss"))}</th><th colspan="2" class="amount">${escapeHtml(t("planIst.sparquote"))}</th></tr>
          <tr>${[1, 2, 3].map(() => `<th class="amount">${escapeHtml(t("planIst.ist"))}</th><th class="amount">${escapeHtml(t("planIst.plan"))}</th><th class="amount">${escapeHtml(t("planIst.abw"))}</th>`).join("")}<th class="amount">${escapeHtml(t("planIst.ist"))}</th><th class="amount">${escapeHtml(t("planIst.plan"))}</th></tr>
        </thead>
        <tbody>
          ${[...verlauf].reverse().map((p) => `
            <tr class="${p.schluessel === state.planIst.periode ? "is-selected" : ""}">
              <td><button class="linkish" data-action="plan-ist-periode" data-periode="${escapeHtml(p.schluessel)}">${escapeHtml(periodeName(p.schluessel))}</button>${p.vollstaendig ? "" : ` <span class="muted">(${escapeHtml(t("planIst.angeschnitten"))})</span>`}</td>
              ${zelle(mittel(p.r.einnahmen.ist_cents, p), mittel(p.r.einnahmen.plan_cents, p), true)}
              ${zelle(mittel(p.r.ausgaben.ist_cents, p), mittel(p.r.ausgaben.plan_cents, p), false)}
              ${zelle(mittel(p.r.sparen.ist.ueberschuss_cents, p), mittel(p.r.sparen.plan.ueberschuss_cents, p), true)}
              <td class="amount">${escapeHtml(prozent(p.r.sparen.ist.quote))}</td><td class="amount muted">${escapeHtml(prozent(p.r.sparen.plan.quote))}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
    <p class="muted plan-ist-hinweis">${escapeHtml(t(state.planIst.darstellung === "summe" ? "planIst.verlaufSumme" : "planIst.verlaufMittel"))}</p>`;
}

// Kategorien mit Ist, Plan, Abweichung; bei Ausgaben dazu die Einzelposten ab
// 400 Euro und die Abweichung ohne sie. Aufgeklappt: Regelzahlungen mit Plan
// und Gebuchtem, die Einzelposten und der Sprung in die Buchungen.
function kategorieTabelle(seite, { wert, mehrIstGut, ziel, einzel }) {
  if (!seite.kategorien.length) return `<p class="muted">${escapeHtml(t("planIst.keineKategorien"))}</p>`;
  const spalten = einzel ? 6 : 4;
  const zeilen = seite.kategorien.map((k) => {
    const offen = state.planIstOffen.has(k.key);
    const name = `${escapeHtml(k.name)}${k.richtung ? ` <span class="muted">(${escapeHtml(t(k.richtung === "+" ? "planIst.gutschriften" : "planIst.belastungen"))})</span>` : ""}`;
    const kopf = `
      <tr class="plan-ist-kategorie">
        <td><button type="button" class="linkish plan-ist-auf" data-action="plan-ist-zeile" data-zeile="${escapeHtml(k.key)}" aria-expanded="${offen}">${offen ? "▾" : "▸"} ${name}</button></td>
        <td class="amount">${escapeHtml(geld(wert(k.ist_cents)))}</td>
        <td class="amount muted">${escapeHtml(geld(wert(k.plan_cents)))}</td>
        <td class="amount">${abweichungHtml(wert(k.ist_cents), wert(k.plan_cents), { mehrIstGut })}</td>
        ${einzel ? `<td class="amount muted">${k.einzel_cents ? escapeHtml(geld(wert(k.einzel_cents))) : ""}</td><td class="amount">${k.einzel_cents ? abweichungHtml(wert(k.ist_cents - k.einzel_cents), wert(k.plan_cents), { mehrIstGut }) : ""}</td>` : ""}
      </tr>`;
    if (!offen) return kopf;
    const rz = k.regelzahlungen.map((z) => `
      <li><a class="linkish" href="${escapeHtml(zielRoute("open-regelzahlung", z.regelzahlung_id))}" data-action="open-regelzahlung" data-regelzahlung="${escapeHtml(z.regelzahlung_id)}" title="${escapeHtml(z.bezeichnung)}">${escapeHtml(z.bezeichnung)}</a>
        <span class="muted">${escapeHtml(z.konto_id ? tf("planIst.termineGebucht", { termine: z.termine, gebucht: z.gebucht_anzahl }) : t("planIst.konsumplan"))}</span>
        <span class="amount">${escapeHtml(geld(wert(Math.abs(z.plan_cents))))}${z.konto_id ? ` / ${escapeHtml(geld(wert(Math.abs(z.gebucht_cents))))}` : ""}</span></li>`).join("");
    const posten = k.einzel_buchungen.map((b) => `
      <li><a class="linkish" href="#/transaktionen/${encodeURIComponent(b.transaktion_id)}">${escapeHtml(formatDate(b.datum))} · ${escapeHtml(b.gegenpartei || t("planIst.ohneGegenpartei"))}</a><span class="amount">${escapeHtml(geld(Math.abs(b.betrag_cents)))}</span></li>`).join("");
    const detail = `
      <tr class="plan-ist-detail"><td colspan="${spalten}">
        ${rz ? `<h4>${escapeHtml(t("planIst.regelzahlungen"))} <span class="muted">${escapeHtml(t("planIst.planSlashGebucht"))}</span></h4><ul class="plan-ist-liste">${rz}</ul>` : `<p class="muted">${escapeHtml(t("planIst.keineRegelzahlung"))}</p>`}
        ${posten ? `<h4>${escapeHtml(t("planIst.einzelposten"))}</h4><ul class="plan-ist-liste">${posten}</ul>` : ""}
        <button class="linkish" data-action="kategorie-transactions" data-kategorie="${escapeHtml(k.kategorie_id)}" ${ziel}>${escapeHtml(t("planIst.buchungenZeigen"))}</button>
      </td></tr>`;
    return kopf + detail;
  }).join("");
  const summe = `
      <tr class="plan-ist-summe"><td>${escapeHtml(t("planIst.summe"))}</td>
        <td class="amount">${escapeHtml(geld(wert(seite.ist_cents)))}</td>
        <td class="amount muted">${escapeHtml(geld(wert(seite.plan_cents)))}</td>
        <td class="amount">${abweichungHtml(wert(seite.ist_cents), wert(seite.plan_cents), { mehrIstGut })}</td>
        ${einzel ? `<td class="amount muted">${seite.einzel_cents ? escapeHtml(geld(wert(seite.einzel_cents))) : ""}</td><td class="amount">${seite.einzel_cents ? abweichungHtml(wert(seite.ist_cents - seite.einzel_cents), wert(seite.plan_cents), { mehrIstGut }) : ""}</td>` : ""}
      </tr>`;
  return `
    <div class="table-wrap">
      <table class="plan-ist-tabelle">
        <thead><tr><th>${escapeHtml(t("planIst.kategorie"))}</th><th class="amount">${escapeHtml(t("planIst.ist"))}</th><th class="amount">${escapeHtml(t("planIst.plan"))}</th><th class="amount">${escapeHtml(t("planIst.abw"))}</th>${einzel ? `<th class="amount">${escapeHtml(t("planIst.davonEinzelKurz"))}${infoTipp(t("planIst.einzelInfo"))}</th><th class="amount">${escapeHtml(t("planIst.abwOhneEinzel"))}</th>` : ""}</tr></thead>
        <tbody>${zeilen}${summe}</tbody>
      </table>
    </div>`;
}

function sparTabelle(r, wert) {
  const { ist, plan } = r.sparen;
  const zeile = (name, i, p, mehrIstGut = true) => `<tr><td>${name}</td><td class="amount">${escapeHtml(geld(wert(i)))}</td><td class="amount muted">${escapeHtml(geld(wert(p)))}</td><td class="amount">${abweichungHtml(wert(i), wert(p), { mehrIstGut })}</td></tr>`;
  const kategorien = r.sparen.kategorien.map((k) => zeile(`<span class="plan-ist-einrueck">${escapeHtml(k.name)}</span>`, k.ist_cents, k.plan_cents)).join("");
  return `
    <div class="table-wrap">
      <table class="plan-ist-tabelle">
        <thead><tr><th></th><th class="amount">${escapeHtml(t("planIst.ist"))}</th><th class="amount">${escapeHtml(t("planIst.plan"))}</th><th class="amount">${escapeHtml(t("planIst.abw"))}</th></tr></thead>
        <tbody>
          ${zeile(escapeHtml(t("planIst.ueberschuss")), ist.ueberschuss_cents, plan.ueberschuss_cents)}
          ${zeile(escapeHtml(t("overview.sparziel.depot")), ist.depot_cents, plan.depot_cents)}
          ${zeile(escapeHtml(t("overview.sparziel.versicherung")), ist.versicherung_cents, plan.versicherung_cents)}
          ${kategorien}
          ${zeile(escapeHtml(t("overview.sparziel.liquide")), ist.liquide_cents, plan.liquide_cents)}
        </tbody>
      </table>
    </div>
    ${r.sondereffekte_cents || r.investitionen_cents ? `<p class="muted plan-ist-hinweis">${escapeHtml(tf("planIst.sondereffekte", { sonder: geld(wert(r.sondereffekte_cents)), invest: geld(wert(r.investitionen_cents)) }))}</p>` : ""}`;
}

function lueckenListe(r) {
  if (!r.luecken.length) return `<p class="muted">${escapeHtml(t("planIst.keineLuecken"))}</p>`;
  return `
    <p class="muted plan-ist-hinweis">${escapeHtml(t("planIst.lueckenErklaerung"))}</p>
    <ul class="plan-ist-liste">
      ${r.luecken.map((l) => `
        <li><a class="linkish" href="${escapeHtml(zielRoute("open-regelzahlung", l.regelzahlung_id))}" data-action="open-regelzahlung" data-regelzahlung="${escapeHtml(l.regelzahlung_id)}" title="${escapeHtml(l.bezeichnung)}">${escapeHtml(l.bezeichnung)}</a>
          <span class="muted">${escapeHtml(l.konto_name)} · ${escapeHtml(tf("planIst.fehlend", { n: l.fehlend.length, von: l.termine }))}: ${escapeHtml(l.fehlend.slice(0, 6).map(formatDate).join(", "))}${l.fehlend.length > 6 ? " …" : ""}</span></li>`).join("")}
    </ul>`;
}

// app/komponenten.mjs
// Geteilte, view-uebergreifende UI-Bausteine und Formatierer. Beziehen Zustand,
// i18n und Nachschlage-Maps aus runtime.mjs; kein view-spezifisches Wissen.
import { data, state, t, tf, fmt, escapeHtml, personenById, kategorienById } from "./runtime.mjs";
import { iconSvg } from "./icons.js";
import { linienDiagramm, saldoDiagramm, zeitstrahlDiagramm } from "./charts.mjs";
import { formatIban } from "./tools/lib/text.mjs";
import { heuteIso } from "./selektoren.mjs";
import { belegTextHtml } from "./belege.mjs";
import { dataModes } from "./data-loader.mjs";
import { kuerzel, kuerzelFarbe, logoVerzeichnis } from "./logos.mjs";
import { detailsAttr } from "./lebenszyklus.mjs";
import { vermoegenRoute } from "./vermoegen-routen.mjs";

let logoStand = null;
// Das von Buchungen geerbte Logo je Regelzahlung kommt mit den Grunddaten
// (regelzahlung_logos, stand.mjs).
function logos() {
  const { logos: liste, regelzahlungen, regelzahlung_logos: regelzahlungLogos } = data;
  if (logoStand?.liste !== liste || logoStand.regelzahlungen !== regelzahlungen || logoStand.regelzahlungLogos !== regelzahlungLogos) {
    logoStand = { liste, regelzahlungen, regelzahlungLogos, verzeichnis: logoVerzeichnis({ logos: liste, regelzahlungen, regelzahlungLogos }) };
  }
  return logoStand.verzeichnis;
}

// Kleines Logo vor einem Namen (Logo-Verzeichnis im Datenbestand, app/logos.mjs).
// Ohne passenden Eintrag ein Kuerzel in fester, aus dem Namen abgeleiteter
// Farbe. Das Kuerzel liegt immer darunter: laedt das Bild nicht, entfernt
// main.js es, und das Kuerzel bleibt sichtbar.
// groesse waehlt die Groessenklasse logo-<groesse> (styles.css): "tabelle" fuer
// Tabellenzeilen, "vergleich" fuer Listen in Kacheln. Vertragskarte und
// Vertragsdaten setzen die Groesse ueber ihren Rahmen.
export function logoMarke({ gegenpartei, regelzahlung, vorsorge, konto }, { groesse } = {}) {
  const verzeichnis = logos();
  const logo = regelzahlung ? verzeichnis.fuerRegelzahlung(regelzahlung)
    : vorsorge ? verzeichnis.fuerVorsorge(vorsorge)
      : konto ? verzeichnis.fuerKonto(konto)
        : verzeichnis.fuerGegenpartei(gegenpartei);
  const name = logo?.name ?? regelzahlung?.bezeichnung ?? vorsorge?.name ?? konto?.name ?? gegenpartei ?? "";
  if (!String(name).trim()) return "";
  const basis = (dataModes[data.metadata?.dataMode] ?? dataModes.live).basePath;
  const bild = logo ? `<img src="${escapeHtml(`${basis}/${logo.datei}`)}" alt="" loading="lazy" decoding="async">` : "";
  return `<span class="logo-marke${groesse ? ` logo-${groesse}` : ""} kuerzel-farbe-${kuerzelFarbe(name)}" aria-hidden="true">${escapeHtml(kuerzel(name))}${bild}</span>`;
}

// Logo plus Name als Einheit, Text vertikal zum Logo zentriert: bricht der
// Name um, bleibt das Logo links daneben. inhaltHtml ist bereits escaptes HTML.
export function mitLogo(quelle, inhaltHtml, optionen = {}) {
  const marke = logoMarke(quelle, optionen);
  return marke ? `<span class="mit-logo">${marke}<span>${inhaltHtml}</span></span>` : inhaltHtml;
}

// Exakt mit Cent: Tabellen und Details. Kacheln nehmen formatGeldGanz.
// "bekannter Teilbestand": Positionen ohne Wert zaehlen nicht mit (nicht als 0
// verstecken). Chip mit den Namen im Titel; "" ohne fehlende Positionen.
export function teilbestandChip(positionen) {
  const fehlend = (positionen ?? []).filter((p) => p.fehlt);
  if (!fehlend.length) return "";
  const titel = tf("vermoegen.uebersicht.teilbestandHinweis", { n: fehlend.length, namen: fehlend.map((p) => p.name).join(", ") });
  return `<span class="chip review teilbestand" title="${escapeHtml(titel)}">${iconSvg("review")}${escapeHtml(t("vermoegen.uebersicht.teilbestand"))}</span>`;
}

// Format fuer Pruefbefunde (check-texte.mjs): lokales Geld und Datum, Saetze
// aus i18n (checkText.*) in der Sprache der Oberflaeche.
export function checkFormat() {
  return {
    geld: formatMoney,
    datum: formatDate,
    vorlage: (schluessel) => {
      const text = t(`checkText.${schluessel}`);
      return text === `checkText.${schluessel}` ? undefined : text;
    },
  };
}

// Element zu einem Ziel aus Attributen (data-action/data-view ...): mit href
// ein echter Link, damit "In neuem Tab oeffnen" geht; sonst ein Knopf.
export function zielElement(attrs, innerHtml, { klasse = "linkish", title = "" } = {}) {
  const tag = /(^|\s)href="/.test(attrs) ? "a" : "button";
  return `<${tag} class="${klasse}" ${attrs}${title ? ` title="${escapeHtml(title)}"` : ""}>${innerHtml}</${tag}>`;
}

// href-Attribut (mit Leerzeichen dahinter) oder "" ohne Route.
export function hrefAttr(route) {
  return route ? `href="${escapeHtml(route)}" ` : "";
}

// Exakt mit Cent: Tabellen und Details. Kacheln nehmen formatGeldGanz.
export function formatMoney(amountInCents) {
  return fmt().geld(amountInCents);
}

// Auf ganze Euro gerundet: Kacheln, Kennzahlen, Achsen (docs/ui-regeln.md).
function formatGeldGanz(amountInCents) {
  return fmt().geldGanz(amountInCents);
}

export function formatDate(dateString) {
  return fmt().datum(dateString);
}

export function formatMonth(monthString) {
  return fmt().monat(monthString);
}

export function accountOwnerNames(konto) {
  return konto.inhaber_person_ids.map((id) => personenById.get(id)?.name || id).join(", ");
}

export function accountTypeLabel(type) {
  return t(`accountTypes.${type}`) || (type.charAt(0).toUpperCase() + type.slice(1));
}

export function categoryName(categoryId) {
  return kategorienById.get(categoryId)?.name || t("labels.noCategory");
}

// Deterministische Klartext-Erklaerung einer Regel aus ihren Feldern. Macht die
// Match-Semantik ("enthaelt", Gross-/Kleinschreibung egal) explizit, damit z.B.
// "amzn.mktp" nicht als Regex missverstanden wird. Reine Ableitung, kein Feld.
export function regelKlartext(regel, kategorieAufloesen = categoryName) {
  const teile = [];
  if (regel.gegenpartei_pattern) teile.push(`die Gegenpartei den Text »${regel.gegenpartei_pattern}« enthält`);
  if (regel.verwendungszweck_pattern) teile.push(`der Verwendungszweck den Text »${regel.verwendungszweck_pattern}« enthält`);
  if (regel.konto_id) teile.push(`die Buchung auf Konto ${regel.konto_id} liegt`);
  if (regel.vorzeichen === "ausgabe") teile.push(`es eine Ausgabe ist`);
  if (regel.vorzeichen === "einnahme") teile.push(`es eine Einnahme ist`);
  const bedingung = teile.length ? teile.join(" und ") : "die Buchung passt";
  return `Bucht auf ${kategorieAufloesen(regel.kategorie_id)}, wenn ${bedingung} (Groß-/Kleinschreibung egal).`;
}

export function herkunftLabel(tx) {
  if (tx.kategorie_herkunft === "regel") return "Regel";
  if (tx.kategorie_herkunft === "agent") return "Agent";
  if (tx.kategorie_herkunft === "manuell") return "Manuell";
  return "—";
}

export function statusChip(status) {
  const className = status === "offen" ? "review" : status === "bestaetigt" ? "success" : "neutral";
  const icon = status === "offen" ? "review" : status === "bestaetigt" ? "success" : "neutral";
  return `<span class="chip ${className}">${iconSvg(icon)}${escapeHtml(t(`status.${status}`))}</span>`;
}

export function renderPageHead(title, lead, extra = "") {
  return `
    <div class="page-head">
      <div>
        ${extra}
        <h1 class="page-title" tabindex="-1" data-fokus="seitentitel">${escapeHtml(title)}</h1>
        <p class="page-lead">${escapeHtml(lead)}</p>
      </div>
    </div>
  `;
}

// Quellfeld (rohquelle, quelle_hinweis) als HTML: Text escaped, enthaltene
// Belege/...-Pfade als Link "Quelldokument" auf die Dokumente-Ansicht.
export function quelleHtml(text) {
  return belegTextHtml(text, { titel: t("dokumente.quelldokument"), escape: escapeHtml });
}

// Bemerkung als strukturierter Text (Schreibregel: app/docs/agent-context.md, "Bemerkungen"):
// Leerzeile trennt Bloecke; eine kurze Zeile mit Doppelpunkt am Ende ist eine
// Zwischenueberschrift; Zeilen mit "- " sind Aufzaehlungen, mit zwei Leerzeichen
// eingerueckt Unterpunkte; alles andere ist Absatz. Belegpfade werden zu Links.
export function bemerkungInhalt(text) {
  const inline = (zeile) => quelleHtml(zeile.trim());
  const istPunkt = (zeile) => /^\s*- /.test(zeile);
  const tiefe = (zeile) => (zeile.match(/^\s*/)[0].length >= 2 ? 1 : 0);
  const liste = (zeilen) => {
    let html = "<ul>";
    let offenesLi = false;
    let unter = [];
    const unterSchliessen = () => {
      if (unter.length) html += `<ul>${unter.map((u) => `<li>${inline(u.replace(/^\s*- /, ""))}</li>`).join("")}</ul>`;
      unter = [];
    };
    for (const zeile of zeilen) {
      if (tiefe(zeile) && offenesLi) { unter.push(zeile); continue; }
      unterSchliessen();
      if (offenesLi) html += "</li>";
      html += `<li>${inline(zeile.replace(/^\s*- /, ""))}`;
      offenesLi = true;
    }
    unterSchliessen();
    return `${html}${offenesLi ? "</li>" : ""}</ul>`;
  };
  return String(text ?? "").replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((block) => {
    const zeilen = block.split("\n").filter((z) => z.trim());
    let html = "";
    let absatz = [];
    let punkte = [];
    const flush = () => {
      if (absatz.length) html += `<p>${absatz.map(inline).join("<br>")}</p>`;
      if (punkte.length) html += liste(punkte);
      absatz = [];
      punkte = [];
    };
    zeilen.forEach((zeile, i) => {
      const kurz = zeile.trim();
      if (istPunkt(zeile)) {
        if (absatz.length) { html += `<p>${absatz.map(inline).join("<br>")}</p>`; absatz = []; }
        punkte.push(zeile);
      } else if (i === 0 && kurz.endsWith(":") && kurz.length <= 60) {
        html += `<h4>${inline(kurz.slice(0, -1))}</h4>`;
      } else {
        if (punkte.length) { html += liste(punkte); punkte = []; }
        absatz.push(zeile);
      }
    });
    flush();
    return html;
  }).join("");
}

// Klappbare Kachel fuer grosse Detail-Abschnitte (Designregel, docs/ui-regeln.md): der Titel ist der Knopf, zugeklappt rendert sie keinen Inhalt. Der Zustand
// je id gilt seitenuebergreifend bis zum Neuladen; ohne Eintrag gilt `offen` als Standard.
// kopfExtra (z. B. ein Umschalter) steht rechts im Kopf und nur bei offener Kachel.
// htmlId: optionaler Anker (id-Attribut), z. B. als Sprungziel.
export function klappKachel({ id, titel, inhalt, offen = true, kopfExtra = "", klasse = "", htmlId = "" }) {
  const istOffen = state.klappKacheln?.[id] ?? offen;
  return `
    <section class="panel panel-pad klapp-panel ${istOffen ? "" : "zu"} ${klasse}"${htmlId ? ` id="${escapeHtml(htmlId)}"` : ""}>
      <div class="klapp-kopf">
        <h2 class="section-title"><button type="button" class="klapp-knopf" data-action="klapp-kachel" data-kachel="${escapeHtml(id)}" data-standard="${offen}" aria-expanded="${istOffen}">${iconSvg(istOffen ? "chevronDown" : "chevronRight")}<span>${escapeHtml(titel)}</span></button></h2>
        ${istOffen ? kopfExtra : ""}
      </div>
      ${istOffen ? inhalt : ""}
    </section>`;
}

// Kachel gezielt oeffnen, z. B. wenn ein Link in sie hineinspringt.
export function oeffneKlappKachel(id) {
  if (id) state.klappKacheln = { ...state.klappKacheln, [id]: true };
}

export function toggleKlappKachel(id, standard = true) {
  if (!id) return;
  state.klappKacheln = { ...state.klappKacheln, [id]: !(state.klappKacheln?.[id] ?? standard) };
}

// Kennzahl-Kachel der Bereichsseiten (Vorsorge, Vermoegen, Liquiditaet), immer
// gleich gebaut: Label, Wert, Notiz; grafik (Donut) rechts neben dem Wert;
// unten ein flacher Zeitverlauf; darunter die Aufschluesselung (zeilen aus
// kachelZeile), damit die Summe ohne Rechnen aufgeht. wert und notiz sind HTML;
// info (Text) erscheint als Infosymbol hinter dem Label mit Erklaerung beim Hovern.
export function kennzahlKachel({ label, wert, notiz = "", zeilen = [], grafik = "", unten = "", info = "" }) {
  return `
      <section class="panel panel-pad vorsorge-kopf-kz">
        <div class="${grafik ? "vorsorge-kopf-mit-grafik" : ""}">
          <div>
            <div class="muted">${escapeHtml(label)}${info ? infoTipp(info) : ""}</div>
            <div class="vorsorge-kopf-wert">${wert}</div>
            ${notiz ? `<div class="kpi-note">${notiz}</div>` : ""}
          </div>
          ${grafik}
        </div>
        ${unten}
        ${zeilen.length ? `<ul class="vorsorge-kopf-liste">${zeilen.join("")}</ul>` : ""}
      </section>`;
}

// Kleines "i" mit Erklaerung, sichtbar bei Hover und Tastaturfokus (reines CSS).
export function infoTipp(text) {
  return `<span class="info-tipp" tabindex="0" aria-label="${escapeHtml(text)}">i<span class="info-tipp-text" role="tooltip">${escapeHtml(text)}</span></span>`;
}

export const farbPunkt = (klasse) => `<i class="farbpunkt ${klasse}" aria-hidden="true"></i>`;

// Eine Zeile der Aufschluesselung: Link (HTML), Zusatz und Betrag als Text.
export function kachelZeile(linkHtml, betrag, zusatz = "", farbe = "") {
  return `<li>${farbe ? farbPunkt(farbe) : ""}${linkHtml}${zusatz ? `<span class="muted">${escapeHtml(zusatz)}</span>` : ""}<span class="amount">${escapeHtml(betrag)}</span></li>`;
}

// Pfeil des Jahresvergleichs (trendVergleich aus uebersicht-rechnung.mjs):
// letzte zwoelf Monate gegen die zwoelf davor. Gruen, wenn die Richtung guenstig
// ist (mehrIstGut), sonst rot; seitwaerts grau oder (ohneSeitwaerts) gar nicht.
// kurz: nur der Pfeil, Veraenderung und Vorjahreswert stehen im Titel.
const PFEIL = { hoch: "↗", runter: "↘", seitwaerts: "→" };
function trendAenderungText(v) {
  return v.anteil !== null ? fmt().prozentMitVorzeichen(v.anteil) : fmt().geldMitVorzeichen(v.aenderung_cents);
}
// Zeitraum eines Fensters kurz ("Okt. 2025 – Sept. 2026"); von/bis als ISO-Datum.
export function trendZeitraumText(von, bis) {
  return von && bis ? `${fmt().monatJahrKurz(von)} – ${fmt().monatJahrKurz(bis)}` : "";
}
// zeitraum (mittelVergleich): nennt im Titel die zwoelf Vergleichsmonate.
export function trendPfeil(v, { mehrIstGut, kurz = false, ohneSeitwaerts = false, zeitraum = null } = {}) {
  if (!v || (ohneSeitwaerts && v.richtung === "seitwaerts")) return "";
  const klasse = v.richtung === "seitwaerts" ? "abw-neutral" : (v.richtung === "hoch") === mehrIstGut ? "abw-gut" : "abw-schlecht";
  const aenderung = trendAenderungText(v);
  const vorher = fmt().geldGanz(v.vorher_cents);
  const titel = zeitraum
    ? tf("trend.titelZeitraum", { aenderung, vorher, zeitraum: trendZeitraumText(zeitraum.vorher_von, zeitraum.vorher_bis) })
    : tf("trend.titel", { aenderung, vorher });
  return `<span class="trend-pfeil ${klasse}" title="${escapeHtml(titel)}" aria-label="${escapeHtml(titel)}">${PFEIL[v.richtung]}${kurz ? "" : ` ${escapeHtml(aenderung)}`}</span>`;
}

// Flacher Zeitverlauf fuer eine halbe Kachelbreite (Optionen wie zeitstrahlDiagramm).
export function zeitverlaufKlein(optionen) {
  const svg = zeitstrahlDiagramm({ breite: 560, plotHoehe: 90, ...optionen });
  return svg ? `<div class="diagramm-wrap kachel-zeitverlauf">${svg}</div>${diagrammTabelle(optionen)}` : "";
}

// Gleichwertige Tabelle zu einem Verlaufsdiagramm (ohne Maus, Screenreader):
// aufklappbar unter dem Diagramm, je Spalte eine Zeile, je Serie eine Spalte.
// Serien, die nur Teile einer Linie sind (teil, z. B. belegt/zurueckgerechnet),
// stehen zusammen in einer Spalte.
function diagrammTabelle({ spalten, serien, formatWert = String, ariaLabel = "" }) {
  if (!spalten?.length || !serien?.length) return "";
  const gruppen = [];
  for (const s of serien) {
    const basis = s.teil ? gruppen.find((g) => g.teil) : null;
    if (basis) basis.werte = basis.werte.map((w, i) => w ?? s.werte[i]);
    else gruppen.push({ label: s.label, teil: Boolean(s.teil), werte: [...s.werte] });
  }
  const kopf = gruppen.map((g) => `<th class="amount">${escapeHtml(g.label)}</th>`).join("");
  const zeilen = spalten.map((sp, i) => `<tr><th scope="row">${escapeHtml(sp.titel ?? sp.label ?? "")}</th>${gruppen.map((g) => `<td class="amount">${g.werte[i] == null ? "—" : escapeHtml(formatWert(g.werte[i]))}</td>`).join("")}</tr>`).join("");
  return `
    <details class="diagramm-tabelle"${detailsAttr(`diagramm.${ariaLabel || spalten[0]?.titel || ""}`)}>
      <summary data-fokus="${escapeHtml(`diagramm.${ariaLabel}`)}">${escapeHtml(t("chrome.alsTabelle"))}</summary>
      <div class="table-wrap"><table${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ""}><thead><tr><th></th>${kopf}</tr></thead><tbody>${zeilen}</tbody></table></div>
    </details>`;
}

export function detailRow(label, valueHtml) {
  return `
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(label)}</div>
      <div class="detail-value">${valueHtml}</div>
    </div>`;
}

export { heuteIso };

// Marke der X-Achse je Art: "1.10." (tag), "Nov" (monat), "Jan 2027" (monatJahr), "2030" (jahr).
function formatAchsenMarke(isoDate, art) {
  const f = fmt();
  return ({ tag: f.tagMonat, monat: f.monatKurz, monatJahr: f.monatJahrKurz, jahr: f.jahr }[art] ?? f.monatKurz)(isoDate);
}

// Saldo-Punktserie als Liniendiagramm (Beträge in Cent). Tragen die Punkte ein
// Datum, wird es ein Saldo-Diagramm mit Achsen und Hover. Leere/zu kurze Serien
// liefern nichts — die zugehörige Tabelle bleibt die Quelle der Wahrheit.
export function saldoLinie(punkte, ariaLabel) {
  if (!punkte || punkte.length < 2) return "";
  const svg = punkte.every((p) => typeof p.datum === "string")
    ? saldoDiagramm(punkte, { formatWert: (cents) => formatMoney(cents), formatAchse: formatGeldGanz, formatTick: formatAchsenMarke, ariaLabel })
    : linienDiagramm(punkte, { formatWert: (cents) => formatMoney(cents), ariaLabel });
  return svg ? `<div class="diagramm-wrap">${svg}</div>` : "";
}

// Oben die Suche, darunter der Zeitraum. Dann entweder eine Zeile fields oder
// Gruppen (groups: [{ label, fields, klasse? }]), je Gruppe eine Zeile; der Titel ist nur
// fuer Screenreader. Aktive Filter (chips) stehen ueber der Trefferzeile.
export function renderTableFilters({ chips = "", searchFields = [], timeFields = [], fields = [], groups = [], filters, filterAttr, clearAction, resetAction, activeCount, resultCount, totalCount }) {
  const effectiveActiveCount = activeCount ?? Object.values(filters).filter(Boolean).length;
  const activeLabel = t(effectiveActiveCount === 1 ? "chrome.filterActiveOne" : "chrome.filterActiveOther");
  const hasResultCount = Number.isFinite(resultCount) && Number.isFinite(totalCount);
  const resetDisabled = effectiveActiveCount === 0;
  const feld = (liste) => liste.map((field) => renderFilterSelect({ ...field, filters, filterAttr, clearAction })).join("");
  return `
    <section class="filter-bar">
      ${searchFields.length || timeFields.length ? `
      <div class="filter-kopf">
        ${searchFields.length ? `
        <div class="filter-grid filter-search-row">
          ${feld(searchFields)}
        </div>` : ""}
        ${timeFields.length ? `
        <div class="filter-grid filter-time-row">
          ${feld(timeFields)}
        </div>` : ""}
      </div>` : ""}
      ${fields.length ? `
      <div class="filter-grid filter-primary-row">
        ${feld(fields)}
      </div>` : ""}
      ${groups.length ? `
      <div class="filter-gruppen">
        ${groups.map((gruppe, i) => `
        <div class="filter-grid filter-gruppe${gruppe.klasse ? ` ${escapeHtml(gruppe.klasse)}` : ""}" role="group" aria-label="${escapeHtml(gruppe.label)}">${feld(gruppe.fields)}</div>`).join("")}
      </div>` : ""}
      ${chips}
      ${hasResultCount || effectiveActiveCount > 0 ? `
        <div class="filter-actions">
          ${hasResultCount ? `<span class="filter-result-count">${escapeHtml(String(resultCount))} ${escapeHtml(t("chrome.of"))} ${escapeHtml(String(totalCount))} ${escapeHtml(t("chrome.hits"))}</span>` : ""}
          <span class="filter-reset-group ${resetDisabled ? "is-disabled" : ""}">
            <span class="filter-active-count">${effectiveActiveCount > 0 ? `${effectiveActiveCount} ${escapeHtml(activeLabel)}` : ""}</span>
            <button class="filter-reset" data-action="${escapeHtml(resetAction)}"${resetDisabled ? " disabled" : ""}>${iconSvg("clear")}${escapeHtml(t("chrome.clearAllFilters"))}</button>
          </span>
        </div>` : ""}
    </section>
  `;
}

function renderFilterSelect({ name, label, options, type, placeholder, filters, filterAttr, clearAction }) {
  const active = Boolean(filters[name]);
  const controlId = `${filterAttr}-${name}`;
  let control = "";
  if (type === "search") {
    control = `<input type="search" id="${escapeHtml(controlId)}" data-${escapeHtml(filterAttr)}="${escapeHtml(name)}" value="${escapeHtml(filters[name])}" placeholder="${escapeHtml(placeholder ?? "")}" autocomplete="off">`;
  } else if (type === "betrag") {
    control = `<input type="text" inputmode="decimal" id="${escapeHtml(controlId)}" data-${escapeHtml(filterAttr)}="${escapeHtml(name)}" value="${escapeHtml(filters[name])}" placeholder="0,00" autocomplete="off" pattern="\\d+([.,]\\d{1,2})?">`;
  } else if (type === "date") {
    control = `<input type="date" id="${escapeHtml(controlId)}" data-${escapeHtml(filterAttr)}="${escapeHtml(name)}" value="${escapeHtml(filters[name])}">`;
  } else {
    control = `<select id="${escapeHtml(controlId)}" data-${escapeHtml(filterAttr)}="${escapeHtml(name)}">
        ${options.map(([value, text]) => `<option value="${escapeHtml(value)}" ${filters[name] === value ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}
      </select>`;
  }
  return `
    <div class="filter-field ${active ? "active" : ""} ${type === "search" ? "filter-field-search" : ""}">
      <label for="${escapeHtml(controlId)}">${escapeHtml(label)}</label>
      <div class="filter-control-row">
        ${control}
        ${type === "search" && active ? `<button class="filter-clear" data-action="${escapeHtml(clearAction)}" data-filter-name="${escapeHtml(name)}" aria-label="${escapeHtml(t("chrome.clearFilter"))}" title="${escapeHtml(t("chrome.clearFilter"))}">${iconSvg("clear")}</button>` : ""}
      </div>
    </div>
  `;
}

// "8 von 9 belegt · ältester Stand 8.6.2026" — Abdeckung eines Tabellenblocks.
function accountGroupCoverage(gruppe) {
  const teile = [tf("overview.groupCoverage", { belegt: gruppe.belegt, gesamt: gruppe.gesamt })];
  if (gruppe.aeltester) teile.push(tf("overview.oldestStand", { datum: formatDate(gruppe.aeltester) }));
  return teile.join(" · ");
}

// Konten der Stammdaten zu den Ids einer API-Antwort, in deren Reihenfolge.
function kontenZuIds(ids) {
  const je = new Map((data.konten ?? []).map((k) => [k.konto_id, k]));
  return ids.map((id) => je.get(id)).filter(Boolean);
}

function accountTableHead(showId) {
  return `
        <thead>
          <tr>
            <th class="logo-zelle"><span class="sr-only">${escapeHtml(t("labels.logo"))}</span></th>
            ${showId ? `<th>${escapeHtml(t("labels.id"))}</th>` : ""}
            <th>${escapeHtml(t("labels.account"))}</th>
            <th>${escapeHtml(t("labels.accountReference"))}</th>
            <th>${escapeHtml(t("labels.owner"))}</th>
            <th>${escapeHtml(t("labels.type"))}</th>
            <th class="amount" title="${escapeHtml(t("labels.valueTodayHint"))}">${escapeHtml(t("labels.valueToday"))}</th>
            <th>${escapeHtml(t("labels.evidence"))}</th>
          </tr>
        </thead>`;
}

// tbody eines Kontenblocks; summeKey = Summenzeile mit Abdeckung.
function accountGroupBody(gruppe, kontenModell, { showId = false, rowAction = "account-transactions", summeKey = null, markNotIncluded = false } = {}) {
  const spalten = showId ? 8 : 7;
  const summe = summeKey
    ? `
        <tr class="table-sum">
          <td colspan="${spalten - 2}">${escapeHtml(t(summeKey))}</td>
          <td class="amount">${escapeHtml(formatMoney(gruppe.summe_cents))}</td>
          <td>${escapeHtml(accountGroupCoverage(gruppe))}</td>
        </tr>`
    : "";
  return `
        <tbody>
          ${renderAccountRows(kontenZuIds(gruppe.konto_ids), kontenModell, { showId, rowAction, markNotIncluded })}
          ${summe}
        </tbody>`;
}

// Bloecke der Uebersicht: je eine Kachel mit eigener Tabelle.
const ACCOUNT_GROUPS = [
  { schluessel: "konten", titelKey: "overview.accounts", summeKey: "overview.sumAccounts", markNotIncluded: true },
  { schluessel: "depots", titelKey: "overview.depots", summeKey: "overview.sumDepots" },
  { schluessel: "weitere", titelKey: "overview.otherAccounts", summeKey: null },
];

// Stammdaten: nur die angelegten Daten eines Kontos, ohne Werte und Belegstaende.
// kontenModell: Antwort von GET /api/v1/konten (Reihenfolge der Tabelle).
export function renderMasterAccountTable(kontenModell) {
  const rows = kontenZuIds(kontenModell.reihenfolge)
    .map((konto) => {
      const referenz = konto.kontoreferenz
        ? escapeHtml(formatIban(konto.kontoreferenz))
        : konto.kontotyp === "depot"
          ? `<span class="muted">—</span>`
          : `<span class="chip review">${iconSvg("review")}${escapeHtml(t("labels.referenceMissing"))}</span>`;
      return `
        <tr class="clickable" id="konto-${escapeHtml(konto.konto_id)}" data-action="select-master-account" data-account="${escapeHtml(konto.konto_id)}">
          <td class="logo-zelle">${logoMarke({ konto }, { groesse: "tabelle" })}</td>
          <td class="id-zelle">${escapeHtml(konto.konto_id)}</td>
          <td><a class="linkish zeilen-link" href="${escapeHtml(vermoegenRoute("konto", konto.konto_id))}" data-action="select-master-account" data-account="${escapeHtml(konto.konto_id)}">${escapeHtml(konto.name)}</a></td>
          <td>${referenz}</td>
          <td>${escapeHtml(accountOwnerNames(konto))}</td>
          <td>${escapeHtml(accountTypeLabel(konto.kontotyp))}</td>
          <td>${escapeHtml(t(konto.liquiditaetsrelevant ? "labels.yes" : "labels.no"))}</td>
          <td>${escapeHtml(t(`status.${konto.status}`))}</td>
        </tr>`;
    })
    .join("");
  return `
    <div class="table-wrap">
      <table class="master-account-table">
        <thead>
          <tr>
            <th class="logo-zelle"><span class="sr-only">${escapeHtml(t("labels.logo"))}</span></th>
            <th>${escapeHtml(t("labels.id"))}</th>
            <th>${escapeHtml(t("labels.account"))}</th>
            <th>${escapeHtml(t("labels.accountReference"))}</th>
            <th>${escapeHtml(t("labels.owner"))}</th>
            <th>${escapeHtml(t("labels.type"))}</th>
            <th>${escapeHtml(t("labels.liquidityRelevant"))}</th>
            <th>${escapeHtml(t("labels.status"))}</th>
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
  `;
}

// Uebersicht: je Block eine eigene Kachel mit eigener Tabelle.
// kontenModell: Antwort von GET /api/v1/konten (Bloecke und Werte je Konto).
export function renderAccountPanels(kontenModell, { rowAction = "account-transactions" } = {}) {
  const gruppen = kontenModell.gruppen;
  return ACCOUNT_GROUPS
    .filter((g) => gruppen[g.schluessel].konto_ids.length)
    .map((g) => `
        <section class="panel panel-pad">
          <h2 class="section-title">${escapeHtml(t(g.titelKey))}</h2>
          <div class="table-wrap">
            <table class="account-table">
              <colgroup><col class="col-logo"><col class="col-konto"><col class="col-referenz"><col class="col-inhaber"><col class="col-typ"><col class="col-wert"><col class="col-stand"></colgroup>
              ${accountTableHead(false)}${accountGroupBody(gruppen[g.schluessel], kontenModell, { rowAction, summeKey: g.summeKey, markNotIncluded: g.markNotIncluded })}
            </table>
          </div>
        </section>`)
    .join("");
}

function renderAccountRows(accounts, kontenModell, { showId = false, rowAction = "account-transactions", markNotIncluded = false } = {}) {
  return accounts
    .map((konto) => {
      const isDepot = konto.kontotyp === "depot";
      // Fehlt das Konto in der Antwort (sie ist noch die des vorigen Stands), ohne Wert.
      const zeile = kontenModell.konten[konto.konto_id]?.zeile ?? { wert_cents: null, basis: "" };
      const hatWert = zeile.wert_cents !== null;
      const balanceCell = hatWert
        ? escapeHtml(formatMoney(zeile.wert_cents))
        : `<span class="muted">—</span>`;
      const status = hatWert
        ? `${t(zeile.qualitaet === "belegt" ? "vermoegen.qualityBelegt" : "vermoegen.qualityGeschaetzt")} · ${formatDate(zeile.belegdatum)}${zeile.veraltet ? ` · ${t("labels.standOutdated")}` : ""}`
        : zeile.basis === "bar-ignoriert"
          ? t("labels.cashNotValued")
          : isDepot
            ? t("labels.depotValueMissing")
            : konto.kontoreferenz
              ? t("labels.accountStatusMissing")
              : t("labels.referenceMissing");
      const statusText = !hatWert && markNotIncluded ? `${status} · ${t("overview.notIncluded")}` : status;
      // Rot = kein Beleg (fehlt im Nettovermoegen), Gelb = belegt, aber veraltet.
      // Bargeld ist bewusst unbewertet: neutral, kein fehlender Beleg.
      const chipClass = zeile.basis === "bar-ignoriert" ? "neutral" : !hatWert ? "danger" : zeile.veraltet ? "review" : zeile.qualitaet === "belegt" ? "success" : "neutral";
      const chipIcon = chipClass === "danger" ? "review" : chipClass;
      const accountName = `<button class="linkish" data-action="${escapeHtml(rowAction)}" data-account="${escapeHtml(konto.konto_id)}">${escapeHtml(konto.name)}</button>`;
      return `
        <tr class="clickable ${konto.konto_id === state.selectedKonto ? "selected" : ""}" id="konto-${escapeHtml(konto.konto_id)}" data-action="${escapeHtml(rowAction)}" data-account="${escapeHtml(konto.konto_id)}">
          <td class="logo-zelle">${logoMarke({ konto }, { groesse: "tabelle" })}</td>
          ${showId ? `<td class="id-zelle">${escapeHtml(konto.konto_id)}</td>` : ""}
          <td>${accountName}</td>
          <td>${konto.kontoreferenz ? escapeHtml(formatIban(konto.kontoreferenz)) : `<span class="muted">—</span>`}</td>
          <td>${escapeHtml(accountOwnerNames(konto))}</td>
          <td>${escapeHtml(accountTypeLabel(konto.kontotyp))}</td>
          <td class="amount">${balanceCell}</td>
          <td><span class="chip ${chipClass}">${iconSvg(chipIcon)}${escapeHtml(statusText)}</span></td>
        </tr>
      `;
    })
    .join("");
}

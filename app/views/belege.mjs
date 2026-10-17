// app/views/belege.mjs
// Dokumente (#/dokumente): Finder-artige Sicht auf die Dateien unter Belege/.
// Links der Ordnerbaum, rechts die Dateiliste des gewaehlten Ordners (oder die
// Suchtreffer ueber alle Ordner), daneben das Detail mit Oeffnen/Herunterladen
// und den Datensaetzen, die auf die Datei verweisen. Die Liste liefert der
// App-Server (GET /api/belege); ohne ihn zeigt die Ansicht einen Hinweis.
// In der Oberflaeche heisst eine Datei "Dokument", nie "Beleg" (CONTEXT.md).
import { data, state, t, escapeHtml, kontenById, transaktionenById } from "../runtime.mjs";
import { renderPageHead, formatDate } from "../komponenten.mjs";
import { iconSvg } from "../icons.js";
import {
  BELEGE_WURZEL, baueBaum, belegSchluessel, dateiUrl, dokumentRoute, fasseTransaktionenZusammen,
  findeOrdner, formatGroesse, istBildTyp, kodierePfad, ordneZwillingeZu, sortiereDateien, sucheDateien,
  verweisAnzahl, verweisIndex, vorfahren,
} from "../belege.mjs";

const ansicht = {
  zustand: "unbekannt",
  dateien: [],
  nachPfad: new Map(),
  offen: new Set([BELEGE_WURZEL]),
  aufgeklapptFuer: null,
  sort: { key: "name", dir: "asc" },
  suche: "",
  zwillingeZeigen: false,
};

// Der Bestand wird einmal pro Seitenaufruf geladen (Neu laden = Page-Reload),
// also reicht ein einmal gebauter Verweis-Index.
let index = null;
function verweise() {
  index ??= verweisIndex(data);
  return index;
}
function verweisFuer(pfad) {
  return verweise().get(belegSchluessel(pfad));
}

const locale = () => (state.lang === "en" ? "en-GB" : "de-DE");

function formatTag(iso) {
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return "";
  return datum.toLocaleDateString(locale(), { dateStyle: "medium" });
}

function formatZeit(iso) {
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return "";
  return datum.toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" });
}

// --- Laden und Bedienung (von main.js aufgerufen) ------------------------------

export async function ladeBelege(aktualisiere) {
  ansicht.zustand = "laedt";
  try {
    const antwort = await fetch("./api/belege", { cache: "no-store" });
    const json = antwort.ok ? await antwort.json() : null;
    if (!Array.isArray(json?.dateien)) throw new Error("keine Belege-API");
    ansicht.dateien = ordneZwillingeZu(json.dateien);
    ansicht.nachPfad = new Map(ansicht.dateien.map((d) => [belegSchluessel(d.pfad), d]));
    ansicht.zustand = "ok";
  } catch {
    ansicht.dateien = [];
    ansicht.nachPfad = new Map();
    ansicht.zustand = "nicht-verfuegbar";
  }
  ansicht.aufgeklapptFuer = null;
  aktualisiere();
}

// Fuer andere Ansichten (Dokumente je Objekt auf der Vermoegensseite).
export function belegDateienStand() {
  return { zustand: ansicht.zustand, dateien: ansicht.dateien };
}

export function belegeBeiBedarfLaden(aktualisiere) {
  if (ansicht.zustand === "unbekannt") void ladeBelege(aktualisiere);
}

export function setBelegeSuche(wert) {
  ansicht.suche = String(wert ?? "");
}

export function setBelegeZwillinge(an) {
  ansicht.zwillingeZeigen = Boolean(an);
}

export function toggleBelegeSort(key) {
  ansicht.sort = ansicht.sort.key === key
    ? { key, dir: ansicht.sort.dir === "asc" ? "desc" : "asc" }
    : { key, dir: key === "geaendert" || key === "verknuepft" || key === "groesse" ? "desc" : "asc" };
}

// Ausschnitt je Objekt (Vorsorgevertrag, Immobilie, Darlehen): gewaehlter Ordner und
// zugeklappte Ordner, Schluessel ist die Objekt-ID.
const ausschnitt = { ordner: new Map(), zu: new Set() };

export function waehleAusschnittOrdner(schluessel, pfad) {
  ausschnitt.ordner.set(schluessel, pfad);
}

export function toggleAusschnittOrdner(schluessel, pfad) {
  const key = `${schluessel}|${pfad}`;
  if (ausschnitt.zu.has(key)) ausschnitt.zu.delete(key);
  else ausschnitt.zu.add(key);
}

// Dieselbe Ansicht wie #/dokumente (Ordnerbaum links, Dateitabelle rechts), aber nur
// mit den Dateien des Objekts. Startet im tiefsten gemeinsamen Ordner. Ein Klick auf
// eine Datei oeffnet sie in der Dokumentenansicht. Leer, wenn keine Datei bekannt ist.
export function renderDokumenteAusschnitt({ pfade, schluessel }) {
  const dateien = pfade.map((p) => ansicht.nachPfad.get(belegSchluessel(p))).filter((d) => d && !d.istZwilling);
  if (!dateien.length) return "";
  const baum = baueBaum(dateien);
  let start = baum;
  while (!start.dateien.length && start.ordner.length === 1) start = start.ordner[0];
  const gewaehlt = ausschnitt.ordner.get(schluessel);
  const ordner = (gewaehlt && findeOrdner(baum, gewaehlt)) || start;
  const ordnerAttr = (pfad) => `data-action="select-dok-ausschnitt-ordner" data-dok-ausschnitt="${escapeHtml(schluessel)}" data-beleg-ordner="${escapeHtml(pfad)}"`;
  const zeilen = sortiereDateien(ordner.dateien, ansicht.sort, (d) => verweisAnzahl(verweisFuer(d.pfad)));
  const kopf = `<p class="belege-kopf"><strong>${escapeHtml(ordner.pfad === BELEGE_WURZEL ? t("dokumente.title") : ordner.pfad.slice(BELEGE_WURZEL.length + 1))}</strong> <span class="muted">· ${ordner.dateien.length}</span></p>`;
  return `
    <div class="belege-browser belege-ausschnitt">
      <nav class="belege-baum" aria-label="${escapeHtml(t("dokumente.ordner"))}">
        <ul role="tree" class="belege-baum-liste">${renderOrdner(baum, ordner.pfad, schluessel)}</ul>
      </nav>
      <div class="belege-trenner" data-belege-trenner role="separator" aria-orientation="vertical" tabindex="0" aria-label="${escapeHtml(t("dokumente.trenner"))}" title="${escapeHtml(t("dokumente.trenner"))}"></div>
      <div class="belege-liste">
        ${kopf}
        ${zeilen.length || ordner.ordner.length ? renderTabelle({ zeilen, unterordner: ordner.ordner, ordnerAttr, zeileFn: renderAusschnittZeile, aktionen: true }) : `<p class="muted belege-leer">${escapeHtml(t("dokumente.ordnerLeer"))}</p>`}
      </div>
    </div>`;
}

export function toggleBelegeOrdner(pfad) {
  if (ansicht.offen.has(pfad)) ansicht.offen.delete(pfad);
  else ansicht.offen.add(pfad);
}

// Ordner der aktuellen Auswahl (fuer "Detail schliessen").
export function ordnerDerAuswahl(pfad) {
  const datei = ansicht.nachPfad.get(belegSchluessel(pfad));
  return datei ? datei.ordner : pfad;
}

// --- Rendering ------------------------------------------------------------------

export function renderBelege() {
  return `
    ${renderPageHead(t("dokumente.title"), t("dokumente.lead"))}
    ${renderInhalt()}
  `;
}

function hinweis(text, klasse = "muted") {
  return `<section class="panel panel-pad"><p class="${klasse}">${text}</p></section>`;
}

function renderInhalt() {
  if (ansicht.zustand === "nicht-verfuegbar") {
    return hinweis(`${iconSvg("review")}${escapeHtml(t("dokumente.apiFehlt"))} <button type="button" class="chip neutral linkish" data-action="belege-refresh">${escapeHtml(t("dokumente.aktualisieren"))}</button>`, "upload-hinweis-api");
  }
  if (ansicht.zustand !== "ok") return hinweis(escapeHtml(t("dokumente.laedt")));
  if (ansicht.dateien.length === 0) return hinweis(escapeHtml(t("dokumente.leer")));

  const sichtbar = ansicht.zwillingeZeigen ? ansicht.dateien : ansicht.dateien.filter((d) => !d.istZwilling);
  const baum = baueBaum(sichtbar);
  const auswahl = state.selectedBeleg || BELEGE_WURZEL;
  const datei = ansicht.nachPfad.get(belegSchluessel(auswahl));
  const ordnerPfad = datei ? datei.ordner : (findeOrdner(baum, auswahl) ? auswahl : BELEGE_WURZEL);
  if (ansicht.aufgeklapptFuer !== auswahl) {
    for (const pfad of vorfahren(ordnerPfad)) ansicht.offen.add(pfad);
    ansicht.aufgeklapptFuer = auswahl;
  }
  const ordner = findeOrdner(baum, ordnerPfad) ?? baum;

  return `
    <div class="layout-with-rail belege-layout ${datei ? "" : "rail-closed"}">
      <section class="panel belege-browser">
        <nav class="belege-baum" aria-label="${escapeHtml(t("dokumente.ordner"))}">
          <ul role="tree" class="belege-baum-liste">${renderOrdner(baum, ordnerPfad)}</ul>
        </nav>
        <div class="belege-trenner" data-belege-trenner role="separator" aria-orientation="vertical" tabindex="0" aria-label="${escapeHtml(t("dokumente.trenner"))}" title="${escapeHtml(t("dokumente.trenner"))}"></div>
        <div class="belege-liste">
          ${renderWerkzeuge()}
          ${renderDateien(sichtbar, ordner, datei)}
        </div>
      </section>
      ${datei ? renderDetail(datei) : ""}
    </div>
  `;
}

// Ordnerbaum; im Ausschnitt eines Objekts mit eigener Auswahl und eigenem Auf-/Zuklappen.
function renderOrdner(knoten, aktiverOrdner, aus = null) {
  const hatKinder = knoten.ordner.length > 0;
  const offen = hatKinder && (aus ? !ausschnitt.zu.has(`${aus}|${knoten.pfad}`) : ansicht.offen.has(knoten.pfad));
  const toggleAttr = aus
    ? `data-action="toggle-dok-ausschnitt-ordner" data-dok-ausschnitt="${escapeHtml(aus)}" data-beleg-ordner="${escapeHtml(knoten.pfad)}"`
    : `data-action="toggle-beleg-ordner" data-beleg-ordner="${escapeHtml(knoten.pfad)}"`;
  const waehlAttr = aus
    ? `data-action="select-dok-ausschnitt-ordner" data-dok-ausschnitt="${escapeHtml(aus)}" data-beleg-ordner="${escapeHtml(knoten.pfad)}"`
    : `data-action="select-beleg" data-beleg="${escapeHtml(knoten.pfad)}"`;
  const aktiv = knoten.pfad === aktiverOrdner;
  const toggleLabel = t(offen ? "dokumente.zuklappen" : "dokumente.aufklappen");
  return `
    <li role="treeitem" ${hatKinder ? `aria-expanded="${offen}"` : ""} aria-selected="${aktiv}">
      <div class="belege-ordner-zeile ${aktiv ? "aktiv" : ""}">
        ${hatKinder
          ? `<button type="button" class="belege-toggle" ${toggleAttr} aria-label="${escapeHtml(`${toggleLabel}: ${knoten.name}`)}" title="${escapeHtml(toggleLabel)}">${iconSvg(offen ? "chevronDown" : "chevronRight")}</button>`
          : `<span class="belege-toggle-platz"></span>`}
        <button type="button" class="belege-ordner-knopf" ${waehlAttr}${aktiv ? ` aria-current="true"` : ""}>
          ${iconSvg("folder")}<span class="belege-ordner-name" title="${escapeHtml(knoten.pfad === BELEGE_WURZEL ? t("dokumente.title") : knoten.name)}">${escapeHtml(knoten.pfad === BELEGE_WURZEL ? t("dokumente.title") : knoten.name)}</span>
          <span class="belege-anzahl">${knoten.anzahl}</span>
        </button>
      </div>
      ${offen ? `<ul role="group">${knoten.ordner.map((kind) => renderOrdner(kind, aktiverOrdner, aus)).join("")}</ul>` : ""}
    </li>`;
}

function renderWerkzeuge() {
  return `
    <div class="belege-werkzeuge">
      <div class="belege-suche filter-field ${ansicht.suche ? "active" : ""}">
        <label for="belege-suche">${escapeHtml(t("dokumente.suche"))}</label>
        <input type="search" id="belege-suche" data-belege-suche value="${escapeHtml(ansicht.suche)}" placeholder="${escapeHtml(t("dokumente.suchePlatzhalter"))}" autocomplete="off">
      </div>
      <label class="belege-schalter" for="belege-zwillinge">
        <input type="checkbox" id="belege-zwillinge" data-belege-zwillinge ${ansicht.zwillingeZeigen ? "checked" : ""}>
        <span>${escapeHtml(t("dokumente.zwillingeZeigen"))}</span>
      </label>
      <button type="button" class="chip neutral linkish" data-action="belege-refresh">${iconSvg("regelzahlungen")}${escapeHtml(t("dokumente.aktualisieren"))}</button>
    </div>`;
}

function sortKopf(key, labelKey, klasse = "") {
  const aktiv = ansicht.sort.key === key;
  const pfeil = aktiv ? (ansicht.sort.dir === "asc" ? " ▲" : " ▼") : "";
  const aria = aktiv ? ` aria-sort="${ansicht.sort.dir === "asc" ? "ascending" : "descending"}"` : "";
  return `<th${klasse ? ` class="${klasse}"` : ""}${aria}><button type="button" class="linkish sort-th" data-action="sort-belege" data-beleg-sort="${key}">${escapeHtml(t(labelKey))}${pfeil}</button></th>`;
}

function typText(typ) {
  return istBildTyp(typ) ? t("dokumente.typBild") : String(typ).toUpperCase();
}

function textZelle(d) {
  if (d.istZwilling) return `<span class="muted">${escapeHtml(t("dokumente.textzwilling"))}</span>`;
  if (d.textStatus === "durchsuchbar") return `<span class="chip success">${escapeHtml(t("dokumente.textDurchsuchbar"))}</span>`;
  if (d.textStatus === "ocr-ausstehend") return `<span class="chip review">${escapeHtml(t("dokumente.textOcrAusstehend"))}</span>`;
  return `<span class="muted">–</span>`;
}

function renderDateien(sichtbar, ordner, datei) {
  const suche = ansicht.suche.trim();
  const basis = suche ? sucheDateien(sichtbar, suche) : ordner.dateien;
  const zeilen = sortiereDateien(basis, ansicht.sort, (d) => verweisAnzahl(verweisFuer(d.pfad)));
  const kopf = suche
    ? `<p class="belege-kopf muted">${zeilen.length} ${escapeHtml(t("dokumente.treffer"))}</p>`
    : `<p class="belege-kopf"><strong>${escapeHtml(ordner.pfad === BELEGE_WURZEL ? t("dokumente.title") : ordner.pfad.slice(BELEGE_WURZEL.length + 1))}</strong> <span class="muted">· ${ordner.dateien.length}</span></p>`;
  // Wie im Finder: Unterordner stehen vor den Dateien des Ordners.
  const unterordner = suche ? [] : ordner.ordner;
  if (zeilen.length === 0 && unterordner.length === 0) {
    return `${kopf}<p class="muted belege-leer">${escapeHtml(t(suche ? "dokumente.keineTreffer" : "dokumente.ordnerLeer"))}</p>`;
  }
  return `${kopf}${renderTabelle({ zeilen, unterordner, suche, datei })}`;
}

// Dateitabelle des Ordners; ordnerAttr waehlt Unterordner (Standard: in der Dokumentenansicht).
function renderTabelle({ zeilen, unterordner, suche = "", datei = null, ordnerAttr = (pfad) => `data-action="select-beleg" data-beleg="${escapeHtml(pfad)}"`, zeileFn = renderZeile, aktionen = false }) {
  return `
    <div class="table-wrap belege-tabelle-wrap">
      <table class="belege-tabelle">
        <thead>
          <tr>
            ${sortKopf("name", "dokumente.spalteName")}
            ${suche ? `<th>${escapeHtml(t("dokumente.ordnerSpalte"))}</th>` : ""}
            ${sortKopf("typ", "dokumente.spalteTyp")}
            ${sortKopf("groesse", "dokumente.spalteGroesse", "amount")}
            ${sortKopf("geaendert", "dokumente.spalteGeaendert")}
            ${sortKopf("text", "dokumente.spalteText")}
            ${sortKopf("verknuepft", "dokumente.spalteVerknuepft", "amount")}
            ${aktionen ? `<th><span class="sr-only">${escapeHtml(t("dokumente.aktionen"))}</span></th>` : ""}
          </tr>
        </thead>
        <tbody>
          ${unterordner.map((o) => renderOrdnerZeile(o, ordnerAttr, aktionen)).join("")}
          ${zeilen.map((d) => zeileFn(d, d === datei, suche)).join("")}
        </tbody>
      </table>
    </div>`;
}

function renderOrdnerZeile(o, ordnerAttr, aktionen = false) {
  return `
    <tr class="clickable belege-ordnerzeile" ${ordnerAttr(o.pfad)}>
      <td class="belege-name"><button type="button" class="linkish" ${ordnerAttr(o.pfad)}>${iconSvg("folder")}<span>${escapeHtml(o.name)}</span></button></td>
      <td class="muted">${escapeHtml(t("dokumente.ordnerTyp"))}</td>
      <td class="amount muted">${escapeHtml(t("dokumente.dateienAnzahl").replace("{n}", String(o.anzahl)))}</td>
      <td></td>
      <td></td>
      <td></td>
      ${aktionen ? "<td></td>" : ""}
    </tr>`;
}

// Zeile im Ausschnitt eines Objekts: Name und Zeile oeffnen die Datei direkt im neuen
// Tab, hinten Herunterladen und der Sprung in die Dokumentenansicht (Verknuepfungen).
// Die Links tragen eine leere Aktion, damit der Zeilenklick sie nicht doppelt oeffnet.
function renderAusschnittZeile(d) {
  const url = dateiUrl(d.pfad);
  const anzahl = verweisAnzahl(verweisFuer(d.pfad));
  return `
    <tr class="clickable" data-action="dokument-oeffnen" data-url="${escapeHtml(url)}" title="${escapeHtml(t("dokumente.oeffnen"))}">
      <td class="belege-name"><a class="linkish" href="${escapeHtml(url)}" target="_blank" rel="noopener" data-action="dokument-link">${iconSvg("belege")}<span>${escapeHtml(d.name)}</span></a></td>
      <td>${escapeHtml(typText(d.typ))}</td>
      <td class="amount">${escapeHtml(formatGroesse(d.groesse, locale()))}</td>
      <td title="${escapeHtml(formatZeit(d.geaendert))}">${escapeHtml(formatTag(d.geaendert))}</td>
      <td>${textZelle(d)}</td>
      <td class="amount">${anzahl ? `<strong>${anzahl}</strong>` : `<span class="muted">0</span>`}</td>
      <td class="belege-aktionen-zelle"><span class="belege-aktionen-knoepfe">
        <a class="icon-link" href="${escapeHtml(url)}" download="${escapeHtml(d.name)}" data-action="dokument-link" title="${escapeHtml(t("dokumente.herunterladen"))}" aria-label="${escapeHtml(`${t("dokumente.herunterladen")}: ${d.name}`)}">${iconSvg("download")}</a>
        <a class="icon-link" href="${escapeHtml(dokumentRoute(d.pfad))}" data-action="dokument-link" title="${escapeHtml(t("dokumente.inDokumentenZeigen"))}" aria-label="${escapeHtml(`${t("dokumente.inDokumentenZeigen")}: ${d.name}`)}">${iconSvg("folder", { className: "icon-unten-buendig" })}</a>
      </span></td>
    </tr>`;
}

function renderZeile(d, gewaehlt, suche) {
  const anzahl = verweisAnzahl(verweisFuer(d.pfad));
  return `
    <tr class="clickable ${gewaehlt ? "selected" : ""}" data-action="select-beleg" data-beleg="${escapeHtml(d.pfad)}">
      <td class="belege-name"><button type="button" class="linkish" data-action="select-beleg" data-beleg="${escapeHtml(d.pfad)}"${gewaehlt ? ` aria-current="true"` : ""}>${iconSvg("belege")}<span>${escapeHtml(d.name)}</span></button></td>
      ${suche ? `<td class="muted">${escapeHtml(d.ordner.slice(BELEGE_WURZEL.length + 1) || "/")}</td>` : ""}
      <td>${escapeHtml(typText(d.typ))}</td>
      <td class="amount">${escapeHtml(formatGroesse(d.groesse, locale()))}</td>
      <td title="${escapeHtml(formatZeit(d.geaendert))}">${escapeHtml(formatTag(d.geaendert))}</td>
      <td>${textZelle(d)}</td>
      <td class="amount">${anzahl ? `<strong>${anzahl}</strong>` : `<span class="muted">0</span>`}</td>
    </tr>`;
}

function metaZeile(label, wertHtml) {
  return `
    <div class="detail-list-row">
      <span class="detail-list-label">${escapeHtml(label)}</span>
      <span class="detail-list-value">${wertHtml}</span>
    </div>`;
}

function renderDetail(d) {
  const zwillingLink = d.zwilling
    ? `<button type="button" class="linkish" data-action="select-beleg" data-beleg="${escapeHtml(d.zwilling)}">${escapeHtml(d.zwilling.slice(d.zwilling.lastIndexOf("/") + 1))}</button>`
    : "";
  const quelleLink = d.zwillingVon
    ? `<button type="button" class="linkish" data-action="select-beleg" data-beleg="${escapeHtml(d.zwillingVon)}">${escapeHtml(d.zwillingVon.slice(d.zwillingVon.lastIndexOf("/") + 1))}</button>`
    : "";
  return `
    <aside class="panel panel-pad detail-panel belege-detail" aria-labelledby="belege-detail-titel">
      <div class="detail-head">
        <div>
          <div class="detail-label">${escapeHtml(t("dokumente.details"))}</div>
          <h2 class="section-title belege-detail-titel" id="belege-detail-titel">${escapeHtml(d.name)}</h2>
        </div>
        <button class="icon-button" data-action="close-beleg" aria-label="${escapeHtml(t("dokumente.schliessen"))}" title="${escapeHtml(t("dokumente.schliessen"))}">${iconSvg("close")}</button>
      </div>
      <div class="detail-section belege-aktionen">
        <a class="upload-button" href="${escapeHtml(dateiUrl(d.pfad))}" target="_blank" rel="noopener">${iconSvg("external")}${escapeHtml(t("dokumente.oeffnen"))}</a>
        <a class="belege-download" href="${escapeHtml(dateiUrl(d.pfad))}" download="${escapeHtml(d.name)}">${iconSvg("download")}${escapeHtml(t("dokumente.herunterladen"))}</a>
      </div>
      <div class="detail-section">
        <div class="detail-list">
          ${metaZeile(t("dokumente.ordnerSpalte"), `<button type="button" class="linkish" data-action="select-beleg" data-beleg="${escapeHtml(d.ordner)}">${escapeHtml(d.ordner)}</button>`)}
          ${metaZeile(t("dokumente.spalteTyp"), escapeHtml(typText(d.typ)))}
          ${metaZeile(t("dokumente.spalteGroesse"), escapeHtml(formatGroesse(d.groesse, locale())))}
          ${metaZeile(t("dokumente.spalteGeaendert"), escapeHtml(formatZeit(d.geaendert)))}
          ${metaZeile(t("dokumente.spalteText"), textZelle(d))}
          ${zwillingLink ? metaZeile(t("dokumente.textzwilling"), zwillingLink) : ""}
          ${quelleLink ? metaZeile(t("dokumente.quelldokument"), quelleLink) : ""}
        </div>
      </div>
      ${renderVerknuepfungen(d)}
    </aside>`;
}

function renderVerknuepfungen(d) {
  const verweis = verweisFuer(d.pfad);
  if (!verweis || verweisAnzahl(verweis) === 0) {
    return `<div class="detail-section"><p class="muted">${escapeHtml(t("dokumente.nichtVerknuepft"))}</p></div>`;
  }
  const teile = [];
  if (verweis.transaktionen.length) {
    const z = fasseTransaktionenZusammen(verweis.transaktionen.map((id) => transaktionenById.get(id)).filter(Boolean));
    const titel = z.anzahl === 1 ? t("dokumente.quelleFuerBuchung") : t("dokumente.quelleFuerBuchungen").replace("{n}", String(z.anzahl));
    const konten = z.konten.map((id) => escapeHtml(kontenById.get(id)?.name || id)).join(", ");
    const zeitraum = z.von === z.bis ? escapeHtml(formatDate(z.von)) : `${escapeHtml(formatDate(z.von))} – ${escapeHtml(formatDate(z.bis))}`;
    teile.push(`
      <div class="detail-section">
        <div class="detail-label">${escapeHtml(titel)}</div>
        <div class="detail-list">
          ${konten ? metaZeile(t("dokumente.konten"), konten) : ""}
          ${z.von ? metaZeile(t("dokumente.zeitraum"), zeitraum) : ""}
        </div>
        <a class="linkish belege-tx-link" href="${escapeHtml(`#/transaktionen/dokument/${kodierePfad(d.pfad.slice(BELEGE_WURZEL.length + 1))}`)}">${iconSvg("transactions")}${escapeHtml(t("dokumente.inTransaktionenAnzeigen"))}</a>
      </div>`);
  }
  if (verweis.andere.length) {
    teile.push(`
      <div class="detail-section">
        <div class="detail-label">${escapeHtml(t("dokumente.verknuepfteDatensaetze"))}</div>
        <ul class="belege-verweise">
          ${verweis.andere.map((v) => `
            <li><span class="muted">${escapeHtml(t(`dokumente.entitaet.${v.entitaet}`))}</span>
              <a class="linkish" href="${escapeHtml(v.route)}">${escapeHtml(v.label)}</a></li>`).join("")}
        </ul>
      </div>`);
  }
  return teile.join("");
}

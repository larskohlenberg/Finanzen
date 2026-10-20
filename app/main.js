import { ablauf } from "./ablauf.mjs";
import { DEMO_STICHTAG } from "./demo-modus.mjs";
import { beiApiAntwort, leereApiCaches, verwerfeApiCaches } from "./api-daten.mjs";
import { anwendenBaumBreite, bindBelegeTrenner } from "./belege-trenner.mjs";
import { ladeGrunddaten, ladeStand } from "./data-loader.mjs";
import { bindDiagrammHover, termineListenBegrenzen, versteckeDiagrammHover } from "./diagramm-hover.mjs";
import { diffusorAnwenden, schalteDiffusor } from "./diffusor-anzeige.mjs";
import { safeRender, guard } from "./error.mjs";
import { captureFocus, restoreFocus, captureScroll, restoreScroll } from "./fokus.mjs";
import { formatMoney, heuteIso } from "./komponenten.mjs";
import { beiDatenwechsel, datenwechselMelden, erstelleEntpreller, eingabeBereit, merkeDetails } from "./lebenszyklus.mjs";
import { defaultHorizonEnd } from "./liquiditaet.mjs";
import { seitenTitel } from "./navigation.mjs";
import { rahmen, renderSidebar, renderTabbar, renderTopbar, renderPromptFallback, renderValidationBanner, renderUiErrorBanner, schnellsucheTreffer } from "./rahmen.mjs";
import { routeFromState, parseRoute } from "./routing.mjs";
import { app, data, state, storageKeys, navItems, t, escapeHtml, verwerfeDaten, ersetzeDaten } from "./runtime.mjs";
import { AKTIVITAETS_EREIGNISSE, PRUEF_INTERVALL_MS, erstelleSitzungswaechter, ladeSitzungKonfig, zielNachSperre } from "./sitzung.mjs";
import { erstelleStandWaechter } from "./stand-wechsel.mjs";
import { oeffneSzenario, snapshotState, restoreState, commitNavigation, applyRoute } from "./verlauf.mjs";
import { ladeVersion } from "./version.mjs";
import { renderBelege, belegeBeiBedarfLaden, setBelegeSuche, setBelegeZwillinge } from "./views/belege.mjs";
import { renderLiquiditaet } from "./views/liquiditaet.mjs";
import { renderPlanIst } from "./views/plan-ist.mjs";
import { renderMasterdata } from "./views/stammdaten.mjs";
import { renderSzenarien } from "./views/szenarien.mjs";
import { renderTermine } from "./views/termine.mjs";
import { renderTransactions, transaktionenAntwort, applyTransactionTimeModeDefaults } from "./views/transaktionen.mjs";
import { renderOverview } from "./views/uebersicht.mjs";
import { renderUpload, dateienEinreihen, inboxBeiBedarfLaden } from "./views/upload.mjs";
import { setWertstaendeFilter, toggleWertstaendeSort } from "./views/vermoegen-wertstaende.mjs";
import { renderVermoegen } from "./views/vermoegen.mjs";
import { renderVorsorge } from "./views/vorsorge.mjs";
import { aktionen as rahmenAktionen } from "./aktionen/rahmen.mjs";
import { aktionen as dokumentAktionen } from "./aktionen/dokumente.mjs";
import { aktionen as stammdatenAktionen } from "./aktionen/stammdaten.mjs";
import { aktionen as buchungsAktionen } from "./aktionen/transaktionen.mjs";
import { aktionen as vermoegenAktionen } from "./aktionen/vermoegen.mjs";
import { aktionen as vorsorgeAktionen } from "./aktionen/vorsorge.mjs";
import { aktionen as szenarioAktionen } from "./aktionen/szenarien.mjs";
import { aktionen as planTermineAktionen } from "./aktionen/plan-termine.mjs";
import { iconSvg } from "./icons.js";
import { kalenderAnbinden } from "./kalender.mjs";
import { datumAusEingabe } from "./datum-eingabe.mjs";

let sitzungGesperrt = false;

// Die Demo rechnet mit ihrem festen Stichtag (demo-modus.mjs), damit sie zu
// ihren Buchungen passt; heuteIso() liest state.heute.
if (state.dataMode === "demo" && !state.heute) state.heute = DEMO_STICHTAG;

// Die ausgelagerten Teile (verlauf.mjs, rahmen.mjs, aktionen/*) zeichnen,
// melden Fehler und pruefen den Stand ueber ablauf.mjs.
Object.assign(ablauf, { render, setUiError, pruefeStand });

function applyTheme() {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = state.theme === "system" ? (systemDark ? "dark" : "light") : state.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.lang = state.lang;
}

// Schlanke Statusmeldung fuer Screenreader. Sitzt in #sr-status ausserhalb von
// #app, damit nicht bei jedem Re-Render die komplette Oberflaeche vorgelesen wird.
function statusMessage() {
  const navLabel = navItems.find(([view]) => view === state.view)?.[1];
  const title = navLabel ? t(navLabel) : "";
  if (state.view === "transactions") {
    const { antwort } = transaktionenAntwort();
    if (!antwort) return title;
    return `${title}: ${antwort.treffer} ${t("transactions.hits")}, ${t("transactions.filteredBalance")} ${formatMoney(antwort.saldo_cent)}`;
  }
  return title;
}

// "Neuer Datenstand geladen" bleibt vor der Statusmeldung stehen, bis der
// naechste Klick kommt; die Antworten der Lese-APIs zeichnen danach erneut.
let standHinweis = "";

function announceStatus() {
  const region = document.querySelector("#sr-status");
  if (!region) return;
  const msg = standHinweis ? `${standHinweis}. ${statusMessage()}` : statusMessage();
  if (region.textContent !== msg) region.textContent = msg;
}

// Pfad der zuletzt gezeichneten Route (Seite, Reiter, Detail) fuer die Fokusregel.
let zuletztGezeichnet = "";
let zeigerGedrueckt = false;
let zeichnenAufgeschoben = false;

function render() {
  // Nach der Sitzungssperre ist der Bestand verworfen; nachlaufende
  // Ladevorgaenge (Version, Inbox, Dokumente) duerfen nichts mehr zeichnen.
  if (sitzungGesperrt) return;
  // Waehrend eine Maustaste gedrueckt ist, nicht unter dem Zeiger austauschen.
  if (zeigerGedrueckt) {
    zeichnenAufgeschoben = true;
    return;
  }
  applyTheme();
  // Vor dem Austausch: im Diffusor-Modus verdeckt der Beobachter das Neue, bevor es zu sehen ist.
  diffusorAnwenden();
  const focusSnap = captureFocus(app);
  const scrollSnap = captureScroll(app);
  app.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  app.innerHTML = `
    ${renderSidebar()}
    <main class="main" id="main-content" tabindex="-1">
      ${renderTopbar()}
      ${renderValidationBanner()}
      ${renderUiErrorBanner()}
      ${renderPromptFallback()}
      ${safeRender(renderView, "view:" + state.view)}
    </main>
    ${renderTabbar()}
  `;
  restoreScroll(app, scrollSnap);
  anwendenBaumBreite(app);
  termineListenBegrenzen(app);
  kalenderAnbinden(app, { sprache: state.lang, beiWahl: setzeDatum }).catch(setUiError);
  restoreFocus(app, focusSnap);
  // Neue Seite: der Fokus geht auf ihre Ueberschrift (Screenreader liest sie),
  // ausser er steht schon im Inhalt (z. B. nach einem Link innerhalb der Seite).
  const pfad = routeFromState(state).split("?")[0];
  if (pfad !== zuletztGezeichnet && !app.querySelector("main")?.contains(document.activeElement)) {
    app.querySelector("main h1")?.focus({ preventScroll: true });
  }
  zuletztGezeichnet = pfad;
  document.title = seitenTitel([seitenName(), seitenDetail()], t("appTitle"));
  announceStatus();
  if (state.view === "upload") inboxBeiBedarfLaden(render);
  if (state.view === "belege") belegeBeiBedarfLaden(render);
  // Dokumente je Vertrag im Detail der Vorsorge-Tabs.
  if (state.view === "vorsorge") belegeBeiBedarfLaden(render);
  // Dokumente je Objekt auf den Tabs Immobilien und Darlehen.
  if (state.view === "vermoegen" && ["immobilien", "darlehen"].includes(state.vermoegenTab)) belegeBeiBedarfLaden(render);
}

// Prognosehorizont setzen (Schnellauswahl oder Datumsfeld); schliesst den Kalender.
function setzeHorizont(datum) {
  state.liquiditaet.bisDatum = datum || defaultHorizonEnd(heuteIso());
  state.kalenderOffen = "";
  state.liquiditaetExpanded.clear();
  render();
}

// Wert eines Datumsfelds (getippt oder im Kalender gewaehlt), ISO oder "".
function setzeDatum(name, datum) {
  if (name === "liquiditaet-bis") {
    setzeHorizont(datum);
    return;
  }
  if (name.startsWith("filter:")) {
    state.kalenderOffen = "";
    state.transactionFilters[name.slice("filter:".length)] = datum;
    state.view = "transactions";
    state.transactionPage = 1;
    commitNavigation();
  }
}

function seitenName() {
  const navLabel = navItems.find(([view]) => view === state.view)?.[1];
  return navLabel ? t(navLabel) : "";
}

// Ausgewaehltes Objekt der Seite fuer den Fenstertitel (ID oder Dateiname).
function seitenDetail() {
  if (state.view === "transactions") return state.selectedTransactionId;
  if (state.view === "vermoegen") return String(state.selectedVermoegenId ?? "").split(":")[1] ?? "";
  if (state.view === "vorsorge") return state.selectedVorsorgeId;
  if (state.view === "szenarien") return state.selectedSzenarioId;
  if (state.view === "termine") return state.termineTab === "fristen" ? "" : state.selectedRegelzahlungId;
  if (state.view === "masterdata") return state.masterSection === "regeln" ? state.selectedRegel : "";
  if (state.view === "belege") return String(state.selectedBeleg ?? "").split("/").pop();
  return "";
}

// Aktions-Grenze: ein in einem Handler geworfener Fehler wird als schliessbares
// Banner sichtbar, statt nur in der Konsole zu landen.
function setUiError(error, kontext = "aktion") {
  state.uiError = {
    message: error?.message ?? String(error ?? ""),
    stack: error?.stack ?? "",
    kontext,
  };
  render();
}

function renderView() {
  if (state.view === "transactions") return renderTransactions();
  if (state.view === "liquiditaet") return renderLiquiditaet();
  if (state.view === "planIst") return renderPlanIst();
  if (state.view === "termine") return renderTermine();
  if (state.view === "vermoegen") return renderVermoegen();
  if (state.view === "vorsorge") return renderVorsorge();
  if (state.view === "szenarien") return renderSzenarien();
  if (state.view === "masterdata") return renderMasterdata();
  if (state.view === "upload") return renderUpload();
  if (state.view === "belege") return renderBelege();
  return renderOverview();
}

// Logo nicht ladbar (Datei fehlt): Bild weg, das Kuerzel darunter bleibt.
// error-Ereignisse steigen nicht auf, darum in der Capture-Phase.
app.addEventListener("error", (event) => {
  const bild = event.target;
  if (bild instanceof HTMLImageElement && bild.parentElement?.classList.contains("logo-marke")) bild.remove();
}, true);

app.addEventListener("click", guard((event) => {
  // Echte Links: mit Zusatztaste (neuer Tab/Fenster) entscheidet der Browser.
  // Sonst uebernimmt die Aktion des Links, der Browser folgt der href nicht.
  const anker = event.target.closest("a[href]");
  if (anker && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0)) return;
  if (anker?.matches("[data-action], [data-view], [data-rule]")) event.preventDefault();
  if (state.settingsMenuOpen && !event.target.closest(".settings-control")) {
    state.settingsMenuOpen = false;
    render();
  }
  if (state.schnellsuche.offen && !event.target.closest(".schnellsuche")) {
    state.schnellsuche.offen = false;
    render();
  }
  // Pfad zur Zeit des Klicks: der Kalender zeichnet seine Tage beim Klick neu,
  // das Ziel haengt danach nicht mehr im Dokument.
  const imKalender = () => (event.composedPath?.() ?? [event.target]).some((el) => el.closest?.(".kalender-popover, [data-datum-kalender]"));
  if (state.kalenderOffen && !imKalender()) {
    state.kalenderOffen = "";
    render();
  }

  const errorDismiss = event.target.closest("[data-error-dismiss]");
  if (errorDismiss) {
    state.uiError = null;
    render();
    return;
  }

  const transferLink = event.target.closest(".transfer-link");
  if (transferLink) {
    event.stopPropagation();
    handleAction(transferLink);
    return;
  }

  const navButton = event.target.closest("[data-view]");
  if (navButton) {
    state.view = navButton.dataset.view;
    state.moreMenuOpen = false;
    // Navigation auf "Szenarien" zeigt immer die Liste, auch aus Detail oder Vergleich.
    if (state.view === "szenarien") oeffneSzenario("");
    commitNavigation();
    return;
  }

  const liquiditaetToggle = event.target.closest("[data-liquiditaet-toggle]");
  if (liquiditaetToggle) {
    const key = liquiditaetToggle.dataset.liquiditaetToggle;
    if (state.liquiditaetExpanded.has(key)) state.liquiditaetExpanded.delete(key);
    else state.liquiditaetExpanded.add(key);
    render();
    return;
  }

  const horizont = event.target.closest("[data-liquiditaet-horizont]");
  if (horizont) {
    setzeHorizont(horizont.dataset.liquiditaetHorizont);
    return;
  }

  const kalenderKnopf = event.target.closest("[data-datum-kalender]");
  if (kalenderKnopf) {
    const name = kalenderKnopf.dataset.datumKalender;
    state.kalenderOffen = state.kalenderOffen === name ? "" : name;
    render();
    return;
  }

  const liquiditaetGran = event.target.closest("[data-liquiditaet-gran]");
  if (liquiditaetGran) {
    state.liquiditaet.granularitaet = liquiditaetGran.dataset.liquiditaetGran;
    state.liquiditaetExpanded.clear();
    render();
    return;
  }

  const wertstaendeSort = event.target.closest("[data-wertstaende-sort]");
  if (wertstaendeSort) {
    toggleWertstaendeSort(wertstaendeSort.dataset.wertstaendeSort);
    render();
    return;
  }

  const transactionSort = event.target.closest("[data-transaction-sort]");
  if (transactionSort) {
    const key = transactionSort.dataset.transactionSort;
    if (state.transactionSort.key === key) {
      state.transactionSort.dir = state.transactionSort.dir === "asc" ? "desc" : "asc";
    } else {
      state.transactionSort = { key, dir: "asc" };
    }
    state.transactionPage = 1;
    render();
    return;
  }

  const regelSort = event.target.closest("[data-regel-sort]");
  if (regelSort) {
    const key = regelSort.dataset.regelSort;
    if (state.regelSort && state.regelSort.key === key) {
      state.regelSort = { key, dir: state.regelSort.dir === "asc" ? "desc" : "asc" };
    } else {
      state.regelSort = { key, dir: "asc" };
    }
    render();
    return;
  }

  const action = event.target.closest("[data-action]");
  if (action) {
    void handleAction(action);
    return;
  }

  const ruleRow = event.target.closest("[data-rule]");
  if (ruleRow) {
    state.view = "masterdata";
    state.masterSection = "regeln";
    state.selectedRegel = ruleRow.dataset.rule;
    commitNavigation();
    return;
  }

  const masterSection = event.target.closest("[data-master-section]");
  if (masterSection) {
    state.masterSection = masterSection.dataset.masterSection;
    state.selectedKonto = "";
    state.selectedRegel = "";
    state.regelRailWide = false;
    commitNavigation();
  }
}, setUiError, "click"));

// Tastatur-Aktivierung fuer fokussierbare, nicht-native Bedienelemente
// (z. B. auswaehlbare Tabellenzellen/-zeilen mit tabindex="0" + data-action).
// Native Buttons/Links/Inputs bringen Enter/Space selbst mit.
const KEY_ACTIVATION_SELECTOR = "[data-action], [data-view], [data-master-section], [data-liquiditaet-toggle], [data-liquiditaet-gran], [data-wertstaende-sort], [data-transaction-sort], [data-regel-sort], [data-rule], [data-vorsorge]";
app.addEventListener("keydown", guard((event) => {
  if (event.key === "Escape" && state.kalenderOffen) {
    const name = state.kalenderOffen;
    state.kalenderOffen = "";
    render();
    app.querySelector(`[data-datum-kalender="${CSS.escape(name)}"]`)?.focus();
    return;
  }
  if (event.key === "Escape" && state.settingsMenuOpen) {
    state.settingsMenuOpen = false;
    render();
    app.querySelector(".settings-toggle")?.focus();
    return;
  }
  if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
  const el = event.target;
  if (!el || typeof el.matches !== "function") return;
  // Links reagieren nativ nur auf Enter; die Leertaste wie bei Knoepfen nachreichen.
  if (el.matches("a[href][data-action], a[href][data-view]") && event.key !== "Enter") {
    event.preventDefault();
    el.click();
    return;
  }
  if (el.matches("button, a, input, select, textarea")) return;
  if (el.getAttribute("tabindex") == null) return;
  if (!el.matches(KEY_ACTIVATION_SELECTOR)) return;
  event.preventDefault();
  el.click();
}, setUiError, "keydown"));

// Live-Suche: Textfilter wirken pro Tastendruck; Fokus/Cursor uebersteht das
// Re-Render via captureFocus/restoreFocus (Selektor ueber die id des Inputs).
// Die Buchungssuche fragt den Server: entprellt, damit nicht jeder Buchstabe
// eine Anfrage ist. Waehrend einer IME-Komposition passiert nichts; das
// abschliessende compositionend verarbeitet die fertige Eingabe.
const sucheEntprellt = erstelleEntpreller(() => render(), 250);
function verarbeiteEingabe(event) {
  const such = event.target.closest?.("input[data-schnellsuche]");
  if (such) {
    state.schnellsuche = { offen: true, text: such.value, index: 0 };
    render();
    return;
  }
  const belegeSuche = event.target.closest("input[data-belege-suche]");
  if (belegeSuche) {
    setBelegeSuche(belegeSuche.value);
    render();
    return;
  }
  const wertstaendeFilter = event.target.closest("input[data-wertstaende-filter]");
  if (wertstaendeFilter) {
    setWertstaendeFilter(wertstaendeFilter.dataset.wertstaendeFilter, wertstaendeFilter.value);
    render();
    return;
  }
  const filter = event.target.closest("input[data-filter]");
  if (!filter) return;
  state.transactionFilters[filter.dataset.filter] = filter.value;
  state.transactionPage = 1;
  // Suche und Betragsfelder fragen den Server: entprellt.
  if (filter.type === "search" || filter.inputMode === "decimal") sucheEntprellt();
  else render();
}
app.addEventListener("input", guard((event) => {
  if (eingabeBereit(event)) verarbeiteEingabe(event);
}, setUiError, "input"));
// Schnellsuche: Cmd/Strg+K springt ueberall ins Suchfeld; dort Pfeile, Enter, Esc.
document.addEventListener?.("keydown", guard((event) => {
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
    event.preventDefault();
    oeffneSchnellsuche();
    return;
  }
  // Diffusor-Modus: Alt+Umschalt+D (event.code, weil Alt auf dem Mac ein anderes Zeichen tippt).
  if (event.altKey && event.shiftKey && !event.metaKey && !event.ctrlKey && event.code === "KeyD") {
    event.preventDefault();
    schalteDiffusor(render);
    return;
  }
  if (event.target?.id !== "schnellsuche-eingabe" || event.isComposing) return;
  const s = state.schnellsuche;
  if (event.key === "Escape") {
    event.preventDefault();
    schliesseSchnellsuche();
    return;
  }
  const treffer = schnellsucheTreffer();
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!treffer.length) return;
    s.index = (Math.min(s.index, treffer.length - 1) + (event.key === "ArrowDown" ? 1 : -1) + treffer.length) % treffer.length;
    render();
    return;
  }
  if (event.key === "Enter" && treffer.length) {
    event.preventDefault();
    const ziel = treffer[Math.min(s.index, treffer.length - 1)];
    springeZu(ziel.route, ziel.view);
  }
}, setUiError, "keydown"));

// Strg+K: Fokus ins Suchfeld, vorhandener Text markiert; Esc leert und schliesst.
function oeffneSchnellsuche() {
  state.settingsMenuOpen = false;
  if (state.schnellsuche.text) state.schnellsuche.offen = true;
  render();
  const feld = document.getElementById("schnellsuche-eingabe");
  feld?.focus();
  feld?.select();
}

function schliesseSchnellsuche() {
  state.schnellsuche = { offen: false, text: "", index: 0 };
  render();
}

// Ziel der Schnellsuche: eine Seite wie ueber die Navigation (Filter bleiben),
// ein Objekt wie ein Link (neuer Verlaufseintrag, Route anwenden).
function springeZu(route, view = "") {
  state.schnellsuche = { offen: false, text: "", index: 0 };
  if (view) {
    state.view = view;
    if (view === "szenarien") oeffneSzenario("");
    commitNavigation();
  } else if (location.hash === route) render();
  else location.hash = route;
}
Object.assign(ablauf, { oeffneSchnellsuche, schliesseSchnellsuche, springeZu });

// Ein Klick braucht Druecken und Loslassen auf demselben Element. Zeichnet
// dazwischen etwas neu (eine eintreffende API-Antwort, die entprellte Suche),
// ersetzt es das Element unter dem Zeiger und der Klick geht verloren. Darum
// wartet jedes Neuzeichnen, solange gedrueckt ist, und kommt nach dem Klick.
// Nur die primaere, linke Taste: ein Rechtsklick oeffnet ein Kontextmenue, das
// das Loslassen verschluckt. Jede Bewegung ohne gedrueckte Taste gibt frei,
// falls ein pointerup doch ausblieb (z. B. nach einem Scrollbalken).
app.addEventListener("pointerdown", (event) => {
  if (event.isPrimary !== false && (event.button ?? 0) === 0) zeigerGedrueckt = true;
}, true);
for (const typ of ["pointerup", "pointercancel", "blur", "contextmenu", "pointermove"]) {
  window.addEventListener(typ, (event) => {
    // blur nur des Fensters (Capture sieht auch das Blur jedes Feldes).
    if (typ === "blur" && event.target !== window) return;
    // Nur echte Bewegungen (die Diagramm-Box loest beim Tippen eine eigene aus).
    if (typ === "pointermove" && (!zeigerGedrueckt || event.buttons !== 0 || !event.isTrusted)) return;
    zeigerGedrueckt = false;
    if (!zeichnenAufgeschoben) return;
    zeichnenAufgeschoben = false;
    // Nach dem Klick-Ereignis, das noch in dieser Runde folgt.
    setTimeout(render, 0);
  }, true);
}
// Beginnt eine Komposition, darf kein anstehendes Neuzeichnen sie zerstoeren.
app.addEventListener("compositionstart", () => sucheEntprellt.abbrechen());
app.addEventListener("compositionend", guard((event) => verarbeiteEingabe(event), setUiError, "compositionend"));

// <details> behalten den vom Nutzer gesetzten Zustand ueber das Neuzeichnen
// (lebenszyklus.mjs). toggle steigt nicht auf, darum in der Capture-Phase.
app.addEventListener("toggle", (event) => {
  const el = event.target;
  if (el?.matches?.("details[data-details]")) merkeDetails(el.dataset.details, el.open);
}, true);

// Neuer Datenstand oder Sperre: offene Menues, Hinweise und Overlays gehoeren
// zum alten Stand; eine anstehende Suche wird nicht mehr abgeschickt.
beiDatenwechsel(() => {
  state.settingsMenuOpen = false;
  state.nextActionMenuOpen = false;
  state.moreMenuOpen = false;
  state.nextActionPromptFallback = "";
  sucheEntprellt.abbrechen();
  versteckeDiagrammHover();
});

app.addEventListener("change", guard((event) => {
  const uploadInput = event.target.closest("[data-upload-input]");
  if (uploadInput) {
    dateienEinreihen(uploadInput.files, render);
    return;
  }
  const belegeZwillinge = event.target.closest("input[data-belege-zwillinge]");
  if (belegeZwillinge) {
    setBelegeZwillinge(belegeZwillinge.checked);
    render();
    return;
  }
  const control = event.target.closest("[data-control]");
  if (control?.dataset.control === "szenario-vergleich") {
    state.szenarioVergleichMit = control.value || "";
    commitNavigation({ ersetzen: true });
    return;
  }
  if (control?.dataset.control === "plan-ist-periode") {
    state.planIst.periode = control.value || "";
    state.planIstOffen.clear();
    commitNavigation({ ersetzen: true });
    return;
  }

  // Datumsfeld: getippter Wert beim Verlassen oder mit Enter. Unlesbares bleibt
  // stehen und wird markiert, der bisherige Wert gilt weiter.
  const datumFeld = event.target.closest("input[data-datum-feld]");
  if (datumFeld) {
    const datum = datumAusEingabe(datumFeld.value);
    datumFeld.toggleAttribute("aria-invalid", datum === null);
    if (datum !== null) setzeDatum(datumFeld.dataset.datumFeld, datum);
    return;
  }

  const filter = event.target.closest("[data-filter]");
  if (filter) {
    if (filter.dataset.filter === "pageSize") {
      state.pageSize = Number(filter.value);
      localStorage.setItem(storageKeys.pageSize, String(state.pageSize));
      state.transactionPage = 1;
      state.view = "transactions";
      commitNavigation();
      return;
    }
    state.transactionFilters[filter.dataset.filter] = filter.value;
    if (filter.dataset.filter === "timeMode") {
      applyTransactionTimeModeDefaults(filter.value);
    }
    state.view = "transactions";
    state.transactionPage = 1;
    commitNavigation();
    return;
  }

  const wertstaendeFilter = event.target.closest("select[data-wertstaende-filter]");
  if (wertstaendeFilter) {
    setWertstaendeFilter(wertstaendeFilter.dataset.wertstaendeFilter, wertstaendeFilter.value);
    render();
  }
}, setUiError, "change"));

// Upload: Drop-Zone hebt sich beim Darueberziehen hervor (Klasse direkt am
// Element, ohne Re-Render). Auf der Upload-Seite verhindert das Fenster, dass
// eine daneben fallengelassene Datei den Browser von der App wegnavigiert.
app.addEventListener("dragover", (event) => {
  const zone = event.target.closest?.("[data-upload-drop]");
  if (!zone) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  zone.classList.add("is-dragover");
});
app.addEventListener("dragleave", (event) => {
  const zone = event.target.closest?.("[data-upload-drop]");
  if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove("is-dragover");
});
app.addEventListener("drop", guard((event) => {
  const zone = event.target.closest?.("[data-upload-drop]");
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove("is-dragover");
  dateienEinreihen(event.dataTransfer.files, render);
}, setUiError, "drop"));
for (const typ of ["dragover", "drop"]) {
  window.addEventListener(typ, (event) => {
    if (state.view === "upload") event.preventDefault();
  });
}

// Diagramm-Hover: delegierter pointermove-Handler auf dem App-Container.
bindDiagrammHover(app);
window.addEventListener("resize", () => termineListenBegrenzen(app));
bindBelegeTrenner(app);

// Alle Aktionen (data-action) je Bereich; Namen sind eindeutig.
const AKTIONEN = {
  ...rahmenAktionen, ...dokumentAktionen, ...stammdatenAktionen, ...buchungsAktionen,
  ...vermoegenAktionen, ...vorsorgeAktionen, ...szenarioAktionen, ...planTermineAktionen,
};

async function handleAction(element) {
  const action = element.dataset.action;
  // Links in klickbaren Zeilen: der Browser oeffnet sie selbst, die Zeile nicht zusaetzlich.
  if (action === "dokument-link") return;
  await AKTIONEN[action]?.(element, action);
}

// Stand-Wechsel (stand-wechsel.mjs): nach einem Import oder einer Korrektur
// zeigt der naechste Klick den neuen Stand, ohne Seiten-Reload. Zustand,
// Filter und Auswahl bleiben; nur data und die Nachschlage-Maps werden ersetzt.
const standWaechter = erstelleStandWaechter({
  stand: data.metadata?.stand,
  holeStand: () => ladeStand(state.dataMode),
  holeGrunddaten: (stand) => ladeGrunddaten({ dataMode: state.dataMode, stand }),
  uebernehme: (neu) => {
    if (sitzungGesperrt) return;
    ersetzeDaten(neu);
    // Antworten der Lese-APIs gehoeren zum alten Stand (laufende Anfragen
    // werden abgebrochen); neu geholt wird beim Zeichnen nur, was die aktive
    // Ansicht braucht. Private Zwischenspeicher und Overlays raeumen auf.
    verwerfeApiCaches();
    datenwechselMelden("stand");
    standHinweis = t("chrome.dataUpdated");
    render();
  },
});

function pruefeStand(optionen) {
  if (sitzungGesperrt) return;
  // Nicht erreichbar oder kaputt: der bisherige Stand bleibt sichtbar, der
  // naechste Klick fragt erneut. Beim Knopf "Daten neu laden" erscheint der
  // Fehler im Fehlerbanner.
  standWaechter.pruefe(optionen).catch((fehler) => {
    if (optionen?.erzwingen) setUiError(fehler, "daten-neu-laden");
    else console.warn("Datenstand nicht pruefbar:", fehler?.message ?? fehler);
  });
}

// Nach dem Klick-Handler: erst reagiert die Oberflaeche, dann kommt ggf. der neue Stand.
app.addEventListener("click", () => {
  standHinweis = "";
  pruefeStand();
});
window.addEventListener("hashchange", () => pruefeStand());
window.addEventListener("popstate", () => pruefeStand());
window.addEventListener("focus", () => pruefeStand());
document.addEventListener?.("visibilitychange", () => {
  if (document.visibilityState === "visible") pruefeStand();
});

window.addEventListener("popstate", (event) => {
  restoreState(event.state);
  render();
});

// Direkt eingefügte/extern verlinkte Hash-Route (kein pushState von uns).
window.addEventListener("hashchange", () => {
  if (location.hash === routeFromState(state)) return; // selbst gesetzte Route ignorieren
  applyRoute(parseRoute(location.hash));
  history.replaceState(snapshotState(), "", routeFromState(state));
  render();
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (state.theme === "system") render();
});

// Ist eine Antwort einer Lese-API da, zeichnet die Ansicht neu.
beiApiAntwort(() => render());

applyRoute(parseRoute(location.hash));
history.replaceState(snapshotState(), "", routeFromState(state));
render();

// Versionsstand nachladen; blockiert den Start nicht und scheitert still.
ladeVersion().then((version) => {
  rahmen.appVersion = version;
  render();
});

// Sitzungsschutz: Daten verwerfen, DOM ersetzen, dann abmelden oder neu laden.
// Keine Ansicht wird von den Timern neu gezeichnet.
const sitzungsTimer = [];
function sperreSitzung(grund) {
  sitzungGesperrt = true;
  for (const id of sitzungsTimer) clearInterval(id);
  const hinweis = t("chrome.locked");
  verwerfeDaten();
  leereApiCaches();
  datenwechselMelden("sperre");
  app.className = "app-shell sitzung-gesperrt";
  app.innerHTML = `<p class="sitzung-hinweis" role="status">${iconSvg("lock")}<span>${escapeHtml(hinweis)}</span></p>`;
  const sr = document.querySelector("#sr-status");
  if (sr) sr.textContent = "";
  const ziel = zielNachSperre(grund, rahmen.sitzungKonfig);
  if (ziel.art === "abmelden") window.location.replace(ziel.url);
  else window.location.reload();
}

// Nur im echten Browser: Tests mit DOM-Attrappe (ohne visibilityState)
// laden main.js ohne Timer, die den Testprozess am Leben hielten.
if ("visibilityState" in document) void ladeSitzungKonfig().then((konfig) => {
  rahmen.sitzungKonfig = konfig;
  rahmen.sitzungswaechter = erstelleSitzungswaechter({ konfig, beiSperre: sperreSitzung });
  const aktivitaet = () => rahmen.sitzungswaechter.aktivitaet();
  for (const typ of AKTIVITAETS_EREIGNISSE) {
    window.addEventListener(typ, aktivitaet, { capture: true, passive: true });
  }
  const wiederSichtbar = () => {
    if (document.visibilityState === "visible") void rahmen.sitzungswaechter.wiederSichtbar();
  };
  document.addEventListener("visibilitychange", wiederSichtbar);
  window.addEventListener("focus", wiederSichtbar);
  // Die Uhr wird oft gelesen (billig), der Proxy einmal pro Minute gefragt.
  sitzungsTimer.push(window.setInterval(() => rahmen.sitzungswaechter.pruefeInaktivitaet(), Math.min(5_000, konfig.sperreMs / 4)));
  sitzungsTimer.push(window.setInterval(() => void rahmen.sitzungswaechter.pruefeAnmeldung(), PRUEF_INTERVALL_MS));
  if (konfig.abmeldenUrl) render();
});

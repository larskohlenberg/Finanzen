// app/verlauf.mjs
// Zustand <-> Browserverlauf nach dem Navigationsvertrag (navigation.mjs):
// Verlaufseintraege schreiben (commitNavigation), Zustand aus Eintrag oder
// Route herstellen und die gemeinsamen Spruenge zu Objekten.
import { ablauf } from "./ablauf.mjs";
import { zuBuchungen, neuerVerlaufseintrag } from "./navigation.mjs";
import { routeFromState } from "./routing.mjs";
import { data, state } from "./runtime.mjs";
import { TAB_FUER_KLASSE } from "./vermoegen-routen.mjs";
import { resetVorsorgeFilters } from "./views/vorsorge.mjs";

// Ein Objekt der Vermoegensseite oeffnen ("klasse:id"); Vorsorge hat ihre eigene Seite.
export function oeffneVermoegenObjekt(schluessel) {
  const [klasse, id] = String(schluessel ?? "").split(":");
  if (klasse === "vorsorge") {
    resetVorsorgeFilters();
    state.view = "vorsorge";
    state.selectedVorsorgeId = id || "";
    commitNavigation();
    return;
  }
  state.view = "vermoegen";
  state.vermoegenTab = TAB_FUER_KLASSE[klasse] ?? "uebersicht";
  state.selectedVermoegenId = TAB_FUER_KLASSE[klasse] && id ? `${klasse}:${id}` : "";
  if (klasse === "konto") state.selectedKonto = id || "";
  state.vermoegenDetailRailClosed = false;
  commitNavigation();
}

// Szenario oeffnen ("" = Liste): Vergleich und Detail-Schalter zuruecksetzen,
// damit jedes Detail aufgeraeumt startet.
export function oeffneSzenario(id) {
  state.selectedSzenarioId = id;
  state.szenarioVergleichIds = [];
  state.szenarioVergleichMit = "";
  state.szenarioPhaseOffen = new Set();
  state.szenarioBeschreibungOffen = false;
  state.szenarioNettoOffen = false;
  state.szenarioGrundlageOffen = false;
  state.szenarioBasisExpanded = false;
}

// Checks sind ein Bereich der Administration, keine eigene Seite.
export function zeigeChecks() {
  state.view = "masterdata";
  state.masterSection = "checks";
  state.selectedKonto = "";
  state.selectedRegel = "";
}

export function snapshotState() {
  return {
    view: state.view,
    transactionFilters: { ...state.transactionFilters },
    selectedTransactionId: state.selectedTransactionId,
    transactionPage: state.transactionPage,
    masterSection: state.masterSection,
    selectedKonto: state.selectedKonto,
    selectedRegel: state.selectedRegel,
    selectedVermoegenId: state.selectedVermoegenId,
    vermoegenTab: state.vermoegenTab,
    selectedVorsorgeId: state.selectedVorsorgeId,
    vorsorgeTab: state.vorsorgeTab,
    termineTab: state.termineTab,
    selectedRegelzahlungId: state.selectedRegelzahlungId,
    selectedSzenarioId: state.selectedSzenarioId,
    szenarioVergleichMit: state.szenarioVergleichMit,
    szenarioVergleichIds: [...state.szenarioVergleichIds],
    selectedBeleg: state.selectedBeleg,
    planIstPeriode: state.planIst.periode,
  };
}

export function restoreState(snapshot) {
  if (!snapshot) return;
  state.view = snapshot.view || "overview";
  // History-Eintraege aus der Zeit vor der Seite Termine.
  if (state.view === "regelzahlungen") state.view = "termine";
  // History-Eintraege aus der Zeit, als Checks und Export eigene Seiten waren.
  if (state.view === "checks" || state.view === "export") {
    snapshot = { ...snapshot, masterSection: state.view };
    state.view = "masterdata";
  }
  state.transactionFilters = { ...state.transactionFilters, ...(snapshot.transactionFilters || {}) };
  state.selectedTransactionId = snapshot.selectedTransactionId || "";
  state.transactionPage = snapshot.transactionPage || 1;
  state.masterSection = snapshot.masterSection || "konten";
  state.selectedKonto = snapshot.selectedKonto || "";
  state.selectedRegel = snapshot.selectedRegel || "";
  state.selectedVermoegenId = snapshot.selectedVermoegenId || "";
  state.vermoegenTab = snapshot.vermoegenTab || "uebersicht";
  state.selectedVorsorgeId = snapshot.selectedVorsorgeId || "";
  state.vorsorgeTab = snapshot.vorsorgeTab || "uebersicht";
  state.termineTab = snapshot.termineTab || "regelzahlungen";
  state.selectedRegelzahlungId = snapshot.selectedRegelzahlungId || "";
  state.selectedSzenarioId = snapshot.selectedSzenarioId || "";
  state.szenarioVergleichMit = snapshot.szenarioVergleichMit || "";
  state.szenarioVergleichIds = snapshot.szenarioVergleichIds || [];
  state.selectedBeleg = snapshot.selectedBeleg || "";
  state.planIst.periode = snapshot.planIstPeriode || "";
}

// Verlauf nach dem Navigationsvertrag (navigation.mjs): ein anderer Pfad
// (Seite, Reiter, Detail) ist ein neuer Eintrag, eine reine Filteraenderung
// (Query) oder Seite/Sortierung ersetzt den aktuellen. ersetzen erzwingt das
// Ersetzen fuer Auswahlfelder, die wie Filter wirken.
export function commitNavigation({ ersetzen = false } = {}) {
  state.uiError = null;
  const route = routeFromState(state);
  if (!ersetzen && neuerVerlaufseintrag(location.hash, route)) {
    history.pushState(snapshotState(), "", route);
  } else {
    history.replaceState(snapshotState(), "", route);
  }
  ablauf.render();
}

// Hash-Route auf den Zustand anwenden (Deep-Link von außen oder beim Laden).
// Für adressierte Detailansichten Filter zurücksetzen, damit der verlinkte
// Datensatz sichtbar ist, und bei Transaktionen auf die richtige Seite springen.
export function applyRoute(route) {
  if (!route || !route.view) return;
  state.view = route.view;
  state.moreMenuOpen = false;
  if (route.masterSection) state.masterSection = route.masterSection;
  if (route.selectedKonto) state.selectedKonto = route.selectedKonto;
  if (route.selectedRegel) state.selectedRegel = route.selectedRegel;

  // Buchungsliste: die Route traegt den vollstaendigen Filterzustand (ohne
  // Freitextsuche). Ob es eine ausgewaehlte Buchung im Filter gibt, weiss der
  // Server; sonst faellt die Auswahl mit der Antwort weg.
  if (route.transactionFilters) zuBuchungen(state, { filter: route.transactionFilters, auswahl: route.selectedTransactionId || "" });
  if (route.view === "belege") state.selectedBeleg = route.selectedBeleg || "";

  if (route.view === "vermoegen") {
    state.vermoegenTab = route.vermoegenTab || "uebersicht";
    state.selectedVermoegenId = route.selectedVermoegenId || "";
    if (state.selectedVermoegenId.startsWith("konto:")) state.selectedKonto = state.selectedVermoegenId.slice("konto:".length);
    state.vermoegenDetailRailClosed = false;
  }
  if (route.view === "vorsorge") {
    const known = route.selectedVorsorgeId
      ? (data.vorsorge ?? []).some((vs) => vs.vorsorge_id === route.selectedVorsorgeId)
      : false;
    if (known) {
      resetVorsorgeFilters();
      state.selectedVorsorgeId = route.selectedVorsorgeId;
    } else {
      state.selectedVorsorgeId = "";
      state.vorsorgeTab = route.vorsorgeTab || "uebersicht";
    }
  }
  if (route.view === "planIst") {
    state.planIst.periode = route.planIstPeriode || "";
    // Granularitaet passend zum Zeitraum, damit die Auswahl ihn zeigt.
    const p = state.planIst.periode;
    if (/^\d{4}$/.test(p)) state.planIst.granularitaet = "jahr";
    else if (/-Q\d$/.test(p)) state.planIst.granularitaet = "quartal";
    else if (/^\d{4}-\d{2}$/.test(p)) state.planIst.granularitaet = "monat";
  }
  if (route.view === "termine") {
    state.termineTab = route.termineTab || "regelzahlungen";
    state.selectedRegelzahlungId = route.selectedRegelzahlungId || "";
  }
  if (route.view === "szenarien") {
    oeffneSzenario(route.selectedSzenarioId || "");
    state.szenarioVergleichMit = route.szenarioVergleichMit || "";
    state.szenarioVergleichIds = route.szenarioVergleichIds || [];
  }
}

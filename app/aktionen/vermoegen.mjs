// app/aktionen/vermoegen.mjs
// Aktionen (data-action) – Vermoegen: Tabs, Objekte, Wertstaende, Immobilien.
import { ablauf } from "../ablauf.mjs";
import { listeDetailAuswahlZeigen, oeffneKlappKachel } from "../komponenten.mjs";
import { state } from "../runtime.mjs";
import { oeffneVermoegenObjekt, commitNavigation } from "../verlauf.mjs";
import { TAB_FUER_KLASSE } from "../vermoegen-routen.mjs";
import { setWertstaendeFilter, resetWertstaendeFilters } from "../views/vermoegen-wertstaende.mjs";

export const aktionen = {
  "close-vermoegen-detail-rail": () => {
    state.vermoegenDetailRailClosed = true;
    commitNavigation();
  },
  "select-vermoegen": (element) => {
    state.selectedVermoegenId = element.dataset.vermoegen;
    state.vermoegenTab = TAB_FUER_KLASSE[String(element.dataset.vermoegen).split(":")[0]] ?? state.vermoegenTab;
    state.vermoegenDetailRailClosed = false;
    commitNavigation();
  },
  "show-vermoegen-wertstaende": (element) => {
    // Die Gesamtliste der Wertstaende steht als Tabelle auf der Uebersicht; gefiltert auf das Objekt.
    state.view = "vermoegen";
    state.vermoegenTab = "uebersicht";
    state.selectedVermoegenId = "";
    resetWertstaendeFilters();
    setWertstaendeFilter("search", element.dataset.entity || "");
    // Der Sprung zeigt die Tabelle: die sonst zugeklappte Kachel aufmachen.
    oeffneKlappKachel("vermoegen.wertstaende");
    commitNavigation();
    document.getElementById?.("vermoegen-wertstaende")?.scrollIntoView?.({ block: "start" });
  },
  "clear-wertstaende-filter": (element) => {
    setWertstaendeFilter(element.dataset.filterName, "");
    ablauf.render();
  },
  "reset-wertstaende-filters": () => {
    resetWertstaendeFilters();
    ablauf.render();
  },
  "vermoegen-tab": (element) => {
    state.view = "vermoegen";
    state.vermoegenTab = element.dataset.tab || "uebersicht";
    state.selectedVermoegenId = "";
    state.vermoegenDetailRailClosed = false;
    commitNavigation();
  },
  "select-vermoegen-objekt": (element) => {
    oeffneVermoegenObjekt(element.dataset.vermoegen);
    listeDetailAuswahlZeigen();
  },
  "select-vermoegen-konto": (element) => {
    oeffneVermoegenObjekt(`konto:${element.dataset.account}`);
  },
  "immobilie-drill": (element) => {
    state.immobilieDrill = state.immobilieDrill === element.dataset.drill ? "" : element.dataset.drill;
    ablauf.render();
  },
  "immobilie-rate": (element) => {
    state.immobilieOhneRate = element.dataset.rate === "ohne";
    ablauf.render();
  },
  "open-vermoegen-entity": (element) => {
    oeffneVermoegenObjekt(`${element.dataset.vklasse}:${element.dataset.vid}`);
  },
};

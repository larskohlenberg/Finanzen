// app/aktionen/vorsorge.mjs
// Aktionen (data-action) – Vorsorge: Vertraege, Tabs, Personenfilter.
import { ablauf } from "../ablauf.mjs";
import { data, state } from "../runtime.mjs";
import { commitNavigation } from "../verlauf.mjs";
import { listeDetailAuswahlZeigen } from "../komponenten.mjs";
import { resetVorsorgeFilters } from "../views/vorsorge.mjs";
import { tabFuerVorsorge } from "../vorsorge-rechnung.mjs";

export const aktionen = {
  "open-vorsorge": (element) => {
    state.view = "vorsorge";
    resetVorsorgeFilters();
    state.selectedVorsorgeId = element.dataset.vorsorge || "";
    commitNavigation();
  },
  "select-vorsorge": (element) => {
    // Aus einem anderen Tab (z. B. Offene Punkte): Personenfilter nicht mitnehmen.
    const vs = (data.vorsorge ?? []).find((v) => v.vorsorge_id === element.dataset.vorsorge);
    if (!vs || tabFuerVorsorge(vs) !== state.vorsorgeTab) resetVorsorgeFilters();
    state.view = "vorsorge";
    state.selectedVorsorgeId = element.dataset.vorsorge || "";
    commitNavigation();
    listeDetailAuswahlZeigen();
  },
  "vorsorge-tab": (element) => {
    state.view = "vorsorge";
    state.vorsorgeTab = element.dataset.tab || "uebersicht";
    state.selectedVorsorgeId = "";
    resetVorsorgeFilters();
    commitNavigation();
  },
  "vorsorge-person": (element) => {
    state.vorsorgeFilters.person = element.dataset.person || "";
    ablauf.render();
  },
};

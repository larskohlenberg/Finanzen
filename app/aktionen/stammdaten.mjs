// app/aktionen/stammdaten.mjs
// Aktionen (data-action) – Administration: Konten, Regeln, Checks.
import { zuBuchungen } from "../navigation.mjs";
import { state } from "../runtime.mjs";
import { zeigeChecks, commitNavigation } from "../verlauf.mjs";

export const aktionen = {
  "open-account-master": (element) => {
    state.view = "masterdata";
    state.masterSection = "konten";
    state.selectedKonto = element.dataset.account || "";
    commitNavigation();
  },
  "select-master-account": (element) => {
    state.view = "masterdata";
    state.masterSection = "konten";
    state.selectedKonto = element.dataset.account || "";
    commitNavigation();
  },
  "close-account-rail": () => {
    state.selectedKonto = "";
    commitNavigation();
  },
  "close-regel-rail": () => {
    state.selectedRegel = "";
    state.regelRailWide = false;
    commitNavigation();
  },
  "toggle-regel-rail-width": () => {
    state.regelRailWide = !state.regelRailWide;
    commitNavigation();
  },
  "show-checks-for": (element) => {
    const scope = element.dataset.scope;
    const entity = element.dataset.entity;
    if (scope === "konto") {
      zuBuchungen(state, { filter: { account: entity } });
    } else if (scope === "transaktion") {
      zuBuchungen(state, { auswahl: entity });
    } else {
      zeigeChecks();
    }
    commitNavigation();
  },
  "open-entity": (element, action) => aktionen["show-checks-for"](element, action),
};

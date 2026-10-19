// app/aktionen/stammdaten.mjs
// Aktionen (data-action) – Administration: Konten, Regeln, Checks.
import { zuBuchungen } from "../navigation.mjs";
import { state } from "../runtime.mjs";
import { zeigeChecks, commitNavigation, oeffneVermoegenObjekt } from "../verlauf.mjs";

export const aktionen = {
  // Ein Konto hat genau ein Detail: Vermoegen -> Konten (Wert, Wertstaende,
  // Dokumente, Buchungen). Die Administration listet die Konten nur.
  "open-account-master": (element) => oeffneVermoegenObjekt(`konto:${element.dataset.account || ""}`),
  "select-master-account": (element) => oeffneVermoegenObjekt(`konto:${element.dataset.account || ""}`),
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

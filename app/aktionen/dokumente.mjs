// app/aktionen/dokumente.mjs
// Aktionen (data-action) – Dokumente und Upload.
import { ablauf } from "../ablauf.mjs";
import { state } from "../runtime.mjs";
import { commitNavigation } from "../verlauf.mjs";
import { ladeBelege, toggleBelegeSort, toggleBelegeOrdner, ordnerDerAuswahl, waehleAusschnittOrdner, toggleAusschnittOrdner } from "../views/belege.mjs";
import { ladeInbox } from "../views/upload.mjs";

export const aktionen = {
  "upload-choose": () => {
    document.getElementById("upload-input")?.click();
  },
  "upload-refresh": () => {
    void ladeInbox(render);
  },
  "belege-refresh": () => {
    void ladeBelege(render);
  },
  "select-beleg": (element) => {
    state.view = "belege";
    state.selectedBeleg = element.dataset.beleg || "";
    commitNavigation();
  },
  "close-beleg": () => {
    state.selectedBeleg = ordnerDerAuswahl(state.selectedBeleg);
    commitNavigation();
  },
  "select-dok-ausschnitt-ordner": (element) => {
    waehleAusschnittOrdner(element.dataset.dokAusschnitt, element.dataset.belegOrdner);
    ablauf.render();
  },
  "toggle-dok-ausschnitt-ordner": (element) => {
    toggleAusschnittOrdner(element.dataset.dokAusschnitt, element.dataset.belegOrdner);
    ablauf.render();
  },
  "toggle-beleg-ordner": (element) => {
    toggleBelegeOrdner(element.dataset.belegOrdner);
    ablauf.render();
  },
  "sort-belege": (element) => {
    toggleBelegeSort(element.dataset.belegSort);
    ablauf.render();
  },
};

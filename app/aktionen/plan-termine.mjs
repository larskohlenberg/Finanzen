// app/aktionen/plan-termine.mjs
// Aktionen (data-action) – Plan & Ist und Termine.
import { ablauf } from "../ablauf.mjs";
import { zuBuchungen } from "../navigation.mjs";
import { state } from "../runtime.mjs";
import { commitNavigation } from "../verlauf.mjs";

export const aktionen = {
  "rz-zeigen": (element) => {
    state.regelzahlungZeigen = element.dataset.zeigen || "aktiv";
    ablauf.render();
  },
  "rz-sort": (element) => {
    const key = element.dataset.sort;
    const alt = state.regelzahlungSort;
    state.regelzahlungSort = { key, dir: alt.key === key && alt.dir === "asc" ? "desc" : "asc" };
    ablauf.render();
  },
  // Letzte Buchung einer Regelzahlung: alle ihre Buchungen.
  "regelzahlung-buchungen": (element) => {
    zuBuchungen(state, { filter: { regelzahlung: element.dataset.regelzahlung } });
    commitNavigation();
  },
  "open-regelzahlung": (element) => {
    // Querlink aus der Szenario-Rechengrundlage auf die konkrete Regelzahlung.
    state.view = "termine";
    state.termineTab = "regelzahlungen";
    state.selectedRegelzahlungId = element.dataset.regelzahlung || "";
    commitNavigation();
    // Die angesteuerte Zeile steht oft weit unten in der Liste.
    document.getElementById?.(`regelzahlung-${state.selectedRegelzahlungId}`)?.scrollIntoView?.({ block: "center" });
  },
  // Aus den Kacheln der Uebersicht (data-periode "12m") oder der Verlaufstabelle
  // in einen Zeitraum springen; Granularitaet, Darstellung und aufgeklappte
  // Kategorien wechseln innerhalb der Seite.
  "plan-ist": (element) => {
    state.view = "planIst";
    state.planIst.periode = element.dataset.periode ?? "";
    state.planIstOffen.clear();
    commitNavigation();
  },
  "plan-ist-periode": (element, action) => aktionen["plan-ist"](element, action),
  "plan-ist-gran": (element) => {
    state.planIst.granularitaet = element.dataset.gran || "jahr";
    if (state.planIst.periode !== "12m") state.planIst.periode = "";
    commitNavigation({ ersetzen: true });
  },
  "plan-ist-darstellung": (element) => {
    state.planIst.darstellung = element.dataset.darstellung === "summe" ? "summe" : "monat";
    ablauf.render();
  },
  "plan-ist-zeile": (element) => {
    const key = element.dataset.zeile ?? "";
    if (state.planIstOffen.has(key)) state.planIstOffen.delete(key);
    else state.planIstOffen.add(key);
    ablauf.render();
  },
  "termine-tab": (element) => {
    state.view = "termine";
    state.termineTab = element.dataset.tab || "regelzahlungen";
    state.selectedRegelzahlungId = "";
    commitNavigation();
  },
};

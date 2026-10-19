// app/aktionen/szenarien.mjs
// Aktionen (data-action) – Szenarien: Liste, Vergleich, Detailschalter.
import { ablauf } from "../ablauf.mjs";
import { data, state } from "../runtime.mjs";
import { oeffneSzenario, commitNavigation } from "../verlauf.mjs";
import { MAX_VERGLEICH } from "../views/szenarien.mjs";

export const aktionen = {
  "open-szenario": (element) => {
    // Liste, Vergleich oder Querlink -> Detail; eigener History-Eintrag, damit Zurueck zur Liste fuehrt.
    state.view = "szenarien";
    oeffneSzenario(element.dataset.szenario || "");
    commitNavigation();
  },
  "back-to-szenarien": () => {
    oeffneSzenario("");
    commitNavigation();
  },
  "toggle-szenario-auswahl": (element) => {
    const id = element.dataset.szenario;
    if (state.szenarioAuswahl.has(id)) state.szenarioAuswahl.delete(id);
    else if (state.szenarioAuswahl.size < MAX_VERGLEICH) state.szenarioAuswahl.add(id);
    ablauf.render();
  },
  "szenarien-vergleichen": () => {
    const bekannt = new Set((data.szenarien ?? []).map((s) => s.szenario_id));
    oeffneSzenario("");
    state.szenarioVergleichIds = (data.szenarien ?? []).map((s) => s.szenario_id).filter((id) => state.szenarioAuswahl.has(id) && bekannt.has(id));
    commitNavigation();
  },
  "set-szenario-modus": (element) => {
    state.szenarioDiagrammModus = element.dataset.wert === "differenz" ? "differenz" : "absolut";
    ablauf.render();
  },
  "set-szenario-aufloesung": (element) => {
    state.szenarioAufloesung = element.dataset.wert === "monat" ? "monat" : "jahr";
    ablauf.render();
  },
  "set-szenario-netto-ansicht": (element) => {
    state.szenarioNettoTabelle = element.dataset.wert === "tabelle";
    ablauf.render();
  },
  "toggle-szenario-phase": (element) => {
    const i = Number(element.dataset.phase);
    if (state.szenarioPhaseOffen.has(i)) state.szenarioPhaseOffen.delete(i);
    else state.szenarioPhaseOffen.add(i);
    ablauf.render();
  },
  "toggle-szenario-beschreibung": () => {
    state.szenarioBeschreibungOffen = !state.szenarioBeschreibungOffen;
    ablauf.render();
  },
  "toggle-szenario-netto": () => {
    state.szenarioNettoOffen = !state.szenarioNettoOffen;
    ablauf.render();
  },
  "toggle-szenario-grundlage": () => {
    state.szenarioGrundlageOffen = !state.szenarioGrundlageOffen;
    ablauf.render();
  },
  "toggle-szenario-basis": () => {
    state.szenarioBasisExpanded = !state.szenarioBasisExpanded;
    ablauf.render();
  },
};

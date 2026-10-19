// app/views/termine.mjs
// Seite Termine: Regelzahlungen und Fristen als zwei Reiter. Beide beantworten,
// was wann ansteht; das Menue bekommt dafuer nur einen Eintrag.
import { data, state, t, tf, escapeHtml } from "../runtime.mjs";
import { renderPageHead, heuteIso } from "../komponenten.mjs";
import { TERMINE_TABS } from "../routing.mjs";
import { renderRegelzahlungen } from "./regelzahlungen.mjs";
import { fristenZaehler, renderFristen } from "./fristen.mjs";

function renderTabs(aktiv, today) {
  const rz = data.regelzahlungen ?? [];
  const fr = fristenZaehler(today);
  const reiter = {
    regelzahlungen: {
      titel: `${rz.length} ${t("termine.tabs.regelzahlungen")}`,
      unter: tf("termine.tabRegelzahlungenUnter", { n: rz.filter((r) => r.status === "bestaetigt").length }),
      punkt: 0,
    },
    fristen: {
      titel: `${fr.anzahl} ${t("termine.tabs.fristen")}`,
      unter: fr.bald ? tf("termine.tabFristenBald", { n: fr.bald }) : t("termine.tabFristenRuhig"),
      punkt: fr.ueberfaellig,
    },
  };
  const knopf = (tab) => {
    const { titel, unter, punkt } = reiter[tab];
    const marke = punkt ? `<span class="tab-punkt" title="${escapeHtml(tf("termine.ueberfaelligAnzahl", { n: punkt }))}"></span>` : "";
    return `
      <button class="vermoegen-tab ${tab === aktiv ? "active" : ""}" role="tab" aria-selected="${tab === aktiv}" aria-controls="termine-tab-${tab}" data-action="termine-tab" data-tab="${tab}">
        <span class="vermoegen-tab-titel">${escapeHtml(titel)}${marke}</span>
        <span class="vermoegen-tab-unter">${escapeHtml(unter)}</span>
      </button>`;
  };
  return `<div class="vermoegen-tabs" role="tablist" aria-label="${escapeHtml(t("termine.title"))}">${TERMINE_TABS.map(knopf).join("")}</div>`;
}

export function renderTermine() {
  const today = heuteIso();
  const aktiv = TERMINE_TABS.includes(state.termineTab) ? state.termineTab : "regelzahlungen";
  return `
    ${renderPageHead(t("termine.title"), t("termine.lead"))}
    ${renderTabs(aktiv, today)}
    <div id="termine-tab-${aktiv}" role="tabpanel">
      ${aktiv === "fristen" ? renderFristen(today) : renderRegelzahlungen()}
    </div>`;
}

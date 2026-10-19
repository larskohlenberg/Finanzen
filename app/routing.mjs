// app/routing.mjs
// Reine Hash-Routing-Logik (kein DOM): Zustand <-> Hash-Route. Damit sind
// Detailansichten adressierbar (#/transaktionen/TXN-…, #/konten/KTO-…), sodass
// Checks (M8) und Laufprotokolle auf konkrete Datensätze verlinken können.
// Getestet ueber parseRoute/routeFromState; die DOM-Anbindung liegt in main.js.
import { dokumentRoute, belegPfadAusRoute, kodierePfad } from "./belege.mjs";
import { KLASSE_FUER_TAB, TAB_FUER_KLASSE, VERMOEGEN_TABS, vermoegenRoute } from "./vermoegen-routen.mjs";
import { VORSORGE_TABS } from "./vorsorge-rechnung.mjs";
import { PERIODE_MUSTER } from "./plan-ist.mjs";

const VIEW_SLUG = {
  overview: "uebersicht",
  transactions: "transaktionen",
  liquiditaet: "liquiditaet",
  planIst: "plan-ist",
  vermoegen: "vermoegen",
  vorsorge: "vorsorge",
  termine: "termine",
  szenarien: "szenarien",
  masterdata: "administration",
  upload: "hochladen",
  belege: "dokumente",
};
const SLUG_VIEW = Object.fromEntries(Object.entries(VIEW_SLUG).map(([view, slug]) => [slug, view]));
export const ADMIN_BEREICHE = ["personen", "konten", "kategorien", "regeln", "checks", "export"];
// Termine: Regelzahlungen (Standard) und Fristen als Reiter einer Seite.
export const TERMINE_TABS = ["regelzahlungen", "fristen"];

// Zustand -> Hash. Auswahl hat Vorrang, damit ein geöffnetes Detail teilbar ist.
export function routeFromState(state) {
  if (state.view === "transactions" && state.selectedTransactionId) {
    return `#/transaktionen/${encodeURIComponent(state.selectedTransactionId)}`;
  }
  // Transaktionen gefiltert auf ein Quelldokument (Pfad ohne "Belege/").
  const belegFilter = state.transactionFilters?.beleg;
  if (state.view === "transactions" && belegFilter?.startsWith("Belege/")) {
    return `#/transaktionen/dokument/${kodierePfad(belegFilter.slice("Belege/".length))}`;
  }
  // Transaktionen gefiltert auf die Beitragsbuchungen eines Vorsorgevertrags.
  if (state.view === "transactions" && state.transactionFilters?.vorsorge) {
    return `#/transaktionen/vorsorge/${encodeURIComponent(state.transactionFilters.vorsorge)}`;
  }
  // Dokumente: Datei oder Ordner unter Belege/.
  if (state.view === "belege") return dokumentRoute(state.selectedBeleg);
  if (state.view === "vorsorge" && state.selectedVorsorgeId) {
    return `#/vorsorge/${encodeURIComponent(state.selectedVorsorgeId)}`;
  }
  if (state.view === "vorsorge" && VORSORGE_TABS.includes(state.vorsorgeTab) && state.vorsorgeTab !== "uebersicht") {
    return `#/vorsorge/${state.vorsorgeTab}`;
  }
  // Konto-Stammsatz (Stammdaten -> Konten, angesteuerter Datensatz).
  if (state.view === "masterdata" && state.masterSection === "konten" && state.selectedKonto) {
    return `#/konten/${encodeURIComponent(state.selectedKonto)}`;
  }
  // Regel-Stammsatz (Stammdaten -> Regeln, angesteuerter Datensatz).
  if (state.view === "masterdata" && state.masterSection === "regeln" && state.selectedRegel) {
    return `#/regeln/${encodeURIComponent(state.selectedRegel)}`;
  }
  // Administration: Bereich adressierbar (#/administration/checks); Konten sind der Standard.
  if (state.view === "masterdata") {
    const bereich = state.masterSection;
    return bereich && bereich !== "konten" && ADMIN_BEREICHE.includes(bereich) ? `#/administration/${bereich}` : "#/administration";
  }
  // Vermoegen: Tab und ggf. ausgewaehltes Objekt (#/vermoegen/immobilien/IMM-004).
  if (state.view === "vermoegen") {
    const [klasse, id] = String(state.selectedVermoegenId ?? "").split(":");
    if (klasse && id && TAB_FUER_KLASSE[klasse]) return vermoegenRoute(klasse, id);
    const tab = state.vermoegenTab;
    if (tab && tab !== "uebersicht" && VERMOEGEN_TABS.includes(tab)) return `#/vermoegen/${tab}`;
    return "#/vermoegen";
  }
  // Szenarien: Vergleich mehrerer (#/szenarien/vergleich/SZN-001,SZN-003) oder Detail,
  // optional gegen ein anderes Szenario statt der Basis (#/szenarien/SZN-001/gegen/SZN-002).
  if (state.view === "szenarien" && state.szenarioVergleichIds?.length) {
    return `#/szenarien/vergleich/${state.szenarioVergleichIds.map(encodeURIComponent).join(",")}`;
  }
  if (state.view === "szenarien" && state.selectedSzenarioId) {
    const gegen = state.szenarioVergleichMit ? `/gegen/${encodeURIComponent(state.szenarioVergleichMit)}` : "";
    return `#/szenarien/${encodeURIComponent(state.selectedSzenarioId)}${gegen}`;
  }
  // Termine: Regelzahlung als adressierbares Ziel (Querlink aus der Szenario-
  // Rechengrundlage), sonst der Reiter (#/termine/fristen).
  if (state.view === "termine") {
    if (state.termineTab === "fristen") return "#/termine/fristen";
    if (state.selectedRegelzahlungId) return `#/termine/regelzahlungen/${encodeURIComponent(state.selectedRegelzahlungId)}`;
    return "#/termine";
  }
  // Plan & Ist mit gewaehltem Zeitraum (#/plan-ist/2026-Q2).
  if (state.view === "planIst" && state.planIst?.periode) return `#/plan-ist/${encodeURIComponent(state.planIst.periode)}`;
  return `#/${VIEW_SLUG[state.view] || state.view}`;
}

// Hash -> Zustandsfragment { view, selectedTransactionId?, selectedVermoegenId?, masterSection? }.
// Konto ist als Vermögens-Position adressierbar (eigene Detailansicht mit Rail).
export function parseRoute(hash) {
  const clean = String(hash || "").replace(/^#\/?/, "").replace(/\/+$/, "");
  if (!clean) return { view: "overview" };
  const [head, ...rest] = clean.split("/");
  let tail;
  try {
    tail = rest.length ? decodeURIComponent(rest.join("/")) : "";
  } catch {
    // Kaputte Prozent-Kodierung: auf die Liste der Ansicht zurueckfallen.
    return SLUG_VIEW[head] ? { view: SLUG_VIEW[head] } : { view: "overview" };
  }

  if (head === "plan-ist") {
    return PERIODE_MUSTER.test(tail) ? { view: "planIst", planIstPeriode: tail } : { view: "planIst" };
  }
  if (head === "dokumente") {
    return tail ? { view: "belege", selectedBeleg: belegPfadAusRoute(tail) } : { view: "belege" };
  }
  if (head === "transaktionen" && rest[0] === "vorsorge" && rest[1]) {
    return { view: "transactions", vorsorgeFilter: decodeURIComponent(rest[1]) };
  }
  if (head === "transaktionen" && rest[0] === "dokument" && rest.length > 1) {
    return { view: "transactions", belegFilter: belegPfadAusRoute(tail.slice("dokument/".length)) };
  }
  if (head === "transaktionen") {
    return tail ? { view: "transactions", selectedTransactionId: tail } : { view: "transactions" };
  }
  if (head === "konten") {
    return tail
      ? { view: "masterdata", masterSection: "konten", selectedKonto: tail }
      : { view: "masterdata", masterSection: "konten" };
  }
  if (head === "regeln") {
    return tail
      ? { view: "masterdata", masterSection: "regeln", selectedRegel: tail }
      : { view: "masterdata", masterSection: "regeln" };
  }
  if (head === "administration") {
    return ADMIN_BEREICHE.includes(rest[0]) ? { view: "masterdata", masterSection: rest[0] } : { view: "masterdata", masterSection: "konten" };
  }
  // Alte Slugs aus der Zeit vor der Administration bleiben gueltig.
  if (head === "stammdaten") return { view: "masterdata", masterSection: "konten" };
  if (head === "checks" || head === "export") return { view: "masterdata", masterSection: head };
  if (head === "vermoegen") return vermoegenAusRoute(rest.map((teil) => decodeURIComponent(teil)));
  // #/vorsorge[/<tab>|/<VS-ID>]; der Tab eines Vertrags folgt aus seiner Art.
  if (head === "vorsorge") {
    if (!tail || tail === "uebersicht") return { view: "vorsorge" };
    return VORSORGE_TABS.includes(tail) ? { view: "vorsorge", vorsorgeTab: tail } : { view: "vorsorge", selectedVorsorgeId: tail };
  }
  if (head === "szenarien") {
    if (!tail) return { view: "szenarien" };
    const teile = tail.split("/");
    if (teile[0] === "vergleich") {
      const ids = (teile[1] ?? "").split(",").filter(Boolean);
      return ids.length ? { view: "szenarien", szenarioVergleichIds: ids } : { view: "szenarien" };
    }
    if (teile[1] === "gegen" && teile[2]) return { view: "szenarien", selectedSzenarioId: teile[0], szenarioVergleichMit: teile[2] };
    return { view: "szenarien", selectedSzenarioId: teile[0] };
  }
  // #/termine[/fristen|/regelzahlungen[/<RZ-ID>]]; die alte Form #/regelzahlungen[/<RZ-ID>] bleibt gueltig.
  if (head === "termine") {
    const [tab = "", id = ""] = rest.map((teil) => decodeURIComponent(teil));
    if (tab === "fristen") return { view: "termine", termineTab: "fristen" };
    return id && tab === "regelzahlungen"
      ? { view: "termine", termineTab: "regelzahlungen", selectedRegelzahlungId: id }
      : { view: "termine", termineTab: "regelzahlungen" };
  }
  if (head === "regelzahlungen") {
    return tail
      ? { view: "termine", termineTab: "regelzahlungen", selectedRegelzahlungId: tail }
      : { view: "termine", termineTab: "regelzahlungen" };
  }
  if (SLUG_VIEW[head]) return { view: SLUG_VIEW[head] };
  return { view: "overview" };
}

// #/vermoegen[/<tab>[/<ID>]] und die alte Form #/vermoegen/<klasse>:<id>
// (Links aus Checks, Dokumenten und Protokollen bleiben gueltig).
function vermoegenAusRoute([erster = "", zweiter = ""]) {
  if (erster.includes(":")) {
    const [klasse, id] = erster.split(":");
    if (klasse === "vorsorge" && id) return { view: "vorsorge", selectedVorsorgeId: id };
    if (TAB_FUER_KLASSE[klasse] && id) return { view: "vermoegen", vermoegenTab: TAB_FUER_KLASSE[klasse], selectedVermoegenId: `${klasse}:${id}` };
    return { view: "vermoegen", vermoegenTab: "uebersicht" };
  }
  if (!VERMOEGEN_TABS.includes(erster)) return { view: "vermoegen", vermoegenTab: "uebersicht" };
  if (zweiter && KLASSE_FUER_TAB[erster]) return { view: "vermoegen", vermoegenTab: erster, selectedVermoegenId: `${KLASSE_FUER_TAB[erster]}:${zweiter}` };
  return { view: "vermoegen", vermoegenTab: erster };
}

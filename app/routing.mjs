// app/routing.mjs
// Reine Hash-Routing-Logik (kein DOM): Zustand <-> Hash-Route. Damit sind
// Detailansichten adressierbar (#/transaktionen/TXN-…, #/konten/KTO-…), sodass
// Checks (M8) und Laufprotokolle auf konkrete Datensätze verlinken können.
// Getestet ueber parseRoute/routeFromState; die DOM-Anbindung liegt in main.js.

const VIEW_SLUG = {
  overview: "uebersicht",
  transactions: "transaktionen",
  liquiditaet: "liquiditaet",
  vermoegen: "vermoegen",
  vorsorge: "vorsorge",
  regelzahlungen: "regelzahlungen",
  szenarien: "szenarien",
  masterdata: "stammdaten",
  checks: "checks",
  export: "export",
};
const SLUG_VIEW = Object.fromEntries(Object.entries(VIEW_SLUG).map(([view, slug]) => [slug, view]));

// Zustand -> Hash. Auswahl hat Vorrang, damit ein geöffnetes Detail teilbar ist.
export function routeFromState(state) {
  if (state.view === "transactions" && state.selectedTransactionId) {
    return `#/transaktionen/${encodeURIComponent(state.selectedTransactionId)}`;
  }
  // Konto-Stammsatz (Stammdaten -> Konten, angesteuerter Datensatz).
  if (state.view === "masterdata" && state.masterSection === "konten" && state.selectedKonto) {
    return `#/konten/${encodeURIComponent(state.selectedKonto)}`;
  }
  // Regel-Stammsatz (Stammdaten -> Regeln, angesteuerter Datensatz).
  if (state.view === "masterdata" && state.masterSection === "regeln" && state.selectedRegel) {
    return `#/regeln/${encodeURIComponent(state.selectedRegel)}`;
  }
  if (state.view === "vermoegen" && state.selectedVermoegenId) {
    const [klasse, id] = state.selectedVermoegenId.split(":");
    if (klasse && id) return `#/vermoegen/${encodeURIComponent(klasse)}:${encodeURIComponent(id)}`;
  }
  if (state.view === "szenarien" && state.selectedSzenarioId) {
    return `#/szenarien/${encodeURIComponent(state.selectedSzenarioId)}`;
  }
  // Regelzahlung als adressierbares Ziel (Querlink aus der Szenario-Rechengrundlage).
  if (state.view === "regelzahlungen" && state.selectedRegelzahlungId) {
    return `#/regelzahlungen/${encodeURIComponent(state.selectedRegelzahlungId)}`;
  }
  return `#/${VIEW_SLUG[state.view] || state.view}`;
}

// Hash -> Zustandsfragment { view, selectedTransactionId?, selectedVermoegenId?, masterSection? }.
// Konto ist als Vermögens-Position adressierbar (eigene Detailansicht mit Rail).
export function parseRoute(hash) {
  const clean = String(hash || "").replace(/^#\/?/, "").replace(/\/+$/, "");
  if (!clean) return { view: "overview" };
  const [head, ...rest] = clean.split("/");
  const tail = rest.length ? decodeURIComponent(rest.join("/")) : "";

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
  if (head === "vermoegen") {
    return tail ? { view: "vermoegen", selectedVermoegenId: tail } : { view: "vermoegen" };
  }
  if (head === "vorsorge") {
    return { view: "vorsorge" };
  }
  if (head === "szenarien") {
    return tail ? { view: "szenarien", selectedSzenarioId: tail } : { view: "szenarien" };
  }
  if (head === "regelzahlungen") {
    return tail ? { view: "regelzahlungen", selectedRegelzahlungId: tail } : { view: "regelzahlungen" };
  }
  if (SLUG_VIEW[head]) return { view: SLUG_VIEW[head] };
  return { view: "overview" };
}

// app/demo-modus.mjs
// Was im Demo-Modus anders ist (reine Funktionen, ohne DOM): Dokumente, Export
// und Inbox kommen dann nie aus den echten Verzeichnissen. Demo-Dokumente
// liegen unter data/demo-belege/ (neben dem Bestand, der flach bleibt) und
// tragen dieselben Pfade ("Belege/...") wie echte, damit Verweise aus den
// Demodaten gleich funktionieren.
import { BELEGE_WURZEL, kodierePfad } from "./belege.mjs";
import { parseRoute, routeFromState } from "./routing.mjs";

const istDemo = (dataMode) => dataMode === "demo";
const quelle = (dataMode) => (istDemo(dataMode) ? "?quelle=demo" : "");

// Fester "heute" der Demo: das Ende der Demo-Buchungen. So passt die Demo zu
// jedem Datum (Kennzahlen, Faelligkeiten, Checks), statt mit der Zeit zu veralten.
export const DEMO_STICHTAG = "2026-06-30";

export function belegeApiUrl(dataMode) {
  return `./api/belege${quelle(dataMode)}`;
}

// Datei-URL eines Dokuments ("Belege/..."), relativ zur App.
export function belegDateiUrl(pfad, dataMode) {
  const p = String(pfad ?? "");
  if (!istDemo(dataMode)) return kodierePfad(p);
  return `data/demo-belege/${kodierePfad(p.startsWith(`${BELEGE_WURZEL}/`) ? p.slice(BELEGE_WURZEL.length + 1) : p)}`;
}

export function exportUrl(art, dataMode) {
  return `./api/export/${art}${quelle(dataMode)}`;
}

// Im Demo-Modus wird nichts hochgeladen: die Inbox gehoert dem echten Bestand.
export function uploadMoeglich(dataMode) {
  return !istDemo(dataMode);
}

// Nach dem Wechsel zwischen Echt und Demo: dieselbe Seite und derselbe Reiter,
// aber ohne ausgewaehlten Datensatz, Filter oder Dokument; die gehoeren zum
// anderen Bestand.
const BEHALTEN = ["view", "masterSection", "vermoegenTab", "vorsorgeTab", "termineTab"];

export function hashNachModuswechsel(hash) {
  if (!String(hash ?? "").replace(/^#\/?/, "")) return "";
  const route = parseRoute(hash);
  return routeFromState(Object.fromEntries(BEHALTEN.filter((k) => route[k] !== undefined).map((k) => [k, route[k]])));
}

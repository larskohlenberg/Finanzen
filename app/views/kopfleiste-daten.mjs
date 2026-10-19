// app/views/kopfleiste-daten.mjs
// Zaehler und naechste Agentenaktion der Kopfleiste kommen vom App-Server
// (GET /api/v1/kopfleiste, Rechnung in app/kopfleiste.mjs). Solange die
// Antwort laedt, gilt die letzte (oder null).
import { state } from "../runtime.mjs";
import { heuteIso } from "../selektoren.mjs";
import { erstelleApiCache } from "../api-daten.mjs";

const cache = erstelleApiCache({ maxEintraege: 4 });

export function kopfleisteAntwort() {
  const suche = new URLSearchParams();
  if (state.dataMode === "demo") suche.set("quelle", "demo");
  suche.set("heute", heuteIso());
  return cache.hole(`./api/v1/kopfleiste?${suche}`).antwort;
}

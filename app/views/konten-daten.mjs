// app/views/konten-daten.mjs
// Werte der Konten (Wert heute, Tabellenzeile, Buchungen seit dem Anker,
// Saldoverlauf, Reihenfolge und Bloecke der Kontentabellen) kommen vom
// App-Server (GET /api/v1/konten, Rechnung in app/konten-modell.mjs). Genutzt
// von der Vermoegensseite und den Stammdaten.
import { state } from "../runtime.mjs";
import { erstelleApiCache } from "../api-daten.mjs";

const cache = erstelleApiCache({ maxEintraege: 4 });

// -> { antwort, fehler, laedt, veraltet }
export function kontenAntwort(heute) {
  const suche = new URLSearchParams();
  if (state.dataMode === "demo") suche.set("quelle", "demo");
  suche.set("heute", heute);
  return cache.hole(`./api/v1/konten?${suche}`);
}

// app/views/belegverweise-daten.mjs
// Verweis-Index der Dokumente (welche Datensaetze und wie viele Buchungen eine
// Datei als Quelle nennen). Die Buchungen je Beleg rechnet der App-Server
// (GET /api/v1/belegverweise, buchungsBelege in app/belege.mjs); die uebrigen
// Verweise kommen aus den Stammdaten im Browser. Solange die Antwort laedt,
// zaehlen keine Buchungen mit; ist sie da, wird neu gezeichnet.
import { data, datenVersion, state } from "../runtime.mjs";
import { verweisIndex } from "../belege.mjs";
import { erstelleApiCache } from "../api-daten.mjs";

const cache = erstelleApiCache({ maxEintraege: 2 });
let stand = null;

export function verweise() {
  const pfad = `./api/v1/belegverweise${state.dataMode === "demo" ? "?quelle=demo" : ""}`;
  const buchungen = cache.hole(pfad).antwort?.buchungen ?? {};
  if (stand?.version !== datenVersion() || stand.buchungen !== buchungen) {
    stand = { version: datenVersion(), buchungen, wert: verweisIndex(data, { buchungen }) };
  }
  return stand.wert;
}

// app/selektoren.mjs
// View-uebergreifende Ableitungen aus den Grunddaten im Browser (reine
// Lesezugriffe, kein DOM). Was Buchungen braucht, rechnet der App-Server
// (lese-api.mjs); hier bleibt nur, was ohne sie geht.
import { data, state } from "./runtime.mjs";
import { localTodayIso } from "./liquiditaet.mjs";

// "Heute" der Oberflaeche: state.heute (fuer Tests mit fester Uhr), sonst das
// lokale Datum. Die Views nehmen ihr Datum hierueber.
export function heuteIso() {
  return state.heute || localTodayIso();
}

export function missingReferenceChecks() {
  return data.checks.filter((check) => check.title_key === "checks.accountReferenceMissing.title");
}

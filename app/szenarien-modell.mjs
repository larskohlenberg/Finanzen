// app/szenarien-modell.mjs
// Was die Szenarien aus Buchungen brauchen, als reine Funktion ueber einen
// Bestand: rechnet im App-Server (lese-api.mjs, GET /api/v1/szenarien). Die
// Szenariorechnung selbst (szenarien.mjs) bleibt im Browser; sie braucht aus
// den Buchungen nur den Startbestand, also die Positionen des
// Nettovermoegens, und fuer den Hinweis der Rechengrundlage die Zahl der
// Warnungen zum Prognose-Realismus.
import { importAbdeckung } from "./klassifikation.mjs";
import { computeNettovermoegen } from "./vermoegen.mjs";
import { guardrailWarnungen } from "./szenarien.mjs";

export function szenarienModell(daten, heute) {
  return {
    heute,
    positionen: computeNettovermoegen(daten, heute).positionen,
    guardrails: guardrailWarnungen(daten, heute, { vollstaendigBis: importAbdeckung(daten, heute).vollstaendig_bis }).length,
  };
}

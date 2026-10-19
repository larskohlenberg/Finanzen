// app/szenarien-modell.mjs
// Was die Szenarien aus Buchungen brauchen, als reine Funktion ueber einen
// Bestand: rechnet im App-Server (lese-api.mjs, GET /api/v1/szenarien). Die
// Szenariorechnung selbst (szenarien.mjs) bleibt im Browser; sie braucht aus
// den Buchungen nur den Startbestand, also die Positionen des
// Nettovermoegens, und fuer den Hinweis der Rechengrundlage die Zahl der
// Warnungen zum Prognose-Realismus.
import { computeNettovermoegen } from "./vermoegen.mjs";
import { guardrailWarnungen } from "./szenarien.mjs";
import { kontenGruppen } from "./uebersicht-rechnung.mjs";

export function szenarienModell(daten, heute) {
  return {
    heute,
    positionen: computeNettovermoegen(daten, heute).positionen,
    guardrails: guardrailWarnungen(daten, heute, { vollstaendigBis: kontenGruppen(daten, heute).konten.aeltester }).length,
  };
}

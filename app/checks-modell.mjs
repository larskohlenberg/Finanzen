// app/checks-modell.mjs
// Pruefungen der Administration als reine Funktion ueber einen Bestand:
// rechnet im App-Server (lese-api.mjs, GET /api/v1/checks) mit denselben
// Funktionen wie zuvor die Ansicht. Transfers nur als Anzahl und die
// unvollstaendigen mit Id und Betrag, dazu die Vermoegens-Checks und die
// Hinweise zum Prognose-Realismus.
import { prognoseRealismus, transferPruefung } from "./kopfleiste.mjs";
import { computeVermoegenChecks } from "./vermoegen.mjs";

export function checksModell(daten, heute) {
  const transfers = transferPruefung(daten);
  return {
    heute,
    transfers: {
      anzahl: transfers.length,
      unvollstaendig: transfers.filter((tc) => !tc.ok).map(({ transfer_id, betrag }) => ({ transfer_id, betrag })),
    },
    vermoegen: computeVermoegenChecks(daten, heute),
    guardrails: prognoseRealismus(daten, heute),
  };
}

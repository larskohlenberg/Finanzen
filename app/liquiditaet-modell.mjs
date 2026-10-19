// app/liquiditaet-modell.mjs
// Liquiditaet als reine Funktion ueber einen Bestand: rechnet im App-Server
// (lese-api.mjs, GET /api/v1/liquiditaet) mit denselben Funktionen wie zuvor
// die Ansicht (liquiditaet.mjs). Zurueck gehen Salden, Verlaeufe, die
// Prognoseposten und die naechsten grossen Zahlungen, keine Buchungslisten.
import { anstehendeJahreszahlungen, computeLiquiditaetIst, computeLiquiditaetPrognoseDetail, liquiditaetVerlauf } from "./liquiditaet.mjs";

export const GRANULARITAETEN = Object.freeze(["monat", "quartal", "jahr"]);

export function liquiditaetModell(daten, { heute, bis, granularitaet }) {
  return {
    heute,
    ist: computeLiquiditaetIst(daten, { today: heute }),
    verlauf: liquiditaetVerlauf(daten, heute, 24),
    prognose: computeLiquiditaetPrognoseDetail(daten, { today: heute, horizonEnd: bis, granularitaet }),
    // Jaehrliche Abfluesse der naechsten drei Monate.
    zahlungen: anstehendeJahreszahlungen(daten.regelzahlungen, heute, 3).map(({ datum, regelzahlung: rz }) => ({
      datum,
      regelzahlung: { regelzahlung_id: rz.regelzahlung_id, bezeichnung: rz.bezeichnung, betrag: rz.betrag },
    })),
  };
}

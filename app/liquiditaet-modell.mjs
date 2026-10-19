// app/liquiditaet-modell.mjs
// Liquiditaet als reine Funktion ueber einen Bestand: rechnet im App-Server
// (lese-api.mjs, GET /api/v1/liquiditaet) mit denselben Funktionen wie zuvor
// die Ansicht (liquiditaet.mjs). Zurueck gehen Salden, Verlaeufe, die
// Prognoseposten, die naechsten grossen Zahlungen und der Trend von Einnahmen
// und Ausgaben, keine Buchungslisten.
import { anstehendeJahreszahlungen, computeLiquiditaetIst, computeLiquiditaetPrognoseDetail, liquiditaetVerlauf } from "./liquiditaet.mjs";
import { kontenGruppen, monatsTrend } from "./uebersicht-rechnung.mjs";

export const GRANULARITAETEN = Object.freeze(["monat", "quartal", "jahr"]);

export function liquiditaetModell(daten, { heute, bis, granularitaet }) {
  return {
    heute,
    ist: computeLiquiditaetIst(daten, { today: heute }),
    verlauf: liquiditaetVerlauf(daten, heute, 24),
    // Einnahmen und Ausgaben als gleitendes 12-Monats-Mittel, Zeitraum wie die
    // Kacheln der Uebersicht (nur Monate, die alle Konten vollstaendig belegen).
    trend: monatsTrend(daten, heute, { vollstaendigBis: kontenGruppen(daten, heute).konten.aeltester, punkte: 24 }),
    prognose: computeLiquiditaetPrognoseDetail(daten, { today: heute, horizonEnd: bis, granularitaet }),
    // Jaehrliche Abfluesse der naechsten drei Monate.
    zahlungen: anstehendeJahreszahlungen(daten.regelzahlungen, heute, 3).map(({ datum, regelzahlung: rz }) => ({
      datum,
      regelzahlung: { regelzahlung_id: rz.regelzahlung_id, bezeichnung: rz.bezeichnung, betrag: rz.betrag },
    })),
  };
}

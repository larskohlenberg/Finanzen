// app/vorsorge-modell.mjs
// Vorsorgeseite als reine Funktion ueber einen Bestand: rechnet im App-Server
// (lese-api.mjs, GET /api/v1/vorsorge) mit denselben Funktionen wie zuvor die
// Ansicht. Vertraege, Regelzahlungen und Zeitwerte kennt der Browser; hier
// steht nur, was Buchungen braucht: offene Punkte der Vertraege,
// Rueckkaufswerte als Positionen des Nettovermoegens und je Vertrag Anzahl
// der gebuchten Beitraege, letzte Beitragsaenderung, Vorjahresvergleich und
// Vermoegensbezug.
import { computeNettovermoegen, computeVermoegenChecks } from "./vermoegen.mjs";
import { beitragsAenderungen, beitragVorjahr, gebuchteBeitraegeAlle, vermoegensBezug } from "./vorsorge-rechnung.mjs";

export function vorsorgeModell(daten, heute) {
  const vertraege = {};
  for (const vs of daten.vorsorge ?? []) {
    const id = vs.vorsorge_id;
    vertraege[id] = {
      anzahl_buchungen: gebuchteBeitraegeAlle(daten, id).length,
      letzte_aenderung: beitragsAenderungen(daten, id)[0] ?? null,
      vorjahr: beitragVorjahr(daten, id),
      bezug: vermoegensBezug(daten, id),
    };
  }
  return {
    heute,
    checks: computeVermoegenChecks(daten, heute).filter((c) => c.entitaet === "vorsorge"),
    positionen: computeNettovermoegen(daten, heute).positionen.filter((p) => p.klasse === "vorsorge"),
    vertraege,
  };
}

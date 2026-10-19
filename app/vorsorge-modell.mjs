// app/vorsorge-modell.mjs
// Vorsorgeseite als reine Funktion ueber einen Bestand: rechnet im App-Server
// (lese-api.mjs, GET /api/v1/vorsorge) mit denselben Funktionen wie zuvor die
// Ansicht. Vertraege, Regelzahlungen und Zeitwerte kennt der Browser; hier
// steht nur, was Buchungen braucht: offene Punkte der Vertraege,
// Rueckkaufswerte als Positionen des Nettovermoegens und je Vertrag Anzahl
// der gebuchten Beitraege, letzte Beitragsaenderung, Vorjahresvergleich,
// Vermoegensbezug und die Wertentwicklung (eingezahlt, Ertrag).
import { computeNettovermoegen, computeVermoegenChecks } from "./vermoegen.mjs";
import { beitragsAenderungen, beitragVorjahr, gebuchteBeitraegeAlle, vermoegensBezug, wertEntwicklung } from "./vorsorge-rechnung.mjs";

// Nur, was der Text zur letzten Aenderung zeigt.
const aenderung = (a) => (a ? { datum: a.datum, diff_cents: a.diff_cents, anteil: a.anteil } : null);

export function vorsorgeModell(daten, heute) {
  const vertraege = {};
  for (const vs of daten.vorsorge ?? []) {
    const id = vs.vorsorge_id;
    vertraege[id] = {
      anzahl_buchungen: gebuchteBeitraegeAlle(daten, id).length,
      letzte_aenderung: aenderung(beitragsAenderungen(daten, id)[0]),
      vorjahr: beitragVorjahr(daten, id),
      bezug: vermoegensBezug(daten, id),
      wert_entwicklung: wertEntwicklung(daten, id),
    };
  }
  return {
    heute,
    checks: computeVermoegenChecks(daten, heute).filter((c) => c.entitaet === "vorsorge"),
    positionen: computeNettovermoegen(daten, heute).positionen.filter((p) => p.klasse === "vorsorge"),
    vertraege,
  };
}

// app/vermoegen-modell.mjs
// Vermoegensseite als reine Funktion ueber einen Bestand: rechnet im App-Server
// (lese-api.mjs, GET /api/v1/vermoegen) mit denselben Funktionen wie zuvor die
// Ansicht. Was nur Stammdaten und Zeitwerte braucht (Darlehen, Kennzahlen einer
// Immobilie, Wertstaende), rechnet weiter der Browser; hier steht, was
// Buchungen braucht: Nettovermoegen, offene Punkte, Verlauf, je Immobilie die
// Monate (drei Varianten) und Investitionen, je Vertrag der Vermoegensbezug.
import { computeNettovermoegen, computeVermoegenChecks, nettovermoegenVerlauf } from "./vermoegen.mjs";
import { darlehensKategorien, immobilienInvestitionen, immobilienKennzahlen, immobilienMonate, investitionsKategorien } from "./vermoegen-details.mjs";
import { vermoegensBezug } from "./vorsorge-rechnung.mjs";

// Nur die Felder, die die Investitionstabelle zeigt.
const investitionsBuchung = ({ transaktion_id, buchungsdatum, gegenpartei, verwendungszweck, bemerkung, betrag }) =>
  ({ transaktion_id, buchungsdatum, gegenpartei: gegenpartei ?? "", verwendungszweck: gegenpartei ? "" : (verwendungszweck ?? ""), bemerkung: bemerkung ?? "", betrag });

function immobilie(daten, imm, heute) {
  const id = imm.immobilie_id;
  const k = immobilienKennzahlen(daten, id, heute);
  const rate = darlehensKategorien(daten, k.darlehen_ids);
  const inv = immobilienInvestitionen(daten, id);
  return {
    // Umschalter "mit Rate" / "ohne Rate" und die Mietrendite ohne Investitionen.
    monate_mit_rate: immobilienMonate(daten, id, heute, { ohneKategorien: [], mitEigenanteil: true }),
    monate_ohne_rate: immobilienMonate(daten, id, heute, { ohneKategorien: rate, mitEigenanteil: false }),
    monate_ohne_investitionen: immobilienMonate(daten, id, heute, { ohneKategorien: [...investitionsKategorien(daten)] }),
    investitionen: { ...inv, buchungen: inv.buchungen.map(investitionsBuchung) },
    alle_buchungen: (daten.transaktionen ?? []).filter((tx) => tx.immobilie_id === id).length,
  };
}

export function vermoegenModell(daten, heute) {
  const bezug = {};
  for (const vs of daten.vorsorge ?? []) {
    const b = vermoegensBezug(daten, vs.vorsorge_id);
    if (b.length) bezug[vs.vorsorge_id] = b;
  }
  return {
    heute,
    netto: computeNettovermoegen(daten, heute),
    checks: computeVermoegenChecks(daten, heute),
    // unbekannt: Zahl der Positionen ohne Wert zu diesem Monatsende (Bewertungsstand).
    verlauf: nettovermoegenVerlauf(daten, heute).map(({ monat, netto_cents, unbekannt }) => ({ monat, netto_cents, unbekannt })),
    immobilien: Object.fromEntries((daten.immobilien ?? []).filter((i) => i.status !== "verkauft").map((imm) => [imm.immobilie_id, immobilie(daten, imm, heute)])),
    vorsorge_bezug: bezug,
  };
}

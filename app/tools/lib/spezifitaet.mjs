// app/tools/lib/spezifitaet.mjs
//
// Veto gegen nachweislich unspezifische Regelmuster (ADR 0025). Kein Beweis
// fuer Spezifitaet: ist die Referenzmenge duenn, kommt eine Regel durch. Die
// Pruefung kann also nichts durchwinken, was sonst gestoppt worden waere —
// sie faengt nur den Fall, der belegbar ueber viele Kategorien streut.
import { normalizeLoose } from "./text.mjs";

// Ab drei verschiedenen Kategorien traegt ein Zweig keine Kategorieaussage mehr.
const UNSPEZIFISCH_AB_KATEGORIEN = 3;

// Nur menschlich entschiedene Buchungen. Auto-Freigaben sind ausgeschlossen,
// weil eine schlechte Regel sonst ihre eigenen Freigaben als Beleg fuer ihre
// Spezifitaet zaehlen wuerde: 650 auf eine Kategorie gesetzte Buchungen
// ergaeben Streuung 1 und damit den Freibrief, den das Gate verhindern soll.
export function referenzmenge(transaktionen) {
  return transaktionen.filter((tx) => tx.kategorie_id
    && (tx.bestaetigt_durch === "mensch" || tx.kategorie_herkunft === "manuell"));
}

function zweige(pattern) {
  return String(pattern ?? "").split("|").map(normalizeLoose).filter((z) => z.length > 0);
}

export function streuung(zweig, referenz) {
  const kategorien = new Set();
  for (const tx of referenz) {
    const heuhaufen = `${normalizeLoose(tx.gegenpartei)} ${normalizeLoose(tx.verwendungszweck)}`;
    if (heuhaufen.includes(zweig)) kategorien.add(tx.kategorie_id);
  }
  return kategorien.size;
}

// Innerhalb eines Feldes ist die Alternation ein ODER: ein generischer Zweig
// ist ein Leck, also muessen ALLE Zweige spezifisch sein.
function feldIstSpezifisch(pattern, referenz) {
  const zw = zweige(pattern);
  if (zw.length === 0) return false;
  return zw.every((z) => streuung(z, referenz) < UNSPEZIFISCH_AB_KATEGORIEN);
}

// Zwischen den Feldern gilt UND: ein spezifisches Feld macht die Regel eng,
// egal wie generisch das andere ist.
export function istSpezifisch(regel, referenz) {
  const muster = [regel.gegenpartei_pattern, regel.verwendungszweck_pattern].filter(Boolean);
  if (muster.length === 0) return false;
  return muster.some((p) => feldIstSpezifisch(p, referenz));
}

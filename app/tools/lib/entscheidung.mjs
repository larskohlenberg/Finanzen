// app/tools/lib/entscheidung.mjs
//
// Wer eine Kategorie maschinell neu bewerten darf — eine Definition fuer
// Nach-Kategorisierung, Probelauf und Pruefbericht. Nur eine Auto-Freigabe ist
// kein menschlicher Akt (ADR 0025). Was ein Mensch entschieden hat, fasst kein
// Regellauf an, auch nicht den gespeicherten Regelbezug: `matched_regeln` haelt
// dort fest, welche Regeln zum Zeitpunkt der Entscheidung trafen, nicht, was das
// Regelwerk heute sagt.

export function menschlichEntschieden(tx) {
  if (tx.kategorie_herkunft === "manuell") return true;
  if (tx.kategorisierung_status === "abgelehnt") return true;
  // Bestaetigt ohne bestaetigt_durch ist ungueltig; im Zweifel geschuetzt, wie
  // es migrate-bestaetigt-durch.mjs fuer Altbestaende setzt.
  return tx.kategorisierung_status === "bestaetigt" && tx.bestaetigt_durch !== "auto";
}

// Eine menschliche Bestaetigung, der das aktuelle Regelwerk eindeutig eine
// andere Kategorie gibt. Sie bleibt unveraendert und steht im Pruefbericht.
// `manuell` zaehlt nicht: dort ist die Abweichung von jeder Regel gerade der
// Sinn (bewusste Uebersteuerung).
export function istWiderspruch(tx, verdict) {
  return menschlichEntschieden(tx)
    && tx.kategorisierung_status === "bestaetigt"
    && tx.kategorie_herkunft !== "manuell"
    && verdict.status === "vorgeschlagen"
    && verdict.kategorie_id !== tx.kategorie_id;
}

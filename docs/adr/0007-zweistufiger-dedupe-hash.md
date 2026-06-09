# Zweistufiger Dedupe-Hash mit leichter Normalisierung

Statushinweis 2026-06-09: Die Entscheidung gilt weiter. Die Import-Pipeline liegt physisch unter `app/tools/`; fachlich wird sie app-relativ als `tools/` referenziert.

Der `dedupe_hash` einer Transaktion wird zweistufig gebildet:

1. **Mit Bank-Referenz**: Liefert die Bank eine eindeutige Buchungsnummer (`bank_referenz`, z. B. SEPA-Ende-zu-Ende-ID), basiert der Hash **ausschliesslich** auf `(konto_id, bank_referenz)`.
2. **Ohne Bank-Referenz**: Hash ueber `(konto_id, buchungsdatum, betrag, gegenpartei, verwendungszweck)`.

Die Freitextfelder `gegenpartei` und `verwendungszweck` werden vor dem Hash **leicht normalisiert**: trim und Kollabieren von Mehrfach-Whitespace. **Kein** Lowercase, **kein** Entfernen von Sonderzeichen.

## Begruendung

Dedupe-Fehler tun in beide Richtungen weh, aber unterschiedlich stark:

- **Zu lasch** → ein Duplikat landet im Bestand. Aergerlich, aber sichtbar und korrigierbar.
- **Zu streng** → eine echte Buchung wird faelschlich als Duplikat verschluckt und taucht **nie** auf. Sie fehlt still im Cashflow. Das ist der schlimmere Fehler.

Daraus folgt die konservative Linie bei der Normalisierung: nur die unstrittigen Quirks (Whitespace) glaetten, sonst nichts. Lowercase oder Sonderzeichen-Strippen wuerde knapp verschiedene Buchungen (z. B. zwei 4,99-EUR-Abbuchungen am selben Tag mit aehnlichem Text) verschmelzen.

Die Sonderrolle von `bank_referenz`: Sie ist die einzige von der Bank **garantierte** Eindeutigkeit. Sie an die fragilen Freitextfelder zu koppeln (alte Variante: alle Felder immer hashen) verschenkt genau diese Garantie — ein Re-Export mit umformatiertem Verwendungszweck wuerde sonst ein Duplikat erzeugen, obwohl die Buchungsnummer identisch ist.

## Verworfene Alternativen

- **Immer alle Felder hashen** (auch bei vorhandener `bank_referenz`): konsistenter Code-Pfad, aber anfaellig gegen Re-Format durch die Bank.
- **Starke Normalisierung** (lowercase, Sonderzeichen entfernen): robusteres Matching, aber inakzeptables Risiko, echte Buchungen still zu verschlucken.
- **Roh hashen ohne Normalisierung**: maximales Duplikat-Risiko bei Re-Exports.

## Konsequenz

Risiko: Manche Banken vergeben `bank_referenz` **nicht stabil** ueber Re-Exports (selten, aber real — manche erzeugen pro Export neue IDs). Dann versagt Stufe 1. Mitigation: Beim ersten Import einer neuen Bank prueft der Agent die Stabilitaet der Buchungsnummer. Ist sie nicht stabil, laesst er `bank_referenz` weg, sodass der Freitext-Hash (Stufe 2) greift. Dieser Pruefpunkt gehoert in den Import-Agent-Skill.

Die Hash-Bildung ist Teil der deterministischen Import-Pipeline (`tools/`), nicht Agent-Verhalten — gleiche Eingabe ergibt immer denselben Hash.

## Praezisierung 2026-06-09 (DKB-Erstimport, 2663 Buchungen)

Drei Annahmen der urspruenglichen Entscheidung waren in der Praxis zu eng. Die Korrekturen sitzen im Tool (`runImport`/`dedupe.mjs`), nicht im Agenten:

1. **`bank_referenz` vorhanden ⇒ eindeutig — gilt nicht.** Die DKB-Spalte „Kundenreferenz" ist nicht durchgaengig pro Buchung eindeutig: einzelne Werte tauchen auf mehreren, real verschiedenen Buchungen auf (Karten-Autorisierungen, Jahresbeitraege mit stabiler Ref). Stufe 1 nur auf `(konto_id, bank_referenz)` zu stuetzen, wuerde diese Buchungen verschmelzen — genau der „strenge" Fehler. **Regel:** Die Pipeline nutzt `bank_referenz` nur dann als Schluessel, wenn sie **im Lauf dateiweit eindeutig** ist; sonst faellt sie auf den Freitext-Hash zurueck und die mehrdeutige Referenz wird **nicht** gespeichert (sie waere ein irrefuehrender Dedupe-Key beim Re-Import). Die Eindeutigkeitspruefung ist deterministisch im Tool, nicht Agent-Disziplin.

2. **Dedupe prueft gegen den Bestand, nicht intra-file.** Ein amtlicher Kontoauszug enthaelt reale Buchungen; zwei gleich aussehende Zeilen sind keine Importdublette, sondern zwei Tatsachen. Der Skip-Vergleich laeuft deshalb nur gegen `transaktionen.jsonl` (Re-Import-Schutz), nicht gegen die bereits in **diesem** Lauf geschriebenen Zeilen.

3. **Identische Zeilen + Hash-Eindeutigkeit.** Sind zwei Zeilen in allen Quellfeldern identisch und referenzlos (z. B. referenzlose Ruecklaeufer), ergibt der Freitext-Hash zweimal denselben Wert — der Validator verlangt aber eindeutige `dedupe_hash`. Das zweite und jedes weitere Vorkommen erhaelt einen deterministisch disambiguierten Hash (`disambiguateHash`, weiterhin 64-stellig); die Buchungsinhalte bleiben unveraendert. So bleibt jede reale Buchung erhalten, ohne den blinden Fleck zu verstecken.

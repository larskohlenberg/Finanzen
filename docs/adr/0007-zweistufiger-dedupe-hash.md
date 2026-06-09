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

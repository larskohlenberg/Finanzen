# Dubletten als Multimenge je Konto und Inhalt

Status: angenommen (2026-10-19). Ersetzt die Dedupe-Regeln aus ADR 0007 (Praezisierung 2026-06-09, Punkte 1 und 2); die leichte Normalisierung der Freitextfelder gilt weiter.

## Problem

Der Import verwarf eine Zeile, sobald ihr Hash im Bestand stand, und disambiguierte identische Zeilen erst danach. Ob eine Buchung erkannt wurde, hing damit vom Zuschnitt der Exportdatei ab:

- Bestand [A] + ueberlappender Export [A, A]: beide Zeilen trafen den Grund-Hash, die zweite echte Buchung fehlte still.
- Die Bank-Referenz war nur Schluessel, wenn sie **in der Datei** eindeutig war. A mit Referenz R, danach Export A + B mit R: R war nicht mehr eindeutig, A bekam einen Freitext-Hash, den der Bestand nicht kannte, also 3 statt 2 Buchungen.
- Eine monatlich wiederverwendete Referenz ist in jeder Monatsdatei eindeutig; der zweite Monat traf den Referenz-Hash des ersten und wurde unterschlagen.

## Entscheidung

`runImport` gleicht die Zeilen gegen den Bestand ab (`gleicheMitBestandAb` in `tools/dedupe.mjs`):

1. **Referenz, nur wenn verlaesslich, nur mit Datum und Betrag.** Verlaesslich ist die Referenz auf einem Konto, wenn kein Wert auf zwei Buchungen steht: nicht zweimal im Bestand, nicht zweimal in der Datei, und nicht mit anderem Datum oder Betrag zwischen beiden. Dann ist eine Zeile mit gleicher Referenz, gleichem Datum und Betrag schon da, auch bei umformatiertem Text (Ziel von ADR 0007 bleibt erhalten).
2. **Sonst Inhalt als Multimenge.** Die uebrigen Zeilen werden je (Konto, Datum, Betrag, Gegenpartei, Zweck) gezaehlt. Neu sind `max(Anzahl Datei − Anzahl Bestand, 0)`. Annahme: Ein Export enthaelt jeden Tag, den er abdeckt, vollstaendig.
3. **Unklares wird Prueffall** (`result.pruefen`), nicht still entschieden:
   - `teilweise_vorhanden`: gleiche Buchungen in Datei und Bestand, nach Anzahl entschieden (auch: Bestand hat mehr als der Export);
   - `referenz_abweichend`: Inhalt gleich, verlaessliche Referenz verschieden, als vorhanden gezaehlt;
   - `moegliche_dublette`: neu geschrieben, aber gleiche Referenz, Datum und Betrag wie eine Bestandsbuchung auf einem Konto ohne verlaessliche Referenz.
   `result.referenz_unzuverlaessig` nennt die Konten, auf denen die Referenz nicht zaehlt.

Neue Buchungen bekommen als Schluessel das erste freie Vorkommen ihres Inhalts: den Grundschluessel (Freitext-Hash) oder `disambiguateHash(grund, n)`. Frei heisst: weder im Bestand noch in diesem Lauf vergeben. Die Referenz ist kein Hash-Bestandteil mehr, wird aber immer gespeichert: Sie ist der Beleg, an dem spaetere Laeufe ihre Verlaesslichkeit messen.

## Uebergang fuer Alt-Hashes

Vorhandene IDs und Hashes bleiben unveraendert. Alt-Hashes lassen sich nicht zurueckrechnen (Referenz-Hash, disambiguiertes Vorkommen). Darum zaehlt der Abgleich Bestandszeilen nach ihrem **Inhalt, aus den Feldern berechnet**, nicht nach dem gespeicherten Hash. Zusaetzlich: Eine Bestandszeile, deren gespeicherter Hash ein Vorkommen (1, 2, 3 …) eines Inhalts aus der Datei ist, zaehlt fuer diesen Inhalt, auch wenn ihr Text spaeter von Hand geaendert wurde. Die Suche nach Vorkommen toleriert Luecken (von Hand entfernte Doppel). Ein Bestand, der nur das zweite Vorkommen traegt, bekommt beim naechsten Import den freien Grundschluessel statt einer Kollision.

Bestandszeilen mit Alt-Referenz-Hash tragen ihre Referenz im Feld `bank_referenz` (frueher nur bei dateiweiter Eindeutigkeit gespeichert); Punkt 1 erkennt sie darueber.

## Verworfene Alternativen

- **Alle Hashes neu berechnen (Migration):** saubere Schluessel, aber aendert IDs von Bestandsdaten, bricht Verweise in Belegen und Protokoll. Nicht noetig, weil der Abgleich ueber den Inhalt laeuft.
- **Referenz-Verlaesslichkeit als Profil- oder Kontofeld:** waere stabiler, gilt aber nicht fuer von Hand normalisierte Dateien ohne Profil und braucht eine Schemaaenderung. Die Messung aus Bestand und Datei reicht, seit die Referenz immer gespeichert wird.
- **Referenz-Mengenabgleich statt Anzahl** (Zeile neu, wenn ihre Referenz im Bestand fehlt): unsicher bei Banken, die Referenzen je Export neu vergeben (ADR 0007, Konsequenz); erzeugte dort bei jedem Re-Export Dubletten. Die Referenz widerspricht der Anzahl darum nur als Prueffall.

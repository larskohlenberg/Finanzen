# Schemas

Hier liegen die Validierungsregeln fuer die Runde-2-Masterdaten im App-Raum.

## Ziel

Agenten und Betriebstools schreiben Daten nicht frei, sondern gegen stabile Schemas:

- Pflichtfelder
- erlaubte Statuswerte
- ID-Konventionen
- Referenzen zwischen Dateien
- fachliche Minimalvalidierungen

Die Schemas sind Referenz fuer Import, Stammdatenpflege, Validierung und spaetere Backend-Logik.

## Dateien

| Datei | Inhalt |
|---|---|
| `regelzahlungen.schema.json` | Wiederkehrende Zahlungen (Einnahmen/Ausgaben); optionales `darlehen_id` verknuepft eine Tilgungsrate mit einem Darlehen |
| `immobilien.schema.json` | Immobilien mit Eigentumsanteilen (Bruchteile je Person) |
| `darlehen.schema.json` | Hypotheken und sonstige Darlehen mit Zinssatz und Sollrate |
| `vermoegenswerte.schema.json` | Weitere Vermoegenswerte (Edelmetalle, Beteiligungen, Sonstiges) mit Eigentumsanteilen |
| `zeitwerte.schema.json` | Einzelner Zeitwert-Eintrag (Kontostand, Depotwert, Marktwert, Restschuld) fuer beliebige Entitaeten |
| `importformat.schema.json` | Standardisierte Zwischenform fuer Bankimporte; enthaelt neben den Pflichtfeldern auch optionale Bankdetails wie `wertstellungsdatum`, `transaktionstyp`, `empfaenger_iban`, `mandatsreferenz` und `glaeubiger_id` |

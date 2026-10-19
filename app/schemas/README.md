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

## Fuehrend ist der Validator, nicht diese Dateien

Die eine Vertragsquelle ist `DATENVERTRAG` in `tools/validate-core.mjs`
(Pflichtfelder und Feldregeln je Sammlung; Querbezuege und die Zustandstabelle
der Kategorisierung stehen im selben Modul). Die JSON-Schema-Dateien hier werden
von keinem Tool geladen; sie sind lesbare Referenzdoku. `tests/datenvertrag.test.mjs`
haelt sie Feld fuer Feld deckungsgleich (Feldnamen, Pflichtfelder, Typ, Muster,
Aufzaehlungen, Formate; Uebersetzung in `tools/lib/vertrag.mjs`). Beschreibungen
und Unterstrukturen (z. B. Eigentumsanteile) darf die Doku zusaetzlich fuehren.
Wer ein Feld ergaenzt: zuerst `DATENVERTRAG` (mit Test), dann die Schema-Datei;
der Test sagt, was fehlt. Ausnahme: `importformat` und `importprofil` folgen
`tools/import-format.mjs` und sind nicht im Abgleich.

## Dateien

| Datei | Inhalt |
|---|---|
| `regelzahlungen.schema.json` | Wiederkehrende Zahlungen (Einnahmen/Ausgaben); optionales `darlehen_id` verknuepft eine Tilgungsrate mit einem Darlehen |
| `fristen.schema.json` | Fristen und Termine (Widerspruch, Kuendigung, Entscheidung, Wiedervorlage): Datum, optionaler Rhythmus, hoechstens ein Bezug, `erledigt_bis` zum Abhaken (ADR 0031) |
| `immobilien.schema.json` | Immobilien mit Eigentumsanteilen (Bruchteile je Person) |
| `darlehen.schema.json` | Hypotheken und sonstige Darlehen mit Zinssatz und Sollrate |
| `vermoegenswerte.schema.json` | Weitere Vermoegenswerte (Edelmetalle, Beteiligungen, Sonstiges) mit Eigentumsanteilen |
| `zeitwerte.schema.json` | Einzelner Zeitwert-Eintrag (Kontostand, Depotwert, Marktwert, Restschuld; bei Vorsorge auch Rueckkaufs- und Vertragswert, erwartete Leistungen und Absicherungswerte) fuer beliebige Entitaeten |
| `logos.schema.json` | Logo-Verzeichnis: Gegenpartei-Muster, Domain, Datei unter `logos/`, Quelle und Abrufdatum (ADR 0030) |
| `importformat.schema.json` | Standardisierte Zwischenform fuer Bankimporte; enthaelt neben den Pflichtfeldern auch optionale Bankdetails wie `wertstellungsdatum`, `transaktionstyp`, `empfaenger_iban`, `mandatsreferenz` und `glaeubiger_id` |

# Schemas

Hier entstehen die Validierungsregeln fuer die Runde-2-Masterdaten.

## Ziel

Agenten sollen Daten nicht frei editieren, sondern gegen stabile Schemas schreiben:

- Pflichtfelder
- erlaubte Statuswerte
- ID-Konventionen
- Referenzen zwischen Dateien
- fachliche Minimalvalidierungen

Erster sinnvoller Schritt ist ein kleines Schema fuer Personen, Konten, Kategorien und Transaktionen.

## Dateien

| Datei | Inhalt |
|---|---|
| `regelzahlungen.schema.json` | Wiederkehrende Zahlungen (Einnahmen/Ausgaben); optionales `darlehen_id` verknuepft eine Tilgungsrate mit einem Darlehen |
| `immobilien.schema.json` | Immobilien mit Eigentumsanteilen (Bruchteile je Person) |
| `darlehen.schema.json` | Hypotheken und sonstige Darlehen mit Zinssatz und Sollrate |
| `vermoegenswerte.schema.json` | Weitere Vermoegenswerte (Edelmetalle, Beteiligungen, Sonstiges) mit Eigentumsanteilen |
| `zeitwerte.schema.json` | Einzelner Zeitwert-Eintrag (Kontostand, Depotwert, Marktwert, Restschuld) fuer beliebige Entitaeten |


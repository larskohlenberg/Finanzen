# Keine bankspezifischen Parser, Agent normalisiert in Standardformat

Statushinweis 2026-06-09: Die Entscheidung gilt weiter. Die genannten Pfade sind app-relativ im App-Raum; physisch liegen sie unter `app/data/...`, `app/schemas/...` und `app/tools/...`.

Bankexporte (CSV, PDF, MT940, CAMT.053) werden **nicht** durch bankspezifische Parser-Skripte im Code uebersetzt. Stattdessen normalisiert der Import-Agent die Rohdatei in ein einheitliches **standardisiertes Importformat** unter `data/inbox/`, gegen das dann der deterministische Import-Pipeline-Code laeuft (Validator, Dedupe-Check, Categorizer, Transfer-Matcher).

Begruendung: Bankformate aendern sich ohne Vorwarnung, jede Bank hat eigene Spalten und Quirks, und eine Privatperson nutzt nur eine Handvoll Banken — der Pflegeaufwand fuer Parser-Skripte steht in keinem Verhaeltnis zum Nutzen. Der Agent (Claude) ist in der Normalisierung tabellarischer und PDF-Daten gut, und der menschliche Nutzer ist als Reviewer beim Importlauf ohnehin dabei. Der Code fokussiert sich damit auf das, was deterministisch sein muss: das standardisierte Format danach.

## Verworfene Alternativen

- **Pro Bank ein CSV-Parser-Skript**: deterministisch, aber Pflege-Last und Sprödigkeit gegenueber Format-Aenderungen.
- **MT940/CAMT.053 als Pflicht-Eingabe**: technisch sauber, aber praxisfern — kein Bankkunde lade diese Formate manuell herunter.

## Konsequenz

Das standardisierte Importformat ist ein **Schema in `schemas/`**, das M3 definiert und der Validator pruefen kann. Bank-Rohdateien landen in `data/inbox/`, die normalisierte Form in einem Unterordner (z. B. `data/inbox/standardized/`) — beide werden nach erfolgreichem Import nach `data/inbox/processed/` verschoben, bei Fehler nach `data/inbox/error/`.

Diese Entscheidung gilt **dauerhaft**, nicht nur fuer M3. Auch spaeter werden keine bankspezifischen Parser eingefuehrt.

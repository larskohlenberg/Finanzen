# Data

Hier liegen aktive Daten fuer Runde 2.

## Ordner

- `inbox/`: Neue CSVs, Belege oder Rohinputs vor Verarbeitung.
- `master/`: Fuehrende strukturierte Daten, validiert gegen `schemas/`.
- `exports/`: Erzeugte Reports und Austauschformate.

## Formatentscheidung

- Grosse Buchungslisten: bevorzugt `jsonl` oder normalisierte `csv`.
- Stammdaten: bevorzugt `json`.
- Freitext, Entscheidungen, Handover: `md`.

Markdown ist nicht Masterformat fuer tabellarische CRUD-Daten.


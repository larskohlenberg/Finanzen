# Demo-Daten

## Kategorisierungsregeln

Patterns sind lose normalisierte Substrings. Enthaelt ein Pattern `|`, gilt es als
schlichte Alternation: irgendein durch `|` getrennter Teil muss als Substring
passen. Das ist kein regulaerer Ausdruck.

## Stichtag und Schaufenster

Die Demo rechnet mit dem festen Stichtag `DEMO_STICHTAG` (`app/demo-modus.mjs`,
30.06.2026), dem Ende der Demo-Buchungen; die App zeigt ihn am Chip "Demodaten".
So bleiben Kennzahlen, Faelligkeiten und Checks stimmig, egal wann man die Demo
oeffnet. Die Kontostaende (Zeitwerte) passen zu den Buchungen, die Buchungen der
Regelzahlungen sind zugeordnet (`regelzahlung-matcher`).

## Bewusste Checks

Nur wenige, erklaerte Faelle (ein Test prueft genau diese, `tests/demo-schaufenster.test.mjs`):

- `reconciliation-drift` fuer `KTO-003` (Kreditkarte) im Jahr 2026: Die
  Abrechnung zum 22.06.2026 enthaelt eine Gutschrift ueber 8,99 Euro, die im
  Import fehlt.
- `vorsorge-ungeprueft` fuer `VS-006`: Der Vertrag ist noch nicht geprueft.
- Zwei Hinweise zum Prognose-Realismus (`kategorie-ungeplant`): Kategorien mit
  Buchungen, aber ohne Regelzahlung.
- Zwei Buchungen mit offener Kategorie zeigen den Pruefweg.

Absichtlich fehlerhafte Faelle fuer Tests gehoeren nach `tests/fixtures/`, nicht
in die Demo.

## Demo-Dokumente

`../demo-belege/` enthaelt ein paar erfundene Beispieldokumente (Kontoauszug,
Standmitteilung, Grundsteuerbescheid, Quittungsfoto). Im Demo-Modus zeigt die App
nur diese; echte Dokumente, die echte Inbox und der Upload bleiben dem echten
Bestand vorbehalten. Sie liegen neben dem Bestand, damit dieser flach bleibt. Die
Objektordner (`KTO-001_…`, `VS-003_…`, `IMM-001_…`) verknuepfen die Dateien mit
den Demodatensaetzen.

# Demo-Daten

## Kategorisierungsregeln

Patterns sind lose normalisierte Substrings. Enthaelt ein Pattern `|`, gilt es als
schlichte Alternation: irgendein durch `|` getrennter Teil muss als Substring
passen. Das ist kein regulaerer Ausdruck.

## Bewusste Vermoegens-Checks

Die `reconciliation-drift`-Checks fuer `KTO-001`, `KTO-002`, `KTO-003` und
`KTO-005` sind absichtlich in den Demo-Daten enthalten. Auch `VS-006` bleibt
bewusst ungeprueft und loest `vorsorge-ungeprueft` aus. Diese Faelle
demonstrieren die berechneten Vermoegens-Checks und sollen nicht durch
Datenkorrekturen entfernt werden.

## Demo-Dokumente

`../demo-belege/` enthaelt ein paar erfundene Beispieldokumente (Kontoauszug,
Standmitteilung, Grundsteuerbescheid, Quittungsfoto). Im Demo-Modus zeigt die App
nur diese; echte Dokumente, die echte Inbox und der Upload bleiben dem echten
Bestand vorbehalten. Sie liegen neben dem Bestand, damit dieser flach bleibt. Die
Objektordner (`KTO-001_…`, `VS-003_…`, `IMM-001_…`) verknuepfen die Dateien mit
den Demodatensaetzen.

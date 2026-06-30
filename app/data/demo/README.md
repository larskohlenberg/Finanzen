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

# Text-Sparring Step Context

## Aufgabe

Erledige genau Runde 5, Schritt 1: These.

## Sparring

- **Sparring-Name:** finanzmodell-excel-spezifikation
- **Sparring-Pfad:** sparring/finanzmodell-excel-spezifikation

**Artifact-Typ:** directory
**Sparring-Typ:** Text
**Aktuelle Arbeitsfassung:** sparring/finanzmodell-excel-spezifikation/rounds/round_05/artifact/
**Subagent-Qualität:** Inherit

## Rolle

Arbeite strikt nach der Rollen-Definition für **These** in `sparring/finanzmodell-excel-spezifikation/CHALLENGE.md`.

Dies ist die letzte Runde. Baue auf der Synthese aus Runde 4 auf und lies zusätzlich `sparring/finanzmodell-excel-spezifikation/rounds/round_04/step_3_handoff.md`. Mache die Fassung abschlussreif: Task 1 darf keinen Nutzwert behaupten, sondern Struktur-, Referenz- und Sichtbarkeits-Gate sein; Check-Referenzfelder in `seedData.checks` sollen konkret, aber nicht aufgebläht sein; Task 3 bleibt erster Ort echter Ergebnislogik.

## Input-Dateien

- `sparring/finanzmodell-excel-spezifikation/rounds/round_05/artifact/`
- `sparring/finanzmodell-excel-spezifikation/rounds/round_04/step_3_handoff.md`

## Output-Dateien

- `sparring/finanzmodell-excel-spezifikation/rounds/round_05/step_1_thesis/` als vollständiges Verzeichnis
- `sparring/finanzmodell-excel-spezifikation/rounds/round_05/step_1_handoff.md`

## Grenzen

- Schreibe nur die genannten Output-Dateien.
- Aktualisiere nicht `sparring/finanzmodell-excel-spezifikation/state.md`.
- Lege keine neue Runde an.
- Starte keinen Wait-Loop.
- Halte Hauptoutput und Übergabeimpuls getrennt.
- Wenn notwendige Input-Dateien fehlen oder widersprüchlich sind, schreibe keine Outputs und melde die Inkonsistenz an die Hauptsession.
- Keine programmatische Messung oder Sektionsextraktion für Inhaltsarbeit.

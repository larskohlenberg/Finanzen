# Text-Sparring Step Context

## Aufgabe

Erledige genau Runde 5, Schritt 3: Synthese.

## Sparring

- **Sparring-Name:** finanzmodell-excel-spezifikation
- **Sparring-Pfad:** sparring/finanzmodell-excel-spezifikation

**Artifact-Typ:** directory
**Sparring-Typ:** Text
**Aktuelle Arbeitsfassung:** sparring/finanzmodell-excel-spezifikation/rounds/round_05/step_1_thesis/
**Subagent-Qualität:** Inherit

## Rolle

Arbeite strikt nach der Rollen-Definition für **Synthese** in `sparring/finanzmodell-excel-spezifikation/CHALLENGE.md`.

Dies ist die finale Synthese des gesamten Sparrings. Integriere die finale Antithese:
- Task 1 darf Struktur-, Referenz- und Sichtbarkeitsverhalten zeigen, aber keinen Finanznutzwert wie Liquiditaets-, Cashflow- oder Reichweitenentscheidung behaupten.
- Kontrollstatus darf als erstes Produktverhalten gelten, solange er an Checks, Quellen und negative Sichtbarkeit rueckgebunden ist.
- Trenne Testebenen klar: Strukturtest, Kontrollstatus-/Sichtbarkeitstest, echte Finanzkennzahlen/Formellogik erst spaeter.
- Halte `seedData.checks` konkret genug fuer Rueckbindung, aber vermeide neue Facharchitektur.

Erzeuge eine vollständige finale Fassung als Verzeichnis.

## Input-Dateien

- `sparring/finanzmodell-excel-spezifikation/rounds/round_05/step_1_thesis/`
- `sparring/finanzmodell-excel-spezifikation/rounds/round_05/step_2_antithesis.md`
- `sparring/finanzmodell-excel-spezifikation/rounds/round_05/step_2_handoff.md`

## Output-Dateien

- `sparring/finanzmodell-excel-spezifikation/rounds/round_05/step_3_synthesis/` als vollständiges Verzeichnis
- `sparring/finanzmodell-excel-spezifikation/rounds/round_05/step_3_handoff.md`

## Grenzen

- Schreibe nur die genannten Output-Dateien.
- Aktualisiere nicht `sparring/finanzmodell-excel-spezifikation/state.md`.
- Lege keine neue Runde an.
- Starte keinen Wait-Loop.
- Halte Hauptoutput und Übergabeimpuls getrennt.
- Wenn notwendige Input-Dateien fehlen oder widersprüchlich sind, schreibe keine Outputs und melde die Inkonsistenz an die Hauptsession.
- Keine programmatische Messung oder Sektionsextraktion für Inhaltsarbeit.

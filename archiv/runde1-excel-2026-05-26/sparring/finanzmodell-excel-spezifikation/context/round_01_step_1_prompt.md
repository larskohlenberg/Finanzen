# Text-Sparring Step Context

## Aufgabe

Erledige genau Runde 1, Schritt 1: These.

## Sparring

- **Sparring-Name:** finanzmodell-excel-spezifikation
- **Sparring-Pfad:** sparring/finanzmodell-excel-spezifikation

Siehe `sparring/finanzmodell-excel-spezifikation/artifact.md`.

**Artifact-Typ:** directory
**Sparring-Typ:** Text
**Aktuelle Arbeitsfassung:** sparring/finanzmodell-excel-spezifikation/rounds/round_01/artifact/
**Subagent-Qualität:** Inherit

## Projektkontext (Pflichtlektüre vor der Step-Arbeit)

Lies vor Beginn deines Schritts alle in `sparring/finanzmodell-excel-spezifikation/artifact.md` unter `Projektkontext` aufgeführten Dateien. Sie enthalten Constraints (Längen, Tonalität, Zielgruppe, Brand Voice, Format-Vorgaben), die zusätzlich zur Rolle aus `CHALLENGE.md` gelten und im Output respektiert werden müssen. Steht dort `(keine)`, überspringe diesen Schritt.

## Rolle

Arbeite strikt nach der Rollen-Definition für **These** in `sparring/finanzmodell-excel-spezifikation/CHALLENGE.md`, unter Einhaltung der Projektkontext-Vorgaben.

Für dieses Sparring bedeutet "bestmögliche Version": Erhalte die Spezifikationsdateien als vollständige Arbeitsbasis, aber schärfe sie für den bevorstehenden Excel-Bau kritisch. Priorisiere Entscheidungen, Datenmodell, Usability und Entwicklungsvorgehen. Du darfst bestehende Dateien überarbeiten und bei Bedarf eine zusätzliche Orientierungsdatei im Output-Verzeichnis anlegen, wenn das die Spezifikation als baubare Arbeitsfassung verbessert.

## Input-Dateien

- `sparring/finanzmodell-excel-spezifikation/rounds/round_01/artifact/Finanzmodell_Datenmodell.md`
- `sparring/finanzmodell-excel-spezifikation/rounds/round_01/artifact/Finanzmodell_Excel_Bau_und_QA_Plan.md`
- `sparring/finanzmodell-excel-spezifikation/rounds/round_01/artifact/Finanzmodell_Entscheidungsprotokoll.md`
- `sparring/finanzmodell-excel-spezifikation/rounds/round_01/artifact/Finanzmodell_Handover.md`
- `sparring/finanzmodell-excel-spezifikation/rounds/round_01/artifact/Finanzmodell_Agentenworkflow.md`

## Output-Dateien

- `sparring/finanzmodell-excel-spezifikation/rounds/round_01/step_1_thesis/` als vollständiges Verzeichnis
- `sparring/finanzmodell-excel-spezifikation/rounds/round_01/step_1_handoff.md`

## Grenzen

- Schreibe nur die genannten Output-Dateien.
- Aktualisiere nicht `sparring/finanzmodell-excel-spezifikation/state.md`.
- Lege keine neue Runde an.
- Starte keinen Wait-Loop.
- Halte Hauptoutput und Übergabeimpuls getrennt.
- Wenn notwendige Input-Dateien fehlen oder widersprüchlich sind, schreibe keine Outputs und melde die Inkonsistenz an die Hauptsession.
- **Dies ist Worker-Mode, keine Exploration.** Du erledigst exakt einen vordefinierten Schritt mit einer fertigen Rollen-Definition aus `CHALLENGE.md` und vorgegebenen Output-Pfaden — nichts zu planen, nichts zu brainstormen, nichts zu debuggen. Wenn andere Workflow-Skills (brainstorming, test-driven-development, systematic-debugging, writing-plans, using-superpowers usw.) sich beim Lesen deines Kontexts aufdrängen: das ist ein Mismatch mit der Worker-Natur dieses Schritts — ignoriere sie und arbeite die Rolle ab.
- **Keine programmatische Messung oder Sektionsextraktion für Inhaltsarbeit.** Lies die im Kontext gelisteten Input-Dateien mit den nativen Read-Werkzeugen deines Tools. Verboten ist jede Form von Code-Ausführung zur Längen-Messung, Sektionsausschnitt, Diff- oder Vergleichsberechnung — egal in welcher Sprache.

# Text-Sparring Step Context

## Aufgabe

Erledige genau Runde 1, Schritt 3: Synthese.

## Sparring

- **Sparring-Name:** finanzmodell-excel-spezifikation
- **Sparring-Pfad:** sparring/finanzmodell-excel-spezifikation

Siehe `sparring/finanzmodell-excel-spezifikation/artifact.md`.

**Artifact-Typ:** directory
**Sparring-Typ:** Text
**Aktuelle Arbeitsfassung:** sparring/finanzmodell-excel-spezifikation/rounds/round_01/step_1_thesis/
**Subagent-Qualität:** Inherit

## Projektkontext (Pflichtlektüre vor der Step-Arbeit)

Lies vor Beginn deines Schritts alle in `sparring/finanzmodell-excel-spezifikation/artifact.md` unter `Projektkontext` aufgeführten Dateien. Sie enthalten Constraints (Längen, Tonalität, Zielgruppe, Brand Voice, Format-Vorgaben), die zusätzlich zur Rolle aus `CHALLENGE.md` gelten und im Output respektiert werden müssen. Steht dort `(keine)`, überspringe diesen Schritt.

## Rolle

Arbeite strikt nach der Rollen-Definition für **Synthese** in `sparring/finanzmodell-excel-spezifikation/CHALLENGE.md`, unter Einhaltung der Projektkontext-Vorgaben.

Integriere die Antithese ohne Kompromissfloskeln: Der reproduzierbare Build- und QA-Ansatz darf bleiben, aber nur als kleiner entscheidungsrelevanter Kern, der nicht die gesamte Markdown-Spezifikation als zweite Code-Spezifikation verdoppelt. Die neue Fassung muss als vollständiges Verzeichnis fuer Runde 2 taugen.

## Input-Dateien

- `sparring/finanzmodell-excel-spezifikation/rounds/round_01/step_1_thesis/`
- `sparring/finanzmodell-excel-spezifikation/rounds/round_01/step_2_antithesis.md`
- `sparring/finanzmodell-excel-spezifikation/rounds/round_01/step_2_handoff.md`

## Output-Dateien

- `sparring/finanzmodell-excel-spezifikation/rounds/round_01/step_3_synthesis/` als vollständiges Verzeichnis
- `sparring/finanzmodell-excel-spezifikation/rounds/round_01/step_3_handoff.md`

## Grenzen

- Schreibe nur die genannten Output-Dateien.
- Aktualisiere nicht `sparring/finanzmodell-excel-spezifikation/state.md`.
- Lege keine neue Runde an.
- Starte keinen Wait-Loop.
- Halte Hauptoutput und Übergabeimpuls getrennt.
- Wenn notwendige Input-Dateien fehlen oder widersprüchlich sind, schreibe keine Outputs und melde die Inkonsistenz an die Hauptsession.
- **Dies ist Worker-Mode, keine Exploration.** Du erledigst exakt einen vordefinierten Schritt mit einer fertigen Rollen-Definition aus `CHALLENGE.md` und vorgegebenen Output-Pfaden.
- **Keine programmatische Messung oder Sektionsextraktion für Inhaltsarbeit.** Lies die im Kontext gelisteten Input-Dateien mit den nativen Read-Werkzeugen deines Tools. Verboten ist jede Form von Code-Ausführung zur Längen-Messung, Sektionsausschnitt, Diff- oder Vergleichsberechnung — egal in welcher Sprache.

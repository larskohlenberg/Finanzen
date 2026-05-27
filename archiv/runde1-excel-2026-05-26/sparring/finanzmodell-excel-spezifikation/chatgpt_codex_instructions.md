# Instructions für den zweiten Agent (Codex-2)

Dies ist der Anweisungstext, den du in **Codex-2** einfügen musst, damit der zweite Agent in die Challenge **finanzmodell-excel-spezifikation** einsteigen kann.

- **Sparring-Name:** finanzmodell-excel-spezifikation
- **Sparring-Pfad:** sparring/finanzmodell-excel-spezifikation

---

## Variante A: Codex CLI / lokaler Agent mit Datei-Zugriff

Wenn der zweite Agent direkten Zugriff auf das Projektverzeichnis hat (Codex CLI, Cowork, zweite Claude-Code-Instanz), kopiere folgenden Text als ersten Prompt nach dem Sessionstart:

```
Im aktuellen Projektverzeichnis (/Users/larskohlenberg/Library/CloudStorage/OneDrive-Persönlich/Lars/Finanzen) läuft das Sparring
"finanzmodell-excel-spezifikation" unter sparring/finanzmodell-excel-spezifikation/.
Mein Name in diesem Sparring ist "Codex-2".

Bitte:
1. Lies sparring/finanzmodell-excel-spezifikation/state.md vollständig.
2. Lies sparring/finanzmodell-excel-spezifikation/artifact.md und sparring/finanzmodell-excel-spezifikation/CHALLENGE.md
   für Artefakt, Sparring-Typ und Regeln.
3. Falls "Dran:" den bekannten anderen Agenten zeigt → starte direkt
   den Wait-Loop mit meinem Namen. Keine Rückfrage.
4. Falls "Dran: Codex-2" → erledige meinen ausstehenden
   Schritt strikt nach Rolle, lies den passenden Übergabeimpuls
   (`*_handoff.md`), falls er existiert, schreibe die Output-Datei
   und die neue Handoff-Datei, aktualisiere state.md (Dran-Feld,
   Verlauf, ggf. neue Runde anlegen, falls ich gerade Synthese
   erledigt habe und die aktuelle Runde kleiner als die Gesamtrundenzahl
   ist).
   Wenn state.md `Step-Ausführung: subagent` zeigt, erzeuge zuerst
   einen isolierten Step-Kontext unter sparring/finanzmodell-excel-spezifikation/context/ und
   delegiere den Schritt an einen frischen Subagent/Worker, falls
   dein Tool das unterstützt. Der Subagent darf state.md nicht
   aktualisieren.
   Beachte `Subagent-Qualität`; wenn dein Tool keine Qualitätswahl
   erlaubt, verwende faktisch Inherit.
   Wenn state.md `Measurement: on` zeigt UND du gerade die Synthese
   (Step 3) erledigt hast: BEVOR du state.md aktualisierst, folge dem
   Sibling-Skill `text-sparring-measurement` (SKILL.md, Abschnitt
   "Nach Synthese") — er beschreibt Round-Delta- und Cumulative-
   Measurement inklusive Pfaden, Rubric-Auswahl und Final-Kopie nach
   `sparring/finanzmodell-excel-spezifikation/MEASUREMENT.md`. Ohne diese Skill ist Measurement
   nicht verfügbar; bei `Measurement: off` entfällt dieser Block.
5. Starte danach den Wait-Loop:
   bash sparring/finanzmodell-excel-spezifikation/watch_loop.sh "Codex-2"
6. Nach Start des Wait-Loops stumm bleiben. Keine Zwischenberichte,
   keine Statusmeldungen, keine Spekulation über den anderen Agenten.
7. Reagiere erst auf Exit-Codes:
   - 0 (WAKE) → nächsten Schritt erledigen, Loop erneut starten
   - 1 (DONE) → mich informieren, sparring/finanzmodell-excel-spezifikation/FINAL_ARTIFACT.md
     bzw. /FINAL_ARTIFACT/ erwähnen
   - 2 (TIMEOUT) → mich fragen, ob weiter warten

Pro Aufwachen genau ein Schritt. state.md ist die einzige Wahrheit.

Single-Skill-Modus: Aktiviere keine anderen Skills automatisch
(kein brainstorming, kein TDD, kein systematic-debugging, kein
using-superpowers o.ä.), auch wenn sie sich anbieten. Das Sparring
orchestriert sich selbst.
```

## Variante B: ChatGPT Web (ohne lokalen Datei-Zugriff)

Wenn der zweite Agent **kein** lokaler Datei-Zugriff hat (ChatGPT-Web ohne Code Interpreter / ohne MCP-File-Connector), funktioniert der Wait-Loop nicht.

In diesem Fall:

1. Lege als Custom Instructions / System Prompt im zweiten Agent folgendes ab:

   ```
   Du arbeitest am Sparring "finanzmodell-excel-spezifikation" im Wechsel mit
   einem anderen Agent (Codex). Pro Anfrage von mir bekommst
   du den aktuellen Zustand als Text-Block, befolgst die Regeln
   aus CHALLENGE.md (die ich dir mitliefere), produzierst exakt
   einen Output (These / Antithese / Synthese je nach Rolle laut
   state.md) plus einen separaten Übergabeimpuls für den nächsten
   Agenten. Keine Meta-Kommentare im Hauptoutput.
   Beachte Artifact-Typ (`file` oder `directory`) und erkannten
   Sparring-Typ (`Text`, `Campaign`, `Skill` oder `Code`).
   Wenn der Zustand einen Subagent-Modus beschreibt, behandle ihn als
   Kontextisolations-Wunsch. Ohne lokalen Datei- und Subagent-Zugriff
   bleibst du im semi-manuellen Modus.
   Mein Name in diesem Sparring ist "Codex-2".
   ```

2. Bei jedem Aufruf an den zweiten Agent kopierst du manuell rein:
   - aktuellen Inhalt von `sparring/finanzmodell-excel-spezifikation/state.md`
   - Inhalt von `sparring/finanzmodell-excel-spezifikation/artifact.md`
   - Inhalt von `sparring/finanzmodell-excel-spezifikation/CHALLENGE.md`
   - das relevante Input-File (artifact.md / step_1_thesis.md / step_2_antithesis.md aus dem aktuellen Rundenordner)
   - den passenden Übergabeimpuls (`*_handoff.md`), falls vorhanden

3. Du nimmst Hauptoutput und Übergabeimpuls entgegen, speicherst sie an den richtigen Stellen, aktualisierst state.md selbst und sagst dann **Codex** in der anderen Session "weiter".

Diese Variante ist semi-automatisch — sie braucht dich als Datei-Botin/Boten zwischen den beiden Tools.

---

## Empfehlung

Bevorzuge **Variante A** mit Codex CLI oder einer zweiten Claude-Code-Instanz im selben Projektverzeichnis. Dann läuft die gesamte Challenge nach den beiden Initialaufrufen vollautonom.

# Text-Sparring — Regelwerk

**Sparring-Name:** finanzmodell-excel-spezifikation
**Sparring-Pfad:** sparring/finanzmodell-excel-spezifikation
**Initiator (Agent A):** Codex
**Zweiter Agent (Agent B):** Codex-2
**Gesamtrunden:** 5
**Polling-Intervall:** 30 Sekunden
**Max. Wartezeit pro Loop:** 30 Minuten

---

## Zweck

Zwei Agenten verbessern ein Artefakt iterativ über die in `state.md` festgelegte Rundenzahl. Jede Runde besteht aus drei Schritten — **These**, **Antithese**, **Synthese**. Die Synthese einer Runde wird zum Ausgangsartefakt der nächsten Runde. Nach der letzten Runde endet die Challenge automatisch; das Ergebnis liegt in `FINAL_ARTIFACT.md` beziehungsweise `FINAL_ARTIFACT/`.

Es geht **nicht um einen Gewinner**. Es geht um akkumulierte Qualität durch Widerspruch und Integration.

Wenn in `state.md` `Measurement: on` gesetzt ist, läuft nach jeder Synthese ein dritter, neutraler Evaluator-Subagent, der einen deskriptiven Delta-Score erzeugt (`measurement_round.md`, `measurement_cumulative.md`). Diese Bewertung ist **kein Sieg-Kriterium** und beeinflusst die Rollenarbeit nicht — sie ist nur ein Anhaltspunkt für den User. These-, Antithese- und Synthese-Agents arbeiten unverändert nach ihren Rollen-Definitionen, ohne den Score zu optimieren.

---

## Sparring-Gegenstand

Der konkrete Gegenstand steht in `sparring/finanzmodell-excel-spezifikation/artifact.md` und zusätzlich in `sparring/finanzmodell-excel-spezifikation/state.md`.

- `Artifact-Typ: file` bedeutet: Die Arbeitsfassung ist eine einzelne Datei (`artifact.md`, `step_1_thesis.md`, `step_3_synthesis.md`).
- `Artifact-Typ: directory` bedeutet: Die Arbeitsfassung ist ein Verzeichnis (`artifact/`, `step_1_thesis/`, `step_3_synthesis/`).
- `Sparring-Typ` ist die User-Wahl: `Auto`, `Text`, `Campaign`, `Skill` oder `Code`.
- `Erkannter Sparring-Typ` ist die konkrete Interpretation für diesen Lauf.

Bei `Sparring-Typ: Auto` leite den erkannten Typ aus Artefakt und Projektkontext ab:

- `Text`: generische Text-, README-, Essay- oder Konzeptarbeit.
- `Campaign`: mehrere Posts, Kampagnenplaene, Content-Serien oder Redaktionsmaterial.
- `Skill`: Skills, Agent-Workflows, Prompt-/Template-Systeme oder `.skill`-Bundles.
- `Code`: Quellcode, Tests, Build-Dateien oder technische Implementierungen.

Bei explizitem `Sparring-Typ` uebernimm diesen als erkannten Typ. Frage nur nach, wenn Artefakt und Typ offensichtlich widersprechen.

Bei `Artifact-Typ: directory` erzeugen nur These und Synthese Verzeichnisse. Die Antithese bleibt immer `step_2_antithesis.md`, weil sie keine neue Artefaktfassung ist, sondern strukturierte Kritik.

---

## Rollen-Definitionen

Diese Definitionen gelten verbindlich für jeden Schritt — unabhängig davon, welcher Agent gerade die Rolle übernimmt. Wenn du als Agent eine dieser Rollen hast, befolge sie strikt.

**Vor jedem Schritt** lies die unter `Projektkontext` in `sparring/finanzmodell-excel-spezifikation/artifact.md` aufgeführten Dateien. Sie enthalten Constraints (Längen, Tonalität, Zielgruppe, Brand Voice, Format-Vorgaben), die zusätzlich zu den hier definierten Rollen-Regeln gelten. Wenn dort `(keine)` steht, ist kein Projektkontext aktiv.

### These (Schritt 1)

Du bist Autor der Runde. Deine Aufgabe:

- Lies `artifact.md` als Ausgangspunkt.
- Produziere die **bestmögliche Version** dieses Textes auf Basis dessen, was du jetzt weißt.
- Falls dies Runde 1 ist: das ist der erste Vorschlag. Verbessere den Ausgangstext substanziell, aber bleibe in seinem Thema und Geist.
- Falls dies Runde 2+ ist: `artifact.md` ist die Synthese der Vorrunde — baue darauf auf, lies zusätzlich `step_3_handoff.md` aus der Vorrunde, aber verbessere mutig.

Bei `Artifact-Typ: file`: Schreibe das Ergebnis nach `step_1_thesis.md` in deinem aktuellen Rundenordner. Kein Kommentar, kein Meta-Text — nur der Text selbst.

Bei `Artifact-Typ: directory`: Schreibe die neue Fassung als vollständiges Verzeichnis nach `step_1_thesis/`. Erhalte sinnvolle relative Pfade. Entferne Dateien nur, wenn es die Qualität des Artefakts klar verbessert.

Schreibe zusätzlich nach `step_1_handoff.md` einen kurzen Übergabeimpuls für die Antithese:

```markdown
## Übergabeimpuls
- Welche Annahme im Text sollte der nächste Agent besonders hart prüfen?
- Welche Stelle wirkt stark, könnte aber auf falschen Voraussetzungen beruhen?
- Welche Entscheidung in Ton, Struktur oder Pointe ist absichtlich riskant?
```

### Antithese (Schritt 2)

Du bist jetzt **radikaler Zweifler**, nicht Autor. Lies `step_1_handoff.md`, falls vorhanden, bevor du prüfst.

Deine einzige Aufgabe: Finde die **drei fundamentalsten Annahmen** in `step_1_thesis.md` und stelle jede davon in Frage. Nicht den Text verbessern. Die Grundlagen erschüttern.

Formuliere für jede Annahme:

1. **Was wird hier als selbstverständlich angenommen?** (1–2 Sätze)
2. **Was wäre, wenn das Gegenteil wahr wäre?** (1–2 Sätze)
3. **Welche andere Struktur, welcher andere Ton, welche andere Schlussfolgerung würde dann entstehen?** (1–3 Sätze)

Optional am Ende: zwei bis drei kürzere, kleinere Beobachtungen ("Nebenkritik") — Stellen, an denen der Text nicht radikal falsch, aber unscharf, klischeehaft oder vermeidbar konventionell ist.

Schreibe das Ergebnis immer nach `step_2_antithesis.md`. Format:

```markdown
## Annahme 1: <kurzer Titel>
**Selbstverständlich angenommen:** ...
**Wenn das Gegenteil wahr wäre:** ...
**Alternative Struktur:** ...

## Annahme 2: ...

## Annahme 3: ...

## Nebenkritik
- ...
- ...
```

Schreibe zusätzlich nach `step_2_handoff.md` einen kurzen Übergabeimpuls für die Synthese:

```markdown
## Übergabeimpuls
- Welche Kritik muss die Synthese unbedingt ernst nehmen?
- Welche These darf trotz Kritik nicht vorschnell geopfert werden?
- Wo liegt die produktive Spannung, aus der eine bessere Fassung entstehen kann?
```

### Synthese (Schritt 3)

Du hast jetzt `step_1_thesis.md` (These), `step_2_antithesis.md` (Antithese) und `step_2_handoff.md` (Übergabeimpuls der Antithese).

Deine Aufgabe ist **nicht Kompromiss**, sondern **Integration**:

- Was aus der Kritik ist wahr — auch wenn es wehtut?
- Was bleibt trotzdem stehen, weil es trägt?
- Welche neue Form entsteht, wenn beide Wahrheiten gleichzeitig gelten?

Schreibe eine **neue Version des Textes**, die beides trägt. Kein "einerseits / andererseits". Eine Version, in der die Spannung produktiv aufgelöst ist.

Bei `Artifact-Typ: file`: Schreibe das Ergebnis nach `step_3_synthesis.md`. Wieder: nur der Text, kein Meta.

Bei `Artifact-Typ: directory`: Schreibe die integrierte neue Fassung als vollständiges Verzeichnis nach `step_3_synthesis/`.

**Wichtig**: Dieser Output wird automatisch zum Artefakt der nächsten Runde. Schreibe also eine vollständige, lauffähige Fassung — nicht ein Diff oder eine Sammlung von Notizen.

Schreibe zusätzlich nach `step_3_handoff.md` einen kurzen Übergabeimpuls für die nächste Runde:

```markdown
## Übergabeimpuls
- Welche neu entstandene Annahme sollte die nächste Runde prüfen?
- Welche Stelle ist verbessert, aber noch nicht endgültig gelöst?
- Welche Richtung sollte die nächste These mutig weiterverfolgen?
```

---

## Übergabeimpulse

Jeder Schritt erzeugt neben seinem Hauptoutput eine separate `*_handoff.md`-Datei. Diese Datei gibt dem nächsten Agenten 1–3 konkrete Prüf- oder Schärfimpulse mit.

Der Übergabeimpuls ist **keine** Anweisung, die Rolle des nächsten Schritts zu verlassen. Er markiert nur Stellen, an denen der Text besonders Spannung, Risiko oder ungenutztes Potenzial enthält. Der nächste Agent liest den passenden Übergabeimpuls vor seinem Schritt und berücksichtigt ihn innerhalb seiner Rolle. Wenn ein Impuls der Rolle widerspricht, gilt die Rolle.

Regeln:

- Maximal 3 Bulletpoints.
- Keine Meta-Diskussion über den Prozess.
- Keine höflichen Arbeitsanweisungen.
- Nur konkrete Prüfimpulse am Text.

---

## Ausführungsmodus

Das Sparring kann Schritte inline oder in isolierten Subagent-Kontexten ausführen. Die aktive Einstellung steht in `sparring/finanzmodell-excel-spezifikation/state.md`:

- `Ausführungsmodus` ist die User-Wahl: `Auto`, `Subagent` oder `Inline`.
- `Step-Ausführung` ist die tatsächliche Umsetzung im aktuellen Tool: `subagent` oder `inline`.
- `Subagent-Qualität` ist die Qualitäts-Policy für Step-Subagents: `Inherit`, `Balanced`, `High` oder `Role-based`.

Im Subagent-Modus erzeugt die Hauptsession vor jedem Schritt eine Datei unter `sparring/finanzmodell-excel-spezifikation/context/round_NN_step_M_prompt.md`. Der Subagent/Worker/Workstream erhält nur diesen Step-Kontext und schreibt nur die dort genannten Output-Dateien.

Wichtig:

- Nur die Hauptsession aktualisiert `state.md`.
- Nur die Hauptsession legt neue Runden an.
- Nur die Hauptsession startet den Wait-Loop.
- Subagents dürfen keine Orchestrierung übernehmen.
- Wenn `Ausführungsmodus: Subagent` gesetzt ist und ein Tool keine Subagents starten kann, muss der Agent stoppen und den User fragen. Kein stiller Fallback.
- Bei `Ausführungsmodus: Auto` darf ein Agent auf inline zurückfallen, wenn keine Subagent-Ausführung verfügbar ist.
- Bei `Subagent-Qualität: Inherit` werden keine Modell- oder Reasoning-Overrides gesetzt.
- Bei `Balanced`, `High` oder `Role-based` übersetzt der Agent die Policy in die beste verfügbare lokale Modell-/Reasoning-Einstellung. Wenn das Tool keine Qualitätswahl erlaubt, verwende faktisch `Inherit`.

---

## Rotationsplan (Vollrotation)

Der Rotationsplan ist als 10-Runden-Muster definiert. Wenn weniger als 10 Runden gewählt wurden, gilt nur der Präfix bis zur gewählten Gesamtrundenzahl. Bei genau 10 Runden ist die Rollenverteilung exakt ausbalanciert (5×5 je Rolle).

| Runde | These | Antithese | Synthese |
|-------|-------|-----------|----------|
| 1     | Codex | Codex-2 | Codex |
| 2     | Codex-2 | Codex | Codex-2 |
| 3     | Codex | Codex-2 | Codex-2 |
| 4     | Codex-2 | Codex | Codex |
| 5     | Codex | Codex | Codex-2 |
| 6     | Codex-2 | Codex-2 | Codex |
| 7     | Codex | Codex-2 | Codex |
| 8     | Codex-2 | Codex | Codex-2 |
| 9     | Codex | Codex-2 | Codex-2 |
| 10    | Codex-2 | Codex | Codex |

---

## Datei-Layout pro Runde

```
sparring/finanzmodell-excel-spezifikation/rounds/round_NN/
├── artifact.md|artifact/   ← Ausgangsartefakt dieser Runde
├── step_1_thesis.md|/      ← These (von Agent gemäß Plan)
├── step_1_handoff.md       ← Übergabeimpuls an die Antithese
├── step_2_antithesis.md    ← Antithese
├── step_2_handoff.md       ← Übergabeimpuls an die Synthese
├── step_3_synthesis.md|/   ← Synthese — wird zum Artefakt der Folgerunde
└── step_3_handoff.md       ← Übergabeimpuls an die nächste Runde
```

Nach der letzten Runde wird `step_3_synthesis.md` beziehungsweise `step_3_synthesis/` zusätzlich nach `sparring/finanzmodell-excel-spezifikation/FINAL_ARTIFACT.md` oder `sparring/finanzmodell-excel-spezifikation/FINAL_ARTIFACT/` kopiert.

---

## Exit-Bedingungen

- Nach Schritt 3 der letzten Runde: Challenge beendet, `state.md` zeigt `completed`.
- Während des Wait-Loops: Falls 30 Min Timeout → der wartende Agent fragt den User nach.
- Manueller Abbruch: User kann jederzeit einer Session sagen "stoppen", dann beendet der Agent den Loop und schreibt nichts mehr.

---

## Silent Wait Mode

Sobald ein Agent den Wait-Loop startet, bleibt er stumm, bis der Prozess endet.

Erlaubte Reaktionen gibt es nur auf:

- Exit 0 / WAKE
- Exit 1 / DONE
- Exit 2 / TIMEOUT

Während des Wartens:

- Keine Zwischenberichte.
- Keine Spekulation über den anderen Agenten.
- Keine Plananalyse.
- Keine erneute Zusammenfassung.
- Keine UI-Kommentare wie "weiter wartend" oder "noch kein Wake".

---

## Verhaltensregeln für beide Agenten

1. **state.md ist die einzige Wahrheit.** Vor jeder Aktion lesen — kein Vertrauen ins eigene Gedächtnis.
2. **Genau ein Schritt pro Aufwachen.** Nach Erledigung zurück in den Wait-Loop.
3. **Silent Wait Mode.** Während `watch_loop.sh` läuft, keine Zwischenkommentare oder Statusmeldungen ausgeben.
4. **Keine Meta-Kommentare in den Output-Dateien.** Reine Inhalts-Outputs.
5. **Übergabeimpulse getrennt halten.** Prüfimpulse gehören in `*_handoff.md`, nicht in die Hauptoutput-Dateien.
6. **Bei Inkonsistenz**: Stop, frag den User. Nicht raten.
7. **Rollentreue**: Wenn du als Antithese-Agent versucht bist, "konstruktiv zu sein" — widerstehe. Die Rolle braucht die Schärfe.

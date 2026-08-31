# Finanzmodell

Privates Finanzmodell: Stammdaten, Bewegungsdaten und eine lokale Web-App zur
Auswertung. Kein Firmenprojekt — **keine Enterprise-Muster**: keine Audit-Logs,
kein Append-Only, keine Versionsfelder. Die Git-History ist Spur genug.

## Wo die Wahrheit steht

| Datei | Inhalt |
| --- | --- |
| `app/docs/agent-context.md` | **Operative Wahrheit.** Status, Herkunft, Kategorisierung, Validierung, Agentenprotokoll, Liste aller Tools. Vor jeder Arbeit an Daten lesen. |
| `CONTEXT.md` | Fachliches Glossar. Nur Sprache, keine Implementierungsdetails. |
| `docs/adr/` | Entscheidungen samt Begruendung und verworfenen Alternativen. |

## Betriebsanweisungen in `app/docs/skills/`

| Skill | Wofuer |
| --- | --- |
| **`import-durchlauf.md`** | **Der Standardweg.** Rohdatei bis freigegebener Bestand in einem Lauf: importieren, verregeln, freigeben, pruefen. |
| `import-agent.md` | Normalisierung einer Rohdatei (Station 1 des Durchlaufs). |
| `kategorisierungsregel-pflege.md` | Offen-Stapel ueber die Belegleiter verregeln (Station 2). |
| `kategorisierung-review.md` | Korrekturen an dem, was der Pruefbericht zeigt. Keine Pflichtstation mehr. |
| `stammdaten-erfassung-agent.md` | Personen, Konten, Kategorien. |
| `vorsorge-erfassung-agent.md` | Vorsorgevertraege. |
| `regelzahlung-agent.md` | Regelzahlungen. |
| `szenarien-annahmen.md` | Szenarien. |
| `validierung-agent.md` | Validierung. |

Zwei Subagenten in `.claude/agents/` tragen die Urteilsarbeit des Durchlaufs mit
festgelegtem Modell und Effort: `import-normalisierung` und `regel-recherche`.

## Nicht verhandelbar

**Das Repo ist oeffentlich** (github.com/larskohlenberg/Finanzen). Echte
Finanzdaten duerfen weder im Stand noch in der Historie liegen. `.gitignore`
schuetzt `app/data/**`, `app/Belege/**` und `archiv/` — aber `docs/`,
`CONTEXT.md` und `tests/` sind versioniert. **Auch Prosa leckt**: den
ausgehenden Diff vor jedem Push auf Namen, Adressen, Betraege, Orte sowie
Instituts- und Merchantnamen greppen. Konkrete Werte gehoeren ins
`agent_log.jsonl` (nicht versioniert); Dokumente verweisen nur darauf.

**Datenroot ist ein Argument**, nie hartkodiert — `dataRootFromArg` aus
`app/tools/data-root.mjs`. Produktiv ist `app/data/master`.

**Schreibende Tools sind ohne Flag eine Vorschau.** Erst `--schreiben` bzw.
`--anwenden` schreibt. Nach jedem Schreiben laeuft der Validator.

**Betraege sind Decimal-Strings**, gerechnet wird ueber `toCents` aus
`app/tools/lib/text.mjs`. Nie Float.

**Tools sind reine Funktion plus CLI** mit `node --test`. Erkennen und
Vorschlagen ist Agent-Urteil, Matchen und Rechnen ist Tool (ADR 0003, 0010).

## Arbeitsweise

- **Feature-Branch ja, gemerged wird von Lars.** Quellcode und Doku duerfen
  ohne Rueckfrage committet werden; nur Echtdaten sind tabu.
- **Commits auf Deutsch, ohne Umlaute** (`ue`, `ae`, `oe`, `ss`).
- **Kategorisieren ohne Vorab-Bestaetigung.** Alles vorschlagen, aber nur mit
  Beleg — sonst `KAT-012`. Das Gate und der Pruefbericht sind die Kontrolle
  (ADR 0025), nicht ein Dialog pro Buchung.
- **Stammdatenpflege braucht keine Spec.** Konto, Zeitwert oder Beleg direkt
  anlegen; Spec und Plan nur, wenn Code betroffen ist.

```bash
npm test
```

# Handoff: M8 — Agentenworkflow und wiederkehrende Prüfungen

**An:** Agent im Projekt „Finanzmodell Runde 2“
**Quelle:** One-Shot-Referenz `…/Projekte/Finanzen_OneShot` — dort sind Laufprotokoll, Prüfregel-Katalog (inkl. Plan-Ist), Vorschlags-Disziplin und 8 Agent-Skills umgesetzt.
**Portierbare Dateien:** `shared/checks.js` (Prüfregeln), `tools/lib/protokoll.mjs`, `tools/nachkategorisieren.mjs` (Unantastbarkeits-Muster), `tests/checks.test.mjs`, `tests/tools.test.mjs` (Idempotenz), `skills/README.md` + `skills/0*.md`, `AGENTS.md`.

## 1. Laufprotokoll-Schema (Exit: „Laufprotokolle haben Schemas“)

Euer `agent_log.jsonl` ist der richtige Ort — auf dieses Format heben (ein Objekt je Lauf):

```json
{
  "lauf_id": "lauf-<zeitstempel>-<akteur>",
  "zeitpunkt": "ISO-8601",
  "akteur": "agent | tool:import | tool:recategorize | …",
  "skill": "<skill-name>",
  "anlass": "…",
  "eingaben": ["dateien, dialogkontext, belege"],
  "aenderungen": [{ "datei": "…", "art": "neu | angehaengt | geaendert", "anzahl": 3, "details": "…" }],
  "validierung": { "ok": true, "fehler": [] },
  "offene_punkte": ["…"]
}
```

Regeln: Tools schreiben ihr Protokoll selbst (im Tool-Code, nicht als Agentenversprechen); auch **abgebrochene** Läufe protokollieren (mit `validierung.ok: false`). Dazu eine **Protokoll-Ansicht** in der App (Tabelle: Zeitpunkt, Akteur, Anlass, Änderungen, Validierung-Badge, offene Punkte) — Referenz: `app/js/views/protokoll.js`.

## 2. Offene Punkte als eigene Entität

`offene_punkte.json`: `{punkt_id, text, bezug?: {typ, id}, status: offen | erledigt, angelegt}`. Nie löschen, nur auf `erledigt` setzen. Das ist der Sammelort für „Lücke sichtbar statt geraten“ (Beleg fehlt, Wert unklar, Nutzerentscheidung steht aus) und der Arbeitsvorrat des wiederkehrenden Prüflaufs. Checks zeigen offene Punkte als Hinweise an.

## 3. Prüfregel-Katalog (deterministischer Code, kein Agentenverhalten)

Ein Modul `checks.mjs`, Eingabe Bestand + Heute-Datum, Ausgabe `[{schwere: fehler|warnung|hinweis, code, text, bezug}]`. Katalog aus der One-Shot-Referenz (alle implementiert + getestet in `shared/checks.js`):

| Code | Schwere | Logik |
|---|---|---|
| `anker-fehlt` | Warnung | aktives Konto ohne Kontostand-/Depotwert-Anker |
| `anker-veraltet` | Hinweis | Anker älter als 45 Tage |
| `kategorisierung-review` | Warnung | n offen + m vorgeschlagen (euer „Nächste Aktion“-Zähler speist sich hieraus) |
| `transfer-unvollstaendig` | Hinweis | Transfer ohne Gegentransaktion |
| `regelzahlung-review` | Warnung | Vorschlag wartet auf Bestätigung („wirkt bis dahin nicht in Liquidität/Szenarien“) |
| `plan-ist-abweichung` | Warnung | siehe §4 |
| `vorsorge-ungeprueft` | Warnung | `geprueft: false` oder Qualität `offen` (M7) |
| `marktwert-fehlt` / `-veraltet` | Warnung/Hinweis | Vermögenswert ohne/mit >365 Tage altem Marktwert |
| `restschuld-anker-fehlt` | Warnung | Darlehen ohne Restschuld-Anker (ADR 0013) |
| `offener-punkt` | Hinweis | jeder offene Punkt aus §2 |

## 4. Plan-Ist-Abgleich (der M5-Grilling-Vermerk, generalisiert)

Algorithmus für **alle** Planwerte (bestätigte Regelzahlungen, geplante Sondertilgungen aus bestätigten Szenarien, künftig weitere):

1. Fälligkeiten des Planwerts im Fenster `heute − 40 Tage` bis `heute − 5 Tage` expandieren (5 Tage Karenz für Buchungsverzug).
2. Letzte Fälligkeit nehmen; im Bestand nach Ist-Buchung suchen: gleiches Konto, exakter Betrag, Datum ± 5 Tage.
3. Kein Treffer → `plan-ist-abweichung` mit Fälligkeitsdatum und Betrag. Die Erklärung kennt nur der Nutzer (ausgefallen? verschoben? geändert?) — der Folgeschritt ist IMMER Dialog, nie stille Korrektur.

Erweiterung für schwankende Beträge (Gehalt mit Zulagen): Betrag ± Toleranzfeld an der Regelzahlung (`toleranz_prozent`), Default 0.

## 5. „Rollenrechte verhindern stille Fachentscheidungen“ — als Code-Invarianten

Statt eines Rechte-Systems drei harte Invarianten, die jedes Tool durchsetzt:

1. **Tools setzen nie `bestaetigt`.** Regel-/Importpfade erzeugen ausschließlich `vorgeschlagen` (+ `entscheidungsquelle: regel|agent`). `bestaetigt` entsteht nur im Review mit `entscheidungsquelle: mensch`.
2. **`bestaetigt`/`abgelehnt` sind unantastbar.** Nach-Kategorisierung und Re-Importe fassen nur `offen`/`vorgeschlagen` an (Referenz: `tools/nachkategorisieren.mjs`; Bonus dort: Vorschlag, dessen Regel nicht mehr greift, fällt auf `offen` zurück statt zu verwaisen).
3. **Schreiben nur nach Validierung.** Validator vor und nach jedem Lauf; bei Fehlern wird nichts geschrieben und der Lauf als abgebrochen protokolliert.

Dazu ein Negativ-Test je Invariante (siehe `tests/import-pipeline.test.mjs`: „aendert nur offene/vorgeschlagene, nie menschliche Entscheidungen“).

## 6. „Wiederholte Läufe erzeugen keine doppelten Vorschläge“

- **Import:** Dedupe-Hash gegen Bestand → identischer Re-Import ist No-Op (Idempotenz-Test: zweiter Lauf „0 neu, n Duplikate“, Datei unverändert — `tests/tools.test.mjs`).
- **Regelzahlungs-Vorschläge:** `abgelehnt` nie löschen — der Status IST der Duplikatschutz (Agent prüft vor neuem Vorschlag auf existierende gleiche Regelzahlung inkl. abgelehnter).
- **Checks:** zustandslos aus dem Bestand berechnet, nie persistiert → können nicht duplizieren.

## 7. Skills vervollständigen (Lücken in `app/docs/skills/`)

Vorhanden: import, kategorisierung-review, regelpflege, regelzahlung, stammdaten. Fehlend (aus One-Shot übernehmen, an eure Pfade/Begriffe anpassen): **Szenarien & Annahmen** (M6), **Vorsorge-Erfassung** (M7), **Datenqualität & Plan-Ist** (dieser Meilenstein — der Skill, der den wiederkehrenden Prüflauf orchestriert: Checks ausführen, Befunde priorisiert mit dem Nutzer durchgehen, Folgearbeit an die Fach-Skills delegieren, Vorher-Nachher protokollieren).

Jeder Skill nach fester Gliederung (8 Abschnitte): erlaubte Eingaben / Lesen-Schreiben / eigene Entscheidungen / wann Nutzer fragen / Pflicht-Tools / Validierung / Protokoll / sichtbare Übergabe. Dazu ein Einstiegsdokument (`AGENTS.md`-Muster), das jeden neuen Agenten ohne Projekthistorie auf die Skills und die eisernen Regeln zeigt.

## 8. Akzeptanztests

1. Jeder Check-Code hat einen Positiv- und einen Negativ-Test (feuert / feuert nicht).
2. Plan-Ist: bestätigte Regelzahlung ohne Ist-Buchung → Warnung; mit passender Buchung (±5 Tage) → keine.
3. Import zweimal mit derselben Datei → idempotent, ein Protokolleintrag je Lauf.
4. Nach-Kategorisierung ändert `bestaetigt`/`abgelehnt` nachweislich nicht.
5. Abgebrochener Lauf (invalide Eingabe) hinterlässt Protokoll mit `ok: false` und keine Bestandsänderung.

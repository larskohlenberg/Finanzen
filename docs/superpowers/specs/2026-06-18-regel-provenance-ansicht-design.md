# Regel-Provenance & Regelansicht

**Datum:** 2026-06-18
**Status:** Entwurf zur Umsetzung
**Betroffene ADR:** neu — ADR 0018

## Problem

Die 210 Kategorisierungsregeln (`data/master/kategorisierungsregeln.json`) werden
in der App nicht angezeigt. Zwei Lücken:

1. **Keine Regelansicht.** Man kann nicht sehen, welche Regeln existieren, wie sie
   wirken (greifen oft / nie) und welche Transaktionen sie kategorisiert haben.
2. **Herkunft unsichtbar.** Transaktionen tragen `kategorie_herkunft` (`regel` /
   `manuell`), aber die App zeigt es nicht. Eine *manuelle* Kategorisierung ist
   auf der Oberfläche nicht erkennbar, obwohl sie eine bewusste menschliche
   Entscheidung ist.

Zusätzlich wird die Information *welche* Regel eine Transaktion kategorisiert hat
heute weggeworfen: `categorize()` berechnet `matched_regeln`, aber weder
`import.mjs` noch `recategorize.mjs` speichern es.

## Ziel

- Regeln in der App ansehen **und nachvollziehen**: pro Regel ihre Wirkung
  (Treffer-Count, getroffene Transaktionen, tote Regeln), beide Richtungen
  (Regel→Transaktion und Transaktion→Regel).
- Herkunft (`regel` / `manuell`) auf der Oberfläche sichtbar machen.
- Regel-Konflikte (mehrere Regeln widersprechen sich) sichtbar machen.
- Regeln **verständlich** anzeigen, nicht technokratisch: ein User muss begreifen,
  was eine Regel tut, ohne das Pattern lesen/interpretieren zu können.

## Kern-Entscheidung: Provenance speichern statt live nachrechnen

Die Zuordnung Transaktion→Regel wird **beim Kategorisieren gespeichert**, nicht
bei der Anzeige live nachgerechnet. Begründung:

- **Skalierung.** 2664 Transaktionen sind der Startbestand; bei wachsendem Bestand
  (weitere Konten, 10.000+ Buchungen) wird Live-Matching (O(N×Regeln) mit
  Normalisierung pro Anzeige) teuer. Einmal beim Kategorisieren rechnen ist O(1)
  bei der Anzeige.
- **Manuelle Entscheidungen.** Manuell verregelte Transaktionen würden bei
  Live-Re-Derivation gar nicht oder *falsch* zugeordnet. Die gespeicherte Herkunft
  ist die Wahrheit.

### Neues Feld: `matched_regeln`

Optionales Array `matched_regeln: ["REG-NNN", …]` auf der Transaktion.

**Invariante (single source of truth: `agent-context.md`):**

| Situation | `matched_regeln` |
|---|---|
| Per Regel kategorisiert (`herkunft = regel`) | gesetzt (alle treffenden Regeln, per Konstruktion einig auf 1 Kategorie) |
| Offen wegen Regel-Konflikt | gesetzt (alle treffenden Regeln, ≥2 distinkte Kategorien) |
| `manuell` | **nicht** vorhanden |
| `abgelehnt` | **nicht** vorhanden |
| Offen ohne Treffer (echter No-Match) | **nicht** vorhanden / leer |

**Konflikt ist ableitbar, kein Extra-Feld:** Wegen der `categorize()`-Logik gilt
`Status "offen" + nicht-leere matched_regeln ⟺ Konflikt` (ein Ein-Kategorie-Treffer
ergäbe Status „vorgeschlagen", nicht „offen"). Es wird **kein** `conflict`-Feld und
**kein** Zeit-/Audit-Feld eingeführt.

**Array statt einzelner ID:** `categorize()` kann mehrere Regeln liefern, die sich
auf dieselbe Kategorie einigen (z.B. „musterladenb" und „supermarkt" → Lebensmittel). Das
Array ist treu zur Engine und erlaubt korrekte Treffer-Zählung bei Überlappung.

### Wie `categorize()` bei mehreren Treffern entscheidet (unverändert)

Dreistufig über die *distinkten Kategorien* der treffenden aktiven Regeln:

- 0 Kategorien → `kategorie_id: null`, Status **offen**, `matched_regeln: []`
- genau 1 Kategorie (auch bei mehreren Regeln) → diese Kategorie, Status
  **vorgeschlagen**, alle Regel-IDs in `matched_regeln`
- ≥2 verschiedene Kategorien → `kategorie_id: null`, Status **offen**,
  `conflict: true`, alle Regel-IDs in `matched_regeln`

Bei Widerspruch entscheidet der Categorizer **bewusst nicht** (weder erste noch
Mehrheit noch agentisches Raten). Die Transaktion bleibt offen → menschliche
Entscheidung. `categorizer.mjs` selbst wird **nicht** geändert.

## Architektur

### Daten / Schema

- `schemas/transaktionen.schema.json`: optionales `matched_regeln`
  (`array` von `^REG-\d{3}$`).
- `tools/validate-core.mjs` (Inline-Schema): gleiches Feld; optional eine
  Konsistenzprüfung „`matched_regeln` nur bei `regel`/offen-Konflikt, nicht bei
  `manuell`/`abgelehnt`".

### Tooling (Schreibseite)

- `tools/import.mjs` (~Z. 91-98): `verdict.matched_regeln` mitschreiben — sowohl
  beim eindeutigen Treffer als auch beim Konflikt (heute wird beim Konflikt nur
  Status `offen` gesetzt; künftig zusätzlich `matched_regeln`).
- `tools/recategorize.mjs`:
  - `alsRegelVorschlag()` stempelt `matched_regeln` aus dem Verdict.
  - `alsOffen()` setzt bei Konflikt `matched_regeln` (statt zu strippen); bei
    echtem No-Match bleibt es leer/entfernt.
  - Der Sonderpfad „offen ohne Kategorie → unverändert lassen" muss berücksichtigen,
    dass ein Konflikt-Treffer jetzt gestempelt werden soll (sonst werden
    Konflikt-Sätze nie befüllt).
  - `changed()` muss `matched_regeln` in den Vergleich aufnehmen, sonst werden
    Sätze, bei denen sich nur die Provenance ändert, nicht neu geschrieben.

### Backfill (einmalig)

`recategorize.mjs` einmal laufen lassen — der kanonische Recompute (ADR 0017)
stempelt die 2075 Altsätze. `manuell` (347) bleibt unangetastet. Sätze, deren
ursprüngliche Regel nicht mehr ermittelbar ist (gelöscht/geändert), bleiben ohne
`matched_regeln` → UI zeigt „Quelle unbekannt" statt zu raten. Approach B kann die
Vergangenheit nicht erfinden; der einmalige Recompute ist die ehrliche Näherung,
danach ist die Provenance gespeichert.

### App (Anzeigeseite)

**Laden:** `data-loader.mjs` lädt `data/master/kategorisierungsregeln.json` →
`data.kategorisierungsregeln`.

**Selektor:** `selektoren.mjs` → `regelWirkung()`:
- invertiert `matched_regeln` über alle Transaktionen → Map
  `regel_id → { transaktionen: [...], anzahl }`.
- memoisiert pro Daten-Refresh-Token (Transaktionen liegen ohnehin im Speicher,
  ein O(N)-Tally-Pass, kein String-Matching, kein zusätzliches I/O).
- **Count wird hier aggregiert, nicht in der Regel-JSON persistiert** (kein
  denormalisierter, veraltender Cache).

**Routing:** `routing.mjs` → adressierbare Route `#/regeln/REG-…` (analog zu
Konto/Transaktion) und `masterSection === "regeln"`.

**Stammdaten-View** (`views/stammdaten.mjs`):
- 4. Kachel „Regeln" neben Personen/Konten/Kategorien (Count = Anzahl Regeln).
- Regel-Liste: Regel-ID, Pattern, Zielkategorie, Status, **Treffer-Count**; tote
  Regeln (0 Treffer) markiert. Sortier-/Filtermöglichkeit nach Treffer hilfreich,
  um tote Regeln zu finden.
- Adressierbare Regel-Detailseite (`#/regeln/REG-…`, eigene Rail analog zum
  Transaktions-Detail): Pattern/Kategorie/Status/Kommentar + Liste der getroffenen
  Transaktionen. Anzeige O(1) über `regelWirkung()`.

**Transaktions-View** (`views/transaktionen.mjs`):
- Detail-Rail, `Kategorie`-Sektion: Herkunft-Zeile
  „Quelle: Manuell" bzw. „Quelle: Regel REG-001 →" (Link zur Regel-Detailseite).
- Tabelle: dezenter Herkunft-Marker pro Zeile + Herkunft-Filter.
- Konflikt-offene Sätze: „offen – Regeln widersprechen sich
  (REG-x →KAT-A vs REG-y →KAT-B)".

### Verständlichkeit: Regeln erklärbar machen

Patterns sind heute reine Substrings (`includes()` nach `normalizeLoose` =
Kleinschreibung + Whitespace-Normalisierung; der Punkt in `amzn.mktp` ist
**literal**, kein Regex). Roh angezeigt sind sie für den User unverständlich und
werden fälschlich als Regex gelesen. Drei Schichten machen jede Regel begreifbar:

1. **Klartext-Bedingung (deterministisch, abgeleitet, kein gespeichertes Feld).**
   View-Helfer `regelKlartext(regel)` in `komponenten.mjs` erzeugt einen Satz aus
   den Regel-Feldern, z.B.: „Bucht auf **Lebensmittel**, wenn die **Gegenpartei**
   den Text »musterladenb« enthält (Groß-/Kleinschreibung egal)." Ergänzt um
   `verwendungszweck_pattern` („… und der Verwendungszweck »…« enthält"),
   `konto_id` („… nur auf Konto X"), `vorzeichen` („… und es eine Ausgabe ist").
   Macht die Match-Semantik (`enthält`) explizit → kein Regex-Missverständnis.
   Kategorie wird als Name aufgelöst, nicht als `KAT-NNN`.
2. **Echte Beispiele aus dem Bestand.** Aus `regelWirkung()`: einige distinkte
   getroffene Gegenparteien zeigen (z.B. „Trifft u.a.: AMZN Mktp DE, AMZN Mktp US").
   Stärkste Erklärung — macht aus `amzn.mktp` sichtbar „Amazon Marketplace".
3. **Notiz (`kommentar`).** Menschlicher Zusatz, prominent angezeigt.

**`kommentar` wird Pflicht und Klartext.** Eine Regel, die man nicht erklären kann,
darf nicht existieren — besonders bei künftigem Regex, wo Schicht 1 ein beliebiges
Muster nicht mehr in Prosa fassen kann; dann tragen `kommentar` + Beispiele die
Erklärung. Konkret:

- `schemas/kategorisierungsregeln.schema.json` + `tools/validate-core.mjs`:
  `kommentar` als `required` (nicht-leer).
- **Bereinigung:** 64 von 210 Kommentaren sind technokratisch
  (`„Inhalts-Regel (abgeleitet): X -> KAT-NNN"`) und werden auf Klartext
  umgeschrieben (eigene Plan-Phase). Die übrigen 146 sind bereits erklärend.
- `docs/skills/kategorisierungsregel-pflege.md`: verlangt künftig eine
  Klartext-Erklärung im `kommentar` (kein Pattern-Restatement), besonders für
  komplexe/Regex-Patterns.

### Skill-Docs (Schreibverhalten der Agenten)

Die Agenten schreiben diese Felder, daher müssen die Docs mitgezogen werden:

| Doc | Änderung |
|---|---|
| `docs/agent-context.md` | `matched_regeln` + Invariante zentral definieren (single source of truth). |
| `docs/skills/import-agent.md` | `matched_regeln` bei Treffer **und** Konflikt mitschreiben. |
| `docs/skills/kategorisierung-review.md` | **Kritisch:** Einzelkorrektur (`manuell`) und Ablehnung (`abgelehnt`) entfernen `matched_regeln`; Bulk-Bestätigen (bleibt `regel`) behält es. |
| `docs/skills/kategorisierungsregel-pflege.md` | Notiz: `recategorize.mjs` stempelt jetzt `matched_regeln`; Probelauf kann Trefferregeln aus dem Feld zeigen. **Plus:** jede neue/geänderte Regel braucht einen Klartext-`kommentar` (kein Pattern-Restatement). |
| `docs/skills/validierung-agent.md` | Validator akzeptiert das Feld; optionale Konsistenzregel. |

**Unangetastet:** `categorizer.mjs`, `dedupe.mjs`, `transfer-matcher.mjs`,
`docs/skills/regelzahlung-agent.md`, `docs/skills/stammdaten-erfassung-agent.md`.

**Kern-Korrektheit:** Eine manuelle Übersteuerung **muss** die Regel-Provenance
löschen — sonst widersprechen sich „Quelle: Manuell" und ein angezeigter
Regel-Link.

### ADR 0018

Dokumentiert die Modell-Entscheidung: Provenance gespeichert statt live (Skalierung
+ manuelle Entscheidungen), Konflikt-Sichtbarkeit, Count aggregiert statt
persistiert, Backfill über einmaligen Recompute, sowie das Erklärbarkeits-Prinzip
(Klartext + Beispiele statt roher Patterns, `kommentar` als Pflicht).

## Nicht im Scope (YAGNI)

- Regeln in der App anlegen/bearbeiten/löschen (CRUD) — Pflege bleibt per
  JSON/Agenten-Skill.
- Persistierter Treffer-Count in der Regel-JSON.
- Zeit-/Audit-/Versionsfelder.

## Abnahmekriterien

1. Transaktionen, die per Regel kategorisiert sind, tragen `matched_regeln`;
   `manuell`/`abgelehnt` tragen es nicht; Konflikt-offene Sätze tragen es.
2. Validator akzeptiert den Bestand nach Backfill ohne Fehler.
3. Stammdaten zeigen eine Kachel „Regeln" mit korrektem Count; Regel-Liste zeigt
   Treffer-Counts; tote Regeln sind erkennbar.
4. Regel-Detailseite ist über `#/regeln/REG-…` adressierbar und listet die
   getroffenen Transaktionen.
5. Transaktions-Detail zeigt die Herkunft; bei `regel` mit Link zur Regel; bei
   Konflikt den Widerspruch.
6. Manuelle Kategorisierung ist in Tabelle und Detail erkennbar.
7. Die fünf genannten Skill-Docs sind konsistent mit dem neuen Schreibverhalten.
8. Jede Regel wird verständlich angezeigt: Klartext-Bedingung (aufgelöste
   Kategorie, „enthält"-Semantik) + Beispiel-Gegenparteien + Notiz; rohe
   Patterns sind nicht die primäre Darstellung.
9. `kommentar` ist Pflicht (Schema + Validator); die 64 technokratischen
   Auto-Kommentare sind auf Klartext umgeschrieben.

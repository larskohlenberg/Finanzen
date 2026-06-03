# Handoff Runde 2

Stand: 03.06.2026

## ZUERST LESEN

1. `CONTEXT.md` — Glossar, die verbindliche Sprache des Projekts.
2. `docs/adr/` — vier Architekturentscheidungen, die nicht offensichtlich sind.
3. `docs/runde2/Datenmodell_Runde2.md` — aktuelle Struktur der Masterdaten.

Die drei Dokumente sind konsistent gehalten. Bei Widerspruechen gilt `CONTEXT.md` fuer Begriffe, ADRs fuer Begruendungen, Datenmodell fuer Struktur.

## Zweck

Dieses Handoff ist der Einstiegspunkt fuer die naechste Session. Runde 1 wurde archiviert; Runde 2 startet als lokale, agentenfreundliche Daten- und HTML-App-Architektur.

## Wichtigste Entscheidung

Excel ist nicht mehr Master. Der Master soll aus validierbaren Dateien bestehen. Eine lokale HTML/JavaScript-App zeigt und reviewt die Daten. Excel ist spaeter nur Export.

Das finale Ziel bleibt eine umfassende Finanzmodell-App. Runde 2 reduziert nicht den fachlichen Zielumfang aus Runde 1, sondern staffelt ihn in belastbare Meilensteine.

## Aktueller Arbeitsstand

- Alte Excel-V1-Artefakte liegen in `archiv/runde1-excel-2026-05-26/`.
- Die Retrospektive liegt in `docs/architektur/Retrospektive_Runde1_Excel.md`.
- Neue Runde-2-Dokumente:
  - `docs/runde2/Anforderungen_Runde2.md`
  - `docs/runde2/Datenmodell_Runde2.md`
  - `docs/runde2/Traceability_Runde1_zu_Runde2.md`
  - `docs/architektur/Architekturreview_Runde2.md`
  - `docs/runde2/Meilensteine_Runde2.md`
  - `docs/runde2/M2_Review_Oberflaeche.md`
- Aktive Zielordner:
  - `app/`
  - `data/inbox/`
  - `data/master/`
  - `data/exports/`
  - `schemas/`
- `Belege/` bleibt als aktive Nutzdatenablage erhalten.

## M1-Stand

M1 ist umgesetzt, wenn die frischen Checks erfolgreich laufen:

```bash
npm test
npm run validate:m1
```

Umgesetzte M1-Bestandteile:

- `schemas/` enthaelt Schemas fuer Personen, Konten, Kategorien, Transaktionen und Transfers.
- `data/master/` enthaelt einen kleinen validen Startdatenstand.
- `tools/validator.mjs` validiert Strukturregeln und die M1-Cross-Field-Regeln.
- `data/test-invalid/` enthaelt einen absichtlich kaputten Datensatz fuer den Negativtest.

## Warum M1.5 vor M2 eingeschoben wurde

In der M2-Grill-Session wurde entschieden, die Review-Oberflaeche nicht nur gegen Demo-Daten zu bauen. Vor M2 soll ein kleiner agentischer Schritt echte Stammdaten aus vorhandenen Unterlagen und Runde-1-Artefakten extrahieren.

M1.5 ist bewusst eng begrenzt:

- Ja: echte Personen, Konten und Kategorien extrahieren und mit dem Nutzer pruefen.
- Ja: unklare Werte als offene Fragen sichtbar machen.
- Ja: vorhandene Unterlagen, Runde-1-Artefakte und CSVs lesen, aber nur um Stammdaten abzuleiten.
- Nein: Kontoauszuege massenhaft importieren.
- Nein: Transaktionen automatisch kategorisieren.
- Nein: Regelzahlungen oder Cashflow-Prognosen erkennen.

Arbeitsmodus fuer M1.5:

- Der Agent fragt im Dialog; der Nutzer entscheidet.
- Nach expliziter Bestaetigung pro fachlichem Block darf der Agent `data/master/personen.json`, `konten.json` und `kategorien.json` direkt ersetzen.
- Offene Fragen werden nur dann in `docs/runde2/M1_5_Offene_Fragen.md` festgehalten, wenn sie am Session-Ende ungeklart bleiben oder bewusst vertagt werden.
- Demo-Transaktionen bleiben vorerst in `data/master/transaktionen.jsonl`, werden aber klar als Demo markiert und spaeter in einem Wrap-up geloescht oder verschoben.

## M2-Stand

M2 ist als designgefuehrte Review-Oberflaeche geschnitten und in `app/` umgesetzt. Die verbindliche Leitplanke und der Umsetzungsstand stehen in `docs/runde2/M2_Review_Oberflaeche.md`.

Wichtigste Entscheidungen:

- Finanzstatus steht auf der Uebersicht im Vordergrund.
- Die App hat keine Import-Funktion; Daten werden agentisch als Review-Bundle bereitgestellt.
- Fuer M2 kann das Review-Bundle als `app/review-data.js` neben der statischen App liegen.
- Hauptnavigation: Uebersicht, Transaktionen, Stammdaten, Checks, Export.
- Export ist in M2 nur Platzhalter fuer spaeter.
- Sprache und Darstellung sind dezente Dropdowns, nicht breite Umschalter.
- UI-Texte kommen aus i18n-Labels.
- `Kategorie offen` ist der UI-Begriff fuer Transaktionen mit offener Kategorie.
- Die Sidebar ist einklappbar.
- Die Transaktionsliste hat Pagination und genug M2-Demodaten fuer Blaettern.
- Die Uebersicht fuehrt mit `Geladener Gesamtsaldo (Konten)` und wiederholt den Arbeitsstatus dort nicht doppelt.
- Helles Farbschema: weisser Hintergrund, leicht graue Navigation und Kacheln.

## Bewusste M2-Schulden (vor M3 adressieren)

**Stand 02.06.2026 (nach M3):** Auf Branch `fix/m2-schulden` abgebaut: **#2** (Hash/Click-Kollision), **#4** (`cents()` robust), **#6** (i18n: Kontotyp-Labels + Nav-`aria-label`), **#7** (Checks-Tiles nicht-interaktiv), **#8** (Transfer-Tile mit echter Prüfung). Plan: `docs/superpowers/plans/2026-06-02-m2-schulden.md`. **Bewusst offen:** #1 (Full-Re-render — erst M4/M5/M9), #3 (`pushState` ohne URL-Update — akzeptiert). **#5 (Unicode-Glyphen → SVG)** bekommt einen eigenen Durchgang (Inventar größer als die 8 Nav-Glyphen; Icon-Ansatz noch zu entscheiden). Residual-Minor aus dem Review: inerte CSS-Regeln `.transfer-anchor` und `.tile-static:focus-visible` — beim #5-CSS-Durchgang mit aufräumen.

Im Review am 27.05.2026 identifiziert und bewusst nicht in M2 gefixt:

- **Full-innerHTML-Re-render bei jeder Interaktion** (`app/main.js`, `render()`).
  Bei 30 Demo-Transaktionen tolerierbar. Mit echten Daten verliert die UI Fokus
  und Scroll-Position. Spaetestens bei M4/M5 oder M9 entscheiden, ob ein
  Framework-Wechsel oder gezielte Partial-Renders die richtige Antwort sind.
- **History-/Hash-Handler-Kollision** (`app/main.js`, Transfer-Anker `#transaction=...`).
  Click auf eine Gegenbuchung loest sowohl `hashchange` als auch
  `data-action="paired-transfer"` aus. Doppel-Render, Reihenfolgen-Risiko.
  Entweder Anker entfernen oder Click-Handler — nicht beides.
- **`pushState("", "", "")` ohne URL-Update**. Browser-Zurueck funktioniert,
  aber Refresh verliert Filter, Auswahl und Seite. Fuer eine reine Review-App
  ok, soll aber bewusst so bleiben.
- **`cents()` stringbasiert** (`app/main.js`). Funktioniert, ist aber fragil
  bei Sonderformaten. `Math.round(Number(s) * 100)` waere robuster. Schema
  garantiert das Format heute schon, deswegen kein akuter Bug.
- **Unicode-Glyph-Icons** (`⌂ ≡ ◫ ✓ ⇩ ↔ ‹ ›`). Darstellung stark
  fontabhaengig. Vor M3 durch SVG-Icons ersetzen.
- **Hardcoded deutsche Strings**: `accountTypeLabel()` (`Depot`, capitalize),
  `aria-label="Hauptnavigation"`. Erscheinen im EN-Modus weiterhin deutsch.
- **Checks-Page-Tiles sind `<button>`, machen aber nichts**. Entweder
  klickbar machen (Filter/Drill-down) oder als `<div>` darstellen.
- **Transfer-Tile in Checks** zeigt fest `0` und gruenen Erfolgs-Chip,
  obwohl keine Transfer-Pruefung existiert. Als „noch nicht implementiert"
  kennzeichnen.

## M3-Stand

M3 ist als deterministische Import-Pipeline umgesetzt (`tools/import.mjs` plus reine Helfer-Module). Der Agent normalisiert Rohdateien ins standardisierte Importformat, die Pipeline dedupliziert, kategorisiert, paart Transfers, validiert und schreibt. Importfehler sind im Checks-Bereich der App sichtbar.

Verifikation:

```bash
npm test
npm run validate:m1
```

Offen / spaeter: Import-Agent-Skill von Markdown in echtes Skill-Format ueberfuehren (skill-creator), sobald die Pipeline produktiv genutzt wurde.

## M4-Stand

**Stand 03.06.2026:** M4 ist abgeschlossen. Cashflow-Ist und -Prognose laufen ueber eine geteilte, reine Funktion (`app/cashflow.mjs`, in Node getestet, im Browser aufgerufen). Regelzahlungen sind ein eigener Stammdatensatz mit Status-Feld (`vorgeschlagen | bestaetigt | abgelehnt`); nur `bestaetigt` wirkt auf die Prognose, Vorschlaege sind sichtbar, wirken aber nicht still.

Die Prognose ist in der Oberflaeche **nachvollziehbar** gemacht (Branch `fix/m4-prognose-nachvollziehbarkeit`, in `main` gemergt):

- Eigener Nav-Punkt **Regelzahlungen** zeigt die Eingangsdaten (Bezeichnung, Betrag, Rhythmus, erste Faelligkeit, Gueltig-bis, Status).
- Die Prognose-Tabelle ist nach **Monat/Quartal/Jahr** aggregierbar (feste Kalenderquartale, nicht rollierend) und bis zu einem waehlbaren **Bis-Datum** begrenzbar.
- Jeder Zeitraum ist bis zu den einzelnen Faelligkeiten aufklappbar (Zeitraum → Monate → Posten); die Summe bleibt ueber dem aufgeklappten Inhalt sichtbar.
- Der **laufende** Zeitraum (Quartal/Monat) ist markiert, weil er nur noch die erwarteten Faelligkeiten enthaelt — bereits Gebuchtes steht im Cashflow-Ist.

Exit-Kriterien (alle erfuellt):

- Vorschlaege von bestaetigten getrennt (ein Datensatz, Status-Feld; keine separate Vorschlags-Datei).
- Cashflow-Ist basiert auf Transaktionen.
- Prognose kennzeichnet unbestaetigte Annahmen und ihre bewusste Unvollstaendigkeit (nur Regelzahlungen; keine Einmaleffekte/Szenarien) — Chip „Vorschlaege nicht enthalten", Hinweistext, `einmaleffekte_enthalten = false`.
- Datenqualitaet steht als faktische Zaehler neben den Kennzahlen (kein Konfidenz-Score).
- Regelzahlungs-Agent-Skill (`docs/skills/regelzahlung-agent.md`) beschreibt Erkennung/Vorschlag/Bestaetigung und meldet offene Vorschlaege zu Session-Beginn aktiv (App ist nur Anzeige, Agent ist der einzige Aenderungskanal).

Dokumente: ADRs 0010/0011/0012; Spec `docs/superpowers/specs/2026-06-03-m4-prognose-nachvollziehbarkeit-design.md`; Plan `docs/superpowers/plans/2026-06-03-m4-prognose-nachvollziehbarkeit.md`.

Verifikation:

```bash
npm test
npm run validate:m1
```

Technische Notiz: M4 nutzt weiterhin den Full-Re-render (M2-Schuld #1). Mit Demo-Daten und der aufklappbaren Prognose-Tabelle tolerierbar; bei echten, langen Regelzahlungslisten Fokus-/Scroll-Verlust beobachten und spaetestens in M5/M9 ueber gezielte Partial-Renders oder einen Framework-Wechsel entscheiden.

## Naechster sinnvoller Schritt

Naechste Session: **M5 — Vermoegen, Verbindlichkeiten und Immobilien** (siehe `docs/runde2/Meilensteine_Runde2.md`).

1. M5-Exit-Kriterien in `docs/runde2/Meilensteine_Runde2.md` lesen.
2. Mit dem Nutzer den Schnitt der Entitaeten klaeren (Immobilien, Darlehen, Konten, Depots getrennt; Bewertung mit Standdatum und Quelle; Nettovermoegen berechnet, nicht manuell gepflegt; fehlende Quellen erzeugen sichtbare Checks).
3. Vor neuen Schemas: Begriffe gegen `CONTEXT.md` pruefen — Unbekanntes klaeren, nicht raten.
4. Cashflow-/Prognose-Oberflaeche bei echten Regelzahlungen einmal im Browser gegenpruefen (Full-Re-render-Verhalten, s. technische Notiz im M4-Stand).

Technischer Hinweis:

M2 ist bewusst als statische HTML/CSS/Vanilla-JS-Oberflaeche gebaut. Fuer M2 bleibt das richtig, weil die Oberflaeche Anzeige und Review macht, nicht Pflege, Persistenz oder Import. Ein Framework-Wechsel sollte erst vor M4/M5 oder M9 entschieden werden, wenn komplexere App-Zustaende, wiederverwendbare Komponenten oder gefuehrte Bearbeitung tatsaechlich noetig werden.

Letzte Verifikation:

```bash
node --check app/main.js
node --check app/review-data.js
node --check app/i18n.js
npm test
npm run validate:m1
```

Codex-Browser-Einschraenkung:

Die letzte gerenderte Browser-Pruefung der finalen Farb-/Pagination-Aenderung konnte in Codex nicht frisch abgeschlossen werden, weil `file://` blockiert wurde und lokale Ports aus der Sandbox nicht erreichbar waren. Die vorherige Browser-QA fuer Navigation, Browser-Zurueck, Breadcrumbs, Transfer-Link und Detailansicht war erfolgreich. Darum in der naechsten Session einmal lokal im normalen Browser ansehen.

Wenn bei der Schema-Erstellung Begriffe auftauchen, die in `CONTEXT.md` nicht stehen, **Begriff klaeren bevor er ins Schema kommt** — nicht raten.

## Harte Arbeitsregeln

- Keine Excel-V1-Pipeline reaktivieren.
- Keine grosse Alles-auf-einmal-Implementierung.
- Jede neue Funktion muss einem Meilenstein aus `docs/runde2/Meilensteine_Runde2.md` zugeordnet sein.
- Agenten schreiben strukturierte Daten nur gegen Schemas.
- Unsicherheit wird als Vorschlag, Check oder offener Status sichtbar gemacht.
- Pro Session am Ende kurz dokumentieren: geaenderte Dateien, Checks, offene Risiken.

## Alte Informationen uebernehmen

Bei Bedarf aus dem Archiv uebernehmen, aber nicht ungeprueft kopieren:

- Kategorien und Statuswerte aus `archiv/runde1-excel-2026-05-26/Finanzmodell_Datenmodell.md`.
- Agentengrenzen aus `archiv/runde1-excel-2026-05-26/Finanzmodell_Agentenworkflow.md`.
- Entscheidungsgruende aus `archiv/runde1-excel-2026-05-26/Finanzmodell_Entscheidungsprotokoll.md`.
- Fehleranalyse aus `docs/architektur/Retrospektive_Runde1_Excel.md`.

Der aktuelle fachliche Abgleich steht in `docs/runde2/Traceability_Runde1_zu_Runde2.md`.

## Definition von "fertig" fuer M1

M1 ist fertig, wenn ein Validierungslauf mit einem guten Datensatz erfolgreich ist und mit einem absichtlich fehlerhaften Datensatz fehlschlaegt. Die Evidenz liefern `npm test` und `npm run validate:m1`.

## Definition von "fertig" fuer M1.5

M1.5 ist fertig, wenn echte Personen, Konten und Kategorien in `data/master/` stehen, der Nutzer sie geprueft hat, offene Punkte dokumentiert sind und die M1-Validierung weiterhin erfolgreich laeuft.

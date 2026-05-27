# Handoff Runde 2

Stand: 27.05.2026

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

## Naechster sinnvoller Schritt

Naechste Session:

1. `docs/runde2/M2_Review_Oberflaeche.md` lesen.
2. `app/index.html` lokal im normalen Browser oeffnen.
3. M2 visuell reviewen: Uebersicht, Transaktionen mit Pagination, Stammdaten, Checks, Export, Light/Dark und DE/EN.
4. Kleine UI-Feinheiten direkt notieren oder umsetzen.
5. Danach entscheiden, ob M2 abgeschlossen bleibt oder ob M3 geplant wird.

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

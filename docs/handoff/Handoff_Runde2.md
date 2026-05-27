# Handoff Runde 2

Stand: 26.05.2026

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
- Aktive Zielordner:
  - `app/`
  - `data/inbox/`
  - `data/master/`
  - `data/exports/`
  - `schemas/`
- `Belege/` bleibt als aktive Nutzdatenablage erhalten.

## Naechster sinnvoller Schritt

Mit Meilenstein M1 beginnen:

1. JSON-Schemas fuer Personen, Konten, Kategorien und Transaktionen erstellen.
2. Einen kleinen Masterdaten-Startstand in `data/master/` anlegen.
3. Eine deterministische Validierung bauen, die Pflichtfelder und Referenzen prueft.
4. Erst danach eine UI oder Importlogik bauen.

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

M1 ist erst fertig, wenn ein Validierungslauf mit einem guten Datensatz erfolgreich ist und mit einem absichtlich fehlerhaften Datensatz fehlschlaegt. Ohne diese Evidenz wird nicht mit UI oder Importautomatik begonnen.

# Finanzmodell Runde 2

Dieses Projekt startet nach der Excel-Retrospektive neu als agentenfreundliches, lokales Finanzmodell.

## Leitentscheidung

- Excel ist nicht mehr Masterformat.
- Masterdaten liegen in einfachen, validierbaren Dateien.
- Die lokale Oberflaeche ist eine statische HTML/JavaScript-App.
- Markdown dokumentiert Anforderungen, Architektur, Entscheidungen und Handover.
- Excel kann spaeter als Export entstehen, aber nicht als fuehrende Quelle.

## Aktuelle Struktur

```text
app/                 Lokale HTML/JS-App, spaeter ohne Webserver nutzbar
data/inbox/          Neue Importdateien und Rohinputs
data/master/         Fuehrende strukturierte Masterdaten
data/exports/        Erzeugte Reports, Excel-/CSV-/PDF-Exporte
schemas/             JSON-Schemas und Validierungsregeln
docs/runde2/         Anforderungen, Datenmodell und Meilensteine
docs/architektur/    Architekturreviews und Retrospektiven
docs/handoff/        Einstiegspunkt fuer neue Sessions
archiv/              Alter Excel-V1-Stand und Zwischenartefakte
Belege/              Bestehende Nutzerbelege, weiterhin aktive Nutzdaten
```

## Einstieg fuer neue Arbeit

1. `docs/handoff/Handoff_Runde2.md` lesen.
2. `docs/runde2/Anforderungen_Runde2.md` und `docs/runde2/Datenmodell_Runde2.md` lesen.
3. Nur den naechsten fachlichen Meilenstein umsetzen.
4. Vor jedem neuen Ausbau die Exit-Kriterien in `docs/runde2/Meilensteine_Runde2.md` pruefen.
5. Fuer UI-Arbeit zusaetzlich `docs/runde2/UI_Guideline_Runde2.md` (Stilrichtlinie), `docs/runde2/UI_Umsetzungsplan_Runde2.md` (Phasenplan) und `docs/runde2/UI_Handoff_Komponenten_Runde2.md` (Komponenten-Spec mit Massen, Tokens, States, bekannten Bugs) lesen.

## Checks

```bash
npm test
npm run validate:m1
```

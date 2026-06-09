# Finanzmodell Runde 2

Dieses Projekt startet nach der Excel-Retrospektive neu als agentenfreundliches Finanzmodell mit deploybarer Web-App.

## Leitentscheidung

- Excel ist nicht mehr Masterformat.
- Masterdaten liegen in einfachen, validierbaren Dateien.
- Die Oberflaeche ist eine geschuetzte Web-App, die aus `app/` ausgeliefert wird.
- Produktive App-Daten, Schemas, Belege, Tools und Agenten-Skills liegen im App-Raum.
- Markdown dokumentiert Anforderungen, Architektur, Entscheidungen und Handover.
- Excel kann spaeter als Export entstehen, aber nicht als fuehrende Quelle.

## Aktuelle Struktur

```text
app/                 Deploybare Web-App mit Datenraum, Schemas, Tools, Belegen und Skills
app/data/inbox/      Neue Importdateien und Rohinputs
app/data/master/     Fuehrende strukturierte Masterdaten
app/data/exports/    Erzeugte Reports, Excel-/CSV-/PDF-Exporte
app/schemas/         JSON-Schemas und Validierungsregeln
app/tools/           Deterministische Betriebs- und Validierungstools
app/docs/skills/     Agenten-Skills fuer App-Betrieb und Datenpflege
docs/runde2/         Anforderungen, Datenmodell, Meilensteine und UI-Dokumente
docs/architektur/    Architekturreviews und Retrospektiven
archiv/              Alter Excel-V1-Stand und Zwischenartefakte
```

## Einstieg fuer neue Arbeit

1. `CONTEXT.md` und `app/README.md` lesen.
2. `docs/runde2/Anforderungen_Runde2.md` und `docs/runde2/Datenmodell_Runde2.md` lesen.
3. Bei Architekturfragen die aktuellen ADRs lesen, insbesondere ADR 0012 und ADR 0015.
4. Nur den naechsten fachlichen Meilenstein umsetzen.
5. Vor jedem neuen Ausbau die Exit-Kriterien in `docs/runde2/Meilensteine_Runde2.md` pruefen.
6. Fuer UI-Arbeit zusaetzlich `docs/runde2/UI_Guideline_Runde2.md` (Stilrichtlinie), `docs/runde2/UI_Umsetzungsplan_Runde2.md` (Phasenplan) und `docs/runde2/UI_Handoff_Komponenten_Runde2.md` (Komponenten-Spec mit Massen, Tokens, States, bekannten Bugs) lesen.

## Checks

```bash
npm test
npm run validate:fixtures
```

`npm run validate:master` prueft den lokalen privaten Masterdatenstand unter `app/data/master/`. Diese produktiven Daten werden bewusst nicht versioniert.

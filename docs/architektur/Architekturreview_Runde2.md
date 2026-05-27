# Architekturreview Runde 2

Stand: 26.05.2026

## Entscheidung

Runde 2 sollte nicht auf der Excel-V1-Pipeline aufsetzen. Die neue Architektur ist:

- Strukturierte Dateien als Masterdaten.
- Lokale statische HTML/JavaScript-App als Oberflaeche.
- Markdown fuer Dokumentation, Handover, Entscheidungen und fachliche Erklaerungen.
- Optionaler Excel-Export nur als abgeleitetes Artefakt.

## Begruendung

Der erwartete Nutzungsmodus ist agentengetrieben. Der Nutzer wird voraussichtlich fast alles durch KI-Agenten erledigen lassen und nur bei Rueckfragen oder Sonderfaellen manuell eingreifen. Damit sind maschinenlesbare, validierbare und diffbare Daten wichtiger als manuelle Tabellenkomfortfunktionen.

Excel war in Runde 1 fuer manuelle Sichtbarkeit attraktiv, aber als Masterformat zu fragil:

- Zellbereiche und Tabellenobjekte sind schwer sicher zu mutieren.
- Layout und Datenlogik vermischen sich.
- Excel-Kompatibilitaet ist nicht durch Bibliotheksimports garantiert.
- Zwischenartefakte bekommen leicht unklare Fuehrungsrollen.
- Tests koennen gruen sein, obwohl die Nutzerdatei nicht akzeptabel ist.

## Empfohlene Architektur

```text
Agent
  liest Inputs
  erzeugt Import-/Aenderungsvorschlaege
  validiert gegen Schemas
  schreibt nur strukturierte Daten

Data Layer
  data/master/*.json, *.jsonl, *.csv
  schemas/*.schema.json
  auditierbare Vorschlaege und Agentenlaeufe

UI Layer
  app/index.html
  app/main.js
  app/styles.css
  importiert/exportiert lokale Dateien
  zeigt Dashboard, Checks, Reviewlisten

Export Layer
  erzeugt Excel/CSV/PDF nur aus validierten Daten
```

## Wichtigste Architekturregeln

1. Eine Quelle der Wahrheit:
   - Pro Zeitpunkt gibt es genau einen fuehrenden Masterdatenstand.

2. Keine stillen Fachentscheidungen:
   - Agenten duerfen vorschlagen, klassifizieren und pruefen, aber unsichere Entscheidungen bleiben sichtbar.

3. Kleine vertikale Schnitte:
   - Jeder Meilenstein muss ein nutzbares Ergebnis liefern.

4. Validierung vor Darstellung:
   - UI und Exporte zeigen Validierungsstatus prominent.

5. Export ist Einbahnstrasse:
   - Excel wird aus Daten erzeugt, aber nicht zurueck als Master eingelesen, solange kein expliziter Importvertrag existiert.

## Token-Schutzregeln

- Kein neuer Grossplan ohne konkreten naechsten Meilenstein.
- Keine Implementierung mehrerer Subsysteme in einem Schritt.
- Keine langen Agentenketten fuer Aufgaben, die durch kleine Schemas und deterministische Tests abgedeckt werden koennen.
- Jede Session beginnt mit `docs/handoff/Handoff_Runde2.md`.
- Jede Umsetzung endet mit einem kurzen Status: geaenderte Dateien, ausgefuehrte Checks, offene Risiken.

## Technologieempfehlung

Fuer den ersten lauffaehigen Schnitt:

- Vanilla HTML/CSS/JS.
- JSON Schema oder einfache eigene Validatoren.
- `jsonl` fuer grosse Transaktionslisten.
- Optional spaeter: SQLite, wenn Abfragen und Datenmenge stark wachsen.

SQLite ist fachlich attraktiv, aber fuer den ersten Schritt nicht zwingend. Ein dateibasierter Start ist transparenter und leichter durch Agenten zu bearbeiten.


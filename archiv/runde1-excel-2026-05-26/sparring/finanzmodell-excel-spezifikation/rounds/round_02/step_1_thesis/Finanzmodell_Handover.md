# Finanzmodell - Handover

Stand: 20.05.2026

## Zweck

Dieses Handover ist der Einstiegspunkt fuer die naechste Session. Es nennt die verbindlichen Dokumente, die aktuelle Richtung und die naechsten konkreten Arbeitsschritte.

## Verbindliche Dokumente

1. `00_Leitentscheidung_V1.md`  
   Beschreibt die Produktgrenze von Version 1: kleiner entscheidungsrelevanter Kern statt vollstaendiger Architektur.

2. `Finanzmodell_Entscheidungsprotokoll.md`  
   Enthaelt die aktiven Entscheidungen und Begruendungen.

3. `Finanzmodell_Datenmodell.md`  
   Enthaelt Blattstruktur, Tabellen, Felder, Statuswerte, Schluessel, Checks und Modellwirkungen.

4. `Finanzmodell_Agentenworkflow.md`  
   Enthaelt Agentenrollen, Methodiken, Output-Vertraege und Compliance-Grenzen.

5. `Finanzmodell_Excel_Bau_und_QA_Plan.md`  
   Enthaelt die TDD-Reihenfolge und Build-Gates fuer die erste Excel-Mappe.

## Aktueller Stand

- Version 1 ist auf einen engeren Nutzwertkern begrenzt: Startimport, Cashflow, Liquiditaet, Reichweite, Status und naechste Aktion.
- Der erste echte Nutzen ist nicht die vollstaendige Mappe, sondern eine ehrliche Entscheidungssicht nach dem Girokonto-Startimport.
- `workbookSpec.mjs` bleibt ein Strukturvertrag fuer den V1-Mindestkern und dupliziert nicht die gesamte Markdown-Spezifikation.
- Excel bleibt Nutzeroberflaeche und fachliche Auditspur.
- Build-, Fixture-, Inspector- und Subagenten-Details bleiben im Ordner `workbook-build/`.
- Agentenworkflow bleibt wichtig, aber in Excel werden nur entscheidungsrelevante Vorschlaege, Warnungen, Quellen und Laufhinweise sichtbar.

## Naechster Umsetzungsschritt

Die naechste Session startet mit dem technischen Bau des V1-Mindestkerns:

1. `workbook-build/` anlegen.
2. `README.md` mit Ziel, Tooling-Check und Run-Befehlen schreiben.
3. `package.json` mit `test`, `build`, `verify` vorbereiten.
4. Verfuegbarkeit von `@oai/artifact-tool` pruefen; falls nicht verfuegbar, `exceljs` als lokalen Inspector-Pfad dokumentieren.
5. `workbookSpec.test.mjs` schreiben und rot sehen.
6. `workbookSpec.mjs` fuer die `muss`-Tabellen des V1-Mindestkerns implementieren.
7. Seed-Daten in `seedData.mjs` auslagern.
8. Danach erst CSV-Parser-Tests beginnen.

## Wichtigster Fokus

Nicht mit "baue die ganze Excel-Datei" starten. Der erste Build muss beweisen:

- alle V1-Kernblaetter und -tabellen sind strukturell vorhanden.
- Spaltenrollen, Validierungen und Kommentare sind fuer `muss`-Tabellen definiert.
- Startdaten fuer Personen, Kategorien, Szenarien, Annahmen und Checks existieren.
- die Startmappe kann bewusst Gelb oder Rot sein.
- keine fachlichen Luecken werden durch Code geraten.
- Agenten- und Build-QA bleibt ausserhalb der Nutzeroberflaeche, solange daraus kein Nutzerbefund entsteht.

## Manuelle Voraussetzung fuer CSV-Tests

Die vorhandene Girokonto-CSV wird als neutrale Fixture gebraucht:

```bash
cp [Originaldatei] workbook-build/tests/fixtures/csv/girokonto_test.csv
```

Wenn die Fixture noch fehlt, darf Task 1 trotzdem starten. Task 2 bekommt dann einen klaren roten oder geskippten Zustand mit Hinweis auf die fehlende Datei.

## Blocker und Nicht-Blocker

Blocker vor Task 1:

- kein schreibbarer `workbook-build/`-Pfad.
- keine Node-Testlaufzeit.

Kein Blocker vor Task 1:

- fehlende Girokonto-Fixture.
- nicht verfuegbares `@oai/artifact-tool`, solange `exceljs` als lokaler Strukturpruefer dokumentiert wird.
- offene Immobilien-, Renten- oder Versicherungsdetails.
- noch nicht fertige Agenten-Compliance, solange keine verbotenen Statusaenderungen in die produktive Mappe gelangen.

## Erfolg der naechsten Session

Erfolg ist erreicht, wenn:

- `workbook-build/README.md` und `package.json` stehen.
- `workbookSpec.test.mjs` existiert.
- `workbookSpec.mjs` den V1-Mindestkern strukturell beschreibt.
- Seed-Daten fuer den Startkatalog auslagerbar sind.
- der naechste Schritt klar der isolierte CSV-Parser ist.

Eine exportierte `.xlsx` ist noch kein Ziel der naechsten Session.

## Arbeitsregeln

- `.DS_Store` ignorieren.
- keine neuen fachlichen Strukturen ohne Entscheidung erfinden.
- neue Entscheidungen im Entscheidungsprotokoll dokumentieren.
- neue Tabellen oder Felder im Datenmodell dokumentieren.
- Agentenworkflow-Aenderungen in `Finanzmodell_Agentenworkflow.md` dokumentieren.
- Handover nur auf ausdrueckliche Anfrage aktualisieren.

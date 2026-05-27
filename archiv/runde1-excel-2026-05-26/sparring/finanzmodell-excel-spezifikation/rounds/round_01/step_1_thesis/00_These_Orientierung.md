# These Runde 1 - Orientierung fuer den Excel-Bau

Stand: 20.05.2026

Diese These-Fassung erhaelt die fuenf vorhandenen Spezifikationsdateien als Arbeitsbasis und schaerft sie an den Stellen, die vor dem eigentlichen Workbook-Bau besonders entscheidend sind: verbindliche Entscheidungen, maschinelles Datenmodell, Nutzerfuehrung, Agentengrenzen und TDD-Reihenfolge.

## Kernentscheidung dieser These

Die Excel-Mappe wird nicht als manuell gestaltete Tabelle gebaut, sondern als reproduzierbares Produkt aus:

1. `workbookSpec.mjs` als maschinellem Vertrag fuer Blaetter, Tabellen, Spalten, Validierungen, Seed-Daten, Formeln, Styles und Kennzahlenbereiche.
2. `csvStartimportParser.mjs` als eng begrenztem Parser fuer den vorhandenen Girokonto-Export.
3. `buildWorkbook.mjs` als Generator fuer das `.xlsx`-Artefakt.
4. `artifactVerifier.mjs` plus `WorkbookInspector`-Implementierungen als unabhaengige Pruefschicht.
5. `agentComplianceHarness.mjs` als Test fuer Agentengrenzen, Idempotenz und verbotene Statusaenderungen.

Die Markdown-Dateien bleiben die fachliche Quelle. Der Code darf daraus aber keine stillen Interpretationen ableiten: Was in `workbookSpec.mjs` nicht explizit abgebildet ist, gilt fuer Version 1 als nicht gebaut.

## Schaerfungen in dieser Fassung

- `Finanzmodell_Datenmodell.md`: Ergaenzt einen Bauvertrag fuer `workbookSpec.mjs`, eine Muss/Soll/Kann-Priorisierung und konkrete Usability-Regeln fuer Tabellen, Kennzahlenbereiche, Validierungen und Kommentare.
- `Finanzmodell_Excel_Bau_und_QA_Plan.md`: Ergaenzt Task 0, harte Build-Gates, eine klarere TDD-Reihenfolge und Akzeptanzkriterien pro Entwicklungsstufe.
- `Finanzmodell_Entscheidungsprotokoll.md`: Ergaenzt neue Entscheidungen 98 bis 105, damit die These nicht nur Empfehlung bleibt, sondern als nachvollziehbare Designentscheidung anschlussfaehig ist.
- `Finanzmodell_Agentenworkflow.md`: Ergaenzt konkrete Output-Vertraege fuer Import-, Analyse-, Recherche- und Umsetzungs-Agenten.
- `Finanzmodell_Handover.md`: Schaerft den naechsten Arbeitsstart auf eine kleine, pruefbare Sequenz statt eines grossen offenen Bauauftrags.

## Nicht veraendert

- Die Blattstruktur Version 1 bleibt bestehen.
- Die Grundrollen Import-Agent, Pruef-/Analyse-Agent, Recherche-Agent und Umsetzungs-Agent bleiben bestehen.
- `99_Checks` bleibt die Live-Pruefung in der Produktivmappe.
- Die erste Excel-Datei wird erst nach bestandenem QA-Lauf exportiert.

## Antithese-Risiko

Die staerkste Annahme dieser These ist: Eine sehr vollstaendige Spezifikation laesst sich durch einen maschinellen Bauvertrag beherrschbar machen, ohne den ersten Excel-Bau zu ueberfrachten. Die Antithese sollte besonders hart pruefen, ob Version 1 trotz der vielen Tabellen noch schnell genug Nutzwert liefert.

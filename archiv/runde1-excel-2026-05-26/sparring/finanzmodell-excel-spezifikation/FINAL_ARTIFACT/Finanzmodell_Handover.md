# Finanzmodell - Handover

Stand: 20.05.2026

## Zweck

Dieses Handover ist der Einstiegspunkt fuer die naechste Umsetzungssession. Es nennt die verbindlichen Dokumente, die aktuelle Richtung und die ersten konkreten Arbeitsschritte.

## Verbindliche Dokumente

1. `00_Leitentscheidung_V1.md`  
   Beschreibt die Produktgrenze von Version 1: kleiner entscheidungsrelevanter Kern mit erstem Struktur- und Beobachtbarkeits-Gate und minimaler Kontrollspur statt vollstaendiger Architektur.

2. `Finanzmodell_Entscheidungsprotokoll.md`  
   Enthaelt die aktiven Entscheidungen und Begruendungen, einschliesslich Task-1-Schnitt, konkretisiertem Thin-Slice-Gate, Check-/Quellen-Rueckbindung und Wegfall der separaten Startreihenfolge-Datei.

3. `Finanzmodell_Datenmodell.md`  
   Enthaelt Blattstruktur, Tabellen, Felder, Statuswerte, Schluessel, Checks, Kontrollspur, Modellwirkungen sowie `sheetOrder`, `tableBuildOrder` und die Task-1-Seed-Kette.

4. `Finanzmodell_Agentenworkflow.md`  
   Enthaelt Agentenrollen, Methodiken, Output-Vertraege, Laufanker und Compliance-Grenzen.

5. `Finanzmodell_Excel_Bau_und_QA_Plan.md`  
   Enthaelt TDD-Reihenfolge, konkretes Thin-Slice-Gate und Build-Gates fuer die erste Excel-Mappe.

## Aktueller Stand

- Version 1 ist auf einen engeren Nutzwertkern begrenzt: Startimport, Cashflow, Liquiditaet, Reichweite, Status, Kontrollstatus und naechste Aktion.
- Der erste echte Nutzen ist nicht die vollstaendige Mappe, sondern eine ehrliche Entscheidungssicht nach dem Girokonto-Startimport.
- Task 1 startet mit einem Struktur-, Referenz-, Kontrollstatus- und Sichtbarkeits-Gate und endet mit einem strukturellen Vertrag fuer alle Muss-Tabellen.
- Task 1 behauptet noch keinen Nutzwert fuer Cashflow, Liquiditaet oder Reichweite; er beweist nur, dass die spaeteren Felder, IDs, Checks und Statusreferenzen sichtbar verbunden werden koennen und dass fehlende Belastbarkeit nicht unsichtbar wird.
- Der Thin-Slice-Test ist jetzt konkret: Er prueft eine Startkette aus Person und Haushalt, Kategorie `KAT013`, Girokonto, aktivem Szenario, Annahme, Quelle, Importlauf, Rohumsatz, Modellumsatz, rueckgebundenem Check, Dashboardstatus und Kontrollstatus.
- `workbookSpec.mjs` bleibt ein Strukturvertrag fuer den V1-Mindestkern und dupliziert nicht die gesamte Markdown-Spezifikation.
- Task 1 darf Dashboard-Zielstellen und Kontrollstatus vorbereiten, aber keine Liquiditaets-, Cashflow- oder Reichweitenwerte anzeigen und keine echte Liquiditaets-, Cashflow- oder Runway-Formellogik implementieren.
- Der rote oder gelbe Startstatus darf nicht nur statisch gesetzt sein; er muss auf vorhandene Checks und deren betroffene Quelle, Annahme, Import- oder Kontrollspurzeile rueckverweisen.
- Check-Referenzen in `seedData.checks` bleiben konkret und knapp: Quelle, Annahme, Importlauf oder Kontrollspur, keine generische Referenzarchitektur. Mehrere konkrete Referenzen sind nur erlaubt, wenn ein Befund sie wirklich braucht.
- `workbookSpec` braucht keine Pflichtfelder wie `task1Scope` oder `formulaImplementationTask`; die Grenze zu Task 3 wird ueber getrennte Tests, fehlende Finanzwerte im Task-1-Dashboard und Modulgrenzen abgesichert.
- Die erste Formellogik beginnt in Task 3 mit `formulas.mjs` und `formulas.test.mjs`.
- Die sichtbare Blattreihenfolge und die dependency-orientierte Build-Reihenfolge sind getrennt.
- `sheetOrder` und `tableBuildOrder` stehen im Datenmodell; die Task-1-Akzeptanz steht im Bau- und QA-Plan.
- Excel bleibt Nutzeroberflaeche und fachliche Auditspur.
- Build-, Fixture-, Inspector- und Subagenten-Details bleiben im Ordner `workbook-build/`.
- Excel verankert diese externen Nachweise minimal ueber `98_Kontrollspur` mit `98_Build_Verifikation`, `98_Agentenlaeufe` und `98_Artefakt_Referenzen`.
- Die alten Agentenplattform-Blaetter `70` bis `74` bleiben gestrichen.

## Naechster Umsetzungsschritt

Die naechste Session startet mit dem technischen Bau des V1-Mindestkerns:

1. `workbook-build/` anlegen.
2. `README.md` mit Ziel, Tooling-Check, Kontrollspur-Grenze und Run-Befehlen schreiben.
3. `package.json` mit `test`, `build`, `verify` vorbereiten.
4. Verfuegbarkeit von `@oai/artifact-tool` pruefen; falls nicht verfuegbar, `exceljs` als lokalen Inspector-Pfad dokumentieren.
5. `workbookSpec.test.mjs` schreiben und rot sehen.
6. Thin-Slice-Test formulieren: konkrete Minimal-Seeds erzeugen Dashboard- und Kontrollstatus Rot oder Gelb, nicht Gruen.
7. Im Test explizit pruefen, dass der Slice strukturell bleibt: keine `formulas.mjs`-Importe, keine Task-Metafelder im `workbookSpec`, keine Nutzwertbehauptung, keine Liquiditaets-, Cashflow- oder Reichweitenwerte im Task-1-Dashboard.
8. Im Test pruefen, dass `seedData.checks` konkrete Referenzfelder nutzt und keine aufgeblahte generische Check-Referenzstruktur einfuehrt.
9. `workbookSpec.mjs` mit `sheetOrder` und `tableBuildOrder` gemaess `Finanzmodell_Datenmodell.md` implementieren.
10. alle Muss-Tabellen strukturell mit Spaltenrollen, Validierungen, Kommentaren, Update-Modi und Startstatus definieren.
11. `98_Kontrollspur` nur als ein Blatt mit drei Tabellen definieren: `98_Build_Verifikation`, `98_Agentenlaeufe`, `98_Artefakt_Referenzen`.
12. Seed-Daten in `seedData.mjs` auslagern.
13. Danach erst CSV-Parser-Tests beginnen.

## Wichtigster Fokus

Nicht mit "baue die ganze Excel-Datei" starten. Der erste Build muss beweisen:

- ein minimaler Durchstich kann Dashboard- und Kontrollstatus Rot oder Gelb erzeugen.
- die Seed-Kette ist nicht abstrakt, sondern ueber IDs und Statuswerte nachvollziehbar.
- Rot oder Gelb ist an mindestens einen vorhandenen Check und dessen Quelle, Annahme, Import- oder Kontrollspurbezug gebunden.
- Task 1 verkauft diesen Zustand nicht als Finanznutzwert, sondern als Struktur-, Referenz-, Kontrollstatus- und Sichtbarkeitsnachweis.
- Liquiditaets-, Cashflow- und Reichweitenfelder sind in Task 1 nur Zielstellen, keine Ergebniswerte.
- Check-Referenzen sind konkret genug fuer den Startbefund, aber nicht als neue Facharchitektur aufgeblahte Struktur.
- alle V1-Kernblaetter und -tabellen sind strukturell vorhanden.
- `sheetOrder` und `tableBuildOrder` sind explizit und getestet.
- Spaltenrollen, Validierungen und Kommentare sind fuer `muss`-Tabellen definiert.
- Startdaten fuer Personen, Kategorien, Konten, Szenarien, Annahmen, Quellen, Import, Umsatzmodell, Kontrollstatus und Checks existieren.
- die Startmappe kann bewusst Gelb oder Rot sein.
- keine fachlichen Luecken werden durch Code geraten.
- keine Task-3-Formeln und keine beruhigenden Task-Metafelder werden in Task 1 versteckt.
- Agenten- und Build-QA bleibt ausserhalb der Nutzeroberflaeche, aber Build-Verifikation, Laufanker und Artefaktreferenzen sind im Master sichtbar verankert.

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
- noch nicht fertige vollstaendige Agentenplattform, solange verbotene Statusaenderungen verhindert und Laufanker im Master vorgesehen werden.

## Erfolg der naechsten Session

Erfolg ist erreicht, wenn:

- `workbook-build/README.md` und `package.json` stehen.
- `workbookSpec.test.mjs` existiert und den roten Start belegt.
- ein Thin-Slice-Test Rot/Gelb statt Gruen fuer offene Startdaten erzwingt.
- der Thin-Slice-Test die konkrete Referenzkette statt nur Seed-Listen prueft.
- der Thin-Slice-Test den Dashboard- und Kontrollstatus an Check- und Quellen-/Kontrollspurbezug bindet.
- der Thin-Slice-Test keinen fachlichen Nutzwert und keine Ergebniswerte vor Task 3 behauptet.
- die Check-Referenzfelder in `seedData.checks` konkret und knapp bleiben.
- `workbookSpec.mjs` den V1-Mindestkern strukturell beschreibt.
- `sheetOrder` und `tableBuildOrder` gemaess Datenmodell getestet sind.
- `98_Kontrollspur` mit Build-Verifikation, Agentenlaeufen und Artefaktreferenzen im Strukturvertrag enthalten ist.
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

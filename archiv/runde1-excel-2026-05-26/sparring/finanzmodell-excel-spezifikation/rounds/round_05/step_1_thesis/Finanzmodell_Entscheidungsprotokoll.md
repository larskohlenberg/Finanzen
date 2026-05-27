# Finanzmodell - Entscheidungsprotokoll

Stand: 20.05.2026

Dieses Protokoll haelt die aktiven Entscheidungen fuer das Excel-Finanzmodell fest. Es dient der Fortsetzung spaeterer Sessions und der Begruendung zentraler Modellgrenzen. Neue Entscheidungen werden als neue Zeile ergaenzt; fruehere Entscheidungen werden nicht still ueberschrieben.

## Zielbild

Es entsteht eine Excel-Mappe als zentrales Familien-Finanzmodell. Die Mappe fuehrt Vermoegen, Cashflow, Quellen, Zukunftsereignisse und Arbeitsende-/Ruhestandsfragen zusammen. Version 1 konzentriert sich auf einen kleinen Nutzwertkern: Startimport, Cashflow, Liquiditaet, Reichweite, offene Unsicherheiten, naechste Aktion und minimale Nachvollziehbarkeit des Builds und der Agentenlaeufe.

## Aktive Grundentscheidungen

| Nr. | Frage | Entscheidung | Begruendung |
|---:|---|---|---|
| 1 | Soll Excel das Haupttool sein? | Ja, Excel bleibt Mastermodell. | Der Nutzer kennt Excel, es ist flexibel, nachvollziehbar und ueber OneDrive gut verfuegbar. |
| 2 | Was leistet Version 1? | Ein entscheidungsfaehiger Kern aus Girokonto-Startimport, Cashflow, Liquiditaet, Reichweite, Modellstatus, Kontrollstatus und Nacharbeitsliste. | Frueher Nutzwert entsteht nicht durch vollstaendige Architektur, sondern durch eine ehrliche erste Finanzsicht. |
| 3 | Welche Frage beantwortet das Dashboard zuerst? | Wie liquide ist die Familie, wie tragfaehig ist der laufende Cashflow, wie weit reicht die Liquiditaet, was ist noch offen, und ist die Mappe zuletzt pruefbar gebaut worden? | Diese Fragen verbinden heutige Daten mit Arbeitsende-/Ruhestandsplanung und belastbarer Nutzung. |
| 4 | Darf die Startmappe mit Platzhaltern rechnen? | Ja, aber sichtbar Gelb oder Rot. | Unsicherheit darf nicht durch Tabellenoptik versteckt werden. |
| 5 | Wie wird der Girokonto-Import behandelt? | Importiert, normalisiert und dedupliziert; keine finalen Fachentscheidungen. | Der Import soll Daten liefern, nicht Kategorien, Personen oder Transfers heimlich festlegen. |
| 6 | Wie detailliert werden Kategorien in V1? | Grobkategorien plus `Sonstiges / zu pruefen`. | Der Start bleibt schnell, spaetere Verfeinerung bleibt moeglich. |
| 7 | Wie werden interne Transfers behandelt? | Als Kandidaten, nicht automatisch als bestaetigte Neutralisierung. | Falsche automatische Neutralisierung waere gefaehrlich. |
| 8 | Wie werden Regelzahlungen erkannt? | Muster werden als Vorschlaege erfasst, nicht direkt aktiviert. | Wiederkehrende Zahlungen brauchen Nutzerentscheidung oder eindeutige Umsetzung. |
| 9 | Wie werden Quellen gefuehrt? | Schlank in `90_Quellen`, mit Beleg- und Wert-Zeilen nur fuer relevante Nachweise. | Nachvollziehbarkeit ohne Belegbuerokratie. |
| 10 | Wie werden Annahmen gefuehrt? | Sichtbar, statusbehaftet, zeitlich gueltig und versioniert. | Annahmen wirken stark auf Reichweite und muessen auditierbar bleiben. |
| 11 | Wie werden Immobilien in V1 behandelt? | Sichtbarer Platzhalter und Vermoegenskontext; nicht automatisch liquide. | Immobilien sind wertvoll, aber nicht kurzfristig verfuegbar. |
| 12 | Wie werden Renten, Versicherungen und Ereignisse behandelt? | Strukturell vorbereitet; wirksam nur mit sichtbarem Status und Quelle. | V1 darf keine Scheingenauigkeit erzeugen. |
| 13 | Wie wird der Modellstatus bestimmt? | Aus `99_Checks`: Gruen, Gelb oder Rot. | Belastbarkeit muss aus pruefbaren offenen Punkten folgen. |
| 14 | Wie werden Warnungen gefuehrt? | Aktuelle Warnungen plus manueller Bearbeitungsstatus ueber stabilen Fingerprint. | Bearbeitung soll Refreshs ueberstehen. |
| 15 | Wie werden Agentenrollen getrennt? | Import, Analyse, Recherche und Umsetzung bleiben getrennte Rollen. | Agenten duerfen keine fachlichen Entscheidungen verstecken. |
| 16 | Was darf der Import-Agent? | Quellen, Importlaeufe, Rohumsaetze, initiale Modellumsaetze, Vorschlaege/Warnungen und Laufanker schreiben. | Er uebernimmt Daten, entscheidet aber keine Regeln final. |
| 17 | Was darf der Analyse-Agent? | Vorschlaege, Warnungen und Laufanker erzeugen. | Mustererkennung bleibt entscheidungspflichtig. |
| 18 | Was darf der Recherche-Agent? | Quellen, historisierte Annahmen, Vorschlaege und Laufanker erzeugen. | Externe Werte brauchen Quelle, Standdatum und Abrufdatum. |
| 19 | Was darf der Umsetzungs-Agent? | Nur angenommene und eindeutige Vorschlaege umsetzen. | Bei Unklarheit darf er keine Zieltabellen aendern. |
| 20 | Welche Statuswerte gelten? | Einheitliche kleingeschriebene Statuswerte gemaess Datenmodell. | Validierungen, Formeln und Checks brauchen stabile Schreibweisen. |
| 21 | Wie wird `Person_ID` beim Import gesetzt? | Standard ist leer; `HH` nur durch bestaetigte Transferregel mit `auto_person_id: HH`. | Der Parser entscheidet keine Haushaltszuordnung. |
| 22 | Wie wird die SUG-ID zwischen `12` und `73` behandelt? | `12_Regelzahlung_Vorschlaege` erzeugt die ID; `73_Agent_Vorschlaege` kopiert sie. | Ein Muster und sein Agentenvorschlag bilden eine 1:1-Beziehung. |
| 23 | Wie wird Quellen-Deduplikation behandelt? | `Dateihash` ist SHA256 des gesamten Dateiinhalts. | Geaenderte Dateien sind neue Quellen; identische Dateien koennen aktualisiert werden. |
| 24 | Wie setzt sich `Liquiditaet_heute` zusammen? | Girokonto-Salden + Tagesgeld-Salden + liquidierbarer Depot-Cashwert; Immobilien ausgeschlossen. | Liquiditaet muss kurzfristig verfuegbar sein. |
| 25 | Wie wird der Monats-Cashflow prognostiziert? | Ist-Cashflow plus offene Regelzahlungen plus variable 75/25-Schaetzung. | Der Nutzer sieht nicht nur gebuchte Umsaetze, sondern den erwarteten Monatsabschluss. |
| 26 | Wie wird Reichweite berechnet? | Monatliche Vorwaertsrechnung; Reichweite ist der erste Monat mit kumulierter Liquiditaet <= 0. | Die Arbeitsende-Frage braucht eine greifbare Zeitmarke. |
| 27 | Welche Schwellen gelten fuer Runway-Checks? | Warnung unter 12 Monaten, Fehler unter 6 Monaten, Sofortfehler bei negativem laufenden Monat und `Liquiditaet_heute <= 0`. | Die Schwellen sind vorlaeufig, aber entscheidungsrelevant. |

## Synthese-Entscheidungen fuer den ersten Build

| Nr. | Frage | Entscheidung | Begruendung |
|---:|---|---|---|
| 28 | Was ist die maschinelle Quelle der Wahrheit? | `workbookSpec.mjs` ist nur der Strukturvertrag fuer den V1-Kern; fachliche Quelle bleiben die Markdown-Dateien. | So bleibt der Build reproduzierbar, ohne die komplette Spezifikation als zweite Code-Spezifikation zu verdoppeln. |
| 29 | Welche Tabellen muessen zuerst gebaut werden? | Zuerst die Tabellen, die Startimport, Cashflow, Liquiditaet, Reichweite, Checks, Warnungen, Kontrollspur und naechste Aktion tragen. | Der erste Nutzwert entsteht aus einer Entscheidungssicht mit Nachweisanker. |
| 30 | Wie tief werden Platzhalterbereiche gebaut? | Als sichtbare Struktur mit Statusbereich; Formeltiefe nur, wenn sie fuer den V1-Kern gebraucht wird. | Immobilien, Rente und Versicherungen bleiben sichtbar, ueberfrachten aber nicht den ersten Build. |
| 31 | Wann darf `.xlsx` exportiert werden? | Erst nach Minimal-Verifier: Pflichtblaetter, Pflichtspalten, Key-Ranges ohne Formel-Fehler, erwarteter Modellstatus und Kontrollstatus. | Eine nutzbar aussehende, aber ungepruefte Datei waere riskant. |
| 32 | Wie wird Usability im Builder verbindlich? | Spaltenrollen, Kommentare, Validierungen, Statusfarben und Kontrollspurfelder gehoeren in `workbookSpec.mjs`; lange Erklaerungen bleiben in Markdown. | Nutzerfuehrung muss reproduzierbar sein. |
| 33 | Wie wird mit nicht verfuegbarem `@oai/artifact-tool` umgegangen? | `exceljs` prueft lokal Struktur und Datei; `@oai/artifact-tool` bleibt als Inspector-Pfad vorgesehen. | Der Build darf nicht an einer einzelnen Laufzeit scheitern. |
| 34 | Was ist der erste echte Nutzwert? | Nach Startimport: Liquiditaet, Cashflow, Reichweite, offene Kategorien/Transfers/Quellen/Annahmen, Kontrollstatus und naechste Aktion. | Diese Sicht hilft dem Nutzer sofort. |
| 35 | Wann wird Agenten-QA ausgebaut? | Nach dem nutzerorientierten V1-Kern; zuerst Compliance fuer verbotene Statusaenderungen, Idempotenz und Laufanker. | Agentenpruefung soll nicht den ersten Familien-Nutzwert dominieren. |
| 36 | Welche Agentenartefakte gehoeren in Excel? | Entscheidungspflichtige Vorschlaege, Warnungen, Quellen, Laufanker und Compliance-Status. | Excel muss zeigen, was der Nutzer entscheiden muss und warum ein Lauf vertrauenswuerdig oder problematisch ist. |
| 37 | Welche Agentenartefakte bleiben ausserhalb von Excel? | Fixtures, Inspector-Snapshots, Subagenten-Rohantworten, Compliance-Testdaten, Testmappen und vollstaendige Laufprotokolle bleiben in `workbook-build/`. | Diese Artefakte sichern Qualitaet, sind aber keine Finanzentscheidungssicht. |
| 38 | Wird V1 weiter verengt? | Ja: Der Startbuild priorisiert Dashboard, Import, Modellumsaetze, Cashflow, Liquiditaet, Annahmen, Quellen, Warnungen, Vorschlaege und Kontrollspur. | Ein kleiner beweisbarer Kern ist besser als eine breite halbfertige Mappe. |
| 39 | Gibt es eigene V1-Agentenplattform-Blaetter? | Nein. Die alten `70` bis `74`-Blaetter entfallen fuer V1. | Vollstaendige Agentensteuerung wuerde den ersten Nutzwert ueberfrachten. |
| 40 | Wo wird die minimale Kontrollspur gefuehrt? | In `98_Kontrollspur` mit `98_Build_Verifikation`, `98_Agentenlaeufe` und `98_Artefakt_Referenzen`. | Der Master braucht einen stabilen Nachweisanker, ohne externe Logs zu duplizieren. |
| 41 | Was macht einen Agentenlauf im Master nachvollziehbar? | `Lauf_ID`, Rolle, Ausloeser, Methodik, erlaubte Zielbereiche, Ergebnis, Compliance-Status und Artefaktbezug. | Der Nutzer muss nicht den Rohlauf lesen, aber sehen koennen, ob ein Lauf regelkonform war. |
| 42 | Was macht einen Build im Master nachvollziehbar? | `Build_ID`, Spec-Version, Workbook-Hash, Verifier-Status, Inspector-Pfad, Testzahlen, offene Befunde und Artefaktbezug. | Eine weitergegebene Mappe darf ihre Pruefbarkeit nicht nur ausserhalb behaupten. |
| 43 | Wann darf der Kontrollstatus Gruen sein? | Nur wenn letzte Verifikation bestanden ist und keine Kontrollspur-Fehler offen sind. | Finanzielle Aussagen brauchen einen sichtbaren Mindestnachweis der technischen Belastbarkeit. |

## Runde-3-Entscheidungen fuer Build-Reihenfolge und Task-1-Schnitt

| Nr. | Frage | Entscheidung | Begruendung |
|---:|---|---|---|
| 44 | Gibt es getrennte Reihenfolgen? | Ja. `sheetOrder` bleibt nutzerorientiert, `tableBuildOrder` wird dependency-orientiert. | Das Dashboard soll sichtbar vorne stehen, aber technisch zuletzt aus stabilen Quellen gebaut werden. |
| 45 | Womit startet `tableBuildOrder`? | Mit `01_Personen`, `02_Kategorien`, `03_Konten`, `40_Szenarien`, `42_Annahmen`, `90_Quellen`. | Diese Tabellen liefern die Referenzen fuer Import, Modellumsaetze, Cashflow und Checks. |
| 46 | Wo steht `98_Kontrollspur` in der Spec? | Nach Berechnungs- und Platzhaltertabellen, aber vor `99_Checks` und `00_Dashboard`. | Checks brauchen Kontrollspurfelder; Dashboard braucht die daraus resultierenden Status. |
| 47 | Ist `98_Kontrollspur` ein Plattformblatt? | Nein. Es bleibt ein knappes Nachweisblatt mit drei Tabellen. | Build- und Agentendetails bleiben ausserhalb der Nutzeroberflaeche. |
| 48 | Duerfen alte Agentenplattform-Blaetter fuer Compliance zurueckkommen? | Nein. Compliance wird in `workbook-build/tests/` geprueft und im Master nur verdichtet verankert. | Sonst wuerde V1 wieder zur Plattform statt zur Familien-Finanzsicht. |
| 49 | Baut Task 1 alle Muss-Tabellen oder zuerst einen Nutzwert-Slice? | Task 1 beginnt mit einem Struktur-, Referenz- und Sichtbarkeits-Gate und endet mit dem strukturellen Vertrag fuer alle Muss-Tabellen. | Der Slice verhindert blinde Tabellenabschrift; der Vertrag verhindert, dass spaetere Tasks auf unfertiger Struktur bauen. Der echte Nutzwert aus berechneter Liquiditaet, Cashflow und Reichweite beginnt erst mit Task 3. |
| 50 | Was beweist das erste Gate? | Minimaldaten, Quelle, Importlauf, Roh-/Modellumsaetze, ein als Seed markierter Startwert fuer Cashflow oder Liquiditaet, ein rueckgebundener Check, Dashboardstatus Rot/Gelb und Kontrollstatus. | Der erste rote oder gelbe Dashboardbefund zeigt, dass Unsicherheit sichtbar und referenzierbar ist; er beweist noch keine fachliche Ergebnisrechnung. |
| 51 | Bleibt eine eigene Startreihenfolge-Datei bestehen? | Nein. `sheetOrder` und `tableBuildOrder` stehen im Datenmodell; die Task-1-Akzeptanz steht im Bau- und QA-Plan. | So bleibt der Vertrag pruefbar, ohne dieselbe Entscheidung in mehreren Markdown-Dateien synchron halten zu muessen. |
| 52 | Wie klein bleibt `98_Kontrollspur`? | Drei Tabellen bleiben erlaubt, aber nur als Nachweisanker; keine Rohlogs, keine Testdaten, kein Archivindex im Master. | Dashboard-Gruen braucht technische Pruefbarkeit, aber Excel darf nicht zum Build- und Agentenarchiv werden. |

## Runde-4-Entscheidungen fuer den Thin-Slice-Test

| Nr. | Frage | Entscheidung | Begruendung |
|---:|---|---|---|
| 53 | Wie konkret muss der Thin-Slice-Test sein? | Er muss eine referenzierbare Startkette aus Person/Haushalt, Kategorie `KAT013`, Girokonto, Szenario, Annahme, Quelle, Importlauf, Rohumsatz, Modellumsatz, Check und Dashboardstatus pruefen. | Sonst wird der Test zu einem abstrakten Seed-Katalog ohne Struktur- oder Sichtbarkeitsnachweis. |
| 54 | Darf Task 1 Liquiditaet und Cashflow schon fachlich berechnen? | Nein. Task 1 darf Startwerte und Zielspalten strukturell zeigen; die erste echte Berechnung gehoert in Task 3. | So bleibt `workbookSpec` Strukturvertrag und wird nicht zur versteckten Formelschicht. |
| 55 | Wie beweist Task 1 Rot oder Gelb? | Ueber Seed-Daten, Kontrollstatus `nicht_ausgefuehrt` oder `nicht_pruefbar`, mindestens einen relevanten Check, Rueckbindung dieses Checks an Quelle, Import, Annahme oder Kontrollspur und `startDashboard.Modellstatus != Gruen`. | Unsicherheit wird sichtbar, ohne Task-3-Formellogik vorwegzunehmen oder den Status nur statisch zu setzen. |
| 56 | Schuetzen `task1Scope` und `formulaImplementationTask` im `workbookSpec` vor Formelvorgriff? | Nein, diese Meta-Felder gehoeren nicht als Pflichtfelder in den Produktvertrag. | Die Grenze wird ueber negative Tests, fehlende `formulas.mjs`-Importe und als Seed markierte Dashboard-Startwerte abgesichert. |
| 57 | Darf Task 1 als erster Nutzwert beschrieben werden? | Nein. Task 1 ist nur Struktur-, Referenz- und Sichtbarkeits-Gate; echter Nutzwert beginnt mit Task 3 und spaeterem Workbook-Build. | Sonst wuerde ein roter oder gelber Seed-Startzustand bereits als Finanzsicht verkauft, obwohl noch keine Fachformeln laufen. |
| 58 | Wie konkret sind Check-Referenzen in `seedData.checks`? | Konkret, aber schlank: `Betroffene_Quelle_ID`, `Betroffene_Annahme_ID`, `Betroffener_Import_ID` oder `Betroffener_Kontrollspur_ID`, jeweils nur wenn fuer den Befund noetig. | Der Startstatus braucht einen pruefbaren Bezug, aber keine generische Referenzarchitektur und keine kuenstlich aufgefuellten Check-Zeilen. |

## Aktueller Designstand

Die naechste Umsetzung beginnt mit:

1. `workbook-build/` anlegen.
2. Tooling pruefen.
3. `workbookSpec.test.mjs` zuerst rot schreiben.
4. Thin-Slice-Test fuer Rot/Gelb-Dashboardstatus mit konkret benannten Minimal-Seeds, Check-Rueckbindung und Quellen-/Annahmen-/Import-/Kontrollspurbezug formulieren.
5. Sicherstellen, dass Task 1 strukturell bleibt, keine `formulas.mjs`-Logik importiert und keine Task-Metafelder als Produktvertrag braucht.
6. Sicherstellen, dass Task 1 keinen Nutzwert fuer Cashflow, Liquiditaet oder Reichweite behauptet und dass Check-Referenzfelder knapp bleiben.
7. `workbookSpec.mjs` mit `sheetOrder` und `tableBuildOrder` gemaess Datenmodell implementieren.
8. alle Muss-Tabellen strukturell mit Spaltenrollen, Kommentaren, Validierungen und Startstatus beschreiben.
9. Seed-Daten in `seedData.mjs` auslagern.
10. Danach erst CSV-Parser-Tests beginnen.

## Nicht-Ziele fuer die naechste Umsetzung

- kein kompletter Ausbau aller Immobilien-, Renten- und Versicherungsformeln.
- keine vollstaendige Agentenplattform.
- keine automatische finale Kategorisierung.
- keine automatische Bestaetigung von Transfers oder Regelzahlungen.
- keine Portfolio-XIRR oder Benchmarkanalyse.
- kein Steuer- oder Sozialrechtsmodell.
- keine eigenen Excel-Blaetter fuer Build-Fixtures, Inspector-Details oder Subagenten-Testprotokolle.
- keine Rohlogs in Excel.
- keine separate Startreihenfolge-Markdown-Datei.
- keine Task-3-Formellogik und keine beruhigenden Task-Metafelder in Task 1.

# Finanzmodell - Entscheidungsprotokoll

Stand: 20.05.2026

Dieses Protokoll haelt die aktiven Entscheidungen fuer das Excel-Finanzmodell fest. Es dient der Fortsetzung spaeterer Sessions und der Begruendung zentraler Modellgrenzen. Neue Entscheidungen werden als neue Zeile ergaenzt; fruehere Entscheidungen werden nicht still ueberschrieben.

## Zielbild

Es entsteht eine Excel-Mappe als zentrales Familien-Finanzmodell. Die Mappe fuehrt Vermoegen, Cashflow, Quellen, Zukunftsereignisse und Arbeitsende-/Ruhestandsfragen zusammen. Excel bleibt die sichtbare Steuerungs- und Auditoberflaeche, aber Version 1 konzentriert sich auf einen kleinen Nutzwertkern: Startimport, Cashflow, Liquiditaet, Reichweite, offene Unsicherheiten und naechste Aktion.

## Aktive Grundentscheidungen

| Nr. | Frage | Entscheidung | Begruendung |
|---:|---|---|---|
| 1 | Soll Excel das Haupttool sein? | Ja, Excel bleibt Mastermodell. | Der Nutzer kennt Excel, es ist flexibel, nachvollziehbar und ueber OneDrive gut verfuegbar. |
| 2 | Was leistet Version 1? | Ein entscheidungsfaehiger Kern aus Girokonto-Startimport, Cashflow, Liquiditaet, Reichweite, Modellstatus und Nacharbeitsliste. | Frueher Nutzwert entsteht nicht durch vollstaendige Architektur, sondern durch eine ehrliche erste Finanzsicht. |
| 3 | Welche Frage beantwortet das Dashboard zuerst? | Wie liquide ist die Familie, wie tragfaehig ist der laufende Cashflow, wie weit reicht die Liquiditaet, und was ist noch offen? | Diese Fragen verbinden heutige Daten mit Arbeitsende-/Ruhestandsplanung. |
| 4 | Darf die Startmappe mit Platzhaltern rechnen? | Ja, aber sichtbar Gelb oder Rot. | Unsicherheit darf nicht durch Tabellenoptik versteckt werden. |
| 5 | Wie wird der Girokonto-Import behandelt? | Importiert, normalisiert und dedupliziert; keine finalen Fachentscheidungen. | Der Import soll Daten liefern, nicht Kategorien, Personen oder Transfers heimlich festlegen. |
| 6 | Wie detailliert werden Kategorien in V1? | Grobkategorien plus `Sonstiges / zu pruefen`. | Der Start bleibt schnell, spaetere Verfeinerung bleibt moeglich. |
| 7 | Wie werden interne Transfers behandelt? | Als Kandidaten, nicht automatisch als bestaetigte Neutralisierung. | Transfers koennen Cashflow verfaelschen; falsche automatische Neutralisierung waere gefaehrlich. |
| 8 | Wie werden Regelzahlungen erkannt? | Muster werden als Vorschlaege erfasst, nicht direkt aktiviert. | Wiederkehrende Zahlungen brauchen Nutzerentscheidung oder eindeutige Umsetzung. |
| 9 | Wie werden Quellen gefuehrt? | Schlank in `90_Quellen`, mit Beleg- und Wert-Zeilen nur fuer relevante Nachweise. | Ein privates Finanzmodell braucht Nachvollziehbarkeit ohne uebermaessige Belegbuerokratie. |
| 10 | Wie werden Annahmen gefuehrt? | Sichtbar, statusbehaftet, zeitlich gueltig und versioniert. | Annahmen wirken stark auf Reichweite und muessen auditierbar bleiben. |
| 11 | Wie werden Immobilien in V1 behandelt? | Vermoegenswert separat, im Standardszenario nicht automatisch liquide. | Immobilien sind wertvoll, aber nicht automatisch verfuegbare Liquiditaet. |
| 12 | Wie werden Renten, Versicherungen und Ereignisse behandelt? | Strukturell vorbereitet; wirksam nur mit sichtbarem Status und Quelle. | Die Arbeitsende-Frage braucht diese Daten, aber V1 darf keine Scheingenauigkeit erzeugen. |
| 13 | Wie wird der Modellstatus bestimmt? | Aus `99_Checks`: Gruen, Gelb oder Rot. | Belastbarkeit muss aus pruefbaren offenen Punkten folgen. |
| 14 | Wie werden Warnungen gefuehrt? | Aktuelle Warnungen plus manueller Bearbeitungsstatus ueber stabilen Fingerprint. | Bearbeitung soll Refreshs ueberstehen, ohne Warnungen als starres Log zu verdoppeln. |
| 15 | Wie werden Agentenrollen getrennt? | Import, Analyse, Recherche und Umsetzung bleiben getrennte Rollen. | Agenten duerfen keine fachlichen Entscheidungen verstecken. |
| 16 | Was darf der Import-Agent? | Quellen, Importlaeufe, Rohumsaetze, initiale Modellumsaetze, Folgeauftraege und Laufprotokoll schreiben. | Er uebernimmt Daten, entscheidet aber keine neuen Regeln final. |
| 17 | Was darf der Analyse-Agent? | Vorschlaege, Warnungen, Folgeauftraege und Laufprotokoll erzeugen. | Mustererkennung bleibt entscheidungspflichtig. |
| 18 | Was darf der Recherche-Agent? | Quellen, historisierte Annahmen oder Vorschlaege erzeugen. | Externe Werte brauchen Quelle, Standdatum und Abrufdatum. |
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
| 29 | Welche Tabellen muessen zuerst gebaut werden? | Zuerst die Tabellen, die Startimport, Cashflow, Liquiditaet, Reichweite, Checks, Warnungen und naechste Aktion tragen. | Der erste Nutzwert entsteht aus einer Entscheidungssicht, nicht aus maximaler Blattabdeckung. |
| 30 | Wie tief werden `soll`-Tabellen gebaut? | Als Struktur oder Platzhalter mit Statusbereich; Formeltiefe nur, wenn sie fuer den V1-Kern gebraucht wird. | Immobilien, Rente und Versicherungen bleiben sichtbar, ueberfrachten aber nicht den ersten Build. |
| 31 | Wann darf `.xlsx` exportiert werden? | Erst nach Minimal-Verifier: Pflichtblaetter, Pflichtspalten, Key-Ranges ohne Formel-Fehler, erwarteter Modellstatus. | Eine nutzbar aussehende, aber ungepruefte Datei waere riskant. |
| 32 | Wie wird Usability im Builder verbindlich? | Spaltenrollen, Kommentare, Validierungen und Statusfarben gehoeren in `workbookSpec.mjs`; lange Erklaerungen bleiben in Markdown. | Nutzerfuehrung muss reproduzierbar sein, aber nicht jeden fachlichen Absatz duplizieren. |
| 33 | Wie wird mit nicht verfuegbarem `@oai/artifact-tool` umgegangen? | `exceljs` prueft lokal Struktur und Datei; `@oai/artifact-tool` bleibt als Inspector-Pfad vorgesehen. | Der Build darf nicht an einer einzelnen Laufzeit scheitern. |
| 34 | Was ist der erste echte Nutzwert? | Nach Startimport: Liquiditaet, Cashflow, Reichweite, offene Kategorien/Transfers/Quellen/Annahmen und naechste Aktion. | Diese Sicht hilft dem Nutzer sofort, auch wenn das Modell noch nicht vollstaendig ist. |
| 35 | Wann wird Agenten-QA ausgebaut? | Nach dem nutzerorientierten V1-Kern; zuerst nur Compliance fuer verbotene Statusaenderungen und Idempotenz. | Agentenpruefung bleibt wichtig, soll aber nicht den ersten Familien-Nutzwert dominieren. |

## Aktueller Designstand

Die Mappe enthaelt die im Datenmodell dokumentierte Blattstruktur. Fuer den naechsten Bau gilt:

- `workbook-build/` anlegen.
- Tooling pruefen.
- `workbookSpec.test.mjs` zuerst rot schreiben.
- `workbookSpec.mjs` fuer den V1-Kern implementieren.
- Girokonto-Parser isoliert testen.
- Dashboard-/Cashflow-/Liquiditaetslogik erst danach bauen.
- `.xlsx` erst nach bestandenem Minimal-Verifier exportieren.

## Nicht-Ziele fuer die naechste Umsetzung

- kein kompletter Ausbau aller Immobilien-, Renten- und Versicherungsformeln.
- keine vollstaendige Agentenplattform.
- keine automatische finale Kategorisierung.
- keine automatische Bestaetigung von Transfers oder Regelzahlungen.
- keine Portfolio-XIRR oder Benchmarkanalyse.
- kein Steuer- oder Sozialrechtsmodell.

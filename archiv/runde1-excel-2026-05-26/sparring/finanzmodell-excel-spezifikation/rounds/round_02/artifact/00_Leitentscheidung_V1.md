# Finanzmodell - Leitentscheidung Version 1

Stand: 20.05.2026

Version 1 der Excel-Mappe beantwortet zuerst eine kleine, aber echte Familienfrage:

> Wie viel Liquiditaet, laufender Cashflow und Reichweite sind heute sichtbar, wie belastbar ist diese Aussage, und welche wenigen Nacharbeiten verbessern sie am staerksten?

Die Mappe wird reproduzierbar gebaut und geprueft. Der Build- und QA-Ansatz ist aber kein zweites vollstaendiges Fachmodell neben den Markdown-Dateien. Er bildet nur den Kern ab, der fuer diese erste Entscheidungssicht gebraucht wird.

## V1-Kern

Der erste baubare Ausschnitt besteht aus:

1. Personen, Haushalt, Konten und Kategorien als Stammdaten.
2. Girokonto-Startimport mit Rohdaten, Importlauf und sicherer Deduplikation.
3. Aufbereitete Modellumsaetze mit offenen Kategorien, Transferkandidaten und Cashflow-Wirkung.
4. Regelzahlungen und Regelzahlungs-Vorschlaege als Bruecke von Ist-Daten zu Planung.
5. Cashflow heute, Liquiditaet heute, Sicherheitsreserve und Reichweite.
6. Dashboard mit Modellstatus, Top-Warnungen und naechster Aktion.
7. Quellen, Checks und Warnungen, soweit sie die Belastbarkeit dieser Sicht erklaeren.

Immobilien, Renten, Versicherungen, Ereignisse, Erwerbsstatus und Sozialleistungen bleiben in Version 1 sichtbar vorbereitet, werden aber nur so tief gebaut, wie sie fuer Liquiditaet, Reichweite und offene Nacharbeiten noetig sind. Sie duerfen das erste Nutzungsbild nicht blockieren.

## Produktgrenze

Excel ist die Nutzeroberflaeche und die sichtbare Auditspur. Nicht jede technische Pruefung muss als eigenes Bedienblatt auftreten.

- Nutzerblaetter zeigen Entscheidung, Eingabe, Status und naechste Aktion.
- Technische Tabellen bleiben sichtbar, solange sie fuer Aufbau und Pruefung noetig sind.
- Agentenlaufdaten werden nur dort in der Mappe gefuehrt, wo sie eine Nutzerentscheidung, einen Auftrag oder eine Nachvollziehbarkeitspflicht erzeugen.
- Build-Artefakte, Test-Fixtures und Inspector-Details bleiben ausserhalb der Mappe im Ordner `workbook-build/`.

Sichtbarkeit ist kein Selbstzweck. Eine Tabelle ist nur dann V1-pflichtig, wenn sie eine Entscheidung sichtbar besser macht oder eine relevante Unsicherheit ehrlich zeigt.

## Maschineller Vertrag

`workbookSpec.mjs` beschreibt fuer den Builder nur den baubaren Kern:

- Blatt- und Tabellenreihenfolge.
- Pflichtspalten fuer V1-Kerntabellen.
- Spaltenrollen, Validierungen und Startdaten.
- stabile ID-Prefixe und Update-Modi fuer Agenten- oder Importtabellen.
- kurze Spaltenkommentare fuer Bedienbarkeit.

Die Markdown-Dateien bleiben die fachliche Quelle. Wenn eine fachliche Regel in Markdown noch nicht entschieden ist, darf `workbookSpec.mjs` daraus keinen stillen Default erfinden. Der Builder baut dann eine offene Stelle mit Status, Check oder Hinweis.

## Erfolgskriterium fuer die erste Implementierung

Version 1 ist nicht erfolgreich, sobald eine `.xlsx` existiert. Sie ist erfolgreich, wenn ein Nutzer nach dem Startimport diese Fragen sehen kann:

- Wie hoch sind liquide Mittel, freier Cashflow und Sicherheitsreserve?
- Wie weit reicht die Liquiditaet im aktiven Standardszenario?
- Welche Daten sind belegt, geschaetzt, offen oder platzhalterhaft?
- Welche Buchungen, Quellen, Annahmen oder Vorschlaege verhindern eine belastbarere Aussage?
- Was ist die naechste sinnvollste Aktion?

Der Modellstatus darf zu Beginn Gelb oder Rot sein. Eine ehrliche unsichere Mappe ist wertvoller als eine gruene Scheingenauigkeit.

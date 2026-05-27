# Finanzmodell - Leitentscheidung Version 1

Stand: 20.05.2026

Version 1 beantwortet zuerst eine bewusst kleine Familienfrage:

> Wie viel liquide Mittel sind heute sichtbar, wie traegt der laufende Cashflow, wie weit reicht die Liquiditaet im Standardszenario, und welche wenige Nacharbeit verbessert diese Aussage am staerksten?

Alles andere bleibt nachrangig. Die erste Mappe ist kein vollstaendiges Finanzbetriebssystem, keine Agentenplattform und keine allgemeine Vermoegenssimulation. Sie ist eine ehrliche Entscheidungssicht nach einem Girokonto-Startimport.

## V1-Mindestkern

Der erste baubare Ausschnitt besteht aus genau dem, was diese Entscheidungssicht traegt:

1. Personen, Haushalt, Konten und Kategorien als Start-Stammdaten.
2. Girokonto-Startimport mit Importlauf, Rohdaten und sicherer Deduplikation.
3. Modellumsaetze mit offenen Kategorien, Transferkandidaten und sichtbarer Cashflow-Wirkung.
4. Erkennbare Regelzahlungs- und Transfermuster als Vorschlaege, nicht als finale Regeln.
5. Cashflow heute, Liquiditaet heute, Sicherheitsreserve und Reichweite im Standardszenario.
6. Dashboard mit Modellstatus, Top-Warnungen und naechster Aktion.
7. Quellen, Annahmen und Checks nur dort, wo sie die Belastbarkeit dieser Sicht erklaeren.

Immobilien, Darlehen, Versicherungen, Rente, Ereignisse, Erwerbsstatus und Sozialleistungen bleiben in Version 1 sichtbar vorbereitet, aber sie duerfen den ersten Nutzwert nicht blockieren. Sie wirken erst dann auf Dashboard oder Reichweite, wenn Status, Quelle und Modellwirkung ausreichend klar sind.

## Produktgrenze

Excel ist die Nutzeroberflaeche und die fachliche Auditspur. Sichtbar bleiben muss, was der Nutzer beurteilen, korrigieren oder entscheiden soll:

- Dashboard, Status und naechste Aktion.
- Import- und Umsatzdaten, soweit sie die Finanzsicht erklaeren.
- offene Kategorien, Transfers, Regelzahlungsvorschlaege und Quellenluecken.
- Annahmen, die Reichweite oder Liquiditaet beeinflussen.
- manuelle Bearbeitungsstaende fuer Warnungen und Vorschlaege.

Nicht jede technische Pruefung bekommt ein eigenes Bedienblatt. Build-Fixtures, Inspector-Details, Test-Snapshots, Subagenten-Rohantworten und Compliance-Testdaten bleiben ausserhalb der Mappe in `workbook-build/`. In Excel landet daraus nur ein fuer den Nutzer relevanter Befund: offene Aufgabe, Vorschlag, Warnung, Quelle oder Laufhinweis.

## Maschineller Vertrag

`workbookSpec.mjs` beschreibt nur den baubaren Strukturvertrag fuer den V1-Mindestkern:

- Blatt- und Tabellenreihenfolge.
- Pflichtspalten fuer V1-Kerntabellen.
- Spaltenrollen, Validierungen, Kommentare und Startdaten.
- stabile ID-Prefixe und Update-Modi fuer Import-, Vorschlags- und Bearbeitungstabellen.
- visuelle Rollen fuer Eingaben, Formeln, Quellen, Status und offene Punkte.

Die Markdown-Dateien bleiben die fachliche Quelle. Wenn eine fachliche Regel nicht entschieden ist, darf `workbookSpec.mjs` keinen stillen Default erfinden. Der Builder baut dann eine offene Stelle mit Status, Check oder Hinweis.

## Erfolgskriterium fuer die erste Implementierung

Version 1 ist erfolgreich, wenn ein Nutzer nach dem Startimport diese Fragen sehen kann:

- Wie hoch sind liquide Mittel und freie Liquiditaet nach Reserve?
- Wie sieht der laufende Cashflow fuer den aktuellen Monat aus?
- Wie weit reicht die Liquiditaet im aktiven Standardszenario?
- Welche Daten sind belegt, geschaetzt, offen oder platzhalterhaft?
- Welche Buchungen, Kategorien, Transfers, Quellen oder Annahmen verhindern eine belastbarere Aussage?
- Was ist die naechste sinnvollste Aktion?

Der Modellstatus darf zu Beginn Gelb oder Rot sein. Eine ehrliche unsichere Mappe ist wertvoller als eine gruene Scheingenauigkeit. Eine `.xlsx` ohne sichtbare Unsicherheit ist kein Erfolg.

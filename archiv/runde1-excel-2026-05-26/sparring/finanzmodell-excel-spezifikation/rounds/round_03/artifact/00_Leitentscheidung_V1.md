# Finanzmodell - Leitentscheidung Version 1

Stand: 20.05.2026

Version 1 beantwortet zuerst eine bewusst kleine Familienfrage:

> Wie viel liquide Mittel sind heute sichtbar, wie traegt der laufende Cashflow, wie weit reicht die Liquiditaet im Standardszenario, und welche wenige Nacharbeit verbessert diese Aussage am staerksten?

Die erste Mappe ist kein vollstaendiges Finanzbetriebssystem, keine Agentenplattform und keine allgemeine Vermoegenssimulation. Sie ist eine ehrliche Entscheidungssicht nach einem Girokonto-Startimport. Damit diese Entscheidungssicht belastbar bleibt, fuehrt sie zugleich eine minimale Kontrollspur: Der Excel-Master zeigt, mit welcher Spezifikation, welchem Build, welchen Agentenlaeufen und welchen externen Nachweisen die sichtbaren Aussagen verbunden sind.

## V1-Mindestkern

Der erste baubare Ausschnitt besteht aus genau dem, was diese Entscheidungssicht und ihre Nachvollziehbarkeit traegt:

1. Personen, Haushalt, Konten und Kategorien als Start-Stammdaten.
2. Girokonto-Startimport mit Importlauf, Rohdaten und sicherer Deduplikation.
3. Modellumsaetze mit offenen Kategorien, Transferkandidaten und sichtbarer Cashflow-Wirkung.
4. Erkennbare Regelzahlungs- und Transfermuster als Vorschlaege, nicht als finale Regeln.
5. Cashflow heute, Liquiditaet heute, Sicherheitsreserve und Reichweite im Standardszenario.
6. Dashboard mit Modellstatus, Top-Warnungen, naechster Aktion und Kontrollstatus.
7. Quellen, Annahmen und Checks dort, wo sie die Belastbarkeit dieser Sicht erklaeren.
8. Eine schlanke Kontrollspur fuer Build-Verifikation, Agentenlaeufe und externe Artefakt-Referenzen.

Immobilien, Darlehen, Versicherungen, Rente, Ereignisse, Erwerbsstatus und Sozialleistungen bleiben in Version 1 sichtbar vorbereitet, aber sie duerfen den ersten Nutzwert nicht blockieren. Sie wirken erst dann auf Dashboard oder Reichweite, wenn Status, Quelle und Modellwirkung ausreichend klar sind.

## Produktgrenze

Excel ist die Nutzeroberflaeche und die fachliche Auditspur. Sichtbar bleiben muss, was der Nutzer beurteilen, korrigieren oder entscheiden soll:

- Dashboard, Status, Kontrollstatus und naechste Aktion.
- Import- und Umsatzdaten, soweit sie die Finanzsicht erklaeren.
- offene Kategorien, Transfers, Regelzahlungsvorschlaege und Quellenluecken.
- Annahmen, die Reichweite oder Liquiditaet beeinflussen.
- manuelle Bearbeitungsstaende fuer Warnungen und Vorschlaege.
- minimale Nachweise, welcher Build, welcher Agentenlauf und welches externe Artefakt die Mappe zuletzt beruehrt oder geprueft hat.

Nicht jede technische Pruefung bekommt ein eigenes Bedienblatt. Build-Fixtures, Inspector-Details, Test-Snapshots, Subagenten-Rohantworten und Compliance-Testdaten bleiben ausserhalb der Mappe in `workbook-build/`. In Excel landet daraus nur ein stabiler, knapper Anker: Run-ID, Rolle, Methodik, erlaubter Schreibbereich, Ergebnis, Compliance-Status, Build-ID, Verifikationsstatus, Artefaktpfad oder Hash, offene Befunde und der Bezug auf Vorschlag, Warnung, Quelle oder Check.

Die frueher geplanten Agentenplattform-Blaetter werden nicht wieder eingefuehrt. Version 1 bekommt stattdessen genau ein Kontrollblatt `98_Kontrollspur`, das keine Rohlogs sammelt und keine Agentensteuerung anbietet. Es verankert nur, warum der Master dem ausgelagerten Build- und Agentenarchiv zugeordnet werden kann.

## Maschineller Vertrag

`workbookSpec.mjs` beschreibt nur den baubaren Strukturvertrag fuer den V1-Mindestkern:

- Blatt- und Tabellenreihenfolge.
- Pflichtspalten fuer V1-Kerntabellen.
- Spaltenrollen, Validierungen, Kommentare und Startdaten.
- stabile ID-Prefixe und Update-Modi fuer Import-, Vorschlags-, Bearbeitungs- und Kontrolltabellen.
- visuelle Rollen fuer Eingaben, Formeln, Quellen, Status, Checks und offene Punkte.

Die Markdown-Dateien bleiben die fachliche Quelle. Wenn eine fachliche Regel nicht entschieden ist, darf `workbookSpec.mjs` keinen stillen Default erfinden. Der Builder baut dann eine offene Stelle mit Status, Check, Warnung oder Hinweis.

Der maschinelle Vertrag endet nicht an der sichtbaren Finanzlogik. Er enthaelt auch die minimalen Kontrolltabellen, die der Master braucht, um nicht von `workbook-build/` zu driften: `98_Build_Verifikation`, `98_Agentenlaeufe` und `98_Artefakt_Referenzen`. Diese Tabellen sind Nachweisanker, keine zweite Build-Datenbank.

## Erfolgskriterium fuer die erste Implementierung

Version 1 ist erfolgreich, wenn ein Nutzer nach dem Startimport diese Fragen sehen kann:

- Wie hoch sind liquide Mittel und freie Liquiditaet nach Reserve?
- Wie sieht der laufende Cashflow fuer den aktuellen Monat aus?
- Wie weit reicht die Liquiditaet im aktiven Standardszenario?
- Welche Daten sind belegt, geschaetzt, offen oder platzhalterhaft?
- Welche Buchungen, Kategorien, Transfers, Quellen oder Annahmen verhindern eine belastbarere Aussage?
- Welche Build- oder Agentenpruefung ist zuletzt sichtbar verbunden, und gibt es offene Befunde?
- Was ist die naechste sinnvollste Aktion?

Der Modellstatus darf zu Beginn Gelb oder Rot sein. Eine ehrliche unsichere Mappe ist wertvoller als eine gruene Scheingenauigkeit. Eine `.xlsx` ohne sichtbare Unsicherheit oder ohne minimalen Nachweis ihrer letzten Verifikation ist kein Erfolg.

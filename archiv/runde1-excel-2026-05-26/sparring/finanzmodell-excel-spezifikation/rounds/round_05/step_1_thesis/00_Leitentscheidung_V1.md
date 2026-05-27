# Finanzmodell - Leitentscheidung Version 1

Stand: 20.05.2026

Version 1 beantwortet zuerst eine kleine, aber entscheidungsrelevante Familienfrage:

> Wie viel liquide Mittel sind heute sichtbar, wie traegt der laufende Cashflow, wie weit reicht die Liquiditaet im Standardszenario, und welche wenige Nacharbeit verbessert diese Aussage am staerksten?

Die erste Mappe ist kein vollstaendiges Finanzbetriebssystem, keine Agentenplattform und keine allgemeine Vermoegenssimulation. Sie ist eine ehrliche Entscheidungssicht nach einem Girokonto-Startimport. Excel bleibt der sichtbare Master; `workbook-build/` bleibt das technische Arbeits- und Archivverzeichnis.

## V1-Mindestkern

Der erste baubare Ausschnitt besteht aus genau dem, was diese Entscheidungssicht und ihre Nachvollziehbarkeit traegt:

1. Personen, Haushalt, Konten und Kategorien als Start-Stammdaten.
2. Girokonto-Startimport mit Importlauf, Rohdaten und sicherer Deduplikation.
3. Modellumsaetze mit offenen Kategorien, Transferkandidaten und sichtbarer Cashflow-Wirkung.
4. Regelzahlungs- und Transfermuster als Vorschlaege, nicht als finale Regeln.
5. Cashflow heute, Liquiditaet heute, Sicherheitsreserve und Reichweite im Standardszenario.
6. Dashboard mit Modellstatus, Kontrollstatus, Top-Warnungen und naechster Aktion.
7. Quellen, Annahmen und Checks dort, wo sie die Belastbarkeit dieser Sicht erklaeren.
8. Ein minimales Kontrollblatt `98_Kontrollspur` fuer den letzten Build, den letzten Agentenlauf und externe Artefakt-Referenzen.

Immobilien, Darlehen, Versicherungen, Rente, Ereignisse, Erwerbsstatus und Sozialleistungen bleiben sichtbar vorbereitet. Sie wirken erst dann auf Dashboard oder Reichweite, wenn Status, Quelle und Modellwirkung klar sind.

## Erstes Struktur-, Referenz- und Sichtbarkeits-Gate

Der erste technische Meilenstein ist kein vollstaendiges Ausprogrammieren aller V1-Formeln, kein abstrakter Seed-Katalog, kein erster Nutzwertnachweis und noch kein Beweis fuer die spaetere Finanzentscheidung. Er ist ein Struktur-, Referenz- und Sichtbarkeitsnachweis mit fest benannten Minimaldaten:

- ein Haushalt mit mindestens einer Person,
- eine Girokonto-Zeile mit belegtem Startsaldo,
- die Kategorie `Sonstiges / zu pruefen`,
- genau ein aktives Standardszenario,
- eine Sicherheitsreserve-Annahme,
- eine Quelle fuer den Startsaldo oder Import,
- ein Importlauf mit wenigen Rohumsaetzen,
- daraus getrennte Modellumsatzzeilen, mindestens eine davon mit offener Kategorie,
- ein sichtbarer Startwert fuer Liquiditaet oder Cashflow, klar als Seed-Startzustand gekennzeichnet,
- ein konkreter Check, der Rot oder Gelb begruendet und auf betroffene Quelle, Importlauf, Annahme oder Kontrollspur verweist,
- ein Kontrollstatus `nicht_ausgefuehrt` oder `nicht_pruefbar`.

Dieses Gate beweist nur, dass die Struktur die spaetere Familienfrage nicht blockiert: IDs, Quellen, Import, Rohumsatz, Modellumsatz, Checks und Dashboardstatus sind referenzierbar verbunden, und Unsicherheit bleibt sichtbar. Es beweist noch nicht, dass Cashflow, Liquiditaet oder Reichweite fachlich richtig berechnet werden, und es darf dem Nutzer noch keinen finanziellen Nutzwert zuschreiben.

Eine rote oder gelbe Mappe ist in diesem Gate ausdruecklich richtig, wenn der Status nicht nur gesetzt, sondern auf mindestens einen vorhandenen Check und die betroffene Quelle oder Kontrollspur rueckverweist. Gruen ist in Task 1 nicht akzeptiert, weil noch keine bestandene Verifikation und keine vollstaendige Formellogik vorliegen.

## Grenze zwischen Strukturvertrag und Formellogik

`workbookSpec.mjs` ist in Task 1 der maschinelle Strukturvertrag. Er darf festlegen:

- sichtbare Blattreihenfolge,
- dependency-orientierte Tabellen-Build-Reihenfolge,
- Tabellen, Primaerschluessel, Pflichtspalten und Spaltenrollen,
- Validierungen, Kommentare, Statuswerte und Update-Modi,
- ID-Prefixe,
- Startdaten und Seed-Zeilen,
- minimale Dashboard-Startfelder, die einen roten oder gelben Seed-Startzustand mit Check- und Quellenbezug sichtbar machen,
- die Kontrollspur-Tabellen auf genau einem Blatt `98_Kontrollspur`.

`workbookSpec.mjs` darf in Task 1 nicht zur zweiten Fachspezifikation werden. Er darf keine nicht dokumentierten Tabellen, keine stillen Defaults, keine tiefe Berechnungslogik und keine beruhigenden Nutzwertbehauptungen einfuehren.

Die Grenze zu Task 3 wird nicht ueber Selbstauskunfts-Felder im Produktcode gezogen, sondern ueber Tests und Modulgrenzen: Task 1 importiert keine Formellogik, erzeugt keine berechneten Kennzahlen aus Umsatz-, Annahmen- und Szenariodaten und markiert Dashboardwerte als Seed-Startzustand. Die erste Formellogik beginnt erst dort, wo aus Umsatz-, Annahmen- und Szenariodaten berechnete Werte entstehen: `Liquiditaet_heute`, `Cashflow_Monat_ist`, `Cashflow_Monat_erwartet`, `Cashflow_Monat_gesamt`, Runway-Projektion und die dazugehoerigen Check-Ausloeser. Diese Logik gehoert in Task 3 nach `formulas.mjs` und `formulas.test.mjs`. Task 1 darf ihre spaeteren Zielspalten und Startwerte strukturell vorbereiten, aber nicht ihre fachliche Berechnung oder ihren Nutzwert vorwegnehmen.

## Produktgrenze

Excel zeigt nur, was der Nutzer beurteilen, korrigieren oder entscheiden soll:

- Dashboard, Modellstatus, Kontrollstatus und naechste Aktion.
- Import- und Umsatzdaten, soweit sie die Finanzsicht erklaeren.
- offene Kategorien, Transfers, Regelzahlungsvorschlaege und Quellenluecken.
- Annahmen, die Reichweite oder Liquiditaet beeinflussen.
- manuelle Bearbeitungsstaende fuer Warnungen und Vorschlaege.
- knappe Nachweise, welcher Build, welcher Agentenlauf und welches externe Artefakt die Mappe zuletzt beruehrt oder geprueft hat.

Nicht jede technische Pruefung bekommt ein eigenes Bedienblatt. Build-Fixtures, Inspector-Details, Test-Snapshots, Subagenten-Rohantworten, Compliance-Testdaten und vollstaendige Laufprotokolle bleiben ausserhalb der Mappe in `workbook-build/`. In Excel landet daraus nur ein stabiler Anker: `Build_ID`, `Lauf_ID`, `Artefakt_ID`, Status, Pfad oder Hash, Ergebnis und offene Befunde.

Die frueher geplanten Agentenplattform-Blaetter `70_Agentenworkflow`, `71_Agent_Auftraege`, `72_Agent_Pruefregeln` und `74_Agent_Laufprotokoll` werden nicht wieder eingefuehrt. Ihre produktrelevanten Ergebnisse erscheinen als Vorschlaege, Warnungen, Quellen, Checks oder knappe Laufanker.

## Maschineller Vertrag

`workbookSpec.mjs` ist der baubare Strukturvertrag fuer den V1-Mindestkern. Er enthaelt:

- sichtbare Blattreihenfolge,
- dependency-orientierte Tabellen-Build-Reihenfolge,
- Pflichtspalten, Spaltenrollen, Validierungen, Kommentare und Startdaten,
- stabile ID-Prefixe und Update-Modi,
- visuelle Rollen fuer Eingaben, Formeln, Quellen, Status, Checks und offene Punkte,
- die minimalen Kontrollspur-Tabellen auf genau einem Blatt `98_Kontrollspur`.

Die fachliche Quelle fuer Tabellen, Reihenfolgen und Task-1-Akzeptanz liegt in `Finanzmodell_Datenmodell.md` und `Finanzmodell_Excel_Bau_und_QA_Plan.md`. Prozess-Metadaten wie "Task 1" oder "Formeln ab Task 3" gehoeren in Tests, Bauplan und Dokumentation, nicht als beruhigende Pflichtfelder in den Produktvertrag. Es gibt keine separate Startreihenfolge-Spezifikation mehr. Wenn eine Regel nicht entschieden ist, darf der Builder keinen stillen Default erfinden. Er baut dann eine offene Stelle mit Status, Check, Warnung oder Vorschlag.

## Erfolgskriterium fuer Version 1

Version 1 ist erfolgreich, wenn ein Nutzer nach dem Startimport diese Fragen sehen kann:

- Wie hoch sind liquide Mittel und freie Liquiditaet nach Reserve?
- Wie sieht der laufende Cashflow fuer den aktuellen Monat aus?
- Wie weit reicht die Liquiditaet im aktiven Standardszenario?
- Welche Daten sind belegt, geschaetzt, offen oder platzhalterhaft?
- Welche Buchungen, Kategorien, Transfers, Quellen oder Annahmen verhindern eine belastbarere Aussage?
- Welche Build- oder Agentenpruefung ist zuletzt sichtbar verbunden, und gibt es offene Befunde?
- Was ist die naechste sinnvollste Aktion?

Der Modellstatus darf zu Beginn Gelb oder Rot sein. Eine ehrliche unsichere Mappe ist wertvoller als eine gruene Scheingenauigkeit. Eine `.xlsx` ohne sichtbare Unsicherheit oder ohne minimalen Nachweis ihrer letzten Verifikation ist kein Erfolg.

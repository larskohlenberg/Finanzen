# Agent-first Import Design

Stand: 21.05.2026

## Ziel

Der Girokonto-Import soll nicht als starrer Bank-CSV-Parser gedacht werden. Der Import bleibt eine Agentenaufgabe: Ein Agent liest die konkrete Datei, versteht Format und Kontext, inspiziert die aktuelle Excel-Struktur und erzeugt daraus einen nachvollziehbaren Importvorschlag.

Gleichzeitig darf der Agent nicht frei und ungeregelt in die Excel schreiben. Das Schreibverhalten braucht einen kleinen, stabilen Vertrag, damit IDs, Pflichtspalten, Deduplikation, Statuswerte, Quellen und Checks reproduzierbar bleiben.

## Leitentscheidung

Die Importarchitektur wird als Hybrid umgesetzt:

- Agent = Import-Intelligenz.
- Writer/Verifier = Sicherheitsgurt.
- Excel = sichtbarer Master und fachliche Auditspur.

Der Agent muss die Struktur nicht fest einkompiliert kennen. Er liest sie vor jedem Import aus der Mappe. Der Writer akzeptiert aber nur einen strukturierten Importvorschlag und schreibt ausschliesslich gegen vorhandene Tabellen und Pflichtfelder.

## Ablauf

1. Der Agent inspiziert die aktuelle Mappe:
   - `10_Importlaeufe`
   - `10_Umsaetze_Roh`
   - `11_Umsaetze_Modell`
   - `90_Quellen`
   - `98_Kontrollspur`
   - `99_Checks`

2. Der Agent liest die Datei im Kontext:
   - Spaltennamen und Trennzeichen
   - Datumsformate
   - Betragsformat und Vorzeichenlogik
   - Gegenpartei, Verwendungszweck, Referenzen
   - Konto, Zeitraum, Export-Kontostand
   - offensichtliche Format- oder Datenprobleme

3. Der Agent erzeugt einen strukturierten Importvorschlag:
   - eine Quellenzeile fuer `90_Quellen`
   - eine Importlaufzeile fuer `10_Importlaeufe`
   - normalisierte Rohumsatzzeilen fuer `10_Umsaetze_Roh`
   - erste Modellumsatzzeilen fuer `11_Umsaetze_Modell`
   - offene Kategorien als `KAT013`
   - unsichere Transfers nur als Kandidaten
   - Checks und Warnungen fuer offene oder nicht pruefbare Punkte

4. Der Writer schreibt nur validierte Vorschlaege:
   - Append-only fuer Rohdaten und Quellen
   - deterministische IDs
   - Zeilenhash je Rohumsatz
   - keine stillen Ueberschreibungen
   - Pflichtspalten muessen vorhanden sein
   - Statuswerte muessen aus den erlaubten Vokabularen stammen

5. Der Verifier prueft nach dem Schreiben:
   - Importlauf existiert und referenziert Quelle und Konto
   - Rohumsatz-IDs und Hashes sind stabil
   - Modellumsaetze referenzieren Rohumsaetze
   - offene Kategorien erzeugen sichtbare Checks
   - Dashboard bleibt Rot oder Gelb, wenn Verifikation oder Daten offen sind
   - keine Formel- oder Referenzfehler

## Datenvertrag fuer den Importvorschlag

Der Agent gibt keinen freien Excel-Edit-Plan aus, sondern ein strukturiertes Objekt mit diesen Bereichen:

- `sourceRow`
- `importRun`
- `rawTransactions`
- `modelTransactions`
- `warnings`
- `checks`
- `questions`

`questions` enthaelt nur echte Klaerungspunkte, die der Agent nicht belastbar aus Datei und Workbook ableiten kann. Unsicherheit wird nicht geraten, sondern als Check, Warnung oder offene Kategorie sichtbar gemacht.

## Grenzen

Der Import-Agent darf:

- Dateiformate flexibel verstehen.
- Spalten semantisch zuordnen.
- offene Kategorien und Transferkandidaten markieren.
- Vorschlaege und Checks erzeugen.
- die aktuelle Workbook-Struktur auslesen und darauf reagieren.

Der Import-Agent darf nicht:

- Finanzkennzahlen berechnen.
- Liquiditaet, Cashflow oder Reichweite als Ergebniswert schreiben.
- Kategorien final entscheiden, wenn die Evidenz unsicher ist.
- Transferregeln final aktivieren.
- bestehende Rohdaten still ueberschreiben.
- neue Tabellen oder Spalten erfinden, ohne dass das Datenmodell aktualisiert wurde.

## Erste Umsetzungseinheit

Die naechste technische Einheit ist nicht `csvStartimportParser.mjs` als alleiniger Fachparser, sondern:

1. `agentImportProtocol.md`
   - beschreibt den Importvorschlag, erlaubte Felder, Statuswerte und Unsicherheitsregeln.

2. `importWriterVerifier.mjs`
   - nimmt einen strukturierten Vorschlag,
   - validiert ihn gegen die aktuelle Workbook-Struktur,
   - schreibt ihn in die V1-Tabellen,
   - fuehrt danach die Importchecks aus.

3. Eine erste Agenten-Promptvorlage
   - fordert den Agenten auf, die Mappe zu inspizieren,
   - die Datei zu lesen,
   - den strukturierten Vorschlag zu liefern,
   - und offene Fragen explizit zu benennen.

## Erfolgskriterium

Ein erster Import ist erfolgreich, wenn eine neue CSV durch den Agenten verstanden wird, der Writer daraus reproduzierbare Zeilen in Quelle, Importlauf, Rohumsatz, Modellumsatz, Checks und Warnungen erzeugt und die Mappe danach weiterhin ehrlich ihren Status zeigt.

Ein roter oder gelber Status ist richtig, solange Verifikation, Kategorien, Annahmen oder Quellen nicht belastbar sind.


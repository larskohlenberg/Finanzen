# Agent Import Protocol

Stand: 21.05.2026

Der Import-Agent liest eine Quelldatei und die aktuelle Workbook-Struktur. Er schreibt nicht frei in Excel. Er liefert genau einen JSON-kompatiblen Importvorschlag, den ein deterministischer Writer validiert und append-only in die V1-Tabellen uebernimmt.

## Erlaubte Zieltabellen

Der Writer akzeptiert nur diese Zieltabellen:

- `90_Quellen`
- `10_Importlaeufe`
- `10_Umsaetze_Roh`
- `11_Umsaetze_Modell`
- `60_Warnungen_Aktuell`
- `99_Checks`

Andere Tabellen duerfen im Importvorschlag nicht beschrieben werden.

## Top-Level-Struktur

Der Importvorschlag muss diese Felder enthalten:

```json
{
  "sourceRow": {},
  "importRun": {},
  "rawTransactions": [],
  "modelTransactions": [],
  "warnings": [],
  "checks": [],
  "questions": []
}
```

## Workbook-Kontext vor dem Import

Vor jedem Import wird die aktuelle Mappe mit `readImportWorkbookContext({ workbookPath })` inspiziert. Dieser Kontext ist die maschinenlesbare Grenze fuer den Agenten:

- erlaubte Zieltabellen,
- erlaubte Spalten je Zieltabellen,
- Primaerschluessel je Zieltabellen,
- bereits vorhandene IDs,
- verbotene Zielbereiche,
- Unsicherheitsregeln.

Der Agent soll diesen Kontext verwenden, bevor er die Quelldatei semantisch zuordnet. Wenn eine benoetigte Spalte im Kontext nicht existiert, darf der Agent sie nicht erfinden. Er muss stattdessen eine Frage, Warnung oder einen Check erzeugen.

## Schreibregeln

- `sourceRow` wird nach `90_Quellen` geschrieben.
- `importRun` wird nach `10_Importlaeufe` geschrieben.
- `rawTransactions` werden nach `10_Umsaetze_Roh` geschrieben.
- `modelTransactions` werden nach `11_Umsaetze_Modell` geschrieben.
- `warnings` werden nach `60_Warnungen_Aktuell` geschrieben.
- `checks` werden nach `99_Checks` geschrieben.

Alle Writes sind append-only. Bestehende Rohdaten, Quellen und Checks werden nicht still ueberschrieben.

## Unsicherheitsregeln

- Unsichere Kategorien werden als `KAT013` gesetzt.
- Unsichere Transfers bleiben Kandidaten und werden nicht final neutralisiert.
- Unsichere Regelzahlungen bleiben Vorschlaege oder Fragen und werden nicht aktiviert.
- Unklare Zuordnungen werden als `questions`, Warnungen oder Checks sichtbar.
- Der Importvorschlag darf keine Liquiditaets-, Cashflow- oder Reichweitenwerte schreiben.

## Verbotene Inhalte

Der Importvorschlag darf nicht enthalten:

- neue Workbook-Tabellen oder -Spalten,
- finale Finanzkennzahlen,
- aktivierte Transferregeln,
- aktivierte Regelzahlungen,
- stille Statusaenderungen an bestehenden Zeilen,
- freie Excel-Zelladressen als Ziel.

## Writer-Verhalten

Der Writer prueft vor dem Schreiben:

- alle Pflichtbereiche sind vorhanden,
- keine unbekannten Top-Level-Felder existieren,
- jede Zeile nutzt nur bekannte Spalten,
- erforderliche IDs sind gesetzt,
- `questions` ist ein Array,
- `KAT013` in Modellumsaetzen ist erlaubt und kein Fehler.

Nach dem Schreiben prueft der Verifier:

- Export ist erzeugt,
- Importlauf, Quelle, Rohumsaetze, Modellumsaetze, Warnungen und Checks sind auffindbar,
- keine Formel- oder Referenzfehler wurden erzeugt.

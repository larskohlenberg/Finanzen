# Finanzmodell - workbookSpec Startreihenfolge

Stand: 20.05.2026

Diese Datei legt fest, in welcher Reihenfolge `workbookSpec.mjs` fuer Version 1 aufgebaut wird. Sie trennt bewusst zwei Dinge:

- **Sichtbare Blattreihenfolge:** So soll der Nutzer die Mappe sehen.
- **Build- und Spec-Reihenfolge:** So soll der Builder die abhaengigen Tabellen definieren, testen und befuellen.

## Sichtbare Blattreihenfolge

Die Mappe bleibt fuer den Nutzer entscheidungsorientiert sortiert. Das Dashboard steht vorne, obwohl es technisch von spaeter definierten Tabellen abhaengt.

```js
export const sheetOrder = [
  "00_Dashboard",
  "01_Personen",
  "02_Kategorien",
  "03_Konten",
  "04_Immobilien",
  "05_Immobilien_Details",
  "06_Versicherungen",
  "07_Rente",
  "10_Umsaetze_Roh",
  "11_Umsaetze_Modell",
  "12_Regelzahlungen",
  "20_Vermoegen",
  "30_Cashflow",
  "40_Szenarien",
  "41_Ereignisse",
  "42_Annahmen",
  "43_Zeitachse",
  "44_Liquiditaet",
  "60_Warnungen",
  "73_Agent_Vorschlaege",
  "90_Quellen",
  "98_Kontrollspur",
  "99_Checks",
];
```

`10_Importlaeufe`, `11_Transferregeln`, `12_Regelzahlung_Vorschlaege`, `60_Warnungen_Aktuell`, `60_Warnungen_Bearbeitung`, `98_Build_Verifikation`, `98_Agentenlaeufe` und `98_Artefakt_Referenzen` sind Tabellen auf den genannten Blaettern, keine zusaetzlichen Bedienblaetter.

## Startreihenfolge in `workbookSpec.mjs`

`workbookSpec.mjs` wird nicht in Dashboard-Reihenfolge geschrieben. Es startet mit den Tabellen, die andere Tabellen referenzieren, und endet mit den Sichten, die daraus rechnen oder zusammenfassen.

```js
export const tableBuildOrder = [
  "01_Personen",
  "02_Kategorien",
  "03_Konten",
  "40_Szenarien",
  "42_Annahmen",
  "90_Quellen",

  "10_Importlaeufe",
  "10_Umsaetze_Roh",
  "11_Transferregeln",
  "11_Umsaetze_Modell",

  "12_Regelzahlungen",
  "12_Regelzahlung_Vorschlaege",
  "73_Agent_Vorschlaege",

  "60_Warnungen_Aktuell",
  "60_Warnungen_Bearbeitung",
  "60_Warnungen",

  "43_Zeitachse",
  "44_Liquiditaet",
  "30_Cashflow",
  "20_Vermoegen",

  "04_Immobilien",
  "05_Immobilien_Details",
  "06_Versicherungen",
  "07_Rente",
  "41_Ereignisse",

  "98_Build_Verifikation",
  "98_Agentenlaeufe",
  "98_Artefakt_Referenzen",
  "99_Checks",
  "00_Dashboard",
];
```

## Warum diese Reihenfolge

1. **Stammdaten zuerst:** Personen, Kategorien, Konten, Szenario, Annahmen und Quellen liefern die Schluessel fuer alle weiteren Tabellen.
2. **Import vor Modellierung:** Importlaeufe und Rohumsaetze entstehen vor Modellumsaetzen. Der Parser darf keine finalen Kategorien, Transfers, Regelzahlungen oder Personenentscheidungen setzen.
3. **Vorschlaege vor Umsetzung:** Regelzahlungs- und Agentenvorschlaege stehen vor Warnungen und Checks, weil sie Nacharbeit ausloesen.
4. **Berechnung vor Dashboard:** Zeitachse, Liquiditaet, Cashflow und Vermoegen liefern Kennzahlen; das Dashboard zeigt nur die verdichtete Entscheidungssicht.
5. **Platzhalter kontrolliert spaet:** Immobilien, Versicherungen, Rente und Ereignisse werden sichtbar angelegt, aber nicht als Build-Blocker vor den Cashflow-Kern gezogen.
6. **Kontrollspur minimal vor Checks:** `98_Kontrollspur` wird als Nachweisanker definiert; `99_Checks` prueft danach auch fehlende Verifikation, fehlerhafte Laeufe und fehlende Artefakte.
7. **Dashboard zuletzt im Spec:** Das Blatt steht sichtbar vorne, wird technisch aber erst nach seinen Quellen definiert.

## V1-Startpaket fuer Task 1

Task 1 implementiert nicht alle spaeteren Formeln. Der erste gruene Spec-Test braucht:

- `sheetOrder` exakt wie oben.
- `tableBuildOrder` exakt wie oben.
- `workbookSpec.tables` mit mindestens allen `muss`-Tabellen.
- fuer jede `muss`-Tabelle: `sheetName`, `tableName`, `primaryKey`, `columns`, `columnRoles`, `required`, `validations`, `seedRows`, `updateMode`, `idPrefix`, `comments`.
- `seedData.mjs` fuer Personen, Kategorien, Standardszenario, Startannahmen, Kontrollstatuswerte, Vorschlagsstatuswerte, Agentenrollen und Check-Definitionen.
- `98_Kontrollspur` nur mit den drei Tabellen `98_Build_Verifikation`, `98_Agentenlaeufe`, `98_Artefakt_Referenzen`.

Nicht in Task 1 gehoeren:

- Formellogik fuer Reichweite,
- Parserdetails fuer konkrete Girokonto-CSV,
- `.xlsx`-Export,
- Agentenplattform-Blaetter,
- vollstaendige Compliance-Snapshots im Excel-Master.

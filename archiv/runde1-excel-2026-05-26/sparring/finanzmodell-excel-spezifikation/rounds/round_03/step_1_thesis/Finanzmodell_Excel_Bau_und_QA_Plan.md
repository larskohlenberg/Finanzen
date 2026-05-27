# Finanzmodell Excel Bau- und QA-Plan

Stand: 20.05.2026

Dieser Plan beschreibt den technischen Bau der ersten Excel-Mappe und die Qualitaetssicherung. In diesem Schritt wird noch keine Excel-Mappe gebaut.

## Ziel

Aus den fachlichen Dokumenten entsteht eine reproduzierbar baubare und pruefbare Excel-Mappe Version 1. Der erste Build beweist den kleinsten entscheidungsrelevanten Kern:

- Girokonto-Startimport.
- Cashflow heute.
- Liquiditaet heute.
- Sicherheitsreserve und Reichweite.
- offene Kategorien, Transfers, Quellen, Annahmen und Vorschlaege.
- Dashboard mit Modellstatus, Kontrollstatus und naechster Aktion.
- minimale Verankerung von Build-Verifikation, Agentenlaeufen und externen Artefakten im Excel-Master.

Die Excel-Datei ist Build-Artefakt, Nutzeroberflaeche und fachliche Auditspur. Build-, Fixture-, Inspector- und Subagenten-Details bleiben in `workbook-build/`. Der Master speichert daraus nur knappe Nachweisanker.

## Grundsaetze

- Keine neue fachliche Struktur erfinden, solange die bestehenden Dokumente ausreichen.
- TDD gilt fuer den kleinen V1-Kern, nicht fuer die gesamte Zielarchitektur.
- `workbookSpec.mjs` ist Strukturvertrag, nicht zweite Spezifikation.
- Die sichtbare Blattreihenfolge und die `tableBuildOrder` sind getrennte Vertrage.
- `99_Checks` ist die Live-Pruefung in der Produktivmappe.
- `98_Kontrollspur` ist der minimale Auditanker fuer Build, Lauf und externe Artefakte.
- Externe Artefakt-Tests nutzen Testmappen und verschmutzen die Produktivmappe nicht.
- Agenten-Compliance wird ausserhalb der Nutzeroberflaeche getestet; Excel zeigt relevante Vorschlaege, Warnungen, Laufhinweise und Compliance-Status.
- Eine gelbe oder rote Startmappe ist akzeptiert, wenn sie Unsicherheit ehrlich zeigt.

## Architektur

Der Bau erfolgt ueber einen fokussierten Workbook-Generator:

1. `workbookSpec.mjs`: Strukturvertrag fuer Blaetter, Tabellen, Spalten, Rollen, Validierungen, Kommentare, Seed-Struktur und minimale Kontrollspur.
2. `seedData.mjs`: Startkataloge, Statuswerte, Check-Definitionen und Seed-Zeilen.
3. `csvStartimportParser.mjs`: Parser fuer den Girokonto-Export.
4. `formulas.mjs`: fachliche Formellogik fuer Cashflow, Liquiditaet, Reichweite und Checks.
5. `buildWorkbook.mjs`: Generator fuer das `.xlsx`-Artefakt.
6. `qaFixtures.mjs`: deterministische Testdaten ausserhalb der Produktivmappe.
7. `workbookInspector.mjs`: gemeinsames Inspector-Interface.
8. `artifactVerifier.mjs`: unabhaengige Pruefschicht mit Build-Zusammenfassung.
9. `agentComplianceHarness.mjs`: Tests fuer Rollen- und Statusgrenzen mit verdichteter Laufzusammenfassung fuer den Master.

## Verzeichnis- und Dateiplan

```text
workbook-build/
  README.md
  package.json
  src/
    workbookSpec.mjs
    seedData.mjs
    csvStartimportParser.mjs
    formulas.mjs
    buildWorkbook.mjs
    qaFixtures.mjs
    workbookInspector.mjs
    artifactToolInspector.mjs
    exceljsInspector.mjs
    artifactVerifier.mjs
    agentComplianceHarness.mjs
    buildManifest.mjs
    styles.mjs
  tests/
    workbookSpec.test.mjs
    csvStartimportParser.test.mjs
    formulas.test.mjs
    buildWorkbook.test.mjs
    qaFixtures.test.mjs
    artifactRegression.test.mjs
    agentCompliance.test.mjs
    fixtures/
      csv/
        girokonto_test.csv
      workbooks/
      subagent_snapshots/
  outputs/
    .gitkeep
```

## Task 0: Tooling-Check

Dateien:

- Create: `workbook-build/README.md`
- Create: `workbook-build/package.json`

Akzeptanz:

- `npm test` ist definiert.
- `npm run build` ist definiert.
- `npm run verify` ist definiert.
- README dokumentiert, ob `@oai/artifact-tool` oder `exceljs` primaer genutzt wird.
- README dokumentiert, dass `workbook-build/` Detailarchiv ist und Excel nur Kontrollanker fuehrt.

## Task 1: `workbookSpec` fuer den V1-Mindestkern

Dateien:

- Create: `workbook-build/src/workbookSpec.mjs`
- Create: `workbook-build/src/seedData.mjs`
- Create: `workbook-build/tests/workbookSpec.test.mjs`

Startreihenfolge: exakt nach `Finanzmodell_WorkbookSpec_Startreihenfolge.md`.

Failing Tests zuerst:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { workbookSpec } from "../src/workbookSpec.mjs";

test("V1 sheets are defined in documented visible order", () => {
  assert.deepEqual(workbookSpec.sheetOrder, [
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
  ]);
});

test("V1 tables are defined in dependency build order", () => {
  assert.deepEqual(workbookSpec.tableBuildOrder.slice(0, 6), [
    "01_Personen",
    "02_Kategorien",
    "03_Konten",
    "40_Szenarien",
    "42_Annahmen",
    "90_Quellen",
  ]);
  assert.deepEqual(workbookSpec.tableBuildOrder.slice(-5), [
    "98_Build_Verifikation",
    "98_Agentenlaeufe",
    "98_Artefakt_Referenzen",
    "99_Checks",
    "00_Dashboard",
  ]);
});

test("muss tables contain roles, validations and comments", () => {
  for (const table of Object.values(workbookSpec.tables)) {
    if (table.required !== "muss") continue;
    assert.ok(table.sheetName);
    assert.ok(table.tableName);
    assert.ok(table.primaryKey);
    assert.ok(table.columns.length > 0);
    assert.equal(Object.keys(table.columnRoles).length, table.columns.length);
    assert.equal(Object.keys(table.comments).length, table.columns.length);
  }
});

test("control trace stays on one minimal sheet", () => {
  assert.equal(workbookSpec.tables["98_Build_Verifikation"].sheetName, "98_Kontrollspur");
  assert.equal(workbookSpec.tables["98_Agentenlaeufe"].sheetName, "98_Kontrollspur");
  assert.equal(workbookSpec.tables["98_Artefakt_Referenzen"].sheetName, "98_Kontrollspur");
  assert.equal(workbookSpec.tables["98_Agentenlaeufe"].primaryKey, "Lauf_ID");
});

test("legacy agent platform sheets are not present", () => {
  for (const forbidden of [
    "70_Agentenworkflow",
    "71_Agent_Auftraege",
    "72_Agent_Pruefregeln",
    "74_Agent_Laufprotokoll",
  ]) {
    assert.equal(workbookSpec.sheetOrder.includes(forbidden), false);
  }
});
```

Expected RED:

```text
FAIL workbookSpec is not defined
```

Minimal GREEN:

`workbookSpec.mjs` definiert `sheetOrder`, `tableBuildOrder`, `tables` und `statusSets`. `seedData.mjs` enthaelt Personen, Kategorien, Szenarien, Annahmen, Kontrollstatus-Werte, Vorschlagsstatus-Werte, Agentenrollen und Check-Definitionen.

Nicht akzeptiert: ein Workbook-Skelett, das nur Blaetter anlegt und die Tabellenlogik spaeter nachreichen will.

## Task 2: CSV-Startimport-Parser

Dateien:

- Create: `workbook-build/src/csvStartimportParser.mjs`
- Create: `workbook-build/tests/csvStartimportParser.test.mjs`

Tests:

- deutsche Datumsformate werden als ISO-Datum geparst.
- deutsche Betragsformate werden korrekt normalisiert.
- Importlauf, Rohumsaetze und initiale Modellumsaetze entstehen getrennt.
- `Import_ID`, `Rohumsatz_ID`, `Transaktion_ID`, `Lauf_ID` und `Zeilenhash` sind deterministisch.
- ein zweiter Import derselben Datei erzeugt keine doppelten Netto-Rohdaten.
- der Parser setzt keine finale Kategorie, Regelzahlung, Transferregel oder `Person_ID`.

## Task 3: Formellogik fuer den V1-Kern

Dateien:

- Create: `workbook-build/src/formulas.mjs`
- Create: `workbook-build/tests/formulas.test.mjs`

Zu implementieren:

- `Liquiditaet_heute`
- `Cashflow_Monat_ist`
- `Cashflow_Monat_erwartet`
- `Cashflow_Monat_gesamt`
- Runway-Projektion
- `CHK003`, `CHK004`, `CHK015`, `CHK016`
- `CHK-BLD-01`, `CHK-RUN-01`

Definitionen:

```text
Liquiditaet_heute =
  Girokonto-Salden + Tagesgeld-Salden + liquidierbarer Depot-Cashwert
```

```text
Cashflow_Monat_gesamt =
  Cashflow_Monat_ist + offene Regelzahlungen diesen Monat + variable Kategorien-Schaetzung
```

```text
Reichweite =
  erster Monat, in dem Liquiditaet_heute + kumulierter Netto-Cashflow <= 0
```

## Task 4: Workbook-Skelett und Startdaten

Dateien:

- Create: `workbook-build/src/buildWorkbook.mjs`
- Create: `workbook-build/tests/buildWorkbook.test.mjs`

Tests:

- alle sichtbaren V1-Blaetter vorhanden.
- alle `muss`-Tabellen vorhanden.
- `01_Personen`, `02_Kategorien`, `40_Szenarien`, `42_Annahmen`, `98_Kontrollspur` und `99_Checks` enthalten Seed-Zeilen oder kontrollierte Startzeilen.
- Startmappe zeigt Modellstatus Gelb oder Rot, nicht Gruen.
- Startmappe zeigt Kontrollstatus `nicht_ausgefuehrt` oder `nicht_pruefbar`, bis ein Verifier-Ergebnis eingetragen ist.

## Task 5: Testdatengenerator

Dateien:

- Create: `workbook-build/src/qaFixtures.mjs`
- Create: `workbook-build/tests/qaFixtures.test.mjs`

Fixture-Katalog: `minimal`, `cashflow_normal`, `uncategorized_high`, `transfer_candidates`, `missing_sources`, `overlapping_assumptions`, `liquidity_failure`, `regular_payment_variance`, `build_verification_missing`, `agent_import_replay`, `agent_implementation_idempotency`, `checked_assumption_new_external_value`, `formula_error`.

## Task 6: Artefakt-Verifikation

Dateien:

- Create: `workbook-build/src/workbookInspector.mjs`
- Create: `workbook-build/src/artifactToolInspector.mjs`
- Create: `workbook-build/src/exceljsInspector.mjs`
- Create: `workbook-build/src/buildManifest.mjs`
- Create/Replace: `workbook-build/src/artifactVerifier.mjs`
- Create: `workbook-build/tests/artifactRegression.test.mjs`

Pruefungen:

- Pflichtblaetter und Pflichtspalten vorhanden.
- Key-Ranges ohne Formel-Fehler.
- Dashboard-Modellstatus und Kontrollstatus korrekt.
- Checks reagieren auf Fixtures.
- Warnungs- und Vorschlagsfingerprints bleiben stabil.
- Verifier erzeugt eine `98_Build_Verifikation`-kompatible Zusammenfassung.

## Task 7: Agenten-Compliance ausserhalb der Nutzeroberflaeche

Dateien:

- Create: `workbook-build/src/agentComplianceHarness.mjs`
- Create: `workbook-build/tests/agentCompliance.test.mjs`

Regeln:

- Import-Agent darf Quellen, Importlaeufe, Rohumsaetze, initiale Modellumsaetze, Vorschlaege/Warnungen und Laufanker schreiben.
- Analyse-Agent darf Vorschlaege/Warnungen und Laufanker erzeugen.
- Recherche-Agent darf Quellen, historisierte Annahmen, Vorschlaege und Laufanker schreiben.
- Umsetzungs-Agent darf nur angenommene, eindeutige Vorschlaege umsetzen und Laufanker schreiben.
- Kein Agent setzt final bestaetigte Regelzahlungen, Transferregeln oder `geprueft`, wenn die Rolle es nicht erlaubt.

Compliance-Testdaten und Subagenten-Snapshots bleiben in `workbook-build/tests/`. In die Produktivmappe gelangen nur Nutzerbefunde und die knappe Zeile in `98_Agentenlaeufe`.

## Task 8: Format- und Layouttests

Dateien:

- Create: `workbook-build/src/styles.mjs`
- Extend: `workbook-build/tests/artifactRegression.test.mjs`

Stilkonventionen:

| Element | Stil |
|---|---|
| Schrift | Aptos |
| Body | 10 pt |
| Tabellenheader | 10 pt fett |
| Bereichstitel | 12 pt fett |
| Dashboardtitel | 16 pt fett |
| Eingaben | blaue Schrift `#0000FF` |
| Formeln | schwarze Schrift `#000000` |
| interne Blattverweise | gruene Schrift `#008000` |
| externe Quellen/Dateipfade | rote Schrift `#C00000` |
| kritische Annahmen | gelber Hintergrund `#FFF2CC` |
| Status Gruen | `#C6EFCE` |
| Status Gelb | `#FFEB9C` |
| Status Rot | `#FFC7CE` |

Layout: Dashboard in der dokumentierten Reihenfolge, Detailblaetter mit Statusbereich oben, `98_Kontrollspur` mit knappem Statusbereich und drei Tabellen, Freeze Panes unter dem Statusbereich, keine ueberbreiten Autofit-Spalten.

## Abschlusskriterien fuer Version 1

Die Mappe gilt als V1-baubar, wenn:

- alle Builder-Tests fuer den V1-Mindestkern gruen sind,
- der Girokonto-Startimport reproduzierbar ist,
- der Minimal-Verifier die Mappe ohne Formel-Fehler prueft,
- der Modellstatus bei offenen Daten nicht Gruen ist,
- Cashflow, Liquiditaet und Reichweite sichtbar sind,
- offene Quellen, Annahmen, Kategorien, Transfers und Vorschlaege sichtbar sind,
- `98_Kontrollspur` Build, Lauf und externe Artefakte minimal verankert,
- Agenten-Compliance-Tests keine verbotenen Statusaenderungen finden,
- Dashboard und zentrale Detailblaetter visuell geprueft wurden.

Eine exportierte `.xlsx` ist erst nach Minimal-Verifier Ziel, nicht vorher.

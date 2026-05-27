# Finanzmodell Excel Bau- und QA-Plan

Stand: 20.05.2026

Dieser Plan beschreibt den technischen Bau der ersten Excel-Mappe und die Qualitaetssicherung. In diesem Schritt wird noch keine Excel-Mappe gebaut.

## Ziel

Aus den fachlichen Dokumenten entsteht eine reproduzierbar baubare und pruefbare Excel-Mappe Version 1. Der erste Build beweist nicht die gesamte Zukunftsarchitektur, sondern einen kleinen entscheidungsrelevanten Kern:

- Girokonto-Startimport.
- Cashflow heute.
- Liquiditaet heute.
- Sicherheitsreserve und Reichweite.
- offene Daten, Quellen, Annahmen und Vorschlaege.
- Dashboard mit Modellstatus und naechster Aktion.

Die Excel-Datei ist ein Build-Artefakt. Die fachliche Logik bleibt in den Markdown-Dateien dokumentiert. Code darf fachliche Luecken nicht still schliessen.

## Grundsaetze

- Keine neue fachliche Struktur erfinden, solange die bestehenden Dokumente ausreichen.
- TDD gilt fuer den kleinen V1-Kern, nicht fuer die gesamte Zielarchitektur auf einmal.
- `workbookSpec.mjs` ist Strukturvertrag, nicht zweite Spezifikation.
- `99_Checks` ist die Live-Pruefung in der Produktivmappe.
- Externe Artefakt-Tests nutzen Testmappen und verschmutzen die Produktivmappe nicht.
- Eine gelbe oder rote Startmappe ist akzeptiert, wenn sie Unsicherheit ehrlich zeigt.

## Architektur

Der Bau erfolgt ueber einen fokussierten Workbook-Generator:

1. `workbookSpec.mjs`: Blatt-, Tabellen-, Spalten-, Validierungs- und Seed-Struktur fuer den V1-Kern.
2. `csvStartimportParser.mjs`: Parser fuer den vorhandenen Girokonto-Export.
3. `buildWorkbook.mjs`: Generator fuer das `.xlsx`-Artefakt.
4. `formulas.mjs`: kleine fachliche Formellogik fuer Cashflow, Liquiditaet, Reichweite und Checks.
5. `qaFixtures.mjs`: deterministische Testdaten.
6. `artifactVerifier.mjs`: unabhaengige Pruefschicht.
7. `agentComplianceHarness.mjs`: Tests fuer Import-, Analyse-, Recherche- und Umsetzungsgrenzen.

## Technische Mittel

- JavaScript/Node als Build- und Testlaufzeit.
- `node:test` und `node:assert/strict` fuer Tests.
- `@oai/artifact-tool`, wenn verfuegbar.
- `exceljs` als lokaler Inspector-Fallback fuer Struktur- und Datei-Pruefungen.
- Keine manuelle Excel-Bearbeitung als primaere Quelle der Logik.
- Keine externen Workbook-Links.

## Verzeichnis- und Dateiplan

```text
workbook-build/
  README.md
  package.json
  src/
    workbookSpec.mjs
    seedData.mjs
    csvStartimportParser.mjs
    buildWorkbook.mjs
    formulas.mjs
    qaFixtures.mjs
    artifactVerifier.mjs
    workbookInspector.mjs
    artifactToolInspector.mjs
    exceljsInspector.mjs
    agentComplianceHarness.mjs
  tests/
    workbookSpec.test.mjs
    csvStartimportParser.test.mjs
    buildWorkbook.test.mjs
    formulas.test.mjs
    qaFixtures.test.mjs
    artifactRegression.test.mjs
    agentCompliance.test.mjs
    fixtures/
      csv/
        girokonto_test.csv
      subagent_snapshots/
  outputs/
    .gitkeep
```

## `workbookSpec.mjs`

`workbookSpec.mjs` enthaelt nur, was der Builder direkt braucht:

- Blattreihenfolge.
- Tabellenname und Zielblatt.
- Spaltenreihenfolge.
- Spaltenrollen.
- Datenvalidierungen.
- Seed-Zeilen fuer Startkataloge.
- ID-Prefixe und Update-Modi.
- kurze Spaltenkommentare.
- Pflichtstufe `muss`, `soll`, `spaeter`.

Nicht in `workbookSpec.mjs` gehoeren:

- lange fachliche Begruendungen.
- komplette Agentenmethodiken.
- vollstaendige Entscheidungshistorie.
- Spekulationen ueber spaetere Szenarien.
- Freitext-Duplizierung der Markdown-Dateien.

Wenn `workbookSpec.mjs` eine fachliche Regel nicht eindeutig aus den Dokumenten ableiten kann, wird ein offenes Feld, ein Check oder ein Vorschlag erzeugt. Es wird kein stiller Default gesetzt.

## Build-Gates

### Gate A: Tooling geklaert

Erreicht, wenn:

- Node verfuegbar ist.
- Paketstrategie dokumentiert ist.
- `@oai/artifact-tool` verfuegbar ist oder `exceljs` als primaerer lokaler Inspector genutzt wird.
- `workbook-build/README.md` Run-Befehle und Tooling-Ergebnis enthaelt.

Kein fachlicher Umbau entsteht aus diesem Gate.

### Gate B: Spezifikation kompilierbar

Erreicht, wenn:

- `workbookSpec.mjs` alle V1-Blattnamen in Reihenfolge enthaelt.
- alle `muss`-Tabellen aus dem Datenmodell vorhanden sind.
- jede `muss`-Tabelle Spalten, Primaerschluessel, Rollen, Validierungen und Kommentare hat.
- Seed-Daten fuer `01_Personen`, `02_Kategorien`, `40_Szenarien`, `42_Annahmen`, `72_Agent_Pruefregeln` und `99_Checks` maschinell vorliegen.

Nicht akzeptiert: ein Workbook-Skelett, das nur Blaetter anlegt und die Tabellenlogik spaeter nachreichen will.

### Gate C: Import reproduzierbar

Erreicht, wenn:

- deutsche Datums- und Betragsformate korrekt geparst werden.
- Importlauf, Rohumsaetze und Modellumsaetze getrennt entstehen.
- `Import_ID`, `Rohumsatz_ID`, `Transaktion_ID` und `Zeilenhash` deterministisch sind.
- ein zweiter Import derselben Datei keine doppelten Netto-Rohdaten erzeugt.
- der Parser keine finale Kategorie, Regelzahlung, Transferregel oder `Person_ID` entscheidet.

### Gate D: Workbook nutzbar, aber ehrlich

Erreicht, wenn:

- der V1-Kern gebaut wird.
- Dashboard und Detailbereiche keine Formel-Fehler in Key-Ranges haben.
- Modellstatus bei offenen Platzhaltern Gelb oder Rot ist.
- offene Punkte in `99_Checks`, `60_Warnungen`, `71_Agent_Auftraege` oder `73_Agent_Vorschlaege` sichtbar sind.
- Eingaben, Formeln, Status, Quellen und technische Felder visuell unterscheidbar sind.

### Gate E: Agentengrenzen pruefbar

Erreicht, wenn:

- Import-Agent keine finalen Regelzahlungen oder Transferregeln erzeugt.
- Analyse-Agent Vorschlaege/Warnungen erzeugt, aber keine Endentscheidungen.
- Recherche-Agent belegte/gepruefte Werte nicht still ueberschreibt.
- Umsetzungs-Agent nur angenommene und eindeutige Vorschlaege umsetzt.
- Wiederholte Laeufe idempotent bleiben.

## TDD-Reihenfolge

### Task 0: Tooling-Check

Dateien:

- Create: `workbook-build/README.md`
- Create: `workbook-build/package.json`

Akzeptanz:

- `npm test` ist definiert.
- `npm run build` ist definiert.
- `npm run verify` ist definiert.
- README dokumentiert, ob `@oai/artifact-tool` oder `exceljs` primaer genutzt wird.

### Task 1: `workbookSpec` fuer den V1-Kern

Dateien:

- Create: `workbook-build/src/workbookSpec.mjs`
- Create: `workbook-build/src/seedData.mjs`
- Create: `workbook-build/tests/workbookSpec.test.mjs`

Failing Tests zuerst:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { workbookSpec } from "../src/workbookSpec.mjs";

test("V1 sheets are defined in documented order", () => {
  assert.deepEqual(workbookSpec.sheetNames, [
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
    "45_Sensitivitaet",
    "50_Performance",
    "60_Warnungen",
    "70_Agentenworkflow",
    "71_Agent_Auftraege",
    "72_Agent_Pruefregeln",
    "73_Agent_Vorschlaege",
    "74_Agent_Laufprotokoll",
    "90_Quellen",
    "99_Checks",
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
```

Expected RED:

```text
FAIL workbookSpec is not defined
```

Minimal GREEN:

`workbookSpec.mjs` definiert die V1-Kerntabellen und die strukturellen Metadaten. `seedData.mjs` enthaelt Startkataloge.

### Task 2: CSV-Startimport-Parser

Dateien:

- Create: `workbook-build/src/csvStartimportParser.mjs`
- Create: `workbook-build/tests/csvStartimportParser.test.mjs`

Failing Tests zuerst:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseGermanAmount, parseGermanDate, parseGiroCsv } from "../src/csvStartimportParser.mjs";

test("parses German amount formats from Giro CSV", () => {
  assert.equal(parseGermanAmount("-4.501"), -4501);
  assert.equal(parseGermanAmount("-8,67"), -8.67);
  assert.equal(parseGermanAmount("7.818,53"), 7818.53);
  assert.equal(parseGermanAmount("790,93 EUR"), 790.93);
});

test("parses two-digit German bank dates as 20xx", () => {
  assert.equal(parseGermanDate("15.05.26").toISOString().slice(0, 10), "2026-05-15");
  assert.equal(parseGermanDate("02.01.24").toISOString().slice(0, 10), "2024-01-02");
});

test("parser returns importlauf, raw rows and initial model rows", async () => {
  const result = await parseGiroCsv("./tests/fixtures/csv/girokonto_test.csv", {
    importId: "IMP-20260518-001",
    quellkontoId: "KTO001",
  });
  assert.ok(result.importlauf);
  assert.ok(result.rohumsatzRows.length > 0);
  assert.equal(result.modellRows[0].Person_ID, "");
  assert.notEqual(result.modellRows[0].Status, "geprueft");
});
```

Minimal GREEN:

Parser fuer das vorhandene CSV-Format mit deterministischen IDs, Hashes und offenen Initialwerten.

### Task 2.5: Verifier-Stub

Dateien:

- Create: `workbook-build/src/artifactVerifier.mjs`

Zweck: spaetere Tests koennen importieren, obwohl der echte Verifier erst nach dem Builder vollstaendig wird.

```js
export async function inspectWorkbookTables() {
  throw new Error("inspectWorkbookTables: not yet implemented");
}

export async function verifyArtifact() {
  throw new Error("verifyArtifact: not yet implemented");
}

export async function inspectStyles() {
  throw new Error("inspectStyles: not yet implemented");
}
```

### Task 3: Workbook-Skelett und Startdaten

Dateien:

- Create: `workbook-build/src/buildWorkbook.mjs`
- Create: `workbook-build/tests/buildWorkbook.test.mjs`

Tests:

- alle `muss`-Blaetter vorhanden.
- alle `muss`-Tabellen vorhanden.
- `01_Personen`, `02_Kategorien`, `40_Szenarien`, `42_Annahmen`, `72_Agent_Pruefregeln`, `99_Checks` enthalten Seed-Zeilen.
- Startmappe zeigt Modellstatus Gelb oder Rot, nicht Gruen.

### Task 3.5: Fixture-Stubs

Dateien:

- Create: `workbook-build/src/qaFixtures.mjs`

Stubs:

- `minimal`
- `cashflow_normal`
- `uncategorized_high`
- `transfer_candidates`
- `missing_sources`
- `overlapping_assumptions`
- `liquidity_failure`
- `regular_payment_variance`
- `agent_import_replay`
- `agent_implementation_idempotency`
- `checked_assumption_new_external_value`
- `formula_error`

### Task 4: Formeln und Checks fuer den V1-Kern

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

### Task 5: Testdatengenerator

Dateien:

- Create: `workbook-build/src/qaFixtures.mjs`
- Create: `workbook-build/tests/qaFixtures.test.mjs`

Fixture-Katalog:

| Fixture | Zweck |
|---|---|
| `minimal` | leere, aber baubare Startmappe mit Gelb/Rot |
| `cashflow_normal` | normale 12-Monats-Cashflow-Sicht |
| `uncategorized_high` | hoher Anteil `KAT013` |
| `transfer_candidates` | Umbuchungen bleiben Kandidaten |
| `missing_sources` | kritische Werte ohne Quelle |
| `overlapping_assumptions` | Annahmen ueberlappen |
| `liquidity_failure` | Runway kritisch, Dashboard Rot |
| `regular_payment_variance` | fehlende/doppelte/abweichende Regelzahlungen |
| `agent_import_replay` | zweiter Import erzeugt keine Doppelung |
| `agent_implementation_idempotency` | Umsetzung laeuft idempotent |
| `checked_assumption_new_external_value` | Recherche ueberschreibt keine gepruefte Annahme |
| `formula_error` | absichtlich kaputte Formel fuer Verifier |

### Task 6: Artefakt-Verifikation

Dateien:

- Create: `workbook-build/src/workbookInspector.mjs`
- Create: `workbook-build/src/artifactToolInspector.mjs`
- Create: `workbook-build/src/exceljsInspector.mjs`
- Replace: `workbook-build/src/artifactVerifier.mjs`
- Create: `workbook-build/tests/artifactRegression.test.mjs`

Pruefungen:

- Pflichtblaetter vorhanden.
- Pflichtspalten vorhanden.
- Key-Ranges ohne Formel-Fehler.
- Dashboard-Modellstatus korrekt.
- Checks reagieren auf Fixtures.
- Warnungs- und Vorschlagsfingerprints bleiben stabil.
- `CHK-PERS-01`, `CHK-PERS-02`, `CHK-PERS-03`, `CHK-SUG-01` sind als Seed-Checks vorhanden und auswertbar.

Dual-Run:

- Primaer `ArtifactToolInspector`, wenn verfuegbar.
- Sonst `ExceljsInspector`.
- Beide implementieren dasselbe Interface.
- Unterschiede werden als Verifier-Ergebnis dokumentiert, nicht als stiller Pass.

### Task 7: Agenten-Compliance

Dateien:

- Create: `workbook-build/src/agentComplianceHarness.mjs`
- Create: `workbook-build/tests/agentCompliance.test.mjs`

Regeln:

- Import-Agent darf `90_Quellen`, `10_Importlaeufe`, `10_Umsaetze_Roh`, initiale `11_Umsaetze_Modell`, Folgeauftraege und Laufprotokoll schreiben.
- Pruef-/Analyse-Agent darf Vorschlaege, Warnungen, Folgeauftraege und Laufprotokoll schreiben.
- Recherche-Agent darf Quellen, historisierte Annahmen oder Vorschlaege schreiben.
- Umsetzungs-Agent darf nur angenommene, eindeutige Vorschlaege umsetzen.
- Kein Agent setzt final bestaetigte Regelzahlungen, Transferregeln oder `geprueft`, wenn die Rolle es nicht erlaubt.

### Task 8: Subagenten-Rollentests

Echte Subagentenlaeufe werden nicht als normale Unit Tests behandelt. Der Ablauf:

1. Test-Runner-Subagent erzeugt JSON-Snapshots fuer Import, Analyse, Recherche und Umsetzung.
2. Reviewer-Subagent bewertet Struktur und fachliche Plausibilitaet.
3. Automatische Tests validieren JSON-Schema, Pflichtfelder, verbotene Tabellen und Idempotenz.
4. Unklare fachliche Kriterien werden als `HUMAN_REQUIRED` markiert.

### Task 9: Format- und Layouttests

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

Layout:

- Dashboard in der dokumentierten Reihenfolge.
- Detailblaetter mit Statusbereich oben.
- Freeze Panes unter dem Statusbereich.
- Keine hellgraue relevante Schrift auf weissem Hintergrund.
- Keine ueberbreiten Autofit-Spalten.

## Abschlusskriterien fuer Version 1

Die Mappe gilt als V1-baubar, wenn:

- alle Builder-Tests fuer den V1-Kern gruen sind,
- der Girokonto-Startimport reproduzierbar ist,
- der Minimal-Verifier die Mappe ohne Formel-Fehler prueft,
- der Modellstatus bei offenen Daten nicht Gruen ist,
- Cashflow, Liquiditaet und Reichweite sichtbar sind,
- offene Quellen, Annahmen, Kategorien, Transfers und Vorschlaege sichtbar sind,
- Agenten-Compliance-Tests keine verbotenen Statusaenderungen finden,
- Dashboard und zentrale Detailblaetter visuell geprueft wurden.

## Nicht-Ziele fuer Version 1

- Kein vollstaendiges Steuer- oder Sozialrechtsmodell.
- Keine echte Portfolio-XIRR.
- Keine automatische finale Kategorisierung.
- Keine automatische Aktivierung von Regelzahlungen.
- Keine automatische Bestaetigung von Transfers.
- Keine vollstaendige Agentenplattform.
- Keine parallele tiefe Szenariosimulation.

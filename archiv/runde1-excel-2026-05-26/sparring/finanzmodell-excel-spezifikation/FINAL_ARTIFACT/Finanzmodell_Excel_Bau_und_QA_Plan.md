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
- TDD beginnt mit einem Struktur-, Referenz- und Sichtbarkeits-Slice und erweitert danach die Breite des V1-Vertrags.
- Der Thin-Slice-Test ist konkret: Er benennt Mindest-Seeds, Tabellenkette, Check-/Quellenbezug, Startstatus und Kontrollstatus.
- `workbookSpec.mjs` ist Strukturvertrag, nicht zweite Spezifikation.
- Die sichtbare Blattreihenfolge und die `tableBuildOrder` sind getrennte Vertraege.
- Die verbindliche Reihenfolge steht im Datenmodell und in diesem Bauplan; es gibt keine separate Startreihenfolge-Datei.
- `99_Checks` ist die Live-Pruefung in der Produktivmappe.
- `98_Kontrollspur` ist der minimale Auditanker fuer Build, Lauf und externe Artefakte.
- Externe Artefakt-Tests nutzen Testmappen und verschmutzen die Produktivmappe nicht.
- Agenten-Compliance wird ausserhalb der Nutzeroberflaeche getestet; Excel zeigt relevante Vorschlaege, Warnungen, Laufhinweise und Compliance-Status.
- Eine gelbe oder rote Startmappe ist akzeptiert, wenn sie Unsicherheit ehrlich zeigt und der Status auf konkrete Checks, Quellen oder Kontrollspurzeilen rueckverweist.

## Architektur

Der Bau erfolgt ueber einen fokussierten Workbook-Generator:

1. `workbookSpec.mjs`: Strukturvertrag fuer Blaetter, Tabellen, Spalten, Rollen, Validierungen, Kommentare, Seed-Struktur und minimale Kontrollspur.
2. `seedData.mjs`: Startkataloge, Statuswerte, Check-Definitionen, Minimal-Seeds und Start-Dashboardzustand.
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

## Task 1: `workbookSpec` mit erstem Struktur-, Referenz- und Sichtbarkeits-Gate

Dateien:

- Create: `workbook-build/src/workbookSpec.mjs`
- Create: `workbook-build/src/seedData.mjs`
- Create: `workbook-build/tests/workbookSpec.test.mjs`

Task 1 hat zwei Teilziele, die in dieser Reihenfolge getestet werden:

1. **Thin-Slice-Gate:** Ein minimaler Durchstich zeigt nach konkret benannten Startdaten einen roten oder gelben Dashboard- und Kontrollstatus. Dafuer reichen Personen und Haushalt, Kategorie `KAT013`, ein Girokonto, ein aktives Standardszenario, Annahmen, Quelle, Importlauf, wenige Roh- und Modellumsaetze, Dashboard-Zielstellen ohne Finanzwert, ein rueckgebundener Check und ein Kontrollstatus. Dieser Durchstich ist kein Finanznutzwertnachweis, sondern beweist Struktur, Referenzierbarkeit und sichtbare Unsicherheit.
2. **V1-Strukturvertrag:** Danach sind `sheetOrder`, `tableBuildOrder` und alle Muss-Tabellen strukturell im `workbookSpec` beschrieben.

Damit ist Task 1 weder nur eine breite Tabellenabschrift noch ein zu schmaler Prototyp. Der Slice beweist Struktur, Referenzierbarkeit und negative Sichtbarkeit; der Kontrollstatus ist das erste enge Produktverhalten. Der Strukturvertrag verhindert, dass spaetere Tasks auf wackeligen Tabellen nachziehen. Der eigentliche Finanznutzwert aus berechneter Liquiditaet, Cashflow und Reichweite beginnt erst mit Task 3.

### Grenze von Task 1

Task 1 darf den roten oder gelben Status als Start-Dashboardzustand aus `seedData` sichtbar machen. Er darf pruefen, dass die dafuer benoetigten Tabellen und Seed-Zeilen existieren, zusammen referenzierbar sind und der sichtbare Status aus mindestens einem vorhandenen Check mit Quellen-, Annahmen-, Import- oder Kontrollspurbezug erklaerbar ist. Er darf daraus keinen fachlichen Nutzen fuer Liquiditaet, Cashflow oder Reichweite behaupten und keine Finanzkennzahl als Startentscheidung anzeigen.

Task 1 darf noch nicht:

- CSV-Dateien parsen,
- echte Liquiditaets-, Cashflow- oder Runway-Formeln implementieren,
- `formulas.mjs` importieren,
- aus Rohumsaetzen eine fachliche Kategorie final ableiten,
- Transfer- oder Regelzahlungsentscheidungen treffen,
- eine `.xlsx` exportieren.

Die erste echte Berechnung gehoert in Task 3. Task 1 bereitet dafuer Spalten, Rollen, Validierungen, Kommentare und Seeds vor, trennt aber Strukturtest, Kontrollstatus-/Sichtbarkeitstest und spaetere Finanzkennzahlenlogik klar.

Failing Tests zuerst:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workbookSpec } from "../src/workbookSpec.mjs";
import { seedData } from "../src/seedData.mjs";

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

test("thin slice seeds form a concrete red or yellow reference chain", () => {
  const personenById = new Map(seedData.personen.map((row) => [row.Person_ID, row]));
  const categoryIds = new Set(seedData.kategorien.map((row) => row.Kategorie_ID));
  const accountIds = new Set(seedData.konten.map((row) => row.Konto_ID));
  const sourceIds = new Set(seedData.quellen.map((row) => row.Quelle_ID));
  const importIds = new Set(seedData.importlaeufe.map((row) => row.Import_ID));
  const rawIds = new Set(seedData.umsaetzeRoh.map((row) => row.Rohumsatz_ID));
  const checkIds = new Set(seedData.checks.map((row) => row.Check_ID));

  assert.equal(personenById.get("P01")?.Typ, "Person");
  assert.equal(personenById.get("HH")?.Typ, "Haushalt");
  assert.ok(categoryIds.has("KAT013"));

  const girokonto = seedData.konten.find((row) =>
    row.Kontoart === "Girokonto" && row.Liquide_relevant === true
  );
  assert.ok(girokonto);
  assert.ok(sourceIds.has(girokonto.Quelle_ID));

  assert.equal(
    seedData.szenarien.filter((row) => row.Status === "aktiv").length,
    1
  );
  assert.ok(seedData.annahmen.some((row) =>
    row.Name === "Sicherheitsreserve"
  ));
  const importlauf = seedData.importlaeufe.find((row) =>
    row.Quellkonto_ID === girokonto.Konto_ID && sourceIds.has(row.Quelle_ID)
  );
  assert.ok(importlauf);
  assert.ok(importIds.has(importlauf.Import_ID));

  const rawRows = seedData.umsaetzeRoh.filter((row) =>
    row.Import_ID === importlauf.Import_ID && accountIds.has(row.Quellkonto_ID)
  );
  assert.ok(rawRows.length >= 2);

  assert.ok(seedData.umsaetzeModell.some((row) =>
    rawIds.has(row.Rohumsatz_ID) && row.Kategorie_ID === "KAT013"
  ));

  const statusChecks = seedData.checks.filter((row) =>
    seedData.startDashboard.Status_Check_IDs.includes(row.Check_ID)
  );
  assert.ok(statusChecks.length >= 1);
  assert.ok(statusChecks.some((row) =>
    sourceIds.has(row.Betroffene_Quelle_ID)
      || importIds.has(row.Betroffener_Import_ID)
      || seedData.buildVerifikation.some((build) =>
        build.Build_ID === row.Betroffener_Kontrollspur_ID
      )
      || seedData.annahmen.some((annahme) =>
        annahme.Annahme_ID === row.Betroffene_Annahme_ID
      )
  ));

  assert.ok(["Rot", "Gelb"].includes(seedData.startDashboard.Modellstatus));
  assert.notEqual(seedData.startDashboard.Modellstatus, "Gruen");
  assert.equal(seedData.startDashboard.Startzustand_Typ, "seeded_control_status");
  assert.ok(seedData.startDashboard.Status_Check_IDs.every((id) => checkIds.has(id)));
  assert.ok([
    "nicht_ausgefuehrt",
    "nicht_pruefbar",
  ].includes(seedData.startDashboard.Kontrollstatus));
});

test("task 1 dashboard does not expose financial result values", () => {
  for (const field of [
    "Liquiditaet_heute",
    "Freie_Liquiditaet_nach_Reserve",
    "Cashflow_Monat_ist",
    "Cashflow_Monat_erwartet",
    "Cashflow_Monat_gesamt",
    "Reichweite_Monate",
  ]) {
    assert.ok([
      undefined,
      null,
      "",
      "nicht_berechnet",
      "zielstelle_ohne_wert",
    ].includes(seedData.startDashboard[field]));
  }
});

test("thin slice stays structural and does not import formula logic", () => {
  const source = readFileSync(new URL("../src/workbookSpec.mjs", import.meta.url), "utf8");
  assert.equal(source.includes("formulas.mjs"), false);
  assert.equal("task1Scope" in workbookSpec, false);
  assert.equal("formulaImplementationTask" in workbookSpec, false);
  assert.equal("businessValueClaim" in workbookSpec, false);
});

test("thin slice check references stay concrete and minimal", () => {
  const allowedReferenceFields = [
    "Betroffene_Quelle_ID",
    "Betroffene_Annahme_ID",
    "Betroffener_Import_ID",
    "Betroffener_Kontrollspur_ID",
  ];

  for (const check of seedData.checks) {
    assert.equal("Betroffene_Tabelle" in check, false);
    assert.equal("Betroffene_ID" in check, false);
    assert.equal("Betroffene_Referenzen" in check, false);
  }

  const statusChecks = seedData.checks.filter((row) =>
    seedData.startDashboard.Status_Check_IDs.includes(row.Check_ID)
  );
  for (const check of statusChecks) {
    const filledReferences = allowedReferenceFields.filter((field) => check[field]);
    assert.ok(filledReferences.length >= 1);
  }
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

- `workbookSpec.mjs` definiert `sheetOrder`, `tableBuildOrder`, `tables` und `statusSets`, aber keine Task- oder Formel-Metafelder als Produktvertrag.
- `seedData.mjs` enthaelt Personen, Kategorien, Konten, Szenarien, Annahmen, Quellen, Importlauf, Rohumsaetze, Modellumsaetze, eine Startzeile fuer Build-Verifikation, Kontrollstatus-Werte, Vorschlagsstatus-Werte, Agentenrollen, Check-Definitionen und `startDashboard`.
- `seedData.checks` nutzt konkrete Referenzfelder (`Betroffene_Quelle_ID`, `Betroffene_Annahme_ID`, `Betroffener_Import_ID`, `Betroffener_Kontrollspur_ID`) und keine aufgeblahte generische Referenzarchitektur; mehrere dieser Felder sind nur erlaubt, wenn derselbe Befund sie wirklich braucht.
- Jede Muss-Tabelle ist strukturell beschrieben, auch wenn noch nicht jede Formel implementiert ist.
- Das Thin-Slice-Gate kann einen roten oder gelben Dashboard- und Kontrollstatus aus Startdaten, Kontrollstatus und mindestens einem rueckgebundenen Check begruenden, ohne Finanzkennzahlenwerte anzuzeigen.

Nicht akzeptiert:

- ein Workbook-Skelett, das nur Blaetter anlegt und Tabellenlogik spaeter nachreichen will.
- ein reiner Tabellenkatalog ohne roten oder gelben Dashboard-Nachweis.
- ein Seed-Katalog ohne referenzierbare Kette von Konto, Quelle, Import, Rohumsatz, Modellumsatz, Check und Dashboard.
- ein statisch gesetzter Dashboardstatus ohne Check- und Quellen-/Kontrollspurbezug.
- eine gruene Startmappe ohne bestandene Verifikation.
- eine zweite Markdown-Datei nur fuer Startreihenfolge.
- Berechnungslogik in Task 1, die nach Task 3 gehoert.
- ein Task-1-Test, der schon fachlichen Nutzwert oder Ergebniswerte von Cashflow, Liquiditaet oder Reichweite behauptet.
- generische Check-Referenzfelder, die spaeteren Bedarf vorgaukeln, statt den konkreten Startbefund knapp zu referenzieren.

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

Task 3 ersetzt den Task-1-Startzustand nicht durch neue Strukturentscheidungen. Es fuellt die bereits vereinbarten Spalten und Checks mit Berechnungslogik.

## Task 4: Workbook-Skelett und Startdaten

Dateien:

- Create: `workbook-build/src/buildWorkbook.mjs`
- Create: `workbook-build/tests/buildWorkbook.test.mjs`

Tests:

- alle sichtbaren V1-Blaetter vorhanden.
- alle `muss`-Tabellen vorhanden.
- `01_Personen`, `02_Kategorien`, `03_Konten`, `40_Szenarien`, `42_Annahmen`, `98_Kontrollspur` und `99_Checks` enthalten Seed-Zeilen oder kontrollierte Startzeilen.
- Startmappe zeigt Modellstatus Gelb oder Rot, nicht Gruen.
- Startmappe zeigt Kontrollstatus `nicht_ausgefuehrt` oder `nicht_pruefbar`, bis ein Verifier-Ergebnis eingetragen ist.
- Startmappe zeigt zu Rot oder Gelb mindestens einen sichtbaren Check-Bezug; ein reiner Status-Seed ohne Begruendung ist nicht akzeptiert.

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
- Gelb oder Rot aus Checks, Quellen, Annahmen, Import- oder Kontrollspurbezug erklaerbar ist,
- Cashflow, Liquiditaet und Reichweite nach Task 3 berechnet und sichtbar sind,
- offene Quellen, Annahmen, Kategorien, Transfers und Vorschlaege sichtbar sind,
- `98_Kontrollspur` Build, Lauf und externe Artefakte minimal verankert,
- Agenten-Compliance-Tests keine verbotenen Statusaenderungen finden,
- Dashboard und zentrale Detailblaetter visuell geprueft wurden.

Eine exportierte `.xlsx` ist erst nach Minimal-Verifier Ziel, nicht vorher.

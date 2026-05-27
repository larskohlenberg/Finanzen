# Finanzmodell Excel Bau- und QA-Plan

Stand: 18.05.2026

> Dieser Plan beschreibt den technischen Bau der ersten Excel-Mappe und die dazugehoerige Qualitaetssicherung. Es wird in diesem Schritt keine Excel-Mappe gebaut.

## Ziel

Aus den verbindlichen Dokumenten `Finanzmodell_Datenmodell.md`, `Finanzmodell_Entscheidungsprotokoll.md`, `Finanzmodell_Agentenworkflow.md` und `Finanzmodell_Handover.md` soll eine reproduzierbar baubare, testbare und fachlich pruefbare Excel-Mappe Version 1 entstehen.

Die Excel-Datei ist dabei ein Build-Artefakt. Die fachliche Logik soll nicht manuell in einer einzelnen Arbeitsmappe entstehen, sondern aus Spezifikation, Builder, Tests und Testdaten reproduzierbar erzeugt und verifiziert werden.

## Grundsatz

- Keine neue fachliche Struktur erfinden, solange die bestehenden Dokumente ausreichen.
- Unklare fachliche Entscheidungen nicht still treffen, sondern als Praezisierung im Datenmodell, Agentenworkflow oder Entscheidungsprotokoll dokumentieren.
- TDD gilt auf drei Ebenen:
  - Tests fuer den Builder und die Parserlogik.
  - Tests fuer das fertige Workbook-Artefakt.
  - Tests fuer Agenten-Workflows und Agenten-Compliance.
- `99_Checks` ist die Live-Pruefung in der Produktivmappe.
- Externe Artefakt-Tests nutzen separate Testmappen und duerfen die Produktivmappe nicht mit Testdaten verschmutzen.

## Architektur

Der Bau erfolgt ueber einen kleinen, fokussierten Workbook-Generator:

1. Maschinelle Spezifikation fuer Blaetter, Tabellen, Spalten, initiale Inhalte, Kommentare, Formeln, Formatierungen und Validierungen.
2. Eng begrenzter CSV-Startimport-Parser fuer die vorhandene Girokonto-CSV.
3. Workbook-Builder, der aus Spezifikation und Importdaten eine `.xlsx` erzeugt.
4. Testdatengenerator fuer deterministische fachliche QA-Szenarien.
5. Artefakt-Verifier, der die erzeugte `.xlsx` importiert, berechnet, inspiziert und gegen erwartete Werte prueft.
6. Agenten-Compliance-Harness, der simulierte Agentenlaeufe gegen Methodikregeln prueft.

## Technische Mittel

- JavaScript/Node als Build- und Testlaufzeit.
- `@oai/artifact-tool` fuer Workbook-Erzeugung, Inspektion, Rendering und Export.
- `node:test` und `node:assert/strict` fuer Tests.
- Keine manuelle Excel-Bearbeitung als primaere Quelle der Logik.
- Keine externen Workbook-Links.
- Keine versteckten Annahmen in Formeln.

## Verifier-Abstraktion (Dual-Implementierung)

> Dieser Abschnitt ergaenzt den bestehenden Plan um eine Abstraktionsschicht fuer den Artefakt-Verifier. Der Codex-Pfad mit `@oai/artifact-tool` bleibt vollstaendig unveraendert.

### WorkbookInspector-Interface

Der Verifier (`artifactVerifier.mjs`) haengt nicht direkt an `@oai/artifact-tool`, sondern an einem `WorkbookInspector`-Interface. Beide konkreten Implementierungen muessen dieses Interface erfuellen:

```js
/**
 * WorkbookInspector — minimales Interface fuer Artefakt-Verifikation.
 * Jede Implementierung erhaelt eine geoeffnete Workbook-Referenz im Konstruktor.
 */
interface WorkbookInspector {
  /** Gibt alle Tabellennamen der Mappe zurueck. */
  getTables(): Promise<string[]>;

  /** Gibt die Spaltenreihenfolge einer benannten Tabelle zurueck. */
  getColumns(tableName: string): Promise<string[]>;

  /** Gibt alle Datenzeilen einer Tabelle als flache Objekte zurueck. */
  getRows(tableName: string): Promise<Record<string, unknown>[]>;

  /** Liest den Wert einer einzelnen Zelle (z.B. "00_Dashboard!B2"). */
  getCellValue(sheetName: string, cellAddress: string): Promise<unknown>;

  /** Prueft einen oder mehrere Zellbereiche auf Formel-Fehler (#REF!, #VALUE! usw.).
   *  Gibt ein Array der fehlerhaften Zelladressen zurueck. */
  getFormulaErrors(ranges: string[]): Promise<string[]>;

  /** Liest Stilinformationen (Schriftfarbe, Hintergrundfarbe) fuer ein Blatt zurueck. */
  getStyles(sheetName: string): Promise<StyleMap>;
}
```

### Implementierung 1: ArtifactToolInspector (Codex-Pfad, unveraendert)

`src/artifactToolInspector.mjs` kapselt die bestehenden `@oai/artifact-tool`-Aufrufe und implementiert das Interface oben. Der Codex-Pfad aendert sich dadurch nicht — alle bestehenden Importe in `buildWorkbook.mjs` und den Tests bleiben wie sie sind. Diese Datei ist die direkte Kapselung der bisherigen internen Hilfsfunktionen in `artifactVerifier.mjs`.

### Implementierung 2: ExceljsInspector

`src/exceljsInspector.mjs` implementiert dasselbe Interface mit `exceljs` (npm). Sie liest die fertige `.xlsx`-Datei von Disk und bedient alle Interface-Methoden ohne Codex-Laufzeit. Zweck: unabhaengige Zweitmeinung gegen dieselben Fixtures — kein Rendering, keine Formelauswertung durch `@oai/artifact-tool`, stattdessen rohe Zell- und Stilpruefung durch `exceljs`.

```js
// Minimalstruktur src/exceljsInspector.mjs
import ExcelJS from "exceljs";

export class ExceljsInspector {
  constructor(filePath) { this.filePath = filePath; }

  async #load() {
    if (this._wb) return this._wb;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(this.filePath);
    this._wb = wb;
    return wb;
  }

  async getTables()                    { /* ... */ }
  async getColumns(tableName)          { /* ... */ }
  async getRows(tableName)             { /* ... */ }
  async getCellValue(sheet, cellAddr)  { /* ... */ }
  async getFormulaErrors(ranges)       { /* ... */ }
  async getStyles(sheetName)           { /* ... */ }
}
```

### Verifier-Fabrik

`artifactVerifier.mjs` erhaelt eine Factory-Funktion, die den gewuenschten Inspector per Parameter entgegennimmt:

```js
// src/artifactVerifier.mjs (Ergaenzung)
export async function verifyArtifact(workbook, { inspector } = {}) {
  // Fallback auf ArtifactToolInspector fuer Rueckwaertskompatibilitaet
  const insp = inspector ?? new ArtifactToolInspector(workbook);
  // ... restliche Logik unveraendert, nutzt insp.getTables() usw.
}
```

Alle bestehenden Testaufrufe `verifyArtifact(workbook)` ohne zweites Argument laufen weiterhin gegen den `ArtifactToolInspector` — kein bestehender Test bricht.

## Verzeichnis- und Dateiplan

Die spaetere Umsetzung soll diese Struktur anlegen:

```text
workbook-build/
  README.md
  package.json
  src/
    buildWorkbook.mjs
    csvStartimportParser.mjs
    workbookSpec.mjs
    formulas.mjs
    styles.mjs
    seedData.mjs
    qaFixtures.mjs
    artifactVerifier.mjs
    workbookInspector.mjs        // WorkbookInspector-Interface (shared)
    artifactToolInspector.mjs    // Implementierung 1: @oai/artifact-tool (Codex)
    exceljsInspector.mjs         // Implementierung 2: exceljs (unabhaengig)
    agentComplianceHarness.mjs
  tests/
    csvStartimportParser.test.mjs
    workbookSpec.test.mjs
    buildWorkbook.test.mjs
    formulas.test.mjs
    artifactRegression.test.mjs
    qaFixtures.test.mjs
    agentCompliance.test.mjs
    fixtures/
      csv/
        girokonto_test.csv        // Integrations-Fixture: Kopie der Original-Girokonto-CSV (neutral benannt)
      subagent_snapshots/         // Snapshots aus Task 8 Teil B
  outputs/
    .gitkeep
```

Da der aktuelle Ordner kein Git-Repository ist, enthaelt dieser Plan keine Commit-Schritte.

## Auffaellige Luecken vor dem Excel-Bau

Die Rollen-Audits der Subagenten zeigen: Die fachliche Richtung ist gut, aber mehrere Agenten- und Importregeln sind noch nicht deterministisch genug. Diese Punkte muessen vor oder waehrend Task 1 als V1-Konvention festgelegt und dokumentiert werden.

### 1. ID-Konventionen

Es fehlen reproduzierbare ID-Regeln fuer `Import_ID`, `Rohumsatz_ID`, `Transaktion_ID`, `Quelle_ID`, `Lauf_ID`, `Auftrag_ID` und `Vorschlag_ID`.

V1-Konvention:

```text
Import_ID:         IMP-YYYYMMDD-001
Rohumsatz_ID:      RAW-{Import_ID}-{Zeilennummer_Import}
Transaktion_ID:    TXN-{Rohumsatz_ID}
Quelle_ID:         SRC-YYYYMMDD-001
Lauf_ID:           RUN-YYYYMMDD-001
Auftrag_ID:        JOB-YYYYMMDD-001
Vorschlag_ID:      SUG-YYYYMMDD-001
Transfer_Regel_ID: TRF-YYYYMMDD-001
```

<!-- Fix: 11_Transferregeln Update-Modus -->

Wenn mehrere Laeufe am selben Tag entstehen, wird die laufende Nummer dreistellig erhoeht.

### 2. CSV als Quelle

Der Agentenworkflow verlangt Quellenlogik, `10_Importlaeufe` hat aber aktuell kein `Quelle_ID`.

V1-Konvention:

- Jede importierte Datei wird als Beleg-Zeile in `90_Quellen` erfasst.
- `10_Importlaeufe` bekommt im Workbook ein Feld `Quelle_ID`.
- `Quelle_ID` verweist auf die Datei-Quelle.
- `10_Umsaetze_Roh` verweist nur indirekt ueber `Import_ID` auf die Quelle.

### 3. `Abrufdatum` in Quellen

Die Recherchemethodik verlangt ein Abrufdatum, das in `90_Quellen` noch fehlt.

V1-Konvention:

- `90_Quellen` erhaelt ein Feld `Abrufdatum`.
- Fuer manuelle Belege kann `Abrufdatum` leer bleiben.
- Fuer externe Recherchewerte ist `Abrufdatum` Pflicht.

### 4. Statuswerte vereinheitlichen

Aktuell sind Statuswerte teils klein geschrieben und teils mit Grossschreibung dokumentiert.

V1-Konvention:

- Fachliche Zieltabellen: `offen`, `belegt`, `geprueft`, `geschaetzt`, `inaktiv`.
- Annahmen: `platzhalter`, `geschaetzt`, `belegt`, `geprueft`.
- Agentenauftraege: `offen`, `in_arbeit`, `erledigt`, `verworfen`.
- Agentenvorschlaege: `offen`, `angenommen`, `abgelehnt`, `zurueckgestellt`, `erledigt`.
- Umsetzungsstatus: `nicht_beauftragt`, `auftrag_erstellt`, `umgesetzt`, `nicht_umsetzbar`.

Die existierenden Dokumente koennen weiterhin lesbare Begriffe enthalten, aber die Excel-Werte sollen exakt diese Schreibweise nutzen.

### 5. Zeilenhash und Deduplikation

V1-Konvention fuer `Zeilenhash`:

```text
sha256(
  Quellkonto_ID + "|" +
  Buchungsdatum_ISO + "|" +
  Wertstellung_ISO + "|" +
  Zahlungspflichtiger_normalisiert + "|" +
  Zahlungsempfaenger_normalisiert + "|" +
  Verwendungszweck_normalisiert + "|" +
  Umsatztyp_normalisiert + "|" +
  IBAN_normalisiert + "|" +
  Betrag_cent + "|" +
  Glaeubiger_ID + "|" +
  Mandatsreferenz + "|" +
  Kundenreferenz
)
```

Deduplikationslogik:

- Gleicher `Zeilenhash` in bestehendem Importbestand: `bereits_importiert`.
- Gleiche Kernfelder ohne gleiche Kundenreferenz oder Mandatsreferenz: `moegliches_duplikat`.
- Neue Kombination: `neu`.
- Manuell ausgeschlossene Zeile: `ignoriert`.

### 6. CSV-Mapping

V1-Mapping fuer die vorhandene Girokonto-CSV:

| CSV-Feld | Zielfeld | Regel |
|---|---|---|
| Kopf `Girokonto` | `03_Konten.Maskierte_IBAN_Depotnummer` / Import-Metadatum | Wenn Konto noch fehlt, Startkonto `KTO001` anlegen. |
| Kopf `Zeitraum:` | `10_Importlaeufe.Zeitraum_von`, `Zeitraum_bis` | Format `dd.mm.yyyy - dd.mm.yyyy`. |
| Kopf `Kontostand vom ...:` | `Kontostand_Export`, `Kontostand_Datum` | Betrag mit deutschem Format und NBSP/EUR bereinigen. |
| `Buchungsdatum` | `10_Umsaetze_Roh.Buchungsdatum` | `dd.mm.yy` wird 20xx. |
| `Wertstellung` | `10_Umsaetze_Roh.Wertstellung` | `dd.mm.yy` wird 20xx. |
| `Status` | `Status_Bank` | Originalwert uebernehmen. |
| `Zahlungspflichtige*r` | `Zahlungspflichtiger` | Originalwert uebernehmen. |
| `Zahlungsempfaenger*in` | `Zahlungsempfaenger` | Originalwert uebernehmen. |
| `Verwendungszweck` | `Verwendungszweck` | Originalwert uebernehmen. |
| `Umsatztyp` | `Umsatztyp` | Originalwert uebernehmen. |
| `IBAN` | `IBAN` | Originalwert uebernehmen. |
| `Betrag (EUR)` / `Betrag (€)` | `Betrag` | Deutsches Zahlenformat. |
| `Glaeubiger-ID` | `Glaeubiger_ID` | Originalwert uebernehmen. |
| `Mandatsreferenz` | `Mandatsreferenz` | Originalwert uebernehmen. |
| `Kundenreferenz` | `Kundenreferenz` | Originalwert uebernehmen. |

Betragsparser:

- Komma trennt Dezimalstellen.
- Punkt ohne Komma ist Tausendertrenner.
- Punkt vor Komma ist Tausendertrenner.
- Kein Dezimalzeichen bedeutet volle Euro.
- `-4.501` wird `-4501.00`.
- `-8,67` wird `-8.67`.
- `7.818,53` wird `7818.53`.

### 7. Initialwerte in `11_Umsaetze_Modell`

V1-Konvention fuer jede importierte Rohzeile:

| Feld | Initialwert |
|---|---|
| `Transaktion_ID` | `TXN-{Rohumsatz_ID}` |
| `Rohumsatz_ID` | Verweis auf Rohzeile |
| `Konto_ID` | `Quellkonto_ID` |
| `Kategorie_ID` | `KAT013`, falls keine sichere Regel existiert |
| `Person_ID` | `leer` — Default beim Erstimport, der CSV-Parser entscheidet nie selbst; `HH` wird nur automatisch gesetzt, wenn eine Transferregel in `11_Transferregeln` greift, die explizit `auto_person_id: HH` trägt; alles ohne passende Regel bleibt `leer` und wird in einem separaten Schritt (Nutzer oder Subagent) zugewiesen <!-- Fix: Person_ID Konvention + CHK-PERS --> |
| `Regel_Match_Status` | `kein_match` |
| `Cashflow_Wirkung` | `Einnahme` bei positivem Betrag, `Ausgabe` bei negativem Betrag, ausser Transferkandidat |
| `Szenario_Wirkung` | `zu_pruefen` |
| `Ist_Transfer` | `nein` |
| `Transfer_Status` | `transfer_kandidat` nur bei erkannten Uebertrag-/Eigenkonto-Indizien, sonst `kein_transfer` |
| `Lebenshaltung_Relevant` | `ja`, ausser Transfer-/Investitionskandidat |
| `Status` | `offen` |

Der Startimport darf keine Buchung als `bestaetigter_transfer`, keine Kategorie als `geprueft` und keine Regelzahlung als `bestaetigt` setzen.

### 8. `12_Regelzahlung_Vorschlaege` vs. `73_Agent_Vorschlaege`

V1-Konvention:

- `12_Regelzahlung_Vorschlaege` enthaelt die fachlich tabellarische Mustererkennung aus Umsaetzen.
- `73_Agent_Vorschlaege` enthaelt entscheidungspflichtige Agentenvorschlaege fuer den Nutzer.
- Ein Regelzahlungsmuster mit Entscheidungsbedarf erzeugt:
  - eine Zeile in `12_Regelzahlung_Vorschlaege`
  - eine referenzierende Zeile in `73_Agent_Vorschlaege`
- `73_Agent_Vorschlaege.Betroffene_Tabelle = 12_Regelzahlung_Vorschlaege`
- `73_Agent_Vorschlaege.Betroffene_ID = Vorschlag_ID` aus `12_Regelzahlung_Vorschlaege`

<!-- Fix: SUG-ID Konvention + CHK-SUG-01 -->
SUG-ID-Erzeugungsregel:

- `12_Regelzahlung_Vorschlaege` erzeugt die `SUG-`-ID (ist die Quelle) und inkrementiert den Tageszaehler (`NNN`).
- `73_Agent_Vorschlaege` kopiert die ID aus `12_Regelzahlung_Vorschlaege` (ist der Spiegel) — nie umgekehrt.

Lifecycle-Konsistenzregel:

- Statusaenderungen in `12_Regelzahlung_Vorschlaege` muessen synchron auf den Gegeneintrag in `73_Agent_Vorschlaege` uebertragen werden — und umgekehrt.
- Kein Eintrag darf in einer Tabelle aktiv sein, waehrend er in der anderen `verworfen` ist.
- `CHK-SUG-01` ueberwacht diese Konsistenz.

<!-- Fix: Baubarkeit-Nachlieferung -->
Kanonisches Status-Aequivalenz-Mapping fuer `CHK-SUG-01`: `ignoriert` (in `12_Regelzahlung_Vorschlaege`) entspricht `verworfen` (in `73_Agent_Vorschlaege`). Dies ist das verbindliche Mapping; `CHK-SUG-01` prueft es in beide Richtungen.

### 9. Schlanke Umsetzungsfelder fuer `73_Agent_Vorschlaege`

Damit der Umsetzungs-Agent nicht frei interpretieren muss, aber die Tabelle in V1 bedienbar bleibt, werden nur diese Zusatzfelder vorgesehen:

```text
Ziel_Tabelle
Ziel_ID
Umsetzung_Eindeutig
Vorschlag_Fingerprint
Umsetzung_Details
```

Regel:

- `Umsetzung_Eindeutig = ja` ist Voraussetzung fuer automatische Umsetzung.
- Bei `Umsetzung_Eindeutig = nein` darf der Umsetzungs-Agent keine Zieltabellen aendern.
- Granulare Felder wie `Alter_Wert`, `Neuer_Wert`, `Ziel_Feld`, `Gueltig_von`, `Gueltig_bis` und `Ersetzt_ID` werden in V1 nicht aufgenommen. Wenn diese Praezision fuer eine Umsetzung noetig ist, gehoert sie in `Umsetzung_Details` oder der Vorschlag bleibt nicht eindeutig.

### 10. Idempotenz

Agentenlaeufe muessen wiederholbar sein.

Regeln:

- Ein Vorschlag mit `Umsetzungsstatus = umgesetzt` oder gesetzter `Umsetzung_Ziel_ID` darf nicht erneut umgesetzt werden.
- Ein Analyse-Agent darf keinen zweiten identischen Vorschlag mit gleichem `Vorschlag_Fingerprint` erzeugen.
- Ein Warnungsstatus bleibt ueber `Warnungs_Fingerprint` erhalten.

### 11. Fingerprints

V1-Konvention fuer `Warnungs_Fingerprint`:

```text
sha256(
  Regeltyp + "|" +
  Ausloeser_Check_ID + "|" +
  Betroffene_Tabelle + "|" +
  Betroffene_ID + "|" +
  Periode + "|" +
  normierter_Kontext
)
```

V1-Konvention fuer `Vorschlag_Fingerprint`:

```text
sha256(
  Vorschlagstyp + "|" +
  Betroffene_Tabelle + "|" +
  Betroffene_ID + "|" +
  Ziel_Tabelle + "|" +
  Ziel_ID + "|" +
  normierter_Umsetzungskontext + "|" +
  optionaler_Gueltigkeitszeitraum
)
```

### 12. Tabellen-Update-Modi

Jede Tabelle bekommt fuer Agentenlaeufe einen Update-Modus:

| Tabelle | Update-Modus |
|---|---|
| `10_Umsaetze_Roh` | append_only |
| `10_Importlaeufe` | append_only |
| `11_Umsaetze_Modell` | kontrolliertes_update |
| `11_Transferregeln` | nur_durch_angenommenen_vorschlag | <!-- Fix: 11_Transferregeln Update-Modus -->
| `12_Regelzahlungen` | nur_durch_angenommenen_vorschlag |
| `12_Regelzahlung_Vorschlaege` | append_or_update_by_fingerprint |
| `40_Szenarien` | manuell |
| `42_Annahmen` | historisiert |
| `60_Warnungen_Bearbeitung` | manuell |
| `71_Agent_Auftraege` | append_or_status_update |
| `72_Agent_Pruefregeln` | manuell |
| `73_Agent_Vorschlaege` | append_or_status_update |
| `74_Agent_Laufprotokoll` | append_only |
| `90_Quellen` | append_or_update_by_hash |
| `99_Checks` | manuell_erweiterbar |

<!-- Fix: 90_Quellen Hash-Definition -->
> **`append_or_update_by_hash` fuer `90_Quellen`:** Hash-Schluessel ist `Quellen_Hash` = SHA256 des gesamten Dateiinhalts (Byte-fuer-Byte), berechnet vor jeder Verarbeitung. Identischer Hash = Update der vorhandenen Zeile; neuer Hash = neuer Eintrag. Eine manuell editierte Datei erzeugt bewusst einen neuen Eintrag (andere Quelle, anderer Inhalt).

### 13. Prioritaet und Belastbarkeit

Annahmen:

- Hoehere `Prioritaet` gewinnt.
- Gleiche Prioritaet fuer denselben Zeitraum und Zielbereich erzeugt `CHK013`.

Belastbar:

```text
Ein Wert ist belastbar, wenn:
- Status in (belegt, geprueft)
- falls kritisch: Quelle_ID gesetzt
- falls Quelle erforderlich: Quelle.Status in (belegt, geprueft)
- keine offene Fehler-Warnung zum Wert existiert
```

## TDD-Reihenfolge

### Task 1: Spezifikations-Praezisierungen testen und dokumentieren

**Dateien spaeter:**

- Create: `workbook-build/src/workbookSpec.mjs`
- Create: `workbook-build/tests/workbookSpec.test.mjs`
- Modify: `Finanzmodell_Datenmodell.md`
- Modify: `Finanzmodell_Agentenworkflow.md`
- Modify: `Finanzmodell_Entscheidungsprotokoll.md`

**Failing Tests zuerst:**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { workbookSpec } from "../src/workbookSpec.mjs";

test("all V1 worksheets are defined in the documented order", () => {
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

test("agent-controlled tables define update mode and id prefix", () => {
  for (const table of ["10_Umsaetze_Roh", "42_Annahmen", "73_Agent_Vorschlaege", "90_Quellen"]) {
    assert.ok(workbookSpec.tables[table].updateMode);
    assert.ok(workbookSpec.tables[table].idPrefix);
  }
});
```

**Expected RED:**

```text
FAIL workbookSpec is not defined
```

**Minimal GREEN:**

Implement `workbookSpec.mjs` with sheet names, table metadata, ID prefixes and update modes.

### Task 2: CSV-Startimport-Parser testen

**Dateien spaeter:**

- Create: `workbook-build/src/csvStartimportParser.mjs`
- Create: `workbook-build/tests/csvStartimportParser.test.mjs`

**Failing Tests zuerst:**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseGermanAmount, parseGermanDate, parseGiroCsv } from "../src/csvStartimportParser.mjs";

test("parses German amount formats from Giro CSV", () => {
  assert.equal(parseGermanAmount("-4.501"), -4501);
  assert.equal(parseGermanAmount("-8,67"), -8.67);
  assert.equal(parseGermanAmount("7.818,53"), 7818.53);
  assert.equal(parseGermanAmount("790,93\u00a0EUR"), 790.93);
});

test("parses two-digit German bank dates as 20xx", () => {
  assert.equal(parseGermanDate("15.05.26").toISOString().slice(0, 10), "2026-05-15");
  assert.equal(parseGermanDate("02.01.24").toISOString().slice(0, 10), "2024-01-02");
});

// @integration <!-- Fix: CSV-Test Entkopplung -->
// Voraussetzung: tests/fixtures/csv/girokonto_test.csv muss vorhanden sein.
// Setup (einmalig): cp <datiertes-original-csv> workbook-build/tests/fixtures/csv/girokonto_test.csv
test("parses the provided Giro CSV metadata and row count", async () => {
  const result = await parseGiroCsv("./tests/fixtures/csv/girokonto_test.csv", {
    importId: "IMP-20260518-001",
    quellkontoId: "KTO001",
  });
  assert.equal(result.importlauf.Zeitraum_von, "2024-01-01");
  assert.equal(result.importlauf.Zeitraum_bis, "2026-05-16");
  assert.equal(result.importlauf.Kontostand_Export, 790.93);  // erwartet: 790,93 EUR
  assert.equal(result.rohumsatzRows.length, 2578);
  assert.equal(result.rohumsatzRows[0].Betrag, -4501);
});
```

**Expected RED:**

```text
FAIL parseGermanAmount is not defined
```

**Minimal GREEN:**

Implement Parser fuer genau dieses CSV-Format.

<!-- Fix: Abhängigkeit Task 3 → Task 6 -->
### Task 2.5: Verifier-Skelett anlegen (Stub für Task 3)

**Zweck:** Task 3 importiert `inspectWorkbookTables` aus `artifactVerifier.mjs`, der aber erst in Task 6 vollständig gebaut wird. Dieser Mini-Schritt legt ein Stub-Skelett an, das genau genug exportiert, damit Task 3 kompiliert und sein Test rot wird. Der echte Verifier bleibt in Task 6 unverändert.

**Dateien später:**

- Create: `workbook-build/src/artifactVerifier.mjs` (Stub — wird in Task 6 vollständig ersetzt)

**Stub-Inhalt:**

```js
// src/artifactVerifier.mjs — STUB, angelegt in Task 2.5, vollständige Implementierung in Task 6.

/** Stub: Wird in Task 6 implementiert. */
export async function inspectWorkbookTables(_workbook, _opts = {}) {
  throw new Error("inspectWorkbookTables: not yet implemented (Task 6)");
}

/** Stub: Wird in Task 6 implementiert. */
export async function verifyArtifact(_workbook, _opts = {}) {
  throw new Error("verifyArtifact: not yet implemented (Task 6)");
}

/** Stub: Wird in Task 6 / Task 9 implementiert. */
export async function inspectStyles(_workbook) {
  throw new Error("inspectStyles: not yet implemented (Task 6)");
}
```

**Erwartetes Verhalten:** Task 3 kann den Import zur Compile-Zeit auflösen. Der Test wirft zur Laufzeit den Stub-Fehler — das ist das gewünschte RED.

---

### Task 3: Workbook-Skelett und initiale Inhalte testen

**Dateien spaeter:**

- Create: `workbook-build/src/buildWorkbook.mjs`
- Create: `workbook-build/src/seedData.mjs`
- Create: `workbook-build/tests/buildWorkbook.test.mjs`

**Failing Tests zuerst:**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkbook } from "../src/buildWorkbook.mjs";
import { inspectWorkbookTables } from "../src/artifactVerifier.mjs";

test("build creates documented core tables with required columns", async () => {
  const workbook = await buildWorkbook({ fixture: "empty" });
  const tables = await inspectWorkbookTables(workbook);

  assert.deepEqual(tables["01_Personen"].columns, [
    "Person_ID",
    "Name_Rolle",
    "Typ",
    "Geburtsdatum",
    "Alter_aktuell",
    "Renteneintritt_alter",
    "Status",
    "Kommentar",
  ]);

  assert.ok(tables["99_Checks"].columns.includes("Check_ID"));
  assert.ok(tables["99_Checks"].columns.includes("Statuslogik"));
});

test("seed data contains documented V1 checks", async () => {
  const workbook = await buildWorkbook({ fixture: "empty" });
  const checks = await inspectWorkbookTables(workbook, { tableName: "99_Checks" });
  const ids = checks.rows.map((row) => row.Check_ID);
  assert.deepEqual(ids.slice(0, 18), [
    "CHK001", "CHK002", "CHK003", "CHK004", "CHK005", "CHK006",
    "CHK007", "CHK008", "CHK009", "CHK010", "CHK011", "CHK012",
    "CHK013", "CHK014", "CHK015", "CHK016", "CHK017", "CHK018",
  ]);
});
```

**Expected RED:**

```text
FAIL buildWorkbook is not defined
```

**Minimal GREEN:**

Create workbook, sheets, tables and documented seed rows.


<!-- Fix: Abhängigkeit Task 4 → Task 5 -->
### Task 3.5: Fixture-Stubs für Task 4 anlegen

**Zweck:** Task 4 ruft `buildWorkbook({ fixture: "uncategorized_high" })` und `buildWorkbook({ fixture: "liquidity_failure" })` auf, die erst in Task 5 vollständig definiert werden. Dieser Mini-Schritt legt minimale Stubs in `qaFixtures.mjs` an — genug Struktur, damit Task 4 laufen kann, aber kein echter Inhalt.

**Dateien später:**

- Create: `workbook-build/src/qaFixtures.mjs` (Stubs — vollständige Implementierung in Task 5)

**Stub-Inhalt:**

```js
// src/qaFixtures.mjs — STUBS für uncategorized_high und liquidity_failure.
// Vollständige Fixture-Implementierung folgt in Task 5.

const STUB_FIXTURES = {
  uncategorized_high: {
    tables: {},    // Stub: kein echter Inhalt
    _stub: true,
  },
  liquidity_failure: {
    tables: {},    // Stub: kein echter Inhalt
    _stub: true,
  },
};

/** Gibt einen Fixture-Datensatz zurück. Stubs werfen in buildWorkbook einen Fehler,
 *  sodass Task 4 zur Laufzeit ROT bleibt, aber kompiliert. */
export function createFixture(name) {
  if (!(name in STUB_FIXTURES)) {
    throw new Error(`createFixture: unknown fixture "${name}"`);
  }
  if (STUB_FIXTURES[name]._stub) {
    throw new Error(`createFixture: fixture "${name}" is a stub — implement in Task 5`);
  }
  return STUB_FIXTURES[name];
}
```

**Erwartetes Verhalten:** Task 4 kompiliert. `buildWorkbook({ fixture: "uncategorized_high" })` wirft den Stub-Fehler — das ist das gewünschte RED.

---

### Task 4: Formel- und Checklogik testen

**Dateien spaeter:**

- Create: `workbook-build/src/formulas.mjs`
- Create: `workbook-build/tests/formulas.test.mjs`
- Extend: `workbook-build/tests/artifactRegression.test.mjs`

**Failing Tests zuerst:**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkbook } from "../src/buildWorkbook.mjs";
import { verifyArtifact } from "../src/artifactVerifier.mjs";

test("uncategorized transactions trigger categorization checks", async () => {
  const workbook = await buildWorkbook({ fixture: "uncategorized_high" });
  const report = await verifyArtifact(workbook);
  assert.equal(report.checks.CHK003.status, "Warnung");
  assert.equal(report.checks.CHK004.status, "Warnung");
});

test("negative liquidity produces red model status", async () => {
  const workbook = await buildWorkbook({ fixture: "liquidity_failure" });
  const report = await verifyArtifact(workbook);
  assert.equal(report.checks.CHK016.status, "Fehler");
  assert.equal(report.dashboard.Modellstatus, "Rot");
});
```

**Expected RED:**

```text
FAIL fixture uncategorized_high is not defined
```

**Minimal GREEN:**

Add fixture generator and formulas for the affected checks.

<!-- formulas.mjs Spezifikation -->
#### `formulas.mjs` — Dashboard-KPI-Definitionen (V1)

Dieser Unterabschnitt legt die verbindliche fachliche Logik fuer alle KPIs fest, die `formulas.mjs` implementiert und `formulas.test.mjs` prueft. Die Definitionen wurden in der Designdiskussion festgelegt und sind die Grundlage fuer Builder, Verifier und QA-Fixtures.

##### `Liquiditaet_heute`

```text
Liquiditaet_heute =
  Summe aller aktuellen Saldos aus 03_Konten vom Typ Girokonto
  + Summe aller aktuellen Saldos aus 03_Konten vom Typ Tagesgeld
  + Depot-Cashwert (Verkaufswert der liquidierbaren Positionen)

Nicht enthalten:
  Immobilienwerte — zu komplex fuer V1, vorgesehen fuer Szenarien-Feature.
```

Datenquelle: `03_Konten` (gefiltert nach Kontotyp). Depots fliessen ein, weil verkaeuflich. Immobilien werden bewusst ausgeschlossen.

##### `Cashflow_Monat_ist`

```text
Cashflow_Monat_ist =
  SUMME aller Buchungen in 10_Umsaetze_Roh
  mit Buchungsdatum im laufenden Kalendermonat
  (Einnahmen positiv, Ausgaben negativ)
```

Datenquelle: `10_Umsaetze_Roh.Betrag` gefiltert auf `Buchungsdatum >= Monatsanfang AND Buchungsdatum <= heute`.

##### `Cashflow_Monat_erwartet`

```text
Cashflow_Monat_erwartet =
  Offene_Regelzahlungen_diesen_Monat
  + Variable_Kategorien_Schaetzwert_netto

Offene_Regelzahlungen_diesen_Monat:
  Zeilen aus 12_Regelzahlungen, die:
  - Startdatum <= Ende_des_Monats
  - Enddatum >= heute (oder leer)
  - noch NICHT in 10_Umsaetze_Roh als Buchung diesen Monat erscheinen

Variable_Kategorien_Schaetzwert_netto (je Kategorie):
  Schaetzwert_brutto = Ø letzte 3 Monate × 0,75 + gleicher Monat Vorjahr × 0,25
  Schaetzwert_netto  = Schaetzwert_brutto − bereits gebuchte variable Ausgaben
                       dieser Kategorie im laufenden Monat
```

Datenquellen: `12_Regelzahlungen`, `10_Umsaetze_Roh`, `11_Umsaetze_Modell` (fuer Kategorienzuordnung).

##### `Cashflow_Monat_gesamt`

```text
Cashflow_Monat_gesamt = Cashflow_Monat_ist + Cashflow_Monat_erwartet
```

Semantik: Prognose des Monatsabschlusses zum aktuellen Zeitpunkt.

##### Runway-Projektion (Basis fuer `43_Zeitachse` und `44_Liquiditaet`)

Monatliche Vorwaertsrechnung ab heute:

```text
Je Monat M:
  Einnahmen_M        = Summe positiver Regelzahlungen aus 12_Regelzahlungen
                       mit Startdatum <= M und (Enddatum >= M oder leer)
  Ausgaben_fix_M     = Summe negativer Regelzahlungen (mit Start-/Enddatum-Pruefung)
  Einmaleffekte_M    = punktuelle Betraege aus 12_Regelzahlungen zum definierten Datum
  Ausgaben_var_M     = gewichteter Kategorien-Schaetzwert (75/25, s.o.)
  Netto_M            = Einnahmen_M − |Ausgaben_fix_M| − |Ausgaben_var_M| + Einmaleffekte_M

Kumuliertes_Vermoegen_M = Liquiditaet_heute + SUMME(Netto_1 … Netto_M)

Reichweite = erster Monat M, in dem Kumuliertes_Vermoegen_M <= 0
```

##### Check-Schwellenwerte (Runway)

| Check-ID | Typ | Bedingung | Schwellenwert |
|---|---|---|---|
| `CHK003` | Warnung | Runway < 12 Monate | < 12 |
| `CHK016` | Fehler (Rot) | Runway < 6 Monate | < 6 |
| — | Sofortfehler | Laufender Monat bereits negativ | `Cashflow_Monat_gesamt < 0` bei gleichzeitig `Liquiditaet_heute <= 0` |

Schwellenwerte sind vorlaeuftg und koennen in `42_Annahmen` parametrisiert werden.

---

### Task 5: Testdatengenerator bauen

**Dateien spaeter:**

- Create: `workbook-build/src/qaFixtures.mjs`
- Create: `workbook-build/tests/qaFixtures.test.mjs`

**Fixture-Katalog:**

| Fixture | Zweck | Erwartung |
|---|---|---|
| `minimal` | Leere, aber baubare Startmappe | Modellstatus Gelb wegen Platzhaltern/offenen Basisdaten |
| `cashflow_normal` | 12 Monate normale Umsaetze | Cashflow aggregiert korrekt |
| `uncategorized_high` | hoher Anteil `KAT013` | `CHK003` und `CHK004` warnen |
| `transfer_candidates` | eigene Umbuchungen | nur Kandidaten, keine bestaetigte Neutralisierung |
| `missing_sources` | kritische Werte ohne Quelle | `CHK010` warnt |
| `overlapping_assumptions` | Annahmen ueberlappen | `CHK013` warnt |
| `liquidity_failure` | liquide Mittel negativ | `CHK016` Fehler, Dashboard Rot |
| `regular_payment_variance` | fehlende/doppelte/abweichende Regelzahlungen | `CHK006` bis `CHK009` reagieren |
| `agent_import_replay` | Import zweimal ausgefuehrt | keine doppelten Netto-Rohdaten |
| `agent_implementation_idempotency` | Vorschlag zweimal umgesetzt | genau eine Zielzeile |
| `checked_assumption_new_external_value` | Ein Vorschlag, dessen Annahme einen neuen externen Wert in einer Quelltabelle erzeugt — testet den Umsetzungs-Agenten-Pfad in Task 7 | Recherche-Agent erzeugt neue Annahmenzeile oder Vorschlag; bestehende gepruefter Wert bleibt unveraendert | <!-- Fix: Baubarkeit-Nachlieferung -->
| `formula_error` <!-- Fix: Abhängigkeit Task 6 → Task 5 --> | Mappe mit mindestens einer absichtlich kaputten Formel (z.B. `#REF!`-Zelle) | `verifyArtifact` erkennt Fehler, `report.formulaErrors.length > 0`, `report.passed === false` |

**Failing Test zuerst:**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createFixture } from "../src/qaFixtures.mjs";

test("fixtures are deterministic", () => {
  assert.deepEqual(createFixture("cashflow_normal"), createFixture("cashflow_normal"));
});

test("liquidity_failure fixture contains a negative ending liquidity year", () => {
  const fixture = createFixture("liquidity_failure");
  assert.ok(fixture.tables["44_Liquiditaet"].some((row) => row.Liquide_Mittel_Ende < 0));
});
```

### Task 6: Artefakt-Verifikation testen

**Dateien spaeter:**

- Create: `workbook-build/src/artifactVerifier.mjs`
- Create: `workbook-build/tests/artifactRegression.test.mjs`

**Verifikationen:**

- `.xlsx` importierbar.
- Alle Pflichtblaetter vorhanden.
- Alle Pflichtspalten vorhanden.
- Keine Formel-Fehler in Key-Ranges.
- Dashboardwerte stimmen gegen unabhaengig berechnete Erwartungswerte.
- `99_Checks` zeigt erwartete Status.
- `60_Warnungen` respektiert `Warnungs_Fingerprint`.
- Render-Pruefung fuer Dashboard, Cashflow, Liquiditaet, Warnungen, Quellen und Checks.
- `CHK-PERS-01` (FAIL): Jede Zeile mit `Person_ID = HH` muss eine matchende Transferregel mit `auto_person_id: HH` haben. Verstoß = Waise ohne Regeldeckung. <!-- Fix: Person_ID Konvention + CHK-PERS -->
- `CHK-PERS-02` (FAIL): Transferregeln mit `auto_person_id: HH`, die auf keine einzige Zeile in `10_Umsaetze_Roh` matchen — entweder veraltet oder Pattern fehlerhaft. <!-- Fix: Person_ID Konvention + CHK-PERS -->
- `CHK-PERS-03` (INFO, kein FAIL): Coverage-Report — Anteil der Transaktionen mit `Person_ID = leer` als Prozentwert. Nur informativer Output, kein Schwellenwert. <!-- Fix: Person_ID Konvention + CHK-PERS -->
- `CHK-SUG-01` (FAIL): Jede `SUG-`-ID in `12_Regelzahlung_Vorschlaege` hat genau einen Gegeneintrag in `73_Agent_Vorschlaege` mit identischem Status — und umgekehrt. <!-- Fix: SUG-ID Konvention + CHK-SUG-01 -->

<!-- Fix: CHK-PERS in 99_Checks -->
<!-- Fix: SUG-ID Konvention + CHK-SUG-01 -->
> **Builder-Hinweis:** Der Builder traegt `CHK-PERS-01`, `CHK-PERS-02`, `CHK-PERS-03` und `CHK-SUG-01` beim Workbook-Aufbau auch als Seed-Zeilen in `99_Checks` ein — konsistent mit `CHK001` bis `CHK018`.

**Failing Test zuerst:**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkbook } from "../src/buildWorkbook.mjs";
import { verifyArtifact } from "../src/artifactVerifier.mjs";

test("artifact verifier fails when formula errors are present", async () => {
  const workbook = await buildWorkbook({ fixture: "formula_error" });
  const report = await verifyArtifact(workbook);
  assert.equal(report.formulaErrors.length > 0, true);
  assert.equal(report.passed, false);
});

test("artifact verifier passes clean minimal build with documented open issues", async () => {
  const workbook = await buildWorkbook({ fixture: "minimal" });
  const report = await verifyArtifact(workbook);
  assert.equal(report.formulaErrors.length, 0);
  assert.equal(report.requiredSheetsPresent, true);
  assert.equal(report.dashboard.Modellstatus, "Gelb");
});
```

#### Erweiterung: Dual-Run gegen beide Inspector-Implementierungen

Ziel: Alle 10 QA-Fixtures aus Task 5 werden sowohl mit dem `ArtifactToolInspector` (Codex) als auch mit dem `ExceljsInspector` ausgefuehrt. Die Ergebnisse werden verglichen, um implementierungsbedingte Abweichungen sichtbar zu machen.

**Neue Dateien:**

- Create: `workbook-build/src/artifactToolInspector.mjs`
- Create: `workbook-build/src/exceljsInspector.mjs`
- Create: `workbook-build/src/workbookInspector.mjs` (Interface-Doku als JSDoc)
- Extend: `workbook-build/tests/artifactRegression.test.mjs`

**Failing Test zuerst:**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkbook } from "../src/buildWorkbook.mjs";
import { verifyArtifact } from "../src/artifactVerifier.mjs";
import { ArtifactToolInspector } from "../src/artifactToolInspector.mjs";
import { ExceljsInspector } from "../src/exceljsInspector.mjs";

const FIXTURES = [
  "minimal",
  "cashflow_normal",
  "uncategorized_high",
  "transfer_candidates",
  "missing_sources",
  "overlapping_assumptions",
  "liquidity_failure",
  "regular_payment_variance",
  "agent_import_replay",
  "agent_implementation_idempotency",
];

for (const fixture of FIXTURES) {
  test(`dual-run: ArtifactToolInspector vs ExceljsInspector — fixture "${fixture}"`, async () => {
    const workbook = await buildWorkbook({ fixture });
    const exportPath = `./outputs/${fixture}.xlsx`;
    await workbook.exportToFile(exportPath);

    const reportCodex = await verifyArtifact(workbook, {
      inspector: new ArtifactToolInspector(workbook),
    });
    const reportExceljs = await verifyArtifact(workbook, {
      inspector: new ExceljsInspector(exportPath),
    });

    // Beide muessen dieselben Pflichtblaetter und Pflichtspalten sehen
    assert.equal(reportExceljs.requiredSheetsPresent, reportCodex.requiredSheetsPresent);
    assert.deepEqual(reportExceljs.missingSheets, reportCodex.missingSheets);

    // Beide muessen denselben Modellstatus lesen
    assert.equal(reportExceljs.dashboard.Modellstatus, reportCodex.dashboard.Modellstatus);

    // Formel-Fehler-Listen sollen uebereinstimmen (exceljs liest gecachte Werte)
    assert.deepEqual(
      reportExceljs.formulaErrors.sort(),
      reportCodex.formulaErrors.sort(),
    );
  });
}
```

**Expected RED:**

```text
FAIL ArtifactToolInspector is not defined
```

**Minimal GREEN:**

Beide Inspector-Klassen implementieren das `WorkbookInspector`-Interface. Der Dual-Run bestaetigt, dass Codex- und exceljs-Sicht auf dieselben Fixture-Artefakte uebereinstimmen.

### Task 7: Agenten-Compliance-Harness testen

**Dateien spaeter:**

- Create: `workbook-build/src/agentComplianceHarness.mjs`
- Create: `workbook-build/tests/agentCompliance.test.mjs`

**Ziel:**

Pruefen, ob Agenten-Anweisungen so eindeutig sind, dass simulierte Agentenlaeufe keine verbotenen Aenderungen erzeugen.

**Compliance-Regeln Import-Agent:**

- Darf `10_Importlaeufe`, `10_Umsaetze_Roh`, `11_Umsaetze_Modell`, `90_Quellen`, `71_Agent_Auftraege`, `73_Agent_Vorschlaege`, `74_Agent_Laufprotokoll` schreiben.
- Darf keine final bestaetigten Regelzahlungen erzeugen.
- Darf keine final bestaetigten Transferregeln erzeugen.
- Darf `Status = geprueft` nicht setzen.
- Darf Rohdaten nicht veraendern, sondern nur importieren und markieren.

**Compliance-Regeln Analyse-Agent:**

- Darf Vorschlaege und Auftraege erzeugen.
- Darf `12_Regelzahlungen.Status = bestaetigt` nicht setzen.
- Darf `11_Transferregeln.Status = bestaetigt` nicht setzen.
- Darf `11_Umsaetze_Modell.Transfer_Status = bestaetigter_transfer` nicht setzen.
- Darf keine Szenario- oder Annahmenwerte still veraendern.

**Compliance-Regeln Recherche-Agent:**

- Muss Quelle, Standdatum und bei externen Abrufen `Abrufdatum` dokumentieren.
- Darf belegte/gepruefte Werte nicht still ueberschreiben.
- Muss neue Annahmen historisieren oder Vorschlag erzeugen.
- Darf ohne Quelle keinen Wert als `belegt` oder `geprueft` setzen.

**Compliance-Regeln Umsetzungs-Agent:**

- Darf nur `Status = angenommen` umsetzen.
- Darf nur umsetzen, wenn `Umsetzung_Eindeutig = ja`.
- Muss idempotent sein.
- Muss `Umsetzungsstatus`, `Umsetzungsauftrag_ID`, `Umsetzung_Zieltabelle` und `Umsetzung_Ziel_ID` aktualisieren.
- Muss bei Unklarheit `nicht_umsetzbar` oder offenen Auftrag setzen, ohne Zieltabellen zu aendern.

**Failing Tests zuerst:**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { runAgentSimulation } from "../src/agentComplianceHarness.mjs";

test("analysis agent cannot activate final rule payments", async () => {
  const result = await runAgentSimulation({
    role: "Pruef-Agent",
    fixture: "regular_payment_variance",
    methodikId: "METH_ANALYSE_REGELZAHLUNGEN",
  });

  assert.equal(result.violations.length, 0);
  assert.equal(result.tables["12_Regelzahlungen"].some((row) => row.Status === "bestaetigt"), false);
  assert.ok(result.tables["73_Agent_Vorschlaege"].length > 0);
});

test("implementation agent is idempotent for accepted proposal", async () => {
  const first = await runAgentSimulation({
    role: "Umsetzungs-Agent",
    fixture: "agent_implementation_idempotency",
    methodikId: "METH_UMSETZUNG_VORSCHLAG",
  });
  const second = await runAgentSimulation({
    role: "Umsetzungs-Agent",
    state: first.state,
    methodikId: "METH_UMSETZUNG_VORSCHLAG",
  });

  assert.equal(first.violations.length, 0);
  assert.equal(second.violations.length, 0);
  assert.equal(second.createdTargetRows.length, 0);
});

test("research agent cannot overwrite checked assumption silently", async () => {
  const result = await runAgentSimulation({
    role: "Recherche-Agent",
    fixture: "checked_assumption_new_external_value",
    methodikId: "METH_RECHERCHE_EXTERNE_WERTE",
  });

  assert.equal(result.violations.length, 0);
  assert.equal(result.originalRows["42_Annahmen:A001"].Wert, 0.025);
  assert.ok(result.tables["73_Agent_Vorschlaege"].length >= 1 || result.createdRows["42_Annahmen"].length === 1);
});
```

### Task 8: Subagenten-Rollentests

<!-- Fix: Task 8 Trennung automatisch/manuell -->

**Ziel:**

Neben deterministischen Tests sollen echte Subagenten die Agentenmethodik mit begrenztem Kontext ausfuehren oder auditieren. Das prueft, ob die Anweisungen fuer agentische Arbeit wirklich verstaendlich sind.

Echte Subagenten sind nicht deterministisch und koennen nicht direkt in `node:test` kontrolliert werden. Task 8 wird deshalb klar in zwei Teile getrennt:

---

#### Teil A: Automatisierbarer Teil — Output-Schema-Validierung

<!-- Fix: Task 8 Trennung automatisch/manuell -->

**Was maschinell pruefbar ist:** Hat der Subagenten-Output die Pflichtfelder? Ist das JSON valide? Enthaelt er verbotene Tabellen?

Der Mechanismus: Der Subagent wird manuell ausgefuehrt, sein Output wird als JSON-Snapshot in `tests/fixtures/subagent_snapshots/` abgelegt. Der `node:test`-Test laeuft dann deterministisch gegen diesen Snapshot.

**Dateien spaeter:**

- Create: `workbook-build/src/subagentOutputSchema.mjs`
- Create: `workbook-build/tests/subagentOutputSchema.test.mjs`
- Create: `workbook-build/tests/fixtures/subagent_snapshots/*.json` (je Rolle ein Snapshot)

**Output-Schema pro Rolle:**

```js
// src/subagentOutputSchema.mjs
export const REQUIRED_FIELDS = {
  "Import-Agent":      ["lauf_id", "importlauf", "rohumsatz_rows", "modell_rows", "laufprotokoll"],
  "Pruef-Agent":       ["lauf_id", "vorschlaege", "warnungen", "laufprotokoll"],
  "Recherche-Agent":   ["lauf_id", "quellen", "annahmen_oder_vorschlaege", "laufprotokoll"],
  "Umsetzungs-Agent":  ["lauf_id", "umgesetzte_vorschlaege", "laufprotokoll"],
};

export const FORBIDDEN_TABLES = {
  "Import-Agent":      ["12_Regelzahlungen_bestaetigt", "11_Transferregeln_bestaetigt"],
  "Pruef-Agent":       ["12_Regelzahlungen_bestaetigt", "11_Umsaetze_Modell_Transfer_bestaetigt"],
  "Recherche-Agent":   [],   // Regeln: kein stilles Ueberschreiben — pruefbar ueber Status-Feld
  "Umsetzungs-Agent":  [],   // Regeln: Idempotenz — pruefbar ueber created_target_rows
};
```

**Failing Test zuerst:**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REQUIRED_FIELDS, FORBIDDEN_TABLES } from "../src/subagentOutputSchema.mjs";

// Snapshot-Dateien werden manuell aus echten Subagenten-Laeufen erzeugt (siehe Teil B).
// Solange sie nicht existieren, schlaegt readFileSync fehl — das ist das gewuenschte RED.
const SNAPSHOTS = [
  { role: "Import-Agent",     file: "import_agent_replay.json" },
  { role: "Pruef-Agent",      file: "pruef_agent_regelzahlung.json" },
  { role: "Pruef-Agent",      file: "pruef_agent_transfer.json" },
  { role: "Recherche-Agent",  file: "recherche_agent_assumption.json" },
  { role: "Umsetzungs-Agent", file: "umsetzungs_agent_idempotency_run1.json" },
  { role: "Umsetzungs-Agent", file: "umsetzungs_agent_idempotency_run2.json" },
];

for (const { role, file } of SNAPSHOTS) {
  test(`subagent output schema valid — ${file}`, () => {
    const raw = readFileSync(`./tests/fixtures/subagent_snapshots/${file}`, "utf8");
    const output = JSON.parse(raw); // wirft bei fehlendem oder invalidem JSON

    for (const field of REQUIRED_FIELDS[role]) {
      assert.ok(field in output, `missing required field: ${field}`);
    }

    for (const table of FORBIDDEN_TABLES[role]) {
      assert.ok(!(table in output), `forbidden table present in output: ${table}`);
    }
  });

  // Idempotenz-Sonderfall: zweiter Umsetzungs-Lauf darf keine neuen Zielzeilen erzeugen
  if (file === "umsetzungs_agent_idempotency_run2.json") {
    test("umsetzungs-agent run2 creates no new target rows (idempotency)", () => {
      const raw = readFileSync(`./tests/fixtures/subagent_snapshots/${file}`, "utf8");
      const output = JSON.parse(raw);
      assert.equal(output.created_target_rows?.length ?? 0, 0);
    });
  }
}
```

**Expected RED:**

```text
FAIL ENOENT: no such file or directory — tests/fixtures/subagent_snapshots/import_agent_replay.json
```

**Minimal GREEN:**

Snapshots aus Teil-B-Laeufen ablegen. Schema-Pruefung wird gruen, sobald alle Pflichtfelder vorhanden und keine verbotenen Tabellen enthalten sind.

---

#### Teil B: Zwei-Agenten-QA-Pipeline — fachliche Qualitaetspruefung

<!-- Fix: Task 8 Zwei-Agenten-Pipeline -->

**Was echte Subagenten-Ausfuehrung erfordert und nicht maschinell abschliessend pruefbar ist:** Sind die Regelzahlungsmuster fachlich korrekt erkannt? Ist die Kategorisierungsqualitaet akzeptabel? Sind die Vorschlaege fachlich sinnvoll?

Dieser Schritt liegt **ausserhalb von `node:test`** und wird durch eine Zwei-Agenten-Pipeline ausgefuehrt. Die Snapshots aus Subagent 1 werden anschliessend als Eingabe fuer Teil A verwendet.

---

##### Subagent 1 — Test-Runner

**Aufgabe:** Ausfuehren der zu testenden Subagenten-Tasks und protokolliertes Ablegen der Outputs. Keine Bewertung.

**Ausgefuehrte Tasks:**

- CSV-Import (Fixture `agent_import_replay`)
- Kategorisierungsvorschlaege (Fixture `regular_payment_variance`)
- Regelzahlungsmuster-Erkennung (Fixture `regular_payment_variance`, `transfer_candidates`)

**Ablauf:**

1. Frischen Subagenten ohne Session-Kontext starten.
2. Nur relevante Markdown-Dateien und das jeweilige Fixture-Szenario uebergeben.
3. Agent gibt strukturierte JSON-Ausgabe gemaess Schema aus Teil A.
4. Ausgabe **unveraendert** als Snapshot ablegen unter `tests/fixtures/subagent_snapshots/`.
5. Kein Urteil, keine Interpretation — nur Ausfuehrung und Protokollierung.

**Subagenten-Testmatrix:**

| Rolle | Fixture | Erwartete Ausgabe |
|---|---|---|
| Import-Agent | `agent_import_replay` | Importlauf, Rohzeilen, Modellzeilen, keine finalen Regeln |
| Pruef-Agent | `regular_payment_variance` | Vorschlaege/Warnungen, keine Aktivierungen |
| Pruef-Agent | `transfer_candidates` | Transferkandidaten, keine bestaetigten Transfers |
| Recherche-Agent | `checked_assumption_new_external_value` | Quelle plus neue Annahmenzeile oder Vorschlag, kein stilles Ueberschreiben |
| Umsetzungs-Agent | `agent_implementation_idempotency` | genau eine Zielaenderung, zweiter Lauf ohne neue Zielzeile |

---

##### Subagent 2 — Reviewer

**Aufgabe:** Strukturelle und fachliche Pruefung der Snapshots aus Subagent 1 anhand der Bewertungskriterien unten. Ausgabe eines strukturierten Reports mit PASS/FAIL pro Kriterium.

**Eingabe:** Snapshot-JSON aus `tests/fixtures/subagent_snapshots/` + Bewertungskriterien unten.

**Strukturelle Pruefung (maschinell auswertbar):**

- Alle Pflichtfelder gemaess `REQUIRED_FIELDS` vorhanden.
- Keine verbotenen Tabellen gemaess `FORBIDDEN_TABLES` enthalten.
- JSON valide und vollstaendig parsebar.
- Idempotenz: `umsetzungs_agent_idempotency_run2.json` enthaelt `created_target_rows.length === 0`.

**Fachliche Pruefung (soweit automatisch beurteilbar):**

- Plausibilitaet der Kategorisierungsvorschlaege (Vorschlag-Typ passt zu Transaktion).
- Regelzahlungsmuster: Muster-ID, Betrag und Periodizitaet konsistent mit Fixture-Daten.
- Keine final bestaetigten Zustaende wo nur Kandidaten erwartet werden.

**Report-Format (strukturiertes JSON):**

```json
{
  "snapshot": "<dateiname>",
  "role": "<Rolle>",
  "criteria": [
    {
      "id": "<Kriterium-ID>",
      "label": "<Bezeichnung>",
      "result": "PASS | FAIL | HUMAN_REQUIRED",
      "detail": "<Begruendung oder Fundstelle im Snapshot>"
    }
  ],
  "overall": "PASS | FAIL | HUMAN_REQUIRED",
  "escalations": [
    "<Kriterium-ID: Begruendung warum Mensch noetig>"
  ]
}
```

**Eskalationskette:** Jedes Kriterium, das fachliches Urteil erfordert, wird mit `"result": "HUMAN_REQUIRED"` markiert und in `escalations` begruendet. Kein FAIL ohne Begruendung.

---

##### Bewertungskriterien fuer Subagent 2

Die folgende Checkliste definiert die Pruefpunkte, gegen die Subagent 2 jeden Snapshot bewertet. Jeder Punkt wird zu einem `criteria`-Eintrag im Report.

```
Import-Agent / agent_import_replay
  [ ] K-IMP-01  Importlauf-Metadaten vollstaendig und korrekt befuellt
  [ ] K-IMP-02  Rohumsaetze vollzaehlig und ohne Datenverlust
  [ ] K-IMP-03  Modellzeilen haben Initialwerte gemaess Abschnitt 7
  [ ] K-IMP-04  Keine Zeile hat Status = geprueft oder bestaetigt
  [ ] K-IMP-05  Laufprotokoll-Eintrag vorhanden

Pruef-Agent / regular_payment_variance
  [ ] K-PRV-01  Erkannte Regelzahlungsmuster fachlich plausibel         (HUMAN_REQUIRED)
  [ ] K-PRV-02  Vorschlaege referenzieren korrekte Quell-IDs
  [ ] K-PRV-03  Kein Vorschlag setzt 12_Regelzahlungen.Status = bestaetigt
  [ ] K-PRV-04  Warnungen haben korrekte Fingerprints

Pruef-Agent / transfer_candidates
  [ ] K-TRF-01  Transferkandidaten identifiziert, keine bestaetigten Transfers
  [ ] K-TRF-02  11_Umsaetze_Modell.Transfer_Status bleibt transfer_kandidat

Recherche-Agent / checked_assumption_new_external_value
  [ ] K-REC-01  Neue Quelle mit Abrufdatum dokumentiert
  [ ] K-REC-02  Bestehende gepruefter Annahme nicht still ueberschrieben
  [ ] K-REC-03  Neue Annahmenzeile oder Vorschlag erzeugt

Umsetzungs-Agent / agent_implementation_idempotency
  [ ] K-UMS-01  Erster Lauf: genau eine Zielaenderung
  [ ] K-UMS-02  Zweiter Lauf: keine neuen Zielzeilen
  [ ] K-UMS-03  Umsetzungsstatus, Umsetzungsauftrag_ID und Umsetzung_Ziel_ID gesetzt

Jede unklare oder divergierende Interpretation:
  [ ] K-ESK-01  Als Spezifikationsluecke in Finanzmodell_Entscheidungsprotokoll.md dokumentiert
```

Kriterien mit `(HUMAN_REQUIRED)` koennen von Subagent 2 nicht abschliessend beurteilt werden und werden immer eskaliert.

### Task 9: Format- und Layouttests

**Dateien spaeter:**

- Create: `workbook-build/src/styles.mjs`
- Extend: `workbook-build/tests/artifactRegression.test.mjs`

**Stil-Konventionen:**

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
| Tabellenlinien | duenne helle Linien |

**Layout-Regeln:**

- Dashboard-Reihenfolge:
  - Modellstatus
  - Vermoegen und Liquiditaet
  - Cashflow heute
  - Arbeitsende und Reichweite
  - Top-Warnungen
  - Agenten-To-dos
- Detailblaetter:
  - oben kompakter Kennzahlen-/Statusbereich
  - darunter strukturierte Tabellen
  - Freeze Panes unter dem Kennzahlenbereich
- Keine hellgraue relevante Schrift auf weissem Hintergrund.
- Keine verschachtelten Karten.
- Keine ueberbreiten Autofit-Spalten.

**Failing Test zuerst:**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkbook } from "../src/buildWorkbook.mjs";
import { inspectStyles } from "../src/artifactVerifier.mjs";

test("input and formula style conventions are applied", async () => {
  const workbook = await buildWorkbook({ fixture: "minimal" });
  const styles = await inspectStyles(workbook);
  assert.equal(styles.roles.input.fontColor, "#0000FF");
  assert.equal(styles.roles.formula.fontColor, "#000000");
  assert.equal(styles.roles.externalSource.fontColor, "#C00000");
});
```

## Reihenfolge der Umsetzung

1. Spezifikationsluecken als V1-Konventionen dokumentieren.
2. Tests fuer `workbookSpec` schreiben und RED sehen.
3. Minimalen `workbookSpec` implementieren und GREEN sehen.
4. CSV-Parser-Tests schreiben und RED sehen.
5. CSV-Parser implementieren und GREEN sehen.
6. Workbook-Skelett-Tests schreiben und RED sehen.
7. Workbook-Skelett implementieren und GREEN sehen.
8. Seed-Daten und Tabellenkommentare testen und implementieren.
9. Formel- und Checktests schreiben und implementieren.
10. Testdatengenerator bauen.
11. Artefakt-Verifier bauen.
12. Agenten-Compliance-Harness bauen.
13. Subagentenrollen gegen Fixtures testen.
14. Layout- und Render-Pruefung ergaenzen.
15. Vollstaendigen QA-Lauf ausfuehren.
16. Erst danach `.xlsx` als Version 1 exportieren.

## Abschlusskriterien fuer die spaetere Excel-Version

Die Mappe gilt erst als baubar, wenn:

- alle Builder-Tests gruen sind,
- alle Artefakt-Regressionstests gruen sind,
- alle Agenten-Compliance-Tests gruen sind,
- die Subagenten-Rollentests keine ungeklaerten Methodikluecken zeigen,
- die Produktivmappe keine Formel-Fehler in Key-Ranges enthaelt,
- `99_Checks` erwartungsgemaess Gelb/Rot fuer offene Platzhalter und fehlende Daten zeigt,
- Dashboard und Detailblaetter gerendert und visuell geprueft wurden,
- offene fachliche Einschraenkungen sichtbar im Workbook stehen.

## Nicht-Ziele fuer Version 1

- Kein dauerhaft laufender Agentenprozess.
- Keine automatische finale Kategorisierung durch Agenten.
- Keine automatische Aktivierung neuer Regelzahlungen.
- Keine automatische Bestaetigung interner Transfers.
- Keine echte Portfolio-XIRR- oder Benchmark-Analyse.
- Kein vollstaendiges Steuer- oder Sozialrechtsmodell.

## Ergebnis der Subagenten-Audits

Die Subagenten-Audits bestaetigen:

- Die Rollenlogik ist grundsaetzlich verstaendlich.
- Die Import-, Analyse-, Recherche- und Umsetzungsgrenzen sind fachlich richtig.
- Fuer deterministische Ausfuehrung fehlen aber noch technische Konventionen.

Die wichtigsten aufgenommenen Praezisierungen sind:

- ID-Schema.
- CSV-Mapping.
- Zeilenhash und Deduplikation.
- Quelle fuer CSV-Importe.
- `Abrufdatum` fuer externe Recherche.
- vereinheitlichte Statuswerte.
- Update-Modi pro Tabelle.
- schlanke Umsetzungsfelder in `73_Agent_Vorschlaege`.
- Warnungs- und Vorschlagsfingerprints.
- Idempotenzregeln.
- Agenten-Compliance-Tests.
- Subagenten-Rollentests als Methodik-QA.

# Finanzmodell - Handover

Stand: 19.05.2026

## Zweck

Dieses Handover ist der Einstiegspunkt fuer die naechste Session. Es enthaelt nur die anstehenden Aufgaben, warum sie als naechstes wichtig sind, und welche bestehenden Dokumente verbindlich sind.

## Verbindliche Dokumente

1. `Finanzmodell_Entscheidungsprotokoll.md`  
   Enthaelt die Entscheidungshistorie und die Begruendungen. Neue fachliche oder technische Entscheidungen dort als neue Tabellenzeile ergaenzen.

2. `Finanzmodell_Datenmodell.md`  
   Enthaelt die finale Blattstruktur Version 1, Tabellen, Felder, Schluessel, Beziehungen, Modellwirkungen und Regeln.

3. `Finanzmodell_Agentenworkflow.md`  
   Enthaelt Agentenrollen, Import-, Analyse-, Recherche- und Umsetzungsworkflow inklusive Methodiken und 70er-Block.

4. `Finanzmodell_Excel_Bau_und_QA_Plan.md`  
   Enthaelt den technischen Bauplan fuer die Excel-Mappe, TDD-Reihenfolge, Testdatengenerierung, Artefakt-Verifikation, Agenten-Compliance-Tests und Subagenten-Rollentests.

## Ausgangslage fuer die naechste Session

- Die Blattstruktur fuer Version 1 ist final bestaetigt und im Datenmodell dokumentiert.
- Die Dashboard-Reihenfolge und die Dashboard-Inhalte sind finalisiert und dokumentiert.
- Relevante Detailblaetter sollen oben einen kompakten Kennzahlen-/Statusbereich haben; das Dashboard zieht bevorzugt diese kuratierten Zwischenwerte.
- Initiale Tabelleninhalte fuer `01_Personen`, `02_Kategorien`, `40_Szenarien`, `42_Annahmen`, `72_Agent_Pruefregeln` und `99_Checks` sind dokumentiert.
- Der dialogische Init-Workflow `METH_INIT_1ON1` ist dokumentiert. Frueh im Init-Prozess soll je Konto ein grosser historischer Startimport erfolgen, damit Vorschlaege fuer Kategorien, Regelzahlungen, Transfers und Auffaelligkeiten entstehen.
- Die Subagenten-Pruefung der Agentenmethodik wurde ausgewertet; ID-Konventionen, Statuswerte, Fingerprints, Quellenbezug, Idempotenz und Agenten-Compliance sind dokumentiert.
- Der technische Bau- und QA-Plan ist dokumentiert. Die Implementierung soll mit Tests beginnen und die Excel-Datei als reproduzierbares Build-Artefakt erzeugen.
- Als naechstes sollen keine neuen fachlichen Strukturen erfunden werden.
- Ziel ist jetzt, die dokumentierte Spezifikation in eine erste baubare und pruefbare Excel-Mappe zu ueberfuehren.


<!-- Handover-Update 2026-05-19 -->
## Session-Update 19.05.2026

### Was heute erledigt wurde

- **`WorkbookInspector`-Interface eingeführt** (Entscheidung 86): Dual-Implementierung mit zwei Pfaden — primär `@oai/artifact-tool` (Codex-Sandbox), Fallback `ExceljsInspector` (exceljs). Interface ist vollständig definiert.
- **TDD-Abhängigkeitsreihenfolge korrigiert** (Entscheidung 87): Verifier-Skelett jetzt als Task 2.5, Fixture-Stubs als Task 3.5 eingefügt.
- **Task 8 zur Zwei-Agenten-QA-Pipeline ausgebaut** (Entscheidung 88): Runner erstellt Snapshot, Reviewer bewertet PASS / FAIL / HUMAN_REQUIRED.
- **`formulas.mjs` vollständig spezifiziert** (Entscheidungen 94–97): `Liquiditaet_heute`, `Cashflow_Monat_ist/erwartet/gesamt`, Runway-Projektion sowie Check-Schwellenwerte `CHK003` und `CHK016`.
- **Alle Datenmodell-Lücken geschlossen** (Entscheidungen 89–93): `auto_person_id` in `11_Transferregeln`, Update-Modi, Status-Mapping, fehlende Fixtures, TRF-Prefix.
- **Entscheidungsprotokoll**: 12 neue Einträge (Nr. 86–97), Datum 2026-05-19.
- Bau- und QA-Plan vollständig reviewed und bereinigt — Codex kann mit Task 1 beginnen.

### Vorab-Klärung vor Task 1 (Blocking-Check)

`@oai/artifact-tool`-Verfügbarkeit in der Codex-Sandbox muss zu Beginn der nächsten Session bestätigt werden.  
→ **Wenn verfügbar:** primärer Pfad (`ArtifactToolInspector`).  
→ **Wenn nicht verfügbar:** `ExceljsInspector` als primären Pfad nutzen — Interface ist fertig definiert, kein Umbau erforderlich.

### Bekannte konzeptuelle Einschränkung (kein Blocker)

`ExceljsInspector.getFormulaErrors()` liest nur gecachte Zellwerte, wertet Formeln nicht aus. Dual-Run-Vergleich kann deshalb strukturell divergieren. Für V1 dokumentiert und akzeptiert.

### Manuelle Voraussetzung vor Task 2

```bash
cp [Originaldatei] tests/fixtures/csv/girokonto_test.csv
```
Einmalig manuell ausführen — Fixture wird für CSV-Parser-Tests benötigt.

## Anstehende Aufgaben

1. **`@oai/artifact-tool`-Verfügbarkeit prüfen** *(Blocker-Check, vor allem anderen)*  
   Warum: Bestimmt, ob `ArtifactToolInspector` oder `ExceljsInspector` als primärer Pfad genutzt wird. Ohne diese Klärung kann Task 1 nicht korrekt eingerichtet werden.

2. **`girokonto_test.csv` kopieren** *(manuell, einmalig)*  
   Warum: Fixture-Datei wird fuer CSV-Parser-Tests benoetigt. Muss vor Task 2 vorliegen.  
   Befehl: `cp [Originaldatei] tests/fixtures/csv/girokonto_test.csv`

3. **Task 1 starten: Verzeichnisstruktur + `workbookSpec.mjs`** *(erster Codex-Task)*  
   Warum: Die Excel-Datei soll reproduzierbar aus Spezifikation, Builder, Tests und Testdaten entstehen. Aufbau von `workbook-build/` gemaess `Finanzmodell_Excel_Bau_und_QA_Plan.md` — mit Spezifikationstests, CSV-Parser-Tests, Workbook-Builder-Tests, Artefakt-Verifikation und Agenten-Compliance-Tests.  
   Reihenfolge beachten: Task 2.5 (Verifier-Skelett) und Task 3.5 (Fixture-Stubs) sind neu eingefuegt und muessen in der korrekten TDD-Abfolge ausgefuehrt werden.

4. **Initiale Tabellen und Kennzahlenbereiche im Workbook anlegen**  
   Warum: Die Mappe soll direkt bedienbar und pruefbar sein. Besonders wichtig sind:
   - `00_Dashboard`
   - `01_Personen`
   - `02_Kategorien`
   - `03_Konten`
   - `10_Umsaetze_Roh`
   - `11_Umsaetze_Modell`
   - `12_Regelzahlungen`
   - `20_Vermoegen`
   - `30_Cashflow`
   - `40_Szenarien`
   - `42_Annahmen`
   - `44_Liquiditaet`
   - `60_Warnungen`
   - `71_Agent_Auftraege`
   - `72_Agent_Pruefregeln`
   - `73_Agent_Vorschlaege`
   - `74_Agent_Laufprotokoll`
   - `90_Quellen`
   - `99_Checks`

5. **Girokonto-CSV als ersten Startimport verarbeiten**  
   Warum: Der Init-Workflow sieht frueh einen grossen historischen Import je Konto vor. Die vorhandene CSV `16-05-2026_Umsatzliste_Girokonto_DE98120300001061711675.csv` deckt den Zeitraum `01.01.2024 - 16.05.2026` ab. Daraus sollen Rohumsaetze, Importlauf, erste Modellumsaetze sowie Vorschlaege fuer Kategorien, Regelzahlungen, Transfers und Auffaelligkeiten entstehen.

6. **Formel- und Checklogik umsetzen** *(Spezifikation vollstaendig)*  
   Warum: `formulas.mjs` ist vollstaendig spezifiziert (Entscheidungen 94–97). Umzusetzen sind `Liquiditaet_heute`, `Cashflow_Monat_ist/erwartet/gesamt`, Runway-Projektion und Check-Schwellenwerte `CHK003`/`CHK016` in `99_Checks`, `60_Warnungen`, `44_Liquiditaet`, `30_Cashflow` und `20_Vermoegen`.

7. **Workbook verifizieren** *(Zwei-Agenten-QA-Pipeline gemaess Task 8)*  
   Warum: Vor Nutzung muessen Layout, Tabellen, Formeln, Statuslogik, Agenten-Compliance und zentrale Kennzahlen geprueft werden. Runner erstellt Snapshot, Reviewer bewertet PASS / FAIL / HUMAN_REQUIRED. Besonders zu pruefen: Import-Parsen deutscher Datums-/Betragsformate, Dashboard-Ampel, Cashflow-Aggregationen, Liquiditaetsluecke/Reichweite, Artefakt-Regressionstests und Subagenten-Rollentests.

## Arbeitsregeln

- `.DS_Store` ignorieren; nicht loeschen, nicht stagebar machen, nicht als Problem behandeln.
- Mockups nicht als verbindlichen Stand verwenden.
- Neue Entscheidungen im Entscheidungsprotokoll dokumentieren.
- Neue Tabellen, Felder oder Beziehungen im Datenmodell dokumentieren.
- Agentenworkflow-Aenderungen in `Finanzmodell_Agentenworkflow.md` dokumentieren.
- Handover nur auf ausdrueckliche Anfrage aktualisieren.

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

<!-- Handover-Update 2026-05-26 -->
## Session-Update 26.05.2026

### Aktueller Artefaktstand

- Die Build-Pipeline ist laut `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Pipeline_Manifest.json` erfolgreich gelaufen (`status: ok`, generiert am 2026-05-22T14:26:14.176Z).
- Aktueller Uebergabestand der Master-Mappe ist:
  `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Applied_Review_NoOp.xlsx`
- Diese Master-Mappe ist technisch verifiziert und der Build-Check ist erledigt. Dashboard-Status: `Gelb`, Kontrollstatus: `bestanden`, offene Checks: 6 Warnungen, 0 Fehler.
- Wichtig: Der Review-Apply war ein NoOp, weil noch keine Review-Entscheidungen angenommen wurden. Die Master-Mappe enthaelt deshalb noch nicht die fachlich entschiedenen Ergebnisse aus dem grossen Girokonto-Import.

### Heute neu erzeugt

- Neue Entscheidungshilfe:
  `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungshilfe.xlsx`
- Neue vorbefuellte Batch-1-Review-Kopie:
  `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch1_Draft.xlsx`
- Neuer Batch-1-Entscheidungsplan:
  `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungsplan_Batch1_Draft.xlsx`
- Neue Review-Kopie mit angenommenen Uebertrag-Transfers:
  `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch1_Transfers_Accepted.xlsx`
- Neuer Entscheidungsplan mit angenommenen Uebertrag-Transfers:
  `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungsplan_Batch1_Transfers_Accepted.xlsx`
- Neue Review-Kopie mit angenommenen Uebertrag-Transfers und Kategorie-Mapping-Draft:
  `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch1_Transfers_Categories_Accepted.xlsx`
- Neuer Entscheidungsplan mit angenommenen Uebertrag-Transfers und Kategorie-Mapping-Draft:
  `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungsplan_Batch1_Transfers_Categories_Accepted.xlsx`
- Neuer Apply-Preflight-Report:
  `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Apply_Preflight_Batch1_Transfers_Categories.xlsx`
- Neuer Builder:
  `workbook-build/build_review_decision_helper.mjs`
- Neuer Batch-1-Review-Builder:
  `workbook-build/build_batch1_review_draft.mjs`
- Neuer Builder fuer angenommene Batch-1-Uebertrag-Transfers:
  `workbook-build/build_batch1_transfer_accepted_review.mjs`
- Neuer Builder fuer Batch-1-Kategorie-Mapping-Draft:
  `workbook-build/build_batch1_category_accepted_review.mjs`
- Neuer Builder fuer Apply-Preflight:
  `workbook-build/build_apply_preflight_report.mjs`
- Zweck: Die 86 Vorschlaege aus `Finanzmodell_V1_Vorschlagsreview.xlsx` werden angereichert, priorisiert und in eine besser bearbeitbare Review-Arbeitsmappe ueberfuehrt. Die Master-Mappe wird dadurch nicht veraendert.
- Verifikation der Entscheidungshilfe: 5 Sheets, 86 Vorschlaege, 33 Batch-1-Eintraege, keine gefundenen Formel-/Referenzfehler.
- Verifikation der Batch-1-Review-Kopie: 6 Entscheidungen `ablehnen`, 80 offen, keine angenommenen Umsetzungen, keine gefundenen Formel-/Referenzfehler.
- Verifikation der Review-Kopie mit angenommenen Uebertrag-Transfers: 5 Entscheidungen `annehmen`, 6 `ablehnen`, 75 offen, keine gefundenen Formel-/Referenzfehler.
- Der daraus erzeugte Entscheidungsplan ist formal valide und enthaelt 5 angenommene Transferregeln. Diese Transferregeln sind im Plan weiterhin `nicht_in_modell_geschrieben` und `Umsetzung_Eindeutig = false`. Die bestehende Apply-Pipeline schreibt aktuell nur angenommene Regelzahlungen direkt in die Master-Mappe, nicht Transferregeln oder Kategorie-Mappings.
- Verifikation des Kategorie-Mapping-Drafts: 21 Entscheidungen `annehmen`, 6 `ablehnen`, 59 offen, keine gefundenen Formel-/Referenzfehler. Enthalten sind 5 angenommene Transferentscheidungen und 16 angenommene Kategorie-Mappings. Auch diese Kategorie-Mappings sind im Plan `nicht_in_modell_geschrieben` und `Umsetzung_Eindeutig = false`.
- Apply-Preflight-Ergebnis: 21/21 Zieltransaktionen aus dem Batch-1-Plan fehlen in der verifizierten Master-Mappe `Finanzmodell_V1_Verifiziert_Applied_Review_NoOp.xlsx`, sind aber 21/21 im Full-Analysis-Draft `Finanzmodell_V1_AgentDraft_Full_Analysis.xlsx` vorhanden. Ein direkter Apply des Batch-1-Plans auf die Master-Mappe ist deshalb blockiert.

### Review-Status

- Vorschlaege gesamt: 86
- Hohe Prioritaet: 33
- Regelzahlungen: 50
- Transferregeln: 11
- Kategorie-Mappings: 25
- In der Entscheidungshilfe sind 6 Transfer-Vorschlaege als wahrscheinlich abzulehnen markiert. Grund: Kartenzahlungen bei `SPAR.KOEBMAND...` wurden durch das Wort `SPAR` faelschlich als Transfer erkannt.
- 5 Transfer-Vorschlaege mit `Uebertrag`/`Übertrag` sind wahrscheinlich echte Eigenumbuchungen, muessen aber vom Nutzer bestaetigt werden.
- Mehrere grosse Kategorie-Mappings haben KI-Kategoriehinweise, z. B. Immobilien-/Hausbezug, Steuer-/Abgabenbezug oder Freizeit/Reisen. Diese Hinweise sind nur Entscheidungshilfe, keine Umsetzung.

### Naechster sinnvoller Schritt

1. Naechster sicherer Schritt: entscheiden, ob der Full-Analysis-Draft kontrolliert zum neuen Arbeitsstand/promoteten Importstand wird oder ob der grosse Import zuerst erneut sauber in die verifizierte Master-Struktur geschrieben werden soll.
2. Erst danach Transfer-/Kategorie-Apply-Logik auf das richtige Ziel anwenden. Aktuell ist ein Apply auf die verifizierte Master-Mappe blockiert, weil die Zieltransaktionen dort fehlen.
3. Danach die verbleibenden 9 offenen Kategorie-Mappings entscheiden oder bewusst zurueckstellen.
3. Bei Regelzahlungen erst annehmen, wenn mindestens `Ziel_Kategorie_ID` und `Ziel_Person_ID` belastbar gesetzt sind.
4. Danach `workbook-build/build_review_decision_plan.mjs` bzw. den passenden Batch-Plan-Build erneut laufen lassen.
5. Den erzeugten Entscheidungsplan auf die verifizierte Master-Mappe anwenden, bevorzugt auf:
   `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Applied_Review_NoOp.xlsx`
6. Danach erneut Verifikation/Statuscheck ausfuehren, bevor die neue Mappe als Master-Uebergabestand gilt.

### Hinweise fuer neue Sessions

- Eine neue Session soll zuerst dieses Handover, dann `Finanzmodell_Entscheidungsprotokoll.md`, `Finanzmodell_Datenmodell.md`, `Finanzmodell_Agentenworkflow.md` und `Finanzmodell_Excel_Bau_und_QA_Plan.md` lesen.
- Danach den Manifest-Stand und die oben genannten Artefakte im Output-Ordner pruefen.
- Die Master-Mappe nicht direkt mit den AgentDraft-Dateien ersetzen. Die AgentDraft-Dateien enthalten Import-/Analyseentwuerfe; der fuehrende Uebergabestand bleibt die verifizierte Apply-NoOp-Datei, bis Review-Entscheidungen bewusst angewendet wurden.

<!-- Handover-Update 2026-05-26 Batch 1/2 Apply -->
## Session-Update 26.05.2026 - Batch 1/2 angewendet

### Aktueller Uebergabestand

- Neuer fuehrender Arbeitsstand der Finanzmodell-Mappe ist:
  `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Promoted_Applied_Batch1_Batch2_User_Categories.xlsx`
- Dieser Stand ersetzt fuer die naechste Bearbeitung den frueheren Apply-NoOp-Stand als praktische Arbeitsgrundlage.
- Wichtig: Die Mappe ist weiterhin eine kontrolliert erzeugte Arbeitskopie, nicht einfach der AgentDraft. Der Full-Analysis-Draft wurde zunaechst append-only in eine verifizierte Kopie promotet; danach wurden Review-Entscheidungen angewendet.
- Frische Verifikation am Ende der Session:
  - `node --test workbook-build/tests/*.test.mjs`: 46/46 Tests bestanden.
  - Formel-/Referenzfehlerscan im aktuellen Workbook: 0 Treffer fuer `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#N/A`.

### Fachlicher Stand

- Vorschlaege gesamt: 86.
- Entschieden:
  - 6 abgelehnt (SPAR/Kartenzahlungs-False-Positives aus Batch 1).
  - 5 Uebertrag-/Eigenumbuchungs-Transfers angenommen und angewendet.
  - 25 Kategorie-Mappings angenommen und angewendet.
- Offen:
  - 50 Regelzahlungs-Vorschlaege.
  - 0 offene Transfer-Vorschlaege.
  - 0 offene Kategorie-Mapping-Vorschlaege.
- Die offene Restarbeit ist damit jetzt im Kern die Regelzahlungsentscheidung. Laut Arbeitsregel sollen Regelzahlungen erst angenommen werden, wenn mindestens `Ziel_Kategorie_ID` und `Ziel_Person_ID` belastbar gesetzt sind.

### Neu erzeugte Artefakte

- Kontrolliert promoteter Importstand:
  `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Promoted_Full_Analysis_Import.xlsx`
- Batch-1 angewendeter Stand:
  `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Promoted_Applied_Batch1_Transfers_Categories.xlsx`
- Restentscheidungsmappe nach Batch 1:
  `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Restentscheidungen_Nach_Batch1.xlsx`
- Batch-2 Review-Kopie mit Nutzerentscheidungen:
  `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview_Batch2_User_Categories_Accepted.xlsx`
- Batch-2 Entscheidungsplan:
  `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungsplan_Batch2_User_Categories_Accepted.xlsx`
- Aktueller Uebergabestand nach Batch 1 + Batch 2:
  `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Promoted_Applied_Batch1_Batch2_User_Categories.xlsx`

### Neu erzeugte oder geaenderte Builder/Module

- `workbook-build/src/importPromotion.mjs`
- `workbook-build/promote_full_analysis_import_to_verified_copy.mjs`
- `workbook-build/src/remainingReviewWorkbook.mjs`
- `workbook-build/build_remaining_review_workbook.mjs`
- `workbook-build/build_batch1_transfer_category_decision_plan.mjs`
- `workbook-build/apply_batch1_transfers_categories_to_promoted_copy.mjs`
- `workbook-build/build_batch2_user_category_review.mjs`
- `workbook-build/build_batch2_user_category_decision_plan.mjs`
- `workbook-build/apply_batch2_user_categories_to_finance_copy.mjs`
- Tests ergaenzt:
  - `workbook-build/tests/importPromotion.test.mjs`
  - `workbook-build/tests/remainingReviewWorkbook.test.mjs`
  - `workbook-build/tests/reviewDecisionPlan.test.mjs`

### Dokumentierte Entscheidungen

- Entscheidung 99: Kontrollierte Import-Promotion statt blindem Ersetzen durch AgentDraft.
- Entscheidung 100: Batch-1 Kategorie- und Transferentscheidungen werden nur auf vorhandene Zieltransaktionen angewendet; fehlende Ziel-IDs oder nicht eindeutige Planzeilen blockieren.
- Entscheidung 101: Batch-2 Nutzerentscheidungen und manuelles Transferpaar `MAN-TRANSFER-SUG-20260521-079` fuer Fahrradkauf Jan.

### Umgesetzte Batch-2 Nutzerentscheidungen

- `SUG-20260521-080` -> `KAT007` Familie & Haushalt.
- `SUG-20260521-067` -> `KAT002` Wohnen & Immobilien / Handwerks-/Dienstleistung.
- `SUG-20260521-071` -> `KAT002` Rueckzahlung Rasenmaehroboter.
- `SUG-20260521-072` -> `KAT002` Handwerks-/Dienstleistung.
- `SUG-20260521-073` -> `KAT002` Handwerks-/Dienstleistung.
- `SUG-20260521-075` -> `KAT002` Handwerks-/Dienstleistung.
- `SUG-20260521-083` -> `KAT007` Catering Konfirmation Sohn.
- `SUG-20260521-086` -> `KAT008` Freizeit & Reisen.
- `SUG-20260521-079` wurde fachlich als Transferpaar behandelt:
  - `TXN-RAW-IMP-20260516-FULLDRAFT-000028` Zahlungseingang Jan Niklas, `+983,84`.
  - `TXN-RAW-IMP-20260516-FULLDRAFT-000034` Fahrradladen-Gegenbuchung, `-983,84`.
  - Beide Transaktionen wurden auf `KAT012`, `Cashflow_Wirkung = neutral`, `Ist_Transfer = true`, `Transfer_Status = bestaetigter_transfer`, `Transfer_Typ = Eigenumbuchung`, `Lebenshaltung_Relevant = false` gesetzt und gegenseitig verknuepft.

### Naechster sinnvoller Schritt fuer neue Session

1. Zuerst dieses Handover und `Finanzmodell_Entscheidungsprotokoll.md` lesen.
2. Aktuellen Uebergabestand verwenden:
   `outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Verifiziert_Promoted_Applied_Batch1_Batch2_User_Categories.xlsx`
3. Danach die 50 offenen Regelzahlungs-Vorschlaege bearbeiten. Dabei den Nutzer aktiv fragen, insbesondere:
   - Welche Regelzahlungen gehoeren zu `P01`, `P02`, Kindern oder `HH`?
   - Welche Kategorie ist je Regelzahlung fachlich belastbar?
   - Welche Vorschlaege sind echte wiederkehrende Zahlungen und welche sind nur Muster/Fehlvorschlaege?
4. Erst nach Nutzerentscheidung eine neue Review-Kopie fuer Regelzahlungen erzeugen, daraus einen Entscheidungsplan bauen und auf den aktuellen Uebergabestand anwenden.
5. Danach wieder vollstaendige Test-/Workbook-Verifikation laufen lassen und erst dann einen neuen Master-Uebergabestand benennen.

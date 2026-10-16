# Traceability Runde 1 zu Runde 2

Stand: 26.05.2026

## Zweck

Dieses Dokument zeigt, welche fachlichen Anforderungen aus Runde 1 in Runde 2 beruecksichtigt sind. Die App soll langfristig umfassend werden. Runde 2 baut nur in kleineren, pruefbaren Meilensteinen.

Quelle fuer den Abgleich:

- `archiv/runde1-excel-2026-05-26/Finanzmodell_Datenmodell.md`
- `archiv/runde1-excel-2026-05-26/Finanzmodell_Agentenworkflow.md`
- `archiv/runde1-excel-2026-05-26/Finanzmodell_Entscheidungsprotokoll.md`

## Abgleich

| Runde-1-Modul | Runde-2-Entsprechung | Status |
|---|---|---|
| Dashboard | App-Dashboard, Datenqualitaet, Top-Checks, Basiskennzahlen | uebernommen, M2/M4/M9 |
| Personen | `personen.json`, Person-Schema | uebernommen, M1 |
| Kategorien | `kategorien.json`, Kategorie-Schema | uebernommen, M1 |
| Konten | `konten.json`, Konto-Schema | uebernommen, M1 |
| Umsaetze Roh / Importlaeufe | `data/inbox`, Importvorschlag, Transaktionen mit Quelle/Hash | uebernommen, M3 |
| Umsaetze Modell | `transaktionen.jsonl` mit Kategorie, Cashflow-Wirkung, Transferstatus | uebernommen, M1/M3/M4 |
| Transferregeln | `transfers.json`, Transfer-Vorschlaege, paarweise Checks | uebernommen, M3/M4 |
| Regelzahlungen | `regelzahlungen.json`, Regelzahlungsvorschlaege getrennt von bestaetigten Regeln | uebernommen, M4 |
| Regelzahlung_Vorschlaege | `vorschlaege.jsonl` mit Typ `regelzahlung` | uebernommen, M4/M8 |
| Vermoegen | berechnete Vermoegenssicht aus Konten, Immobilien, Verbindlichkeiten | uebernommen, M5 |
| Konten/Depots/liquide Anlagen | `konten.json`, spaeter Depot-/Bestandswerte | uebernommen, M1/M5 |
| Immobilien | `immobilien.json` plus Ertrag/Kosten/Darlehensbezug | uebernommen, M5 |
| Darlehen | `darlehen.json` bzw. `verbindlichkeiten.json` | uebernommen, M5 |
| Immobilien-Ertraege/Kosten | Regelzahlungen, Transaktionen und Immobilienbezug | uebernommen, M5 |
| Versicherungen | `versicherungen.json` mit Beitrags- und Leistungsbezug | uebernommen, M7 |
| Rente | `renten.json` mit Quelle, Beginn, Betrag und Status | uebernommen, M7 |
| Ereignisse | `ereignisse.json` fuer Arbeitsende, Vertragsende, Einmalzahlungen | uebernommen, M6/M7 |
| Erwerbsstatus | `erwerbsstatus.json` fuer Einkommensfaktor und Szenarien | uebernommen, M6 |
| Sozialleistungen | `sozialleistungen.json` | uebernommen, M6/M7 |
| Cashflow | berechnete Cashflow-Sicht aus Transaktionen, Regeln und Annahmen | uebernommen, M4 |
| Szenarien | `szenarien.json`, App-Szenarioansichten | uebernommen, M6 |
| Annahmen | `annahmen.json` mit Gueltigkeit, Status und Quelle | uebernommen, M6 |
| Zeitachse/Liquiditaet | berechnete App-Sicht, nicht als Masterdaten | uebernommen, M6 |
| Warnungen | `warnungen.jsonl` als konkrete Befunde aus Checks | uebernommen, M8/M9 |
| Agentenworkflow | Agentenauftraege, Pruefregeln, Vorschlaege, Laufprotokolle | uebernommen, M8 |
| Agentenauftraege | `agentenauftraege.jsonl` | uebernommen, M8 |
| Agent-Pruefregeln | `pruefregeln.json` | uebernommen, M8 |
| Agent-Vorschlaege | `vorschlaege.jsonl` | uebernommen, M8 |
| Agent-Laufprotokoll | `agentenlaeufe.jsonl` | uebernommen, M8 |
| Quellen | `quellen.json`, Dateihash, Standdatum, Status | uebernommen, M1/M3/M5 |
| Checks | `checks.json` plus Validatoren | uebernommen, M1 fortlaufend |

## Bewusst geaendert

- Excel-Arbeitsblaetter werden nicht eins zu eins nachgebaut. Die fachlichen Module werden als Daten, Views und Workflows abgebildet.
- Berechnete Sichten wie Dashboard, Cashflow, Zeitachse und Liquiditaet sind keine Masterdaten.
- Vorschlaege, Warnungen und Agentenlaeufe bleiben getrennt von fachlichen Zielentitaeten.
- Exporte sind abgeleitet und duerfen nicht fuehrend werden.

## Noch offen vor Umsetzung

- Exakte Schemas je Modul muessen meilensteinweise geschrieben werden.
- Welche Teile in JSON, JSONL oder spaeter SQLite liegen, wird pro Meilenstein entschieden.
- UI-Navigation und konkrete Screens werden erst nach M1/M2 detailliert.


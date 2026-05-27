# Finanzmodell - Agentenworkflow

Stand: 20.05.2026

Diese Datei beschreibt, wie Agenten neue Inputs, Analysen, Recherchen und angenommene Vorschlaege fuer das Familien-Finanzmodell bearbeiten. Excel bleibt die sichtbare Steuerungs- und Auditoberflaeche. Agentenarbeit dient der Datenuebernahme, Mustererkennung, Nacharbeit und Umsetzung bestaetigter Entscheidungen; sie ersetzt keine Nutzerentscheidung.

## Grundprinzipien

- Import, Analyse, Recherche und Umsetzung sind getrennte Rollen.
- Jeder Agentenlauf hat genau eine Rolle, einen erlaubten Zielbereich und einen Laufanker.
- Agenten schreiben nur in die fuer ihre Rolle erlaubten Zielbereiche.
- Vorschlaege sind keine Entscheidungen.
- Angenommene Vorschlaege werden nur umgesetzt, wenn sie eindeutig sind.
- Wiederholte Laeufe duerfen keine doppelten Zielzeilen erzeugen.
- Excel zeigt offene Aufgaben, Vorschlaege, Warnungen und knappe Laufanker, aber es ist kein dauerhaft laufendes Agentensystem.
- In Version 1 bleibt der Agentenworkflow schlank und dient dem ersten Nutzwert: Startimport, offene Muster, Nacharbeiten, belastbarer Modellstatus und minimale Nachvollziehbarkeit.
- Build-, Fixture-, Inspector- und Subagenten-Compliance-Artefakte bleiben ausserhalb der Nutzeroberflaeche in `workbook-build/`.

## Excel-Sichtbarkeit

Excel zeigt nur Agentenergebnisse, die eine Nutzerentscheidung, eine Nacharbeit oder eine Belastbarkeitsaussage erzeugen:

- Vorschlaege in `73_Agent_Vorschlaege`.
- Warnungen in `60_Warnungen`.
- Quellen und Belege in `90_Quellen`.
- Laufanker und Compliance-Status in `98_Agentenlaeufe`.
- Build- und Artefaktbezug in `98_Build_Verifikation` und `98_Artefakt_Referenzen`.
- offene oder nicht umsetzbare Punkte als Dashboard-nahe naechste Aktion.

Nicht als eigene Bedienblaetter in Version 1 sichtbar:

- Subagenten-Rohantworten.
- Test-Fixtures.
- Inspector-Ausgaben.
- Compliance-Snapshots.
- interne Build-Protokolle.
- vollstaendige Agentenauftragsverwaltung.

Diese Artefakte koennen in `workbook-build/` liegen. Wenn daraus ein Nutzerbefund entsteht, wird er verdichtet als Warnung, Vorschlag, Quelle, Laufanker oder Check in die Mappe uebernommen.

## Rollen

### Import-Agent

Aufgabe: Neue Inputs uebernehmen.

Darf:

- Input entgegennehmen oder am genannten Pfad lesen.
- Datei nachvollziehbar sichern oder final ablegen.
- Quelle in `90_Quellen` erfassen.
- bekannte Rohdaten importieren.
- eindeutige Belegwerte in Zieltabellen schreiben.
- `Quelle_ID` setzen.
- fachlichen Status meist `belegt`, bei Unsicherheit `offen`, bei Annahmen ohne Beleg `geschaetzt` setzen.
- Vorschlaege oder Warnungen erzeugen, wenn Nacharbeit noetig ist.
- eine knappe Laufzeile in `98_Agentenlaeufe` erzeugen.

Darf nicht:

- neue Regelzahlungen final aktivieren.
- neue Transferregeln final aktivieren.
- Kategorien, Personen oder Transfers ohne sichere Regel final setzen.
- `Status = geprueft` setzen.
- bestehende belastbare Werte still ueberschreiben.

### Pruef-/Analyse-Agent

Aufgabe: Muster, Widersprueche und Verbesserungen erkennen.

Darf:

- Regeln aus dem fachlichen Auftrag ausfuehren.
- Musterzeilen in `12_Regelzahlung_Vorschlaege` erzeugen.
- Vorschlaege in `73_Agent_Vorschlaege` erzeugen.
- Warnhinweise berechnen oder vorschlagen.
- eine knappe Laufzeile in `98_Agentenlaeufe` erzeugen.

Darf nicht:

- Vorschlaege automatisch als finale Regeln aktivieren.
- fachliche Entscheidungen still uebernehmen.
- bestaetigte Transfers oder Regelzahlungen setzen.
- Szenario- oder Annahmenwerte still veraendern.

### Recherche-Agent

Aufgabe: Externe Werte und aktuelle Daten recherchieren.

Darf:

- externe Werte recherchieren, wenn beauftragt.
- neue Quellen in `90_Quellen` erfassen.
- Datenstaende oder historisierte Annahmenzeilen erzeugen.
- Vorschlaege erzeugen, wenn eine Uebernahme eine Entscheidung braucht.
- eine knappe Laufzeile in `98_Agentenlaeufe` erzeugen.

Darf nicht:

- belegte oder gepruefte Annahmen still ueberschreiben.
- externe Werte ohne Quelle, Standdatum oder Abrufdatum als belastbar eintragen.

### Umsetzungs-Agent

Aufgabe: Angenommene Vorschlaege in konkrete Modellveraenderungen ueberfuehren.

Darf:

- Vorschlaege mit `Status = angenommen` und `Umsetzung_Eindeutig = ja` umsetzen.
- Zieltabellen gemaess eindeutigem Vorschlag aktualisieren.
- Vorschlag und Laufstatus aktualisieren.
- eine knappe Laufzeile in `98_Agentenlaeufe` erzeugen.

Darf nicht:

- aus einem unklaren Vorschlag eine neue fachliche Entscheidung ableiten.
- Zieltabellen aendern, wenn `Umsetzung_Eindeutig = nein`.
- erledigte Vorschlaege erneut umsetzen.

## Update-Modi

| Tabelle | Update-Modus |
|---|---|
| `10_Umsaetze_Roh` | `append_only` |
| `10_Importlaeufe` | `append_only` |
| `11_Umsaetze_Modell` | `kontrolliertes_update` |
| `11_Transferregeln` | `nur_durch_angenommenen_vorschlag` |
| `12_Regelzahlungen` | `nur_durch_angenommenen_vorschlag` |
| `12_Regelzahlung_Vorschlaege` | `append_or_update_by_fingerprint` |
| `40_Szenarien` | `manuell` |
| `42_Annahmen` | `historisiert` |
| `60_Warnungen_Bearbeitung` | `manuell` |
| `73_Agent_Vorschlaege` | `append_or_status_update` |
| `90_Quellen` | `append_or_update_by_hash` |
| `98_Build_Verifikation` | `append_only` |
| `98_Agentenlaeufe` | `append_only` |
| `98_Artefakt_Referenzen` | `append_or_update_by_hash` |
| `99_Checks` | `manuell_erweiterbar` |

Interne Rohprotokolle und Compliance-Snapshots haben keinen eigenen V1-Excel-Tabellenvertrag. Sie liegen im Build-/QA-Bereich und werden nur ueber `98_Kontrollspur` oder bei Nutzerrelevanz als Vorschlag, Warnung oder Check verdichtet.

## Datenfluss

### Import

1. Input entgegennehmen oder lokalisieren.
2. Original nachvollziehbar sichern oder final ablegen.
3. Inputtyp erkennen.
4. Quelle in `90_Quellen` dokumentieren.
5. Rohdaten oder Belegwerte auslesen.
6. passende Zieltabellen bestimmen.
7. erkannte Daten eintragen.
8. Vorschlag oder Warnung erzeugen, wenn Nacharbeit noetig ist.
9. Laufanker in `98_Agentenlaeufe` schreiben.
10. Detailprotokoll ausserhalb der Mappe ablegen, falls noetig.

### Analyse

1. Ausloeser lesen: Import, fachlicher Auftrag, Pruefregel oder Warnung.
2. Muster, Widerspruch oder offene Arbeit erkennen.
3. Vorschlag oder Warnung erzeugen.
4. Keine Endentscheidung treffen.
5. Laufanker in `98_Agentenlaeufe` schreiben.

### Recherche

1. Auftrag oder Pruefregel lesen.
2. externen Wert mit Quelle, Standdatum und Abrufdatum beschaffen.
3. neue Quelle und ggf. neue historisierte Annahme erzeugen.
4. bei Entscheidungsspielraum Vorschlag erzeugen.
5. Laufanker in `98_Agentenlaeufe` schreiben.

### Umsetzung

1. Vorschlaege mit `Status = angenommen` suchen.
2. nur Vorschlaege mit `Umsetzung_Eindeutig = ja` bearbeiten.
3. Zieltabellen gemaess Vorschlag aktualisieren.
4. `Umsetzungsstatus`, `Umsetzung_Zieltabelle` und `Umsetzung_Ziel_ID` setzen.
5. bei Unklarheit nicht umsetzen und Grund als Vorschlagskommentar oder Warnung sichtbar machen.
6. Laufanker in `98_Agentenlaeufe` schreiben.

## Methodiken

### `METH_INIT_1ON1`

Zweck: Den Nutzer dialogisch durch die Erstbefuellung fuehren.

V1-Reihenfolge:

1. Ziel und Modellstatus erklaeren.
2. Personen und Haushalt erfassen.
3. Kontenliste erfassen.
4. je verfuegbarem Konto einen historischen Startimport ausfuehren.
5. Kategorien, Regelzahlungen, Transfers und Auffaelligkeiten als Vorschlaege erzeugen.
6. wichtige Vorschlaege mit dem Nutzer pruefen.
7. zentrale Einnahmen und Ausgaben vervollstaendigen.
8. offene Immobilien-, Renten-, Versicherungs- und Quellenpunkte als Nacharbeit sichtbar machen.
9. Dashboardstatus, Kontrollstatus, Reichweite und naechste Aktion zeigen.
10. Laufanker schreiben und Detailprotokoll ausserhalb der Mappe ablegen.

Regel: Der Init-Agent startet nicht mit einem langen Fragebogen. Historische Umsaetze sollen die manuellen Fragen reduzieren.

### `METH_IMPORT_INPUT`

Zweck: Neue Dateien, Belege oder Rohdaten uebernehmen.

Typische Outputs:

- `90_Quellen`
- `10_Importlaeufe`
- `10_Umsaetze_Roh`
- initiale `11_Umsaetze_Modell`
- Zieltabellen bei eindeutigen Belegwerten
- Vorschlaege oder Warnungen
- Laufanker in `98_Agentenlaeufe`
- technisches Detailprotokoll ausserhalb der Nutzeroberflaeche

### `METH_ANALYSE_REGELZAHLUNGEN`

Zweck: wiederkehrende Zahlungen erkennen.

Leitlogik:

- Gegenpartei, IBAN, Verwendungszweck, Betrag und Rhythmus gruppieren.
- monatliche Muster ab 3 Treffern erkennen.
- quartalsweise Muster ab 3 Treffern erkennen.
- jaehrliche Muster ab 2 Treffern erkennen.
- Supermaerkte, Kartenzahlungen und haeufige Kleinbetraege nicht als Vertragsregelzahlungen vorschlagen.

Output:

- Musterzeilen in `12_Regelzahlung_Vorschlaege`
- entscheidungspflichtige Vorschlaege in `73_Agent_Vorschlaege`
- Laufanker in `98_Agentenlaeufe`
- keine direkte Aktivierung in `12_Regelzahlungen`

### `METH_ANALYSE_TRANSFERS`

Zweck: interne Umbuchungen, Sparplaene, Depotbewegungen, Darlehenszahlungen und Rueckerstattungen erkennen.

Leitlogik:

- bekannte eigene Konten, Namen und IBANs nutzen.
- Gegenbuchungen mit nahem Betrag und kurzem Datumsabstand suchen.
- Kandidaten markieren, nicht bestaetigen.

Output:

- Transferkandidaten oder Vorschlaege.
- Laufanker in `98_Agentenlaeufe`.
- keine `bestaetigter_transfer`-Setzung ohne Nutzerentscheidung oder bestaetigte Regel.

### `METH_ANALYSE_KATEGORIEN`

Zweck: Kategorie- und Gegenparteien-Mappings verbessern.

Leitlogik:

- hohe Volumen in `Sonstiges / zu pruefen` suchen.
- wiederkehrende Gegenparteien identifizieren.
- Kategorie-Mapping von Regelzahlung unterscheiden.

Output:

- Vorschlaege in `73_Agent_Vorschlaege`.
- Laufanker in `98_Agentenlaeufe`.

### `METH_ANALYSE_WIDERSPRUCH`

Zweck: Neue Belege, Importe oder Werte gegen bestehende Modellwerte pruefen.

Output:

- Vorschlaege oder Warnungen.
- Laufanker in `98_Agentenlaeufe`.
- keine stillen Ueberschreibungen.

### `METH_RECHERCHE_EXTERNE_WERTE`

Zweck: externe Werte wie Depotwerte, Zinssaetze, Inflation oder zentrale Annahmen aktualisieren.

Regeln:

- Quelle, Standdatum und Abrufdatum dokumentieren.
- bestehende belegte/gepruefte Werte nicht still ueberschreiben.
- neue Annahmenzeile oder Vorschlag erzeugen.
- Laufanker in `98_Agentenlaeufe` schreiben.

### `METH_UMSETZUNG_VORSCHLAG`

Zweck: angenommene Vorschlaege umsetzen.

Filter:

```text
Status = angenommen
AND Umsetzung_Eindeutig = ja
AND Umsetzungsstatus IN (leer, nicht_beauftragt, auftrag_erstellt)
AND Umsetzung_Ziel_ID leer
```

Wenn eine Umsetzung unklar ist:

- keine Zieltabellen aendern.
- `nicht_umsetzbar` setzen oder Vorschlag offen lassen.
- Grund protokollieren.
- Laufanker mit `Ergebnis = nicht_umsetzbar` schreiben.

## Output-Vertraege

### Gemeinsamer Laufvertrag

Jeder Agentenlauf erzeugt im Master genau eine knappe Zeile in `98_Agentenlaeufe`:

- `Lauf_ID`
- `Laufdatum`
- `Agentenrolle`
- `Ausloeser_Typ`
- `Methodik_ID`
- `Erlaubte_Zielbereiche`
- `Geaenderte_Tabellen`
- `Erzeugte_Vorschlaege`
- `Erzeugte_Warnhinweise`
- `Ergebnis`
- `Compliance_Status`
- `Artefakt_ID`
- `Fehler_Hinweis`

Ein Lauf ohne Aenderung ist gueltig, wenn `Ergebnis = keine_Aenderung` protokolliert wird. Vollstaendige Prompts, Rohantworten, Testdaten und Snapshots bleiben ausserhalb der Mappe und werden bei Bedarf ueber `98_Artefakt_Referenzen` referenziert.

### Import-Agent

Zulaessige Ergebnisgruppen:

- `quelle`
- `importlauf`
- `rohumsatz_rows`
- `modell_rows`
- `vorschlaege`
- `warnungen`
- `laufanker`

Verbotene Ergebnisse:

- `12_Regelzahlungen.Status = bestaetigt`
- `11_Transferregeln.Status = bestaetigt`
- `11_Umsaetze_Modell.Transfer_Status = bestaetigter_transfer`
- `Status = geprueft`
- automatische `Person_ID = HH` ohne bestaetigte Transferregel

### Pruef-/Analyse-Agent

Zulaessige Ergebnisgruppen:

- `12_Regelzahlung_Vorschlaege`
- `73_Agent_Vorschlaege`
- Warnhinweise
- Laufanker

Jeder Vorschlag enthaelt mindestens:

- `Vorschlag_ID`
- `Vorschlag_Fingerprint`
- `Lauf_ID`
- `Methodik_ID`
- `Vorschlagstyp`
- `Betroffene_Tabelle`
- `Betroffene_ID`
- `Empfohlene_Aktion`
- `Begruendung`
- `Konfidenz`
- `Prioritaet`
- `Status = offen`
- `Umsetzung_Eindeutig`
- `Umsetzungsstatus = nicht_beauftragt`

### Recherche-Agent

Recherche-Ergebnisse enthalten:

- Quelle oder Quellenhinweis.
- Standdatum, wenn verfuegbar.
- Abrufdatum bei externen Online-Werten.
- Status, der Unsicherheit sichtbar macht.
- Laufanker.

### Umsetzungs-Agent

Nach erfolgreicher Umsetzung setzt der Agent:

- `Umsetzungsstatus = umgesetzt`
- `Umsetzung_Zieltabelle`
- `Umsetzung_Ziel_ID`
- Laufanker mit Bezug zum umgesetzten Vorschlag.

## Initiale Pruefregeln V1

- `REG_INIT_ERSTBEFUELLUNG`
- `REG_IMPORT_NACHARBEIT`
- `REG_NEUE_REGELZAHLUNGEN`
- `REG_NEUE_TRANSFERS`
- `REG_KATEGORIEN_VERBESSERN`
- `REG_ANGENOMMENE_VORSCHLAEGE_UMSETZEN`
- `REG_EXTERNE_WERTE_QUARTAL`
- `REG_ANNAHMEN_JAEHRLICH`
- `REG_VERTRAEGE_AUSLAUFEND`
- `REG_KONTROLLSPUR_PRUEFEN`

Alle V1-Pruefregeln sind manuell ausloesbar. Automatische Auftraege werden nur dort vorbereitet, wo der Ausloeser eindeutig ist.

## Dashboard- und Check-Sichtbarkeit

Das Dashboard zeigt:

- offene Agentenvorschlaege.
- hoch priorisierte offene Vorschlaege.
- angenommene Vorschlaege ohne Umsetzung.
- letzte Build-Verifikation.
- offene Kontrollspur-Befunde.
- offene Warnungen aus Import, Kategorien, Transfers, Quellen und Annahmen.
- fehlerhafte oder nicht umsetzbare Agentenlaeufe nur als verdichteten Befund.
- naechste empfohlene Aktion.

`99_Checks` prueft mindestens:

- angenommene Vorschlaege ohne Umsetzung.
- Vorschlaege zu lange offen.
- Umsetzungen mit `nicht_umsetzbar`.
- fehlerhafte Agentenlaeufe als verdichtete Warnung.
- Agentenlauf ohne erlaubten Zielbereich oder Compliance-Status.
- fehlende oder fehlgeschlagene Build-Verifikation.
- referenziertes externes Artefakt fehlt oder ist nicht pruefbar.
- HH-Zuordnung ohne Regeldeckung.
- SUG-ID-Konsistenz zwischen `12_Regelzahlung_Vorschlaege` und `73_Agent_Vorschlaege`.

## Compliance-Pruefung

`agentComplianceHarness.mjs` prueft ausserhalb der Nutzeroberflaeche:

- geaenderte Tabellen liegen im erlaubten Rollenbereich.
- verbotene Statuswerte wurden nicht gesetzt.
- ID- und Fingerprint-Regeln sind eingehalten.
- wiederholter Lauf erzeugt keine doppelten Zielzeilen.
- Laufanker ist vorhanden.
- unklare Umsetzung erzeugt keine Zieltabellen-Aenderung.

Die Compliance-Pruefung ist wichtig, aber sie folgt dem V1-Kern. Der erste Bau darf nicht an einer vollstaendigen Agentenplattform haengen. Im Excel-Master bleibt nur die pruefbare Zusammenfassung, damit die Mappe auch ohne sofortigen Blick in `workbook-build/` ehrlich bleibt.

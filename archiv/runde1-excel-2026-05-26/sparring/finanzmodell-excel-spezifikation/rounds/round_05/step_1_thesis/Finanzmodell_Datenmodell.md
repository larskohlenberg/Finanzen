# Finanzmodell - Datenmodell

Stand: 20.05.2026

Diese Datei beschreibt die fachliche Struktur der Excel-Mappe Version 1. Sie ist die Quelle fuer Blaetter, Tabellen, Felder, Statuswerte, Schluessel, Checks, Kontrollspur und Startinhalte. Der spaetere Builder darf diese Struktur maschinell abbilden, aber keine fachlichen Luecken eigenstaendig schliessen.

## Arbeitsregeln

- Neue Tabellen, Felder oder Beziehungen werden hier dokumentiert, sobald sie entschieden sind.
- Primaerschluessel bleiben stabil; Aenderungen brauchen eine dokumentierte Migration.
- Fremdschluessel werden in Excel als ID-Spalten umgesetzt.
- Tabellen werden als strukturierte Excel-Tabellen gebaut.
- Jede wichtige Spalte bekommt im Workbook einen kurzen Kommentar: Bedeutung, erlaubte Werte, Wirkung auf Auswertungen oder Checks.
- Nutzerrelevante Blaetter bekommen oben einen kompakten Statusbereich mit Zweck, Datenstatus, offenen Checks und naechster Aktion.
- Platzhalter und offene Werte duerfen rechnen, muessen aber sichtbar bleiben.
- Build-, Inspector-, Fixture- und Agenten-Rohartefakte werden nicht als Rohdaten in Excel dupliziert.

## V1-Schnitt

Version 1 baut zuerst den kleinsten entscheidungsrelevanten Kern. Die Mappe soll nach einem Girokonto-Startimport Cashflow, Liquiditaet, Reichweite, offene Unsicherheiten, naechste Aktionen und den minimalen Nachweis der letzten Build- und Agentenlaeufe sichtbar machen.

| Stufe | Tabellen / Bereiche | V1-Bedeutung |
|---|---|---|
| `muss` | `00_Dashboard`, `01_Personen`, `02_Kategorien`, `03_Konten`, `10_Importlaeufe`, `10_Umsaetze_Roh`, `11_Umsaetze_Modell`, `11_Transferregeln`, `12_Regelzahlungen`, `12_Regelzahlung_Vorschlaege`, `30_Cashflow`, `40_Szenarien`, `42_Annahmen`, `43_Zeitachse`, `44_Liquiditaet`, `60_Warnungen_Aktuell`, `60_Warnungen_Bearbeitung`, `60_Warnungen`, `73_Agent_Vorschlaege`, `90_Quellen`, `98_Build_Verifikation`, `98_Agentenlaeufe`, `98_Artefakt_Referenzen`, `99_Checks` | Traegt Startimport, Entscheidungssicht, Nacharbeit und minimale Kontrollspur. |
| `sichtbarer_platzhalter` | `04_Immobilien`, `05_Immobilien_Details`, `06_Versicherungen`, `07_Rente`, `20_Vermoegen`, `41_Ereignisse` | Sichtbar vorbereitet, aber ohne tiefe Formellogik. Wirkt erst bei belastbaren Daten. |
| `thin_slice_gate` | Minimaldaten fuer Personen, Kategorien, Konto, Szenario, Annahmen und Quelle; ein Importlauf; wenige Roh- und Modellumsaetze; ein expliziter Startwert fuer Liquiditaet oder Cashflow; ein Check mit betroffener Quelle, Annahme, Import- oder Kontrollspur-Referenz; Dashboardstatus Rot oder Gelb; Kontrollstatus `nicht_ausgefuehrt` oder `nicht_pruefbar` | Struktur-, Referenz- und Sichtbarkeitsnachweis, bevor die Breite aller Muss-Tabellen voll ausgebaut und bevor Formellogik geschrieben wird. Kein Nutzwertnachweis. |
| `ausserhalb_build_qa` | Build-Fixtures, Inspector-Snapshots, Subagenten-Rohantworten, Compliance-Testdaten, Testmappen, vollstaendige Laufprotokolle | Nicht als Bedienblatt in Excel. Wird in `workbook-build/` gefuehrt und nur ueber Kontrollspur, Warnungen, Vorschlaege, Quellen oder Checks referenziert. |
| `spaeter` | `45_Sensitivitaet`, tiefe parallele Szenarien, Portfolioanalyse, Steuer-/Sozialrechtsmodell, vollstaendige Agentenplattform | Wird vorbereitet oder dokumentiert, aber nicht in den ersten Nutzwert gezogen. |

## Thin-Slice-Gate fuer Task 1

Task 1 beweist den V1-Kern nicht durch vollstaendige Formeln, nicht durch eine fertige Entscheidungssicht und nicht durch behaupteten Nutzwert. Er beweist, dass die spaetere Entscheidungssicht strukturell tragfaehig, referenzierbar und nicht unsichtbar-gruen ist. Der Durchstich ist akzeptiert, wenn `workbookSpec` und `seedData` gemeinsam diese Mindestkette beschreiben:

1. `01_Personen`: mindestens `P01` und `HH`, mit offenem oder belegtem Status sichtbar.
2. `02_Kategorien`: mindestens `KAT013` fuer `Sonstiges / zu pruefen`.
3. `03_Konten`: mindestens ein Girokonto, liquiditaetsrelevant, mit Startsaldo, Standdatum und Quellenverweis.
4. `40_Szenarien`: genau ein aktives Standardszenario `S01`.
5. `42_Annahmen`: mindestens Sicherheitsreserve und variable Ausgaben-Schaetzung als statusbehaftete Annahmen.
6. `90_Quellen`: mindestens eine Quelle fuer Startsaldo oder Import.
7. `10_Importlaeufe`: ein Importlauf mit Zeilenzaehlern, Status und optionalem Laufanker.
8. `10_Umsaetze_Roh`: wenige Rohumsaetze mit deterministischen IDs und Zeilenhash-Feld.
9. `11_Umsaetze_Modell`: daraus abgeleitete Modellumsaetze, mindestens eine offene Kategorie `KAT013`, keine finale Transfer- oder Regelentscheidung.
10. `98_Build_Verifikation`: ein Startzustand ohne bestandene Verifikation.
11. `99_Checks`: mindestens ein Build- oder Datenqualitaetscheck, der Rot oder Gelb begruendet und eine betroffene Quelle, Annahme, Importlauf- oder Kontrollspur-ID nennt.
12. `00_Dashboard`: ein Startstatus Rot oder Gelb mit Kontrollstatus, naechster Aktion und Rueckverweis auf mindestens einen vorhandenen Check.

Die in Task 1 getestete Kennzahl darf ein expliziter Seed- oder Start-Dashboardwert sein, wenn er als Startzustand gekennzeichnet ist und nicht als berechnetes Ergebnis erscheint. Die Berechnung aus Umsaetzen, Annahmen und Szenarien ist noch nicht Ziel von Task 1.

Der rote oder gelbe Startstatus ist nur belastbar, wenn er pruefbar rueckgebunden ist:

- `startDashboard.Modellstatus` ist `Rot` oder `Gelb`, nie `Gruen`.
- `startDashboard.Status_Check_IDs` enthaelt mindestens einen Check aus `seedData.checks`.
- Mindestens einer dieser Checks verweist ueber `Betroffene_Quelle_ID`, `Betroffene_Annahme_ID`, `Betroffener_Import_ID` oder `Betroffener_Kontrollspur_ID` auf eine vorhandene Seed-Zeile.
- `startDashboard.Kontrollstatus` ist `nicht_ausgefuehrt` oder `nicht_pruefbar` und passt zu einer Zeile in `98_Build_Verifikation`.
- `startDashboard.Startzustand_Typ = seeded_start_state`; berechnete Werte tragen in Task 1 keinen Ergebnisanspruch.

Die Grenze ist verbindlich:

- Task 1 testet Struktur, Reihenfolgen, Rollen, Validierungen, Kommentare, Pflichtspalten, Seed-Abdeckung und den roten oder gelben Startstatus.
- Task 1 testet die konkrete Referenzkette von Konto, Quelle, Importlauf, Rohumsatz, Modellumsatz, Check und Dashboardstatus.
- Task 1 importiert keine CSV-Datei und berechnet keine Runway-Projektion.
- Task 1 darf keine Fachlogik in `workbookSpec.mjs` verstecken, die spaeter in `formulas.mjs` gehoert.
- Task 1 darf keine Prozess-Metafelder wie `task1Scope` oder `formulaImplementationTask` als Ersatz fuer Verhaltensgrenzen im Produktvertrag brauchen.
- Task 1 darf keinen Nutzerwert fuer Liquiditaet, Cashflow oder Reichweite behaupten; er zeigt nur, dass die spaeteren Felder, IDs, Checks und Statusreferenzen sichtbar verbunden werden koennen.
- Task 3 testet und implementiert die erste echte Formellogik fuer Liquiditaet, Cashflow, Reichweite und Check-Ausloeser.

## Blattstruktur Version 1

| Blatt | Tabellen / Inhalt |
|---|---|
| `00_Dashboard` | Modellstatus, Liquiditaet, Cashflow, Reichweite, Kontrollstatus, Top-Warnungen, naechste Aktion |
| `01_Personen` | Personen und Haushalt |
| `02_Kategorien` | zentrale Umsatz- und Cashflow-Kategorien |
| `03_Konten` | Konten, Depots, Tagesgeld und Darlehens-/Kreditkonten |
| `04_Immobilien` | sichtbarer Platzhalter fuer Objektuebersicht |
| `05_Immobilien_Details` | sichtbarer Platzhalter fuer Darlehen, Ertraege und Kosten |
| `06_Versicherungen` | sichtbarer Platzhalter fuer Versicherungs- und Vorsorgevertraege |
| `07_Rente` | sichtbarer Platzhalter fuer Rentenansprueche |
| `10_Umsaetze_Roh` | `10_Importlaeufe`, `10_Umsaetze_Roh` |
| `11_Umsaetze_Modell` | `11_Umsaetze_Modell`, `11_Transferregeln` |
| `12_Regelzahlungen` | `12_Regelzahlungen`, `12_Regelzahlung_Vorschlaege` |
| `20_Vermoegen` | einfache Nettovermoegens- und Liquiditaetssicht |
| `30_Cashflow` | Monats-Cashflow und Prognose |
| `40_Szenarien` | genau ein aktives Standardszenario plus vorbereitete Kopiervorlagen |
| `41_Ereignisse` | sichtbarer Platzhalter fuer Ereignisse, Erwerbsstatus und Sozialleistungen |
| `42_Annahmen` | zentrale Annahmen mit Status, Quelle und Gueltigkeit |
| `43_Zeitachse` | Zeit- und Runway-Rechnung |
| `44_Liquiditaet` | Reserve, freie Liquiditaet, Liquiditaetsluecke und Reichweite |
| `60_Warnungen` | `60_Warnungen_Aktuell`, `60_Warnungen_Bearbeitung`, `60_Warnungen` |
| `73_Agent_Vorschlaege` | entscheidungspflichtige Vorschlaege fuer Nutzer oder Umsetzungs-Agent |
| `90_Quellen` | Quellen, Belege und modellkritische Werte |
| `98_Kontrollspur` | `98_Build_Verifikation`, `98_Agentenlaeufe`, `98_Artefakt_Referenzen` |
| `99_Checks` | Plausibilitaets-, Modellstatus- und Kontrollspurpruefungen |

Die frueher geplanten Blaetter `70_Agentenworkflow`, `71_Agent_Auftraege`, `72_Agent_Pruefregeln` und `74_Agent_Laufprotokoll` sind fuer V1 keine eigenen Bedienblaetter.

## Sichtbare Blattreihenfolge und Build-Reihenfolge

Die sichtbare Blattreihenfolge ist nutzerorientiert. Das Dashboard steht vorne, obwohl es technisch zuletzt aus anderen Tabellen gespeist wird.

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

`workbookSpec.mjs` wird dependency-orientiert aufgebaut. Diese Reihenfolge ist kein Nutzer-Navigationsmodell, sondern der technische Startvertrag fuer Tabellen, Tests und Seeds:

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

Warum diese Trennung gilt:

1. Stammdaten, Szenario, Annahmen und Quellen liefern die Schluessel fuer Import, Modellumsaetze und Checks.
2. Importlaeufe und Rohumsaetze entstehen vor Modellumsaetzen; der Parser trifft keine finalen Fachentscheidungen.
3. Vorschlaege stehen vor Warnungen und Checks, weil sie Nacharbeit ausloesen.
4. Zeitachse, Liquiditaet, Cashflow und Vermoegen liefern Kennzahlen fuer das Dashboard.
5. Platzhalterbereiche werden sichtbar angelegt, aber nicht als Build-Blocker vor den Cashflow-Kern gezogen.
6. `98_Kontrollspur` steht vor `99_Checks`, weil Checks auch Verifikation, Laeufe und Artefakte pruefen.
7. `00_Dashboard` steht sichtbar vorne und technisch zuletzt.

## ID- und Statuskonventionen

| ID | Schema | Beispiel |
|---|---|---|
| `Import_ID` | `IMP-YYYYMMDD-NNN` | `IMP-20260518-001` |
| `Rohumsatz_ID` | `RAW-{Import_ID}-{Zeilennummer_Import}` | `RAW-IMP-20260518-001-000001` |
| `Transaktion_ID` | `TXN-{Rohumsatz_ID}` | `TXN-RAW-IMP-20260518-001-000001` |
| `Quelle_ID` | `SRC-YYYYMMDD-NNN` | `SRC-20260518-001` |
| `Build_ID` | `BLD-YYYYMMDD-NNN` | `BLD-20260518-001` |
| `Lauf_ID` | `RUN-YYYYMMDD-NNN` | `RUN-20260518-001` |
| `Artefakt_ID` | `ART-YYYYMMDD-NNN` | `ART-20260518-001` |
| `Vorschlag_ID` | `SUG-YYYYMMDD-NNN` | `SUG-20260518-001` |
| `Transfer_Regel_ID` | `TRF-YYYYMMDD-NNN` | `TRF-20260518-001` |

Fachliche Statuswerte: `offen`, `belegt`, `geprueft`, `geschaetzt`, `inaktiv`.

Annahmen: `platzhalter`, `geschaetzt`, `belegt`, `geprueft`.

Vorschlaege: `offen`, `angenommen`, `abgelehnt`, `zurueckgestellt`, `erledigt`, `verworfen`.

Umsetzung: `nicht_beauftragt`, `auftrag_erstellt`, `umgesetzt`, `nicht_umsetzbar`.

Kontrollstatus: `nicht_ausgefuehrt`, `bestanden`, `bestanden_mit_warnung`, `fehlgeschlagen`, `nicht_pruefbar`.

## Kern-Tabellen

### `00_Dashboard`

Zweck: Zentrale Entscheidungssicht.

Dashboard-Reihenfolge:

1. Modellstatus.
2. Liquiditaet heute.
3. Cashflow heute.
4. Reichweite im Standardszenario.
5. Kontrollstatus.
6. Top-Warnungen.
7. Naechste Aktion.

Kernkennzahlen: Gesamtstatus, Aussage, liquide Mittel heute, freie Liquiditaet nach Reserve, nachhaltiger monatlicher Cashflow, Cashflow-Monat gesamt, Liquiditaetsluecke, Reichweite, Platzhalter-Annahmen, ungepruefte kritische Quellen, Anteil `Sonstiges / zu pruefen`, letzter bestandener Build, letzte Verifikation, offene Kontrollspur-Befunde, Top 5 offene Warnungen, naechste empfohlene Aktion.

Task-1-Startwerte im Dashboard sind als Startzustand zu kennzeichnen. Sie duerfen Rot oder Gelb anzeigen, weil offene Kategorie, fehlende Verifikation oder Platzhalter-Annahmen sichtbar sind. Der Status muss auf vorhandene Checks und deren betroffene Quellen, Annahmen, Import- oder Kontrollspurzeilen rueckverweisen; ein bloss gesetzter Warnstatus reicht nicht. Die spaetere Berechnung der Kennzahlen erfolgt in Task 3.

### `01_Personen`

Primaerschluessel: `Person_ID`.

Pflichtfelder: `Person_ID`, `Name_Rolle`, `Typ`, `Geburtsdatum`, `Alter_aktuell`, `Renteneintritt_alter`, `Status`, `Kommentar`.

Startwerte: `P01` Nutzer, `P02` Ehefrau, `HH` Haushalt / Familie. Fehlende Geburtsdaten und Arbeitsende-Werte bleiben offen und erzeugen Checks.

### `02_Kategorien`

Primaerschluessel: `Kategorie_ID`.

Startkategorien: Einkommen, Wohnen & Immobilien, Lebenshaltung, Mobilitaet, Versicherungen & Vorsorge, Gesundheit, Familie & Haushalt, Freizeit & Reisen, Steuern & Abgaben, Sparen & Investieren, Kredite & Finanzierung, Interne Transfers, `Sonstiges / zu pruefen`.

`KAT013` ist erlaubt, muss aber in Dashboard und Checks sichtbar bleiben, wenn der Anteil zu hoch wird.

### `03_Konten`

Primaerschluessel: `Konto_ID`.

Pflichtfelder: `Konto_ID`, `Name`, `Anbieter`, `Kontoart`, `Person_ID`, `Eigentumsanteil`, `Maskierte_IBAN_Depotnummer`, `Aktueller_Stand`, `Standdatum`, `Quelle_ID`, `Liquide_relevant`, `Performance_relevant`, `Transferfaehig`, `Status`, `Kommentar`.

`Liquiditaet_heute` besteht aus Girokonten, Tagesgeld und liquidierbarem Depot-Cashwert. Immobilienwerte sind ausgeschlossen.

### `10_Importlaeufe`

Primaerschluessel: `Import_ID`.

Pflichtfelder: `Import_ID`, `Importdatei`, `Quellkonto_ID`, `Quelle_ID`, `Zeitraum_von`, `Zeitraum_bis`, `Kontostand_Export`, `Kontostand_Datum`, `Importdatum`, `Zeilen_gesamt`, `Zeilen_importiert`, `Duplikate`, `Parse_Fehler`, `Status`, `Lauf_ID`, `Kommentar`.

Jede importierte Datei erzeugt eine Quellenzeile in `90_Quellen`. Wenn der Import durch einen Agentenlauf erzeugt wurde, verweist `Lauf_ID` auf `98_Agentenlaeufe`.

### `10_Umsaetze_Roh`

Primaerschluessel: `Rohumsatz_ID`.

Pflichtfelder: `Rohumsatz_ID`, `Import_ID`, `Quellkonto_ID`, `Importdatei`, `Importdatum`, `Zeilennummer_Import`, `Zeilenhash`, `Duplikat_Status`, `Parse_Status`, `Parse_Hinweis`, `Buchungsdatum`, `Wertstellung`, `Status_Bank`, `Zahlungspflichtiger`, `Zahlungsempfaenger`, `Verwendungszweck`, `Umsatztyp`, `IBAN`, `Betrag`, `Glaeubiger_ID`, `Mandatsreferenz`, `Kundenreferenz`.

Deduplikation: gleicher Hash = `bereits_importiert`; gleiche Kernfelder mit unvollstaendiger Referenz = `moegliches_duplikat`; neue Kombination = `neu`; manuell ausgeschlossene Zeile = `ignoriert`.

### `11_Umsaetze_Modell`

Primaerschluessel: `Transaktion_ID`.

Pflichtfelder: `Transaktion_ID`, `Rohumsatz_ID`, `Konto_ID`, `Zielkonto_ID`, `Kategorie_ID`, `Person_ID`, `Regel_ID`, `Regel_Match_Status`, `Regel_Match_Hinweis`, `Erwartetes_Zahldatum`, `Betragsabweichung`, `Tage_Abweichung`, `Betrag`, `Buchungsmonat`, `Cashflow_Wirkung`, `Szenario_Wirkung`, `Ist_Transfer`, `Transfer_Status`, `Transfer_Typ`, `Gegenbuchung_Transaktion_ID`, `Transfer_Regel_ID`, `Lebenshaltung_Relevant`, `Transfer_Pruefhinweis`, `Status`, `Kommentar`.

Initialwerte: Kategorie `KAT013` bei fehlender sicherer Regel; `Person_ID` leer; `HH` nur durch bestaetigte Transferregel; kein `geprueft`, kein `bestaetigter_transfer`, keine finale Regelzahlung durch Parser.

### `11_Transferregeln`

Primaerschluessel: `Transfer_Regel_ID`.

Pflichtfelder: `Transfer_Regel_ID`, `Name`, `Aktiv`, `Prioritaet`, `Konto_ID`, `Zielkonto_ID`, `Gegenpartei_Muster`, `IBAN_Muster`, `Verwendungszweck_Muster`, `Betrag_Min`, `Betrag_Max`, `Datums_Toleranz_Tage`, `Transfer_Typ`, `Vorgeschlagene_Cashflow_Wirkung`, `Lebenshaltung_Relevant_Vorschlag`, `Status`, `auto_person_id`, `Kommentar`.

Update-Modus: `nur_durch_angenommenen_vorschlag`.

### `12_Regelzahlungen`

Primaerschluessel: `Regel_ID`.

Pflichtfelder: `Regel_ID`, `Name`, `Typ`, `Kategorie_ID`, `Person_ID`, `Konto_ID`, `Quelle_ID`, `Frequenz`, `Erwarteter_Betrag`, `Toleranz_Betrag`, `Toleranz_Prozent`, `Erwarteter_Tag`, `Gegenpartei_Muster`, `IBAN_Muster`, `Verwendungszweck_Muster`, `Betrag_Min`, `Betrag_Max`, `Betrag_Variabel`, `Faelligkeitstag`, `Faelligkeitstoleranz_Tage`, `Matching_Status`, `Auto_Matching_Erlaubt`, `Startdatum`, `Enddatum`, `Status`, `Szenario_Wirkung`, `Kommentar`.

Regelzahlungen werden gegen Ist-Umsaetze abgeglichen. Fehlende, doppelte, abweichende oder verspaetete Zahlungen erzeugen Warnungen.

### `12_Regelzahlung_Vorschlaege`

Primaerschluessel: `Vorschlag_ID`.

Pflichtfelder: `Vorschlag_ID`, `Erkannt_am`, `Lauf_ID`, `Vorgeschlagener_Name`, `Vorgeschlagene_Frequenz`, `Treffer_Anzahl`, `Erstes_Datum`, `Letztes_Datum`, `Median_Betrag`, `Betrag_Min`, `Betrag_Max`, `Betrag_Variabilitaet`, `Typ`, `Kategorie_ID_Vorschlag`, `Person_ID_Vorschlag`, `Konto_ID`, `Gegenpartei_Muster`, `IBAN_Muster`, `Verwendungszweck_Muster`, `Konfidenz`, `Status`, `Erkennungs_Hinweis`, `Kommentar`.

`12_Regelzahlung_Vorschlaege` erzeugt die `SUG-`-ID. `73_Agent_Vorschlaege` kopiert sie. Statusaenderungen muessen synchron bleiben; `verworfen` in `73` entspricht einem ignorierten Muster in `12`.

### Platzhalterbereiche

`04_Immobilien`, `05_Immobilien_Details`, `06_Versicherungen`, `07_Rente` und `41_Ereignisse` bekommen Status, Quelle, Kommentar und naechste Aktion. Sie rechnen nur dann in Dashboard oder Reichweite hinein, wenn die Wirkung eindeutig und belegt ist.

`20_Vermoegen` ist eine einfache Sicht. Immobilien und langfristige Vermoegenswerte werden nicht gebraucht, um den ersten Cashflow- und Reichweitenkern zu beweisen.

### `30_Cashflow`

Kernkennzahlen: `Cashflow_Monat_ist`, `Cashflow_Monat_erwartet`, `Cashflow_Monat_gesamt`, nachhaltiger monatlicher Cashflow, Durchschnitt 3/6/12 Monate, Anteil `Sonstiges / zu pruefen`, neutralisierte Transfers.

Definition:

```text
Cashflow_Monat_gesamt =
  Cashflow_Monat_ist
  + offene Regelzahlungen diesen Monat
  + Variable_Kategorien_Schaetzwert
```

Die Prognose darf grob sein, muss aber Datenbasis und Unsicherheit zeigen.

### `40_Szenarien`

Startwerte: `S01 Standard` aktiv, `S02 Konservativ` vorbereitet, `S03 Stressfall` vorbereitet. Version 1 rechnet im Dashboard genau ein aktives Szenario.

### `42_Annahmen`

Startannahmen: Sicherheitsreserve, Planungsende, variable Ausgaben-Schaetzung, Inflation allgemein, Rendite liquide Mittel, Rentensteigerung, Nettofaktoren fuer Rente und Kapitalertraege.

Annahmen sind zeitlich gueltig und werden nicht ueberschrieben. Neue Informationen erzeugen neue Zeilen mit `Ersetzt_Annahme_ID`.

### `43_Zeitachse` und `44_Liquiditaet`

Runway-Logik:

```text
Je Monat M:
  Netto_M = Einnahmen_M - |Ausgaben_fix_M| - |Ausgaben_var_M| + Einmaleffekte_M

Kumuliertes_Vermoegen_M = Liquiditaet_heute + SUMME(Netto_1 ... Netto_M)
Reichweite = erster Monat, in dem Kumuliertes_Vermoegen_M <= 0
```

`44_Liquiditaet` zeigt liquide Mittel Start, planbare Zufluesse, planbare Abfluesse, Netto-Cashflow, Sicherheitsreserve, freie Liquiditaet nach Reserve, Liquiditaetsluecke, Reichweite, tiefster Liquiditaetsstand und Annahmenstatus.

### `60_Warnungen`

Tabellen:

- `60_Warnungen_Aktuell`: berechnete aktuelle Auffaelligkeiten.
- `60_Warnungen_Bearbeitung`: manueller Bearbeitungsstatus je `Warnungs_Fingerprint`.
- `60_Warnungen`: zusammengefuehrte Sicht.

Warnungen aendern Szenarien nie automatisch.

### `73_Agent_Vorschlaege`

Pflichtfelder: `Vorschlag_ID`, `Vorschlag_Fingerprint`, `Lauf_ID`, `Methodik_ID`, `Vorschlagstyp`, `Betroffene_Tabelle`, `Betroffene_ID`, `Empfohlene_Aktion`, `Begruendung`, `Konfidenz`, `Prioritaet`, `Status`, `Umsetzung_Eindeutig`, `Umsetzungsstatus`, `Kommentar`.

Nur Vorschlaege, die der Nutzer sehen, annehmen, ablehnen oder zurueckstellen soll, gehoeren in die Mappe.

### `90_Quellen`

Primaerschluessel: `Quelle_ID`.

Pflichtfelder: `Quelle_ID`, `Quellenart`, `Eltern_Quelle_ID`, `Eingangskanal`, `Originaldateiname`, `Dateiname_Modell`, `Dateipfad`, `Dateihash`, `Belegtyp`, `Quelle_Anbieter`, `Belegdatum`, `Standdatum`, `Abrufdatum`, `Wertname`, `Wert`, `Einheit`, `Zeitraum`, `Zeitraum_von`, `Zeitraum_bis`, `Seite_Abschnitt`, `Zielblatt`, `Ziel_ID`, `Person_ID`, `Objekt_ID`, `Szenario_Relevanz`, `Status`, `Unsicherheit`, `Kommentar`, `Geprueft_am`.

`Dateihash` ist SHA256 des gesamten Dateiinhalts. Geaenderter Inhalt erzeugt eine neue Quelle.

## `98_Kontrollspur`

Zweck: Minimaler Nachweis, welcher Build, welche Agentenlaeufe und welche externen Artefakte zur aktuellen Mappe gehoeren. Dieses Blatt ist kein Rohlog, keine Testdatenablage und keine Agentensteuerung.

Statusbereich oben:

- letzter `Build_ID`,
- letzte erfolgreiche Verifikation,
- letzte fehlgeschlagene Verifikation,
- letzte Agentenlauf-Zeit,
- offene Kontrollspur-Checks,
- Pfad oder Referenz auf den verbundenen `workbook-build/`-Stand.

### `98_Build_Verifikation`

Primaerschluessel: `Build_ID`.

Pflichtfelder: `Build_ID`, `Builddatum`, `Spec_Version`, `Workbook_Dateiname`, `Workbook_Dateihash`, `Builder_Version`, `Verifier`, `Verifier_Status`, `Inspector_Pfad`, `Tests_Gesamt`, `Tests_Bestanden`, `Tests_Fehlgeschlagen`, `Offene_Befunde`, `Artefakt_ID`, `Kommentar`.

Eine neue erzeugte `.xlsx` bekommt eine neue `Build_ID`. Wenn der Verifier nicht lief, ist `Verifier_Status = nicht_ausgefuehrt` oder `nicht_pruefbar`; das Dashboard darf dann nicht Gruen werden.

### `98_Agentenlaeufe`

Primaerschluessel: `Lauf_ID`.

Pflichtfelder: `Lauf_ID`, `Laufdatum`, `Agentenrolle`, `Ausloeser_Typ`, `Methodik_ID`, `Erlaubte_Zielbereiche`, `Geaenderte_Tabellen`, `Erzeugte_Vorschlaege`, `Erzeugte_Warnhinweise`, `Ergebnis`, `Compliance_Status`, `Artefakt_ID`, `Fehler_Hinweis`, `Kommentar`.

Vollstaendige Rohantworten bleiben ausserhalb der Mappe; `98_Agentenlaeufe` enthaelt nur die auditierbare Zusammenfassung.

### `98_Artefakt_Referenzen`

Primaerschluessel: `Artefakt_ID`.

Pflichtfelder: `Artefakt_ID`, `Artefakt_Typ`, `Pfad`, `Dateihash`, `Erzeugt_am`, `Erzeugt_durch`, `Bezug_ID`, `Aufbewahrung`, `Status`, `Kommentar`.

Wenn ein referenziertes Artefakt fehlt oder sein Hash nicht passt, erzeugt `99_Checks` einen Befund.

## `99_Checks`

Startchecks:

| Check_ID | Checkgruppe | Beschreibung | Schweregrad |
|---|---|---|---|
| `CHK001` | Import | Import-Parsefehler | Fehler |
| `CHK002` | Import | Import-Duplikate | Warnung |
| `CHK003` | Kategorisierung | Buchungen ohne Kategorie | Warnung |
| `CHK004` | Kategorisierung | Anteil Sonstiges / zu pruefen zu hoch | Warnung |
| `CHK005` | Transfers | unklare Transferkandidaten | Warnung |
| `CHK006` | Regelzahlungen | erwartete Regelzahlung fehlt | Warnung |
| `CHK007` | Regelzahlungen | doppelte Regelzahlung | Warnung |
| `CHK008` | Regelzahlungen | Betrag weicht ab | Warnung |
| `CHK009` | Regelzahlungen | Zahlung zu frueh oder zu spaet | Hinweis |
| `CHK010` | Quellen | kritischer Wert ohne Quelle | Warnung |
| `CHK011` | Quellen | Quelle ungeprueft oder veraltet | Warnung |
| `CHK012` | Annahmen | dashboardrelevante Platzhalter-Annahme | Warnung |
| `CHK013` | Annahmen | ueberlappende Annahmen | Warnung |
| `CHK014` | Szenario | Erwerbsstatus fehlt oder ueberlappt | Warnung |
| `CHK015` | Liquiditaet | freie Liquiditaet unter Reserve | Warnung |
| `CHK016` | Liquiditaet | liquide Mittel werden negativ | Fehler |
| `CHK017` | Basisdaten | Geburtsdatum oder Renteneintrittsalter fehlt | Warnung |
| `CHK018` | Szenario | Arbeitsende im aktiven Szenario offen | Warnung |
| `CHK-PERS-01` | Transfers | HH-Zeile ohne Regeldeckung | Fehler |
| `CHK-PERS-02` | Transfers | Transferregel mit `auto_person_id: HH` ohne Match | Fehler |
| `CHK-PERS-03` | Transfers | Anteil `Person_ID = leer` | Hinweis |
| `CHK-SUG-01` | Vorschlaege | SUG-ID-Konsistenz zwischen `12` und `73` | Fehler |
| `CHK-RUN-01` | Kontrollspur | Agentenlauf ohne erlaubten Zielbereich oder Compliance-Status | Fehler |
| `CHK-RUN-02` | Kontrollspur | angenommener Vorschlag ohne umsetzbaren oder erklaerten Laufbezug | Warnung |
| `CHK-BLD-01` | Build | letzte Workbook-Verifikation fehlt oder ist fehlgeschlagen | Fehler |
| `CHK-BLD-02` | Build | referenziertes Build-Artefakt fehlt oder Hash ist nicht pruefbar | Warnung |

Fuer `seedData.checks` im Thin-Slice-Gate reichen konkrete, schlanke Referenzfelder. Erlaubt sind:

- `Betroffene_Quelle_ID`
- `Betroffene_Annahme_ID`
- `Betroffener_Import_ID`
- `Betroffener_Kontrollspur_ID`

Ein Check fuellt nur die Referenz, die seinen Befund tatsaechlich begruendet. Es gibt keine generische Referenzmatrix, keine Liste aller moeglichen Zieltabellen und keine Pflicht, jede Check-Zeile kuenstlich mit mehreren Bezuegen aufzublaehen. Fuer Task 1 genuegt mindestens ein vorhandener Check, dessen gefuelltes Referenzfeld auf eine vorhandene Quelle, Annahme, Importlauf- oder Kontrollspur-Zeile zeigt und dadurch den roten oder gelben Dashboard-Startstatus erklaert.

Modellstatus:

- `Gruen`: keine Fehler, keine kritischen offenen Warnungen, letzte Verifikation bestanden.
- `Gelb`: offene Warnungen, Platzhalter, unsichere Annahmen oder Kontrollspur-Warnungen.
- `Rot`: kritische Fehler, fehlende Grunddaten, fehlgeschlagene Verifikation oder unzulaessiger Agentenlauf.

## Builder-Schnitt fuer `workbookSpec.mjs`

`workbookSpec.mjs` ist ein kleiner Strukturvertrag, kein zweites Fachmodell. Fuer jede V1-Tabelle enthaelt er:

- `sheetName`
- `tableName`
- `primaryKey`
- `columns`
- `columnRoles`
- `required`
- `validations`
- `seedRows`
- `updateMode`
- `idPrefix`
- `comments`

Task 1 baut `sheetOrder`, `tableBuildOrder`, alle Muss-Tabellen strukturell und die Seeds, die fuer den ersten roten oder gelben Dashboard-Startzustand noetig sind. Dieser Startzustand ist ein Struktur-, Referenz- und Sichtbarkeitsnachweis, kein fertiger Nutzwertnachweis. Task 1 darf Start-Dashboardfelder als Seed-Zustand definieren; Formeltiefe, Parserdetails und `.xlsx`-Export folgen danach.

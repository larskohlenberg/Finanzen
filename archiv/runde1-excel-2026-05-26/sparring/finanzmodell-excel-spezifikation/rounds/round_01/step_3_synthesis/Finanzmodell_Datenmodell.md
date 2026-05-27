# Finanzmodell - Datenmodell

Stand: 20.05.2026

Diese Datei beschreibt die fachliche Struktur der Excel-Mappe Version 1. Sie ist die Quelle fuer Tabellen, Schluessel, Statuslogik, Modellwirkungen und Startinhalte. Der spaetere Builder darf diese Struktur maschinell abbilden, aber keine fachlichen Luecken eigenstaendig schliessen.

## Arbeitsregeln

- Neue Tabellen, Felder oder Beziehungen werden hier dokumentiert, sobald sie entschieden sind.
- Primaerschluessel bleiben stabil; Aenderungen brauchen eine dokumentierte Migration.
- Fremdschluessel werden in Excel als ID-Spalten umgesetzt.
- Tabellen werden als strukturierte Excel-Tabellen gebaut.
- Jede wichtige Spalte bekommt im Workbook einen kurzen Kommentar: Bedeutung, erlaubte Werte, Wirkung auf Auswertungen oder Checks.
- Relevante Blaetter bekommen oben einen kompakten Statusbereich mit Zweck, Datenstatus, offenen Checks und naechster Aktion.
- Platzhalter und offene Werte duerfen rechnen, muessen aber sichtbar bleiben.

## V1-Schnitt

Version 1 baut zuerst den entscheidungsrelevanten Kern. Die Mappe soll nach einem Girokonto-Startimport Cashflow, Liquiditaet, Reichweite, offene Unsicherheiten und naechste Aktionen sichtbar machen.

| Stufe | Tabellen / Bereiche | V1-Bedeutung |
|---|---|---|
| `muss` | `00_Dashboard`, `01_Personen`, `02_Kategorien`, `03_Konten`, `10_Importlaeufe`, `10_Umsaetze_Roh`, `11_Umsaetze_Modell`, `11_Transferregeln`, `12_Regelzahlungen`, `12_Regelzahlung_Vorschlaege`, `30_Cashflow`, `40_Szenarien`, `42_Annahmen`, `43_Zeitachse`, `44_Liquiditaet`, `60_Warnungen_Aktuell`, `60_Warnungen_Bearbeitung`, `60_Warnungen`, `71_Agent_Auftraege`, `72_Agent_Pruefregeln`, `73_Agent_Vorschlaege`, `74_Agent_Laufprotokoll`, `90_Quellen`, `99_Checks` | Muss im ersten baubaren Workbook als strukturierte Tabelle oder klarer Dashboard-/Statusbereich vorhanden sein. |
| `soll` | `04_Immobilien`, `05_Darlehen`, `05_Immobilien_Ertraege`, `05_Immobilien_Kosten`, `06_Versicherungen`, `07_Rente`, `20_Vermoegen`, `41_Ereignisse`, `41_Erwerbsstatus`, `41_Sozialleistungen`, `50_Performance`, `70_Agentenworkflow` | Soll als Struktur oder sichtbarer Platzhalter vorhanden sein, aber die erste Cashflow-/Liquiditaetssicht nicht blockieren. |
| `spaeter` | `45_Sensitivitaet`, tiefe parallele Szenarien, echte Portfolioanalyse, Steuer-/Sozialrechtsmodell | Wird vorbereitet oder dokumentiert, aber nicht in den ersten Nutzwert gezogen. |

## Blattstruktur Version 1

| Blatt | Inhalt |
|---|---|
| `00_Dashboard` | Modellstatus, Vermoegen/Liquiditaet, Cashflow heute, Arbeitsende/Reichweite, Top-Warnungen, naechste Aktion |
| `01_Personen` | Personen und Haushalt |
| `02_Kategorien` | zentrale Umsatz- und Cashflow-Kategorien |
| `03_Konten` | Konten, Depots, liquide Anlagen und Darlehens-/Kreditkonten |
| `04_Immobilien` | Objektuebersicht |
| `05_Immobilien_Details` | Darlehen, Immobilienertraege, Immobilienkosten |
| `06_Versicherungen` | Versicherungs- und Vorsorgevertraege |
| `07_Rente` | Rentenansprueche und regelmaessige Ruhestandszahlungen |
| `10_Umsaetze_Roh` | Importlaeufe und originalnahe Rohumsaetze |
| `11_Umsaetze_Modell` | aufbereitete, modellfaehige Umsaetze und Transferregeln |
| `12_Regelzahlungen` | bestaetigte Regelzahlungen und Vorschlaege |
| `20_Vermoegen` | Nettovermoegen und Liquiditaetskomponenten |
| `30_Cashflow` | Monats-Cashflow und Prognose |
| `40_Szenarien` | aktives Standardszenario und Szenario-Cockpit |
| `41_Ereignisse` | Ereignisse, Erwerbsstatus, Sozialleistungen |
| `42_Annahmen` | zentrale Annahmen mit Status und Gueltigkeit |
| `43_Zeitachse` | Zeit- und Runway-Rechnung |
| `44_Liquiditaet` | Liquiditaetsluecke, Reserve und Reichweite |
| `45_Sensitivitaet` | vorbereitete Sensitivitaeten |
| `50_Performance` | schlanke Kapitalperformance |
| `60_Warnungen` | aktuelle Warnungen plus Bearbeitungsstatus |
| `70_Agentenworkflow` | Orientierung zu Agentenrollen |
| `71_Agent_Auftraege` | konkrete Agentenaufgaben |
| `72_Agent_Pruefregeln` | dauerhafte pruefbare Regeln |
| `73_Agent_Vorschlaege` | entscheidungspflichtige Vorschlaege |
| `74_Agent_Laufprotokoll` | Auditspur der Agentenlaeufe |
| `90_Quellen` | Quellen, Belege und modellkritische Werte |
| `99_Checks` | Plausibilitaets- und Modellstatuspruefungen |

## ID- und Statuskonventionen

| ID | Schema | Beispiel |
|---|---|---|
| `Import_ID` | `IMP-YYYYMMDD-NNN` | `IMP-20260518-001` |
| `Rohumsatz_ID` | `RAW-{Import_ID}-{Zeilennummer_Import}` | `RAW-IMP-20260518-001-000001` |
| `Transaktion_ID` | `TXN-{Rohumsatz_ID}` | `TXN-RAW-IMP-20260518-001-000001` |
| `Quelle_ID` | `SRC-YYYYMMDD-NNN` | `SRC-20260518-001` |
| `Lauf_ID` | `RUN-YYYYMMDD-NNN` | `RUN-20260518-001` |
| `Auftrag_ID` | `JOB-YYYYMMDD-NNN` | `JOB-20260518-001` |
| `Vorschlag_ID` | `SUG-YYYYMMDD-NNN` | `SUG-20260518-001` |
| `Transfer_Regel_ID` | `TRF-YYYYMMDD-NNN` | `TRF-20260518-001` |

Fachliche Zieltabellen nutzen als Standardstatus:

- `offen`
- `belegt`
- `geprueft`
- `geschaetzt`
- `inaktiv`

Annahmen nutzen:

- `platzhalter`
- `geschaetzt`
- `belegt`
- `geprueft`

Agentenauftraege nutzen:

- `offen`
- `in_arbeit`
- `erledigt`
- `verworfen`

Agentenvorschlaege nutzen:

- `offen`
- `angenommen`
- `abgelehnt`
- `zurueckgestellt`
- `erledigt`

Umsetzungsstatus nutzt:

- `nicht_beauftragt`
- `auftrag_erstellt`
- `umgesetzt`
- `nicht_umsetzbar`

## Tabellen und Modellregeln

### `00_Dashboard`

Zweck: Zentrale Entscheidungssicht.

Dashboard-Reihenfolge:

1. Modellstatus
2. Vermoegen und Liquiditaet
3. Cashflow heute
4. Arbeitsende und Reichweite
5. Top-Warnungen
6. Agenten-To-dos und naechste Aktion

Kernkennzahlen:

- Gesamtstatus (`Gruen`, `Gelb`, `Rot`)
- Aussage (`belastbar`, `nutzbar_mit_Einschraenkung`, `nicht_belastbar`)
- liquide Mittel heute
- freie Liquiditaet nach Reserve
- nachhaltiger monatlicher Cashflow
- Cashflow-Monat gesamt
- Liquiditaetsluecke
- Reichweite bis Jahr
- Platzhalter-Annahmen
- ungepruefte kritische Quellen
- Top 5 offene Warnungen
- naechste empfohlene Aktion

Regel: Das Dashboard zeigt keine vollstaendige Datenliste. Es zeigt nur, was fuer eine Entscheidung oder Nacharbeit noetig ist.

### `01_Personen`

Zweck: Personen und Haushaltsebene.

Primaerschluessel: `Person_ID`

Pflichtfelder: `Person_ID`, `Name_Rolle`, `Typ`, `Geburtsdatum`, `Alter_aktuell`, `Renteneintritt_alter`, `Status`, `Kommentar`.

Startwerte:

| Person_ID | Name_Rolle | Typ | Renteneintritt_alter | Status |
|---|---|---|---:|---|
| `P01` | Nutzer | Person | 67 | offen |
| `P02` | Ehefrau | Person | 67 | offen |
| `HH` | Haushalt / Familie | Haushalt |  | geprueft |

Fehlende Geburtsdaten und Arbeitsende-Werte bleiben offen und erzeugen Checks.

### `02_Kategorien`

Zweck: zentrale Kategorien fuer Umsaetze, Regelzahlungen und Cashflow.

Primaerschluessel: `Kategorie_ID`

Startkategorien:

| Kategorie_ID | Grobkategorie | Cashflow_Typ |
|---|---|---|
| `KAT001` | Einkommen | Einnahme |
| `KAT002` | Wohnen & Immobilien | Ausgabe |
| `KAT003` | Lebenshaltung | Ausgabe |
| `KAT004` | Mobilitaet | Ausgabe |
| `KAT005` | Versicherungen & Vorsorge | Ausgabe |
| `KAT006` | Gesundheit | Ausgabe |
| `KAT007` | Familie & Haushalt | Ausgabe |
| `KAT008` | Freizeit & Reisen | Ausgabe |
| `KAT009` | Steuern & Abgaben | Ausgabe |
| `KAT010` | Sparen & Investieren | Investition |
| `KAT011` | Kredite & Finanzierung | Tilgung |
| `KAT012` | Interne Transfers | Transfer |
| `KAT013` | Sonstiges / zu pruefen | zu_pruefen |

Regel: `KAT013` ist erlaubt, muss aber in Dashboard und Checks sichtbar bleiben, wenn der Anteil zu hoch wird.

### `03_Konten`

Zweck: Konten, Depots, Tagesgeld, Verrechnungskonten und Darlehens-/Kreditkonten.

Primaerschluessel: `Konto_ID`

Pflichtfelder: `Konto_ID`, `Name`, `Anbieter`, `Kontoart`, `Person_ID`, `Eigentumsanteil`, `Maskierte_IBAN_Depotnummer`, `Aktueller_Stand`, `Standdatum`, `Quelle_ID`, `Liquide_relevant`, `Performance_relevant`, `Transferfaehig`, `Status`, `Kommentar`.

`Liquiditaet_heute` besteht aus Girokonten, Tagesgeld und liquidierbarem Depot-Cashwert. Immobilienwerte sind ausgeschlossen.

### `10_Importlaeufe`

Zweck: Protokoll jedes CSV-Imports.

Primaerschluessel: `Import_ID`

Pflichtfelder: `Import_ID`, `Importdatei`, `Quellkonto_ID`, `Quelle_ID`, `Zeitraum_von`, `Zeitraum_bis`, `Kontostand_Export`, `Kontostand_Datum`, `Importdatum`, `Zeilen_gesamt`, `Zeilen_importiert`, `Duplikate`, `Parse_Fehler`, `Status`, `Kommentar`.

Jede importierte Datei erzeugt eine Quellenzeile in `90_Quellen`; `10_Importlaeufe.Quelle_ID` verweist darauf.

### `10_Umsaetze_Roh`

Zweck: originalnaher Import der Girokonto-CSV.

Primaerschluessel: `Rohumsatz_ID`

Pflichtfelder:

- technische Felder: `Rohumsatz_ID`, `Import_ID`, `Quellkonto_ID`, `Importdatei`, `Importdatum`, `Zeilennummer_Import`, `Zeilenhash`, `Duplikat_Status`, `Parse_Status`, `Parse_Hinweis`
- Bankfelder: `Buchungsdatum`, `Wertstellung`, `Status_Bank`, `Zahlungspflichtiger`, `Zahlungsempfaenger`, `Verwendungszweck`, `Umsatztyp`, `IBAN`, `Betrag`, `Glaeubiger_ID`, `Mandatsreferenz`, `Kundenreferenz`

Hashregel:

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

Deduplikation: gleicher Hash = `bereits_importiert`; gleiche Kernfelder mit unvollstaendiger Referenz = `moegliches_duplikat`; neue Kombination = `neu`; manuell ausgeschlossene Zeile = `ignoriert`.

### `11_Umsaetze_Modell`

Zweck: modellfaehige Buchungen aus Rohumsaetzen.

Primaerschluessel: `Transaktion_ID`

Pflichtfelder: `Transaktion_ID`, `Rohumsatz_ID`, `Konto_ID`, `Zielkonto_ID`, `Kategorie_ID`, `Person_ID`, `Regel_ID`, `Regel_Match_Status`, `Regel_Match_Hinweis`, `Erwartetes_Zahldatum`, `Betragsabweichung`, `Tage_Abweichung`, `Betrag`, `Buchungsmonat`, `Cashflow_Wirkung`, `Szenario_Wirkung`, `Ist_Transfer`, `Transfer_Status`, `Transfer_Typ`, `Gegenbuchung_Transaktion_ID`, `Transfer_Regel_ID`, `Lebenshaltung_Relevant`, `Transfer_Pruefhinweis`, `Status`, `Kommentar`.

Initialwerte beim Import:

| Feld | Initialwert |
|---|---|
| `Transaktion_ID` | `TXN-{Rohumsatz_ID}` |
| `Rohumsatz_ID` | Verweis auf Rohzeile |
| `Konto_ID` | `Quellkonto_ID` |
| `Kategorie_ID` | `KAT013`, falls keine sichere Regel existiert |
| `Person_ID` | leer; `HH` nur durch bestaetigte Transferregel mit `auto_person_id: HH` |
| `Regel_Match_Status` | `kein_match` |
| `Cashflow_Wirkung` | Einnahme bei positivem Betrag, Ausgabe bei negativem Betrag, ausser Transferkandidat |
| `Szenario_Wirkung` | `zu_pruefen` |
| `Ist_Transfer` | `nein` |
| `Transfer_Status` | `transfer_kandidat` nur bei Indizien, sonst `kein_transfer` |
| `Lebenshaltung_Relevant` | `ja`, ausser Transfer-/Investitionskandidat |
| `Status` | `offen` |

Der Parser setzt nie `geprueft`, nie `bestaetigter_transfer` und keine finale Regelzahlung.

### `11_Transferregeln`

Zweck: wiederverwendbare Regeln fuer interne Transfers und automatische HH-Zuordnung.

Primaerschluessel: `Transfer_Regel_ID`

Pflichtfelder: `Transfer_Regel_ID`, `Name`, `Aktiv`, `Prioritaet`, `Konto_ID`, `Zielkonto_ID`, `Gegenpartei_Muster`, `IBAN_Muster`, `Verwendungszweck_Muster`, `Betrag_Min`, `Betrag_Max`, `Datums_Toleranz_Tage`, `Transfer_Typ`, `Vorgeschlagene_Cashflow_Wirkung`, `Lebenshaltung_Relevant_Vorschlag`, `Status`, `auto_person_id`, `Kommentar`.

Update-Modus: `nur_durch_angenommenen_vorschlag`.

Regel: `auto_person_id = HH` darf nur wirken, wenn die Regel bestaetigt ist. Tote oder unpassende Regeln erzeugen Checks.

### `12_Regelzahlungen`

Zweck: bestaetigte wiederkehrende Einnahmen, Ausgaben und Transfers.

Primaerschluessel: `Regel_ID`

Pflichtfelder: `Regel_ID`, `Name`, `Typ`, `Kategorie_ID`, `Person_ID`, `Konto_ID`, `Quelle_ID`, `Frequenz`, `Erwarteter_Betrag`, `Toleranz_Betrag`, `Toleranz_Prozent`, `Erwarteter_Tag`, `Gegenpartei_Muster`, `IBAN_Muster`, `Verwendungszweck_Muster`, `Betrag_Min`, `Betrag_Max`, `Betrag_Variabel`, `Faelligkeitstag`, `Faelligkeitstoleranz_Tage`, `Matching_Status`, `Auto_Matching_Erlaubt`, `Startdatum`, `Enddatum`, `Status`, `Szenario_Wirkung`, `Kommentar`.

Regelzahlungen werden gegen Ist-Umsaetze abgeglichen. Fehlende, doppelte, abweichende oder verspaetete Zahlungen erzeugen Warnungen.

### `12_Regelzahlung_Vorschlaege`

Zweck: automatisch erkannte wiederkehrende Muster.

Primaerschluessel: `Vorschlag_ID`

Pflichtfelder: `Vorschlag_ID`, `Erkannt_am`, `Vorgeschlagener_Name`, `Vorgeschlagene_Frequenz`, `Treffer_Anzahl`, `Erstes_Datum`, `Letztes_Datum`, `Median_Betrag`, `Betrag_Min`, `Betrag_Max`, `Betrag_Variabilitaet`, `Typ`, `Kategorie_ID_Vorschlag`, `Person_ID_Vorschlag`, `Konto_ID`, `Gegenpartei_Muster`, `IBAN_Muster`, `Verwendungszweck_Muster`, `Konfidenz`, `Status`, `Erkennungs_Hinweis`, `Kommentar`.

Erkennungsregeln:

- monatlich: mindestens 3 Treffer
- quartalsweise: mindestens 3 Treffer mit ungefaehr 3 Monaten Abstand
- halbjaehrlich: mindestens 3 Treffer oder 2 starke Treffer
- jaehrlich: mindestens 2 Treffer in aufeinanderfolgenden Jahren

SUG-ID-Regel: `12_Regelzahlung_Vorschlaege` erzeugt die `SUG-`-ID. `73_Agent_Vorschlaege` kopiert sie. Statusaenderungen muessen synchron bleiben; `ignoriert` in `12` entspricht `verworfen` in `73`.

### `20_Vermoegen`

Zweck: Vermoegen nach Liquiditaet und Bindung sichtbar machen.

Kernkennzahlen: Nettovermoegen, liquide Mittel, freie Liquiditaet nach Reserve, gebundene Mittel, Immobilienwert, Schulden/Darlehen, anlegbare Mittel, Quellenstatus, Standdaten.

Regel: Nettovermoegen und Liquiditaet werden getrennt ausgewiesen. Immobilien zaehlen zum Vermoegen, aber im Standardszenario nicht automatisch zur Liquiditaet.

### `04_Immobilien`, `05_Darlehen`, `05_Immobilien_Ertraege`, `05_Immobilien_Kosten`

Zweck: Immobilienbestand, Finanzierung, Ertraege, Kosten und Rueckstellungen.

V1-Regel: Diese Tabellen werden strukturell vorbereitet. In die erste Reichweitenrechnung fliesst nur ein freier Immobilien-Cashflow ein, wenn Daten und Status ausreichend belastbar sind. Sonst bleibt der Bereich offen und erzeugt Nacharbeit.

### `06_Versicherungen` und `07_Rente`

Zweck: Versicherungsvertraege, Vorsorge, Rentenansprueche und spaetere Ruhestandszahlungen.

V1-Regel: Renten und Versicherungen duerfen als offene oder geschaetzte Daten gefuehrt werden, wirken aber nur mit sichtbarem Status und Quelle auf die Arbeitsende-/Reichweitenfrage.

### `30_Cashflow`

Zweck: Monatsauswertung und Prognose.

Kernkennzahlen:

- `Cashflow_Monat_ist`
- `Cashflow_Monat_erwartet`
- `Cashflow_Monat_gesamt`
- nachhaltiger monatlicher Cashflow
- Durchschnitt 3, 6, 12 Monate
- Anteil `Sonstiges / zu pruefen`
- neutralisierte Transfers
- freier Immobilien-Cashflow

Definitionen:

```text
Cashflow_Monat_ist =
  SUMME(10_Umsaetze_Roh.Betrag)
  WHERE Buchungsdatum >= Monatsanfang AND Buchungsdatum <= heute
```

```text
Variable_Kategorien_Schaetzwert =
  Durchschnitt letzte 3 Monate * 0,75
  + gleicher Monat Vorjahr * 0,25
  - bereits gebuchte variable Ausgaben dieser Kategorie im laufenden Monat
```

```text
Cashflow_Monat_gesamt =
  Cashflow_Monat_ist + offene Regelzahlungen diesen Monat + Variable_Kategorien_Schaetzwert
```

Regel: Die Prognose darf grob sein, muss aber ihre Datenbasis und Unsicherheit zeigen.

### `40_Szenarien`

Zweck: aktives Standardszenario und Szenario-Cockpit.

Startwerte:

| Szenario_ID | Name | Aktiv | Aktiv_fuer_Dashboard | Status |
|---|---|---|---|---|
| `S01` | Standard | ja | ja | offen |
| `S02` | Konservativ | nein | nein | vorbereitet |
| `S03` | Stressfall | nein | nein | vorbereitet |

Version 1 rechnet im Dashboard genau ein aktives Szenario. Weitere Szenarien sind Kopiervorlagen.

### `42_Annahmen`

Zweck: zentrale Stellhebel.

Startannahmen: Inflation allgemein, Inflation Wohnen/Energie, Inflation Gesundheit, Rendite liquide Mittel, Rendite anlegbare Mittel, Gehaltssteigerung P01/P02, Rentensteigerung, Sicherheitsreserve, Nettofaktoren fuer Rente und Kapitalertraege, Planungsende/Lebenserwartung.

Regel: Annahmen sind zeitlich gueltig und werden nicht ueberschrieben. Neue Informationen erzeugen neue Zeilen mit `Ersetzt_Annahme_ID`. Platzhalter wirken auf Gelb/Rot.

### `43_Zeitachse` und `44_Liquiditaet`

Zweck: Reichweite und Liquiditaetsluecke.

Runway-Logik:

```text
Je Monat M:
  Einnahmen_M      = positive gueltige Regelzahlungen
  Ausgaben_fix_M   = negative gueltige Regelzahlungen
  Einmaleffekte_M  = punktuelle Betraege
  Ausgaben_var_M   = 75/25-Schaetzung aus Cashflow
  Netto_M          = Einnahmen_M - |Ausgaben_fix_M| - |Ausgaben_var_M| + Einmaleffekte_M

Kumuliertes_Vermoegen_M = Liquiditaet_heute + SUMME(Netto_1 ... Netto_M)
Reichweite = erster Monat, in dem Kumuliertes_Vermoegen_M <= 0
```

`44_Liquiditaet` zeigt: liquide Mittel Start, planbare Zufluesse, planbare Abfluesse, Netto-Cashflow, Sicherheitsreserve, freie Liquiditaet nach Reserve, Liquiditaetsluecke, Reichweite, tiefster Liquiditaetsstand und Annahmenstatus.

### `50_Performance`

Zweck: grobe Kapitalperformance.

V1-Regel: einfache Rendite und geldgewichtete Naeherung, keine echte XIRR, kein Benchmarking, keine Steueranalyse.

### `60_Warnungen`

Zweck: aktuelle Warnungen plus Bearbeitung.

Tabellen:

- `60_Warnungen_Aktuell`: berechnete aktuelle Auffaelligkeiten
- `60_Warnungen_Bearbeitung`: manueller Bearbeitungsstatus je `Warnungs_Fingerprint`
- `60_Warnungen`: zusammengefuehrte Sicht

Warnungen aendern Szenarien nie automatisch. Erst eine bewusste Klassifizierung kann Planwerte beeinflussen.

### `71_Agent_Auftraege`, `72_Agent_Pruefregeln`, `73_Agent_Vorschlaege`, `74_Agent_Laufprotokoll`

Zweck: Agentenarbeit sichtbar, begrenzt und pruefbar machen.

V1-Regel: Agententabellen sind Hilfsmittel fuer offene Arbeit und Entscheidungen. Sie duerfen den ersten Nutzerwert nicht dominieren. Agenten duerfen keine stillen fachlichen Endentscheidungen treffen.

Update-Modi:

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
| `71_Agent_Auftraege` | `append_or_status_update` |
| `72_Agent_Pruefregeln` | `manuell` |
| `73_Agent_Vorschlaege` | `append_or_status_update` |
| `74_Agent_Laufprotokoll` | `append_only` |
| `90_Quellen` | `append_or_update_by_hash` |
| `99_Checks` | `manuell_erweiterbar` |

### `90_Quellen`

Zweck: Beleg- und Wert-Audit fuer wichtige Nachweise.

Primaerschluessel: `Quelle_ID`

Pflichtfelder: `Quelle_ID`, `Quellenart`, `Eltern_Quelle_ID`, `Eingangskanal`, `Originaldateiname`, `Dateiname_Modell`, `Dateipfad`, `Dateihash`, `Belegtyp`, `Quelle_Anbieter`, `Belegdatum`, `Standdatum`, `Abrufdatum`, `Wertname`, `Wert`, `Einheit`, `Zeitraum`, `Zeitraum_von`, `Zeitraum_bis`, `Seite_Abschnitt`, `Zielblatt`, `Ziel_ID`, `Person_ID`, `Objekt_ID`, `Szenario_Relevanz`, `Status`, `Unsicherheit`, `Kommentar`, `Geprueft_am`.

Hash-Regel: `Dateihash` ist SHA256 des gesamten Dateiinhalts. Identischer Hash aktualisiert die vorhandene Quellenzeile; geaenderter Inhalt erzeugt eine neue Quelle.

### `99_Checks`

Zweck: Plausibilitaet und Modellstatus.

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

Modellstatus:

- `Gruen`: keine Fehler, keine kritischen offenen Warnungen.
- `Gelb`: offene Warnungen, Platzhalter oder unsichere Annahmen.
- `Rot`: kritische Fehler oder fehlende Grunddaten.

## Builder-Schnitt fuer `workbookSpec.mjs`

`workbookSpec.mjs` ist ein kleiner Strukturvertrag, kein zweites Fachmodell. Fuer jede V1-Tabelle enthaelt er:

- `sheetName`
- `tableName`
- `primaryKey`
- `columns`
- `columnRoles`
- `required` (`muss`, `soll`, `spaeter`)
- `validations`
- `seedRows`
- `updateMode`, soweit relevant
- `idPrefix`, soweit relevant
- `comments`

Semantik, Begruendung und Methodik bleiben in den Markdown-Dateien. Wenn ein Feld fachlich unklar ist, wird es offen gebaut und gecheckt, nicht durch Code geraten.

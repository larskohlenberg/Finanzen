# Finanzmodell - Agentenworkflow

Stand: 20.05.2026

Diese Datei beschreibt, wie Agenten neue Inputs, Analysen, Recherchen und angenommene Vorschlaege fuer das Familien-Finanzmodell bearbeiten. Excel bleibt die sichtbare Steuerungs- und Auditoberflaeche. Agentenarbeit dient der Datenuebernahme, Mustererkennung, Nacharbeit und Umsetzung bestaetigter Entscheidungen; sie ersetzt keine Nutzerentscheidung.

## Grundprinzipien

- Import, Analyse, Recherche und Umsetzung sind getrennte Rollen.
- Jeder Agentenlauf hat genau eine Rolle und ein Laufprotokoll.
- Agenten schreiben nur in die fuer ihre Rolle erlaubten Zielbereiche.
- Vorschlaege sind keine Entscheidungen.
- Angenommene Vorschlaege werden nur umgesetzt, wenn sie eindeutig sind.
- Wiederholte Laeufe duerfen keine doppelten Zielzeilen erzeugen.
- Excel zeigt offene Aufgaben und Vorschlaege, aber es ist kein dauerhaft laufendes Agentensystem.
- In Version 1 bleibt der Agentenworkflow schlank und dient dem ersten Nutzwert: Startimport, offene Muster, Nacharbeiten und belastbarer Modellstatus.

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
- Folgeauftraege in `71_Agent_Auftraege` erzeugen.
- Lauf in `74_Agent_Laufprotokoll` dokumentieren.

Darf nicht:

- neue Regelzahlungen final aktivieren.
- neue Transferregeln final aktivieren.
- Kategorien, Personen oder Transfers ohne sichere Regel final setzen.
- `Status = geprueft` setzen.
- bestehende belastbare Werte still ueberschreiben.

### Pruef-/Analyse-Agent

Aufgabe: Muster, Widersprueche und Verbesserungen erkennen.

Darf:

- Aufgaben aus `71_Agent_Auftraege` bearbeiten.
- Regeln aus `72_Agent_Pruefregeln` ausfuehren.
- Musterzeilen in `12_Regelzahlung_Vorschlaege` erzeugen.
- Vorschlaege in `73_Agent_Vorschlaege` erzeugen.
- Warnhinweise berechnen oder vorschlagen.
- Folgeauftraege erzeugen.
- Lauf protokollieren.

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
- Lauf protokollieren.

Darf nicht:

- belegte oder gepruefte Annahmen still ueberschreiben.
- externe Werte ohne Quelle, Standdatum oder Abrufdatum als belastbar eintragen.

### Umsetzungs-Agent

Aufgabe: Angenommene Vorschlaege in konkrete Modellveraenderungen ueberfuehren.

Darf:

- Vorschlaege mit `Status = angenommen` und `Umsetzung_Eindeutig = ja` umsetzen.
- bei Bedarf einen Umsetzungsauftrag erzeugen.
- Zieltabellen gemaess eindeutigem Vorschlag aktualisieren.
- Vorschlag, Auftrag und Laufprotokoll aktualisieren.

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
| `71_Agent_Auftraege` | `append_or_status_update` |
| `72_Agent_Pruefregeln` | `manuell` |
| `73_Agent_Vorschlaege` | `append_or_status_update` |
| `74_Agent_Laufprotokoll` | `append_only` |
| `90_Quellen` | `append_or_update_by_hash` |
| `99_Checks` | `manuell_erweiterbar` |

## Datenfluss

### Import

1. Input entgegennehmen oder lokalisieren.
2. Original nachvollziehbar sichern oder final ablegen.
3. Inputtyp erkennen.
4. Quelle in `90_Quellen` dokumentieren.
5. Rohdaten oder Belegwerte auslesen.
6. passende Zieltabellen bestimmen.
7. erkannte Daten eintragen.
8. Folgeauftraege erzeugen, wenn Nacharbeit noetig ist.
9. Lauf protokollieren.

### Analyse

1. Ausloeser lesen: Import, Auftrag, Pruefregel oder Warnung.
2. Muster, Widerspruch oder offene Arbeit erkennen.
3. Vorschlag, Warnung oder Folgeauftrag erzeugen.
4. Keine Endentscheidung treffen.
5. Lauf protokollieren.

### Recherche

1. Auftrag oder Pruefregel lesen.
2. externen Wert mit Quelle, Standdatum und Abrufdatum beschaffen.
3. neue Quelle und ggf. neue historisierte Annahme erzeugen.
4. bei Entscheidungsspielraum Vorschlag erzeugen.
5. Lauf protokollieren.

### Umsetzung

1. Vorschlaege mit `Status = angenommen` suchen.
2. nur Vorschlaege mit `Umsetzung_Eindeutig = ja` bearbeiten.
3. Zieltabellen gemaess Vorschlag aktualisieren.
4. `Umsetzungsstatus`, `Umsetzungsauftrag_ID`, `Umsetzung_Zieltabelle` und `Umsetzung_Ziel_ID` setzen.
5. bei Unklarheit nicht umsetzen und Grund protokollieren.

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
9. Dashboardstatus, Reichweite und naechste Aktion zeigen.
10. Lauf protokollieren.

Regel: Der Init-Agent startet nicht mit einem langen Fragebogen. Historische Umsaetze sollen die manuellen Fragen reduzieren.

### `METH_IMPORT_INPUT`

Zweck: Neue Dateien, Belege oder Rohdaten uebernehmen.

Typische Outputs:

- `90_Quellen`
- `10_Importlaeufe`
- `10_Umsaetze_Roh`
- initiale `11_Umsaetze_Modell`
- Zieltabellen bei eindeutigen Belegwerten
- Folgeauftraege
- Laufprotokoll

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
- keine direkte Aktivierung in `12_Regelzahlungen`

### `METH_ANALYSE_TRANSFERS`

Zweck: interne Umbuchungen, Sparplaene, Depotbewegungen, Darlehenszahlungen und Rueckerstattungen erkennen.

Leitlogik:

- bekannte eigene Konten, Namen und IBANs nutzen.
- Gegenbuchungen mit nahem Betrag und kurzem Datumsabstand suchen.
- Kandidaten markieren, nicht bestaetigen.

Output:

- Transferkandidaten oder Vorschlaege.
- keine `bestaetigter_transfer`-Setzung ohne Nutzerentscheidung oder bestaetigte Regel.

### `METH_ANALYSE_KATEGORIEN`

Zweck: Kategorie- und Gegenparteien-Mappings verbessern.

Leitlogik:

- hohe Volumen in `Sonstiges / zu pruefen` suchen.
- wiederkehrende Gegenparteien identifizieren.
- Kategorie-Mapping von Regelzahlung unterscheiden.

Output:

- Vorschlaege in `73_Agent_Vorschlaege`.

### `METH_ANALYSE_WIDERSPRUCH`

Zweck: Neue Belege, Importe oder Werte gegen bestehende Modellwerte pruefen.

Output:

- Vorschlaege, Warnungen oder Folgeauftraege.
- keine stillen Ueberschreibungen.

### `METH_RECHERCHE_EXTERNE_WERTE`

Zweck: externe Werte wie Depotwerte, Zinssaetze, Inflation oder zentrale Annahmen aktualisieren.

Regeln:

- Quelle, Standdatum und Abrufdatum dokumentieren.
- bestehende belegte/gepruefte Werte nicht still ueberschreiben.
- neue Annahmenzeile oder Vorschlag erzeugen.

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
- `nicht_umsetzbar` setzen oder Auftrag offen lassen.
- Grund protokollieren.

## Output-Vertraege

### Gemeinsamer Laufvertrag

Jeder Agentenlauf erzeugt oder aktualisiert genau einen Laufprotokoll-Eintrag mit:

- `Lauf_ID`
- `Laufdatum`
- `Agentenrolle`
- `Ausloeser_Typ`
- `Auftrag_ID` oder `Pruefregel_ID`, falls vorhanden
- `Methodik_ID`
- `Geaenderte_Tabellen`
- `Erzeugte_Auftraege`
- `Erzeugte_Vorschlaege`
- `Erzeugte_Warnhinweise`
- `Ergebnis`
- `Fehler_Hinweis`

Ein Lauf ohne Aenderung ist gueltig, wenn `Ergebnis = keine_Aenderung` protokolliert wird.

### Import-Agent

Zulaessige Ergebnisgruppen:

- `quelle`
- `importlauf`
- `rohumsatz_rows`
- `modell_rows`
- `folgeauftraege`
- `laufprotokoll`

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
- Folgeauftraege
- Laufprotokoll

Jeder Vorschlag enthaelt mindestens:

- `Vorschlag_ID`
- `Vorschlag_Fingerprint`
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

### Umsetzungs-Agent

Nach erfolgreicher Umsetzung setzt der Agent:

- `Umsetzungsstatus = umgesetzt`
- `Umsetzungsauftrag_ID`
- `Umsetzung_Zieltabelle`
- `Umsetzung_Ziel_ID`

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

Alle V1-Pruefregeln sind manuell ausloesbar. Automatische Auftraege werden nur dort vorbereitet, wo der Ausloeser eindeutig ist.

## Dashboard- und Check-Sichtbarkeit

Das Dashboard zeigt:

- offene Agentenvorschlaege.
- hoch priorisierte offene Vorschlaege.
- angenommene Vorschlaege ohne Umsetzungsauftrag.
- offene Agentenauftraege.
- ueberfaellige Agentenauftraege.
- fehlerhafte Agentenlaeufe.
- naechste empfohlene Aktion.

`99_Checks` prueft mindestens:

- angenommene Vorschlaege ohne `Umsetzungsauftrag_ID`.
- Auftraege ueberfaellig oder nicht erledigt.
- Vorschlaege zu lange offen.
- Umsetzungen mit `nicht_umsetzbar`.
- fehlerhafte Agentenlaeufe.
- HH-Zuordnung ohne Regeldeckung.
- SUG-ID-Konsistenz zwischen `12_Regelzahlung_Vorschlaege` und `73_Agent_Vorschlaege`.

## Compliance-Pruefung

`agentComplianceHarness.mjs` prueft:

- geaenderte Tabellen liegen im erlaubten Rollenbereich.
- verbotene Statuswerte wurden nicht gesetzt.
- ID- und Fingerprint-Regeln sind eingehalten.
- wiederholter Lauf erzeugt keine doppelten Zielzeilen.
- Laufprotokoll ist vorhanden.
- unklare Umsetzung erzeugt keine Zieltabellen-Aenderung.

Die Compliance-Pruefung ist wichtig, aber sie folgt dem V1-Kern. Der erste Bau darf nicht an einer vollstaendigen Agentenplattform haengen.

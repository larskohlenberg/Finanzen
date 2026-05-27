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

Die alten Blaetter `70_Agentenworkflow`, `71_Agent_Auftraege`, `72_Agent_Pruefregeln` und `74_Agent_Laufprotokoll` bleiben gestrichen. Wenn daraus ein Nutzerbefund entsteht, wird er verdichtet als Warnung, Vorschlag, Quelle, Laufanker oder Check uebernommen.

## Rollen

### Import-Agent

Aufgabe: Neue Inputs uebernehmen.

Darf: Input lesen, Quelle in `90_Quellen` erfassen, bekannte Rohdaten importieren, Importlauf schreiben, initiale Modellumsaetze erzeugen, eindeutige Belegwerte mit Quelle eintragen, Vorschlaege oder Warnungen erzeugen, Laufanker in `98_Agentenlaeufe` schreiben.

Darf nicht: neue Regelzahlungen final aktivieren, neue Transferregeln final aktivieren, Kategorien/Personen/Transfers ohne sichere Regel final setzen, `Status = geprueft` setzen, bestehende belastbare Werte still ueberschreiben.

### Pruef-/Analyse-Agent

Aufgabe: Muster, Widersprueche und Verbesserungen erkennen.

Darf: Musterzeilen in `12_Regelzahlung_Vorschlaege` erzeugen, Vorschlaege in `73_Agent_Vorschlaege` erzeugen, Warnhinweise berechnen oder vorschlagen, Laufanker schreiben.

Darf nicht: Vorschlaege automatisch aktivieren, bestaetigte Transfers oder Regelzahlungen setzen, Szenario- oder Annahmenwerte still veraendern.

### Recherche-Agent

Aufgabe: Externe Werte und aktuelle Daten recherchieren.

Darf: externe Werte recherchieren, neue Quellen erfassen, Datenstaende oder historisierte Annahmenzeilen erzeugen, Vorschlaege erzeugen, Laufanker schreiben.

Darf nicht: belegte oder gepruefte Annahmen still ueberschreiben, externe Werte ohne Quelle, Standdatum oder Abrufdatum als belastbar eintragen.

### Umsetzungs-Agent

Aufgabe: Angenommene Vorschlaege in konkrete Modellveraenderungen ueberfuehren.

Darf: Vorschlaege mit `Status = angenommen` und `Umsetzung_Eindeutig = ja` umsetzen, Zieltabellen gemaess eindeutigem Vorschlag aktualisieren, Vorschlag und Laufstatus aktualisieren, Laufanker schreiben.

Darf nicht: aus einem unklaren Vorschlag eine neue fachliche Entscheidung ableiten, Zieltabellen bei `Umsetzung_Eindeutig = nein` aendern, erledigte Vorschlaege erneut umsetzen.

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

Interne Rohprotokolle und Compliance-Snapshots haben keinen eigenen V1-Excel-Tabellenvertrag.

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
5. Laufanker schreiben.

### Umsetzung

1. Vorschlaege mit `Status = angenommen` suchen.
2. nur Vorschlaege mit `Umsetzung_Eindeutig = ja` bearbeiten.
3. Zieltabellen gemaess Vorschlag aktualisieren.
4. `Umsetzungsstatus`, `Umsetzung_Zieltabelle` und `Umsetzung_Ziel_ID` setzen.
5. bei Unklarheit nicht umsetzen und Grund sichtbar machen.
6. Laufanker schreiben.

## Methodiken

### `METH_INIT_1ON1`

Zweck: Den Nutzer dialogisch durch die Erstbefuellung fuehren.

V1-Reihenfolge: Ziel und Modellstatus erklaeren, Personen und Haushalt erfassen, Kontenliste erfassen, je verfuegbarem Konto Startimport ausfuehren, Kategorien/Regelzahlungen/Transfers als Vorschlaege erzeugen, zentrale Vorschlaege pruefen, Einnahmen und Ausgaben vervollstaendigen, offene Platzhalter als Nacharbeit sichtbar machen, Dashboardstatus und naechste Aktion zeigen, Laufanker schreiben.

### `METH_IMPORT_INPUT`

Outputs: `90_Quellen`, `10_Importlaeufe`, `10_Umsaetze_Roh`, initiale `11_Umsaetze_Modell`, Zieltabellen bei eindeutigen Belegwerten, Vorschlaege/Warnungen, Laufanker.

### `METH_ANALYSE_REGELZAHLUNGEN`

Leitlogik: Gegenpartei, IBAN, Verwendungszweck, Betrag und Rhythmus gruppieren; monatliche Muster ab 3 Treffern; quartalsweise ab 3 Treffern; jaehrliche ab 2 Treffern; haeufige Kleinbetraege nicht als Vertragsregelzahlungen vorschlagen.

Output: Musterzeilen in `12_Regelzahlung_Vorschlaege`, entscheidungspflichtige Vorschlaege in `73_Agent_Vorschlaege`, Laufanker, keine direkte Aktivierung.

### `METH_ANALYSE_TRANSFERS`

Leitlogik: bekannte eigene Konten, Namen und IBANs nutzen; Gegenbuchungen mit nahem Betrag und kurzem Datumsabstand suchen; Kandidaten markieren, nicht bestaetigen.

### `METH_ANALYSE_KATEGORIEN`

Leitlogik: hohe Volumen in `Sonstiges / zu pruefen` suchen, wiederkehrende Gegenparteien identifizieren, Kategorie-Mapping von Regelzahlung unterscheiden.

### `METH_ANALYSE_WIDERSPRUCH`

Output: Vorschlaege oder Warnungen, Laufanker, keine stillen Ueberschreibungen.

### `METH_RECHERCHE_EXTERNE_WERTE`

Regeln: Quelle, Standdatum und Abrufdatum dokumentieren; bestehende belegte/gepruefte Werte nicht still ueberschreiben; neue Annahmenzeile oder Vorschlag erzeugen; Laufanker schreiben.

### `METH_UMSETZUNG_VORSCHLAG`

Filter:

```text
Status = angenommen
AND Umsetzung_Eindeutig = ja
AND Umsetzungsstatus IN (leer, nicht_beauftragt, auftrag_erstellt)
AND Umsetzung_Ziel_ID leer
```

Wenn eine Umsetzung unklar ist: keine Zieltabellen aendern, `nicht_umsetzbar` setzen oder Vorschlag offen lassen, Grund protokollieren, Laufanker mit `Ergebnis = nicht_umsetzbar` schreiben.

## Output-Vertraege

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

Ein Lauf ohne Aenderung ist gueltig, wenn `Ergebnis = keine_Aenderung` protokolliert wird. Vollstaendige Prompts, Rohantworten, Testdaten und Snapshots bleiben ausserhalb der Mappe.

## Compliance-Pruefung

`agentComplianceHarness.mjs` prueft ausserhalb der Nutzeroberflaeche:

- geaenderte Tabellen liegen im erlaubten Rollenbereich.
- verbotene Statuswerte wurden nicht gesetzt.
- ID- und Fingerprint-Regeln sind eingehalten.
- wiederholter Lauf erzeugt keine doppelten Zielzeilen.
- Laufanker ist vorhanden.
- unklare Umsetzung erzeugt keine Zieltabellen-Aenderung.

Im Excel-Master bleibt nur die pruefbare Zusammenfassung. Das haelt `98_Kontrollspur` minimal und verhindert, dass V1 wieder zur Agentenplattform wird.

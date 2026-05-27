# Finanzmodell - Agentenworkflow

Stand: 18.05.2026

Diese Datei beschreibt, wie Agenten neue Inputs, Analysen, Recherchen und angenommene Vorschlaege fuer das Familien-Finanzmodell bearbeiten. Sie ist die Methodikreferenz fuer die Tabellen `70_Agentenworkflow`, `71_Agent_Auftraege`, `72_Agent_Pruefregeln`, `73_Agent_Vorschlaege` und `74_Agent_Laufprotokoll`.

Excel bleibt die sichtbare Steuerungs- und Auditoberflaeche. Diese Markdown-Datei beschreibt, wie ein Agent die dort referenzierten Methodiken ausfuehrt. Spaeter kann daraus optional ein eigener Skill fuer Analyse- oder Import-Agenten entstehen.

## Grundprinzipien

- Dateien oder Informationen koennen per Chat-Upload, Pfadangabe oder Ablage in `00_Eingang` bereitgestellt werden.
- Der Agent darf die Datei sofort analysieren und nach Analyse direkt in den finalen Ordner verschieben oder kopieren.
- Originaldateien werden nicht inhaltlich veraendert oder ueberschrieben.
- Final abgelegte Dateien erhalten grundsaetzlich einen sprechenden Modellnamen; der Originaldateiname wird in `90_Quellen` dokumentiert.
- Ein technischer Dateihash darf erzeugt werden, um Dubletten und unveraenderte Originale zu erkennen.
- Import, Analyse, Recherche und Umsetzung sind getrennte Rollen und getrennte Laeufe.
- Der Import-Agent schreibt erkannte Daten direkt in Zieltabellen.
- Der Analyse-Agent erzeugt Vorschlaege oder Auftraege, aber keine stillen fachlichen Endentscheidungen.
- Der Recherche-Agent dokumentiert externe Werte als Quellen, Datenstaende oder Vorschlaege.
- Der Umsetzungs-Agent setzt angenommene Vorschlaege um, ohne neue fachliche Entscheidungen zu erfinden.
- Excel-Checks und Warnungen zeigen offene, unsichere oder ueberfaellige Punkte. Der Agent ist kein dauerhaft laufender Pruefprozess.

## Rollen

### Import-Agent

Aufgabe: Neue Inputs in das Modell uebernehmen.

Darf:

- Input entgegennehmen oder am genannten Pfad lesen.
- Datei final ablegen.
- Quelle in `90_Quellen` erfassen.
- bekannte Rohdaten importieren.
- eindeutige Belegwerte in Zieltabellen schreiben.
- `Quelle_ID` setzen.
- fachlichen `Status` setzen, meist `belegt`, bei Unsicherheit `offen`, bei Annahmen ohne Beleg `geschaetzt`.
- Folgeauftraege in `71_Agent_Auftraege` erzeugen, wenn Analyse, Recherche oder Umsetzung noetig ist.
- Lauf in `74_Agent_Laufprotokoll` dokumentieren.

Darf nicht:

- neue Regelzahlungen oder Transferregeln final aktivieren.
- neue Kategorien final umbauen, wenn Entscheidungsspielraum besteht.
- bestehende belastbare Informationen still ueberschreiben.
- fachlich `geprueft` setzen, ausser eine spaeter klar definierte Pruefregel erlaubt es.

### Pruef-/Analyse-Agent

Aufgabe: Nachgelagert Muster, Widersprueche und Verbesserungen erkennen.

Darf:

- Aufgaben aus `71_Agent_Auftraege` bearbeiten.
- Regeln aus `72_Agent_Pruefregeln` manuell oder turnusmaessig ausfuehren.
- Vorschlaege in `73_Agent_Vorschlaege` erzeugen.
- neue Folgeauftraege in `71_Agent_Auftraege` erzeugen.
- Lauf in `74_Agent_Laufprotokoll` dokumentieren.

Darf nicht:

- Vorschlaege automatisch als finale Regeln aktivieren.
- fachliche Entscheidungen still uebernehmen.
- Status `geprueft` setzen, ausser eine spaeter klar definierte Pruefregel erlaubt es.

### Recherche-Agent

Aufgabe: Externe Werte und aktuelle Daten recherchieren.

Darf:

- aktuelle externe Werte recherchieren, wenn der Nutzer es beauftragt oder eine aktive Pruefregel faellig ist.
- neue Quellen in `90_Quellen` erfassen.
- neue Datenstaende oder Annahmenzeilen in Zieltabellen schreiben, wenn das Modell eine Historisierung erlaubt.
- Vorschlaege erzeugen, wenn eine bestehende Annahme oder Modelllogik geaendert werden sollte.
- Lauf in `74_Agent_Laufprotokoll` dokumentieren.

Darf nicht:

- bestehende Annahmen still ueberschreiben.
- externe Werte ohne Quelle, Standdatum oder Abrufdatum als belastbar eintragen.

### Umsetzungs-Agent

Aufgabe: Angenommene Vorschlaege in Modellveraenderungen ueberfuehren.

Darf:

- Vorschlaege mit `Status = angenommen` und leerem oder `nicht_beauftragt`em `Umsetzungsstatus` in Umsetzungsauftraege ueberfuehren.
- Auftraege vom Typ `Umsetzung` abarbeiten.
- Zieltabellen gemaess eindeutigem Vorschlag aktualisieren.
- `73_Agent_Vorschlaege.Umsetzungsstatus`, `Umsetzungsauftrag_ID`, `Umsetzung_Zieltabelle` und `Umsetzung_Ziel_ID` aktualisieren.
- Lauf in `74_Agent_Laufprotokoll` dokumentieren.

Darf nicht:

- aus einem angenommenen Vorschlag eine neue fachliche Entscheidung ableiten.
- bei neuer Unklarheit still fortfahren. In diesem Fall bleibt der Auftrag offen oder wird `nicht_umsetzbar`.

## Standardstatus fuer Zieltabellen

Fachliche Zieltabellen nutzen als Standard:

- `offen`: erfasst, aber noch nicht belastbar eingeordnet oder geprueft.
- `belegt`: aus einer Quelle uebernommen oder durch Rohdaten nachvollziehbar belegt.
- `geprueft`: fachlich bestaetigt.
- `geschaetzt`: bewusster Schaetz- oder Annahmewert.
- `inaktiv`: nicht mehr gueltig oder nicht mehr modellwirksam.

Der Import-Agent schreibt eindeutige Belegwerte typischerweise mit `Status = belegt`. Wenn die Zuordnung unsicher ist, nutzt er `Status = offen`. Annahmen ohne Beleg werden `geschaetzt`. Checks und Dashboard machen offene, geschaetzte oder noch nicht gepruefte kritische Werte sichtbar.

## Agenten-Compliance V1

Agentenlaeufe muessen wiederholbar und pruefbar sein. Jeder Lauf soll sich an diese Output-Matrix halten.

| Rolle | Darf schreiben | Darf nicht schreiben oder setzen |
|---|---|---|
| Import-Agent | `90_Quellen`, `10_Importlaeufe`, `10_Umsaetze_Roh`, initiale Zeilen in `11_Umsaetze_Modell`, Folgeauftraege, Laufprotokoll | keine bestaetigten Regelzahlungen, keine bestaetigten Transferregeln, kein `Status = geprueft` |
| Pruef-/Analyse-Agent | `12_Regelzahlung_Vorschlaege`, `73_Agent_Vorschlaege`, `71_Agent_Auftraege`, `74_Agent_Laufprotokoll`, berechnete Warnhinweise | keine finalen Kategorie-, Regelzahlungs-, Transfer- oder Szenarioentscheidungen |
| Recherche-Agent | `90_Quellen`, historisierte Datenstaende, Annahmenzeilen oder Vorschlaege, Laufprotokoll | keine stillen Ueberschreibungen belegter/gepruefter Werte, keine externen Werte ohne Quelle/Standdatum/Abrufdatum als belastbar |
| Umsetzungs-Agent | Zieltabellen gemaess angenommenem eindeutigen Vorschlag, Auftraege, Vorschlagsstatus, Laufprotokoll | keine Interpretation unklarer Vorschlaege, keine Umsetzung ohne `Umsetzung_Eindeutig = ja`, keine erneute Umsetzung erledigter Vorschlaege |

Idempotenzregeln:

- Wiederholte Importe derselben Datei duerfen keine doppelten Netto-Rohumsaetze erzeugen.
- Wiederholte Analyse- oder Recherchelaeufe duerfen keine doppelten Vorschlaege mit gleichem `Vorschlag_Fingerprint` erzeugen.
- Warnungsbearbeitung bleibt ueber `Warnungs_Fingerprint` erhalten.
- Ein Vorschlag mit `Umsetzungsstatus = umgesetzt` oder gesetzter `Umsetzung_Ziel_ID` darf nicht erneut umgesetzt werden.
- Wenn eine Umsetzung nicht eindeutig ist, wird sie nicht geraten. Der Auftrag bleibt offen oder der Vorschlag erhaelt `Umsetzungsstatus = nicht_umsetzbar`.

Prioritaetsreihenfolge nach Umsatzimport:

1. Bekannte oder naheliegende Transfers als Kandidaten markieren, aber nicht bestaetigen.
2. Bestehende bestaetigte Regelzahlungen matchen.
3. Neue Regelzahlungsmuster als Vorschlaege erzeugen.
4. Kategorie-Mappings fuer hohe Volumen oder haeufige Gegenparteien vorschlagen.

Standardtoleranzen V1:

- Monatliche Regelzahlung: mindestens 3 Treffer, Faelligkeitstoleranz plus/minus 5 Tage.
- Quartalsweise Regelzahlung: mindestens 3 Treffer mit ungefaehr 3 Monaten Abstand.
- Jaehrliche Regelzahlung: mindestens 2 Treffer in aufeinanderfolgenden Jahren.
- Transferkandidat: gleicher oder nahezu gleicher Betrag und Buchungsabstand bis 3 Banktage, wenn Gegenbuchung sichtbar ist.
- Kategorieanalyse: Vorschlag erst bei wiederkehrender Gegenpartei oder relevantem Volumen; Supermaerkte, Kartenzahlungen und haeufige Kleinbetraege werden nicht als Vertragsregelzahlung vorgeschlagen.
- Betragstoleranz: soweit keine Regelzahlung eigene Toleranz definiert, plus/minus 5 Prozent oder mindestens 5 EUR.

## Datenfluss

### Import

1. Input entgegennehmen oder lokalisieren.
2. Original nachvollziehbar sichern oder final ablegen.
3. Inputtyp erkennen: Rohdatensatz, Beleg, Konto-/Depotstand, Vertragsinfo, manuelle Information.
4. Inhalt auslesen.
5. Quelle in `90_Quellen` dokumentieren; bei Dateiimporten verweist der Importlauf ueber `Quelle_ID` auf diese Quellenzeile.
6. Passende Zieltabellen bestimmen.
7. Erkannte Daten direkt eintragen.
8. `Quelle_ID` verknuepfen.
9. Status setzen.
10. Folgeauftraege in `71_Agent_Auftraege` erzeugen, falls Analyse, Recherche oder Umsetzung noetig ist.
11. Lauf in `74_Agent_Laufprotokoll` dokumentieren.

### Analyse

Analyse-Methodiken schreiben im Regelfall keine finalen Fachentscheidungen. Sie erzeugen:

- Vorschlaege in `73_Agent_Vorschlaege`, wenn eine Nutzerentscheidung noetig ist.
- Folgeauftraege in `71_Agent_Auftraege`, wenn weitere Arbeit noetig ist.
- Laufprotokoll in `74_Agent_Laufprotokoll`, auch wenn nichts gefunden wurde.

### Recherche

Recherche-Methodiken koennen erzeugen:

- neue Quellen in `90_Quellen`
- neue Datenstaende oder historisierte Annahmenzeilen in Zieltabellen
- Vorschlaege in `73_Agent_Vorschlaege`, wenn eine Entscheidung oder Modellanpassung noetig ist
- Folgeauftraege in `71_Agent_Auftraege`
- Laufprotokoll in `74_Agent_Laufprotokoll`

### Umsetzung

1. Vorschlaege mit `Status = angenommen` und leerem oder `nicht_beauftragt`em `Umsetzungsstatus` suchen.
2. Falls noetig, Umsetzungsauftrag in `71_Agent_Auftraege` erzeugen.
3. Auftrag abarbeiten.
4. Zieltabellen gemaess Vorschlag aktualisieren.
5. Auftrag und Vorschlag aktualisieren.
6. Lauf protokollieren.

## Methodiken

### `METH_INIT_1ON1`

Zweck: Den Nutzer dialogisch durch die Erstbefuellung des Finanzmodells fuehren, damit die Mappe schnell nutzbar wird und offene Punkte sichtbar bleiben.

Prinzip:

- Der Init-Agent arbeitet im 1:1-Dialog, nicht als statischer Fragebogen.
- Jeder Abschnitt folgt dem Muster: fragen, erfassen/importieren, zusammenfassen, bestaetigen lassen.
- Bestaetigte Daten werden direkt in Zieltabellen geschrieben.
- Unsichere Werte werden als `offen`, `geschaetzt` oder `platzhalter` markiert.
- Entscheidungspflichtige Muster werden als Vorschlag oder Auftrag erfasst, nicht still final aktiviert.
- Der Init-Agent nutzt frueh historische Kontoimporte, um die manuellen Fragen zu reduzieren.

Empfohlene Reihenfolge:

1. Start und Orientierung: Ziel, Statuswerte, Quellenlogik, keine stillen Annahmen.
2. Personen und Haushalt: P01, P02, Haushalt, Geburtsdaten, Renteneintrittsalter, grober Erwerbsstatus.
3. Kontenliste erfassen: Girokonten, Tagesgeld, Depots, Verrechnungskonten, Darlehens-/Kreditkonten, Eigentuemer, Anbieter und aktueller Stand soweit bekannt.
4. Grosser Startimport je Konto: fuer jedes verfuegbare Konto einen moeglichst langen historischen Datensatz importieren, z. B. 12 bis 36 Monate oder den maximal sinnvoll verfuegbaren Zeitraum.
5. Automatische Vorschlagsanalyse aus Startimport: Kategorien, wiederkehrende Zahlungen, interne Transfers, Sparplaene, Darlehenszahlungen, Mieten, Gehaltseingaenge, auffaellige Buchungen und unklare Gegenparteien erkennen.
6. Vorschlaege mit Nutzer pruefen: offensichtliche Kategorien bestaetigen, unklare Muster offen lassen, wichtige Regelzahlungen oder Transferregeln als Vorschlag erfassen.
7. Regelmaessige Einnahmen vervollstaendigen: Gehalt, Kindergeld, Mieten, sonstige laufende Einnahmen, Person-/Haushaltszuordnung.
8. Regelmaessige Ausgaben vervollstaendigen: Wohnen, Versicherungen, Kredite, Lebenshaltung, Mobilitaet, Familie, wiederkehrende Vertraege.
9. Immobilien und Darlehen erfassen: Objekte, Nutzung, Eigentumsanteile, Werte, Darlehen, Mieten, Hausgeld, Rueckstellungen.
10. Versicherungen und Vorsorge erfassen: Schutzvertraege, private Vorsorge, Riester/Ruerup, Ablaufleistungen, Beitraege, Rentenwirkung.
11. Renten und Zukunftsereignisse erfassen: gesetzliche Rente, Betriebsrente, private Renten, Werksrente, Einmalauszahlungen, Darlehensenden.
12. Szenario und Arbeitsende erfassen: Arbeitsende P01/P02, Planungsende, Sicherheitsreserve und zentrale Annahmen bestaetigen oder offen lassen.
13. Review und Nacharbeitsliste: befuellte Bereiche, geschaetzte Werte, fehlende Quellen, offene Vorschlaege, rote/gelbe Checks und naechste Aktionen zeigen.
14. Abschluss: Dashboard-Status erklaeren, offene Punkte in `71_Agent_Auftraege` festhalten und Lauf in `74_Agent_Laufprotokoll` dokumentieren.

Regeln fuer den grossen Startimport:

- Pro Konto wird ein eigener Importlauf in `10_Importlaeufe` angelegt.
- Der Importzeitraum soll gross genug sein, um monatliche, quartalsweise und jaehrliche Muster zu erkennen.
- Wenn mehrere Konten importiert werden, werden Transfers zwischen diesen Konten nur als Kandidaten markiert, bis der Nutzer sie bestaetigt.
- Importierte Rohdaten bleiben originalnah in `10_Umsaetze_Roh`.
- Aufbereitete Buchungen in `11_Umsaetze_Modell` duerfen initial mit Vorschlagsstatus, offenen Kategorien oder Transferkandidaten arbeiten.
- Automatisch erkannte Regelzahlungen, Transferregeln oder Kategorie-Mappings werden als Vorschlaege erfasst, nicht direkt final aktiviert.

Typische Outputs:

- aktualisierte `01_Personen`, `03_Konten`, `10_Importlaeufe`, `10_Umsaetze_Roh`, `11_Umsaetze_Modell`
- Vorschlaege in `12_Regelzahlung_Vorschlaege` und `73_Agent_Vorschlaege`
- Transferkandidaten in `11_Umsaetze_Modell` und optional Vorschlaege fuer `11_Transferregeln`
- ergaenzte Werte in `12_Regelzahlungen`, `04_Immobilien`, `05_Darlehen`, `06_Versicherungen`, `07_Rente`, `41_Ereignisse`, `42_Annahmen`, wenn der Nutzer sie bestaetigt
- Folgeauftraege in `71_Agent_Auftraege`
- Lauf in `74_Agent_Laufprotokoll`

### `METH_IMPORT_INPUT`

Zweck: Jeden neuen Input so weit wie moeglich direkt in das Finanzmodell uebernehmen.

Gilt fuer:

- Chat-Uploads
- Pfadangaben
- Dateien in `00_Eingang`
- CSV, PDF, JPEG/Scan, Excel/Export
- einzelne oder mehrere Dateien
- manuelle Chat-Informationen

Regeln:

- Dateiablage ist Teil des Imports, keine eigene Methodik.
- Erkannte Rohdaten oder Belegwerte werden direkt in Zieltabellen geschrieben.
- Keine bestehende belastbare Information wird still ueberschrieben.
- Wenn zeitliche Historie relevant ist, wird eine neue Zeile oder ein versionierter Wert angelegt.
- Wenn ein Widerspruch oder Entscheidungsspielraum entsteht, erzeugt der Agent einen Auftrag oder Vorschlag.

Typische Outputs:

- `90_Quellen`
- `10_Importlaeufe`
- Zieltabellen wie `03_Konten`, `05_Darlehen`, `06_Versicherungen`, `07_Rente`, `12_Regelzahlungen`, `10_Umsaetze_Roh`, `20_Vermoegen`, `41_Ereignisse`, `42_Annahmen`
- optional `71_Agent_Auftraege`
- `74_Agent_Laufprotokoll`

### `METH_ANALYSE_REGELZAHLUNGEN`

Zweck: Neue oder geaenderte wiederkehrende Zahlungen erkennen.

Leitlogik:

- Gruppiere Umsaetze nach Vorzeichen, Gegenpartei, IBAN und stabilem Verwendungszweckmuster.
- Monatliche Kandidaten ab mindestens 3 Treffern erkennen.
- Quartalsweise Kandidaten ab mindestens 3 Treffern mit ungefaehr 3 Monaten Abstand erkennen.
- Jaehrliche Kandidaten ab mindestens 2 Treffern in aufeinanderfolgenden Jahren erkennen.
- Datumstoleranz und Betragstoleranz anwenden.
- Variable, aber regelmaessige Zahlungen separat markieren.
- Kartenzahlungen, Supermaerkte und haeufige Kleinbetraege nicht automatisch als Vertragsregelzahlungen vorschlagen.

Output:

- Musterzeilen in `12_Regelzahlung_Vorschlaege`
- entscheidungspflichtige Vorschlaege in `73_Agent_Vorschlaege`, typischerweise `Vorschlagstyp = neue_Regelzahlung`
- keine direkte Aktivierung in `12_Regelzahlungen`

### `METH_ANALYSE_TRANSFERS`

Zweck: Interne Umbuchungen, Sparplaene, Depotbewegungen, Darlehenszahlungen und Rueckerstattungen erkennen.

Leitlogik:

- Suche nach bekannten eigenen Namen, Konten, IBANs und Verwendungszwecken.
- Suche nach Gegenbuchungen mit gleichem oder nahem Betrag und kurzem Datumsabstand.
- Erkenne Sparplan-, Depot-, Darlehens- und Haushaltsumbuchungs-Muster.
- Markiere unklare Kandidaten als Vorschlag, nicht als finale Neutralisierung.

Output:

- Vorschlaege in `73_Agent_Vorschlaege`, typischerweise `neue_Transferregel`
- optional Folgeauftraege fuer unklare Gegenbuchungen

### `METH_ANALYSE_KATEGORIEN`

Zweck: Kategorie- und Gegenparteien-Mappings verbessern.

Leitlogik:

- Suche hohe Volumen in `Sonstiges / zu pruefen`.
- Suche neue Gegenparteien mit vielen Treffern.
- Erkenne offensichtliche Haendler- oder Anbietergruppen.
- Unterscheide Kategorie-Mapping von Regelzahlung: Supermaerkte koennen Kategorie-Mappings sein, aber normalerweise keine Regelzahlungen.

Output:

- Vorschlaege in `73_Agent_Vorschlaege`, typischerweise `Kategorie_Mapping`

### `METH_ANALYSE_WIDERSPRUCH`

Zweck: Neue Belege, Importe oder Werte gegen bestehende Modellwerte pruefen.

Leitlogik:

- Vergleiche neue Werte mit bestehenden Datensaetzen derselben Person, Quelle, Police, Darlehen, Immobilie, Konto oder Annahme.
- Erkenne Betragsspruenge, Datumsabweichungen, abweichende Vertragsnummern, geaenderte Laufzeiten oder neue Gueltigkeitszeitraeume.
- Bestehende historisierte Werte nicht ueberschreiben, wenn eine neue Zeile mit Gueltigkeitszeitraum sauberer ist.

Output:

- Vorschlaege in `73_Agent_Vorschlaege`, typischerweise `Datenwiderspruch` oder `neue_Annahme`
- optional Folgeauftraege in `71_Agent_Auftraege`

### `METH_RECHERCHE_EXTERNE_WERTE`

Zweck: Externe Werte wie Fonds-/Depotwerte, Zinssaetze, Inflation oder andere zentrale Annahmen aktualisieren.

Regeln:

- Aktuelle externe Werte muessen mit Quelle, Standdatum und Abrufdatum dokumentiert werden.
- Instabile externe Informationen sollen mit aktueller Quelle geprueft werden.
- Bestehende Annahmen werden nicht still ueberschrieben.
- Wenn eine neue Information eine Planannahme ersetzen soll, entsteht eine neue Annahmenzeile oder ein Vorschlag.

Output:

- `90_Quellen`
- Zieltabellen wie `20_Vermoegen`, `42_Annahmen` oder spaetere Depotwerttabellen
- Vorschlaege in `73_Agent_Vorschlaege`, wenn Entscheidung noetig ist
- `74_Agent_Laufprotokoll`

### `METH_UMSETZUNG_VORSCHLAG`

Zweck: Angenommene Vorschlaege in konkrete Modellveraenderungen ueberfuehren.

Regeln:

- Suche Vorschlaege mit `Status = angenommen` und leerem oder `nicht_beauftragt`em `Umsetzungsstatus`.
- Erzeuge bei Bedarf einen Auftrag in `71_Agent_Auftraege`.
- Setze nur das um, was im Vorschlag fachlich entschieden wurde.
- Zieltabellen duerfen nur geaendert werden, wenn `Umsetzung_Eindeutig = ja` ist.
- Vorschlaege mit `Umsetzungsstatus = umgesetzt` oder gesetzter `Umsetzung_Ziel_ID` werden uebersprungen.
- Wenn bei der Umsetzung neue Unklarheiten entstehen, wird nicht still weiterentschieden.

Typische Umsetzungen:

- `neue_Regelzahlung` -> `12_Regelzahlungen`
- `neue_Transferregel` -> `11_Transferregeln`
- `Kategorie_Mapping` -> `02_Kategorien` oder spaetere Mappingtabelle
- `neue_Annahme` -> `42_Annahmen`
- `externe_Aktualisierung` -> passende Ziel- oder Annahmentabelle
- `Strukturanpassung` -> neuer Auftrag oder neue Designentscheidung, nicht automatisch

Output:

- aktualisierte Zieltabellen
- aktualisierte `71_Agent_Auftraege`
- aktualisierte `73_Agent_Vorschlaege`
- `74_Agent_Laufprotokoll`

## Initiale Pruefregeln V1

Die folgenden Regeln bilden den Startkatalog fuer `72_Agent_Pruefregeln`:

- `REG_INIT_ERSTBEFUELLUNG`: dialogische Erstbefuellung mit grossem Startimport je Konto und anschliessender Vorschlagsanalyse.
- `REG_IMPORT_NACHARBEIT`: nach jedem Import Widersprueche und Folgearbeit pruefen.
- `REG_NEUE_REGELZAHLUNGEN`: nach Bank-/Umsatzimport neue oder geaenderte wiederkehrende Zahlungen suchen.
- `REG_NEUE_TRANSFERS`: nach Bank-/Umsatzimport interne Umbuchungen, Sparplaene, Depotbewegungen und Darlehenszahlungen suchen.
- `REG_KATEGORIEN_VERBESSERN`: nach Bank-/Umsatzimport Kategorie-Mappings verbessern.
- `REG_ANGENOMMENE_VORSCHLAEGE_UMSETZEN`: angenommene, noch nicht umgesetzte Vorschlaege in Auftraege und Modellveraenderungen ueberfuehren.
- `REG_EXTERNE_WERTE_QUARTAL`: quartalsweise Fonds-/Depotwerte, relevante Zinssaetze und ggf. Marktwerte aktualisieren.
- `REG_ANNAHMEN_JAEHRLICH`: jaehrlich Inflation, Zinsannahmen, Rentensteigerung und zentrale Annahmen pruefen.
- `REG_VERTRAEGE_AUSLAUFEND`: monatlich oder quartalsweise Zinsbindungen, Versicherungen, Darlehen, Vertragsenden und relevante Fristen suchen.

Jede V1-Pruefregel ist grundsaetzlich manuell ausloesbar. Der normale Ausloeser steuert nur, wann eine Regel empfohlen oder automatisch in Aufgaben ueberfuehrt wird.

## Dashboard- und Check-Sichtbarkeit

Das Dashboard soll mindestens sichtbar machen:

- offene Agentenvorschlaege
- hoch priorisierte offene Agentenvorschlaege
- angenommene Vorschlaege ohne Umsetzungsauftrag
- offene Agentenauftraege
- ueberfaellige Agentenauftraege
- fehlerhafte Agentenlaeufe
- naechste empfohlene Aktion aus offenen Auftraegen oder Vorschlaegen

`99_Checks` soll mindestens pruefen:

- angenommene Vorschlaege ohne `Umsetzungsauftrag_ID`
- `auftrag_erstellt`, aber Auftrag ueberfaellig oder nicht erledigt
- Vorschlaege zu lange `offen`
- Umsetzungen mit `Umsetzungsstatus = nicht_umsetzbar`
- fehlerhafte Agentenlaeufe im `74_Agent_Laufprotokoll`

---

## These-Schaerfung: Output-Vertraege fuer Agentenlaeufe

Diese Ergaenzung macht die Rollen fuer Tests und spaetere Subagentenlaeufe baubarer. Jeder Agentenlauf liefert einen strukturierten Output-Vertrag, der gegen `agentComplianceHarness.mjs` und spaeter gegen Snapshot-Tests geprueft werden kann.

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

Regel: Wenn ein Agent nichts aendert, ist das trotzdem ein gueltiges Ergebnis (`keine_Aenderung`) und wird protokolliert. Ein leerer Lauf ohne Protokoll gilt als Fehler.

### Import-Agent: harter Output-Vertrag

Der Import-Agent darf pro Lauf nur diese fachlichen Ergebnisgruppen erzeugen:

| Gruppe | Ziel |
|---|---|
| `quelle` | Neue oder aktualisierte Zeile in `90_Quellen`. |
| `importlauf` | Neue Zeile in `10_Importlaeufe`. |
| `rohumsatz_rows` | Append-only-Zeilen in `10_Umsaetze_Roh`. |
| `modell_rows` | Initiale Zeilen in `11_Umsaetze_Modell`. |
| `folgeauftraege` | Eintraege in `71_Agent_Auftraege`, wenn Analyse/Recherche/Umsetzung noetig ist. |
| `laufprotokoll` | Eintrag in `74_Agent_Laufprotokoll`. |

Verbotene Ergebnisse:

- `12_Regelzahlungen.Status = bestaetigt`
- `11_Transferregeln.Status = bestaetigt`
- `11_Umsaetze_Modell.Transfer_Status = bestaetigter_transfer`
- `Status = geprueft`
- automatische `Person_ID = HH` ohne bestaetigte Transferregel mit `auto_person_id: HH`

### Pruef-/Analyse-Agent: harter Output-Vertrag

Der Pruef-/Analyse-Agent erzeugt keine finalen Modellwerte. Zulaessige Ergebnisgruppen:

- `vorschlaege` in `73_Agent_Vorschlaege`
- fachliche Musterzeilen in `12_Regelzahlung_Vorschlaege`
- berechnete oder vorgeschlagene Warnhinweise
- Folgeauftraege in `71_Agent_Auftraege`
- Laufprotokoll

Jeder Vorschlag muss mindestens enthalten:

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

Regel: Wenn `Umsetzung_Eindeutig = ja`, muessen `Ziel_Tabelle` und `Umsetzung_Details` so konkret sein, dass der Umsetzungs-Agent keine neue fachliche Entscheidung treffen muss.

### Recherche-Agent: harter Output-Vertrag

Recherche-Ergebnisse brauchen immer:

- Quelle oder Quellenhinweis.
- Standdatum fuer den fachlichen Wert, wenn verfuegbar.
- Abrufdatum bei externen Online-Werten.
- Status, der Unsicherheit sichtbar macht.

Bestehende belegte oder gepruefte Annahmen werden nicht ueberschrieben. Stattdessen entsteht:

- eine neue historisierte Annahmenzeile, oder
- ein Vorschlag in `73_Agent_Vorschlaege`, wenn die Uebernahme eine Entscheidung braucht.

### Umsetzungs-Agent: harter Output-Vertrag

Der Umsetzungs-Agent arbeitet nur mit Vorschlaegen:

```text
Status = angenommen
AND Umsetzung_Eindeutig = ja
AND Umsetzungsstatus IN (leer, nicht_beauftragt, auftrag_erstellt)
AND Umsetzung_Ziel_ID leer
```

Nach erfolgreicher Umsetzung setzt er:

- `Umsetzungsstatus = umgesetzt`
- `Umsetzungsauftrag_ID`
- `Umsetzung_Zieltabelle`
- `Umsetzung_Ziel_ID`

Wenn eine Umsetzung trotz angenommener Entscheidung unklar ist:

- keine Zieltabellen aendern,
- `Umsetzungsstatus = nicht_umsetzbar` setzen oder Auftrag offen lassen,
- Grund im Laufprotokoll und Vorschlag kommentieren.

### Compliance-Pruefung

`agentComplianceHarness.mjs` prueft fuer jeden simulierten Lauf mindestens:

- geaenderte Tabellen liegen im erlaubten Rollenbereich,
- verbotene Statuswerte wurden nicht gesetzt,
- ID- und Fingerprint-Regeln sind eingehalten,
- wiederholter Lauf erzeugt keine doppelten Zielzeilen,
- Laufprotokoll ist vorhanden,
- unklare Umsetzung erzeugt keine Zieltabellen-Aenderung.

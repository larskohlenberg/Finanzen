# Architekturvorschlag Runde 2: lokale Finanzmodell-App

Stand: 27.05.2026

## Zielbild

Runde 2 wird als lokale, agentenfreundliche Finanzmodell-App gebaut. Der Master liegt nicht mehr in Excel, sondern in validierbaren Dateien. Die Oberflaeche ist zuerst eine statische HTML/JavaScript-App, die ohne Webserver geoeffnet werden kann. Ein lokaler Backend-Anteil entsteht nur dort, wo deterministische Validierung, Import, Migration oder Export robuster als reine Browserlogik sind.

Die Baufolge ist bewusst konservativ:

1. Grundgeruest und Oberflaechen-Prototyp
2. Stammdaten
3. Bewegungsdaten
4. Cashflow, Vorschlaege, Auswertungen, Exporte und Agentenprozesse

Ab dem ersten produktiven Datenstand duerfen weitere Meilensteine bestehende Daten nur ueber versionierte Schemas, Migrationen, Backups und Validierungsberichte veraendern.

## Architekturentscheidung

Empfohlen wird eine Local-First-Dateiarchitektur mit zwei Betriebsarten.

### Betriebsart 1: statische App

Die erste nutzbare App liegt in `app/`:

```text
app/index.html
app/styles.css
app/main.js
```

Eigenschaften:

- Start per Doppelklick oder Browser-Datei oeffnen.
- Daten werden per Dateiimport geladen, nicht per verstecktem Zugriff auf lokale Pfade.
- Ergebnisse und Aenderungsvorschlaege werden als Datei exportiert.
- Keine Build-Pipeline, keine externen Runtime-Abhaengigkeiten fuer den ersten Schnitt.
- Geeignet fuer Oberflaechen-Review, Datenqualitaetsblick, einfache Stammdaten- und Transaktionssicht.

Diese Betriebsart bleibt wichtig, weil sie niedrigschwellig, nachvollziehbar und ohne Server lauffaehig ist.

### Betriebsart 2: lokaler Werkzeuglauf

Parallel entsteht ein lokales Backend als CLI/Werkzeugschicht, nicht sofort als dauerhafter Server:

```text
tools/
  validate.mjs
  import-bank-csv.mjs
  export-bundle.mjs
  migrate.mjs
```

Eigenschaften:

- Validiert Masterdaten gegen Schemas und Referenzregeln.
- Erzeugt Importvorschlaege aus Kontoauszuegen.
- Fuehrt Migrationen kontrolliert aus.
- Erzeugt Export-Bundles fuer die statische App und spaeter Excel/CSV/PDF.
- Kann spaeter optional als lokaler HTTP-Service wachsen, wenn echte Schreib-Workflows in der UI gebraucht werden.

Der lokale Werkzeuglauf ist der "Backend"-Teil der ersten Version. Ein permanenter Webserver ist fuer M1/M2 nicht noetig und wuerde die lokale Nutzbarkeit unnoetig erschweren.

## Frontend

### Starttechnologie

Fuer den Anfang: Vanilla HTML, CSS und JavaScript.

Begruendung:

- Passt zur vorhandenen Vorgabe `app/index.html` ohne Webserver.
- Weniger bewegliche Teile beim Aufbau der Daten- und Validierungsbasis.
- Gut geeignet fuer schnelles Rapid Prototyping der Oberflaechen.
- Der Nutzer kann frueh beurteilen, ob fachliche Sichten fehlen.

### Spaetere Ausbaustufe

Wenn die App nach Stammdaten, Bewegungsdaten und Review-Workflows deutlich komplexer wird, kann auf Vite plus React oder eine aehnliche lokale Frontend-Struktur migriert werden. Diese Migration sollte erst nach einem stabilen Datenvertrag erfolgen, nicht vorher.

### Hauptansichten

Fruehe Oberflaechen sollten nicht wie eine Landingpage wirken, sondern wie ein Arbeitswerkzeug:

- Dashboard: Datenqualitaet, offene Punkte, Basiskennzahlen
- Stammdaten: Personen, Konten, Kategorien, Quellen
- Bewegungsdaten: Transaktionen, offene Kategorien, Transfers
- Vorschlaege: Importvorschlaege, Kategorie-/Regelzahlungsvorschlaege
- Checks: Validierungsfehler, Warnungen, offene Entscheidungen
- Export: Datenbundle herunterladen, spaeter Excel/CSV/PDF

### Rapid Prototyping

Vor tiefer Implementierung wird ein klickbarer Oberflaechen-Prototyp gebaut:

- Mit Demo-Fixtures, nicht mit produktiven Daten.
- Mit den spaeter erwarteten Navigationseinheiten.
- Mit bewusst sichtbaren leeren Zustaenden und Warnhinweisen.
- Mit Beispielkarten oder Tabellen fuer Stammdaten, Transaktionen, Checks und Vorschlaege.
- Ziel ist fachlicher Abgleich: Fehlen Ansichten, Filter, Status oder Review-Aktionen?

Der Prototyp darf noch nicht als fuehrender Dateneditor missverstanden werden. Er ist ein UI-Vertrag, kein produktiver Datenvertrag.

## Backend

### Start: CLI statt Server

Das Backend beginnt als deterministische Node.js-Werkzeugschicht. Sie liest Dateien, validiert sie und schreibt neue Artefakte. Das ist fuer Agenten und lokale Nutzung besser kontrollierbar als ein frueher Server.

Empfohlene Aufgaben:

- `validate`: Schemas, Pflichtfelder, erlaubte Werte, Referenzen, fachliche Minimalchecks
- `bundle`: validierten Datenstand zu einem UI-ladbaren Paket zusammenfassen
- `import`: Kontoauszuege in Vorschlagsdateien umwandeln
- `apply`: angenommene Vorschlaege kontrolliert in Masterdaten uebernehmen
- `migrate`: Datenstaende zwischen Schema-Versionen ueberfuehren
- `export`: Excel/CSV/PDF aus validierten Daten erzeugen

### Spaeter: lokaler Service nur bei Bedarf

Ein lokaler HTTP-Service wird erst sinnvoll, wenn die UI produktiv schreiben soll, zum Beispiel fuer gefuehrte CRUD-Dialoge, Akzeptieren von Vorschlaegen oder Massenoperationen. Dann bleibt er lokal und optional:

```text
localhost-only service
  /api/validate
  /api/load
  /api/proposals
  /api/apply
  /api/export
```

Der Service darf keine stille Magie einfuehren. Jede Schreibaktion erzeugt weiterhin Dateien, Auditspur und Validierungsbericht.

## Datenhaltung

### Fuehrender Master

Fuehrende Daten liegen in `data/master/`:

```text
data/master/personen.json
data/master/konten.json
data/master/kategorien.json
data/master/quellen.json
data/master/transaktionen.jsonl
data/master/vorschlaege.jsonl
data/master/checks.json
```

Grundregel:

- Stammdaten als JSON.
- Grosse Bewegungsdaten als JSONL.
- Vorschlaege und Agentenlaeufe append-orientiert als JSONL.
- Auswertungen werden berechnet, nicht als Master gepflegt.

### UI-Bundle

Weil eine statische Datei-App nicht einfach lokale Ordner lesen darf, sollte es zusaetzlich ein exportiertes UI-Bundle geben:

```text
data/exports/current-finance-bundle.json
```

Dieses Bundle wird aus validierten Masterdaten erzeugt und in der UI per Dateiimport geladen. Es ist nicht der Master, sondern ein bequemes Transportformat fuer die Oberflaeche.

### Produktive Daten ab M1/M2

Sobald echte Daten im System liegen, gelten harte Datenhaltungsregeln:

- Vor jeder Migration wird ein Snapshot unter `data/exports/snapshots/` erzeugt.
- Jede Masterdatei hat eine Schema-Version oder wird ueber ein Manifest versioniert.
- Neue Felder sind zuerst optional oder werden mit Migration und Default-Regeln eingefuehrt.
- Keine Loeschung ohne Tombstone, Archiv oder nachvollziehbaren Aenderungsdatensatz.
- Vorschlaege bleiben von bestaetigten Masterdaten getrennt.
- Fehlerhafte Imports schreiben nie direkt in `data/master/`.

### SQLite-Option

SQLite ist mittelfristig sinnvoll, wenn Abfragen, Datenmenge oder UI-Schreibfluesse wachsen. Es sollte aber nicht der erste Master sein.

Moeglicher Zeitpunkt:

- Nach stabilen Stammdaten und Bewegungsdaten.
- Nach geklaerten Import- und Review-Workflows.
- Wenn die UI viele Filter, Aggregationen und Schreibaktionen braucht.

Dann kann SQLite als lokaler abgeleiteter Index dienen, waehrend JSON/JSONL zunaechst weiter die auditierbare Quelle bleibt. Ein vollstaendiger Wechsel zu SQLite als Master sollte eine eigene Architekturentscheidung sein.

## Meilensteinplan

Jeder Meilenstein liefert ein nutzbares Artefakt. Ab M2 ist der vorhandene Datenbestand wie produktiv zu behandeln.

### M0.1 - Architektur- und UI-Vertrag

Ziel: Die lokale Zielarchitektur und die ersten Oberflaechen sind fachlich pruefbar.

Artefakt:

- Dieses Architekturkonzept.
- Klickbarer statischer UI-Prototyp mit Demo-Daten.

Umfang:

- Navigation fuer Dashboard, Stammdaten, Bewegungsdaten, Vorschlaege, Checks, Export.
- Demo-Zustaende fuer "alles gut", "offene Kategorie", "kaputte Referenz", "Importvorschlag".
- Noch keine produktive Persistenz.

Exit-Kriterien:

- Der Nutzer kann anhand der Oberflaechen sagen, ob fachliche Sichten fehlen.
- Die wichtigsten Arbeitswege sind als Screens sichtbar.
- Der Prototyp schreibt keine Masterdaten.

### M1 - Grundgeruest und Validierungsbasis

Ziel: Der Datenvertrag ist lauffaehig.

Artefakt:

- Schemas fuer Personen, Konten, Kategorien, Quellen und Transaktionen.
- Kleiner Startdatenstand in `data/master/`.
- Lokaler Validierungslauf.

Umfang:

- ID-Konventionen.
- Pflichtfelder und Statuswerte.
- Referenzchecks zwischen Personen, Konten, Kategorien, Quellen und Transaktionen.
- Positiv- und Negativ-Testdaten.

Exit-Kriterien:

- Guter Datensatz validiert erfolgreich.
- Absichtlich fehlerhafter Datensatz scheitert mit verstaendlichem Bericht.
- Keine UI-Fachlogik, die Validierungsfehler verdeckt.

### M2 - Lokale Leseflaeche fuer Stammdaten

Ziel: Der Nutzer kann den validierten Stammdatenstand lokal ansehen.

Artefakt:

- `app/index.html` mit Dateiimport eines UI-Bundles.
- Stammdatenansichten fuer Personen, Konten, Kategorien und Quellen.
- Datenqualitaetsbereich mit Checks.

Umfang:

- Bundle-Export aus Masterdaten.
- Tabellen und Detailansichten.
- Filter fuer Status, fehlende Quelle, offene Entscheidung.
- Kein direktes produktives Editieren in der UI.

Produktivdaten-Regeln:

- Bundle ist Export, nicht Master.
- Bei Schema-Aenderungen wird zuerst Migration/Validierung erweitert.

Exit-Kriterien:

- Die App laeuft ohne Webserver.
- Ein validiertes Bundle kann geladen werden.
- Offene Stammdatenprobleme sind sichtbar.

### M3 - Gefuehrte Stammdatenpflege

Ziel: Stammdaten koennen kontrolliert erweitert oder korrigiert werden.

Artefakt:

- Vorschlagsformat fuer Stammdatenaenderungen.
- Apply-Werkzeug fuer angenommene Aenderungen.
- Auditierbarer Aenderungsbericht.

Umfang:

- Neue Person, neues Konto, neue Kategorie, neue Quelle.
- Statuswechsel und kontrollierte Korrekturen.
- Kein stilles Ueberschreiben produktiver Daten.

Produktivdaten-Regeln:

- Jede Aenderung erzeugt vorher Snapshot und danach Validierungsbericht.
- IDs bleiben stabil.
- Umbenennungen sind Aenderungen, keine neuen Entitaeten.

Exit-Kriterien:

- Eine neue Kategorie kann als Vorschlag erzeugt, geprueft und uebernommen werden.
- Kaputte Referenzen verhindern die Uebernahme.

### M4 - Bewegungsdaten-Basis

Ziel: Transaktionen werden als Bewegungsdaten sichtbar und pruefbar.

Artefakt:

- `transaktionen.jsonl` produktiv nutzbar.
- Transaktionsansicht in der lokalen App.
- Checks fuer offene Kategorien, Transfers und Quellen.

Umfang:

- Buchungsdatum, Betrag, Gegenpartei, Verwendungszweck, Konto, Kategorie, Cashflow-Wirkung.
- Offene Kategorisierung als sichtbarer Status.
- Keine Importautomatik, die direkt final schreibt.

Produktivdaten-Regeln:

- Transaktionen sind append-orientiert.
- Korrekturen laufen ueber Aenderungsvorschlaege oder explizite Feldupdates mit Auditspur.

Exit-Kriterien:

- Transaktionen koennen geladen, gefiltert und nach Datenqualitaet geprueft werden.
- Offene Kategorien werden prominent angezeigt.

### M5 - Importvorschlaege fuer Kontoauszuege

Ziel: Kontoauszuege erzeugen pruefbare Vorschlaege statt finaler Buchungen.

Artefakt:

- Import-CLI fuer mindestens ein CSV-Format.
- Schema fuer Importvorschlaege.
- Review-Ansicht fuer neue, doppelte und unsichere Transaktionen.

Umfang:

- Rohquelle und Dateihash.
- Stabiler Transaktionshash fuer Deduplikation.
- Unsichere Kategorie bleibt offen.
- Annehmen, ablehnen, zurueckstellen als Status.

Produktivdaten-Regeln:

- Import schreibt nach `data/inbox/` oder `vorschlaege.jsonl`, nicht direkt in Master.
- Uebernahme in Master nur nach Validierung und Snapshot.

Exit-Kriterien:

- Ein Kontoauszug kann als Vorschlagsliste erzeugt werden.
- Doppelte Buchungen werden erkannt oder als Risiko markiert.

### M6 - Cashflow-Ist und Regelzahlungen

Ziel: Erste echte Auswertung entsteht aus validierten Bewegungsdaten.

Artefakt:

- Cashflow-Ist-Dashboard.
- Regelzahlungsvorschlaege getrennt von bestaetigten Regelzahlungen.
- Datenqualitaetsindikator neben jeder Kennzahl.

Umfang:

- Monatsaggregation.
- Einnahmen, Ausgaben, Transfers getrennt.
- Erkennung wiederkehrender Zahlungen als Vorschlag.
- Bestaetigte Regelzahlungen als eigene Stammdaten.

Produktivdaten-Regeln:

- Prognosen kennzeichnen unbestaetigte Annahmen.
- Regelzahlungsvorschlaege werden nie automatisch modellwirksam.

Exit-Kriterien:

- Dashboard beantwortet "Was ist passiert?" belastbar.
- "Was passiert wahrscheinlich?" ist sichtbar als Prognose mit Annahmenstatus.

### M7 - Vermoegen, Verbindlichkeiten, Immobilien

Ziel: Nettovermoegen und Immobilienlogik werden quellenbasiert erfasst.

Artefakt:

- Stammdatenmodule fuer Vermoegen, Verbindlichkeiten, Immobilien und Darlehen.
- Nettovermoegenssicht in der App.
- Quellen- und Bewertungschecks.

Umfang:

- Bewertungsstanddatum.
- Quellenstatus.
- Trennung von Vermoegenswert, Darlehen, Kosten und Ertraegen.

Produktivdaten-Regeln:

- Bewertungen werden nicht still aktualisiert.
- Historische Standdaten bleiben nachvollziehbar.

Exit-Kriterien:

- Nettovermoegen wird berechnet, nicht manuell gepflegt.
- Fehlende Quellen erzeugen Checks.

### M8 - Szenarien, Ereignisse und Arbeitsende-Fragen

Ziel: Zukunftsfragen werden aus expliziten Annahmen gerechnet.

Artefakt:

- Szenario- und Annahmenmodell.
- Ereignis- und Erwerbsstatusdaten.
- Szenarioansicht mit Datenqualitaet.

Umfang:

- Gueltigkeitszeitraeume.
- Annahmenstatus.
- Liquiditaets- und Zeitachsenansicht.

Produktivdaten-Regeln:

- Keine Lebensentscheidung wird aus Platzhaltern als belastbarer Wert dargestellt.
- Szenarioergebnisse zeigen offene Daten und Annahmen sichtbar an.

Exit-Kriterien:

- Mindestens ein Basisszenario und ein Alternativszenario sind vergleichbar.
- Fehlende Annahmen werden als solche angezeigt.

### M9 - Versicherungen, Renten und Vorsorge

Ziel: Vorsorge- und Schutzlogik wird fachlich getrennt, aber cashflow-wirksam.

Artefakt:

- Module fuer Versicherungen, Renten und Sozialleistungen.
- Verknuepfung zu Regelzahlungen, Quellen und Ereignissen.

Umfang:

- Laufende Beitraege.
- Spaetere Leistungen.
- Rentenbeginn, Zahlweise, Quellenstatus.

Produktivdaten-Regeln:

- Ungepruefte Ansprueche wirken nicht als sichere Zukunftswerte.
- Leistungen mit unsicherem Status bleiben in Szenarien markiert.

Exit-Kriterien:

- Versicherungen und Renten sind sichtbar und pruefbar.
- Laufende und spaetere Wirkungen sind getrennt auswertbar.

### M10 - Agentenworkflow und wiederkehrende Pruefungen

Ziel: Agentenarbeit wird systematisch steuerbar.

Artefakt:

- Agentenauftraege, Pruefregeln, Vorschlaege und Laufprotokolle.
- Wiederholbare Checks.
- Review-Oberflaeche fuer Agentenergebnisse.

Umfang:

- Rollenrechte.
- Vorschlagsstatus.
- Laufprotokolle mit Input, Output, Pruefergebnis und offenen Risiken.

Produktivdaten-Regeln:

- Agenten duerfen Vorschlaege erzeugen, aber keine stillen finalen Fachentscheidungen treffen.
- Wiederholte Laeufe duerfen keine doppelten Vorschlaege erzeugen.

Exit-Kriterien:

- Ein Agentenlauf ist auditierbar.
- Nutzerentscheidungen bleiben von Agentenvorschlaegen getrennt.

### M11 - Exporte und umfassende lokale App

Ziel: Die App wird zur zentralen Arbeitsoberflaeche.

Artefakt:

- Gefuehrte Modulnavigation.
- Excel-/CSV-/PDF-Exporte aus validierten Daten.
- Produktiver Review- und Exportprozess.

Umfang:

- Dashboard, Datenqualitaet, Stammdaten, Bewegungsdaten, Vorschlaege, Szenarien, Exporte.
- Manuelles CRUD fuer Sonderfaelle.
- Exportprotokolle.

Produktivdaten-Regeln:

- Exporte sind abgeleitete Artefakte und nie Master.
- Jeder Export verweist auf Datenstand, Schema-Version und Validierungsergebnis.

Exit-Kriterien:

- Ein vollstaendiger lokaler Arbeitszyklus ist moeglich: laden, pruefen, Vorschlaege reviewen, validieren, exportieren.

## Naechste empfohlene Umsetzung

Als naechstes sollte M0.1 umgesetzt werden:

1. `app/index.html`, `app/styles.css`, `app/main.js` als statischen UI-Prototyp anlegen.
2. Kleine Demo-Fixture in `app/demo-data.js` oder direkt im Prototyp nutzen.
3. Screens fuer Dashboard, Stammdaten, Bewegungsdaten, Vorschlaege und Checks bauen.
4. Danach gemeinsam pruefen, ob Oberflaechen, Statuswerte oder Review-Aktionen fehlen.
5. Erst danach M1-Schemas und produktive Startdaten bauen.


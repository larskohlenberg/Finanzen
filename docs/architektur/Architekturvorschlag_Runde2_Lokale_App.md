# Architekturvorschlag Runde 2: lokale Finanzmodell-App

Stand: 27.05.2026

## Zielbild

Runde 2 wird als lokale, agentenfreundliche Finanzmodell-App gebaut. Der Master liegt nicht mehr in Excel, sondern in validierbaren Dateien. Die Oberflaeche ist eine statische HTML/JavaScript-App, die ohne Webserver geoeffnet werden kann. Eine eigene Backend-Schicht ist fuer den Start ausdruecklich kein Ziel.

Die eigentliche "Schreiblogik" liegt bei Agentenarbeit: Ein Agent bekommt Informationen aus Dateien, manuellen Angaben oder Belegen, transformiert sie in die vereinbarten Formate und schreibt sie an die richtigen Stellen in `data/master/` oder als Vorschlag in `data/inbox/` bzw. `data/master/vorschlaege.jsonl`. Das Webfrontend liest diese Daten, berechnet Kennzahlen, filtert, gruppiert und zeigt offene Punkte.

Die Baufolge ist bewusst konservativ:

1. Grundgeruest und Oberflaechen-Prototyp
2. Stammdaten
3. Bewegungsdaten
4. Cashflow, Vorschlaege, Auswertungen, Exporte und Agentenprozesse

Ab dem ersten produktiven Datenstand duerfen weitere Meilensteine bestehende Daten nur ueber versionierte Schemas, Migrationen, Backups und Validierungsberichte veraendern.

## Architekturentscheidung

Empfohlen wird eine schlanke Local-First-Dateiarchitektur mit drei klar getrennten Rollen.

### Rolle 1: statische App

Die erste nutzbare App liegt in `app/`:

```text
app/index.html
app/styles.css
app/main.js
app/domain.js
app/demo-data.js
```

Eigenschaften:

- Start per Doppelklick oder Browser-Datei oeffnen.
- Daten werden agentisch als Review-Bundle bereitgestellt und von der UI angezeigt.
- Kennzahlen, Filter, Gruppierungen, Plausibilitaetschecks und Anzeigezustand liegen in JavaScript.
- Ergebnisse, gefilterte Sichten oder Review-Entscheidungen koennen als Datei exportiert werden.
- Keine Build-Pipeline, keine externen Runtime-Abhaengigkeiten fuer den ersten Schnitt.
- Keine eigene Server- oder Backend-Schicht.

Die App ist damit nicht "dumm", aber sie ist bewusst nur lesend bzw. dateiexportierend. Sie darf umfangreiche Fachlogik fuer Auswertungen enthalten, wird aber nicht zur versteckten Datenbank.

### Rolle 2: strukturierte Dateien

Der Master sind Dateien:

```text
data/master/*.json
data/master/*.jsonl
schemas/*.schema.json
```

Eigenschaften:

- JSON fuer Stammdaten.
- JSONL fuer groessere, append-orientierte Bewegungsdaten und Vorschlaege.
- Schemas und Konventionen definieren, was ein Agent schreiben darf.
- Berechnete Sichten bleiben abgeleitet und werden nicht als Master gepflegt.

### Rolle 3: Agentenarbeit

Agenten ersetzen die klassische Backend-Schreibschicht. Sie sind aber nicht frei: Sie schreiben gegen Schemas, erzeugen nachvollziehbare Aenderungen und lassen Unsicherheit sichtbar.

Typische Agentenaufgaben:

- Aus einer manuellen Angabe eine neue Kategorie, Quelle oder Regelzahlung anlegen.
- Aus einem Kontoauszug Transaktionsvorschlaege erzeugen.
- Bestehende Daten gegen Schemas und Referenzen pruefen.
- Vorschlaege nach Nutzerentscheidung in Masterdateien uebernehmen.
- Bei Schema-Aenderungen Migrationen als nachvollziehbare Dateiaenderungen ausfuehren.
- Kurze Aenderungsprotokolle und offene Risiken dokumentieren.

Damit das funktioniert, braucht jeder produktive Arbeitsschritt eine konkrete Agentenanweisung. Diese Anweisung beschreibt:

- Eingangsdaten: Welche Datei, Nutzereingabe oder Belege der Agent verwenden darf.
- Zielartefakt: Welche Datei geschrieben oder geaendert werden soll.
- Schema/Format: Gegen welches Schema und welche ID-Konvention geschrieben wird.
- Entscheidungsgrenzen: Was der Agent final entscheiden darf und was als Vorschlag/offen markiert werden muss.
- Pruefung: Welche Referenzen, Pflichtfelder und fachlichen Plausibilitaeten nach der Aenderung zu pruefen sind.
- Protokoll: Was am Ende als Aenderungsnotiz, Check oder offenes Risiko dokumentiert wird.

Die Agentenanweisungen sind selbst Projektartefakte und sollten im Repository liegen, zum Beispiel:

```text
docs/agenten/
  01_stammdaten_pflegen.md
  02_kontoauszug_importieren.md
  03_vorschlaege_uebernehmen.md
  04_datenqualitaet_pruefen.md
  05_schema_migration.md
```

Kleine Skripte sind erlaubt, aber sie sind Helfer fuer Agenten oder Tests, keine eigene Anwendungsschicht. Sie sollten nur entstehen, wenn sie Wiederholbarkeit schaffen, zum Beispiel fuer Validierung, Hashbildung oder CSV-Normalisierung.

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

### JavaScript-Fachlogik

Die Fachlogik der Oberflaeche liegt in kleinen, testbaren JavaScript-Modulen:

```text
app/domain.js       Berechnungen, Filter, Statusableitungen
app/validation.js   leichte UI-Plausibilitaeten und Referenzchecks
app/main.js         Rendering und Interaktion
```

Geeignete Logik fuer das Frontend:

- Cashflow-Ist aus Transaktionen aggregieren.
- Einnahmen, Ausgaben und Transfers trennen.
- Offene Kategorien, fehlende Quellen und kaputte Referenzen sichtbar machen.
- Konten, Personen, Kategorien und Quellen filtern.
- Monats-, Kategorie- und Gegenparteiensichten berechnen.
- Datenqualitaetsindikatoren neben Kennzahlen anzeigen.

Nicht geeignet fuer das Frontend:

- Stille produktive Schreibaktionen.
- Automatische Fachentscheidungen ohne Vorschlagsstatus.
- Nicht nachvollziehbare Migrationen.
- Versteckte Persistenz in Browser-Speichern als Master.

### Rapid Prototyping

Vor tiefer Implementierung wird ein klickbarer Oberflaechen-Prototyp gebaut:

- Mit Demo-Fixtures, nicht mit produktiven Daten.
- Mit den spaeter erwarteten Navigationseinheiten.
- Mit bewusst sichtbaren leeren Zustaenden und Warnhinweisen.
- Mit Beispielkarten oder Tabellen fuer Stammdaten, Transaktionen, Checks und Vorschlaege.
- Ziel ist fachlicher Abgleich: Fehlen Ansichten, Filter, Status oder Review-Aktionen?

Der Prototyp darf noch nicht als fuehrender Dateneditor missverstanden werden. Er ist ein UI-Vertrag, kein produktiver Datenvertrag.

## Backend-Verzicht

Eine Backend-Schicht wird vorerst bewusst nicht gebaut.

Das heisst konkret:

- Kein lokaler HTTP-Service.
- Keine API-Routen.
- Keine Datenbank als erster Master.
- Keine dauerhafte Laufzeitkomponente neben dem Browser.
- Keine UI, die im Hintergrund produktive Masterdateien veraendert.

Die Architektur bleibt dadurch leichter: Dateien sind der Vertrag, Agenten sind die Bearbeiter, JavaScript ist die Anzeige- und Berechnungsschicht.

Falls spaeter etwas wiederholbar automatisiert werden muss, wird zuerst geprueft, ob ein Agent mit klarer Arbeitsanweisung reicht. Erst wenn Wiederholbarkeit, Geschwindigkeit oder Fehlerrisiko dafuer sprechen, entsteht ein kleines Skript. Auch dann bleibt das Skript ein Werkzeug, nicht das Zentrum der Architektur.

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

Weil eine statische Datei-App nicht einfach lokale Ordner lesen darf, gibt es zwei leichte Ladewege:

```text
data/exports/current-finance-bundle.json
```

- Einfacher Weg: Ein Agent erzeugt aus den Masterdateien ein Review-Bundle, das die UI anzeigen kann.
- Fuer M2 kann dieses Bundle als `app/review-data.js` bereitgestellt werden, damit die App lokal ohne Webserver funktioniert.
- Eine Import-Funktion in der Weboberflaeche ist kein Ziel fuer M2; Datenbereitstellung passiert agentisch.

Das Bundle ist nicht der Master, sondern ein bequemes Transportformat fuer die Oberflaeche. Wenn es veraltet ist, wird es neu erzeugt, nicht manuell korrigiert.

### Produktive Daten ab M1/M2

Sobald echte Daten im System liegen, gelten harte Datenhaltungsregeln:

- Vor jeder Migration wird ein Snapshot unter `data/exports/snapshots/` erzeugt.
- Jede Masterdatei hat eine Schema-Version oder wird ueber ein Manifest versioniert.
- Neue Felder sind zuerst optional oder werden mit Migration und Default-Regeln eingefuehrt.
- Keine Loeschung ohne Tombstone, Archiv oder nachvollziehbaren Aenderungsdatensatz.
- Vorschlaege bleiben von bestaetigten Masterdaten getrennt.
- Fehlerhafte Imports schreiben nie direkt in `data/master/`.

### SQLite-Option

SQLite ist nur eine spaete Option, falls Dateien und JavaScript-Auswertungen nicht mehr reichen. Es sollte nicht der erste Master sein.

Moeglicher Zeitpunkt:

- Nach stabilen Stammdaten und Bewegungsdaten.
- Nach geklaerten Import- und Review-Workflows.
- Wenn die UI viele Filter, Aggregationen und Schreibaktionen braucht.

Dann kann SQLite hoechstens als lokaler abgeleiteter Index dienen, waehrend JSON/JSONL weiter die auditierbare Quelle bleibt. Ein vollstaendiger Wechsel zu SQLite als Master sollte eine eigene Architekturentscheidung sein.

## Meilensteinplan

Jeder Meilenstein liefert ein nutzbares Artefakt. Ab M2 ist der vorhandene Datenbestand wie produktiv zu behandeln.

Jeder Meilenstein, in dem Agenten produktiv Daten schreiben oder pruefen, muss zusaetzlich eine passende Agentenanweisung liefern. Ohne diese Anweisung ist der Meilenstein nicht fertig, weil dann die eigentliche Bearbeitungsschicht nicht reproduzierbar waere.

### M0.1 - Architektur- und UI-Vertrag

Ziel: Die lokale Zielarchitektur und die ersten Oberflaechen sind fachlich pruefbar.

Artefakt:

- Dieses Architekturkonzept.
- Klickbarer statischer UI-Prototyp mit Demo-Daten.
- Vorlage fuer Agentenanweisungen.

Umfang:

- Navigation fuer Dashboard, Stammdaten, Bewegungsdaten, Vorschlaege, Checks, Export.
- Demo-Zustaende fuer "alles gut", "offene Kategorie", "kaputte Referenz", "Importvorschlag".
- Noch keine produktive Persistenz.

Exit-Kriterien:

- Der Nutzer kann anhand der Oberflaechen sagen, ob fachliche Sichten fehlen.
- Die wichtigsten Arbeitswege sind als Screens sichtbar.
- Der Prototyp schreibt keine Masterdaten.
- Es gibt eine kurze Vorlage, nach der spaetere Agentenanweisungen einheitlich geschrieben werden.

### M1 - Grundgeruest und Validierungsbasis

Ziel: Der Datenvertrag ist lauffaehig.

Artefakt:

- Schemas fuer Personen, Konten, Kategorien, Quellen und Transaktionen.
- Kleiner Startdatenstand in `data/master/`.
- Validierungsanweisung fuer Agenten plus nachvollziehbarer Pruefbericht.
- Agentenanweisung `datenqualitaet_pruefen`.

Umfang:

- ID-Konventionen.
- Pflichtfelder und Statuswerte.
- Referenzchecks zwischen Personen, Konten, Kategorien, Quellen und Transaktionen.
- Positiv- und Negativ-Testdaten.

Exit-Kriterien:

- Guter Datensatz validiert erfolgreich.
- Absichtlich fehlerhafter Datensatz scheitert mit verstaendlichem Bericht.
- Keine UI-Fachlogik, die Validierungsfehler verdeckt.
- Ein Agent kann anhand der Anweisung den Datenstand pruefen und die Befunde reproduzierbar dokumentieren.

### M2 - Lokale Leseflaeche fuer Stammdaten

Ziel: Der Nutzer kann den validierten Stammdatenstand lokal ansehen.

Artefakt:

- `app/index.html` mit agentisch bereitgestelltem Review-Bundle.
- Stammdatenansichten fuer Personen, Konten, Kategorien und Quellen.
- Datenqualitaetsbereich mit Checks.

Umfang:

- Agentenerzeugtes Bundle aus Masterdaten oder direkter Mehrdatei-Import.
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
- Agenten-Arbeitsanweisung fuer angenommene Aenderungen.
- Auditierbarer Aenderungsbericht.
- Agentenanweisung `stammdaten_pflegen`.

Umfang:

- Neue Person, neues Konto, neue Kategorie, neue Quelle.
- Statuswechsel und kontrollierte Korrekturen.
- Kein stilles Ueberschreiben produktiver Daten.

Produktivdaten-Regeln:

- Jede Aenderung erzeugt vorher Snapshot und danach Validierungsbericht.
- IDs bleiben stabil.
- Umbenennungen sind Aenderungen, keine neuen Entitaeten.

Exit-Kriterien:

- Eine neue Kategorie kann als Vorschlag erzeugt, geprueft und durch Agentenarbeit uebernommen werden.
- Kaputte Referenzen verhindern die Uebernahme.
- Die Agentenanweisung klaert, wann eine Stammdatenangabe final geschrieben werden darf und wann sie Vorschlag bleiben muss.

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

- Agenten-Importprozess fuer mindestens ein CSV-Format.
- Schema fuer Importvorschlaege.
- Review-Ansicht fuer neue, doppelte und unsichere Transaktionen.
- Agentenanweisung `kontoauszug_importieren`.

Umfang:

- Rohquelle und Dateihash.
- Stabiler Transaktionshash fuer Deduplikation.
- Unsichere Kategorie bleibt offen.
- Annehmen, ablehnen, zurueckstellen als Status.

Produktivdaten-Regeln:

- Import schreibt nach `data/inbox/` oder `vorschlaege.jsonl`, nicht direkt in Master.
- Uebernahme in Master nur nach Validierung und Snapshot.

Exit-Kriterien:

- Ein Kontoauszug kann durch Agentenarbeit als Vorschlagsliste erzeugt werden.
- Doppelte Buchungen werden erkannt oder als Risiko markiert.
- Die Agentenanweisung verhindert, dass unsichere Kategorien oder Dubletten direkt als finale Transaktionen geschrieben werden.

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
- Vollstaendiger Satz der bis dahin benoetigten Agentenanweisungen.

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
- Jede wiederkehrende Agentenaufgabe hat eine benannte Anweisung mit Eingangsdaten, erlaubten Schreibzielen, Pruefschritten und Protokollpflicht.

### M11 - Exporte und umfassende lokale App

Ziel: Die App wird zur zentralen Arbeitsoberflaeche.

Artefakt:

- Gefuehrte Modulnavigation.
- Excel-/CSV-/PDF-Exporte aus validierten Daten.
- Produktiver Review- und Exportprozess.

Umfang:

- Dashboard, Datenqualitaet, Stammdaten, Bewegungsdaten, Vorschlaege, Szenarien, Exporte.
- Manuelles CRUD fuer Sonderfaelle.
- Exportprotokolle oder agentisch erzeugte Exportnotizen.

Produktivdaten-Regeln:

- Exporte sind abgeleitete Artefakte und nie Master.
- Jeder Export verweist auf Datenstand, Schema-Version und Validierungsergebnis.

Exit-Kriterien:

- Ein vollstaendiger lokaler Arbeitszyklus ist moeglich: laden, pruefen, Vorschlaege reviewen, Agentenaenderung ausfuehren lassen, erneut laden, exportieren.

## Naechste empfohlene Umsetzung

Als naechstes sollte M0.1 umgesetzt werden:

1. `app/index.html`, `app/styles.css`, `app/main.js` als statischen UI-Prototyp anlegen.
2. Kleine Demo-Fixture in `app/demo-data.js` oder direkt im Prototyp nutzen.
3. Screens fuer Dashboard, Stammdaten, Bewegungsdaten, Vorschlaege und Checks bauen.
4. Danach gemeinsam pruefen, ob Oberflaechen, Statuswerte oder Review-Aktionen fehlen.
5. Erst danach M1-Schemas und produktive Startdaten bauen.

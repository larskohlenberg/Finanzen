# App als deploybarer Datenraum

Die App wird ab jetzt als geschuetzter Web-App-Raum verstanden, nicht mehr nur als statisches Frontend-Verzeichnis. Alles, was zur laufenden App, zu ihren produktiven Daten, Belegen, Betriebsschemas, fachlichen Agenten-Tools und Agenten-Betriebsanweisungen gehoert, liegt fuehrend unter `app/`.

## Begruendung

Die urspruengliche Architektur trennte `app/` als lokale Anzeige von `data/`, `schemas/`, `Belege/`, `tools/` und `docs/skills/` im Projektroot. Das passte zum fruehen Ziel einer lokal per Datei nutzbaren Oberflaeche und spaeter zum Review-Bundle `app/review-data.js`.

Nach M5 ist diese Trennung hinderlich: Import-Agent und Validator schreiben in `data/master/`, waehrend die ausgelieferte Webseite aus einem separaten Review-Bundle liest. Das erzeugt zwei Datenwahrheiten. Gleichzeitig ist die App inzwischen webserver-only und soll perspektivisch auch auf einem echten Webhosting mit passendem Backend betreibbar sein. Dafuer muessen die produktiven App-Daten im Webserver-Bereich liegen.

## Entscheidung

`app/` wird der deploybare App-Raum. Der Webserver zeigt auf `app/` und schuetzt diesen gesamten Bereich serverseitig. Fuehrende produktive Pfade wandern dorthin:

- `app/data/` fuer Masterdaten, Inbox, Import-Zwischenstaende und Agent-Logs.
- `app/Belege/` fuer produktive Belege und Rohdokumente, soweit sie zur App gehoeren.
- `app/schemas/` fuer Schemas, die App, Tools oder ein spaeteres Backend im Betrieb brauchen.
- `app/tools/` fuer fachliche Agenten-/Betriebs-Tools wie Import, Validator, Dedupe, Categorizer und Transfer-Matcher.
- `app/docs/skills/` fuer Agenten-Betriebsanweisungen.

Im Projektroot bleiben nur Projekt- und Entwicklungsartefakte, z. B. `package.json`, automatisierte Entwicklungstests in `tests/`, ADRs, Architektur- und Planungsdokumente.

## Verworfene Alternativen

- **Projektroot als Webroot ausliefern**: haette `data/` fachlich an Ort und Stelle gelassen, macht den Einstieg aber uneinheitlich, weil `index.html` in `app/` liegt, und vermischt deploybare App-Artefakte mit Projektwerkstatt.
- **Nur `data/master/` nach `app/` spiegeln**: erzeugt erneut zwei Wahrheiten und widerspricht dem Ziel, Import-Agent, App und Validator auf denselben Master schauen zu lassen.
- **Nur Runtime-Daten verschieben, Tools und Skills im Root lassen**: trennt Betriebsanweisung, Betriebstool und Betriebsdaten kuenstlich. Da der Import-Agent diese Tools produktiv ausfuehrt, gehoeren sie in den App-Raum.

## Konsequenzen

Es gibt keine dauerhaften Kompatibilitaets- oder Spiegelpfade. Nach der Migration sind die neuen Pfade fuehrend, z. B. `app/data/master/transaktionen.jsonl` statt `data/master/transaktionen.jsonl`.

Dateninterne Pfade sind app-relativ. Eine Transaktion referenziert einen Beleg also als `Belege/...`, nicht als `app/Belege/...`. Ein Importlauf referenziert App-Daten als `data/inbox/...`, nicht als Projektroot-Pfad.

Die Migration erfolgt verlustfrei: Dateien werden verschoben, nicht neu erzeugt; vor und nach der Migration werden Dateibestand und Checksummen verglichen. Alte Ordner werden nur entfernt, wenn sie nach der Migration leer sind; `.DS_Store` bleibt unbeachtet.

Die App laedt einzelne Masterdateien direkt per `fetch()` aus `data/master/`. Das fruehere `app/review-data.js`-Bundle ist entfallen und nicht mehr Teil des fuehrenden Betriebsmodus.

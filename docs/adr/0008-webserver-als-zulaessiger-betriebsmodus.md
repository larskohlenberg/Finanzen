# Webserver als zulaessiger Betriebsmodus

Statushinweis 2026-06-09: Diese ADR ist teilweise durch ADR 0012 und ADR 0015 ueberholt. Der Webserver ist nicht mehr nur ein zulaessiger Betriebsmodus, sondern der fuehrende Betriebsmodus; `file://` ist fuer die aktuelle App nicht mehr vorgesehen.

Nach Abschluss von M3 wird die statische App nicht mehr nur per Doppelklick auf `app/index.html` genutzt, sondern darf auch ueber einen lokalen Webserver bereitgestellt werden. Damit ist der urspruengliche Betriebsmodus "Datei im Browser oeffnen" nicht aufgehoben, aber nicht mehr die einzige relevante Annahme.

Entscheidung: Die App bleibt eine statische HTML/CSS/JavaScript-App ohne eigene Backend-Schreiblogik. Ein lokaler Webserver ist aber ab sofort ein zulaessiger Betriebsmodus. Dadurch duerfen spaetere Funktionen eingeplant werden, die bei reinem `file://`-Betrieb nicht oder nur schlecht funktionieren, z. B. stabilere Browser-Ladepfade, serverbasierte Auslieferung statischer Dateien oder bessere lokale Preview-/Betriebsablaeufe.

Begruendung: Die App enthaelt sensible Finanzdaten im ausgelieferten Review-Bundle. Gleichzeitig ist die Nutzung ueber einen lokalen Webserver praktischer, wenn das Tool von mehreren Geraeten im Heimnetz oder ueber einen festen lokalen Einstiegspunkt geoeffnet werden soll. Die Architektur soll diese Betriebsrealitaet nicht kuenstlich ignorieren.

## Verworfene Alternativen

- **Weiterhin ausschliesslich `file://` als Betriebsannahme**: zu eng, weil der aktuelle Betrieb bereits ueber einen lokalen Webserver laeuft und kuenftige Browser-Funktionen dadurch unnoetig beschraenkt wuerden.
- **Vollwertiges App-Backend einfuehren**: nicht noetig. Die App schreibt weiterhin keine Masterdaten und braucht fuer den aktuellen Stand keine API, Datenbank oder Serverlogik.
- **Webserver-Betrieb als produktneutrale Nebensache behandeln**: zu riskant, weil sich dadurch Sicherheitsannahmen und direkte Zugriffspfade auf statische Dateien aendern.

## Konsequenz

Kuenftige Meilensteine duerfen Webserver-faehige Funktionen beruecksichtigen, solange die App weiterhin ohne eigene Backend-Schreiblogik bleibt. Der lokale Webserver ist eine Auslieferungsschicht, nicht der neue fachliche Master und nicht der Ort fuer stille Finanzdaten-Aenderungen.

Dokumentation und Tests duerfen historische `file://`-Faehigkeit benennen, sollen fuer den aktuellen Betrieb aber den Webserver als Standard annehmen. Wenn eine Funktion nur im Webserver-Betrieb funktioniert, muss sie als solche dokumentiert werden.

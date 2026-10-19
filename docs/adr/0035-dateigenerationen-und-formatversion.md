# Dateigenerationen als Persistenz, Formatversion im Manifest

Status: angenommen (2026-10-19). Entscheidung E1 aus dem Architektur-Review. Ergaenzt ADR 0002 um eine eng begrenzte Ausnahme.

## Problem

Die Werkzeuge schreiben heute mehrere Dateien eines Bestands nacheinander per `writeFile`, gesichert durch Kopie und Rueckspielen. Ein Leser daneben (App, MCP, Validator) kann dabei einen halben Stand sehen. Im E1-Prototyp sah ein Leser bei 2.858 Lesungen 5-mal einen inkonsistenten Stand, einmal eine gerade abgeschnittene Buchungsdatei. Ein Absturz mitten im Schreiben laesst ebenfalls einen Mischstand zurueck.

Gesucht war eine Persistenz mit vollstaendigem Commit oder Abbruch ueber mehrere Sammlungen, konsistenten Schnappschuessen fuer Leser und sauberem Wiederanlauf nach einem Abbruch an jeder Stelle.

## Entscheidung

**Dateigenerationen** (`app/tools/lib/generationen.mjs`):

- Ein Bestand besteht aus unveraenderlichen Generationen `generationen/000001/ …` und dem Zeiger `aktuell` (Symlink). Ein Schreiber legt unter der bestehenden Schreibsperre (im Basisordner) einen Entwurf an: unveraenderte Dateien als Hardlinks, jede Aenderung als neue Datei. Nach der Pruefung wird der Entwurf zur neuen Generation, dann wird der Zeiger atomar umgestellt. Vorher ist nichts sichtbar.
- Veroeffentlichte Dateien sind schreibgeschuetzt (0444). Jede Veroeffentlichung vergleicht die uebernommenen Hardlinks mit dem Manifest der Quelle; damit faellt auch ein In-place-Schreiben als root auf.
- Leser binden sich per Lease an eine Generation. Das Aufraeumen behaelt die letzten N Generationen und loescht nie eine Generation mit lebendem Leser.
- Leser ohne Schreibrecht (der Webdienst laeuft mit `ProtectSystem=strict` und darf nur die Inbox schreiben) lesen ohne Lease, aber hoechstens 10 Minuten lang. Das Aufraeumen loescht eine Generation erst 15 Minuten, nachdem sie abgeloest wurde (Zeit aus dem Manifest der Nachfolgerin). Verworfen: ein eigener beschreibbarer Lease-Ordner fuer den Webdienst, weil er die Haertung aufweicht und eine Unit-Aenderung braucht.
- Ein einfacher Datenordner ohne Zeiger gilt als eine Generation ohne Historie (Rueckfallmodus). Demo, Testfixtures und noch nicht umgestellte Bestaende bleiben so ohne Migration lesbar und beschreibbar.

### Formatversion im Manifest (Ausnahme zu ADR 0002)

Jedes Manifest traegt `format` (heute `1`). Code liest und schreibt nur das Format, das er kennt; sonst bricht er mit einer klaren Meldung ab, bevor er etwas veraendert. Das ist eine begruendete Ausnahme vom Verbot von Versionsfeldern (Massnahme 1B.4 des Reviews):

- Es versioniert das **Dateiformat des Bestands**, nicht Datensaetze. Es gibt weiterhin keine Versions- oder Historienfelder an Buchungen, Konten oder anderen Eintraegen.
- Ohne die Angabe kann ein Rueckfall auf aelteren Code (Deploy-Ruecksprung) einen Bestand in einem neueren Format still falsch lesen oder ueberschreiben. Ein spaeterer Migrationslaeufer braucht dieselbe Angabe, um zu wissen, welche Migration fehlt.
- Die Ausnahme gilt nur fuer `format` im Manifest. Neue Versionsfelder anderswo brauchen eine eigene Begruendung.

## Verworfene Alternativen

- **SQLite ueber `node:sqlite`:** erfuellte im Prototyp dieselben Abnahmekriterien (Kill an jedem Schritt, Zufalls-Kill, zwei Schreiber mit Leser). Verworfen, weil
  - der Umbau deutlich groesser ist (Lese- und Schreibpfad je Werkzeug, Sonderfaelle fuer Rohtext wie Agentenprotokoll und Belegtexte, virtuelle Dateischicht fuer die Datei-Werkzeuge der Agenten; gesamt XL statt L);
  - Agenten den direkten Zugriff auf dieselben JSON-Dateien (lesen, suchen, ersetzen) verloeren und von Hand formatierte Dateien beim ersten Rundweg ihre Form aendern;
  - der Treiber auf Node 24 erst den Stand „Release Candidate“ hat und auf Node 22, der Mindestversion, experimentell ist;
  - Sicherung und Deploy die WAL-Fallen kennen muessten (`cp` einer laufenden DB ist nicht sicher).
  Der Mehrwert (Constraints, SQL, Einzel-Updates) bringt bei rund 5.000 Buchungen und einem Schreiber keinen spuerbaren Nutzen; die Referenzpruefung macht der Validator. SQLite waere die bessere Wahl bei mehreren Schreibern ohne globale Sperre, bei Bestaenden weit ueber 100.000 Buchungen oder wenn DB-Constraints als zweite Verteidigungslinie gewollt sind. Jede Generation laesst sich dann verlustfrei importieren.
- **Weiter in place mit Kopie und Rueckspielen:** schuetzt nicht vor Lesern, die einen halben Stand sehen, und nicht vor einem Absturz mitten im Rueckspielen.
- **Formatversion als eigene Datei neben den Generationen:** waere bei einem Ruecksprung auf eine aeltere Generation nicht mit deren Inhalt verbunden. Im Manifest gehoert sie fest zur Generation.

## Konsequenz

- Schreibende Werkzeuge arbeiten kuenftig im Entwurfsordner; der Validator wird zur Pruefung vor der Veroeffentlichung, Kopie und Rueckspielen entfallen. Der Vorschau-Fingerabdruck wird die Generations-Id.
- Der Datenbestand braucht ein POSIX-Dateisystem mit Hardlinks und Symlinks (VM: ext4). Der Platz waechst mit N mal der Groesse der geaenderten Dateien.
- Das Lease- und Marker-Protokoll ist eigener Code. Die Kill- und Nebenlaeufigkeitstests (`tests/generationen.test.mjs`) bleiben darum dauerhaft in der CI.
- Undo-Generationen liegen auf derselben Platte und ersetzen keine Sicherung.

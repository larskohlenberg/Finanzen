# Externer Datenort per FINANZEN_DATEN, logische Pfade bleiben

Status: angenommen (2026-10-19). Massnahme 1.4 aus dem Architektur-Review.

## Problem

Echtbestand, Inbox, Importprofile, Papierkorb und Belege liegen im Code-Checkout (`app/data/...`, `app/Belege`). Deploy und Git arbeiten im selben Verzeichnis wie die Daten: ein `git clean`, ein neu geklonter Checkout oder ein Release-Wechsel per Verzeichnis beruehrt sie. Rechte (nur die Inbox ist fuer den Webdienst beschreibbar) und Sicherung (was gehoert gesichert?) sind schwerer zu ziehen, solange Code und Daten gemischt sind. Der MCP-Server verlangte zudem einen Datenroot unter `<app>/data/`.

## Entscheidung

- Die Umgebungsvariable `FINANZEN_DATEN=<absoluter Ordner>` legt den **Datenort** fest. Dort liegen `master` (samt `master.gen`), `inbox`, `import-profile`, `papierkorb` und `Belege`. Ohne die Variable bleibt alles im Checkout wie bisher.
- Werkzeuge, Agenten, Browser und gespeicherte Verweise sprechen weiter von **logischen Pfaden** (`data/master`, `data/inbox/...`, `Belege/...`). Nur `app/tools/lib/datenort.mjs` bildet sie auf den Ort auf der Platte ab (`physisch`, `logisch`). Pfadschutz, Bestandsorte, CLI-Argumente, App-Server und Deploy nutzen diese eine Stelle.
- Die versionierten Beispieldaten (`data/demo`, `data/demo-belege`) bleiben immer im Checkout.
- Gegen doppelte Bestaende: Mit gesetztem Datenort brechen MCP- und App-Server ab, wenn im Checkout noch ein eigener `app/data/master` liegt. Erlaubt ist dort nur ein Symlink auf `<Datenort>/master`.
- Das Deploy-Skript liest `FINANZEN_DATEN` aus der Env-Datei und gibt sie jedem Node-Werkzeug mit (sudo setzt die Umgebung zurueck).

## Verworfene Alternativen

- **Symlinks im Checkout** (`app/data/master -> /var/lib/finanzen/master` usw.) ohne Codeaenderung: Unter `app/data/inbox` und `app/Belege` liegen versionierte `.gitkeep`-Dateien. Ein Symlink an ihrer Stelle macht den Checkout dauerhaft „geaendert“, und das Deploy bricht ab. Ausserdem haengt der Schutz dann an Links, die jeder neue Checkout wieder anlegen muss.
- **Physische Pfade in den Werkzeugen** (Agenten sehen `/var/lib/finanzen/...`): bricht gespeicherte Verweise (`Belege/...` in Stamm- und Bewegungsdaten), Werkzeugbeschreibungen und die Regel, dass Agenten nie absolute Pfade benutzen.
- **Datenort als Kommandozeilenoption je Prozess:** muesste an Webdienst, MCP-Forced-Command, jede CLI und jeden Unterprozess durchgereicht werden. Die Umgebungsvariable erben Unterprozesse von selbst.

## Konsequenz

- Der eigentliche Umzug auf dem Server ist ein Betriebsschritt (Sicherung, Kopie, Vergleich, Unit und MCP-Zugang umstellen, Rueckweg): `docs/betrieb.md`.
- Neuer Code, der Daten-Orte braucht, geht ueber `bestandOrte` oder `datenort.mjs`, nie ueber `path.join(app, "data", ...)`.

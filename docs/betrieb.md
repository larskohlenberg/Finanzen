# Betrieb auf einem Server

Fuer eine Installation, bei der die App auf einem eigenen Server (z. B. einer VM) laeuft: Webdienst per systemd (`ops/systemd/`), Agenten per MCP ueber SSH mit Forced Command, Deploy per `ops/aktualisieren.sh`. Namen und Pfade unten sind Beispiele: Checkout `/opt/finanzen`, fachlicher User `finanzen`, Datenort `/var/lib/finanzen`.

## Datenort (ADR 0036)

Ohne Einstellung liegen die Echtdaten im Checkout (`app/data/master`, `app/data/master.gen`, `app/data/inbox`, `app/data/import-profile`, `app/data/papierkorb`, `app/Belege`). Mit `FINANZEN_DATEN=/var/lib/finanzen` liegen sie dort:

```
/var/lib/finanzen/
  master -> master.gen/aktuell
  master.gen/
  inbox/  import-profile/  papierkorb/  Belege/
```

Die Variable muss jeder Prozess sehen, der Daten anfasst:

| Wer | Wo |
|---|---|
| Webdienst | `FINANZEN_DATEN=...` in `/etc/finanzen/app.env` (EnvironmentFile der Unit) |
| Deploy-Skript | liest dieselbe Env-Datei und gibt den Wert an jedes Node-Werkzeug weiter |
| MCP | im Forced Command: `command="/usr/bin/env FINANZEN_DATEN=/var/lib/finanzen /usr/bin/node /opt/finanzen/app/mcp/server.mjs data/master --recht=schreiben"` |
| CLI von Hand | `sudo -u finanzen env FINANZEN_DATEN=/var/lib/finanzen node app/tools/<werkzeug>.mjs data/master` |

Fehlt die Variable, sucht ein Prozess die Daten im Checkout und findet nach dem Umzug keinen Bestand (MCP bricht mit „Datenroot existiert nicht“ ab). Liegt umgekehrt im Checkout noch ein eigener `app/data/master`, brechen MCP- und Webserver mit „Doppelter Bestand“ ab.

### Umzug in einen externen Datenort

Voraussetzungen, alles als Admin auf dem Server; die App ist einige Minuten offline:
- Der Stand mit ADR 0036 ist deployt (`sudo finanzen-aktualisieren`).
- Die root-eigene Kopie des Deploy-Skripts ist auf diesem Stand. Sonst kennt sie `FINANZEN_DATEN` nicht und jedes Deploy nach dem Umzug bricht ab. Uebernehmen wie im Kopf von `ops/aktualisieren.sh` beschrieben (`git show <commit>:ops/aktualisieren.sh` nach `/root/aktualisieren.neu`, `diff`, `install`).
- Der Bestand ist auf Generationen umgestellt (`data/master` ist ein Symlink auf `master.gen/aktuell`, ADR 0035). Bei einem einfachen Ordner `master` statt `master.gen` kopieren und vergleichen.

1. **Sicherung.** Frisches Backup der ganzen VM (Hypervisor) und zusaetzlich ein Archiv der Daten:
   ```
   sudo install -d -m 700 /var/backups/finanzen-umzug
   cd /opt/finanzen/app
   sudo tar -cpf /var/backups/finanzen-umzug/daten-vorher.tar data Belege
   ```
   Ganz `data/` samt Altlasten wie `master.ordner-*`: Schritt 6 raeumt alle ignorierten Dateien im Checkout.
2. **Stillstand.** `sudo systemctl stop finanzen-app`. MCP-Zugang sperren: die Zeile in `/home/finanzen/.ssh/authorized_keys` mit `#` auskommentieren, laufende Instanzen pruefen (`pgrep -u finanzen -af mcp/server.mjs`, muss leer sein).
3. **Zielordner.** `sudo install -d -o finanzen -g finanzen -m 750 /var/lib/finanzen`
4. **Kopie** in einem Aufruf (so bleiben die Hardlinks zwischen den Generationen erhalten, Symlinks bleiben relativ):
   ```
   cd /opt/finanzen/app
   sudo -u finanzen cp -a data/master data/master.gen data/inbox data/import-profile data/papierkorb Belege /var/lib/finanzen/
   ```
   Ordner, die es nicht gibt (z. B. `papierkorb`), weglassen.
5. **Byte-Vergleich.** Jeder Ordner muss gleich sein, Symlinks werden als Links verglichen:
   ```
   for o in master.gen inbox import-profile papierkorb; do sudo diff -r --no-dereference data/$o /var/lib/finanzen/$o && echo "$o gleich"; done
   sudo diff -r --no-dereference Belege /var/lib/finanzen/Belege && echo "Belege gleich"
   readlink /var/lib/finanzen/master          # master.gen/aktuell
   ```
   Dazu der fachliche Vergleich: gleiche Generation, gleiche Befunde.
   ```
   sudo -u finanzen node /opt/finanzen/app/tools/verlauf.mjs data/master --anzahl=1
   sudo -u finanzen env FINANZEN_DATEN=/var/lib/finanzen node /opt/finanzen/app/tools/verlauf.mjs data/master --anzahl=1
   sudo -u finanzen env FINANZEN_DATEN=/var/lib/finanzen node /opt/finanzen/app/tools/validator.mjs data/master
   sudo -u finanzen env FINANZEN_DATEN=/var/lib/finanzen node /opt/finanzen/app/tools/deploy-pruefung.mjs rauchtest /var/lib/finanzen/master
   ```
   Weicht etwas ab: Abbruch, `/var/lib/finanzen` wieder entfernen, Dienst starten (Schritt 9 entfaellt).
6. **Alte Orte raeumen.** Die Daten im Checkout sind durch Schritt 1 gesichert. Nur die ignorierten Dateien gehen weg, versionierte (`.gitkeep`, `README.md`, Demodaten) bleiben:
   ```
   sudo -u finanzen git -C /opt/finanzen clean -ndX -- app/data app/Belege    # Liste ansehen
   sudo -u finanzen git -C /opt/finanzen clean -fdX -- app/data app/Belege
   sudo -u finanzen git -C /opt/finanzen status --short                        # muss leer sein
   ```
   Achtung: Die Liste darf nur Echtdaten nennen. Unter `app/data/demo` sind nur die Laufzeitordner `inbox/`, `import-profile/`, `papierkorb/` und Sperrdateien erlaubt, keine Demodaten.
7. **Webdienst.** In `/etc/finanzen/app.env` `FINANZEN_DATEN=/var/lib/finanzen` ergaenzen. In der Unit `ReadWritePaths=/var/lib/finanzen/inbox` statt des alten Inbox-Pfads (Vorlage `ops/systemd/finanzen-app.service`), dann `sudo systemctl daemon-reload`.
8. **MCP.** Forced Command wie in der Tabelle oben, Zeile wieder aktivieren.
9. **Start und Probe.** `sudo systemctl start finanzen-app`, `journalctl -u finanzen-app -n 5` zeigt „Datenort /var/lib/finanzen“. Dann `sudo finanzen-aktualisieren` (prueft Validator und Rauchtest gegen den neuen Ort), eine MCP-Sitzung mit `status`, in der App Uebersicht, ein Beleg und ein Probe-Upload in die Inbox.

### Rueckweg

Solange nach dem Umzug nichts geschrieben wurde: Dienst stoppen, MCP-Zeile auskommentieren, `FINANZEN_DATEN` aus der Env-Datei, alte `ReadWritePaths` und alten Forced Command zuruecksetzen, `cd /opt/finanzen/app && sudo tar -xpf /var/backups/finanzen-umzug/daten-vorher.tar`, `daemon-reload`, starten.

Wurde am neuen Ort schon geschrieben, statt des Archivs den neuen Stand zurueckkopieren: `cd /var/lib/finanzen && sudo -u finanzen cp -a master master.gen inbox import-profile papierkorb /opt/finanzen/app/data/ && sudo -u finanzen cp -a Belege /opt/finanzen/app/`, dann wie oben vergleichen.

## Sicherung und Wiederherstellung (Review D.1)

Zwei Ebenen, die sich ergaenzen:

| Ebene | Was | Wie oft |
|---|---|---|
| Ganze VM | Hypervisor-Backup (z. B. Proxmox `vzdump`): System, Code, Daten, Konfiguration | taeglich, automatisch |
| App-Sicherung | Export „komplett“ (App: Export, oder `GET /api/export/komplett`): alles, was fuer einen Wiederanlauf noetig ist | vor jedem groesseren Eingriff (Umzug, Migration), sonst nach Bedarf |

### Was die App-Sicherung enthaelt

Eine ZIP (ohne Kompression) mit:

| In der ZIP | Herkunft | Beim Wiederherstellen |
|---|---|---|
| `Daten/` | genau eine Generation des Bestands (ohne deren `MANIFEST.json`) | `<Datenort>/master/` |
| `Daten/buchungen.csv` | aus den Buchungen erzeugt, zum Lesen in Excel | entfaellt |
| `Belege/` | Belegablage | `<Datenort>/Belege/` |
| `Inbox/` | Inbox samt Originalquellen (`processed/`), Zwischenstaenden und Fehlern | `<Datenort>/inbox/` |
| `Importprofile/` | Importprofile | `<Datenort>/import-profile/` |
| `SICHERUNG.json` | Manifest: Zeitpunkt, Generation (`stand`), Code-Stand, Validator-Ergebnis derselben Generation, Bereiche, jede Datei mit Groesse | – |

Der Bestand stammt aus einer einzigen Generation (konsistenter Stand, ADR 0035); das Pruefergebnis im Manifest gilt fuer genau diese Generation. Belege und Inbox werden waehrend des Downloads gelesen; entsteht in dieser Zeit eine neue Generation (Import, Ablage), bricht der Download ohne gueltige ZIP ab. Dann einfach erneut exportieren. Nicht enthalten: Papierkorb, alte Generationen (Verlauf), Server-Konfiguration (`/etc/finanzen`, Unit, SSH-Schluessel). Die stecken im VM-Backup.

### App-Sicherung pruefen und probeweise wiederherstellen

```
node app/tools/sicherung-pruefen.mjs finanzen-backup-<datum>.zip
node app/tools/sicherung-pruefen.mjs finanzen-backup-<datum>.zip --auspacken=/tmp/probe
FINANZEN_DATEN=/tmp/probe node app/tools/validator.mjs data/master
```

Die erste Zeile prueft jede Datei gegen ihre CRC und gegen das Manifest. Die zweite packt im Aufbau eines Datenorts aus (nur in einen leeren Ordner). Die dritte prueft den ausgepackten Bestand. Fuer eine echte Wiederherstellung den ausgepackten Ordner als Datenort einsetzen (Abschnitt „Umzug“, ab Schritt 2) und danach bei Bedarf wieder auf Generationen umstellen (`node app/tools/generationen-einrichten.mjs data/master --schreiben`).

### VM-Backup als Restore-Probe

So erprobt, ohne die laufende VM anzufassen (Platzhalter: `<vmid>` laufende VM, `<probe-id>` freie ID, `<archiv>` Backup-Datei):

1. Auf dem Hypervisor: `qmrestore <archiv> <probe-id> --storage <storage> --unique 1` (neue MAC-Adressen).
2. Vor dem Start das Netz der Probe trennen, damit sie nicht mit der echten VM kollidiert: `qm set <probe-id> --net0 <modell>,bridge=<bridge>,link_down=1`.
3. `qm start <probe-id>`, warten, bis der Gast-Agent antwortet (`qm agent <probe-id> ping`).
4. Daten pruefen, ohne Netz, ueber den Gast-Agenten:
   ```
   qm guest exec <probe-id> --timeout 300 -- sudo -u finanzen node /opt/finanzen/app/tools/validator.mjs data/master
   qm guest exec <probe-id> --timeout 300 -- sudo -u finanzen node /opt/finanzen/app/tools/deploy-pruefung.mjs rauchtest /opt/finanzen/app/data/master
   ```
   Mit externem Datenort jeweils `env FINANZEN_DATEN=<Datenort>` vor `node` setzen. Erwartet: „validation passed“ und dieselbe Buchungs- und Kontenzahl wie auf der echten VM.
5. Aufraeumen: `qm stop <probe-id> && qm destroy <probe-id> --purge 1`.

## MCP-Protokoll

Beim Start per SSH-Forced-Command geht stderr an den Client, nicht ins Journal. Der MCP-Server schreibt seine Metadaten darum zusaetzlich nach `<Datenort>/logs/mcp-<JJJJ-MM>.log` (ohne Datenort: `app/data/logs/`, von Git ausgeschlossen), eine Zeile je Ereignis:

```
2026-10-20T06:15:02.118Z s=3f9a01c2 pid=4711 tools/call status 126ms
```

Enthalten sind nur Zeit, Sitzungskennung (zufaellig je Start), Prozess, Methode, Werkzeugname, Dauer und Fehlerklasse, nie Argumente oder Inhalte. Namen, die nicht wie ein Name aussehen, erscheinen als `(ungueltig)`. Je Monat eine Datei; alte Monate loescht der Admin bei Bedarf. Kann der Server nicht schreiben (Rechte, Platte voll), laeuft er weiter und meldet das einmal auf stderr.

Nachsehen auf dem Server: `sudo -u finanzen tail -n 50 <Datenort>/logs/mcp-$(date +%Y-%m).log`.

## Caching (Review D.2)

Der App-Server liefert Finanzdaten, Lese-APIs, Belege, Inbox, Logos, `index.html`, `version.json` und `sitzung.json` mit `no-store`. Nur Code-Assets (Modulgraph ab `index.html`, `styles.css`) duerfen in den Browser-Cache:

- `index.html` haengt an ihre Einstiegsdateien `?v=<Inhaltshash>`. Passt der Parameter zum aktuellen Inhalt der Datei: `private, max-age=31536000, immutable`. Weil der Hash am Inhalt haengt, nicht am Commit, kann auch ein Deploy-Ruecksprung keinen falschen Stand festschreiben.
- Alle anderen Code-Assets: `no-cache` mit Inhalts-ETag; der Browser fragt jedes Mal kurz nach und bekommt `304` ohne Inhalt, solange sich die Datei nicht geaendert hat.

Komprimieren uebernimmt der Reverse-Proxy (z. B. Caddy `encode`); der App-Server komprimiert nicht. Haengt der Proxy beim Komprimieren etwas an den ETag, liefert die Revalidierung statt `304` jedes Mal `200`: kein Fehler, nur weniger Ersparnis (pruefen: `curl -sI -H 'Accept-Encoding: gzip' <url>/views/<modul>.mjs`, dann mit `If-None-Match`).

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

Voraussetzung: Der Stand mit ADR 0036 ist deployt (`sudo finanzen-aktualisieren`). Alles als Admin auf dem Server; die App ist einige Minuten offline.

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
   Achtung: Die Liste darf nur Echtdaten nennen, nichts unter `app/data/demo`.
7. **Webdienst.** In `/etc/finanzen/app.env` `FINANZEN_DATEN=/var/lib/finanzen` ergaenzen. In der Unit `ReadWritePaths=/var/lib/finanzen/inbox` statt des alten Inbox-Pfads (Vorlage `ops/systemd/finanzen-app.service`), dann `sudo systemctl daemon-reload`.
8. **MCP.** Forced Command wie in der Tabelle oben, Zeile wieder aktivieren.
9. **Start und Probe.** `sudo systemctl start finanzen-app`, `journalctl -u finanzen-app -n 5` zeigt „Datenort /var/lib/finanzen“. Dann `sudo finanzen-aktualisieren` (prueft Validator und Rauchtest gegen den neuen Ort), eine MCP-Sitzung mit `status`, in der App Uebersicht, ein Beleg und ein Probe-Upload in die Inbox.

### Rueckweg

Solange nach dem Umzug nichts geschrieben wurde: Dienst stoppen, MCP-Zeile auskommentieren, `FINANZEN_DATEN` aus der Env-Datei, alte `ReadWritePaths` und alten Forced Command zuruecksetzen, `cd /opt/finanzen/app && sudo tar -xpf /var/backups/finanzen-umzug/daten-vorher.tar`, `daemon-reload`, starten.

Wurde am neuen Ort schon geschrieben, statt des Archivs den neuen Stand zurueckkopieren: `cd /var/lib/finanzen && sudo -u finanzen cp -a master master.gen inbox import-profile papierkorb /opt/finanzen/app/data/ && sudo -u finanzen cp -a Belege /opt/finanzen/app/`, dann wie oben vergleichen.

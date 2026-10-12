# App

Ziel: Eine geschuetzte Web-App, die ueber einen Webserver aus dem Verzeichnis `app/` ausgeliefert wird und ihre fuehrenden Daten zur Laufzeit aus `data/master/` laedt.

## Grundregeln

- Keine Build-Pipeline.
- Keine externen Runtime-Abhaengigkeiten.
- Fuehrende Daten liegen unter `data/master/` im App-Raum und werden per `fetch()` geladen.
- Inhalte unter `data/` und `Belege/` bleiben lokal und werden nicht versioniert; im Repository liegt nur die Ordnerstruktur.
- Die App schreibt keine Masterdaten; Agenten und Betriebstools schreiben gegen Schemas und Validator. Einziger Schreibweg der App ist **Hochladen** in `data/inbox/` (ADR 0028).
- Persistenz fuer Finanzdaten erfolgt nicht ueber versteckte Browser-Speicher.
- UI-Praeferenzen wie Sprache und Darstellung duerfen lokal gespeichert werden.

## Wichtige Dateien

```text
app/server.mjs
app/index.html
app/styles.css
app/main.js
app/data-loader.mjs
app/i18n.js
app/data/master/
app/tools/
app/schemas/
```

## Betriebsmodus

Die App läuft **nur über einen Webserver**, nicht per `file://`-Doppelklick: `main.js` ist ein ES-Modul und lädt Masterdaten per `fetch()`. Browser blockieren diese Betriebsart unter `file://`.

Webserver ist der App-Server `app/server.mjs` (nur Node-Bordmittel). Er liefert `app/` ohne Cache aus und nimmt Uploads aus dem Menuepunkt „Hochladen" entgegen, die er ausschliesslich nach `data/inbox/` legt. Verarbeitet werden sie im Import-Durchlauf mit dem Agenten.

```bash
node app/server.mjs
```

Lokal ist das der Entwicklungsbetrieb mit Demodaten. Produktiv laeuft der App-Server auf einer eigenen VM hinter Reverse Proxy mit Auth-Dienst (zweiter Faktor) und Heimnetz-Sperre; Agenten arbeiten dort ueber MCP per SSH. Der gesamte App-Raum, inklusive direkter Dateiaufrufe unter `data/`, `Belege/`, `schemas/` und `tools/`, ist nur hinter diesem Schutz erreichbar. Hintergrund: ADR 0008 (Webserver zulässig), ADR 0009 (Zugriffsschutz), ADR 0012 (App als ES-Modul), ADR 0015 (App als deploybarer Datenraum), ADR 0028 (Betrieb auf eigener VM). Das fruehere Setup ueber Synology Web Station und `serve_app.py` ist historisch.

Aktualisiert wird die VM mit `sudo finanzen-aktualisieren [branch]` (Default `main`), einer root-eigenen Kopie von `ops/aktualisieren.sh` unter `/usr/local/sbin` (Installation steht im Skriptkopf; neue Fassungen im Repo meldet das Skript nur): Fast-Forward auf `origin/<branch>`, Neustart des Dienstes und `app/version.json` (gitignored), deren Stand die App unten in der Sidebar zeigt (Kurz-Hash mit Link zum Commit, Datum, Branch ausser `main`); ohne die Datei steht dort „lokal“.

### Sitzungsschutz

Weil die App alle Daten beim Start in den Browser laedt, schuetzt `app/sitzung.mjs` die offene Seite:

- **Inaktivitaetssperre:** Nach `sperre_minuten` (Standard 5) ohne Maus-, Tastatur-, Touch- oder Scroll-Ereignis verwirft die App den geladenen Bestand, ersetzt die Oberflaeche und meldet beim Auth-Dienst ab. Ein verborgener Tab zaehlt als inaktiv; gemessen wird per Uhrzeit-Differenz, weil Browser Timer im Hintergrund drosseln.
- **Anmeldepruefung:** Jede Minute und bei Rueckkehr in den Tab fragt die App `version.json` ohne Weiterleitung ab. Eine Weiterleitung zur Anmeldeseite oder 401/403 heisst: Anmeldung abgelaufen, Bestand verwerfen und neu laden. 404 (lokal ohne `version.json`) und Netzwerkfehler sperren nicht.
- **Abmelden:** Knopf unten in der Sidebar (mobil im Mehr-Menue), nur mit konfigurierter Logout-URL.

Die Werte stehen in `app/sitzung.json` (gitignored, `{"abmelden_url": "...", "sperre_minuten": 5}`). Auf der VM schreibt sie `finanzen-aktualisieren` aus `FINANZEN_ABMELDEN_URL` und `FINANZEN_SPERRE_MINUTEN` in `/etc/finanzen/app.env` (Vorlage `ops/systemd/app.env.beispiel`). Die Logout-URL hat die Form `https://auth.<domain>/logout?rd=<url-kodierte App-URL>`; der Auth-Dienst folgt `rd` nur innerhalb seiner geschuetzten Domain. Lokal fehlt die Datei: Die App sperrt dann nur und laedt neu, ohne Abmelden-Knopf.

Das alte `review-data.js`-Bundle ist nicht mehr der fuehrende Betriebsmodus; die App liest einzelne Masterdateien direkt aus `data/master/`.

# App

Ziel: Eine geschuetzte Web-App, die ueber einen Webserver aus dem Verzeichnis `app/` ausgeliefert wird und ihre fuehrenden Daten zur Laufzeit aus `data/master/` laedt.

## Grundregeln

- Keine Build-Pipeline.
- Keine externen Runtime-Abhaengigkeiten.
- Fuehrende Daten liegen unter `data/master/` im App-Raum und werden per `fetch()` geladen.
- Inhalte unter `data/` und `Belege/` bleiben lokal und werden nicht versioniert; im Repository liegt nur die Ordnerstruktur.
- Die App schreibt keine Masterdaten; Agenten und Betriebstools schreiben gegen Schemas und Validator.
- Persistenz fuer Finanzdaten erfolgt nicht ueber versteckte Browser-Speicher.
- UI-Praeferenzen wie Sprache und Darstellung duerfen lokal gespeichert werden.

## Wichtige Dateien

```text
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

Die App läuft **nur über einen Webserver** (Synology Web Station bzw. lokaler Preview-Server), nicht per `file://`-Doppelklick: `main.js` ist ein ES-Modul und lädt Masterdaten per `fetch()`. Browser blockieren diese Betriebsart unter `file://`.

Der Webserver muss den gesamten App-Raum schuetzen, inklusive direkter Dateiaufrufe unter `data/`, `Belege/`, `schemas/` und `tools/`. Hintergrund: ADR 0008 (Webserver zulässig), ADR 0009 (Zugriffsschutz LAN), ADR 0012 (App als ES-Modul), ADR 0015 (App als deploybarer Datenraum).

Das alte `review-data.js`-Bundle ist nicht mehr der fuehrende Betriebsmodus; die App liest einzelne Masterdateien direkt aus `data/master/`.

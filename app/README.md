# App

Ziel: Eine lokale HTML/JavaScript-Oberflaeche, die ohne Webserver als Datei geoeffnet werden kann.

## Grundregeln

- Keine Build-Pipeline fuer den ersten Meilenstein.
- Keine externen Runtime-Abhaengigkeiten fuer die erste nutzbare Version.
- Daten werden agentisch als Review-Bundle bereitgestellt, nicht in der UI importiert.
- Persistenz fuer Finanzdaten erfolgt nicht ueber versteckte Browser-Speicher.
- UI-Praeferenzen wie Sprache und Darstellung duerfen lokal gespeichert werden.

## Erwartete spaetere Dateien

```text
app/index.html
app/styles.css
app/main.js
app/review-data.js
app/i18n.js
```

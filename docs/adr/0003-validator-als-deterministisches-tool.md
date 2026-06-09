# Validator als deterministisches Tool, Agent ruft auf

Statushinweis 2026-06-09: Der Grundsatz gilt weiter. Die alte Annahme `app/index.html` ohne Webserver ist durch ADR 0012 und ADR 0015 ueberholt; die Validator-Bibliothek muss heute im Webserver-Betrieb der App und per Node-CLI laufen.

Die Validierung von Masterdaten (Schemas, Pflichtfelder, Referenzen, Cross-Field-Regeln) ist eine deterministische **Bibliotheksfunktion**. Agenten **rufen** sie auf, sie **fuehren** sie nicht aus. Dieselbe Bibliothek laeuft im Browser (App) und unter Node (Cron-Agent).

Begruendung: Agenten sind nicht deterministisch — eine Validierung, die in einem Agent-Prompt definiert ist, kann heute OK sagen und morgen nicht. Genau das verhindern wir, um "stille Fachentscheidungen" auszuschliessen. Die App muss beim Lesen jedes Datensatzes unabhaengig pruefen koennen, ob er sauber ist. Defense-in-depth: schreiben prueft, lesen prueft erneut.

## Verworfene Alternativen

- **Validierung im Agent-Prompt**: flexibel, aber nicht deterministisch und nicht beim App-Laden verfuegbar.
- **Validierung nur in der App beim Laden**: zu spaet — invalide Daten waeren bereits in `data/master/`.

## Konsequenz

Die Validator-Bibliothek ist Voraussetzung fuer **M1** und blockiert **M3** (Importvorschlaege). Sie muss ohne Build-Schritt im Browser im Webserver-Betrieb der App laufen und ebenso per Node-CLI startbar sein. Empfohlene Basis: JSON Schema Draft 2020-12 ueber eine browser-faehige Implementierung (z. B. Ajv-Bundle), plus eine kleine eigene Cross-Field-Engine fuer Regeln, die JSON Schema nicht ausdrueckt.

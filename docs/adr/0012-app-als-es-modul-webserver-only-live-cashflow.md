# App als ES-Modul, webserver-only, Cashflow live berechnet

Ab M4 wird `app/main.js` als ES-Modul (`<script type="module">`) geladen und importiert die Cashflow-Berechnung aus `app/cashflow.mjs`. Cashflow-Ist und Cashflow-Prognose werden damit **live in der App** berechnet (eine getestete reine Funktion, die auch Node ausfuehrt), statt vorberechnet im Review-Bundle zu liegen. Konsequenz: Die App laeuft **nur noch ueber einen Webserver**, nicht mehr per `file://`-Doppelklick.

## Begruendung

Der historische Grund, warum die App ein reiner Viewer war (Bundle traegt alles vorberechnet), ist `file://`: Browser blockieren ES-Module unter `file://` (CORS). ADR 0008 hat den Webserver-Betrieb als zulaessig erklaert, und real laeuft die App ueber Synology Web Station (ADR 0009). Unter `http://` funktionieren ES-Module problemlos — damit faellt der Grund weg.

Das ermoeglicht, die App **schrittweise** von „Datenviewer" zu „Werkzeug" zu entwickeln (Ziel von M9), ohne diese Arbeit in einem grossen M9-Block zu sammeln. Cashflow ist der **Pilot**: die erste Oberflaeche, die live rechnet. Der wertvolle Teil — die deterministische, node-getestete Mathematik in `app/cashflow.mjs` — wird einmal gebaut und von Browser **und** Node genutzt; nichts wird spaeter weggeworfen.

Das Modul liegt unter `app/`, weil der Webserver laut ADR 0009 nur das App-Verzeichnis ausliefert (`tools/` ist im Browser nicht erreichbar). Es bleibt trotzdem reines, deterministisches ESM ohne Node-Abhaengigkeiten und ist per `node --test` abgesichert.

## Verworfene Alternativen

- **Vorberechnen ins Review-Bundle** (App bleibt Viewer): kein App-Umbau, aber Bundle-Plumbing, das beim spaeteren Umstieg auf Live-Berechnung teils weggeworfen wird — und schiebt die „Viewer → Werkzeug"-Arbeit in den M9-Block.
- **`file://` erhalten und trotzdem Module nutzen**: technisch nicht moeglich (Browser-CORS unter `file://`).
- **Eigene Browser-Implementierung parallel zum Node-Tool**: verletzt DRY und das Prinzip „eine getestete Funktion, zwei Aufrufstellen".

## Konsequenz

Die App ist ab M4 webserver-only. Der `file://`-Doppelklick-Betrieb entfaellt; das ist gemaess ADR 0008 als Webserver-Modus zu dokumentieren (README der App). Verifikation laeuft ohnehin ueber den lokalen Preview-/Webserver.

Die klassischen Scripts `review-data.js` und `i18n.js` bleiben klassische Scripts und setzen ihre `window`-Globals weiterhin synchron vor dem deferred Modul `main.js` — kein Timing-Problem.

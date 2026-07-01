# Diagramme hand-gerollt als SVG-String statt Chart-Library

Status: entschieden am 2026-07-01. Betrifft `app/charts.mjs` und alle Aufrufer
(Liquiditäts-, Szenario-Sicht). Ergänzt die Modul-/Betriebsentscheidungen aus ADR 0012
(App als ES-Modul, Webserver-only) und ADR 0008/0009 (LAN-Betrieb, zugriffsgeschützt).

## Entscheidung

Liniendiagramme werden weiterhin als **reine SVG-String-Funktion** (`linienDiagramm` in
`app/charts.mjs`) erzeugt — kein Chart-Framework (Chart.js, ApexCharts, uPlot o. ä.), auch
nicht als lokal gevendorte Datei. Neue Fähigkeiten (X-/Y-Achsen, Nulllinie, Quartalsmarken,
Legende, Hover-Tooltip) werden im selben Stil hand-gerollt: die Geometrie bleibt eine reine
Funktion, das Hover-Verhalten ein **delegierter `pointermove`-Handler** auf dem `app`-Container
(analog zum bestehenden Click-Delegate), der die Werte aus `data`-Attributen des SVG liest.

## Considered Options

- **Canvas-Chart-Library (Chart.js / ApexCharts):** Abgelehnt. Drei Gründe aus der
  Architektur: (1) `render()` ersetzt bei jeder Aktualisierung das komplette DOM
  (`app.innerHTML`) — eine imperative, zustandsbehaftete Chart-Instanz müsste bei jedem
  Re-Render zerstört und neu instanziiert werden (mehr Reibung, nicht weniger). (2) Es gibt
  keinen Bundler und keine Frontend-Dependencies; die App lädt rohe ES-Module direkt im
  Browser. Eine Library liefe entweder über einen Laufzeit-CDN-Request (in einer
  offline-/LAN-Finanz-App unerwünscht) oder müsste lokal gevendort werden. (3) Canvas
  verliert das automatische CSS-Variablen-Theming (Light/Dark umsonst) und die
  reine-Geometrie-Unit-Tests (`tests/charts.test.mjs`).
- **SVG-String-Library (SSR ohne lebenden DOM):** Verworfen als YAGNI. Solche Libraries sind
  rar und nicht erkennbar einfacher als die vorhandene ~80-Zeilen-Funktion, die genau das
  Nötige tut.

## Konsequenz

- `app/charts.mjs` bleibt DOM-frei und testbar; Achsen/Legende/Hover-Daten werden über die
  erzeugte Geometrie geprüft.
- Das Hover-Verhalten selbst ist DOM-Interaktion und wird per Preview/Screenshot verifiziert,
  nicht per Unit-Test.
- Diese Entscheidung gilt, solange die App bundlerlos, offline-fähig und im
  Wholesale-Re-Render-Modell bleibt. Steigt das Frontend später auf Bundler + persistentes
  Komponentenmodell um, ist eine SVG-Chart-Library neu abzuwägen.

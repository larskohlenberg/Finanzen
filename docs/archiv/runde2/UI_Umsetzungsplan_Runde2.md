# UI Umsetzungsplan Runde 2

Stand: 2026-06-04

Dieser Plan operationalisiert `docs/runde2/UI_Guideline_Runde2.md`. Er ist fuer weitere Codex-/Claude-Sessions gedacht und soll verhindern, dass Layoutentscheidungen erneut diskutiert werden muessen.

## Phase 1: App Shell Und Responsiveness

Ziel: Ein konsistenter Rahmen fuer alle Screens.

- Sidebar-Subtitle `Runde 2 · M2 Review` entfernen.
- Release-/Arbeitsstand unten in der Sidebar anzeigen.
- Mobile Top-Bar und Bottom-Navigation als klares Pattern etablieren.
- Statuszeile auf Desktop mit Controls ausrichten.
- Statuszeile auf Mobile kompakter machen.
- Sicherstellen, dass kein Screen Page-Level-Horizontal-Overflow erzeugt.
- Tabellen horizontal in `.table-wrap` scrollen lassen.

Akzeptanz:

- Desktop 1280px: alle Views ohne horizontalen Page-Overflow.
- Mobile 390px und 360px: alle Views ohne horizontalen Page-Overflow.
- Sprache/Theme/Settings sind mit Arbeitsstatus sauber ausgerichtet oder auf Mobile bewusst gestapelt.

## Phase 2: Uebersicht

Ziel: Uebersicht als echte Review-Startseite gemaess Stitch-Zielbild.

- Leadtext entfernen.
- Roadmap entfernen.
- KPI-Reihe: `Summe geladener Bewegungen` und `Nettovermoegen`.
- Rechte Rail: `Naechste Aktion` oben, `Checks im Blick` darunter.
- Rail horizontal einklappbar machen.
- `Konten und Depots`: `Stand`-Spalte ergaenzen.
- Tabelle sortierbar machen.
- Default-Sortierung: Giro, Tagesgeld, Depot; innerhalb der Gruppe neuester Stand; dann Name.
- Row Hover/Focus fuer Konten/Depots angleichen.

Akzeptanz:

- Desktop entspricht grob Stitch `3f58bd58dcb24235afc5b0e668c83e01`.
- Mobile entspricht grob Stitch `c0009bb045454c9095ead573cad59c42`.
- Keine Roadmap-Karte mehr im Overview.

## Phase 3: Transaktionen

Ziel: Review-Tabelle mit robusten Filtern und schliessbarer Detailansicht.

- Leadtext entfernen.
- Filterpanel containment-sicher machen: `min-width: 0`, Truncation, stabile Controls.
- Aktive Filter einzeln clearbar machen.
- Globales `Filter zuruecksetzen` nur bei aktiven Filtern anzeigen.
- Detail-Rail mit Schliessen-Icon ausstatten.
- Schliessen gibt der Tabelle mehr Raum.
- Mobile Detail als Bottom Sheet oder klar getrennte Detailsektion.

Akzeptanz:

- Desktop entspricht grob Stitch `d65d7d6d6a9b4292be6a6ddf67e24b5b`.
- Mobile entspricht grob Stitch `d8695ad5ad4943a7b1befaa23075df55`.
- Lange Kontonamen sprengen Filter nicht.

## Phase 4: Vermoegen Und M5-nahe Screens

Ziel: M5-nahe Vermoegenssicht an neuen Standard angleichen.

- Detail-Rail auf Mobile in Bottom-Sheet/Detailsektion ueberfuehren.
- KPI-Karten und Filter spacing an Forest-Dark-Standard angleichen.
- Werte immer mit `Stand` und Qualitaet zeigen.
- Checks aus Vermoegen konsistent in Checks-Screen verlinken.

Akzeptanz:

- Desktop: KPI, Filter, Tabelle, Detailrail klar gegliedert.
- Mobile: kein seitlicher Detailbereich; Details bewusst oeffnen/schliessen.

## Phase 5: Restliche Screens Angleichen

Ziel: Cashflow, Regelzahlungen, Stammdaten, Checks und Export sind konsistent, ohne eigene Sonderlayouts zu erfinden.

- Cashflow: Toolbar fuer Prognose direkt ueber Prognosetabelle.
- Regelzahlungen: Tabellenstandard und Mobile-Kompaktheit pruefen.
- Stammdaten: Tiles auf Mobile verdichten.
- Checks: resolved/all-clear state definieren.
- Export: Placeholder kleiner, ruhiger, nicht heroartig.

Akzeptanz:

- Alle Screens folgen denselben Panel-, Tabellen-, Chip- und Typografie-Regeln.
- Keine sichtbaren UI-Beschreibungs-/Bedienungstexte, wo fachlicher Scope ausreicht.

## Verifikation Fuer Jede Phase

- `npm test`
- Browser-Screenshot Desktop 1280px fuer betroffene Views.
- Browser-Screenshot Mobile 390px und 360px fuer betroffene Views.
- DOM-Check: `document.documentElement.scrollWidth <= document.documentElement.clientWidth` auf Mobile.
- Sichtpruefung: Text passt in Buttons, Chips, Cards und Filter.

## Nicht-Ziele

- Kein Tailwind/Shadcn/React-Umbau.
- Kein Marketing-Hero.
- Keine dekorativen Bilder oder Charts.
- Keine fachlichen Daten erfinden.

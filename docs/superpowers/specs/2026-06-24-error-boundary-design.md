# Fehlergrenze (Error Boundary)

**Datum:** 2026-06-24
**Status:** Entwurf zur Umsetzung

## Problem

Die App rendert ihre komplette Oberfläche, indem sie in `render()`
([app/main.js:117](../../../app/main.js)) einen HTML-String baut und an
`app.innerHTML` zuweist. Wirft eine der View-Funktionen dabei (z. B.
`renderRegelzahlungen()`), bricht die Template-Auswertung **vor** der Zuweisung
ab — der alte DOM bleibt stehen, sichtbar passiert nichts. Der Nutzer erlebt
„Klick tut nichts", ohne Hinweis, dass und wo ein Fehler auftrat.

Konkreter Auslöser: `renderRegelzahlungen()` rief `toCents()` auf, ohne es zu
importieren. Der Fehler lag seit Erstellung der Datei latent, weil
`data.regelzahlungen` leer war und der `.map()`-Körper nie lief. Sobald echte
Regelzahlungen existierten, warf die erste Zeile `ReferenceError` und der
gesamte Render brach still ab.

Dasselbe Muster gilt für **Aktionen**: Wirft ein Klick-/Eingabe-Handler in
seiner Logik (z. B. ein Import beim Parsen einer kaputten Zeile), bevor er
`render()` aufruft, landet der Fehler nur in der Browser-Konsole — auf der
Oberfläche ist nichts zu sehen.

## Ziel

- **Kein Bildschirm bleibt je weiß.** Ein Fehler beim Rendern eines Views ersetzt
  nur diesen View durch ein Fehler-Panel; Sidebar, Topbar und Navigation bleiben
  bedienbar, sodass der Nutzer weiterarbeiten oder neu laden kann.
- **Keine Aktion schluckt einen Fehler still.** Wirft ein Event-Handler, wird der
  Fehler als schließbares Banner sichtbar gemacht, statt nur in die Konsole zu
  gehen.
- **Reagierbar.** Das Panel zeigt eine kurze Klartext-Meldung und macht die
  technische Fehlermeldung samt Stacktrace aufklappbar zugänglich, ohne dass man
  die Browser-Konsole öffnen muss.

## Nicht-Ziele (YAGNI, privates Einzelnutzer-Projekt)

- Kein externer Error-Tracking-/Logging-Dienst.
- Keine Retry-Automatik, keine Fehler-Persistenz über Reloads hinweg.
- Keine Enterprise-Muster (Audit-Logs o. Ä.).

## Architektur

Ein neues, in sich abgeschlossenes Modul kapselt die Fehlerbehandlung als reine
Funktionen. `main.js` ruft sie nur auf; es entsteht keine verstreute
try/catch-Logik in den Views.

### Neues Modul `app/error.mjs`

Reine, ohne DOM testbare Funktionen:

- `renderErrorPanel(error, kontext)` → HTML-String. Kurze Meldung („Dieser
  Bereich konnte nicht geladen werden") plus `<details>`-Block mit
  `error.message` und `error.stack` zum Aufklappen. Nutzt `escapeHtml` und `t`
  aus dem Runtime/i18n.
- `safeRender(fn, kontext)` → führt `fn()` aus und gibt dessen HTML zurück; bei
  `throw`: `console.error(kontext, error)` + Rückgabe von
  `renderErrorPanel(error, kontext)`. Das ist die **Render-Grenze**.
- `guard(fn, onError)` → gibt eine umhüllte Funktion zurück, die `fn(...args)`
  aufruft; bei `throw`: `console.error` + Aufruf von `onError(error)`. Das ist
  die **Aktions-Grenze**.

### Verdrahtung in `app/main.js`

- **Render-Grenze:** Der Aufruf `${renderView()}` in `render()`
  ([app/main.js:128](../../../app/main.js)) wird zu
  `${safeRender(renderView, "view:" + state.view)}`. Sidebar, Topbar und
  Validierungs-Banner werden weiterhin separat gerendert und bleiben daher bei
  einem View-Fehler erhalten.
- **Aktions-Grenze:** Die Top-Level-Event-Listener (click, input/change, submit)
  werden mit `guard(handler, setUiError)` umschlossen. `setUiError(error)` setzt
  ein transientes `state.uiError = { message, stack, kontext }` und ruft
  `render()`.
- **Anzeige von Aktionsfehlern:** `render()` rendert bei gesetztem
  `state.uiError` `renderErrorPanel(...)` als **schließbares Banner** oberhalb des
  Views (neben dem Validierungs-Banner). Ein Schließen-Button und jede
  Navigation setzen `state.uiError` zurück auf `null`.

### Datenfluss

```
Laden / Re-Render
  render()
    └─ safeRender(renderView, ctx)
         ├─ Erfolg → View-HTML
         └─ throw  → console.error + renderErrorPanel  (Sidebar/Topbar bleiben)

Klick / Eingabe
  guard(handler, setUiError)(event)
    ├─ Erfolg → handler läuft, ruft meist render()
    └─ throw  → console.error + state.uiError gesetzt + render()
                 └─ render() zeigt renderErrorPanel als Banner über dem View
```

### i18n (`app/i18n.js`, de + en)

Drei neue Keys unter einem `error.`-Namespace:

- `error.viewTitle` — kurze Meldung („Dieser Bereich konnte nicht geladen
  werden." / „This section could not be loaded.")
- `error.detailsToggle` — Toggle-Label des `<details>` („Technische Details" /
  „Technical details")
- `error.dismiss` — Schließen-Label des Aktions-Banners.

### CSS (`app/styles.css`)

Eine `.error-panel`-Klasse, die vorhandene Panel- und `danger`-Stile
wiederverwendet (analog zu `.validation-banner`). Kein neues Designsystem.

## Teststrategie (`tests/error.test.mjs`)

Da `app/error.mjs` reine Funktionen exportiert, sind sie ohne DOM testbar
(Muster wie `tests/komponenten-*.test.mjs`):

- `renderErrorPanel(error, ctx)` enthält die kurze Meldung **und** sowohl
  `error.message` als auch `error.stack` im `<details>`-Block.
- `safeRender(fn, ctx)` reicht bei Erfolg das HTML von `fn` unverändert durch.
- `safeRender(fn, ctx)` liefert bei werfendem `fn` das Fehler-Panel statt zu
  werfen.
- `guard(fn, onError)` ruft `onError` mit dem geworfenen Fehler auf und wirft
  selbst nicht weiter.

Der bestehende Regressions-Test `tests/regelzahlungen-view.test.mjs` (deckt den
ursprünglichen `toCents`-Fehler ab) bleibt bestehen.

## Risiken / offene Punkte

- **Fehler beim Rendern des Panels selbst:** `renderErrorPanel` muss bewusst
  trivial und abhängigkeitsarm sein (nur `escapeHtml`/`t`), damit es nicht selbst
  werfen kann.
- **`state.uiError` zurücksetzen:** Muss bei jeder Navigation zuverlässig geleert
  werden, damit ein einmaliger Aktionsfehler nicht „kleben" bleibt.

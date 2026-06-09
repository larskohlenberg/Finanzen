# UI Handoff: App-Shell und wiederkehrende Komponenten (Runde 2)

Stand: 2026-06-08

Diese Spec ist die Entwickler-Übergabe für die Bausteine, die sich über alle acht Views (Übersicht, Transaktionen, Cashflow, Regelzahlungen, Vermögen, Stammdaten, Checks, Export) wiederholen. Sie ergänzt `docs/runde2/UI_Guideline_Runde2.md` (Stilrichtlinie) und `docs/runde2/UI_Umsetzungsplan_Runde2.md` (Phasenplan) um konkrete Maße, Tokens, States und Edge Cases — Grundlage für Implementierung und Review, nicht für Pro-Screen-Layouts.

Quelle: Live-Audit von `app/` (Commit `b4715c8`) per lokalem Preview-Server, Screenshots bei 390/800/1280px sowie Inspektion von `app/styles.css` und `app/main.js`. Bekannte Lücken/Bugs aus diesem Audit sind unten explizit als **Befund** markiert (siehe auch die parallel erstellte Design-Critique und das Accessibility-Audit für M5).

> **Umsetzungsstatus (2026-06-08, Branch `codex-runde2-layout-redesign`):** Alle unten markierten **Befunde** wurden umgesetzt und per Preview verifiziert (Tests: 103/103 grün). Die Befund-Callouts bleiben als Begründung/Kontext bestehen, sind aber erledigt. Zusammenfassung:
>
> | Befund | Fix | Datei |
> |---|---|---|
> | Render-Modell: Fokusverlust + `aria-live` auf `#app` | Fokus-/Scrollerhalt über `render()`; `aria-live` in dedizierte `#sr-status`-Region verschoben (announced Treffer/Saldo) | `app/main.js`, `app/index.html` |
> | Fokus-Indikator unsichtbar | Globaler `:focus-visible`-Ring `2px solid var(--accent)` am Dateiende | `app/styles.css` |
> | Tabellenzellen nicht per Tastatur auslösbar | `keydown`-Handler (Enter/Space → `.click()`); Vermögenszeilen `tabindex`/`role=button` | `app/main.js` |
> | `--review` Light-Kontrast 3.30:1 | `--review` Light auf `#8f5d12` (≈5.1:1) | `app/styles.css` |
> | `--faint` toter Token | entfernt (beide Themes) | `app/styles.css` |
> | `prefers-reduced-motion` fehlt | Reduce-Motion-Media-Block ergänzt | `app/styles.css` |
> | Kein Skip-Link | `.skip-link` + `#main-content`-Ziel | `app/index.html`, `app/styles.css` |
> | Hero-KPI ohne zugänglichen Namen | `aria-labelledby` auf beide `.hero-kpi` | `app/main.js` |
> | Touch-Targets <44px | Nav-Buttons 44px, Controls 40px | `app/styles.css` |
> | KPI-Großzahl überläuft (viewport-`vw`) | Container-Query `clamp(28px, 11cqi, 48px)` | `app/styles.css` |
> | Top-Nav-Überlappung 760–1180px | `.nav-button { flex: 0 0 auto }` (scrollt statt zu überlappen) | `app/styles.css` |
> | Filter-Select-Truncation ohne Ellipsis | `text-overflow: ellipsis` | `app/styles.css` |
> | Zwei Icon-Systeme (SVG vs. Glyphen) | Status-/Toggle-/Transfer-Glyphen auf `iconSvg()` vereinheitlicht (neue Icons: `warning`, `transfer`, `chevronRight/Left`). Ausnahme: Theme-/Sprach-`<option>` (◐☀☾, Flaggen) und Sortierpfeile ▲▼ bleiben — `<option>` kann kein SVG tragen | `app/main.js`, `app/icons.js` |
> | `cents()` Float-Multiplikation | Integer-String-Parsing | `app/main.js` |
> | Bootstrap ohne Schutz | `try`-artiger Guard mit sichtbarer Fallback-Meldung | `app/main.js` |
> | History-Spam (`pushState` je Klick) | `pushState` nur bei View-Wechsel, sonst `replaceState` | `app/main.js` |
>
> **Hinweis Modul-Cache:** `app/main.js` wird als ES-Modul ohne Versionsquery geladen; Browser cachen es aggressiv. Nach Updates auf dem Synology-/Preview-Server ggf. einen Hard-Reload (bzw. Cache-Header im Webserver) einplanen — sonst läuft alte JS-Logik trotz neuer Datei.

## Übersicht

| Komponente | Sektion |
|---|---|
| **Render-Modell (Fokus, `aria-live`) — vor jeder UI-Änderung lesen** | 0 |
| App Shell (Sidebar, Topbar, Layout-Grid) | 1 |
| Design Tokens (Farben, Radius, Spacing, Typo) | 2 |
| Navigation (Sidebar-Nav, Bottom-/Icon-Nav) | 3 |
| Panels und Cards (inkl. KPI-Cards) | 4 |
| Tabellen (`table-wrap`, sortierbar, klickbare Zeilen) | 5 |
| Filter-Leiste und Controls | 6 |
| Status-Badges und Chips | 7 |
| Detail-Rail | 8 |
| Sprache/Theme-Switcher | 9 |
| Responsive Breakpoints (App-weit) | 10 |
| Edge Cases (App-weit) | 11 |
| Accessibility-Notizen (App-weit) | 12 |
| Robustheit (Bootstrap, History) — knapp vermerkt, außerhalb UI-Scope | 13 |

---

## 0. Render-Modell — wichtig für jede UI-Änderung

`render()` ([main.js:180](../../app/main.js)) baut bei **jeder** Interaktion (Filter, Pagination, Zeilenauswahl, View-Wechsel, Theme/Sprache) den kompletten DOM neu auf: `app.innerHTML = …`. Das ist für eine Build-pipeline-freie App nachvollziehbar, hat aber zwei Konsequenzen, die jede neue Komponente von vornherein berücksichtigen muss:

> **Befund (kritisch, Architektur + A11y):**
> 1. **Fokusverlust nach jeder Interaktion**: Da der gesamte Subtree ersetzt wird, springt der Fokus auf `<body>` zurück — Tastatur- und Screenreader-Nutzer verlieren nach jedem Klick (Filter ändern, Seite wechseln, Zeile auswählen) ihre Position (WCAG 2.4.3 Focus Order). Es existiert **keine** Logik, die Fokus oder Scrollposition über den Re-Render hinweg merkt und wiederherstellt.
> 2. **`aria-live="polite"` sitzt auf `#app`** ([index.html:13](../../app/index.html)) — also auf der gesamten App-Shell inklusive Sidebar, Topbar und Hauptinhalt. Bei jedem Re-Render liest ein Screenreader im schlimmsten Fall die komplette Oberfläche erneut vor — ein Dauer-Vorlese-Bug, der die App für Screenreader-Nutzer praktisch unbedienbar macht.
>
> **Fix-Optionen (beide ohne Build-Pipeline machbar):**
> - **Kurzfristig**: Fokus-Element (per `id`/`data-*`-Marker) und Scroll-Offset vor `render()` merken, danach gezielt wiederherstellen; `aria-live="polite"` von `#app` auf eine kleine, dedizierte Status-Region verschieben (z. B. „30 Treffer, gefilterter Saldo 1.962,43 €"), die nur bei tatsächlichen Ergebnisänderungen aktualisiert wird.
> - **Mittelfristig (eigentliche Modernisierung)**: Wechsel von `innerHTML`-Vollersatz auf gezielte DOM-Updates bzw. einen Mini-Renderer (`lit-html`, `morphdom`), der bestehende Knoten inkl. Fokus erhält und nur Differenzen patcht.

Für jede neue Komponente in dieser Spec gilt: **state, das den Fokus tragen kann (Inputs, Tabs, Detail-Trigger), braucht eine explizite Strategie für Fokuserhalt über `render()` hinweg.**

---

## 1. App Shell

**Struktur:** `.app-shell` ist ein zweispaltiges Grid: feste Sidebar (`--sidebar-width: 248px`, kollabiert auf `--sidebar-collapsed-width: 84px`) + fluider Hauptbereich (`.main`). Innerhalb des Hauptbereichs trägt `.layout-with-rail` ein zweites Grid für Inhalt + optionale rechte Detail-Rail (`minmax(0, 1fr) 320px`).

| Element | Maß/Wert | Quelle |
|---|---|---|
| Sidebar-Breite (offen) | 248px | `--sidebar-width`, [styles.css:23](../../app/styles.css) |
| Sidebar-Breite (kollabiert) | 84px | `--sidebar-collapsed-width`, [styles.css:24](../../app/styles.css) |
| Sidebar-Padding | 24px 18px | [styles.css:123](../../app/styles.css) |
| Rail-Breite | 320px fix | `.layout-with-rail`, [styles.css:362](../../app/styles.css) |
| Grid-Gap (Layout-with-Rail) | 18px | [styles.css:363](../../app/styles.css) |
| Grid-Gap (Stack/Panels) | 16px | `.stack`, [styles.css:377](../../app/styles.css) |

**Verhalten:**
- Sidebar ist `position: sticky; top: 0; height: 100vh` auf Desktop (≥1180px).
- Rail ist optional — wird nur gerendert, wenn `selectedTransactionId`/Detailkontext gesetzt ist; ohne Rail wird `.layout-with-rail.rail-closed` mit einer Spalte verwendet.
- Sidebar-Kollaps wird in `localStorage` persistiert (`storageKeys.sidebarCollapsed`), Theme/Sprache analog.

---

## 2. Design Tokens

Alle Farben sind CSS Custom Properties auf `:root`, mit Override via `:root[data-theme="dark"]`. **Es gibt keinen separaten `[data-theme="light"]`-Block** — Light ist der `:root`-Default.

| Token | Light | Dark | Verwendung |
|---|---|---|---|
| `--bg` | `#ffffff` | `#0f1513` | Seitenhintergrund |
| `--surface` | `#f6f8f6` | `#17201d` | Panels, Sidebar, Cards |
| `--surface-2` | `#edf3ef` | `#202b27` | Hover-/Active-Hintergrund |
| `--text` | `#17211d` | `#eef5f0` | Haupttext |
| `--muted` | `#66716d` | `#a8b5af` | Sekundärtext, Labels |
| `--faint` | `#8a9691` | `#7f8d86` | **Befund: toter Token** — in beiden Themes definiert, aber an keiner Stelle in `styles.css` per `var(--faint)` referenziert. Entweder einem realen Verwendungszweck zuordnen (Light-Wert müsste dabei wegen 3.06:1-Kontrast ohnehin abgedunkelt werden) oder ersatzlos entfernen |
| `--border` / `--border-strong` | `#dde5df` / `#c8d3cc` | `#2d3a35` / `#405049` | Trennlinien, Card-Rahmen |
| `--accent` / `--accent-strong` / `--accent-soft` | `#0f766e` / `#0b5f59` / `#dcefeb` | `#5ac7b8` / `#8dddd2` / `#123b36` | Aktive Navigation, Links, Akzentflächen |
| `--review` / `--review-soft` | `#b7791f` / `#fff3d6` | `#efb84a` / `#3d2e13` | "Offen/Prüfen"-Status — **Befund: Light-Kontrast 3.30:1, unter AA-Minimum** |
| `--success` / `--success-soft` | `#267a4a` / `#e2f4e9` | `#75d08f` / `#173821` | "Bestanden/OK"-Status |
| `--danger` / `--danger-soft` | `#b42318` / `#fde7e4` | `#ff8b7f` / `#421b18` | Fehler/Warnung-Status |
| `--radius` / `--radius-tight` | `6px` / `4px` | gleich | Card-/Button-/Input-Radius |
| `--shadow` | `none` | `none` | bewusst keine Schatten (Guideline: "keine dekorativen Schatten") |

**Typografie:** `Inter, ui-sans-serif, system-ui, …`. Keine negativen `letter-spacing` (Guideline-Vorgabe). Zahlen sollten `font-variant-numeric: tabular-nums` nutzen — aktuell **nicht** gesetzt (Befund, betrifft v. a. Tabellenspalten mit Beträgen/Daten).

**Befund — Fokus-Kontrast:** `--surface` ↔ `--surface-2` hat nur ≈1.05–1.14:1 Kontrast (Light/Dark). Da Hover/Focus primär über diesen Hintergrundwechsel signalisiert wird, ist der Effekt kaum wahrnehmbar (siehe Abschnitt 12).

---

## 3. Navigation

### 3.1 Sidebar-Navigation (Desktop ≥1180px)

`<nav class="nav">` mit `<button class="nav-button" data-view="…">` je Eintrag, bestehend aus `.nav-icon` (SVG, lucide-Stil) + `.nav-label` (Text).

| State | Hintergrund | Text | Sonstiges |
|---|---|---|---|
| Default | `transparent` | `--muted` | — |
| Hover | `--surface-2` | `--text` | `outline: none` |
| Focus-visible | `--surface-2` | `--text` | `outline: none` — **Befund: kein sichtbarer Fokusring, siehe A11y** |
| Active (aktuelle View) | `--accent-soft` | `--accent-strong` | `font-weight: 700` |

Reihenfolge (`navItems`, [main.js:14](../../app/main.js)): Übersicht → Transaktionen → Cashflow → Regelzahlungen → Vermögen → Stammdaten → Checks → Export.

### 3.2 Tablet-Navigation (760–1180px)

Sidebar wird zur horizontalen Top-Bar (`position: sticky; grid-template-columns: auto 1fr`), `.nav` wird `display: flex; overflow-x: auto`, Labels bleiben sichtbar (`white-space: nowrap`).

> **Befund (kritisch):** In diesem Bereich überlappen sich die Nav-Label-Spans sichtbar — das `.nav-label` hat `display: block` und ist breiter als sein `.nav-button`-Container (z. B. "Übersicht" misst ~76px, der Button schrumpft aber auf ~47px). Ergebnis: unleserlicher Buchstabensalat über die gesamte Top-Bar-Breite. **Fix-Empfehlung:** entweder `.nav-label` in diesem Breakpoint analog zu <760px ausblenden (Icon-only) oder dem Flex-Item eine Mindestbreite geben, die seinem Inhalt entspricht (`flex: 0 0 auto` + `.nav-label{display:inline-block; overflow:hidden; text-overflow:ellipsis}`), damit der Container horizontal scrollt statt zu überlappen.

### 3.3 Mobile-Navigation (<760px)

`.nav-label{display:none}`, `.nav-button{width:44px; flex:0 0 44px; padding:0}` → reine Icon-Leiste. Funktioniert sauber, keine Überlappung.

| Breakpoint | Nav-Darstellung |
|---|---|
| ≥1180px | Vertikale Sidebar mit Icon + Label |
| 760–1180px | Horizontale Top-Bar mit Icon + Label, **aktuell fehlerhaft (Überlappung)** |
| <760px | Horizontale Icon-only-Leiste, Labels via `aria-label`/`title` |

---

## 4. Panels und Cards

`.panel` ist der Basis-Baustein: `border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow)` (= kein Schatten). `.panel-pad` ergänzt `padding: 18px`. Guideline-Regel: **keine Cards in Cards**.

### 4.1 KPI-Cards (`.hero-kpi`, `.overview-kpis`)

Struktur: `.kpi-label` (14px/650, `--muted`) → `.kpi-value` (Großzahl) → `.kpi-note` (14px, `--muted`).

| Eigenschaft | Wert |
|---|---|
| `.kpi-value` Schriftgröße | `clamp(38px, 5vw, 62px)`, `font-weight: 800`, `line-height: 0.95` |
| Grid | `.overview-kpis{grid-template-columns: repeat(2, minmax(0,1fr)); gap: 16px}` |

> **Befund (kritisch):** Die `5vw`-Bemessung bezieht sich auf die Viewport-Breite, nicht auf die tatsächliche Card-Breite. Sobald die Rail offen ist oder die Sidebar Platz beansprucht (reproduziert bei 800px **und** bei 1280px mit geöffneter Detail-Rail), ist die gerenderte Card schmaler als der Text breit ist (~254px Card vs. ~318px Text) — die Großzahl überlappt sichtbar die Nachbar-Card. **Fix-Empfehlung:** Schriftgröße an Container statt Viewport koppeln, z. B. CSS Container Queries (`container-type: inline-size` auf `.hero-kpi`, `font-size: clamp(28px, 12cqi, 48px)`) oder konservativere `vw`-Obergrenze (≈44–48px statt 62px), die auch im Zwei-Spalten-plus-Rail-Fall passt.

### 4.2 Mini-KPI (`.mini-kpi`)

`min-height: 86px; padding: 14px`, Wert in `.mini-kpi .value` bei `22px/780`. Wird u. a. auf Cashflow/Vermögen für sekundäre Kennzahlen verwendet — bewusst deutlich kleiner als `.hero-kpi`, was im direkten Vergleich (gleiche Seite) als Stilbruch auffällt (siehe Critique, Consistency).

---

## 5. Tabellen

`.table-wrap{overflow-x:auto; overflow-y:hidden; -webkit-overflow-scrolling:touch}` umschließt `<table>`. Spaltenköpfe sind großgeschrieben (`text-transform`/`letter-spacing` über generische Tabellen-Styles), Beträge rechtsbündig.

- **Klickbare Zeilen** (`tr.clickable`, `tr.transaction-row`): öffnen die Detail-Rail; haben dedizierte `:focus-within`-Hervorhebung der `<td>`-Zellen ([styles.css:516](../../app/styles.css)) — funktioniert visuell als Tastatur-Fokusersatz besser als die generischen Button-Foki.

> **Befund (kritisch, Tastaturbedienbarkeit):** Die selektierbaren Zellen `.row-select-cell` ([main.js:550-556](../../app/main.js)) tragen `tabindex="0"` und `data-action="select-transaction"`, aber **keinen** `keydown`-Handler — im gesamten `main.js` existiert kein `keydown`/`keyup`/`keypress`-Listener. Per Tastatur lässt sich die Zelle fokussieren, aber **nicht auslösen**: Enter/Space tun nichts, die Zeilenauswahl bleibt eine reine Maus-Funktion (WCAG 2.1.1 Keyboard). **Fix-Empfehlung:** entweder echte `<button>`-Elemente für die auswählbare Zeile/Zelle verwenden (erbt Tastatursemantik kostenlos) oder einen `keydown`-Handler ergänzen, der bei `Enter`/`Space` denselben `data-action`-Pfad wie der bestehende Click-Handler auslöst.

- **Geldbeträge** (`formatMoney(cents(tx.betrag))`): `cents()` ([main.js:82](../../app/main.js)) parst Beträge per `Math.round(Number(decimalString) * 100)` — also über Float-Multiplikation. Im selben Repo existiert mit `toCents()` aus `cashflow.mjs` ([cashflow.mjs:6](../../app/cashflow.mjs)) bereits eine Integer-sichere String-Split-Variante (`Number(euros) * 100 + Number(cents)`), die in einer Finanz-App das robustere Muster ist. **Empfehlung:** `cents()` auf dasselbe Integer-Parsing umstellen oder direkt `toCents` wiederverwenden, um Rundungsrisiken an den Rändern (z. B. `0.005`-Fälle) zu vermeiden.
- **Status-Zelle**: enthält Badge + erläuternden Zusatztext (z. B. "Kontoreferenz fehlt"), mehrzeilig; benötigt ausreichend Spaltenbreite (`min-width` empfehlenswert), sonst Zeilenumbruch mit unschönem Höhenunterschied zwischen Zeilen.
- **Verhalten bei geöffneter Rail**: Tabellenbreite schrumpft auf die `1fr`-Spalte; rechte Spalten (Betrag, Status) werden bei vielen Spalten knapp/abgeschnitten, Scroll-Indikator (Schatten am Rand) fehlt.

Edge Cases: leere Tabelle (kein definierter Empty-State im Audit beobachtet — sollte laut Guideline "Keine offenen Checks"-artige, ruhige Leerzustände bekommen), sehr lange Kontonamen ("Girokonto Person B MusterbankD") brechen bereits jetzt zweizeilig um.

---

## 6. Filter-Leiste und Controls

`.filter-bar > .filter-field > select` — jedes Feld mit `<label>`, `id`/`for`-Kopplung, kein zusätzliches `title`.

| Eigenschaft | Wert |
|---|---|
| Select-Breite | ~95–117px (variiert je Feldinhalt), `max-width: 100%` |
| `text-overflow` | `clip` |

> **Befund (moderat):** Ausgewählte Werte werden mitten im Wort abgeschnitten ("Alle Konten" → "Alle Konte", "Alle Status" → "Alle Statu") **ohne** Ellipsis. Der zugängliche Name bleibt korrekt (native `<select>` exponiert den vollen Options-Text an Screenreader), aber sehende Nutzer — insbesondere bei Browser-Zoom — sehen abgeschnittenen Text ohne visuellen Hinweis auf Kürzung. **Fix-Empfehlung:** `text-overflow: ellipsis; overflow: hidden; white-space: nowrap` und/oder `min-width` anheben, damit der häufigste Wert ("Alle Konten" etc.) vollständig passt.

---

## 7. Status-Badges und Chips

Drei Status-Familien über `--review`/`--success`/`--danger` (+ `-soft`-Hintergrund):

| Typ | Beispieltext | Light-Kontrast (Text/Soft-BG) | AA bestanden? |
|---|---|---|---|
| Review/Offen | "? 1 Kategorie offen" | 3.30:1 | ❌ |
| Success/OK | "✓ Validierung bestanden" | (success: 6.x:1, siehe A11y-Audit) | ✅ |
| Danger/Fehler | "⚠ 1 Importfehler" | 5.55:1 | ✅ |

> **Befund:** Nur die Review/Amber-Familie unterschreitet im Light-Mode die 4.5:1-Schwelle für Fließtext. Da diese Badges Arbeitsstatus transportieren (zentrale Information laut Guideline-Leitbild "Werte, Datenstände, Status … sind wichtiger als optische Effekte"), sollte `--review` im Light-Theme dunkler gezogen werden (z. B. `#9a6213`, ergibt ≈4.6:1 auf `#fff3d6`).

> **Befund (Konsistenz, app-weit relevant für jede neue Komponente):** Es existieren aktuell **zwei parallele Icon-Systeme** nebeneinander: `iconSvg()` ([icons.js](../../app/icons.js), 7 Verwendungen — saubere, lucide-artige SVGs, u. a. in `statusChip()`) **und** Inline-Textglyphen quer durch `main.js` (`✓` ×7, `⚠` ×2, `◐ ☀ ☾` je ×1, `▸ ▾` je ×2, `↔` ×2, `• ‹ ›` u. a.). Die Cashflow-/Checks-Chips und Accordion-Pfeile nutzen Glyphen, `statusChip()` nutzt SVG — selbe Bedeutungsebene (Status, Richtung, Auf-/Zuklappen), zwei visuelle Sprachen. Das ist die größte Konsistenz-Lücke im aktuellen Code und genau das, was Guideline-Abschnitt 6 ("Icons ersetzen provisorische Text-Glyphen … wo echte Navigation, Status, Typen oder Aktionen gemeint sind") adressiert. **Für neue/überarbeitete Komponenten: ausschließlich `iconSvg()` verwenden, keine neuen Glyphen-Präfixe einführen** — Badge-/Chip-Komponenten sollten generell einen `icon`-Slot statt eines Text-Glyphen-Präfixes vorsehen, damit die Migration schrittweise (Komponente für Komponente) möglich ist.

---

## 8. Detail-Rail

Rechte Spalte (320px) mit `.detail-panel`, öffnet kontextabhängig (z. B. bei Klick auf eine Transaktionszeile oder ein Vermögens-Item). Header mit Titel ("Details") + Schließen-Button (`✕`/`aria-label`). Inhalt ist eine vertikale Liste benannter Felder (Label in Großbuchstaben/`--muted`, Wert in `--text`).

- Schließen setzt `selectedTransactionId`/Kontext zurück und kollabiert `.layout-with-rail` auf eine Spalte (`rail-closed`).
- Auf Tablet/Mobile (<1180px) wird `.layout-with-rail{display:block}`, die Rail rutscht unter den Hauptinhalt (`margin-top: 16px`), `.detail-panel{position: static}` statt sticky.

Edge Cases: kein Inhalt selektiert → Rail wird nicht gerendert (kein Empty-State-Panel); sehr lange Werte (z. B. lange Verwendungszwecke) sollten per `overflow-wrap: anywhere` umbrechen — ist für `.kpi-value`-ähnliche Elemente gesetzt, für Rail-Felder im Audit nicht eindeutig verifizierbar gewesen.

---

## 9. Sprache- und Theme-Switcher

Zwei `<select class="control-select icon-select" data-control="lang|theme">` mit `aria-label` **und** `title` (gut — beide Namen vorhanden). Werte: Sprache `🇩🇪`/`🇬🇧` (`value="de"|"en"`), Darstellung `◐`/`☀`/`☾` (`value="system"|"light"|"dark"`).

| Eigenschaft | Desktop | Mobile (<760px) |
|---|---|---|
| Breite | ~36–54px | 44px (`min-width`) |
| Höhe | ~32px | 34px |

> **Befund (gering):** Beide liegen unter der empfohlenen 44×44px-Touch-Zielgröße (WCAG 2.5.5), v. a. relevant in der Tablet-Breite, wo die App laut README auch über Touch bedient werden könnte.

Theme-Resolution: `state.theme === "system"` löst über `window.matchMedia("(prefers-color-scheme: dark)")` zu `light`/`dark` auf und reagiert per `change`-Listener live auf OS-Wechsel ([main.js:173](../../app/main.js), [main.js:1523](../../app/main.js)). Beide Einstellungen persistieren in `localStorage`.

---

## 10. Responsive Breakpoints (App-weit)

| Breakpoint | Layout-Änderungen |
|---|---|
| `max-width: 1180px` | Sidebar → horizontale Top-Bar, `.layout-with-rail` wird `display:block` (Rail rutscht unter Inhalt), `.sidebar-toggle`/`.sidebar-meta` ausgeblendet |
| `max-width: 760px` | `.nav-label` ausgeblendet (Icon-only-Nav), `.topbar`/`.page-head` werden vertikal gestapelt, KPI-/Filter-/Tile-Grids werden einspaltig mit horizontalem Scroll, Icon-Selects auf 44×34px |

Es gibt **keinen** definierten Zwischenschritt, der das Label-Problem im 760–1180px-Bereich auffängt — das ist die Quelle des kritischen Nav-Bugs aus Abschnitt 3.2.

---

## 11. Edge Cases (App-weit)

- **Lange Kontonamen/Bezeichnungen**: brechen zweizeilig um (z. B. "Girokonto Person B MusterbankD", "Gemeinsames Depot MusterdepotB") — aktuell funktional, aber ohne einheitliche `min-height`/`line-clamp`-Regel je Tabellenzelle.
- **Fehlende Werte**: werden als „—" dargestellt (z. B. Depotwert „noch nicht belegt"), kombiniert mit erläuterndem Status-Badge — gutes, konsistentes Pattern, sollte als Standard für „kein Wert/keine Daten" dokumentiert und in neuen Komponenten wiederverwendet werden.
- **Lange Übersetzungstexte (EN)**: nicht im Audit verifiziert — sollte vor M6 stichprobenartig mit Sprachumschaltung geprüft werden, da mehrere Labels (z. B. Status-Erläuterungen) im Deutschen bereits mehrzeilig sind.
- **Sehr viele Tabellenzeilen / Pagination**: `.pager-button` vorhanden, Fokus-Stil unterliegt demselben Fokus-Sichtbarkeits-Befund wie Nav-Buttons.
- **Kein Datenbestand / leere Listen**: kein einheitliches Empty-State-Pattern im Audit beobachtet (Guideline fordert "ruhige, konkrete" Leerzustände wie "Keine offene Aktion").

---

## 12. Accessibility-Notizen (App-weit)

Vollständiges Audit siehe separates Accessibility-Dokument (WCAG 2.1 AA, Stand 2026-06-08). Für die Komponenten-Implementierung sind folgende Punkte direkt handlungsrelevant:

1. **Fokusverlust + Dauer-Vorlese-Bug durch Render-Modell** (🔴 kritisch): siehe Sektion 0 — `render()` ersetzt bei jeder Interaktion den kompletten DOM (Fokus springt auf `<body>`), und `aria-live="polite"` sitzt auf `#app` statt auf einer kleinen Status-Region. Das ist der mit Abstand wirkungsvollste Einzelbefund: er macht die App für Tastatur- **und** Screenreader-Nutzer in der Praxis schwer benutzbar, unabhängig von allen Einzelkomponenten-Fixes unten.
2. **Fokus-Indikator** (🔴 kritisch): `:focus-visible{outline:none}` mit Hintergrundwechsel `--surface`→`--surface-2` (Kontrast ≈1.1:1) ist faktisch unsichtbar. Betrifft Nav-Buttons, Icon-Buttons, Tiles, Pager, Filter-Buttons, Linkish-Elemente — **alle** über dieselbe Token-Logik. Empfehlung: app-weite Fokus-Utility-Klasse mit `box-shadow: 0 0 0 2px var(--accent)` (oder `outline: 2px solid var(--accent); outline-offset: 2px`) ergänzen, die zusätzlich zu — nicht statt — der Hover-Färbung greift.
3. **Tabellenzeilen nicht per Tastatur auslösbar** (🔴 kritisch): `.row-select-cell` ist fokussierbar (`tabindex="0"`), aber ohne `keydown`-Handler nicht bedienbar — siehe Sektion 5. WCAG 2.1.1.
4. **Kontrast** (🟡 major): `--faint` (3.06:1, zudem ungenutzter Token — siehe Sektion 2) und `--review` (3.30:1) im Light-Theme unter 4.5:1. Letzterer Token wird für Status-Chips genutzt — also für Information, nicht nur Dekoration.
5. **`prefers-reduced-motion` fehlt** (🟡 major, neu identifiziert): Es gibt mehrere `transition`-Deklarationen (`grid-template-columns 160ms`, `border-color`/`transform 0.15s`, [styles.css:110](../../app/styles.css), [styles.css:691](../../app/styles.css)), aber keinen `@media (prefers-reduced-motion: reduce)`-Block, der sie für Nutzer mit Bewegungsempfindlichkeit deaktiviert/reduziert (WCAG 2.3.3, Best Practice für 2.2.2). Empfehlung: globalen Reduce-Motion-Block ergänzen, der `transition`/`animation` auf `none`/`0.01ms` setzt.
6. **Kein Skip-Link** (🟢 minor, neu identifiziert): Es gibt keinen "Zum Hauptinhalt springen"-Link vor der Sidebar-Navigation — Tastaturnutzer müssen bei jedem Seitenaufruf durch die komplette Navigation tabben, bevor sie den Hauptinhalt erreichen.
7. **Hero-KPI-`<section>`s ohne zugänglichen Namen** (🟢 minor, neu identifiziert): Die beiden `.hero-kpi`-`<section>`-Elemente ([main.js:276](../../app/main.js), [main.js:283](../../app/main.js)) haben weder `aria-label` noch `aria-labelledby` — für Screenreader-Nutzer, die per Landmark/Section navigieren, sind sie nur als generische Bereiche hörbar. Empfehlung: `aria-labelledby` auf die jeweilige `.kpi-label`-ID setzen.
8. **Touch-Targets** (🟢 minor): Nav-Buttons (~40px) und Icon-Selects (~32–36px) unter 44×44px.
9. **Tab-Reihenfolge**: logisch (Sidebar → Hauptbereich → Rail), keine Auffälligkeiten — unabhängig vom Fokusverlust-Problem in Punkt 1.
10. **Truncation**: Filter-Selects sind für Screenreader korrekt benannt (volle Options-Texte), aber visuell ohne Kürzungs-Hinweis (`ellipsis`).

---

## 13. Robustheit — außerhalb des UI-Komponenten-Scopes, aber beim nächsten Review relevant

Diese zwei Punkte betreffen nicht Layout/Styling, sondern Datenfluss und Navigationszustand. Sie gehören nicht in eine UI-Komponentenspec im engeren Sinn, sind aber für jede Session, die an `main.js` arbeitet, unmittelbar relevant — deshalb hier vermerkt statt verloren:

- **Bootstrap-/Ladefehler sichtbar machen**: `main.js` lädt die Masterdaten inzwischen direkt aus `data/master/`. Wenn eine Masterdatei fehlt, invalide JSON/JSONL enthält oder der Webserver einen direkten Dateizugriff blockiert, darf die App nicht mit weißer Seite enden. Empfehlung: Bootstrap in `try/catch` mit sichtbarer Fallback-Meldung im `#app`-Container kapseln.
- **History-Spam durch `commitNavigation()`**: Die Funktion ([main.js:1512](../../app/main.js)) ruft bei **jeder** der 21 Aufrufstellen `history.pushState(...)` auf — auch bei Filteränderungen, Pagination oder Zeilenauswahl innerhalb derselben View. Der Browser-Zurück-Button wird dadurch zäh/unvorhersehbar (mehrere Schritte nötig, um zur vorherigen View zu gelangen). Empfehlung: `replaceState` für Zustandsänderungen *innerhalb* einer View nutzen, `pushState` nur bei echtem View-Wechsel.

---

## Anhang: Geprüfte Zustände

| View | Breite | Theme | Auffälligkeiten |
|---|---|---|---|
| Übersicht | 390px | dark (system) | sauber, Icon-only-Nav |
| Übersicht | 800px | dark (system) | Nav-Überlappung, KPI-Überlappung |
| Übersicht | 1280px (Rail offen) | light | KPI-Überlappung reproduziert, Theme korrekt umgeschaltet |
| Transaktionen | 1280px | dark/light | Filter-Truncation, Tabelle bei offener Rail eng |
| Cashflow | 1280px | dark | unauffällig |
| Vermögen | 1280px | dark | unauffällig, Detail-Rail funktioniert |

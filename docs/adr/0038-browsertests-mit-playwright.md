# Browsertests mit Playwright

Status: angenommen (2026-10-20). Loest [ADR 0037](0037-browsertests-ohne-abhaengigkeit.md) ab.

## Problem

ADR 0037 hatte die Browsertests ueber einen eigenen kleinen DevTools-Treiber gebaut, um die Regel "keine
Abhaengigkeiten ausser Node.js" einzuhalten. Die Abwaegung hatte der Agent allein getroffen. Der Nutzer
entscheidet anders: Playwright ist ihm vertraut und auf seinem Rechner ohnehin vorhanden, und ein
verbreitetes Werkzeug ist auf Dauer leichter zu pflegen als ein eigener Treiber.

## Entscheidung

- Die Browsertests nutzen **Playwright** ueber das Paket `playwright-core` als einzige
  **Entwicklungsabhaengigkeit** (feste Version, `package-lock.json`). Die App und ihre Werkzeuge bleiben ohne
  Laufzeitabhaengigkeit; auf der VM wird nichts installiert.
- `playwright-core` laedt keinen eigenen Browser. Es startet das installierte Chrome/Chromium (lokal die
  Chrome-App, auf den GitHub-Runnern Google Chrome; `CHROME_PATH` waehlt einen anderen).
- `tests/hilfe-browser.mjs` behaelt seine kleine Schnittstelle (`werte`, `warteAuf`, `klicke`, `tippe`,
  `viewport`, `ersetze`) und reicht `seite.page` fuer alles Weitere durch (Tastenkuerzel, Locator).
  Klicks laufen ueber Playwright-Locator: Warten auf Sichtbarkeit, Stabilitaet und freie Sicht ist eingebaut.
- `warteAuf` fragt selbst per `page.evaluate` ab statt `page.waitForFunction`: Letzteres wertet Text per
  `eval` in der Seite aus und scheitert an der CSP der App. Die CSP wird im Test nicht abgeschaltet, damit
  Verstoesse gegen sie weiter auffallen.
- Ohne Chrome oder ohne `npm install` werden die Browsertests uebersprungen, in der CI (`CI=true`) schlagen sie
  fehl. Die CI ruft vor `npm test` `npm ci` auf.
- Neue Versionen erst, wenn sie mindestens zwei Wochen alt sind.

## Verworfene Alternativen

- **Eigener DevTools-Treiber (ADR 0037) behalten:** funktionierte, aber jede Komfortfunktion (Warten,
  Verdeckungspruefung, Mobilgeraet, Tastenkuerzel) war selbst zu bauen und zu pflegen.
- **Paket `playwright` bzw. `@playwright/test`:** bringt Browser-Download bzw. einen eigenen Testlaeufer mit;
  die Tests bleiben bei `node --test`, das installierte Chrome reicht.
- **CSP im Test abschalten (`bypassCSP`):** einfacher fuer `waitForFunction`, verdeckt aber genau die
  CSP-Fehler, die schon einmal Stile im Browser gebrochen haben.

## Konsequenz

- Wer am Code arbeitet, ruft einmal `npm install` auf.
- Weitere Pakete kommen nur nach Rueckfrage beim Nutzer ins Projekt (AGENTS.md).

# Browsertests ueber das DevTools-Protokoll, ohne Abhaengigkeit

Status: angenommen (2026-10-20). Massnahme P.3 aus dem Architektur-Review.

## Problem

Die Oberflaeche war nur ueber Markup-Tests und eine DOM-Attrappe abgesichert. Was zwischen Klick, Neuzeichnen,
Verlauf und Server passiert, sahen diese Tests nicht: Filter -> Drilldown (F20), Fokus beim Tippen, der Wechsel
zwischen Demo und Echt, Sitzungssperre und Abmelden. Genau dort lagen die Fehler der Navigation und des
Lebenszyklus. Ein Beispiel, das erst der echte Browser zeigte: Kam waehrend eines Mausklicks eine API-Antwort
an, ersetzte das Neuzeichnen das Element unter dem Zeiger und der Klick ging verloren.

## Entscheidung

- Ablauftests laufen in einem **lokal installierten Chrome/Chromium ohne Oberflaeche**, gesteuert ueber das
  **Chrome DevTools Protocol** per WebSocket. Node bringt WebSocket mit; der Treiber
  (`tests/hilfe-browser.mjs`, rund 150 Zeilen) startet Chrome, laedt Seiten, wertet Ausdruecke aus, klickt und
  tippt mit echten Maus- und Tastaturereignissen und kann einzelne Antworten ersetzen (z. B. `sitzung.json` fuer
  eine kurze Sperrzeit).
- Die Tests sind normale `node --test`-Dateien (`tests/browser-ablaeufe.test.mjs`) und laufen mit `npm test`.
  Der App-Server laeuft im Testprozess; "Echt" ist eine Kopie der Demodaten in einem Temp-Ordner.
- Ohne Chrome werden sie uebersprungen (lokal), in der CI (`CI=true`) schlagen sie fehl. Die GitHub-Runner
  bringen Google Chrome mit; `CHROME_PATH` waehlt bei Bedarf einen anderen Browser.
- Ein Klick prueft vorher, dass am Zielpunkt wirklich das Element liegt (`elementFromPoint`), damit verdeckte
  oder ausserhalb liegende Elemente als klare Meldung statt als Zeitueberschreitung auffallen.

## Verworfene Alternativen

- **Playwright als Entwicklungsabhaengigkeit:** komfortabler (Auto-Waiting, Trace), aber das erste npm-Paket
  im Repo, mit Paketsperre, Browser-Download in der CI (mehrere hundert MB) und Versionspflege. Die
  Grundregel "keine Abhaengigkeiten ausser Node.js" haette eine dauerhafte Ausnahme bekommen. Die Typpruefung
  holt TypeScript zwar zur Laufzeit, aber nur fuer einen Pruefschritt, nicht als Testgrundlage.
- **Puppeteer-core ohne Browser-Download:** gleiche Paketfrage, kleiner Gewinn gegenueber dem eigenen Treiber,
  weil wir nur eine Handvoll Befehle brauchen.
- **Nur die DOM-Attrappe ausbauen:** sieht weder Layout (verdeckte Knoepfe, Viewport), noch echte
  Ereignisfolgen (pointerdown/blur/change/click), noch Verlauf und Neuladen.
- **jsdom/happy-dom:** ebenfalls Pakete, und ohne Layout und echte Ereignisreihenfolge.

## Konsequenz

- Neue Ablaufregeln (Navigation, Fokus, Sperre) bekommen einen Browsertest, wo die Attrappe sie nicht sieht.
- Der Treiber bleibt bewusst klein. Braucht ein Test mehr (z. B. Screenshots oder Netzwerkmitschnitte), wird
  er dort ergaenzt; reicht das nicht mehr, ist Playwright neu abzuwaegen.
- Ein vollstaendiger Lauf dauert gut 20 Sekunden zusaetzlich; die Tests laufen parallel zu den uebrigen.

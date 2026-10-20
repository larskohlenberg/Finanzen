# Datumsauswahl mit Vanilla Calendar Pro

Status: angenommen (2026-10-20).

## Problem

Das Feld "Prognose bis" der Liquiditaet war ein natives `<input type="date">`: als Auswahlfeld kaum zu
erkennen, Beschriftung ueber dem Feld, der Kalender des Browsers schlicht und je Browser verschieden. Der
Nutzer wollte einen schneller bedienbaren, ansprechenderen Kalender und hat sich fuer Schnellauswahl plus
Kalender-Bibliothek entschieden.

## Entscheidung

- Der Prognosehorizont hat eine **Schnellauswahl** (6 Monate, 1 Jahr, Jahresende, 2 Jahre, 5 Jahre ab dem
  Stichtag) und einen **Datumsknopf** mit Kalendersymbol, Beschriftung davor. Der Knopf klappt einen Kalender
  auf; Tag waehlen uebernimmt und schliesst, Esc und Klick daneben schliessen ohne Aenderung.
- Der Kalender ist **Vanilla Calendar Pro 3.4.0** (MIT, ohne Abhaengigkeiten), als **unveraenderte Kopie** in
  `app/vendor/vanilla-calendar-pro/` mit Herkunft und Pruefsummen (`HERKUNFT.md`). Kein npm, kein Build.
- Das Modul wird erst beim ersten Oeffnen per `import()` geladen; der Modulgraph des Servers gibt es frei.
  Die Stile stehen in der Allowlist (`SHELL`) und werden in `index.html` mit Inhaltsversion eingebunden.
- Vor der Uebernahme geprueft: kein `eval`/`new Function`, keine Netzwerkzugriffe, keine Style-Attribute im
  HTML; die CSP der App (`default-src 'self'`) bleibt unveraendert.
- Hell/Dunkel folgt `html[data-theme]` der App (Standarderkennung der Bibliothek).
- `app/kalender.mjs` haengt den Kalender nach jedem Zeichnen in Platzhalter `[data-kalender]` ein; die
  Huelle `.kalender-popover` gehoert der App, weil die Bibliothek die Klassen ihres Elements ueberschreibt.

## Verworfene Alternativen

- **Nur natives Datumsfeld aufraeumen:** kein Fremdcode, aber der Kalender bleibt schlicht.
- **Nur Schnellauswahl:** schnell, aber kein komfortabler Weg zu einem beliebigen Datum.
- **flatpickr u. a.:** verbreitet, aber laenger nicht gepflegt bzw. groesser; Vanilla Calendar Pro ist aktiv
  gepflegt, ohne Abhaengigkeiten und bringt Hell/Dunkel mit.
- **Per npm einbinden:** braeuchte einen Build-Schritt oder Auslieferung aus `node_modules`; die Kopie mit
  Pruefsumme ist einfacher und auf der VM ohne `npm install` lauffaehig.

## Konsequenz

- Weitere Datumsfelder (z. B. Von-Bis der Buchungen) koennen denselben Baustein nutzen.
- Aktualisieren nach `HERKUNFT.md`: Version mindestens zwei Wochen alt, erneute Pruefung auf CSP-Verstoesse.

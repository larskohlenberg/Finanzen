# Agent schaetzt statt KAT-012

Status: entschieden am 2026-10-11. Praezisiert ADR 0025 in der Belegleiter
(Stufe E6).

## Kontext

Das Modell bildet einen Privathaushalt ab, ohne Jahresabschluss und ohne
Steuerzweck. Wichtig ist, dass die Zahlen im Bestand stehen; eine einzelne
falsche Kategorie verschiebt eine Auswertung kaum und laesst sich spaeter
korrigieren. Bisher endete jede Buchung ohne Beleg auf `KAT-012` „Noch zu
klaeren", und die Recherche durfte beliebig lange dauern. Das machte den
Import langsam und liess einen Rest, der auf den Nutzer wartete. Warten ist
keine Option.

## Entscheidung

- **E6 heisst schaetzen.** Ohne Beleg setzt der Agent die plausibelste
  Sachkategorie als Agenten-Einzelvorschlag (`agent_vorschlag`, Herkunft
  `agent`). Das Gate gibt sie wie jeden Agentenvorschlag frei. `KAT-012` nur,
  wenn wirklich keine Kategorie plausibel ist — etwa eine Barabhebung ohne
  jeden Anhaltspunkt.
- **Regeln brauchen weiterhin einen Beleg** (E1–E4). Aus einer Schaetzung (E5,
  E6) entsteht nie eine Regel.
- **Recherche ist kurz.** Je Merchant hoechstens ein kurzer Blick in Bestand
  und Archiv und eine Websuche; danach wird geschaetzt. Modell und Effort des
  Recherche-Subagenten bleiben unveraendert.
- **Korrektur wird Beleg.** Korrigiert der Nutzer eine Agenten-Buchung, traegt
  sie `bestaetigt_durch = mensch`. Fuer kuenftige Buchungen desselben Merchants
  ist das E2 — dafuer braucht es keinen Code, nur die Klarstellung, dass E2
  eine menschliche Entscheidung verlangt.
- **Kein neues Datenfeld.** Eine Schaetzung ist an `kategorie_herkunft = agent`
  erkennbar; der Pruefbericht zaehlt sie, nur zur Information.

## Verworfene Alternativen

- **Belegpflicht beibehalten.** Ehrlich, aber langsam: der `KAT-012`-Rest
  waechst mit jedem Import und blockiert genau die Zahlen, auf die es ankommt.
- **Schaetzungen als Regeln anlegen.** Eine Regel feuert auf kuenftige Importe
  und gaebe einer Vermutung dauerhafte Reichweite. Der Fehler wuerde sich
  vervielfachen, statt auf die benannten Buchungen begrenzt zu bleiben.
- **Eigenes Feld fuer Schaetzungen.** Die Herkunft `agent` sagt dasselbe; ein
  zweites Feld waere Buchhaltung ueber die Buchhaltung.

## Konsequenz

- Korrigiert wird nachtraeglich: in der Transaktionsansicht mit dem Filter
  Herkunft = Agent, geschrieben ueber `confirm.mjs`.
- Die Korrektur erzeugt keinen Logeintrag fuer die Lernschleife (ADR 0026
  zaehlt nur Regel-Freigaben), wirkt aber ueber den Bestand als Beleg E2.
- Der Pruefbericht zeigt die Zahl der Schaetzungen; `KAT-012` bleibt dort
  gelistet, wird aber selten.

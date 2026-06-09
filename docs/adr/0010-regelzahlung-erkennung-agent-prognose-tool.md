# Regelzahlungs-Erkennung ist Agent-Urteil, Prognose-Mathematik ist deterministisches Tool

Statushinweis 2026-06-09: Der Grundsatz gilt weiter. Durch ADR 0016 wirkt die Prognose-Mathematik in der aktiven App nicht mehr als eigenstaendige Cashflow-Seite, sondern als Liquiditaets-Fortschreibung in `app/liquiditaet.mjs`.

Bei Regelzahlungen (M4) wird die Arbeit asymmetrisch aufgeteilt: Das **Erkennen** eines wiederkehrenden Musters und seines Zyklus (taeglich, woechentlich, monatlich, quartalsweise, jaehrlich, andere) ist **Agent-Urteil**, nicht Tool-Heuristik. Das **Hochrechnen** einer bestaetigten Regelzahlung in die Cashflow-Prognose ist ein **deterministisches, per `node --test` abgesichertes Modul** (`app/cashflow.mjs`, liegt unter `app/`, weil der Webserver nur das App-Verzeichnis ausliefert — siehe ADR 0012).

## Begruendung

Erkennung und Prognose haben gegensaetzliche Eigenschaften:

- **Erkennung** ist fuzzy, kontextlastig und variantenreich. Ein Mensch/Agent sieht auf einen Blick „das ist die Miete, monatlich" — ein Tool muesste das ueber Schwellen (Mindestanzahl Vorkommen, Betrags- und Datumstoleranzen, Zyklus-Klassifikation) erraten und wuerde schnell ein dickes, brüchiges Heuristik-Programm. Entscheidend: Ein Vorschlag ist **nicht korrektheitskritisch**, weil der Nutzer ihn bestaetigt. Falsch-Vorschlaege sind billig. Das ist dasselbe Muster wie ADR 0005 (keine bankspezifischen Parser — der Agent normalisiert, weil er gut im Erkennen variabler Formate ist).
- **Prognose** ist reine Arithmetik ueber Geld in der Zukunft. Hier ist Determinismus Pflicht, sonst entsteht genau die „stille Fehlwirkung", die das Projekt ueberall vermeidet. Das ist dasselbe Muster wie Categorizer und Transfer-Matcher.

## Verworfene Alternativen

- **Deterministisches Erkennungs-Tool** (symmetrisch zum Categorizer): Man wuerde es erwarten, aber es verlagert kontextabhaengiges Urteil in brüchige Schwellenwerte, ohne Korrektheitsgewinn — der Mensch bestaetigt ohnehin.
- **Auch die Prognose dem Agenten ueberlassen**: nicht testbar, nicht reproduzierbar, Geld-Mathematik ohne Sicherung — abgelehnt.

## Konsequenz

Es gibt **kein** Tool, das Regelmaessigkeit errät. Der Agent schlaegt vor (`status = vorgeschlagen`), der Nutzer bestaetigt (`status = bestaetigt`), und das deterministische Prognose-Tool rechnet **nur** mit Bestaetigtem. Validierung der Regelzahlung selbst bleibt deterministisch (Tool prueft, Agent schreibt).

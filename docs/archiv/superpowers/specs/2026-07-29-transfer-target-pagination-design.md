# Transfer-Gegenbuchung auf ihrer Tabellenseite anzeigen

## Ausgangslage

In der Transaktionsansicht sind Detail-Rail und Tabellenzeile bereits über
`state.selectedTransactionId` verbunden. Die Detail-Rail löst diese ID im
gesamten gefilterten Transaktionsbestand auf. Die Tabelle rendert dagegen nur
den Ausschnitt der aktuellen Pagination-Seite und markiert darin die Zeile mit
derselben ID als `selected`.

Beim Wechsel zur Gegenbuchung eines Transfers setzt der aktuelle Handler die
Ziel-ID und den Kontofilter korrekt, setzt `state.transactionPage` aber
pauschal auf Seite 1. Liegt die Gegenbuchung auf einer späteren Seite, zeigt die
Rail deshalb bereits das richtige Detail, während die zugehörige Tabellenzeile
gar nicht gerendert wird und folglich nicht markiert erscheinen kann.

## Gewünschtes Verhalten

Ein Klick auf den Link zur Transfer-Gegenbuchung:

1. wechselt wie bisher zum Konto der Gegenbuchung,
2. öffnet beziehungsweise aktualisiert die Detail-Rail mit der Gegenbuchung,
3. springt auf die Pagination-Seite, die diese Gegenbuchung bei der aktuellen
   Sortierung und Seitengröße enthält, und
4. zeigt die Gegenbuchung dort mit der bestehenden `selected`-Markierung.

Der Kontofilter bleibt erhalten. Andere Navigations- und Filterabläufe ändern
sich nicht.

## Technisches Design

Die Transaktionsansicht stellt eine kleine Seitenberechnung bereit, die für
eine Transaktions-ID deren Index im aktuell gefilterten und sortierten Bestand
ermittelt. Aus Index und `state.pageSize` ergibt sich die Zielseite. Wird die
ID nicht gefunden, fällt die Berechnung auf Seite 1 zurück.

Der Handler für `paired-transfer` setzt zuerst Ziel-ID und Kontofilter. Danach
verwendet er die Seitenberechnung anstelle des bisherigen festen Werts `1`.
Die bereits vorhandene Auswahl- und Rendering-Logik bleibt unverändert.

Die bestehende Deep-Link-Navigation verwendet inhaltlich dieselbe Berechnung.
Sie wird auf die gemeinsame Funktion umgestellt, damit Transfer-Link und
Deep-Link nicht zwei voneinander abweichende Pagination-Regeln pflegen.

## Fehler- und Randfälle

- Die Berechnung berücksichtigt die aktuelle Sortierung und Seitengröße.
- Eine nicht mehr vorhandene Ziel-ID führt weiterhin kontrolliert zu Seite 1.
- Die Markierung benötigt keine neue CSS- oder DOM-Verknüpfung; sie entsteht
  weiterhin ausschließlich aus `state.selectedTransactionId`.
- Manuelles Blättern bei geöffneter Rail bleibt möglich, weil die Seite nur
  beim Navigieren zu einer konkreten Transaktion berechnet wird.

## Tests

Ein Regressionstest verwendet eine bekannte Transfer-Gegenbuchung, die im
gefilterten Zielkonto außerhalb der ersten Seite liegt. Der Test prüft:

- Die Seitenberechnung liefert die tatsächliche Zielseite.
- Nach Auswahl dieser Seite enthält das Tabellen-HTML die Gegenbuchung als
  `transaction-row selected`.
- Die bestehende Detail-Rail wird weiterhin für dieselbe Ziel-ID gerendert.

Die relevanten Transaktions-, Routing- und Gesamttests müssen anschließend
grün bleiben.

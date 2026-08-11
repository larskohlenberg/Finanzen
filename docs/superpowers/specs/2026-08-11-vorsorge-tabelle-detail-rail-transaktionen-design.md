# Vorsorge-Tabelle, Detail-Rail und gebuchte Beiträge

## Ziel

Die Vorsorgeansicht macht jeden Vorsorgedatensatz eindeutig auffindbar, sortierbar
und prüfbar. IDs werden in der Tabelle angezeigt, Filter und Sortierung folgen den
bestehenden App-Mustern, und ein Zeilenklick öffnet eine adressierbare Detail-Rail.
Die Rail trennt Vertragsquelle, erwartete Beitrags-Regelzahlungen und tatsächlich
gebuchte Beiträge fachlich sauber voneinander.

## Ausgangslage

`app/views/vorsorge.mjs` rendert derzeit eine statische Tabelle ohne sichtbare ID,
Filter, Sortierung, Auswahlzustand oder Detail-Rail. Das Vorsorgemodell enthält
bereits optionale Felder wie `quelle_hinweis`, `quelle_standdatum` und `bemerkung`.
Regelzahlungen können über `vorsorge_id` einem Vertrag zugeordnet sein.
Transaktionen haben dagegen noch keinen expliziten Bezug zu einer Regelzahlung;
eine zuverlässige Anzeige tatsächlich gebuchter Beiträge ist deshalb nicht
möglich.

## Fachliche Entscheidung

Eine Transaktion kann optional genau eine erwartete Regelzahlung erfüllen:

`Transaktion.regelzahlung_id → Regelzahlung.vorsorge_id → Vorsorge`

Eine Regelzahlung kann über die Zeit von beliebig vielen Transaktionen erfüllt
werden. Eine einzelne Kontobuchung gehört höchstens zu einem Vorsorgevertrag.
Der Vorsorgebezug wird nur über die Regelzahlung abgeleitet; eine zusätzliche
`vorsorge_id` an der Transaktion wird nicht eingeführt. Damit gibt es keine
doppelte, potenziell widersprüchliche Zuordnung.

Die Zuordnung ist ausschließlich explizit. Betrag, Gegenpartei, Mandatsreferenz
oder Rhythmus dürfen Vorschläge unterstützen, erzeugen aber in diesem Umfang
keine automatische Verknüpfung. Bestehende Transaktionen bleiben ohne das neue
optionale Feld gültig und erscheinen erst nach expliziter Verknüpfung als
gebuchte Beiträge.

## Vorsorge-Tabelle

Die Tabelle erhält die Spalten **ID**, **Bezeichnung**, **Art**, **Person**,
**Wert** und **Status**. Die bestehende Zusatzdarstellung für Beiträge,
Nachfolger, Kapitalbildung und Prüfstatus bleibt erhalten, wird aber nicht als
Ersatz für die vollständigen Details verwendet.

Sortierbare Spalten sind ID, Bezeichnung, Art, Person, Wert und Status. Der
aktive Schlüssel und die Richtung werden wie in den anderen Tabellen durch
`▲` beziehungsweise `▼` angezeigt. Standardsortierung ist ID aufsteigend.
Textfelder werden nach dem angezeigten, lokalisierten Text sortiert; Werte werden
numerisch nach dem aktuell angezeigten Wert sortiert, fehlende Werte stehen
immer am Ende. Die ID ist der stabile Tiebreaker.

Oberhalb der Tabelle steht die vorhandene Filterkomponente mit:

- einer Freitextsuche über ID, Name, Rohwert und lokalisierte Bezeichnung von Art
  und Status, Person, Bemerkung und Quellenhinweis;
- Auswahlfiltern für Art, Person, Status und Prüfstatus
  (`geprüft`/`ungeprüft`);
- Trefferanzahl, Anzahl aktiver Filter und globalem Zurücksetzen.

Die Freitextsuche ist eine groß-/kleinschreibungsunabhängige Teilstringsuche.
Filter werden miteinander verknüpft. Gibt es keine Treffer, erscheint ein
lokalisierter Leerzustand statt einer leeren Tabelle.

## Auswahl und Detail-Rail

Eine Tabellenzeile ist per Klick sowie Enter/Leertaste auswählbar. Sie setzt
`state.selectedVorsorgeId` und öffnet rechts das vorhandene
`layout-with-rail`-/`detail-panel`-Muster. Ohne Auswahl bleibt die Tabelle
vollbreit. Wird die ausgewählte Vorsorge ausgefiltert, wird ihre Rail nicht
gerendert; beim erneuten Sichtbarwerden darf die Auswahl wieder erscheinen.

Die Route `#/vorsorge/<vorsorge_id>` adressiert die geöffnete Rail. Ein direkter
Aufruf setzt die Vorsorgefilter zurück, damit der Datensatz sichtbar ist. Eine
unbekannte oder gelöschte ID öffnet keine leere Rail und verursacht keinen
Renderfehler. Schließen leert die Auswahl und führt zu `#/vorsorge`.

Die Rail zeigt:

- ID, Name, Art, Person und Status;
- `kapitalbildend`, Kapitalwahl, Leistungsbeginn, Aktiv-bis und Prüfdatum;
- die relevanten aktuellen Zeitwerte mit Feld, Betrag, Standdatum und Qualität;
- Vorgänger und abgeleiteten Nachfolger, soweit vorhanden;
- **Vertragsquelle** aus `quelle_hinweis` und `quelle_standdatum`;
- **Bemerkung**, wenn vorhanden;
- **Erwartete Beiträge** als verknüpfte Regelzahlungen;
- **Gebuchte Beiträge** als die fünf neuesten explizit verknüpften
  Transaktionen mit Buchungsdatum, Gegenpartei und Betrag.

Jede gebuchte Beitragszeile öffnet die vorhandene Transaktionsdetailansicht.
Eine Aktion **Alle Transaktionen anzeigen** wechselt zur Transaktionsansicht
und setzt einen sichtbaren Vorsorgefilter. Dieser Filter wird zur Laufzeit über
`Transaktion.regelzahlung_id → Regelzahlung.vorsorge_id` ausgewertet und erfasst
dadurch auch mehrere aufeinanderfolgende Beitrags-Regelzahlungen desselben
Vertrags.

## Datenvertrag und Datenfluss

`transaktionen.schema.json` und die deklarative Definition in
`validate-core.mjs` erhalten das optionale Feld `regelzahlung_id` mit dem Muster
`^RZ-\d{3}$`. Die referenzielle Validierung meldet eine nicht existierende
Regelzahlung als Fehler. Das Feld verändert weder Deduplikation, Kategorie,
Cashflow noch Transferwirkung.

Das standardisierte Importformat und die Importpipeline akzeptieren und erhalten
eine vorhandene `regelzahlung_id`. Agentenhinweise für Import, Regelzahlungen und
Vorsorge erläutern die explizite Zuordnung und lassen das Feld bei Unsicherheit
weg. In diesem Umfang gibt es keine heuristische Bestandsmigration und keinen
vollständigen Plan-Ist-Abgleich.

Die Transaktionsansicht erweitert `transactionFilters` um `vorsorge`. Der Filter
ist in der Filterleiste sichtbar, wird von Zurücksetzen, Deep-Link-Aufrufen und
vorhandenen Navigationsaktionen konsistent behandelt und kann aus der
Vorsorge-Rail vorbelegt werden.

## Komponenten und Zustände

- `runtime.mjs`: `vorsorgeFilters`, `vorsorgeSort`, `selectedVorsorgeId` und
  zusätzlicher Transaktionsfilter `vorsorge`.
- `views/vorsorge.mjs`: reine Filter-/Sortierableitung, Tabellenmarkup,
  Detail-Rail und Beitragsableitung.
- `views/transaktionen.mjs`: abgeleiteter Vorsorgefilter und Filteroptionen.
- `main.js`: Filter-, Sortier-, Auswahl-, Schließ- und Navigationsaktionen sowie
  Fokuswiederherstellung für die neuen Bedienelemente.
- `routing.mjs`: Zustand und Parse-Logik für `#/vorsorge/<id>`.
- `i18n.js`: deutsche und englische Texte für Filter, Spalten, Rail-Sektionen,
  Leerzustände und Aktionen.

Die App bleibt vollständig schreibgeschützt; die Verknüpfung wird über Agent und
Datenpflege gesetzt, nicht über eine neue CRUD-Oberfläche.

## Fehlerfälle

- Fehlende optionale Quelle, Bemerkung, Zeitwerte, Regelzahlungen oder
  Transaktionen werden als leerer beziehungsweise ausgelassener Rail-Abschnitt
  dargestellt, nicht als Fehler.
- Eine vorhandene `regelzahlung_id` auf einer Transaktion muss auf eine
  existierende Regelzahlung zeigen; sonst schlägt die Bestandsvalidierung fehl.
- Eine Regelzahlung ohne `vorsorge_id` macht die Transaktion nicht zu einem
  Vorsorgebeitrag.
- Ausgefilterte oder unbekannte Auswahlen öffnen keine vom Tabellenkontext
  getrennte Rail.

## Tests und Abnahme

Die Umsetzung folgt Test-Driven Development und deckt mindestens ab:

1. Schema und Validator akzeptieren eine gültige `regelzahlung_id`, lehnen eine
   unbekannte ID ab und lassen bestehende Transaktionen ohne Feld gültig.
2. Importformat und Importpipeline erhalten das optionale Feld unverändert.
3. Freitext findet sichtbare Felder sowie Bemerkung und Quellenhinweis; alle vier
   Auswahlfilter wirken kombiniert und zeigen korrekte Trefferzahlen.
4. Jede Tabellenspalte sortiert in beide Richtungen mit stabiler ID-Reihenfolge;
   fehlende Werte stehen am Ende.
5. Zeilenauswahl, Tastaturaktivierung, Schließen und
   `#/vorsorge/<id>` funktionieren; unbekannte IDs bleiben ohne Rail.
6. Die Rail zeigt Quellen und Bemerkung getrennt sowie erwartete und gebuchte
   Beiträge. Nur explizit über die Regelzahlung zugeordnete Transaktionen
   erscheinen; die neuesten fünf werden absteigend angezeigt.
7. Einzelne Buchungslinks öffnen die vorhandenen Transaktionsdetails. **Alle
   Transaktionen anzeigen** setzt den sichtbaren Vorsorgefilter und berücksichtigt
   mehrere Beitrags-Regelzahlungen desselben Vertrags.
8. Deutsche und englische Texte sind vollständig; Masterdatenvalidierung,
   gesamte Testsuite und ein Browser-Klickpfad bleiben grün.

## Nicht Bestandteil

- automatische oder heuristische Zuordnung bestehender Transaktionen;
- Aufteilung einer Buchung auf mehrere Regelzahlungen oder Vorsorgeverträge;
- App-seitiges Bearbeiten von Vorsorge, Regelzahlungen oder Transaktionen;
- ein vollständiger Plan-Ist-Abgleich mit Toleranzen und Erfüllungsstatus;
- Pagination der kleinen Vorsorgetabelle.

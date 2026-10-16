# Konto-Detail-Rail in den Stammdaten

## Ziel

Ein Klick auf ein Konto unter **Stammdaten → Konten** öffnet eine Detail-Rail
für dieses Konto. Der bisherige Sprung in die gefilterte Transaktionsansicht
bleibt als ausdrückliche Aktion **Transaktionen anzeigen** in der Rail erhalten.

## Entscheidung

Die Stammdatenansicht verwendet dieselbe Kontodetail-Darstellung wie die
Vermögensansicht. Dadurch bleiben Kontostammdaten, jüngster belegter Anker,
Buchungen seit dem Anker, aktueller Saldo und die bis zu fünf jüngsten
Wertstände in beiden Ansichten identisch.

Verworfene Alternativen:

- Ein Zeilenklick könnte weiterhin direkt zu den Transaktionen führen und nur
  der Kontoname die Rail öffnen. Das erzeugt zwei schwer erkennbare Klickziele
  innerhalb derselben Zeile.
- Der Zeilenklick könnte zur Vermögensansicht wechseln. Das nutzt zwar die
  vorhandene Rail, unterbricht aber den Arbeitskontext Stammdaten.

## Verhalten und Navigation

- Die Konten-Sektion verwendet das vorhandene `layout-with-rail`-Muster.
- Ohne `state.selectedKonto` bleibt die Rail geschlossen und die Kontenliste
  nutzt die volle Breite.
- Ein Klick oder eine Tastaturaktivierung auf eine Kontozeile setzt
  `state.selectedKonto`, bleibt in `masterdata/konten` und schreibt die bereits
  vorhandene Route `#/konten/<konto_id>`.
- Ein direkter Aufruf von `#/konten/<konto_id>` öffnet dieselbe Rail.
- Der Schließen-Button leert `state.selectedKonto` und führt zu `#/stammdaten`.
- **Transaktionen anzeigen** verwendet die bestehende Aktion
  `account-transactions`, wechselt in die Transaktionsansicht und setzt den
  Kontofilter.
- Die Kontentabelle in der Übersicht bleibt unverändert: Dort führt der
  Zeilenklick weiterhin direkt zu den gefilterten Transaktionen.
- Eine unbekannte oder nicht mehr vorhandene Konto-ID öffnet keine leere Rail
  und verursacht keinen Renderfehler.

## Komponenten

- `renderAccountTable` erhält die Zeilenaktion als Option. Standard bleibt
  `account-transactions`; die Stammdatenansicht übergibt
  `select-master-account`.
- `renderMasterdata` rendert für die Konten-Sektion Liste und Rail. Die Rail
  verwendet den bestehenden `renderVermoegenDetail`-Renderer mit einer aus
  `kontoWert` abgeleiteten Konto-Position.
- `renderVermoegenDetail` wird exportiert, sein bestehendes Verhalten bleibt
  unverändert.
- Neue i18n-Texte werden für Deutsch und Englisch ergänzt.

## Tests und Abnahme

- Ein Render-Test beweist, dass eine Kontozeile in den Stammdaten die neue
  Auswahlaktion trägt und bei Auswahl die Detail-Rail rendert.
- Der Test prüft Anker, aktuellen Saldo, Wertstände und die separate
  Transaktionsaktion.
- Ein Contract-Test sichert Auswahl-, Schließ- und Transaktionsaktionen ab.
- Routing-Tests bleiben grün; `#/konten/<konto_id>` bleibt die adressierbare
  Stammdaten-Rail.
- Abschließend werden der fokussierte Test, die gesamte Testsuite, die
  Masterdatenvalidierung und der Browser-Klickpfad ausgeführt.

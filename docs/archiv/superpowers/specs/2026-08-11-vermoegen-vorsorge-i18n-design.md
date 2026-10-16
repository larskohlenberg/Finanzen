# Vorsorgeklasse im Vermögen lokalisieren

## Ausgangslage

`computeNettovermoegen` erzeugt für kapitalbildende Vorsorgeverträge Positionen
mit `klasse: "vorsorge"`. Die Vermögensansicht übersetzt Klassen über
`vermoegen.klasse.<klasse>`. Da `vermoegen.klasse.vorsorge` im deutschen und
englischen Wörterbuch fehlt, zeigt die bestehende i18n-Fallbacklogik den
Rohschlüssel an. Der Klassenfilter kennt die Vorsorgeklasse ebenfalls noch
nicht.

## Gewählter Ansatz

Das vorhandene Klassenwörterbuch wird vervollständigt. Deutsch verwendet
„Vorsorge“, Englisch „Pension“. Der Klassenfilter erhält eine Option mit dem
Wert `vorsorge` und demselben lokalisierten Label. Berechnung, Datenmodell und
allgemeine Fallbacklogik bleiben unverändert.

Ein generisches Schönformatieren unbekannter Schlüssel wird nicht eingeführt:
Es könnte echte Übersetzungslücken verdecken. Eine separate Label-Map wäre eine
zweite Quelle für dieselben Texte und widerspräche dem bestehenden Muster.

## Datenfluss und Fehlerverhalten

Die berechnete Position behält `klasse: "vorsorge"`. Tabelle, Sortierung,
Detailansicht und Filter beziehen ihre Anzeige weiterhin aus
`t("vermoegen.klasse.vorsorge")`. Der vorhandene Rohschlüssel-Fallback bleibt
als sichtbares Signal für andere fehlende Übersetzungen erhalten.

## Teststrategie

Ein Render-Regressionstest baut eine kapitalbildende Vorsorgeposition auf und
prüft das nutzerseitige Ergebnis: Die Tabelle zeigt „Vorsorge“ und enthält den
Rohschlüssel nicht. Zusätzlich prüft er die Filteroption. Vor der Änderung muss
der Test wegen des sichtbaren Rohschlüssels fehlschlagen; anschließend müssen
der gezielte Test und die vollständige Testsuite bestehen.

## Umfang

Der Fix ändert nur das deutsche und englische Klassenlabel, die vorhandene
Filterliste und den zugehörigen Regressionstest. Andere Vorsorgetexte,
Berechnungen und Ansichten bleiben unverändert.

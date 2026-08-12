# Transaktion hat optionalen direkten Immobilienbezug

Status: entschieden am 2026-08-12.

## Entscheidung

Eine Transaktion kann optional ueber `immobilie_id` genau einer Immobilie
zugeordnet sein; eine Immobilie kann viele Transaktionen haben. Die Beziehung ist
direkt, weil weder Kategorie noch Regelzahlung oder Darlehen die konkrete
Immobilie einer einzelnen Buchung verlaesslich und widerspruchsfrei bestimmen.

Die Zuordnung ist explizit und wird nur aus einem eindeutigen Beleg oder einer
Nutzerentscheidung gesetzt. Kategorie, Gegenpartei, Adresse und Buchungstext
duerfen einen Pruefkandidaten sichtbar machen, sind allein aber kein
Zuordnungsanker. Ein fehlendes `immobilie_id` bedeutet nur, dass keine Zuordnung
gespeichert ist; ein zusaetzlicher Review-, Audit- oder Historienstatus wird nicht
eingefuehrt.

## Considered Options

- **Ableitung aus der Kategorie:** verworfen, weil dieselbe Kategorie Buchungen
  verschiedener Immobilien und auch nicht objektbezogene Buchungen enthalten
  kann.
- **Ableitung ueber Darlehen oder Regelzahlungen:** verworfen, weil
  Modernisierung, Hausgeld und Mieteinnahmen nicht notwendig ueber diese
  Beziehungen laufen.
- **Eigene Zuordnungsentitaet mit Betragssplits:** verworfen als YAGNI; eine
  einzelne Kontobuchung wird bis zu einem konkreten Gegenbeispiel hoechstens einer
  Immobilie zugeordnet.

## Konsequenzen

- `immobilie_id` ist optional, referenziell validiert und veraendert weder
  Kategorisierung noch Cashflowwirkung einer Transaktion.
- Ein eigener, enger Schreibprozess setzt oder entfernt die Beziehung fuer
  explizite Transaktions-IDs; Hand-Edits an der JSONL sind nicht erforderlich.
- Neue Importe enden mit einer verpflichtenden Pruefung der neu geschriebenen
  Transaktionen. Hinweise erzeugen Rueckfragen, aber keine automatische
  Zuordnung.
- Die Transaktionsdetailansicht zeigt den Bezug, und die bestehende Freitextsuche
  findet die reine Immobilien-ID. Eine aggregierte Objektsicht ist nicht Teil
  dieser Entscheidung.

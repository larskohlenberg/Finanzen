# Beitragsbefreiung am Vertrag und Szenario-Ereignis BU/Arbeitslosigkeit

Status: entschieden am 2026-10-17.

## Kontext

Viele Vorsorgevertraege haben eine Beitragsbefreiung: Bei Berufsunfaehigkeit
(manche auch bei Arbeitslosigkeit) zahlt der Versicherer die Beitraege weiter.
Das stand nur in Bemerkungen. Ein Szenario "Person wird berufsunfaehig" liess
die Beitraege deshalb weiterlaufen und unterschaetzte die Liquiditaet; die
erfassten BU-Renten musste der Agent je Vertrag von Hand als neue Zahlung
eintragen.

## Entscheidung

- Neues Vertragsfeld `beitragsbefreiung`: Liste aus `bu` und/oder
  `arbeitslosigkeit`, gesetzt aus dem Beleg. Die App zeigt es in den
  Vertragsdaten als Haekchen (nur Anzeige, wie alle Daten).
- Neue Annahme-Art `ereignis` (`fall`, `person_id`, `ab`, optional `bis`). Die
  Engine uebersetzt sie vor der Rechnung in vorhandene Annahmen: je befreitem
  Beitrag ein `regelzahlung-aenderung` "beenden" (mit `bis` danach ein
  Wiederanlauf), bei `bu` je erfasster `bu_rente`/`erwerbsminderungsrente`
  eine `regelzahlung-neu`. Rechnung, Aenderungsliste und Marker laufen damit
  ohne Sonderweg.
- Gehalt, Arbeitslosen- und Krankengeld bleiben Sache des Agenten (eigene
  Annahmen). Das Ereignis rechnet nur, was aus Vertragsdaten folgt.

## Verworfene Alternativen

- **Nur Feld und Anleitung:** Der Agent haette die Beitraege je Vertrag selbst
  beenden muessen. Fehleranfaellig, sobald Vertraege dazukommen.
- **Vollstaendiger Ereignis-Motor** (auch Gehalt, Lohnersatz, Steuer): fuer ein
  privates Modell zu viel; Lohnersatz haengt an Einzelfaellen, die der Agent
  mit dem Nutzer klaert.
- **Befreiung je Regelzahlung statt je Vertrag:** Die Befreiung ist eine
  Vertragseigenschaft; Beitrags-Regelzahlungen wechseln mit jeder Dynamik.

## Nachtrag 2026-10-21: BU und volle Erwerbsminderung getrennt

Berufsunfaehigkeit (eigener Beruf, private BU-Rente) und volle Erwerbsminderung
(kaum noch irgendeine Arbeit, gesetzliche Rente) sind verschiedene Risiken; im
typischen BU-Fall fliesst keine Erwerbsminderungsrente. Der Fall `bu` bucht
deshalb nur noch `bu_rente` ein. Neuer Fall `erwerbsminderung`: befreit wie `bu`
und bucht `bu_rente` und `erwerbsminderungsrente` ein. Die Kachel Absicherung
zeigt entsprechend die BU-Renten als Summe und den Betrag bei voller
Erwerbsminderung darunter. Verworfen: halbe Erwerbsminderungsrente als dritter
Fall (nicht als Wert erfasst, haengt am Arbeitsmarkt).

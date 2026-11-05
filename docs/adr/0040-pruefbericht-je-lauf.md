# Pruefbericht zeigt den Lauf, die Gesamtsicht nur auf Nachfrage

Status: entschieden am 2026-11-05.

## Kontext

Der Pruefbericht (ADR 0025) rechnete bei jedem Lauf ueber den ganzen Bestand. Er
wurde dadurch immer laenger und wiederholte Bekanntes: die groessten Betraege
aller Jahre, alle nie von Hand bestaetigten Haendler, dieselben E4-Regeln.
Ausreisser kamen aus Konten, die der Lauf gar nicht beruehrt hatte, und
Jahresraten schlugen jedes Jahr an. Zwischen dem Bekannten ging unter, was ein
echter Befund waere.

## Entscheidung

- Der Import setzt an jeder neuen Buchung `importiert_am`. Aeltere Buchungen
  bleiben ohne das Feld; ihr Importzeitpunkt ist nicht bekannt und wird nicht
  erfunden.
- Der Protokolleintrag `import-durchlauf` schliesst einen Lauf ab. Der Bericht
  zeigt die Buchungen danach; ist seither nichts dazugekommen, den zuletzt
  abgeschlossenen Lauf. Fehlt der Abschluss, zeigt der naechste Bericht zwei
  Laeufe zusammen: lieber zu viel als zu wenig.
- Offene Bestandsprobleme (Widerspruch zum Regelwerk, Saldenkette, Dubletten-
  Prueffaelle, Konten ohne Anker) stehen weiter in jedem Bericht. Sie verlangen
  eine Handlung und verschwinden danach von selbst. Leere Abschnitte fallen weg.
- Auffaellige Monate zaehlen weder Transfers noch zugeordnete Regelzahlungen.
- Die bisherige Gesamtsicht bleibt mit `--bestand` (MCP `umfang: "bestand"`).

## Verworfene Alternativen

- **Bekannte Eintraege abhaken.** Haette je Listeneintrag einen Merker gebraucht
  und wieder Pflegearbeit erzeugt, ohne die Laenge des Berichts zu begrenzen.
- **Lauf aus dem Datum im Protokoll oder aus `rohquelle` ableiten.** Der Beleg
  wird erst nach dem Import abgelegt, und das Buchungsdatum sagt nichts darueber,
  wann eine Buchung in den Bestand kam.
- **Alte Buchungen nachtraeglich datieren.** Es gibt keine verlaessliche Quelle,
  und fuer den Bericht werden sie nicht gebraucht.
- **Importauftrag-Id an der Buchung statt Zeitpunkt.** Ein Lauf kann mehrere
  Auftraege umfassen; die Zuordnung zum Lauf braeuchte dann doch den Zeitpunkt.

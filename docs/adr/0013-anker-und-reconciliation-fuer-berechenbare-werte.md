# Anker + Reconciliation fuer "berechenbare" Werte (Konto-Saldo, Darlehen-Restschuld)

Konto-Saldo und Darlehen-Restschuld werden **nicht** rein aus den Bewegungsdaten berechnet, sondern aus einem **belegten Ankerpunkt** (Zeitwert) plus den Bewegungen *nach* dessen Standdatum. Weitere belegte Staende dienen einem **Reconciliation-Check** gegen die Rechnung. Das gilt ab M5.

## Begruendung

`CONTEXT.md > Zeitwerte` sagte urspruenglich, berechenbare Werte (Konto-Saldo, Darlehen-Restschuld, Nettovermoegen) gehoerten **nicht** in `zeitwerte.jsonl`, sondern wuerden in der App berechnet. Das stimmt aber nur, wenn die Historie **vollstaendig** vorliegt:

- Eine Summe ueber die *geladenen* Transaktionen ist laut `CONTEXT.md > Geladener Saldo und Kontostand` ausdruecklich **kein** bankbestaetigter Kontostand. Es gibt real keine garantiert vollstaendige Transaktionshistorie ab Kontoeroeffnung.
- "Endstand minus alle Buchungen = Anfangsstand" abzuleiten ist verlockend, macht aber den Reconciliation-Check **wirkungslos**: Der so berechnete Anker erfuellt per Konstruktion immer "Anker + Buchungen = Endstand", selbst wenn Buchungen fehlen. Der Fehler waere im Anker versteckt.

Die Aufloesung ist, einen **belegten, unabhaengigen** Anker zu fuehren (der Saldo steht auf dem Bankauszug als "alter/neuer Saldo"; die Restschuld auf dem Darlehensauszug). Erst die Unabhaengigkeit von Anker und Buchungen macht den Abgleich aussagekraeftig.

Damit ist der scheinbare Widerspruch zu "berechenbar = nie Zeitwert" aufgeloest: Der **Anker** ist ein belegter Zeitwert (`feld = kontostand` bzw. `restschuld`, `qualitaet = belegt`); der **laufende Wert** wird daraus + Bewegungen berechnet. Das Nettovermoegen selbst bleibt ein reines Aggregat und nie ein Zeitwert.

## Konsequenz

- **Live-Saldo / Live-Restschuld** = juengster belegter Stuetzpunkt + Bewegungen danach. So sammeln sich keine alten Buchungsfehler an.
- **Reconciliation-Check** (Ist-gegen-Ist) ueber je zwei aufeinanderfolgende belegte Staende: belegte Differenz muss gebuchter Differenz entsprechen; sonst Check "Buchungen passen nicht zum Auszug" (vergessene/doppelte Buchungen, bei Darlehen Drift im Zinsmodell).
- Fehlt fuer ein liquiditaetsrelevantes Konto bzw. ein aktives Darlehen jeder belegte Anker → sichtbarer Datenqualitaets-Check.
- Bereits **erfolgte** Sondertilgungen brauchen keine eigene Struktur: ein frischer belegter Restschuld-Anker nach der Sondertilgung (Re-Anker) bildet sie ab.
- Abzugrenzen vom **Plan-Ist-Abgleich** (M8): dieser prueft Zukunftsplan gegen Realitaet; der Reconciliation-Check hier prueft zwei belegte Ist-Staende gegen die gebuchte Bewegung.
- Depots verzweigen anders: ihr Wert ist `depotwert` (Zeitwert), nicht Anker+Buchungen, weil Depot-Buchungen (Sparplan/Kaeufe) keine Wertaenderung sind.

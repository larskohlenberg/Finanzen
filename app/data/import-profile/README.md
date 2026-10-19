# Import-Profile

Deklarative Spaltenzuordnung je Bank-CSV. Vertrag: `schemas/importprofil.schema.json`.

Die Profildateien selbst sind **nicht versioniert** (sie tragen Konto-IDs und
Dateinamen mit Kontonummern). Versioniert sind nur dieses README und das Schema.

## Wozu

Ohne Profil normalisiert der Agent jede Datei per Hand — Token-Arbeit pro Import.
Mit Profil macht `tools/normalize.mjs` das deterministisch und wiederholbar.

Das Verhaeltnis zu ADR 0005 ("keine bankspezifischen Parser"): Es entsteht **kein
Code** pro Bank. Die Zuordnungs-Intelligenz bleibt beim Agenten — er schreibt das
Profil einmal. Danach ist sie gespeicherte Konfiguration statt wiederholter
Token-Arbeit. Aendert die Bank ihre Spalten, bricht der Lauf hart und benennbar
ab ("Spalte X nicht in der Datei"), statt Werte still falsch zuzuordnen.

## Regeln

- **Gepruefter Vertrag.** Der Inbox-Lauf prueft jedes Profil vor der Nutzung gegen
  das Schema (auch: Muster muessen gueltige regulaere Ausdruecke sein, eine
  Herkunft ist genau `spalte` oder `konstante`). Ein ungueltiges Profil wird nicht
  benutzt; seine CSV landet mit den Fehlern als Notiz in `error/`.

- **Nie raten.** Gibt es keine verlaessliche Quelle fuer ein Feld, bleibt es leer
  (`{"konstante": ""}`). Eine falsche Gegenpartei ist schlimmer als eine fehlende.
- **`dateimuster` scharf halten.** Treffen zwei Profile auf dieselbe Datei, bricht
  der Inbox-Lauf ab — bewusst, statt per Reihenfolge zu entscheiden.
- **`bank_referenz` nur mappen, wenn die Bank sie stabil und je Buchung eindeutig
  vergibt.** Im Zweifel weglassen: dann greift der Freitext-Hash (ADR 0007).

## Wie Betraege gelesen werden

- **Strikt nach `dezimal`.** Erlaubt sind Vorzeichen, Ziffern ohne Gruppierung
  oder durchgehend in Dreiergruppen, bis zu zwei Nachkommastellen und ein
  Waehrungszeichen davor oder dahinter. Bei `dezimal: ","` ist `12.34` deshalb
  ein Zeilenfehler, nicht 1.234,00.
- **Soll/Haben.** Leer und `0,00` zaehlen als nicht gefuellt. Genau eine Seite
  ungleich null bestimmt den Betrag (Soll negativ, Haben positiv). Beide
  ungleich null oder ein unlesbarer Wert auf einer Seite ist ein Zeilenfehler,
  beide leer ebenso; eine ausdrueckliche `0,00` ohne Gegenseite bleibt `0.00`.
- **Mehrzeilige Felder.** Ein zitiertes Feld darf Zeilenumbrueche enthalten; sie
  werden zu Leerzeichen. Ein nicht geschlossenes Anfuehrungszeichen bricht den
  Lauf fuer die Datei ab.

## Bestehende Profile

| Profil | Konto | Quelle |
| --- | --- | --- |
| `musterbankc-plus-csv` | KTO-002 | MusterbankC Tagesgeldkonto, CSV-Umsatzexport |

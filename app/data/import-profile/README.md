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

- **Nie raten.** Gibt es keine verlaessliche Quelle fuer ein Feld, bleibt es leer
  (`{"konstante": ""}`). Eine falsche Gegenpartei ist schlimmer als eine fehlende.
- **`dateimuster` scharf halten.** Treffen zwei Profile auf dieselbe Datei, bricht
  der Inbox-Lauf ab — bewusst, statt per Reihenfolge zu entscheiden.
- **`bank_referenz` nur mappen, wenn die Bank sie stabil und je Buchung eindeutig
  vergibt.** Im Zweifel weglassen: dann greift der Freitext-Hash (ADR 0007).

## Bestehende Profile

| Profil | Konto | Quelle |
| --- | --- | --- |
| `musterbankc-plus-csv` | KTO-002 | MusterbankC Tagesgeldkonto, CSV-Umsatzexport |

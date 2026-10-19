# Prototyp E1: Persistenz

Wegwerf-Prototyp zur Entscheidung E1 (Architektur-Review 2026-10-19, Welle 1.1).
Nicht an die App oder die Werkzeuge angebunden, arbeitet nur auf Kopien der Demodaten.

| Datei | Inhalt |
|---|---|
| `generationen.mjs` | Variante A: Dateigenerationen (Hardlinks, Manifest, atomarer Zeiger, Leser-Leases, Aufräumen, Undo, Wiederanlauf) |
| `sqlite-bestand.mjs` | Variante B: SQLite über `node:sqlite` (Tabellen je Sammlung, Cent-Spalten, Fremdschlüssel, Import/Export) |
| `rundweg.mjs` | Ordnervergleich byte-/feldgleich, verlustbehaftete Zahl-Schreibweisen |
| `lese-api.mjs` | Schmale Lese-API je Ansicht (Buchungsseite, Kennzahl) für beide Varianten, mit ETag |
| `arbeiter.mjs` | Eigenständiger Prozess für Nebenläufigkeits- und Kill-Tests (`E1_HALT=<schritt>`) |
| `messung.mjs` | Messwerte für den Bericht: `node prototyp/e1/messung.mjs 1,10,40 40` |

Tests: `node --test tests/e1-*.test.mjs`.

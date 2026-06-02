# Fachliche Meilensteine Runde 2

Stand: 27.05.2026

Diese Meilensteine sollen verhindern, dass wieder ein grosser, schwer pruefbarer Gesamtbau entsteht. Jeder Meilenstein hat ein fachliches Ziel und harte Exit-Kriterien.

## M0 - Projekt- und Datenvertrag

Ziel: Runde 2 hat eine klare Architektur, ein kleines Datenmodell und Validierungsregeln.

Exit-Kriterien:

- Anforderungen, Datenmodell, Architekturreview und Handoff existieren.
- Es gibt leere Zielordner fuer `app`, `data`, `schemas`.
- Runde-1-Artefakte liegen im Archiv.
- Es gibt keine aktive Excel-V1-Pipeline im Arbeitsbereich.

## M1 - Minimaler Masterdatenstand

Ziel: Personen, Konten, Kategorien und eine kleine Transaktionsmenge koennen als strukturierte Daten validiert werden.

Exit-Kriterien:

- `schemas/` enthaelt Schemas fuer Personen, Konten, Kategorien und Transaktionen.
- `data/master/` enthaelt einen kleinen Beispiel-/Startdatenstand.
- Validierung findet fehlende Pflichtfelder und kaputte Referenzen.
- Kein Dashboard, bevor diese Validierung steht.

## M1.5 - Reale Stammdatenbasis

Ziel: Aus vorhandenen echten Unterlagen und Runde-1-Artefakten werden echte Personen, Konten und Kategorien als validierter Masterdatenstand extrahiert, bevor die Review-Oberflaeche gebaut wird.

Exit-Kriterien:

- `data/master/personen.json`, `konten.json` und `kategorien.json` enthalten echte, mit dem Nutzer gepruefte Stammdaten.
- Unsichere Werte werden als offene Fragen dokumentiert, nicht geraten.
- Der M1-Validator laeuft weiterhin erfolgreich.
- Demo-Transaktionen bleiben vorerst in `data/master/`, muessen aber klar als Demo erkennbar sein und werden spaeter in einem Wrap-up entfernt oder verschoben.
- Kein Kontoauszugsimport, keine automatische Kategorisierung und keine Regelzahlungserkennung.

## M2 - Lokale Review-Oberflaeche

Ziel: Eine statische HTML-App zeigt den validierten Datenstand aus M1.5, offene Kategorien und Validierungsstatus.

Stand 27.05.2026: M2 ist in `app/` als statische Review-Oberflaeche umgesetzt. Der fachliche und technische Stand ist in `docs/runde2/M2_Review_Oberflaeche.md` dokumentiert.

Exit-Kriterien:

- `app/index.html` laeuft lokal ohne Webserver.
- Die App kann ein agentisch bereitgestelltes Review-Bundle anzeigen.
- Offene Kategorien, Checks und Basis-Kennzahlen sind sichtbar.
- Keine Import-Funktion in der Weboberflaeche; Datenbereitstellung passiert agentisch.
- Keine Persistenz-Magie: Export erfolgt als Datei.

## M3 - Import von Kontoauszuegen

Ziel: Rohdateien (CSV, PDF, copy-paste) werden vom Agenten in ein standardisiertes Importformat normalisiert und von einer deterministischen Pipeline dedupliziert, kategorisiert, transfer-gepaart, validiert und in den Masterdatenstand geschrieben.

Stand 28.05.2026: In einer Grilling-Session konkretisiert. Eine Bankbuchung ist eine Tatsache und wird **nicht** abgelehnt — die einzige Unsicherheit ist die Kategorie (`kategorisierung_status`). Was nicht verarbeitet werden kann, ist ein **Importfehler** (`data/inbox/error/`), keine Ablehnung.

Architektur-Entscheidungen (siehe ADRs):
- Keine bankspezifischen Parser — der Agent normalisiert (ADR 0005).
- Dialog laeuft in Claude Code, die App ist nur Anzeige (ADR 0006).
- Zweistufiger Dedupe-Hash mit leichter Normalisierung (ADR 0007).

Verantwortungsteilung:
- **Agent**: Format erkennen, Konto zuordnen, normalisieren, nachfragen bei Unsicherheit, Fehler nach `error/` legen, Lauf protokollieren.
- **Pipeline** (`tools/`, deterministisch): Schema- und Cross-Field-Validierung, Dedupe-Check, Kategorisierung via Regeln, Transfer-Match, Schreiben. Arbeitet **zeilenweise** — saubere Buchungen werden geschrieben, kaputte gesammelt (keine Alles-oder-nichts-Transaktion).

Kategorisierung: regelbasiert (`data/master/kategorisierungsregeln.json`), Substring-Match auf `gegenpartei`/`verwendungszweck`, optional gefiltert auf `konto_id` und `vorzeichen`. Eindeutiger Treffer → `vorgeschlagen`. Konflikt oder kein Treffer → `offen`.

Transfer-Match: deterministisch, Auto-Paarung nur bei (Betrag exakt invers) UND (beide Konten im Modell) UND (Datumsdifferenz ≤ 3 Tage) UND (Verwendungszweck nach Normalisierung identisch). Externe Transfers markiert der Nutzer manuell.

UI: Importfehler kommen ueber das Review-Bundle in die App, werden im Checks-Bereich angezeigt und als Chip im Arbeitsstatus-Streifen gezaehlt.

Exit-Kriterien:

- Standardisiertes Importformat hat ein Schema in `schemas/`.
- Kategorisierungsregel hat ein Schema; der Categorizer ist ein deterministisches Tool.
- Zweistufiger Dedupe-Hash ist implementiert (ADR 0007).
- Transfer-Matcher ist ein deterministisches Tool.
- Die Pipeline gibt ein strukturiertes Ergebnis zurueck (geschrieben, uebersprungen, Fehler, Transfer-Treffer).
- Unsichere Kategorien bleiben offen; nichts wird geraten.
- Importfehler sind in der App sichtbar.
- Der Import-Agent-Skill beschreibt Prozess, Do's und Don'ts.

## M4 - Cashflow und Regelzahlungen

Ziel: Wiederkehrende Zahlungen werden als Vorschlaege sichtbar und erst nach Bestaetigung modellwirksam.

Exit-Kriterien:

- Regelzahlungsvorschlaege sind von bestaetigten Regelzahlungen getrennt.
- Cashflow-Ist basiert auf Transaktionen.
- Cashflow-Prognose kennzeichnet unbestaetigte Annahmen.
- Dashboard zeigt Datenqualitaet neben Kennzahlen.

## M5 - Vermoegen, Verbindlichkeiten und Immobilien

Ziel: Vermoegenswerte und Schulden werden als separate Stammdaten mit Quellenstatus gefuehrt.

Exit-Kriterien:

- Immobilien, Darlehen, Konten und Depots haben getrennte Entitaeten.
- Bewertungen haben Standdatum und Quelle.
- Nettovermoegen ist berechnet, nicht manuell gepflegt.
- Fehlende Quellen erzeugen sichtbare Checks.

## M6 - Szenarien und Arbeitsende-Fragen

Ziel: Szenarien rechnen auf validierten Daten und expliziten Annahmen.

Exit-Kriterien:

- Annahmen sind versioniert oder mit Gueltigkeit versehen.
- Szenarioergebnisse zeigen Datenqualitaet.
- Keine zentrale Lebensentscheidung wird aus Platzhaltern als scheinbar belastbarer Wert dargestellt.

## M7 - Versicherungen, Renten und Vorsorge

Ziel: Schutz-, Vorsorge- und Renteninformationen werden quellenbasiert erfasst und in Cashflow-/Szenariofragen korrekt eingeordnet.

Exit-Kriterien:

- Versicherungen und Renten haben eigene Schemas.
- Laufende Beitraege sind mit Regelzahlungen verknuepfbar.
- Spaetere Leistungen sind als Rente, Kapitalleistung oder Ereignis modellierbar.
- Ungepruefte Ansprueche wirken nicht still als sichere Zukunftswerte.

## M8 - Agentenworkflow und wiederkehrende Pruefungen

Ziel: Agentenarbeit wird als Auftraege, Vorschlaege, Pruefregeln und Laufprotokolle nachvollziehbar.

Exit-Kriterien:

- Agentenauftraege, Pruefregeln, Vorschlaege und Laufprotokolle haben Schemas.
- Rollenrechte verhindern stille Fachentscheidungen.
- Wiederholte Laeufe erzeugen keine doppelten Vorschlaege.
- Nutzerentscheidungen sind von Agentenvorschlaegen getrennt.

## M9 - Umfassende App statt Datenviewer

Ziel: Die lokale App wird zur zentralen Arbeitsoberflaeche fuer Review, Dashboard, Datenqualitaet und agentische Workflows.

Exit-Kriterien:

- Dashboard, Datenqualitaet, Importreview, Vorschlagsreview und Modulansichten sind in der App erreichbar.
- Manuelles CRUD ist fuer Sonderfaelle moeglich, aber gefuehrt und validiert.
- Exporte entstehen aus validierten Daten.
- Jede Ansicht zeigt, ob sie auf belegten, geschaetzten oder offenen Daten basiert.

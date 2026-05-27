# Fachliche Meilensteine Runde 2

Stand: 26.05.2026

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

## M2 - Lokale Review-Oberflaeche

Ziel: Eine statische HTML-App zeigt den Datenstand, offene Kategorien und Validierungsstatus.

Exit-Kriterien:

- `app/index.html` laeuft lokal ohne Webserver.
- Nutzer kann Daten per Datei laden.
- Offene Kategorien, Checks und Basis-Kennzahlen sind sichtbar.
- Keine Persistenz-Magie: Export erfolgt als Datei.

## M3 - Importvorschlaege fuer Kontoauszuege

Ziel: Neue Transaktionsdateien werden nicht direkt final geschrieben, sondern als validierbarer Importvorschlag erzeugt.

Exit-Kriterien:

- Importvorschlag hat ein Schema.
- Unsichere Kategorien bleiben offen.
- Deduplikation ueber stabilen Hash ist definiert.
- Der Nutzer oder Agent kann Vorschlaege annehmen, ablehnen oder zurueckstellen.

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

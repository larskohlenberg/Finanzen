# Anforderungen Runde 2

Stand: 26.05.2026

## Ausgangspunkt

Runde 1 hat gezeigt, dass Excel als Masterformat fuer dieses Projekt zu viele Risiken erzeugt: OpenXML-Kompatibilitaet, Layoutbruch, unklare Zwischenartefakte, schwer pruefbare Zellzustande und hohe Tokenkosten. Der Nutzer wird voraussichtlich ca. 99 Prozent der Pflege ueber KI-Agenten erledigen lassen und nur auf Aufforderung oder in Sonderfaellen manuell CRUD-Arbeit machen.

## Produktziel

Ein lokales, agentenfreundliches Familien-Finanzmodell als umfassende App. Die App soll langfristig den fachlichen Umfang aus Runde 1 abdecken: Personen, Konten, Kategorien, Transaktionen, Regelzahlungen, Transfers, Vermoegen, Immobilien, Darlehen, Versicherungen, Renten, Ereignisse, Erwerbsstatus, Sozialleistungen, Annahmen, Szenarien, Quellen, Checks, Warnungen und Agenten-Workflows.

Der Unterschied zu Runde 1 ist nicht ein kleinerer Zielumfang, sondern eine andere Bauweise: erst stabile Daten- und Validierungsgrundlage, dann schrittweise App-Funktionen. Die finale App darf umfassend werden; die Umsetzung darf nicht wieder als Big Bang starten.

## Nichtziel fuer Runde 2

- Kein Excel-Master.
- Keine neue grosse Alles-auf-einmal-Pipeline.
- Keine automatische finale Fachentscheidung durch Agenten.
- Keine komplexe UI, bevor Datenmodell und Validierung stabil sind.
- Keine tokenintensive Vollmodellierung ohne kleinen vertikalen Nutzerschnitt.

## Kernanforderungen

1. Lokale Nutzbarkeit:
   - Die erste UI soll als `app/index.html` ohne Webserver nutzbar sein.
   - Daten koennen ueber Dateiimport geladen und als Datei exportiert werden.

2. Agentenfreundlichkeit:
   - Masterdaten sind strukturierte Dateien, nicht Excel-Zellen.
   - Jede Agentenaktion erzeugt eine nachvollziehbare Aenderung.
   - Unsichere Zuordnungen bleiben offen und werden nicht geraten.

3. Validierung:
   - Schemas definieren Pflichtfelder, Statuswerte, IDs und Referenzen.
   - Ein Datenstand ist nur fuehrend, wenn er die Validierung besteht oder bekannte offene Punkte explizit ausweist.

4. Fachliche Transparenz:
   - Dashboard-Kennzahlen zeigen auch Datenqualitaet und offene Punkte.
   - Quellen, Annahmen und Vorschlaege bleiben auditierbar.

5. Export:
   - Excel ist spaeter nur Export-/Reportformat.
   - Exporte duerfen nie Masterdaten still ueberschreiben.

6. Vollstaendiger fachlicher Zielumfang:
   - Alle fachlichen Module aus Runde 1 werden entweder direkt in Runde 2 uebernommen oder bewusst als spaeterer Meilenstein eingeordnet.
   - Der Abgleich steht in `docs/runde2/Traceability_Runde1_zu_Runde2.md`.
   - Kein Modul gilt als gestrichen, nur weil es nicht in M1 enthalten ist.

## Akzeptanzkriterien fuer den ersten nutzbaren Schnitt

- Es gibt genau einen dokumentierten Masterdatenstand.
- Ein kleiner Datensatz mit Personen, Konten, Kategorien und Transaktionen laesst sich validieren.
- Die lokale HTML-App zeigt Cashflow-Basis, offene Kategorien und Datenqualitaet.
- Ein Agent kann eine neue Transaktionsdatei als Importvorschlag erzeugen, ohne direkt final zu kategorisieren.
- Offene fachliche Punkte sind sichtbar statt in Platzhaltern versteckt.

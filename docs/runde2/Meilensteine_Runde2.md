# Fachliche Meilensteine Runde 2

Stand: 27.05.2026

Statushinweis 2026-06-09: Dieses Dokument ist der fachliche Meilensteinplan mit historischen Exit-Kriterien. Aktuelle Betriebsentscheidungen zu Webserver, App-Datenraum und direkter Masterdaten-Ladung stehen in ADR 0012 und ADR 0015; alte M2-Formulierungen zu `file://` und Review-Bundle sind historisch zu lesen.

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

UI: Importfehler werden aus den App-Daten geladen, im Checks-Bereich angezeigt und als Chip im Arbeitsstatus-Streifen gezaehlt.

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

- Regelzahlungsvorschlaege sind von bestaetigten Regelzahlungen getrennt (ein Datensatz, Status-Feld; keine separate Vorschlags-Datei).
- Cashflow-Ist basiert auf Transaktionen.
- Cashflow-Prognose kennzeichnet unbestaetigte Annahmen und ihre bewusste Unvollstaendigkeit (nur Regelzahlungen; keine Einmaleffekte/Szenarien).
- Dashboard zeigt Datenqualitaet neben Kennzahlen (faktische Zaehler, kein Konfidenz-Score).
- Der Regelzahlungs-Agent-Skill beschreibt Erkennung, Vorschlag und Bestaetigung und **meldet offene Vorschlaege zu Session-Beginn aktiv** (App ist nur Anzeige, Agent ist der einzige Aenderungskanal).

## M5 - Vermoegen, Verbindlichkeiten und Immobilien

Ziel: Vermoegenswerte und Schulden werden als separate Stammdaten mit Quellenstatus gefuehrt.

Exit-Kriterien:

- Immobilien, Darlehen und Konten (inkl. Depots als `kontotyp=depot`) haben getrennte Entitaeten.
- Bewertungen haben Standdatum und Quelle.
- Nettovermoegen ist berechnet, nicht manuell gepflegt.
- Fehlende Quellen erzeugen sichtbare Checks.

## M6 - Szenarien und Arbeitsende-Fragen

Ziel: Szenarien rechnen auf validierten Daten und expliziten Annahmen.

Exit-Kriterien:

- Annahmen sind versioniert oder mit Gueltigkeit versehen.
- Szenarioergebnisse zeigen Datenqualitaet.
- Keine zentrale Lebensentscheidung wird aus Platzhaltern als scheinbar belastbarer Wert dargestellt.

Vorgemerkt aus M5-Grilling (2026-06-03):

- **Geplante Sondertilgungen** auf Darlehen, einmalig (z. B. "Februar 2031: 20.000")
  und wiederkehrend (z. B. "jedes Jahr im Dezember: 500"), als Annahme/Planwert mit
  Darlehensbezug. In M5 bewusst ausgeklammert (M5 rechnet nur bereits **erfolgte**
  Sondertilgungen in die Restschuld ein).
- **Restschuld-Projektion auf ein Zukunftsdatum** (braucht die geplanten
  Sondertilgungen). M5 berechnet Restschuld nur zum Stichtag/heute.
- **Cash-Realismus-Guardrail für Prognosen.** Geplante Ausgaben-Regelzahlungen
  duerfen die Zukunft nicht faelschlich rosig aussehen lassen, weil zu wenig
  Ausgabe geplant ist. Beispiel: geplant 500/Monat Supermarkt, real per Auszug
  nur Rewe 280 + Lidl 100, plus 120 **bar** (unsichtbar, weil als Abhebung schon
  abgeflossen). Die Prognose/Szenarien muessen auf Implausibilitaet hinweisen,
  wenn geplante Ausgaben deutlich unter dem historischen Ist liegen, statt still
  ein zu gutes Bild zu zeigen (vgl. ADR 0011: bewusste Unvollstaendigkeit
  sichtbar machen).
- **Kanal fuer Plan-Zusammensetzung an den Agenten.** Der Nutzer muss dem Agenten
  mitteilen koennen, aus welchen realen Buchungen (inkl. Bar-Anteil) sich ein
  Planwert zusammensetzt, damit Abgleich und Prognose realistisch bleiben.
- **Quasi-liquide Reserven in Szenarien** (vorgemerkt 2026-06-09): Depots/Wertpapiere
  koennen in Reichweiten-/Arbeitsende-Szenarien als Deckung einer Liquiditaetsluecke
  beruecksichtigt werden — mit explizitem Verfuegbarkeits-Vorbehalt (Settlement,
  Kursrisiko, realisierter Gewinn/Verlust). Bewusst **nicht** im M4-Liquiditaetssaldo,
  der nur kurzfristig verfuegbares Cash zeigt (vgl. ADR 0016).

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

Vorgemerkt aus M5-Grilling (2026-06-03):

- **Plan-Ist-Abgleich** als generelle wiederkehrende Pruefregel ueber *alle* Planwerte
  (geplante Sondertilgungen, Regelzahlungen, weitere Planzahlen): "wurde aus dem Plan
  Realitaet?". Bewusst nicht als M5-Sonderfall nur fuer Darlehen, sondern hier
  systematisch ueber alle Entitaeten mit Planwerten.

## M9 - Umfassende App statt Datenviewer

Ziel: Die lokale App wird zur zentralen Arbeitsoberflaeche fuer Review, Dashboard, Datenqualitaet und agentische Workflows.

Exit-Kriterien:

- Dashboard, Datenqualitaet, Importreview, Vorschlagsreview und Modulansichten sind in der App erreichbar.
- Manuelles CRUD ist fuer Sonderfaelle moeglich, aber gefuehrt und validiert.
- Exporte entstehen aus validierten Daten.
- Jede Ansicht zeigt, ob sie auf belegten, geschaetzten oder offenen Daten basiert.

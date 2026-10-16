# Handoff: M9 — Umfassende App statt Datenviewer

**An:** Agent im Projekt „Finanzmodell Runde 2“
**Quelle:** One-Shot-Referenz `…/Projekte/Finanzen_OneShot`. M9 ist bei euch bewusst offen formuliert — dieses Handoff liefert Architektur-Empfehlungen zu den vier Exit-Kriterien, mit Fokus auf das heikelste („manuelles CRUD … geführt und validiert“).

## 1. Exit-Kriterium „Dashboard, Datenqualität, Importreview, Vorschlagsreview, Modulansichten“

Eure Sidebar trägt das schon fast. Ergänzungen aus der One-Shot-Erfahrung:

- **Dashboard = Übersicht + Arbeitsvorrat, keine Deko.** KPI-Kacheln (Nettovermögen, Liquidität heute, Liquidität +90 Tage, offene Reviews) — jede mit worst-of-Qualitäts-Badge — plus die Top-Prüfhinweise direkt darunter. Eure „Nächste Aktion“-Leiste ist dafür das beste Muster im Feld; sie sollte ihre Zähler aus dem Check-Katalog (M8) speisen statt aus Einzelabfragen.
- **Datenqualitäts-Ansicht = Checks-Ansicht.** Befunde nach Schwere gruppiert, jeder Befund mit Deep-Link auf seinen Bezug (Konto, Transaktion, Regelzahlung, Vorsorge). Voraussetzung: adressierbare Detail-Routen (siehe M1/M2-Nachbesserungs-Handoff §5).
- **Vorschlagsreview als eigene Sicht** über alle Vorschlagsarten hinweg (Kategorien, Regelzahlungen, später Szenario-Annahmen): eine Liste „wartet auf Entscheidung“, gruppiert nach Art. Die Entscheidung selbst fällt im Agenten-Dialog oder im geführten CRUD (§2) — die Sicht zeigt den Vorrat und den Weg dorthin.
- **Modul-Reihenfolge:** Liquidität bleibt führend (ADR 0016); Szenarien (M6) gehören als eigenes Modul daneben, nicht unter Vermögen versteckt.

## 2. Exit-Kriterium „Manuelles CRUD … geführt und validiert“ — Architektur-Warnung

Hier liegt das größte Risiko, die bisherige Disziplin (Vorschlag ≠ Entscheidung, Tool prüft, Protokollpflicht) zu verlieren. Empfehlung: **CRUD-Formulare erzeugen keinen direkten Write, sondern einen Vorschlag** — denselben Datensatztyp, den auch der Agent erzeugt:

1. Formular (z. B. „Kategorie für diese 3 Buchungen setzen“) → erzeugt Änderungsvorschlag mit `entscheidungsquelle: mensch-ui`.
2. Server-/Tool-Seite validiert (derselbe Validator wie überall) und wendet an — atomar, mit Laufprotokoll-Eintrag (`akteur: "ui:<ansicht>"`).
3. Ablehnen/Fehler → nichts geschrieben, Fehlerliste im Formular.

So bleibt: ein Schreibpfad, eine Validierung, ein Protokoll — egal ob Agent, Tool oder Mensch schreibt. Was NICHT entstehen sollte: ein zweiter, „kleiner“ Schreibpfad im Frontend, der Masterdateien direkt patcht. (Die One-Shot-Version ist bewusst komplett read-only geblieben; wenn ihr CRUD wollt, dann über genau einen geführten Kanal.)

Konsequenz für den Server: euer `python -m http.server` kann keine Schreib-Endpunkte. Der One-Shot-`server.mjs` (Node, ~120 Zeilen, keine Dependencies) ist eine portierbare Basis: statisch + Token-Schutz + heute nur GET/HEAD; ein einzelner validierter POST-Endpunkt für geführte Änderungen ließe sich dort sauber ergänzen. Spätestens mit Schreibzugriff ist der Token-Schutz Pflicht (vgl. ADR 0009/0015).

## 3. Exit-Kriterium „Exporte entstehen aus validierten Daten“

Eure Export-Ansicht existiert schon. Zwei Regeln ergänzen:

- Export läuft denselben Validator VOR der Erzeugung; bei Fehlern: kein Export, sondern Fehlerbericht (kein „Export trotz kaputter Daten“).
- Jeder Export erscheint im Laufprotokoll (`akteur: "tool:export"`, mit Filter/Umfang in `eingaben`) — Exporte sind Datenabgaben und gehören in die Nachvollziehbarkeitskette.

## 4. Exit-Kriterium „Jede Ansicht zeigt belegt/geschätzt/offen“

Das ist mit zwei Bausteinen fast geschenkt, wenn die M1/M2-Nachbesserungen umgesetzt sind:

- **Eine** Aggregationsfunktion worst-of (`belegt < geschaetzt < offen`) im geteilten Kern — jede Ansicht ruft sie über ihre sichtbaren Positionen auf und zeigt das Ergebnis als Badge im Seitenkopf.
- Jede Einzelzeile trägt ihr eigenes Badge (habt ihr in Vermögen bereits) — konsequent auf alle Module ausweiten, auch auf Prognose-/Szenariowerte.

Messbares Abnahmekriterium: Es gibt keine Ansicht, in der eine Zahl ohne herleitbare Qualität steht (Stichprobe: Übersicht, Liquiditätsprognose, Szenario-Endwert, Exportkopf).

## 5. Kleinere Übernahme-Kandidaten aus der One-Shot-Version

- **SVG-Liniendiagramme** (Liquiditätsverlauf, Restschuld-Projektion, Szenario vs. Basis) — `linienDiagramm()` aus `app/js/komponenten.js`, ~70 Zeilen, themetauglich über CSS-Variablen.
- **i18n-Abdeckung der Domänen-Enums** (Status, Qualität, Annahme-Arten) zusätzlich zu Labels — Wörterbuchstruktur in `app/js/i18n.js` (One-Shot) als Checkliste.
- **Beispieldatenraum als Fixture:** ein kohärenter, fiktiver Komplett-Datenraum (Familie, Haus, Darlehen, Vorsorge, Szenarien) parallel zu den Echtdaten — für UI-Entwicklung, Screenshots und als Integrations-Fixture (`beispieldaten/` im One-Shot ist direkt verwendbar und deckt alle Entitäten inkl. M6/M7 ab).
- **Responsive-Grenzfälle:** eure Bottom-Tab-Bar ist stark; prüft die Detail-Panels auf Smartphone-Breite (Panel als Vollbild-Overlay statt Seitenleiste).

## 6. Empfohlene Reihenfolge innerhalb M9

1. Geführter Schreibkanal (§2) — architekturprägend, alles andere hängt daran
2. Qualitäts-Badges flächendeckend (§4) — billig, hoher Ehrlichkeitsgewinn
3. Vorschlagsreview-Sicht (§1) — bündelt M3/M4/M6-Vorräte
4. Diagramme + Export-Härtung (§3/§5)

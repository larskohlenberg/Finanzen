# Handoff: Nachbesserungen am M1–M5-Stand (Datenvertrag, Validator, Review-UI, Import, Liquidität, Vermögen)

**An:** Agent im Projekt „Finanzmodell Runde 2“ (`…/Person A/Finanzen`)
**Quelle:** One-Shot-Referenzimplementierung unter `…/Projekte/Finanzen_OneShot` (gleicher Produkt-Prompt, voller Feature-Umfang mit Beispieldaten, 84 Tests). Beide Projekte sind Vanilla-ESM mit Integer-Cent — Code ist mit Namensanpassung direkt portierbar.
**Zweck:** M1–M5 sind in Runde 2 abgeschlossen und tragen den Echtdaten-Betrieb. Dieses Handoff listet gezielte Härtungen, die sich aus dem Vergleich mit der One-Shot-Version ergeben haben — als Nacharbeit VOR M6, weil Szenarien (M6), Vorsorge (M7) und Prüfläufe (M8) auf genau diesen Bausteinen aufsetzen.

Abschnitte 1–4 betreffen das Fundament (M1/M2), Abschnitte 5–7 die Fachmeilensteine M3–M5, Abschnitte 8–10 Querschnitt (UI, Code, Betrieb).

## 1. Strikte Betragsvalidierung — M1 (wichtigste Nachbesserung)

Befund: `app/tools/lib/text.mjs:toCents()` ist nachsichtig — `toCents("")` → `0`, einstellige Nachkommastellen werden aufgefüllt, `"abc"` → `0`/`NaN`-Risiko. Das verletzt den eigenen Grundsatz „Lücke zeigen statt raten“: ein fehlender Betrag wird still zu 0,00 €.

Empfehlung:
- `toCents` bleibt als Anzeige-/Konvertierungshelfer, aber **Validator und Import-Pipeline erzwingen das strikte Format** `^-?(0|[1-9]\d*)\.\d{2}$`, verbieten `-0.00`, und behandeln leere/fehlende Beträge als Validierungsfehler — nie als 0.
- Fehlende Werte sind `null` + Datenqualität `offen`, nicht `0`.
- Portierbar: `shared/geld.js` (One-Shot) — `istGueltigerBetrag`, `parseBetrag` (wirft `BetragsFehler`), inkl. Tests `tests/geld.test.mjs`.

## 2. Drittes Qualitätslevel `offen` als vollwertiger Enum-Wert — M1

Runde 2 kennt `belegt | geschaetzt` plus Sonderfälle („Kontostand noch nicht belegt“). Die One-Shot-Version führt `offen` als dritten Wert mit fester Dominanz-Ordnung `belegt < geschaetzt < offen` und einer einzigen Aggregationsfunktion (worst-of) für KPIs.

- Jede berechnete Kennzahl (Nettovermögen, Liquidität, Saldo) trägt die **schlechteste** Qualität ihrer Eingaben als Badge. Eure Vermögens-Ansicht zählt heute „1 belegt / 0 geschätzt“ — die worst-of-Aggregation macht daraus eine einzige ehrliche Gesamtaussage.
- Portierbar: `shared/calc/qualitaet.js` (12 Zeilen) + Badge-Muster aus `app/js/komponenten.js`.
- Exit-Kriterium-Bezug: M9 verlangt „jede Ansicht zeigt, ob sie auf belegten, geschätzten oder offenen Daten basiert“ — das Fundament dafür jetzt legen.

## 3. Cross-Entity-Checks im Validator (über JSON-Schema hinaus) — M1

JSON-Schemas prüfen Einzeldatensätze. Diese Bestandsprüfungen aus `shared/validierung.js` (One-Shot) ergänzen:

| Code | Prüfung |
|---|---|
| `dedupe-doppelt` | `dedupe_hash` eindeutig **je Konto** über den Gesamtbestand |
| `transfer-inkonsistent` | Transfer-Paar: exakter Gegenbetrag, wechselseitiger Rückverweis, verschiedene Konten |
| `kategorie-fehlt` | Status `bestaetigt`/`vorgeschlagen` erfordert existierende Kategorie |
| `zeitraum-ungueltig` | `ende >= start` bei Regelzahlungen/Phasen |
| `anteile-ungueltig` / `anteile-unvollstaendig` | Eigentumsanteile: Bruch-Summe > 1 = Fehler, < 1 = Warnung |
| `regex-ungueltig` | Kategorisierungsregel-Regex kompiliert |

Fehler vs. Warnungen getrennt zurückgeben; Tools brechen bei Fehlern ab, ohne zu schreiben.

## 4. Zeitwerte vertraglich append-only — M1/M5

ADR 0002 (In-Place-Updates) ist für Stammdaten richtig. Für `zeitwerte.jsonl` sollte explizit gelten: **nur anhängen, nie ändern/löschen** — der Wertverlauf (Depotwert über Zeit, Marktwert-Historie, Standmitteilungen) ist fachlicher Inhalt, kein Nebeneffekt. Eure Vermögens-Detailansicht zeigt die Wertstände-Historie bereits — der Vertrag sichert sie ab. Vorschlag: kurzes ADR „Zeitwerte append-only“ als Präzisierung von ADR 0002/0013.

## 5. Import-Härtung — M3

Eure Import-Pipeline (Dedupe zweistufig, Transfer-Matcher, sequenzielle IDs) ist solide. Drei Ergänzungen aus der One-Shot-Pipeline (`shared/import.js`, `tools/importieren.mjs`):

1. **Alles-oder-nichts bei Zeilenfehlern:** Enthält eine normalisierte Eingabe auch nur eine ungültige Zeile (Datum/Betrag), wird der GESAMTE Import abgelehnt und nichts geschrieben — der Agent korrigiert die Normalisierung, statt dass ein Teilbestand entsteht. Abgebrochene Läufe trotzdem protokollieren.
2. **Idempotenz als Test-Invariante:** Derselbe Import zweimal → „0 neu, n Duplikate“, Datei byte-identisch. Als expliziten Regressionstest verankern (Referenz: `tests/tools.test.mjs`), nicht nur als Eigenschaft des Dedupe-Hashs.
3. **Kontostand-Anker als Import-Beifang:** Nennt der Export einen Endsaldo, wird er im selben Lauf als belegter Anker an `zeitwerte.jsonl` angehängt (Quelle = Exportdatei). Euer Übersichts-Hinweis „Kontostand noch nicht belegt“ verschwindet damit beim nächsten regulären Import von selbst — heute müsste das jemand separat pflegen. (Referenz: Skill `skills/02-import-normalisierung.md`, Schritt 4.)

## 6. Regelzahlungen und Liquidität — M4

1. **Monatsend-Klemmung in der Termin-Expansion:** Eine Regelzahlung mit Tag 29/30/31 muss im Februar auf den 28./29. klemmen (und im April auf den 30.), statt auszufallen oder in den Folgemonat zu rutschen. Das ist die subtilste Fehlerquelle der Prognose. Portierbar: `shared/calc/regelzahlungen.js` (`expandiereRegelzahlung` mit Monatsend-Klemmung) + Tests `tests/calc-regelzahlungen.test.mjs` (z. B. Start 31.01. → 28.02. → 31.03. → 30.04.).
2. **Qualität wandert in die Prognose:** Jeder erwartete Termin erbt die Qualität seiner Regelzahlung; der Prognose-Endwert trägt worst-of. Eine Prognose aus geschätzten Regelzahlungen darf nicht als `belegt` erscheinen.
3. **„Nächste Fälligkeit“ je Regelzahlung** in der Listenansicht (eine Expansion-Abfrage, großer Review-Nutzen: man sieht sofort, ob Rhythmus und Tag stimmen).
4. **Liquiditätsverlauf zusätzlich als Punkteserie/Diagramm:** Eure Monats-/Quartals-Tabellen beantworten „wie viel?“; die Linie (jeder erwartete Termin ein Punkt) beantwortet „wann kippt es?“ — relevant für die M6-Reichweitenfragen. Portierbar: `shared/calc/liquiditaet.js` (Punkteserie) + `linienDiagramm()` aus `app/js/komponenten.js`.

## 7. Vermögen und Darlehen — M5

1. **Restschuld-Verlauf seit Anker zeigen, nicht nur den Stichtagswert:** Eure M5-Logik rechnet die Restschuld zum Heute-Stichtag; die Fortschreibung erzeugt die Zwischenpunkte (je Ratentermin) ohnehin. Diese Punkte als Verlauf (Tabelle oder Linie) sichtbar machen — kostenlose Transparenz, und die Projektions-UI für M6 ist damit vorbereitet. Portierbar: `shared/calc/darlehen.js` (`punkte`-Array, Ganzzahl-Zinsarithmetik mit skaliertem Prozentsatz, Klemmung bei 0, `abbezahlt_am`).
2. **Fehlender Marktwert = Position `offen` mit `null`,** nicht „Position fehlt einfach in der Liste“: Jeder Vermögenswert und jedes Darlehen erscheint IMMER in der Nettovermögensliste — ohne Zeitwert eben mit Wert `null` und Badge `offen`. Sonst sieht ein unvollständiger Bestand vollständiger aus, als er ist (vgl. ADR 0011: bewusste Unvollständigkeit sichtbar machen).
3. **Bargeld als explizite Entscheidung:** Euer „Bargeld zählt nicht (bewusster blinder Fleck)“ (CONTEXT.md) kollidiert perspektivisch mit dem Cash-Realismus-Guardrail aus M6. Empfehlung: Konto-Art `bargeld` zulassen und den Stand als geschätzten Anker führen — oder den blinden Fleck im Guardrail-/Prognose-Text ausdrücklich erwähnen. Beides ist ehrlich; still bleiben ist es nicht.

## 8. Review-UI: drei gezielte Ergänzungen — M2

1. **Deep-Links:** Detailansichten (Transaktion, Konto) zusätzlich zum Seitenpanel als Hash-Route adressierbar machen (`#/transaktionen/TXN-…`). Nötig, damit Checks (M8) und Laufprotokolle auf konkrete Datensätze verlinken können. Das Seitenpanel kann bleiben — die Route öffnet Tabelle + Panel im richtigen Zustand.
2. **Verlaufs-Diagramme:** Eine kleine SVG-Linienkomponente (keine Library) für Saldo-Verlauf, Liquiditätsprognose und später Restschuld/Szenarien. Portierbar: `linienDiagramm()` aus `app/js/komponenten.js` (One-Shot, ~70 Zeilen, Light/Dark via CSS-Variablen).
3. **Validierungsfehler in der App:** Wenn der geladene Bestand Validierungsfehler hat, rotes Banner mit Fehlerliste oben in jeder Ansicht (nicht nur „Validierung extern“-Chip). Die Validierung dafür als ES-Modul importieren statt nur als CLI — gleiche Logik in Browser und Tool („das Tool prüft“ gilt auch in der UI).

## 9. `main.js` modularisieren (Wartbarkeits-Investition vor M6–M9)

`app/main.js` hat 2.164 Zeilen; M6 (Szenarien), M7 (Vorsorge) und M9 (weitere Module) wachsen alle dort hinein. Empfehlung: je View ein Modul (`views/transaktionen.mjs`, …) plus gemeinsame `komponenten.mjs` (el/tabelle/badge/detailliste). Der bestehende `ui-layout-contract.test.mjs` sichert den Umbau ab. Referenz-Schnitt: `app/js/views/` im One-Shot (11 Module à ~60–120 Zeilen).

## 10. Optionaler Zugriffsschutz für den Webserver

ADR 0009 dokumentiert den ungeschützten LAN-Betrieb; ADR 0015 macht den Datenraum deploybar. Spätestens beim LAN-Deployment: Token-Schutz (Query-Token → HttpOnly-Cookie), nur GET/HEAD zulassen (405 sonst), Pfad-Traversal-Schutz. Portierbar: `server.mjs` (One-Shot, ~120 Zeilen, ersetzt `python -m http.server` ohne neue Dependencies).

## Bewusst NICHT übernehmen

- Eigentumsanteile als Dezimalstring — euer Bruch-Modell (Zähler/Nenner) ist überlegen, behalten.
- Verzicht auf Pagination — eure Pagination ist bei 2.664+ Transaktionen nötig, die One-Shot-Version rendert naiv alles.
- One-Shot-IDs (Hash-basiert) — eure sequenziellen `TXN-YYYYMMDD-…` sind menschenlesbarer.
- Bankspezifische Annahmen in der Pipeline — euer ADR 0005 (keine Bank-Parser, Agent normalisiert) deckt sich mit der One-Shot-Architektur; dabei bleiben.

## Akzeptanz

- [ ] Validator lehnt `""`, `"1,5"`, `"1.5"`, `-0.00` als Betrag ab; `npm run validate:master` weiterhin grün
- [ ] `offen` existiert als Qualitätswert; mindestens Nettovermögen-KPI zeigt worst-of-Badge
- [ ] Cross-Checks (Tabelle in §3) implementiert, mit Tests je Code
- [ ] Import: Zeilenfehler ⇒ kompletter Abbruch ohne Schreiben; Doppel-Import nachweislich idempotent (Test)
- [ ] Export-Endsaldo erzeugt belegten Kontostand-Anker im selben Importlauf
- [ ] Regelzahlungs-Expansion klemmt Monatsende korrekt (Testfall 31.01. → 28.02.)
- [ ] Vermögenswert/Darlehen ohne Zeitwert erscheint als `offen`-Position mit `null`, fehlt nicht still
- [ ] Transaktions-Detail per URL adressierbar
- [ ] Saldo-/Liquiditätsverlauf als Liniendiagramm sichtbar

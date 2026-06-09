# Skill: Import-Agent

Aktuelle Betriebsanweisung fuer Importlaeufe. Fachlich aus M3 entstanden, inzwischen Teil des App-Datenraums.

Es gibt zwei Wurzeln, halte sie auseinander:

- **App-Datenraum** (`app/`): `data/...`, `Belege/...`, `schemas/...` und `tools/...` sind app-relativ und liegen darunter.
- **Repo-Root** (eine Ebene ueber `app/`): die Projekt-Doku `CONTEXT.md` und `docs/adr/...` liegen hier — sie gehoeren bewusst **nicht** in den deploybaren Datenraum (ADR 0015). Pfade auf diese Doku sind in diesem Skill repo-root-relativ, nicht app-relativ.

## Wann diesen Skill nutzen

Nutze ihn, wenn der Nutzer

- eine neue Bankexport-Datei (CSV, PDF, Screenshot, copy-paste-Tabelle) zum Importieren bereitstellt,
- bittet, `data/inbox/` zu verarbeiten,
- einen Importfehler aus `data/inbox/error/` klaeren moechte,
- offene Transaktionen aus einem frueheren Lauf nachziehen will.

Nicht nutzen fuer:
- Pflege von Stammdaten (Personen, Konten, Kategorien) — das ist Aufgabe des Stammdaten-Erfassungs-Agenten.
- Aenderung von Kategorisierungsregeln — eigener Pflegeprozess; danach Import erneut laufen lassen.
- Manuelle Korrekturen an bereits importierten Transaktionen — direkte Datei-Edits mit Validator-Lauf.

## Kontext, den du kennen musst

Vor jedem Import lesen:

Im **Repo-Root** (nicht unter `app/`):

1. `CONTEXT.md` — verbindliches Glossar. Insbesondere die Eintraege zu **Transaktion**, **Transaktions-ID und Deduplikation**, **Kategorisierung**, **Transfer**, **Inbox-Konvention**, **Standardisiertes Importformat**, **Kategorisierungsregel**.
2. `docs/adr/0005-keine-bankspezifischen-parser.md` — du normalisierst selbst, es gibt keinen Parser.
3. `docs/adr/0003-validator-als-deterministisches-tool.md` — du rufst den Validator, du fuehrst ihn nicht aus.

Im **App-Datenraum** (`app/`):

4. `schemas/` — Schemas fuer Transaktion, Transfer, ggf. Importformat.
5. `data/master/konten.json` — fuer die Zuordnung Rohdatei → Konto via `kontoreferenz`.
6. `data/master/kategorisierungsregeln.json` — Input fuer den Categorizer.

## Eingaben, die du akzeptierst

- CSV-Dateien aus Online-Banking-Exporten.
- PDF-Kontoauszuege (lesbar oder gescannt).
- Tabellen, die der Nutzer aus dem Online-Banking copy-paste in den Chat einfuegt.
- Screenshots tabellarischer Buchungsdaten.

Aus jedem Eingang musst du **pro Buchung** mindestens extrahieren:

- `buchungsdatum` (ISO 8601 Date-only)
- `betrag` (Decimal-String, exakt zwei Nachkommastellen, mit Vorzeichen)
- `gegenpartei` (Freitext)
- `verwendungszweck` (Freitext)
- Konto-Zuordnung (siehe naechster Abschnitt)
- `bank_referenz` (optional, falls die Bank eine eindeutige Buchungsnummer liefert)

Zusaetzliche Bankdetails aus der Rohquelle nicht wegwerfen, sondern optional ins standardisierte Importformat uebernehmen, wenn sie pro Buchung vorhanden sind:

- `wertstellungsdatum`
- `transaktionstyp`
- `kundenreferenz`
- `empfaenger`
- `empfaenger_iban`
- `mandatsreferenz`
- `glaeubiger_id`

**Wichtig:** "optional" heisst nur, dass eine Rohquelle das Feld nicht immer liefert. Wenn die Spalte in der Rohquelle vorhanden ist, muss der Agent sie normalisieren und mitgeben. Nicht auf die Tabellenansicht der App optimieren.

Typische Spaltenzuordnung fuer Bank-CSV-Exporte:

| Rohspalte | Standardisiertes Feld |
| --- | --- |
| `Buchungsdatum` | `buchungsdatum` |
| `Wertstellung` | `wertstellungsdatum` |
| `Umsatztyp` / `Transaktionstyp` | `transaktionstyp` |
| `Zahlungsempfaenger*in` / `Zahlungsempfänger*in` | `empfaenger` |
| `IBAN` | `empfaenger_iban` |
| `Glaeubiger-ID` / `Gläubiger-ID` | `glaeubiger_id` |
| `Mandatsreferenz` | `mandatsreferenz` |
| `Kundenreferenz` | `kundenreferenz`; wenn das die von der Bank gelieferte eindeutige Buchungsnummer ist, zusaetzlich als `bank_referenz` |

Bei abgehenden Zahlungen ist `Zahlungsempfaenger*in` die Gegenpartei/der Empfaenger. Bei eingehenden Zahlungen kann die Rohspalte stattdessen `Zahlungspflichtige*r`, `Auftraggeber*in` oder aehnlich heissen; dann diese Partei als `gegenpartei` verwenden und `empfaenger` nur setzen, wenn wirklich ein separater Empfaenger ausgewiesen ist.

Wenn eines dieser Felder fuer eine Zeile nicht zuverlaessig extrahierbar ist: **nicht raten** — die Zeile gehoert in den Fehlerpfad (siehe unten).

Zusaetzlich zu den Buchungen musst du bei Kontoauszuegen und Banking-Exporten auf belegte Kontostaende achten, z. B. "Kontostand vom ...", "Alter Saldo", "Neuer Saldo" oder vergleichbare Bankformulierungen. Beim Initialimport eines neuen Kontos ist ein solcher Stand ein moeglicher Saldo-Anker fuer die Liquiditaet. Du erkennst ihn und fragst den Nutzer, wie damit umzugehen ist, statt ihn still zu uebernehmen.

Wenn die Rohquelle einen belegten Kontostand enthaelt, schlage konkret vor:

1. Kontostand als Liquiditaetsanker uebernehmen.
2. Kontostand ignorieren und ohne Liquiditaetsanker importieren.
3. Anderen belegten Ankerwert verwenden, falls der Nutzer einen besseren Belegwert nennt.

Nach Bestaetigung wird der Anker als Zeitwert erfasst:

- `entitaet = "konto"`
- `entitaet_id = <konto_id>`
- `feld = "kontostand"`
- `wert = <Decimal-String mit zwei Nachkommastellen>`
- `standdatum = <Datum des belegten Kontostands>`
- `qualitaet = "belegt"`
- `quelle_hinweis = <finaler Beleg-Pfad oder kurzer Rohquellenhinweis>`

Wenn die Rohquelle keinen belegten Kontostand enthaelt, darfst du keinen Anfangsbestand aus den Buchungen raten. Frage den Nutzer, ob er einen belegten Ankerwert mit Standdatum mitteilen kann oder ob der Import ohne Liquiditaetsanker fortgesetzt werden soll. Dann muss der Lauf sichtbar machen, dass fuer dieses liquiditaetsrelevante Konto ein belegter Kontostand fehlt.

## Prozessablauf pro Importlauf

1. **Rohdatei sichten**: Welches Format? Welche Bank? Welches Konto? Wenn das aus der Datei nicht hervorgeht (z. B. weil die CSV keine IBAN-Spalte hat), beim Nutzer nachfragen.
2. **Konto zuordnen**: Erkenne das Konto, indem du die IBAN/Kontonummer der Rohdatei gegen die `kontoreferenz` in `data/master/konten.json` abgleichst (die Referenz ist bevorzugt die volle IBAN, ggf. nur Endziffern). Das ist eine Wiedererkennung durch dich, kein im Code erzwungener String-Abgleich — im finalen Eintrag traegst du die `konto_id`. Mehrdeutig (z. B. gleiche Endziffern bei maskierter Referenz)? Pruefen, ob `inhaber_person_ids` oder Banknamen die Mehrdeutigkeit aufloesen. Nicht eindeutig zuordbar → in `error/`. Steht das Konto noch **gar nicht** in `konten.json` (z. B. erster Import einer neuen Bank), nicht raten: dem Nutzer einen konkreten Konto-Eintrag (`konto_id`, `name`, `kontotyp`, `kontoreferenz`, `inhaber_person_ids`) **vorschlagen** und ihn erst nach **expliziter Bestaetigung** validiert anlegen. Erst danach importieren. Bei einem Initialimport pruefen, ob die Rohquelle einen belegten Kontostand enthaelt; dem Nutzer den erkannten Stand oder das Fehlen eines Standes mit Handlungsoptionen vorlegen.
3. **Normalisieren**: Roheintraege ins **standardisierte Importformat** (siehe `schemas/`) ueberfuehren. Eine JSONL-Datei pro Lauf unter `data/inbox/standardized/`.
4. **Validieren**: `tools/validator.mjs` (bzw. die Browser-faehige Bibliothek) auf das Standardformat anwenden. Fehlschlag → in `error/`.
5. **Dedupe**: Fuer jede Buchung den `dedupe_hash` bilden (Felder siehe `CONTEXT.md`). Gegen `data/master/transaktionen.jsonl` (den **Bestand**) pruefen. Hash bekannt → ueberspringen. **Nicht** innerhalb desselben Auszugs deduplizieren — ein amtlicher Auszug enthaelt reale Buchungen; das Tool laesst gleich aussehende Zeilen stehen und disambiguiert in allen Quellfeldern identische automatisch (siehe ADR 0007, Praezisierung 2026-06-09). `bank_referenz` aus der Rohdatei roh mitgeben, wo die Bank eine liefert — die Pipeline nutzt sie nur als Schluessel, wenn sie **dateiweit eindeutig** ist, und faellt sonst auf den Freitext-Hash zurueck. Du musst die Eindeutigkeit nicht selbst herausfiltern.
6. **Kategorisieren**: `tools/categorizer.mjs` aufrufen mit der Buchung und `kategorisierungsregeln.json`.
   - Eindeutiger Treffer → `kategorie_id` setzen, `kategorisierung_status = vorgeschlagen`.
   - Kein Treffer oder Konflikt → `kategorisierung_status = offen`, keine `kategorie_id`.
7. **Schreiben**: Buchungen an `data/master/transaktionen.jsonl` anhaengen. Belegte Kontostaende als Zeitwerte an `data/master/zeitwerte.jsonl` anhaengen, sofern sie aus der Rohquelle extrahiert wurden und nicht bereits identisch vorhanden sind. Vor dem Schreiben **erneut Validator** auf den finalen Datensatz.
8. **Transfer-Match**: Nach dem Schreiben `tools/transfer-matcher.mjs` aufrufen. Kriterien fuer Auto-Match (alle vier zwingend):
   - Betrag exakt invers (cent-genau).
   - Beide Konten liegen im Modell.
   - Datumsdifferenz ≤ 3 Tage.
   - `verwendungszweck` nach Normalisierung (trim, Whitespace kollabieren, lowercase) identisch.
   Bei Match: Transfer-Datensatz anlegen, `ist_transfer = true` auf beiden Seiten, `transfer_id` setzen.
   Externe Transfers (Bargeld, Familie) erkennt das Tool nicht — die markiert der Nutzer im Dialog.
9. **Beleg sprechend umbenennen und ablegen** (siehe Abschnitt unten): Rohbeleg in `Belege/` einsortieren, **niemals** den Scan-/Mail-Originalnamen behalten. Zwischen-JSONL verwerfen. Bei Fehler: nach `data/inbox/error/` plus strukturierte Begleitdatei.
10. **Agent-Lauf protokollieren**: Eintrag in `data/master/agent_log.jsonl` mit Zaehlern (importiert, offen, Fehler), betroffene IDs, kurze Notiz. `rohquelle` jeder Buchung zeigt auf den **finalen Beleg-Pfad** in `Belege/`.

## Belege benennen und ablegen

Gilt fuer **alle** Belege (Kontoauszuege wie sonstige Informationsbelege). Eingescannte Briefe und Mail-Anhaenge haben unklare oder immer gleiche Namen — deshalb beim Wegsortieren **immer** umbenennen, sodass der Beleg ohne Oeffnen verstaendlich ist.

Schema: `<Entitaet/Konto>_<Quelle/Gesellschaft>_<Belegart>_<Datum oder Zeitraum>.<ext>`

Beispiele:
- `TESTREF-062.csv`
- `Riester_MusterversicherungA_Vertragsstand_2026-01-01.pdf`
- `KFZ_MusterversicherungB_Beitragsrechnung_2026.pdf`

Ablage in `Belege/`:
- **Kontoauszuege**: `Belege/Kontoauszuege/<Konto>/` (Serie je Konto, jahresuebergreifend).
- **Sonstige Belege**: nach bestehender `Belege/<Jahr>/<Kategorie>`-Struktur (Immobilien, Rente, Versicherungen, Sonstiges, Steuern, Depots, Kredite).

## Do's

- Validator vor jedem Schreiben aufrufen.
- Bei Unsicherheit (Konto, Datum, Betrag, Gegenpartei) lieber im Dialog fragen oder in `error/` legen — niemals raten.
- Den Stand am Ende eines Laufs als kurze Zusammenfassung in den Chat schreiben (importiert: X, offen: Y, Fehler: Z).
- Bei einem geklaerten Fehler aus `error/` die Datei zuruck nach `data/inbox/` schieben und den Lauf nochmal starten.
- Beim ersten Import einer neuen Bank pruefen, ob `bank_referenz` (Buchungsnummer) ueber Re-Exports stabil bleibt. Wenn nicht: Feld weglassen, damit der Freitext-Hash greift (ADR 0007).

## Don'ts

- **Keine bankspezifischen Parser bauen.** Wenn die Normalisierung muehsam ist, fragen, nicht Code schreiben.
- **Nichts schreiben ohne Hash-Check** — Duplikate sind tabu.
- **Keine Kategorie raten**, die nicht aus dem Categorizer kommt. Wenn du eine Buchung „eigentlich klar" findest und keine Regel matcht, dem Nutzer vorschlagen, eine Regel anzulegen — nicht still die Kategorie setzen.
- **Keine Regeln automatisch anlegen**, auch wenn du sie sinnvoll findest. Regel-Pflege ist ein eigener Dialogschritt.
- **Keine Transaktion „ablehnen"**. Eine Bankbuchung ist eine Tatsache. Wenn etwas nicht eingespielt werden kann, ist das ein Importfehler in `error/`, keine Ablehnung.
- **Keine Annahmen ueber Konten, die nicht in `konten.json` stehen.** Unbekanntes Konto → nicht still durchlaufen. Entweder in `error/`, oder dem Nutzer einen Konto-Eintrag vorschlagen und nach **expliziter Bestaetigung** anlegen (siehe Schritt 2) — nie raten oder ungefragt anlegen.

## Wann fragen, wann handeln

**Fragen, bevor du handelst:**

- Konto-Zuordnung mehrdeutig oder unbekannt.
- Roher Datensatz hat keine eindeutige Spaltenstruktur (z. B. ungewoehnliche PDF-Tabelle).
- Datumsformat ist mehrdeutig (06/05/2026 — Mai oder Juni?).
- Bei einer auffallend grossen Buchung, deren Plausibilitaet du nicht einschaetzen kannst.

**Selbstaendig handeln:**

- Standard-CSV mit klar zuordenbarem Konto.
- Hash-Check zeigt: alles schon importiert.
- Eindeutige Regel-Treffer fuer Kategorie.
- Eindeutige Transfer-Paare nach den vier Kriterien.

## Wo was liegt

| Pfad | Zweck |
| --- | --- |
| `data/inbox/` | Rohdateien zum Verarbeiten |
| `data/inbox/standardized/` | Normalisierte Zwischenform |
| `data/inbox/processed/` | Erfolgreich verarbeitete Rohdateien |
| `data/inbox/error/` | Fehlgeschlagene Importe + Begleitdatei |
| `data/master/transaktionen.jsonl` | Finale Transaktionen |
| `data/master/transfers.json` | Transfer-Paarungen |
| `data/master/konten.json` | Konten-Stammdaten (fuer Zuordnung) |
| `data/master/kategorisierungsregeln.json` | Regeln fuer Categorizer |
| `data/master/agent_log.jsonl` | Lauf-Protokoll fuer Uebergabe |
| `schemas/` | JSON Schemas zur Validierung |
| `tools/validator.mjs` | Deterministischer Validator |
| `tools/import.mjs` | Import-Pipeline `runImport` + CLI |
| `tools/dedupe.mjs` | Deterministischer Dedupe-Hash |
| `tools/categorizer.mjs` | Deterministischer Categorizer |
| `tools/transfer-matcher.mjs` | Deterministischer Transfer-Matcher |
| `tools/import-format.mjs` | Validierung des standardisierten Importformats |

## Verwandte Skills und Anschlussprozesse

- **kategorisierungsregel-pflege** — neue Regel anlegen oder bestehende anpassen.
- **regelzahlung-agent** (`docs/skills/regelzahlung-agent.md`) — wiederkehrende Buchungen als Regelzahlungen erkennen, vorschlagen, bestätigen.
- **belegextraktion** (ab M5/M7) — Belege, Vertraege, Versicherungspolicen lesen.

# Skill: Import-Agent

Aktuelle Betriebsanweisung fuer Importlaeufe. Fachlich aus M3 entstanden, inzwischen Teil des App-Datenraums.

Alle Pfade in diesem Skill sind app-relativ: `data/...`, `Belege/...`,
`schemas/...`, `tools/...` und `docs/...` liegen unter dem App-Raum. Im Betrieb
laufen Lesen, Schreiben und Tool-Laeufe ueber den MCP-Server `finanzen` (Zuordnung
CLI -> Tool in `docs/agent-context.md`, „Betrieb ueber MCP"); die CLI-Aufrufe
unten gelten so fuer die lokalen Demodaten.

## Wann diesen Skill nutzen

Nutze ihn, wenn der Nutzer

- eine neue Bankexport-Datei (CSV, PDF, Screenshot, copy-paste-Tabelle) zum Importieren bereitstellt,
- bittet, `data/inbox/` zu verarbeiten,
- einen Importfehler aus `data/inbox/error/` klaeren moechte,
- offene Transaktionen aus einem frueheren Lauf nachziehen will.

Nicht nutzen fuer:
- Pflege von Stammdaten (Personen, Konten, Kategorien) — das ist Aufgabe des Stammdaten-Erfassungs-Agenten.
- Aenderung von Kategorisierungsregeln — eigener Pflegeprozess (Skill kategorisierungsregel-pflege); danach Nach-Kategorisierung ueber den Bestand laufen lassen, nicht Reimport.
- Manuelle Korrekturen an bereits importierten Transaktionen — direkte Datei-Edits mit Validator-Lauf.

## Kontext, den du kennen musst

Vor jedem Import lesen:

1. `docs/agent-context.md` — gemeinsame Betriebsregeln fuer App-Raum, Validierung, Kategorisierung, Dedupe, Belege und Agentenprotokoll.
2. `schemas/` — Schemas fuer Transaktion, Transfer, ggf. Importformat.
3. `DATENROOT/konten.json` — fuer die Zuordnung Rohdatei → Konto via `kontoreferenz`.
4. `DATENROOT/kategorisierungsregeln.json` — Input fuer den Categorizer.
5. `tools/import.mjs`, `tools/validator.mjs`, `tools/dedupe.mjs`, `tools/categorizer.mjs`, `tools/transfer-matcher.mjs`.

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

**`empfaenger_iban` nennt nur den Empfaenger eines Ausgangs.** Druckt die Bank
bei einer Gutschrift die IBAN des Absenders, gehoert sie **nicht** in
`empfaenger_iban`; ein eigenes Feld fuer die Absender-IBAN gibt es nicht. Steht
sie im Buchungstext, bleibt sie dort; steht sie in einer eigenen Zeile, entfaellt
sie. Begruendung: Interne Transfers paart der Transfer-Matcher ueber die
Ausgangsseite, die die Kontoreferenz des Gegenkontos traegt; fuer externe
Eingaenge nutzt das Modell die Absender-IBAN nirgends. Aeltere Buchungen, die
dort die Absender-IBAN tragen, bleiben stehen (das Feld geht nicht in den Hash,
und den Transfer-Match stoert es nicht); sie werden nicht nachtraeglich bereinigt.

Wenn eines dieser Felder fuer eine Zeile nicht zuverlaessig extrahierbar ist: **nicht raten** — die Zeile gehoert in den Fehlerpfad (siehe unten).

Zusaetzlich zu den Buchungen musst du bei Kontoauszuegen und Banking-Exporten auf belegte Kontostaende achten, z. B. "Kontostand vom ...", "Alter Saldo", "Neuer Saldo" oder vergleichbare Bankformulierungen. Beim Initialimport eines neuen Kontos ist ein solcher Stand ein moeglicher Saldo-Anker fuer die Liquiditaet. Du erkennst ihn und entscheidest nach der Reconciliation-Regel unten, statt ihn still zu uebernehmen oder den Lauf dafuer anzuhalten.

Wenn die Rohquelle einen belegten Kontostand enthaelt, entscheidet die
Reconciliation — nicht eine Rueckfrage:

1. Reconciliation geht auf -> Kontostand als Liquiditaetsanker uebernehmen.
2. Reconciliation geht nicht auf -> **nicht** uebernehmen, Differenz berichten.
3. Kein belegter Kontostand vorhanden -> ohne Anker importieren, Konto im
   Bericht als "ohne Anker" nennen.

**Reconciliation-Pflicht fuer Kopf-Kontostaende:** Ein Kontostand aus dem Kopf einer Umsatzliste (z. B. "Kontostand vom ...") darf nicht still als Zeitwert uebernommen werden. Pruefe zuerst, ob der Standdatum-Zeitpunkt durch die enthaltenen Buchungszeilen abgedeckt ist. Wenn der Kopf-Kontostand nach der letzten enthaltenen Buchung liegt oder sonst nicht mit den importierten Bewegungen reconciliert werden kann, wird er **nicht** geschrieben. Wenn bereits ein frueherer belegter Anker im Bestand oder im selben Auszug existiert, rechne den erwarteten Stand aus `Anker + importierte Buchungen bis Standdatum` nach und nenne die Differenz. Nur bei plausibler Reconciliation als Zeitwert schreiben; sonst ignorieren und im Laufprotokoll unter `normalisierung.reconciliation_differenz` festhalten, damit der Pruefbericht die Luecke zeigt. Ein falscher Saldo-Anker verschiebt die gesamte Liquiditaetsrechnung und ist, anders als eine Kategorie, nicht nebenbei korrigierbar — im Zweifel lieber kein Anker als ein falscher.

Bei aufgehender Reconciliation wird der Anker als Zeitwert erfasst:

- `entitaet = "konto"`
- `entitaet_id = <konto_id>`
- `feld = "kontostand"`
- `wert = <Decimal-String mit zwei Nachkommastellen>`
- `standdatum = <Datum des belegten Kontostands>`
- `qualitaet = "belegt"`
- `quelle_hinweis = <finaler Beleg-Pfad oder kurzer Rohquellenhinweis>`

Wenn die Rohquelle keinen belegten Kontostand enthaelt, darfst du keinen Anfangsbestand aus den Buchungen raten. Der Import laeuft dann ohne Liquiditaetsanker weiter und macht sichtbar, dass fuer dieses liquiditaetsrelevante Konto ein belegter Kontostand fehlt — das Konto erscheint im Pruefbericht unter "Konten ohne belegten Anker".

## Der schnelle Weg: Profil + Inbox-Lauf

Fuer eine **CSV einer bereits bekannten Bank** ist der ganze Ablauf unten ein
einziger Aufruf:

```
inbox                      # MCP-Tool, Vorschau: was wuerde passieren
inbox  schreiben: true     # anwenden   (lokal: npm run inbox / inbox:schreiben)
```

`tools/inbox.mjs` ordnet jede Datei ihrem Profil zu (`data/import-profile/`),
normalisiert deterministisch, faehrt die Import-Pipeline, verschiebt die Datei
nach `processed/` bzw. `error/` und schreibt den Laufeintrag ins `agent_log.jsonl`.

Der Handablauf unten gilt weiterhin fuer:

- **Den ersten Import einer neuen Bank.** Dann normalisierst du einmal von Hand,
  klaerst Konto und Saldo-Anker mit dem Nutzer — und legst danach ein **Profil**
  an (`schemas/importprofil.schema.json`), damit der naechste Export ein
  Tool-Aufruf ist. Das ist der eigentliche Ertrag des ersten Imports.
- **PDFs und Belegfotos.** `inbox.mjs` legt nur den Textvorlauf nach
  `data/inbox/standardized/` ab: `pdftotext -layout`, bei Bildscans und Fotos
  (png/jpg/jpeg) per OCR mit der Kopfzeile `# Per OCR (tesseract) erkannt, …`.
  Die Zeilenextraktion bleibt deine Arbeit — aber auf Text statt auf Binaer.
  Nur wenn der Vorlauf **leer** ist oder fehlt (OCR ohne Ergebnis), liest du
  Seiten bzw. Bild selbst (siehe Schritt 10).
- **Copy-paste-Tabellen und Screenshots.**

Beim Profil gilt dieselbe Disziplin wie ueberall: **nie raten.** Gibt es fuer ein
Feld keine verlaessliche Quelle in der Datei, bleibt es leer (`{"konstante": ""}`).
Eine falsche Gegenpartei ist schlimmer als eine fehlende.

## Prozessablauf pro Importlauf

1. **Rohdatei sichten**: Welches Format? Welche Bank? Welches Konto? Wenn das aus der Datei nicht hervorgeht (z. B. weil die CSV keine IBAN-Spalte hat), gehen die betroffenen Zeilen in `error/` — nicht raten, aber auch nicht anhalten.
2. **Konto zuordnen**: Erkenne das Konto, indem du die IBAN/Kontonummer der Rohdatei gegen die `kontoreferenz` in `DATENROOT/konten.json` abgleichst (die Referenz ist bevorzugt die volle IBAN, ggf. nur Endziffern). Das ist eine Wiedererkennung durch dich, kein im Code erzwungener String-Abgleich — im finalen Eintrag traegst du die `konto_id`. Mehrdeutig (z. B. gleiche Endziffern bei maskierter Referenz)? Pruefen, ob `inhaber_person_ids` oder Banknamen die Mehrdeutigkeit aufloesen. Nicht eindeutig zuordbar → in `error/`. Steht das Konto noch **gar nicht** in `konten.json` (z. B. erster Import einer neuen Bank), lege es validiert an (`konto_id`, `name`, `kontotyp`, `kontoreferenz`, `inhaber_person_ids`) und nenne es im Bericht. Das ist keine Rateentscheidung: die Kontoreferenz steht in der Rohdatei. Bei einem Initialimport pruefen, ob die Rohquelle einen belegten Kontostand enthaelt, und nach der Reconciliation-Regel oben verfahren.
3. **Normalisieren**: Roheintraege ins **standardisierte Importformat** (siehe `schemas/`) ueberfuehren. Eine JSONL-Datei pro Lauf unter `data/inbox/standardized/`.
4. **Validieren**: `tools/validator.mjs` (bzw. die Browser-faehige Bibliothek) auf das Standardformat anwenden. Fehlschlag → in `error/`.
5. **Dedupe**: Fuer jede Buchung den `dedupe_hash` bilden (Felder siehe `docs/agent-context.md`). Gegen `DATENROOT/transaktionen.jsonl` (den **Bestand**) pruefen. Hash bekannt → ueberspringen. **Nicht** innerhalb desselben Auszugs deduplizieren — ein amtlicher Auszug enthaelt reale Buchungen; das Tool laesst gleich aussehende Zeilen stehen und disambiguiert in allen Quellfeldern identische automatisch (zweistufiger Dedupe-Hash aus `docs/agent-context.md`). `bank_referenz` aus der Rohdatei roh mitgeben, wo die Bank eine liefert — die Pipeline nutzt sie nur als Schluessel, wenn sie **dateiweit eindeutig** ist, und faellt sonst auf den Freitext-Hash zurueck. Du musst die Eindeutigkeit nicht selbst herausfiltern.
6. **Kategorisieren**: `tools/categorizer.mjs` aufrufen mit der Buchung und `kategorisierungsregeln.json`.
   - Eindeutiger Treffer → `kategorie_id` setzen, `kategorisierung_status = vorgeschlagen`,
     `kategorie_herkunft = regel`. `import.mjs` schreibt automatisch `matched_regeln`
     mit der ID der treffenden Regel.
   - Kein Treffer → `kategorisierung_status = offen`, keine `kategorie_id`, kein
     `matched_regeln`.
   - Konflikt (mehrere Regeln passen, keine eindeutige Kategorie) →
     `kategorisierung_status = offen`, keine `kategorie_id`. `import.mjs` schreibt
     `matched_regeln` mit den IDs aller passenden Regeln, damit der Konflikt
     nachvollziehbar bleibt. Ein `offen`-Eintrag mit nicht leerem `matched_regeln`
     ist ein Konflikt-Fall; das ist ein automatisches Ergebnis, kein manueller Schritt.
   Ist aus Beleg oder Nutzerentscheidung eindeutig, welche Regelzahlung die Buchung
   erfüllt, `regelzahlung_id` im standardisierten Eintrag setzen. Nie allein aus
   Betragsgleichheit oder ähnlicher Gegenpartei zuordnen. Den Regelfall erledigt
   nach dem Schreiben das Tool `regelzahlungen_zuordnen` (Schritt 8).
   When documentation or a user decision identifies unambiguously which recurring
   payment the booking fulfils, set `regelzahlung_id` in the standardized entry.
   Never infer the assignment from an equal amount or a similar counterparty alone.
   The tool `regelzahlungen_zuordnen` covers the regular case after writing (step 8).
7. **Schreiben**: Buchungen an `DATENROOT/transaktionen.jsonl` anhaengen. Belegte Kontostaende als Zeitwerte an `DATENROOT/zeitwerte.jsonl` anhaengen, sofern sie aus der Rohquelle extrahiert wurden und nicht bereits identisch vorhanden sind. Vor dem Schreiben **erneut Validator** auf den finalen Datensatz. Im Betrieb: JSONL per `datei_schreiben` nach `data/inbox/standardized/`, dann Tool `import` (erst Vorschau, dann `schreiben: true`). Lokal den Root explizit uebergeben: `node tools/import.mjs <standardisierte-datei.jsonl> DATENROOT`.
8. **Transfer-Match**: Nach dem Schreiben `tools/transfer-matcher.mjs` aufrufen. Auto-Match bei exakt inversem Betrag (cent-genau), zwei verschiedenen Konten und einem Signal in seinem Fenster:
   - `zweck`: `verwendungszweck` nach Normalisierung (trim, Whitespace kollabieren, lowercase) identisch, ≤ 3 Tage.
   - `iban`: `empfaenger_iban` einer Seite ist die `kontoreferenz` des Gegenkontos, ≤ 5 Tage.
   - `iban-text`: der `verwendungszweck` einer Seite nennt die `kontoreferenz` des Gegenkontos als IBAN, ≤ 5 Tage.
   Steht bei einem Eingang die **Absender**-IBAN nur im Text (etwa „Incoming transfer from <Name> (<IBAN>)"), reicht das fuer den Match: die IBAN im `verwendungszweck` lassen und **nicht** nach `empfaenger_iban` schreiben (Konvention oben bei der Feldtabelle). Mehrdeutige Faelle (zwei gleich nahe Gegenstuecke) paart das Tool nicht, sondern meldet sie unter `mehrdeutig`; die klaert der Nutzer. Details: `agent-context.md`, „Auto-Match von Transfers".
   Bei Match: Transfer-Datensatz anlegen, `ist_transfer = true` auf beiden Seiten, `transfer_id` setzen.
   Externe Transfers (Bargeld, Familie) erkennt das Tool nicht — die markiert der Nutzer im Dialog.
   Danach `tools/regelzahlung-matcher.mjs` (MCP `regelzahlungen_zuordnen`) ueber den Bestand laufen lassen, erst Vorschau, dann schreibend: es setzt `regelzahlung_id` an den neuen Buchungen bestaetigter Regelzahlungen mit `konto_id`. Regeln: `agent-context.md`, „Zuordnung zu Regelzahlungen".
9. **Immobiliencheck fuer neue Transaktionen**: Vor dem Abschluss jedes Importlaufs genau die IDs aus `result.written` beziehungsweise `geschriebene_ids` pruefen.
   1. Alle neuen Buchungen auf einen moeglichen Immobilienbezug sichten.
   2. Kategorie, Gegenpartei, Adresse, Buchungstext und Belegpfad nur als Suchsignale verwenden, nie als alleinigen Zuordnungsanker.
   3. Bei eindeutigem Beleg oder eindeutiger Nutzeraussage `tools/transaktion-immobilie.mjs` verwenden.
   4. Bei einem bloss plausiblen Bezug die Kandidaten gruppiert dem Nutzer vorlegen; ohne Beleg oder Nutzerentscheidung bleibt `immobilie_id` weg.
   5. Im Abschlussbericht `geprueft`, `zugeordnet`, `ohne_hinweis` und `ungeklaert` nennen.
10. **Beleg sprechend umbenennen und ablegen** (siehe Abschnitt unten): Rohbeleg in `Belege/` einsortieren (im Betrieb: Tool `beleg_ablegen`), **niemals** den Scan-/Mail-Originalnamen behalten. Hat OCR den Text geliefert, nichts weiter tun: `belege_text` erzeugt den Zwilling identisch zum Vorlauf. Nur wenn der Vorlauf leer war oder fehlt (OCR ohne Ergebnis), liest du die PDF-Seiten bzw. das Foto selbst (`datei_lesen` mit `seite`) und schreibst den Zwilling schon beim Ablegen von Hand daneben (per `datei_schreiben` neben die Rohdatei, `beleg_ablegen` nimmt ihn mit): `<Belegname>.txt`, erste Zeile `# Vom Agenten aus dem Bildscan gelesen, <JJJJ-MM-TT>.`, darunter der gelesene Text. Danach `belege_text` mit `schreiben: true` — das legt die Textzwillinge der uebrigen Belege an und raeumt den Vorlauf in `standardized/` ab; einen bereits geschriebenen Zwilling laesst der Lauf unberuehrt. Zwischen-JSONL verwerfen. Bei Fehler: nach `data/inbox/error/` plus strukturierte Begleitdatei.
11. **Agent-Lauf protokollieren**: Eintrag in `DATENROOT/agent_log.jsonl` mit Zaehlern (importiert, offen, Fehler), betroffene IDs, kurze Notiz. `rohquelle` jeder Buchung zeigt auf den **finalen Beleg-Pfad** in `Belege/`.

## PDF-Kontoauszug mit Soll/Haben-Kennzeichen

Erfahrungswerte aus Monatsauszuegen, deren Posten so aussehen:

- **Kopfzeile je Posten**: `DD.MM. DD.MM. <Vorgang> <Betrag> S|H` — Buchungstag,
  Wertstellung, Vorgang, Betrag; `S` (Soll) wird negativ, `H` (Haben) positiv. Das
  Jahr steht nur im Auszugskopf.
- **Folgezeilen**: die erste ist die Gegenpartei, alle weiteren sind der
  Verwendungszweck.
- **Harter Umbruch bei 54 Zeichen**: Der Zweck ist in Monospace bei 54 Zeichen
  umbrochen, auch mitten im Wort. Eine volle 54-Zeichen-Zeile ohne Leerzeichen an
  die naechste anhaengen, sonst mit Leerzeichen. Pruefbar bei Darlehensraten: Zins-
  plus Tilgungsanteil im Text muss den Betrag ergeben.
- **Felder**: `EREF` → `kundenreferenz`, `MREF` → `mandatsreferenz`, `CRED` →
  `glaeubiger_id`. Eine IBAN des Gegenuebers nennt der Auszug nicht; das Feld
  bleibt leer.
- **Ueberlappung mit einer Umsatzanzeige**: Stammt der Bestand aus einer
  Umsatzanzeige derselben Bank, faengt der Hash-Dedupe die Ueberlappung nicht —
  die Anzeige haengt `IBAN: … BIC: …` an den Zweck. Dann ueber Datum, Betrag und
  Gegenpartei von Hand abgleichen und die bekannten Posten aus der JSONL nehmen,
  bevor importiert wird.
- **Zwei Daten statt eines Buchungstags (Umsatzanzeige)**: Normalerweise steht
  unter dem Betrag ein Datum, der Buchungstag. Weichen Wertstellungstag und
  Buchungstag voneinander ab, druckt die Bank stattdessen beide Daten in der Form
  `Valuta 30.06.2025 - 01.07.2025` (Beispiel erfunden). Das erste Datum ist der Wertstellungstag (ab
  dann zaehlt das Geld fuer Zinsen), das zweite der Buchungstag (an dem die Bank
  die Buchung auf dem Konto ausgefuehrt hat). Ins Modell gehoert der Buchungstag
  als `buchungsdatum`, der Wertstellungstag als `wertstellungsdatum`. Die
  Reihenfolge ist fest, auch wenn das zweite Datum frueher liegt. Belegt ist das
  an einer Lastschrift, bei der die umgekehrte Lesart unzulaessig waere: Belastet
  die Bank ein Konto, darf der Wertstellungstag nicht vor dem Buchungstag liegen.
- **Rechnungsabschluss**: Das separate Dokument enthaelt keine Buchung. Die
  Abschlussbuchung (Zinsen, Entgelte) steht im Auszug zum Quartalsende. Der
  Abschluss nennt keinen Gegenpartei-Namen; die Bank selbst eintragen.

## PDF-Kontoauszug mit Vorzeichen-Betraegen und Valuta-Spalte

- **Kopfzeile je Posten**: `DD.MM. DD.MM. <Vorgang> - Betrag` (Soll) bzw.
  `+ Betrag` (Haben). Das Jahr steht in der Folgezeile unter beiden Daten. Die
  Spaltenfolge ist fest: erst Buchungstag, dann Valuta. Bei Echtzeit-Ausgaengen
  kann die Valuta vor dem Buchungstag liegen; nicht tauschen.
- **Gegenpartei** ist die Zeile nach dem Vorgang. Danach folgt die Marke
  `Verwendungszweck/ Kundenreferenz`; die Zweckzeilen mit Leerzeichen verbinden.
  `IBAN …` steht nur bei Ausgaengen und geht nach `empfaenger_iban`,
  `Glaeubiger-ID` nach `glaeubiger_id`, `Mand-ID` nach `mandatsreferenz`.
- **Viererkuerzel am Zweckende** wie `OTHR`, `RCUR`, `RINP`, `SALA`, `ABWA`,
  `ABWE` gehoeren nicht in den Zweck. Was der Bestand des Kontos schon mitfuehrt
  (z. B. `GDDS`, `IVPT`), bleibt drin. Vorher im Bestand pruefen, sonst kippen
  Hash und Regeln.
- **Kartenzahlung** hat keine Gegenpartei-Zeile. Gegenpartei ist der
  Haendlertext vor `//`, beim aelteren Format mit `Folgenr./Verfalld.` der Text
  vor dem ersten `/`.
- **Posten ohne Vorgang**: Nicht nur die Kreditkartenabrechnung, auch
  Bareinzahlungen, Wertpapierabrechnungen und einzelne Gutschriften drucken
  keinen Vorgang; die Zeile beginnt direkt mit der Zweck-Marke. Was danach
  steht, ist Zweck, auch wenn es wie ein Personenname aussieht. `gegenpartei`
  bleibt leer, kein `transaktionstyp`.
- **Abschlussposten im Auszug**: Die Zeile traegt keinen Vorgang, nur „Saldo der
  Abschlussposten". Den `transaktionstyp` (z. B. Habenzinsen) nennt nur der
  separate Kontoabschluss. Liegt der nicht vor, `transaktionstyp` leer lassen
  statt aus frueheren Quartalen fortzuschreiben.
- **Kontoabschluss als eigenes Dokument**: Bei „Saldo der Abschlussposten 0,00"
  gibt es nichts zu buchen, und die Zeile fehlt dann auch im Auszug. Der dort
  genannte Kontosaldo ist derselbe wie der Neue Saldo des Quartalsend-Auszugs und
  kein zusaetzlicher Beleg fuer die Reconciliation.
- **Ersatzzeichen**: Ein `?` statt eines Umlauts im Haendlernamen steht so im PDF.
  Woertlich uebernehmen, nicht korrigieren.

## PDF-Monatsauszug mit Spalten lfd. Nr. / Buchungsdatum / Umsatzinformationen / Wertstellung / Soll / Haben

- **Kopfzeile je Posten**: lfd. Nr., Buchungsdatum, Umsatzart (→
  `transaktionstyp`), Wertstellung, Betrag in der Soll- oder Haben-Spalte (Soll
  mit Minus gedruckt).
- **Folgezeilen**: Die erste Textzeile ist der `verwendungszweck`. Eine rein
  numerische SEPA-Referenz geht nach `kundenreferenz`, nicht nach
  `bank_referenz`: sie bleibt ueber Monate gleich. Die Namenszeile direkt vor der
  Zeile „BIC … IBAN …" ist die `gegenpartei`.
- **IBAN-Zeile**: Bei Belastungen nennt sie den Empfaenger (→ `empfaenger_iban`),
  bei Gutschriften den Absender. Den Absender **nicht** nach `empfaenger_iban`
  (Konvention bei der Feldtabelle oben).
- **„Rechnungsabschluss <Datum>"**: Das unterstrichene Band ist die Ueberschrift
  der folgenden Zinsbuchung, kein Buchungstext. Ein Monatsauszug ohne Bewegung
  kann nur aus dieser Zinsbuchung bestehen.
- **Saldokette** ueber Auszugsnummer und „letzter Auszug vom": Alter Kontostand =
  Neuer Kontostand des Vorauszugs. Fehlen Vorauszuege (Sprung in der
  Auszugsnummer oder „letzter Auszug vom" juenger als der Bestand), ist der Neue
  Kontostand **nicht** als Anker schreibbar, auch wenn der Auszug in sich aufgeht.
- **Freistellungsblock** („Gesamtzinsertraege"): Er summiert alle Konten des
  Kunden bei dieser Bank. Steigt er staerker als die Habenzinsen des Auszugs, hat
  ein anderes Konto derselben Bank Zinsen gutgeschrieben, ein Hinweis auf eine
  Festgeld-Rueckzahlung. Festgeld bekommt nie ein eigenes Konto
  (Nutzerentscheidung): Anlage und Rueckzahlung laufen ueber das Tagesgeldkonto
  auf `KAT-010`, mit `bemerkung`.

## Broker-Kontoauszug mit Kontouebersicht und Barmitteluebersicht

- **Datum** im Format „DD Monat YYYY" mit abgekuerzten Monaten (Aug., Sept.,
  Okt.). Im Textvorlauf steht das Jahr oft in der Zeile unter Tag und Monat, und
  die Beschreibung umschliesst die TYP-Zeile. Beide Teile mit Leerzeichen
  verbinden.
- **Geldmarktfonds-Kaeufe und -Verkaeufe** in der Transaktionsuebersicht sind
  Umschichtungen innerhalb des Cashkontos, keine Buchungen. Nachweis:
  Zahlungseingang und -ausgang der Kontouebersicht sind genau die Summen der
  Umsatzzeilen.
- **Anker**: Der Endsaldo der Kontouebersicht zum Periodenende ist schreibbar,
  wenn die Saldospalte der letzten Umsatzzeile ihn trifft und die
  Barmitteluebersicht (Treuhand plus Fonds) ihn bestaetigt.

## Duplikate und Vollstaendigkeit

- **Erneut heruntergeladene Dokumente**: Der Dateiname traegt oft eine stabile
  Dokument-ID, der Textvorlauf weicht aber im Zeilenlayout ab. Dann findet
  `belege_text` keinen Hash-Treffer. Die Druckkennung im Seitenfuss
  (`<lfd.Nr.> / <Lauf> / <JJJJMMTT>`) ist **nicht** dokumentspezifisch, sie ist
  fuer alle Konten desselben Drucklaufs gleich. Ein Duplikat erst annehmen, wenn
  IBAN, Auszugsnummer bzw. Abrechnungszeitraum, alle Betraege und der Saldo mit
  dem abgelegten Beleg uebereinstimmen; dann `inbox_verwerfen`.
- **Sparkonten ohne Monatsrhythmus**: Ein Auszug entsteht nur bei Bewegung oder
  zum Quartalsabschluss. Datumsluecken zwischen Auszuegen sind keine
  Historienluecken. Die Vollstaendigkeit ueber die je Jahr fortlaufende
  Auszugsnummer und die geschlossene Saldenkette pruefen.
- **Nachgereichter Auszug schliesst eine Luecke**: Wurde ein spaeterer Auszug
  wegen fehlender Vorgaenger ohne Anker importiert (`reconciliation_differenz`
  im Log), nach dem Import des fehlenden Auszugs auch den zurueckgehaltenen
  spaeteren Saldo gegen den Bestand rechnen. Geht er cent-genau auf, ihn im
  selben Lauf als Zeitwert schreiben und im Laufeintrag
  `normalisierung.reconciliation_erledigt` setzen (Format in
  `docs/agent-context.md`); erst dann verschwindet die alte Differenz aus dem
  Pruefbericht.
- **Dateiname**: Das Datum im Download-Namen ist nicht verlaesslich das
  Belegdatum. Je nach Bank ist es das Abruf- oder das Auszugsdatum, und Namen mit
  eingebautem Datum (`..._<T_M_JJJJ>.pdf`) treffen den Belegmonat nicht genau.
  Zeitraum bzw. Monat immer aus dem Beleg nehmen (Auszugsnummer, Abrechnungstag,
  Erstellungsdatum im Kopf).
  Manche Banken setzen in den Download-Namen Filial-, Konto- und
  Unterkontonummer hintereinander; das Unterkonto unterscheidet Giro- und
  Sparkonto desselben Kunden. Zugeordnet wird trotzdem nur ueber die IBAN im
  Belegkopf.
- **Vertragsuebersicht aus einem Vermittlerportal**: Browser-Ausdrucke von
  Vertragsdetailseiten (Browserkopf mit Seitentitel und Abrufzeit, Portal-URL im
  Seitenfuss) enthalten keine Buchungen und sind kein Kontoauszug. Nicht
  importieren, sondern ueber die Vertragsnummer dem Vorsorgevertrag zuordnen und
  unter `Belege/Vorsorge/<VS-ID>_.../<Jahr>/` ablegen. Datum im Belegnamen ist
  der „Stand" bzw. das „Datum Rueckkaufswert", nicht die Abrufzeit. Mehrere
  Ausdrucke derselben Sitzung tragen denselben generischen Namen mit Suffix
  (`_2`) und dieselbe Abrufzeit und sind trotzdem verschiedene Vertraege; ein
  Duplikat erst annehmen, wenn Vertragsnummer und Stand uebereinstimmen. Das
  Portalfeld „Rueckkaufswert" ist dort ein generisches Feld (gleich dem
  „Vertragswert") und erscheint auch bei nicht kuendbaren Vertraegen: den Wert
  als Zeitwert `vertragswert` mit `quelle_hinweis` auf den abgelegten Beleg
  erfassen, **nie** als `rueckkaufswert`. Der Rueckkaufswert bleibt der
  Kuendigungsbetrag aus der Standmitteilung des Versicherers.
- **Depot-Screenshot aus einer Banking-App**: Enthaelt keine Buchungen und ist
  kein Kontoauszug. Zuordnung ueber die gezeigte Depotnummer gegen
  `kontoreferenz` bzw. die bestehenden Zeitwerte und Belege des Depotkontos. Den
  Gesamtwert gegen Stueck x Kurs aller Positionen pruefen und nur bei
  centgenauer Summe als `depotwert` (`qualitaet: belegt`) schreiben. Zeigt das
  Bild nur eine Uhrzeit, gilt das Aufnahmedatum aus dem Dateinamen als
  `standdatum`. Felder wie „Kursgewinn/-verlust" ohne bekannten Einstandswert
  ignorieren. Ablage unter
  `Belege/Konten/<KTO-ID>_<Kurzname>/<Jahr>/<Jahr>_<Bank>_Depot_<KTO-ID>_Depotstand_<JJJJ-MM-TT>.png`.
- **Lastschriftbenachrichtigung / Praemienrechnung eines Versicherers**:
  Kuendigt einen kuenftigen SEPA-Einzug an (Zeitraum, Praemie,
  Versicherungsteuer, Gesamt, Mandat, Glaeubiger-ID, maskierte
  Belastungs-IBAN). Keine Buchung und kein Kontoauszug: nicht importieren und
  keinen Zeitwert schreiben. Ablage unter
  `Belege/Versicherungen/<Sparte>_<Versicherer>_<Vertragsnr>/<Jahr des Belegdatums>/`.
  Ein Duplikat erst annehmen, wenn Versicherungszeitraum und Einzugsdatum mit
  dem abgelegten Beleg uebereinstimmen; die Rechnungen der Folgejahre sehen
  fast gleich aus. Der Beleg bestaetigt den Betrag der zugehoerigen
  Regelzahlung; weicht er ab, das im Bericht melden, statt die Regelzahlung
  still zu aendern. Gescannte Rechnungen bringen oft eine eingebettete
  OCR-Textebene mit zerrissenen Zahlen mit (Leerzeichen in Betraegen, „C"
  statt „€"): Praemie + Steuer = Gesamt nachrechnen, bevor ein Wert
  uebernommen wird.

## Belege benennen und ablegen

Gilt fuer **alle** Belege (Kontoauszuege wie sonstige Informationsbelege). Eingescannte Briefe und Mail-Anhaenge haben unklare oder immer gleiche Namen — deshalb beim Wegsortieren **immer** umbenennen, sodass der Beleg ohne Oeffnen verstaendlich ist.

Schema: `<Entitaet/Konto>_<Quelle/Gesellschaft>_<Belegart>_<Datum oder Zeitraum>.<ext>`

Beispiele:
- `TESTREF-062.csv`
- `Riester_MusterversicherungA_Vertragsstand_2026-01-01.pdf`
- `KFZ_MusterversicherungB_Beitragsrechnung_2026.pdf`

Ablage in `Belege/` nach Objekt, darunter je Jahr, z. B. `Belege/Konten/KTO-001_Bank-Giro/2026/`
oder `Belege/Darlehen/DAR-001_Bank-Baufinanzierung/2025/`. Die vollstaendige
Regel steht in `agent-context.md`, Abschnitt „Ablage nach Objekt".

Zu jedem abgelegten PDF und Foto (png/jpg/jpeg) gehoert ein **Textzwilling**
mit gleichem Basisname und Endung `.txt` im selben Ordner; Fotos und Bildscans
bekommen ihn per OCR. Fotos behalten ihre Endung (`beleg_ablegen` verlangt
dieselbe), z. B. `Quittung_Musterladen_2026-10-01.jpg`. `belege_text` zeigt die Vorschau,
mit `schreiben: true` wendet es sie an. Der Lauf ist idempotent und
ueberschreibt nie einen vorhandenen Zwilling.

## Do's

- Validator vor jedem Schreiben aufrufen.
- Bei Unsicherheit (Konto, Datum, Betrag, Gegenpartei) lieber im Dialog fragen oder in `error/` legen — niemals raten.
- Den Stand am Ende eines Laufs als kurze Zusammenfassung in den Chat schreiben (importiert: X, offen: Y, Fehler: Z).
- Bei einem geklaerten Fehler aus `error/` die Datei zuruck nach `data/inbox/` schieben und den Lauf nochmal starten.
- Beim ersten Import einer neuen Bank pruefen, ob `bank_referenz` (Buchungsnummer) ueber Re-Exports stabil bleibt. Wenn nicht: Feld weglassen, damit der Freitext-Hash greift (zweistufiger Dedupe-Hash aus `docs/agent-context.md`).

## Don'ts

- **Keine bankspezifischen Parser bauen.** Wenn die Normalisierung muehsam ist, fragen, nicht Code schreiben.
- **Nichts schreiben ohne Hash-Check** — Duplikate sind tabu.
- **Keine Kategorie raten**, die nicht aus dem Categorizer kommt. Wenn du eine Buchung „eigentlich klar" findest und keine Regel matcht, dem Nutzer vorschlagen, eine Regel anzulegen — nicht still die Kategorie setzen.
- **Keine Regeln automatisch anlegen**, auch wenn du sie sinnvoll findest. Regel-Pflege ist ein eigener Dialogschritt.
- **Keine Transaktion „ablehnen"**. Eine Bankbuchung ist eine Tatsache. Wenn etwas nicht eingespielt werden kann, ist das ein Importfehler in `error/`, keine Ablehnung.
- **Konten anlegen, aber nie erfinden.** Ein unbekanntes Konto wird aus der Kontoreferenz der Rohdatei angelegt und im Bericht genannt (siehe Schritt 2). Laesst sich die Referenz nicht zuverlaessig lesen, gehen die Zeilen in `error/` — nie ein Konto aus einer geratenen Referenz anlegen.

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
| `data/inbox/standardized/` | Normalisierte Zwischenform, Durchgangsstation |
| `data/inbox/processed/` | Erfolgreich verarbeitete Rohdateien |
| `data/inbox/error/` | Fehlgeschlagene Importe + Begleitdatei |
| `DATENROOT/transaktionen.jsonl` | Finale Transaktionen |
| `DATENROOT/transfers.json` | Transfer-Paarungen |
| `DATENROOT/konten.json` | Konten-Stammdaten (fuer Zuordnung) |
| `DATENROOT/kategorisierungsregeln.json` | Regeln fuer Categorizer |
| `DATENROOT/agent_log.jsonl` | Lauf-Protokoll fuer Uebergabe |
| `schemas/` | JSON Schemas zur Validierung |
| `tools/validator.mjs` | Deterministischer Validator |
| `tools/import.mjs` | Import-Pipeline `runImport` + CLI |
| `tools/dedupe.mjs` | Deterministischer Dedupe-Hash |
| `tools/categorizer.mjs` | Deterministischer Categorizer |
| `tools/transfer-matcher.mjs` | Deterministischer Transfer-Matcher |
| `tools/import-format.mjs` | Validierung des standardisierten Importformats |
| `tools/inbox.mjs` | Kompletter Inbox-Lauf (`npm run inbox`) |
| `tools/normalize.mjs` | CSV per Profil ins Importformat normalisieren |
| `data/import-profile/` | Bank-Profile (Spaltenzuordnung), Vertrag in `schemas/importprofil.schema.json` |

## Verwandte Skills und Anschlussprozesse

- **kategorisierungsregel-pflege** — neue Regel anlegen oder bestehende anpassen.
- **regelzahlung-agent** (`docs/skills/regelzahlung-agent.md`) — wiederkehrende Buchungen als Regelzahlungen erkennen, vorschlagen, bestätigen.
- **belegextraktion** (ab M5/M7) — Belege, Vertraege, Versicherungspolicen lesen.

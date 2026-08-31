# Agent Context

Gemeinsame Betriebsgrundlage fuer Agentenarbeit im deploybaren App-Raum.

## App-Raum

Der fuehrende Betriebsraum ist `app/`. Alle produktiven Pfade in Agenten-Skills
sind app-relativ:

- `DATENROOT/...` fuer den aktiven Datenbestand.
- `data/inbox/...` fuer Import-Eingang, Zwischenstaende, verarbeitete Dateien und Fehler.
- `schemas/...` fuer Datenvertraege.
- `tools/...` fuer deterministische Betriebstools.
- `Belege/...` fuer abgelegte Quellen und Rohdokumente.
- `docs/skills/...` fuer workflow-spezifische Betriebsanweisungen.

Die App liest Daten, validiert und zeigt Arbeitsstaende. Sie schreibt keine
Masterdaten. Schreibende Aenderungen laufen ueber Agenten und Betriebstools.

## Datenmodus-Startcheck

Vor jeder Agentenarbeit muss der aktive Datenmodus ausdruecklich feststehen:

- `DATENMODUS: live` bedeutet `DATENROOT = data/master`.
- `DATENMODUS: demo` bedeutet `DATENROOT = data/demo`.

Der Wert kommt aus dem App-Prompt oder aus einer ausdruecklichen Nutzeranweisung.
Fehlt `DATENMODUS` oder `DATENROOT`, gilt **Abbruch statt Raten**: keine Analyse mit
Schreibabsicht, kein Tool mit Default-Pfad, keine Datei-Aenderung. Der Agent fragt
dann zuerst nach, ob er auf Echtdaten (`data/master`) oder Demodaten (`data/demo`)
arbeiten soll.

Vor jedem Schreibzugriff prueft der Agent den Zielpfad sichtbar gegen `DATENROOT`.
Ein Schreibziel ausserhalb von `DATENROOT` ist ein Fehler und wird nicht ausgefuehrt.
Wenn eine Skill-Anweisung feste Datenpfade nennt, ist immer der aktive `DATENROOT`
massgeblich.

## Arbeitsprinzipien

- Agenten schreiben nur gegen Schemas und nach Validierung.
- Tools rechnen deterministisch; Agenten rufen Tools auf und interpretieren deren
  Bericht.
- Keine stille finale Fachentscheidung: unsichere Fakten bleiben offen oder werden
  dem Nutzer als Vorschlag vorgelegt.
- Nutzerentscheidungen und Agentenvorschlaege bleiben getrennt.
- Nach jedem schreibenden Lauf wird der Validator ausgefuehrt.
- Jeder schreibende Lauf wird in `DATENROOT/agent_log.jsonl` mit Zaehlern,
  betroffenen IDs und kurzer Notiz protokolliert.

## Statuslogik

Statuswerte sind entitaetsspezifisch. Fuer `kategorisierung_status` an
Transaktionen gilt:

- `offen`: keine eindeutige Kategorie aus dem Regelwerk; kein `kategorie_id`.
- `vorgeschlagen`: ein Tool oder Agentenprozess hat einen Vorschlag erzeugt; der
  Nutzer muss bestaetigen, korrigieren oder ablehnen.
- `bestaetigt`: die Kategorie ist fachlich bestaetigt.
- `abgelehnt`: ein Vorschlag wurde bewusst verworfen und bleibt unangetastet.

Fuer Regelzahlungen gilt analog:

- `vorgeschlagen`: wartet auf Nutzerentscheidung und wirkt nicht auf die Prognose.
- `bestaetigt`: wirkt auf die Liquiditaetsprognose.
- `abgelehnt`: bewusst verworfen.

## Transaktions-ID und Deduplikation

`transaktion_id` ist eine opake ID im Format `TXN-<uuid>`. Sie enthaelt keine
Datums-, Konto- oder Sequenzbedeutung.

Jede Transaktion hat einen `dedupe_hash`. Wenn die Bank eine eindeutige
`bank_referenz` liefert, basiert der Hash auf `(konto_id, bank_referenz)`. Fehlt
`bank_referenz` oder ist sie nicht verwendbar, basiert der Hash auf `(konto_id,
buchungsdatum, betrag, gegenpartei, verwendungszweck)`.

Freitextfelder werden fuer den Hash nur leicht normalisiert: trimmen und
Whitespace kollabieren. Keine Kleinschreibung, kein Entfernen von Sonderzeichen.

`bank_referenz` wird nur als Schluessel genutzt, wenn sie im Importlauf dateiweit
eindeutig ist. Andernfalls faellt der Import auf den Freitext-Hash zurueck und
persistiert keine irrefuehrenden nicht-eindeutigen Referenzen als Schluesselmaterial.

Dedupe prueft gegen den bestehenden Bestand, nicht innerhalb desselben Auszugs.
Gleich aussehende Zeilen in einem amtlichen Auszug sind reale Buchungen und
bekommen deterministisch disambiguierte Hashes.

## Kategorisierung und Herkunft

Eine tatsächliche Buchung kann optional `regelzahlung_id` tragen. Das bedeutet:
Diese Buchung erfüllt genau diese erwartete Regelzahlung. Die Zuordnung wird nur
nach Beleg- oder Nutzerklärung gesetzt; bei Unsicherheit bleibt das Feld weg.
Ein Vorsorgebezug wird über `Transaktion → Regelzahlung → Vorsorge` abgeleitet.

A posted transaction may optionally carry `regelzahlung_id`. This means that the
transaction fulfils exactly that expected recurring payment. Set the assignment
only from documentation or a user decision; leave the field unset when uncertain.
Derive a retirement-provision relationship through
`Transaktion → Regelzahlung → Vorsorge` only.

Eine Transaktion kann optional ueber `immobilie_id` genau einer Immobilie
zugeordnet sein; eine Immobilie kann viele Transaktionen haben. Die Zuordnung ist
direkt und wird nur aus einem eindeutigen Beleg oder einer Nutzerentscheidung
gesetzt. Kategorie, Gegenpartei, Adresse und Buchungstext duerfen einen
Pruefkandidaten sichtbar machen, sind allein aber kein Zuordnungsanker. Ein
fehlendes `immobilie_id` bedeutet nur, dass keine Zuordnung gespeichert ist; es
entsteht kein zusaetzlicher Review-, Audit- oder Historienstatus.

Eine Transaktion kann eine Kategorie aus drei Herkuenften haben:

- `kategorie_herkunft = regel`: Kategorie stammt aus dem deterministischen
  Regelwerk.
- `kategorie_herkunft = agent`: Kategorie stammt aus einem plausiblen
  Einzelvorschlag des Agenten ohne Regel.
- `kategorie_herkunft = manuell`: Kategorie stammt aus einer ausdruecklichen
  Nutzerentscheidung im Agentendialog.

Der Agent darf offene Einzelbuchungen eigenstaendig als `vorgeschlagen` mit
`kategorie_herkunft = agent` vorbereiten. Das ist keine finale Fachentscheidung,
sondern Review-Vorbereitung; Bestaetigung, Korrektur oder Ablehnung bleiben
Nutzerentscheidung.

### Belegpflicht statt Ratepflicht

Der Agent darf den Offen-Stapel eigenstaendig verregeln und vorschlagen — der
Review ist der Ort der Entscheidung, nicht ein Gate davor. Das entbindet ihn
**nicht** vom Beleg: Jeder Vorschlag stuetzt sich auf eine benennbare Quelle
(Beleg im Archiv, identischer Merchant im Bestand, Merchant-Identitaet im
Buchungstext, Recherche zum Merchant). **Ort, Rechtsform, Betragshoehe,
Zeitraum und blosse Wortueberlappung mit anderen Buchungen sind keine Quellen.**

Traegt keine Quelle, ist der ehrliche Vorschlag `KAT-012` „Noch zu klaeren" als
Agenten-Einzelvorschlag — nicht die plausibelste Sachkategorie. `KAT-012` heisst
hier genau das, was draufsteht, und macht die Buchung im Review sichtbar, statt
sie unbemerkt auf `offen` liegen zu lassen. Die Belegstufe gehoert in den
Regel-`kommentar` bzw. in die Review-Uebergabe, damit im Review erkennbar ist,
wo genau hingesehen werden muss.

Davon unberuehrt sind die technischen Eroeffnungsbuchungen weiter unten: die
tragen `KAT-012` als bestaetigte Nutzerentscheidung und sind an
`transaktionstyp = "Startzustand"` erkennbar.

Nach-Kategorisierung bewertet offene Transaktionen und regelbasierte Eintraege neu.
Agenten-Einzelvorschlaege, manuelle Kategorien und abgelehnte Vorschlaege bleiben
unangetastet. Widerspricht ein neuer Regelstand einer bestaetigten regelbasierten
Kategorie, wird die Transaktion als Wiedervorlage sichtbar gemacht statt still
ueberschrieben.

Bei Bestaetigung bleibt die Herkunft erhalten: `regel` bleibt `regel`, `agent`
bleibt `agent`. Nur wenn der Nutzer eine andere Kategorie nennt oder direkt eine
Kategorie diktiert, wird `kategorie_herkunft = manuell` gesetzt.

**Regel und `manuell` schliessen sich aus.** Gibt es eine aktive Regel, die die
Buchung trifft und **dieselbe** Kategorie liefert, ist die Herkunft `regel` (mit
`matched_regeln`) — nicht `manuell`. Eine Buchung gleichzeitig per Regel abzudecken
*und* `manuell` zu markieren ist ein Fehler: die Buchung zaehlte sonst nie zur Regel
und die Regel erschiene faelschlich als „greift nie". `manuell` ist den Faellen
vorbehalten, in denen die Nutzer-Kategorie **von jeder Regel abweicht** (bewusste
Uebersteuerung) oder bewusst kein Regelfall entsteht.

### matched_regeln — Provenance-Feld

Transaktionen koennen ein optionales Feld `matched_regeln: ["REG-…", …]` tragen.
Es enthaelt die IDs aller Regeln, die beim Kategorisierungslauf auf die Buchung
gepasst haben. Das Feld wird **beim Import oder bei der Nach-Kategorisierung
geschrieben**, nicht nachtraeglich aus dem aktuellen Regelwerk berechnet.

**Invariante:**

- `matched_regeln` ist **immer vorhanden** bei `kategorie_herkunft = regel`
  (eindeutiger Treffer) und bei `kategorisierung_status = offen` mit
  mindestens einem Treffer (Regelkonflikt: mehrere Regeln haben gepasst, aber
  keine eindeutige Kategorie ergab sich).
- Ein Konflikt ist **ableitbar** aus `status = offen` + nicht leerem
  `matched_regeln`.
- `matched_regeln` ist **niemals vorhanden** bei `kategorie_herkunft = manuell`,
  `kategorie_herkunft = agent` oder `kategorisierung_status = abgelehnt`.
- Die IDs in `matched_regeln` muessen in `DATENROOT/kategorisierungsregeln.json`
  existieren; der Validator prueft dies.

Qualitaet von Agenten-Einzelvorschlaegen wird ueber strukturierte Zaehler im
`agent_log.jsonl` beobachtet, nicht ueber ein Historienfeld an der Transaktion.
Wenn ein Agenten-Vorschlag korrigiert wird, zaehlt der Review-Lauf diese
Korrektur; die Transaktion selbst traegt danach nur den fachlichen Zielzustand.

Nach-Kategorisierung laeuft ueber `tools/recategorize.mjs`. Reimport ist kein Mittel
zur Nach-Kategorisierung, weil bekannte Buchungen per Dedupe uebersprungen werden.

## Validierung und Tools

Validierung ist deterministischer Code. Agenten fuehren Validierung aus, statt
Strukturregeln frei zu interpretieren.

Wichtige Tools:

- `tools/validator.mjs`: Masterdaten pruefen.
- `tools/inbox.mjs`: kompletter Inbox-Lauf (Profil zuordnen, CSV normalisieren,
  importieren, Datei verschieben, protokollieren). `npm run inbox` ist die Vorschau.
- `tools/normalize.mjs`: CSV per Bank-Profil ins Importformat normalisieren.
- `tools/import.mjs`: normalisierte Buchungen importieren.
- `tools/confirm.mjs`: Kategorie-Entscheidungen auf einen gefilterten Schnitt anwenden.
- `tools/agent-vorschlag.mjs`: Agenten-Einzelvorschlaege setzen (`vorgeschlagen` mit
  `kategorie_herkunft = agent`). Bewusst getrennt von `confirm.mjs`: das ist der
  menschliche Entscheidungskanal und schreibt immer `bestaetigt`.
- `tools/regel-vorschlag.mjs`: offenen Rueckstand zu Regelkandidaten buendeln.
- `tools/regel-probelauf.mjs`: Regelkandidaten gegen den Gesamtbestand rechnen,
  **bevor** etwas geschrieben wird. Blockiert mit Exit-Code 2 bei Strukturfehlern,
  neuen Regelkonflikten und Wiedervorlagen.
- `tools/dedupe.mjs`: Transaktions-Dedupe-Hash bilden.
- `tools/categorizer.mjs`: Kategorisierungsregeln anwenden.
- `tools/recategorize.mjs`: Bestand nach Regelaenderungen neu bewerten.
- `tools/freigabe.mjs`: vorgeschlagene Buchungen automatisch bestaetigen, soweit
  ihre Regel das Gate besteht (aktiv, Kommentar, `belegstufe` E1-E4 und nicht
  gesperrt, Muster spezifisch). Schreibt `bestaetigt_durch = auto`.
  `npm run freigabe` ist die Vorschau.
- `tools/pruefbericht.mjs`: Nachkontrolle nach einem Durchlauf — groesste
  Auto-Freigaben, Merchants ohne jede menschliche Bestaetigung,
  Kategorie-Ausreisser, alle auto-freigegebenen `KAT-012`, am Gate gescheiterte
  Regeln, E4-Regeln, Konten ohne Anker. Rein lesend, blockiert nie.
- `tools/lernen.mjs`: wertet `agent_log.jsonl` aus — Korrekturquote je Regel und
  je Belegstufe, Gate-Durchfall nach Grund. Mit `--anwenden` legt es Regeln
  ueber der Korrekturquote still (danach `recategorize.mjs`); es aendert nur
  den Status von Regeln, nie eine Transaktion. `npm run lernen` ist die
  Vorschau.
- `tools/migrate-bestaetigt-durch.mjs`: einmalige Migration — bestaetigte Buchungen
  ohne `bestaetigt_durch` bekommen `mensch`. Konservativ: sie bleiben damit vor
  Regellaeufen geschuetzt wie vor Einfuehrung des Feldes.
- `tools/migrate-belegstufe.mjs`: einmalige Migration — leitet `belegstufe = E2`
  dort ab, wo der Bestand sie **beweist**: alle menschlich bestaetigten Treffer
  des Musters tragen die Kategorie der Regel. Regeln mit Widerspruch oder ohne
  menschlichen Treffer bleiben ohne Stufe und geben nichts automatisch frei.
- `tools/transaktion-immobilie.mjs`: einen belegten oder vom Nutzer
  entschiedenen Immobilienbezug fuer explizite Transaktions-IDs setzen,
  entfernen oder bewusst ersetzen.
- `tools/transfer-matcher.mjs`: interne Transfers paaren — als Lauf ueber den
  **Bestand** (`npm run transfers`), nicht nur waehrend eines Imports. Nach einem
  neu angelegten Konto nachziehen, sonst bleiben dessen Gegenbuchungen ungepaart.
- `tools/belege-text.mjs`: Textzwilling (`.txt`) je PDF unter `Belege/` erzeugen
  und `data/inbox/standardized/` per Inhalts-Hash aufraeumen. `npm run belege:text`
  ist die Vorschau.

### Auto-Match von Transfers: zwei Wege

Ein Paar entsteht automatisch bei invertiertem Betrag **und** beiden Konten im
Modell **und** Datumsdifferenz ≤ 3 Tage **und** *einem* der beiden folgenden
Signale:

1. `verwendungszweck` nach Normalisierung identisch, **oder**
2. `empfaenger_iban` der einen Seite ist die `kontoreferenz` des Gegenkontos.

Weg 2 ist noetig, weil zwei Banken denselben Uebertrag unterschiedlich betexten
(die eine haengt Name/BIC/IBAN an, die andere schreibt nur „Uebertrag") — dann
kann Weg 1 systematisch nie greifen. Die IBAN-Kopplung ist strukturell und damit
das staerkere Signal.

Externe Transfers (Bargeld, Familie, Konten ausserhalb des Modells) erkennt das
Tool bewusst nicht — die markiert der Nutzer im Dialog.

### Vorschau ist Default

`inbox.mjs`, `confirm.mjs` und `transfer-matcher.mjs` schreiben **nur** mit `--schreiben`. Ohne das Flag
laufen sie vollstaendig durch und berichten, was passieren wuerde — nichts wird
geschrieben und nichts verschoben. Ein zu breiter Filter ist damit ein Ausdruck
auf der Konsole, kein Datenverlust. Beide Tools sind idempotent: derselbe Lauf
ein zweites Mal aendert nichts.

### Wer darf welche Entscheidung anfassen

- **Automatische Laeufe** (`import.mjs`, `recategorize.mjs`) fassen `bestaetigt`,
  `abgelehnt` und `manuell` nie an.
- **`confirm.mjs`** ist der menschliche Kanal und darf eine fruehere Entscheidung
  korrigieren — aber nur mit ausdruecklichem `--auch-entschiedene`. Ohne das Flag
  ueberspringt es entschiedene Buchungen und zaehlt sie als `uebersprungen`.

### Import-Profile

Eine Bank-CSV wird ueber ein Profil in `data/import-profile/<profil_id>.json`
(Vertrag: `schemas/importprofil.schema.json`) deterministisch normalisiert. Der
Agent legt das Profil **einmal** beim ersten Import einer Bank an; danach ist der
Import ein Tool-Aufruf. Das ist kein bankspezifischer Parser im Sinn von ADR 0005
— es entsteht kein Code pro Bank, und ein Spaltenwechsel bricht den Lauf sichtbar
ab ("Spalte X nicht in der Datei") statt Werte still falsch zuzuordnen.

PDFs werden **nicht** automatisch in Buchungen zerlegt. `inbox.mjs` legt einen
deterministischen Textvorlauf (`pdftotext -layout`) nach
`data/inbox/standardized/` ab; die Zeilenextraktion bleibt Agentenarbeit.
`standardized/` ist dabei Durchgangsstation, kein Archiv — der dauerhafte
Textzwilling entsteht neben dem Beleg, siehe Abschnitt „Belege".

## Zeitwerte, Anker und Reconciliation

Zeitveraenderliche, beleg- oder schaetzbasierte Werte leben in
`DATENROOT/zeitwerte.jsonl`. Beispiele sind Kontostand, Depotwert, Marktwert und
Restschuld.

Konto-Salden und Darlehen-Restschulden brauchen belegte Ankerpunkte, wenn die
Historie nicht vollstaendig garantiert ist. Laufende Werte werden aus Anker plus
Bewegungen oder Tilgung berechnet. Aufeinanderfolgende belegte Staende werden
reconciled; Abweichungen werden als Checks sichtbar und nicht still korrigiert.

### Startzustandsbuchungen — bewusst KAT-012, kein Review-Fall

Wo die Importhistorie erst nach dem Kontoleben beginnt, traegt eine technische
Eroeffnungsbuchung die Differenz, damit „Summe aller Buchungen ab null" den
belegten Anker trifft. Es gibt aktuell zwei:

| Konto | Datum | Betrag | Herleitung |
| --- | --- | ---: | --- |
| KTO-001 | 2024-01-01 | +1.234,56 | rueckgerechnet aus belegtem Stand 2024-12-30 minus Bewegungssumme |
| KTO-002 | 2023-01-01 | +2.345,67 | direkt belegt aus Auszug 2023-01 (Stand 31.12.2022) |

Beide sind **`bestaetigt` unter `KAT-012` „Noch zu klaeren"** — Nutzerentscheidung
am 2026-08-11, ausdruecklich so gewollt. Fachlich sind sie weder Einnahme noch
Ausgabe, sondern ein Bilanz-Startpunkt.

**Bekannte Nebenwirkung, bewusst in Kauf genommen:** `KAT-012` hat
`typ = ausgabe`; die positiven Betraege mindern daher jede Ausgabensumme, die
stumpf ueber die Kategorie laeuft (zusammen +3.580,23). Auswertungen der
Ausgabenseite muessen `transaktionstyp = "Startzustand"` ausschliessen.

Ein Agent soll das **nicht erneut als Kategorisierungsfehler melden** und die
Buchungen nicht umkategorisieren. Sie sind an `transaktionstyp = "Startzustand"`
und `gegenpartei = "Muster-Gegenpartei-001"` erkennbar.

Darlehen duerfen zusaetzlich Vertragsdaten wie `zinsbindung_bis`, `laufzeit_bis`
und `restschuld_laufzeitende` enthalten. Diese Felder dokumentieren Vertrag bzw.
Erwartung am Laufzeitende; sie sind kein Ersatz fuer den belegten Restschuld-Anker
in `DATENROOT/zeitwerte.jsonl`.

## Regelzahlungen und Prognose

Regelzahlungen beschreiben wiederkehrende erwartete Zahlungen. Nur bestaetigte
Regelzahlungen wirken auf die Liquiditaetsprognose. Einmaleffekte und hypothetische
Szenarien werden nicht als bestaetigte Regelzahlungen modelliert.

Bekannte Stufenaenderungen werden als zwei Regelzahlungen modelliert: die alte mit
`aktiv_bis`, die neue mit eigenem `anker_datum`.

## Vorsorge

Vorsorgeansprueche liegen in `DATENROOT/vorsorge.json` und folgen
`schemas/vorsorge.schema.json`. `art` ist der fachliche Diskriminator, z. B.
`gesetzliche-rente`, `betriebsrente`, `riester`, `rentenversicherung`,
`lebensversicherung` oder `schutzversicherung`. `kapitalbildend = true` bedeutet:
der aktuelle `rueckkaufswert` fliesst als Aktivum ins Nettovermoegen. Nicht
kapitalbildende Ansprueche sind Anwartschaften oder Schutzvertraege und erzeugen
ohne Szenario keine Bilanzposition.

Zeitwerte zu Vorsorge stehen in `DATENROOT/zeitwerte.jsonl` mit
`entitaet = "vorsorge"` und Feldern aus `schemas/zeitwerte.schema.json`:

- `rueckkaufswert`: aktueller verwertbarer Wert kapitalbildender Vorsorge.
- `erwartete_rente`: erwartete monatliche Leistung, als Netto-Wert oder klar
  gekennzeichnete Netto-Schaetzung.
- `erwartete_kapitalleistung`: erwartete einmalige Kapitalleistung.

Laufende Beitraege werden einseitig von `DATENROOT/regelzahlungen.json` aus
verknuepft: `Regelzahlung.vorsorge_id` zeigt auf `vorsorge.vorsorge_id`. Die
Vorsorge-Entitaet traegt keine Rueckliste ihrer Beitraege. Reine
Schutzversicherungen haben normalerweise nur diesen Beitrags-Link und keinen
Rueckkaufswert.

In Szenarien wird die Annahme-Art `vorsorge-leistung` verwendet. Sie verweist auf
`vorsorge_id` und einen Arm (`rente` oder `kapital`). `szenarien.mjs` loest diese
Annahme zur Rechenzeit in vorhandene Primitive auf: Rente wird zu
`regelzahlung-neu`, Kapitalleistung zu `einmalzahlung`; bei kapitalbildender
Vorsorge wird der Rueckkaufswert ueber eine Gegenbuchung abgebaut. Fehlt
`geprueft_am`, deckelt die Engine die Qualitaet auf `offen`.

Vorsorge-Checks werden von `vermoegen.mjs` geliefert und in den
Vermoegens-/Liquiditaetschecks sichtbar:

- `vorsorge-ungeprueft`: kein `geprueft_am`; der Anspruch darf nicht still als
  sicherer Zukunftswert gelten.
- `vorsorge-wiedervorlage`: Pruefung oder juengster Vorsorge-Zeitwert ist zu alt.
- `vorsorge-wechsel`: ein Beitragsende liegt im Wechselhorizont und ein
  Nachfolger fehlt oder schliesst nicht lueckenlos an.

## Szenarien

Szenarien buendeln explizite Annahmen zu einer Was-waere-wenn-Sicht (Liquiditaet,
Restschuld, Nettovermoegen) gegenueber dem validierten Bestand. Sie liegen in
`DATENROOT/szenarien.json`, Annahmen sind eingebettet. Eine Annahme ist
`einmalzahlung`, `regelzahlung-neu`, `regelzahlung-aenderung` oder
`vorsorge-leistung`, je mit `qualitaet ∈ {belegt, geschaetzt, offen}`. Die
Annahme-Art `vorsorge-leistung` (M7) verweist auf eine `vorsorge_id` und einen
`arm ∈ {rente, kapital}` und wird zur Rechenzeit in die Primitive aufgeloest
(siehe Vorsorge-Abschnitt); fehlt `geprueft_am`, deckelt die Engine die Qualitaet
auf `offen`.

Eine `gegenbuchung` koppelt das Cash-Bein einer Annahme an eine zweite Bilanzposition
(`ziel_typ ∈ darlehen|depot|immobilie|vermoegenswert|vorsorge`) und deckt die
Wirk-Faelle Kauf, Verkauf, Sondertilgung, Erbschaft, Schenkung und Vorsorge-Abbau
ab. Sondertilgungen und Depot-Verkaeufe werden effektiv (geklemmt) gerechnet — die
Engine kann nie mehr abtragen oder verkaufen, als die Position hergibt; eine
Position wird pro Szenario nur einmal abgebaut.

Die Engine `szenarien.mjs` ist deterministisch und rechnet live ab dem
Rechenstichtag (nicht ab `stand`); die App schreibt keine Masterdaten — Szenarien
und Annahmen entstehen ausschliesslich ueber den Agenten. Siehe Skill
`szenarien-annahmen` fuer den Erstellungsprozess.

## Belege

Belege werden sprechend benannt und unter `Belege/` abgelegt. Datenfelder wie
`rohquelle` und `quelle_hinweis` zeigen auf den finalen App-relativen Belegpfad.

Jedes PDF unter `Belege/` hat einen **Textzwilling**: gleicher Ordner, gleicher
Basisname, Endung `.txt`. Der Zwilling macht das Archiv durchsuchbar, ohne PDFs
zu oeffnen. Der Normalfall ist rohes `pdftotext -layout`-Ergebnis: nicht von
Hand gepflegt und jederzeit aus dem Beleg wiederherstellbar. Nur Bildscans
weichen davon ab, siehe unten. `tools/belege-text.mjs` erzeugt fehlende
Zwillinge und raeumt danach `data/inbox/standardized/` ab
(`npm run belege:text` fuer die Vorschau, `npm run belege:text:schreiben` zum
Anwenden).
CSVs unter `Belege/` bekommen keinen Zwilling, sie sind bereits Text.

Ein Zwilling ist nie stumm leer. Hat ein PDF keine Textebene, traegt sein
Zwilling die Kopfzeile `# Kein Textlayer — Bildscan, <N> Seiten. Inhalt nur im
PDF.` und erscheint bei jedem Lauf als „OCR ausstehend". Ein leerer Zwilling
waere schlimmer als gar keiner: Die Suche faende nichts, und ein fehlender
Treffer ist von „das Dokument existiert nicht" nicht zu unterscheiden.

Bildscans liest der **Agent beim Import** — er sieht das Dokument dort ohnehin
an, um Kategorie und Namen zu bestimmen. Er schreibt den Zwilling dann selbst,
mit der Kopfzeile `# Vom Agenten aus dem Bildscan gelesen, <JJJJ-MM-TT>.`,
damit die Herkunft in der Datei ablesbar bleibt. Normale Zwillinge tragen
**keine** Kopfzeile: Sie muessen byte-identisch zum Textvorlauf bleiben, sonst
findet das Aufraeumen sie nicht wieder.

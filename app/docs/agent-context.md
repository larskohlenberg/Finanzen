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

Im Betrieb ueber MCP (naechster Abschnitt) legt der Serveraufruf den `DATENROOT`
fest; das Tool `status` nennt ihn. Damit ist der Datenmodus ausdruecklich
festgestellt.

## Betrieb ueber MCP

Ist der MCP-Server `finanzen` (`mcp/server.mjs`, stdio) eingebunden, greifen
Agenten **ausschliesslich** darueber auf die Echtdaten zu, nicht per Shell.
Gestartet wird er lokal (`node app/mcp/server.mjs data/master --recht=schreiben`)
oder per SSH auf einem eigenen Server, wenn die Produktivdaten dort liegen; was
fuer die Installation gilt, steht in ihren Betriebsregeln. Wo ein Skill
`node tools/<x>.mjs DATENROOT` oder `npm run <x>` nennt, ist im Betrieb das
MCP-Tool gemeint; die CLI bleibt fuer die Demodaten und fuer Installationen
ohne MCP.

| CLI | MCP-Tool |
| --- | --- |
| Uebersicht der Web-App | `kennzahlen` (dieselben Kennzahlen wie die Uebersicht, frisch gerechnet; optional `stichtag`; erste Wahl fuer "Wie stehen wir?"; listet auch die anstehenden Fristen aus `anstehendeFristen`) |
| Fristen anlegen, abhaken | `datei_lesen` / `datei_ersetzen` auf `DATENROOT/fristen.json` (kein eigenes Tool; Validator laeuft danach) |
| `tools/neuer-bestand.mjs` | — (nur CLI: legt einmalig einen leeren Datenbestand mit Grundkategorien an, bevor es einen MCP-Server gibt) |
| `tools/validator.mjs` | `status` (Validator-Ergebnis mit Fehlern; laeuft ausserdem nach jedem Schreiben) |
| `tools/inbox.mjs` | `inbox` |
| `tools/import.mjs` | `import` (Vorschau gegen eine Kopie des Datenroots) |
| `tools/regel-vorschlag.mjs` | `regel_vorschlag` |
| `tools/regel-probelauf.mjs` | `regel_probelauf` (Kandidaten direkt als Liste) |
| `tools/recategorize.mjs` | `nachkategorisieren` (Vorschau gegen eine Kopie) |
| `tools/agent-vorschlag.mjs` | `agent_vorschlag` |
| `tools/confirm.mjs` | `bestaetigen` |
| `tools/transaktion-immobilie.mjs` | `immobilienbezug` |
| `tools/transfer-matcher.mjs` | `transfers` |
| `tools/regelzahlung-matcher.mjs` | `regelzahlungen_zuordnen` (`details: true` listet jede Zuordnung) |
| `tools/logos.mjs` | `logos` (ohne `eintraege` ein Bericht; mit `eintraege: [{ name, domain, muster }]` Abruf beim Logodienst; mit `bild` + `quelle` je Eintrag ein mitgebrachtes Bild, mit `datei` eine Bilddatei unter `data/` oder `Belege/`) |
| `tools/freigabe.mjs` | `freigabe` |
| `tools/lernen.mjs` | `lernen` (`schreiben: true` = `--anwenden`) |
| `tools/belege-text.mjs` | `belege_text` |
| `tools/belege-umziehen.mjs` | `belege_umziehen` (Umzugsplan als Liste `umzuege` oder `plan_datei` unter `data/`) |
| `tools/pruefbericht.mjs` | `pruefbericht` |
| Datei lesen, suchen | `datei_lesen`, `dateien_suchen`, `transaktionen_abfragen` |
| Datei schreiben, editieren | `datei_schreiben`, `datei_ersetzen` (nur unter `data/`) |
| Beleg wegsortieren | `beleg_ablegen` (`data/inbox/...` nach `Belege/...`, sprechend benannt) |
| Sammelscan teilen | `beleg_teilen` (`quelle` unter `data/inbox/`, `teile` als `[{ seiten: "1-4", name }]`; jede Seite genau einem Teil, Teile in die Inbox-Wurzel, Original in den Papierkorb; Vorschau ist Default) |
| Nachgereichte Seiten einfuegen | `beleg_ergaenzen` (`quelle` PDF unter `data/inbox/`, `ziel` PDF unter `Belege/`, optional `nach_seite`, 0 = vorn, ohne = ans Ende; alte Fassung samt Zwilling und Quelle in den Papierkorb, danach `belege_text`; Vorschau ist Default) |
| Inbox-Datei verwerfen | `inbox_verwerfen` (`pfad` unter `data/inbox/`, optional `grund`; verschiebt in den Papierkorb, z. B. ein erkanntes Duplikat) |
| Aus `error/` zurueckholen | `inbox_zurueckholen` (`pfad` unter `data/inbox/error/`; zurueck in die Inbox-Wurzel, bricht bei gleichem Namen ab) |

Alle Tool-Laeufe sind ohne `schreiben: true` eine Vorschau. Skills stehen als
MCP-Prompts bereit, dieses Dokument als Resource `finanzen://docs/agent-context`.
Pflichtlektuere ist beides nur vor Datenarbeit (Import, Kategorisieren, Regeln,
Freigabe, Schreiben); Auswertungen und Statusfragen gehen direkt ans Tool.

- **Rechte je Schluessel:** `--recht=lesen` erlaubt nur Lese-Tools und
  Vorschau-Laeufe; `--recht=schreiben` zusaetzlich `schreiben: true`,
  `datei_schreiben`, `datei_ersetzen`, `beleg_ablegen`, `beleg_teilen`,
  `beleg_ergaenzen`, `inbox_verwerfen` und `inbox_zurueckholen`.
- **Papierkorb statt Loeschen:** `inbox_verwerfen` loescht nie, sondern
  verschiebt nach `data/papierkorb/<JJJJ-MM-TT>/` und behaelt die Unterstruktur
  unterhalb von `data/inbox/` (`error/`, `standardized/`, `processed/`). Mit
  wandern der `.txt`-Zwilling daneben, der Textvorlauf in `standardized/` und
  die Fehlernotiz `<name>.fehler.txt`. Bei gleichem Namen bekommt die Gruppe ein
  Suffix (`-2`, `-3`, ...); ueberschrieben wird nie. `grund` landet als `notiz`
  einer Zeile mit `anlass: "inbox-verwerfen"` in `agent_log.jsonl`. Endgueltig
  leeren ist bewusst kein Tool, das macht der Nutzer selbst
  (`rm -r app/data/papierkorb/<datum>` im Checkout, auf einem Server dort).
- **Rollback:** Vor jedem schreibenden Vorgang kopiert der Server den
  `DATENROOT`; meldet der Validator danach neue Fehler, spielt er die Kopie
  zurueck und meldet das. Verschiebungen und Loeschungen in `data/inbox/`,
  `data/papierkorb/` und `Belege/` werden **nicht** zurueckgerollt.
- **Einbindung:** Claude Code liest `.mcp.json` (gitignored, Vorlage
  `.mcp.json.beispiel` fuer den lokalen Start). Codex: in `~/.codex/config.toml`
  `[mcp_servers.finanzen]` mit `command` und `args` wie in der Vorlage. Liegen
  die Daten auf einem Server, startet der Client stattdessen `ssh <alias>` und
  der Forced Command (unten) den Server dort.
  Lokal gegen die Demodaten: `npm run --silent mcp:demo` (ohne `--silent`
  schreibt npm eine Kopfzeile auf stdout und bricht das Protokoll).
- **Forced Command:** Jeder Agent bekommt einen eigenen Schluessel in
  `authorized_keys` des fachlichen Benutzers; der Eintrag bestimmt Befehl und
  Recht, `SSH_ORIGINAL_COMMAND` wird ignoriert:

  ```
  restrict,command="<node> <checkout>/app/mcp/server.mjs data/master --recht=schreiben" ssh-ed25519 <schluessel> claude-code
  restrict,command="<node> <checkout>/app/mcp/server.mjs data/master --recht=lesen" ssh-ed25519 <schluessel> codex
  ```

## Arbeitsprinzipien

- Agenten schreiben nur gegen Schemas und nach Validierung.
- Tools rechnen deterministisch; Agenten rufen Tools auf und interpretieren deren
  Bericht.
- Keine stille finale Fachentscheidung: unsichere Fakten bleiben offen oder werden
  dem Nutzer als Vorschlag vorgelegt. Ausnahme Kategorien: eine Schaetzung des
  Agenten wird freigegeben, bleibt aber an `kategorie_herkunft = agent`
  erkennbar und steht im Pruefbericht.
- Nutzerentscheidungen und Agentenvorschlaege bleiben getrennt.
- Nach jedem schreibenden Lauf wird der Validator ausgefuehrt.
- Jeder schreibende Lauf wird in `DATENROOT/agent_log.jsonl` mit Zaehlern,
  betroffenen IDs und kurzer Notiz protokolliert.

## Statuslogik

Statuswerte sind entitaetsspezifisch. Fuer `kategorisierung_status` an
Transaktionen gilt:

- `offen`: keine eindeutige Kategorie aus dem Regelwerk; kein `kategorie_id`.
- `vorgeschlagen`: ein Tool oder Agentenprozess hat einen Vorschlag erzeugt; das
  Gate (`tools/freigabe.mjs`) gibt ihn frei oder haelt ihn zurueck. Korrigieren
  oder ablehnen kann der Nutzer jederzeit, auch nach der Freigabe.
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
Diese Buchung erfüllt genau diese erwartete Regelzahlung. Gesetzt wird das Feld
vom Tool `regelzahlung-matcher.mjs` (siehe „Zuordnung zu Regelzahlungen“) oder
nach Beleg- bzw. Nutzerklärung; bei Unsicherheit bleibt es weg. Nie allein aus
Betragsgleichheit oder ähnlicher Gegenpartei zuordnen.
Ein Vorsorgebezug wird über `Transaktion → Regelzahlung → Vorsorge` abgeleitet.

A posted transaction may optionally carry `regelzahlung_id`. This means that the
transaction fulfils exactly that expected recurring payment. The field is set by
`regelzahlung-matcher.mjs` or from documentation or a user decision; leave it
unset when uncertain. Never infer it from an equal amount or a similar
counterparty alone. Derive a retirement-provision relationship through
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

Der Agent setzt offene Einzelbuchungen eigenstaendig als `vorgeschlagen` mit
`kategorie_herkunft = agent`; das Gate gibt sie ohne weitere Pruefung frei.
Korrektur bleibt Nutzerentscheidung — nachtraeglich, nicht vorab.

### Beleg fuer Regeln, Schaetzung fuer Einzelbuchungen

Der Agent verregelt und kategorisiert den Offen-Stapel eigenstaendig; danach
ist nichts mehr `offen`. Dabei gelten zwei Massstaebe:

- **Regeln brauchen einen Beleg** (Belegstufe E1–E4: Beleg im Archiv,
  identischer Merchant mit menschlicher Entscheidung im Bestand,
  Merchant-Identitaet im Buchungstext, Recherche zum Merchant). **Ort,
  Rechtsform, Betragshoehe, Zeitraum und blosse Wortueberlappung mit anderen
  Buchungen sind keine Belege.**
- **Einzelbuchungen ohne Beleg schaetzt der Agent**: plausibelste
  Sachkategorie als Agenten-Einzelvorschlag, nach kurzer Recherche. Aus einer
  Schaetzung entsteht nie eine Regel. `KAT-012` „Noch zu klaeren" nur, wenn
  wirklich keine Kategorie plausibel ist.

Korrigiert der Nutzer eine Agenten-Buchung, ist das eine menschliche
Entscheidung (`bestaetigt_durch = mensch`) und damit Beleg E2 fuer eine
kuenftige Regel zum selben Merchant. Den Weg dorthin zeigt der Herkunftsfilter
der Transaktionsansicht.

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

### Belegstufe ist an das Konto gebunden, auf dem sie verdient wurde

`belegstufe` bewertet die Beleglage **zum Zeitpunkt der Regelanlage** — nicht
die Frage, ob dieser Beleg noch deckt, was die Regel **heute** erreicht. Trifft
eine Regel nach einem Import erstmals ein Konto, auf dem niemand ihre Kategorie
je entschieden hat, waehrend sie auf einem anderen von ihr getroffenen Konto
einen solchen Anker hat, ist die Stufe dorthin **verliehen** statt verdient.
Das Gate haelt diese Buchungen mit dem Grund `anker` zurueck (ADR 0027).

Anker ist eine Buchung mit `bestaetigt_durch = "mensch"` oder
`kategorie_herkunft = "manuell"` und der Kategorie der Regel **auf diesem
Konto**. Eine Auto-Freigabe ist kein Anker — sie ist das, was hier geprueft
wird.

Aufloesen laesst sich das auf zwei Wegen, beide legitim:

- Die Buchungen auf dem neuen Konto ansehen und per `confirm.mjs` entscheiden.
  Damit entsteht der Anker, und die Regel gibt dort kuenftig frei.
- Das Muster schaerfen, wenn die Regel dort nichts zu suchen hat:
  `verwendungszweck_pattern` ergaenzen, `konto_id` setzen, oder eine zweite
  Regel fuer den neuen Fall anlegen.

Regeln **ohne** jeden menschlichen Anker sind davon nicht betroffen — ihre
Stufe ruht auf Beleg, Buchungstext oder Recherche (E1, E3, E4) und ist
kontounabhaengig. Der Pruefbericht zeigt sie trotzdem, unter „neu erschlossen".

Eine Korrektur an einer Agenten-Buchung erzeugt keinen Logeintrag — die
Lernschleife (`tools/lernen.mjs`) zaehlt nur Korrekturen an Regel-Freigaben.
Sie wirkt ueber den Bestand: die korrigierte Buchung ist menschlich entschieden
und belegt E2 fuer eine kuenftige Regel. Die Transaktion traegt danach nur den
fachlichen Zielzustand, kein Historienfeld.

Nach-Kategorisierung laeuft ueber `tools/recategorize.mjs`. Reimport ist kein Mittel
zur Nach-Kategorisierung, weil bekannte Buchungen per Dedupe uebersprungen werden.

Auto-Freigaben (`bestaetigt_durch = auto`) bewertet die Nach-Kategorisierung
neu, auch wenn sie vom Agenten stammen (ADR 0025). Trifft eine Regel eine
solche Agenten-Buchung eindeutig:

- **gleiche Kategorie:** Die Schaetzung hat jetzt einen Beleg. Die Herkunft
  wird `regel`, `matched_regeln` wird gesetzt, Status `bestaetigt` und
  `bestaetigt_durch = auto` bleiben. Der Bericht zaehlt das als `belegt`. Der
  Zaehler „vom Agenten geschaetzt" im Pruefbericht sinkt entsprechend, und die
  Buchung zaehlt ab jetzt als Treffer der Regel auf ihrem Konto.
- **andere Kategorie:** Wiedervorlage als Regelvorschlag (`vorgeschlagen`,
  Herkunft `regel`), wie bei jeder Auto-Freigabe.
- **kein eindeutiger Treffer:** unveraendert.

Menschlich bestaetigte Agenten-Buchungen (`bestaetigt_durch = mensch`) fasst
die Nach-Kategorisierung nie an.

## Validierung und Tools

Validierung ist deterministischer Code. Agenten fuehren Validierung aus, statt
Strukturregeln frei zu interpretieren.

Wichtige Tools:

- `tools/validator.mjs`: Masterdaten pruefen.
- `tools/inbox.mjs`: kompletter Inbox-Lauf (Profil zuordnen, CSV normalisieren,
  importieren, Datei verschieben, protokollieren). `npm run inbox` ist die Vorschau.
  Verarbeitet werden **nur Dateien direkt im Inbox-Root** — Unterordner betritt der
  Lauf bewusst nicht (ein Bank-Archivexport bringt hunderte Dateien mit, die keine
  Buchungsquelle sind). Damit ein hineinkopierter Ordner nicht still uebersehen
  wird, zaehlt der Lauf jeden Unterordner ausser `processed/`, `standardized/` und
  `error/` rekursiv aus und meldet ihn unter `unterordner` im Bericht plus als
  Warnzeile. Zum Import gehoeren die Dateien flach in den Inbox-Root.
- `tools/normalize.mjs`: CSV per Bank-Profil ins Importformat normalisieren.
- `tools/import.mjs`: normalisierte Buchungen importieren.
- `tools/confirm.mjs`: Kategorie-Entscheidungen auf einen gefilterten Schnitt anwenden.
- `tools/agent-vorschlag.mjs`: Agenten-Einzelvorschlaege setzen (`vorgeschlagen` mit
  `kategorie_herkunft = agent`). Bewusst getrennt von `confirm.mjs`: das ist der
  menschliche Entscheidungskanal und schreibt immer `bestaetigt`.
- `tools/regel-vorschlag.mjs`: offenen Rueckstand zu Regelkandidaten buendeln.
- `tools/regel-probelauf.mjs`: Regelkandidaten gegen den Gesamtbestand rechnen,
  **bevor** etwas geschrieben wird. Blockiert mit Exit-Code 2 bei Strukturfehlern,
  unspezifischen Mustern, neuen Regelkonflikten, Wiedervorlagen und **verlorenen
  bestaetigten Treffern**: eine Einengung laesst bereits bestaetigte Buchungen aus
  der Regel fallen, sie verlieren ihre Kategorie und landen wieder auf `offen`.
  Die gemeldeten Trefferzahlen gelten fuer den Gesamtbestand, nicht nur fuer den
  Offen-Stapel — sonst erschiene eine Regel bei leerem Offen-Stapel als
  wirkungslos, obwohl sie hunderte bestaetigte Buchungen traegt.
- `tools/dedupe.mjs`: Transaktions-Dedupe-Hash bilden.
- `tools/categorizer.mjs`: Kategorisierungsregeln anwenden.
- `tools/recategorize.mjs`: Bestand nach Regelaenderungen neu bewerten.
- `tools/freigabe.mjs`: vorgeschlagene Buchungen automatisch bestaetigen, soweit
  ihre Regel das Gate besteht (aktiv, Kommentar, `belegstufe` E1-E4 und nicht
  gesperrt, Muster spezifisch, Belegstufe auf diesem Konto nicht nur geliehen).
  Schreibt `bestaetigt_durch = auto`. `npm run freigabe` ist die Vorschau.
- `tools/pruefbericht.mjs`: Nachkontrolle nach einem Durchlauf — groesste
  Auto-Freigaben, Merchants ohne jede menschliche Bestaetigung,
  Kategorie-Ausreisser, alle auto-freigegebenen `KAT-012`, Zahl der
  Agenten-Schaetzungen (Herkunft `agent`), am Gate gescheiterte
  Regeln, Regeln auf Konten ohne menschlichen Anker, E4-Regeln, Konten ohne
  Anker, nicht reconciliierte Kontostaende. Rein lesend, blockiert nie.
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
- `tools/regelzahlung-matcher.mjs`: gebuchte Transaktionen bestaetigten
  Regelzahlungen zuordnen (`regelzahlung_id`), als Lauf ueber den **Bestand**
  (`npm run regelzahlungen`). Nach jedem Import und nach neu gesetztem
  `konto_id` an einer Regelzahlung nachziehen. Regeln unter „Zuordnung zu
  Regelzahlungen".
- `tools/belege-text.mjs`: Textzwilling (`.txt`) je PDF und Bild unter `Belege/` erzeugen
  und `data/inbox/standardized/` **sowie** `data/inbox/processed/` per
  Inhalts-Hash aufraeumen. Ein `.txt` gilt dabei nie als Nachweis fuer eine
  Rohdatei — es ist der abgeleitete Zwilling und belegt nicht, dass das
  Original im Archiv ankam. Was keinen Nachweis hat, bleibt liegen und steht
  unter `offen`. `error/` wird nicht angefasst. `npm run belege:text` ist die
  Vorschau.

### Auto-Match von Transfers: drei Wege

Ein Paar entsteht automatisch bei invertiertem Betrag **und** zwei verschiedenen
Konten **und** *einem* der folgenden Signale innerhalb seines Datumsfensters:

| Signal | Bedingung | Fenster |
| --- | --- | --- |
| `zweck` | `verwendungszweck` nach Normalisierung identisch | ≤ 3 Tage |
| `iban` | `empfaenger_iban` der einen Seite ist die `kontoreferenz` des Gegenkontos | ≤ 5 Tage |
| `iban-text` | der `verwendungszweck` der einen Seite nennt eine IBAN, und die ist die `kontoreferenz` des Gegenkontos | ≤ 5 Tage |

Die IBAN-Wege sind noetig, weil zwei Banken denselben Uebertrag unterschiedlich
betexten (die eine haengt Name/BIC/IBAN an, die andere schreibt nur
„Uebertrag") — dann kann `zweck` systematisch nie greifen. `iban-text` deckt den
Fall, dass eine Seite die **Absender**-IBAN nur im Text nennt (z. B. das
Cashkonto eines Brokers: „Incoming transfer from <Name> (<IBAN>)") und die
Gegenseite aus einem PDF ohne IBAN kommt. Die Absender-IBAN gehoert **nicht**
in `empfaenger_iban`; der Text reicht. Erkannt werden deutsche IBANs, auch mit
Leerzeichen; der Wortlaut drumherum ist egal (kein Bankparser, ADR 0005). Nennt
der Text die eigene IBAN oder ein Konto ausserhalb des Modells, greift nichts.

Das Fenster ist gestaffelt: Freitext-Gleichheit ist das schwaechere Signal und
bleibt bei 3 Tagen; die strukturellen IBAN-Signale duerfen 5 Tage ueberbruecken
(Lastschrift oder Dauerauftrag am Monatsende, Gutschrift erst nach Wochenende
oder Feiertag).

**Eindeutigkeit statt greedy.** Gepaart wird nach aufsteigender
Datumsdifferenz: jede Buchung bekommt ihr naechstes freies Gegenstueck. Hat eine
Buchung im kleinsten Abstand mehrere Kandidaten, die sich in Konto oder Tag
unterscheiden, paart das Tool **nicht**: die Buchung und diese Kandidaten
bleiben offen und stehen im Ergebnis unter `mehrdeutig` (sie fallen auch nicht
auf ein weiter entferntes Gegenstueck zurueck). Gleichartige Kandidaten (selbes
Konto, selber Tag, selber Betrag) sind austauschbar und werden der Reihe nach
gepaart. Die Vorschau nennt je neuem Paar Signal und Abstand (`paare[].signal`,
`paare[].tage`).

Externe Transfers (Bargeld, Familie, Konten ausserhalb des Modells) erkennt das
Tool bewusst nicht — die markiert der Nutzer im Dialog.

### Vorschau ist Default

`inbox.mjs`, `confirm.mjs` und `transfer-matcher.mjs` schreiben **nur** mit `--schreiben`. Ohne das Flag
laufen sie vollstaendig durch und berichten, was passieren wuerde — nichts wird
geschrieben und nichts verschoben. Ein zu breiter Filter ist damit ein Ausdruck
auf der Konsole, kein Datenverlust. Beide Tools sind idempotent: derselbe Lauf
ein zweites Mal aendert nichts.

### Wer darf welche Entscheidung anfassen

- **Automatische Laeufe** (`import.mjs`, `recategorize.mjs`) fassen menschlich
  `bestaetigt`, `abgelehnt` und `manuell` nie an. Auto-Freigaben darf
  `recategorize.mjs` neu bewerten (siehe Kategorisierung und Herkunft).
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
PDFs ohne Textlayer und Belegfotos (png/jpg/jpeg) bekommen den Vorlauf schon
hier per OCR (`tesseract`, gemeinsame Erkennung in `tools/lib/ocr.mjs`, mit
der OCR-Kopfzeile aus Abschnitt „Belege"). Fotos bleiben wie PDFs im
Inbox-Root liegen, bis sie abgelegt sind; nach `error/` wandern sie nie.
`standardized/` ist dabei Durchgangsstation, kein Archiv — der dauerhafte
Textzwilling entsteht neben dem Beleg, siehe Abschnitt „Belege".

Dasselbe gilt fuer `data/inbox/processed/`. Auch dort liegen nur
Durchgangsstaende, keine Archivkopien: sobald der Beleg sprechend benannt unter
`Belege/` liegt, ist die Rohdatei in `processed/` eine Dublette und wird zum
Abschluss des Laufs entfernt — **erst nachdem** der byte-identische Zwilling
unter `Belege/` nachgewiesen ist. Der Nachweis laeuft ueber den Inhalts-Hash,
nie ueber den Dateinamen: beim Ablegen wird ja gerade umbenannt.

Das ist keine Kosmetik. Bleiben die Dubletten liegen, zeigt der naechste Lauf
einen vollen Eingang, und es muss jedes Mal neu geklaert werden, was davon
schon verarbeitet ist — eine Frage, die der Bestand allein nicht beantwortet,
weil ein importierter Beleg im Eingang genauso aussieht wie ein neuer. Gleiches
gilt fuer hineinkopierte Archivexporte: was daraus abgelegt ist, wird entfernt,
der Rest bleibt sichtbar liegen.

**Nicht** aufgeraeumt wird `error/`. Dort liegen ungeklaerte Faelle, die noch
eine Entscheidung brauchen; sie verschwinden erst, wenn die Entscheidung
gefallen ist.

## Zeitwerte, Anker und Reconciliation

Zeitveraenderliche, beleg- oder schaetzbasierte Werte leben in
`DATENROOT/zeitwerte.jsonl`. Beispiele sind Kontostand, Depotwert, Marktwert und
Restschuld.

Konto-Salden und Darlehen-Restschulden brauchen belegte Ankerpunkte, wenn die
Historie nicht vollstaendig garantiert ist. Laufende Werte werden aus Anker plus
Bewegungen oder Tilgung berechnet. Aufeinanderfolgende belegte Staende werden
reconciled; Abweichungen werden als Checks sichtbar und nicht still korrigiert.

### Protokollformat der Reconciliation-Differenz

Ein Kopf-Kontostand, der nicht aufgeht, wird **nicht** geschrieben, sondern im
Laufprotokoll festgehalten. Das Feld ist verbindlich ein Objekt:

```json
"normalisierung": {
  "reconciliation_differenz": {
    "konto_id": "KTO-000",
    "betrag": "-12.34",
    "grund": "Kopfstand liegt nach der letzten enthaltenen Buchung"
  }
}
```

- `konto_id` ist Pflicht. Eine Differenz gehoert zu einem **Konto**, nicht zu
  einer Datei; `normalisierung.dateien` ist eine **Anzahl** und taugt nicht als
  Quellenangabe.
- `betrag` ist ein Decimal-String wie jeder Betrag im Modell.
- `grund` sagt in einem Satz, woran die Reconciliation scheiterte und was die
  Luecke schliessen wuerde.

Gibt es keine Differenz, bleibt das Feld **weg**. `null` oder `"0.00"` sind
keine Platzhalter. Der Pruefbericht liest aeltere Eintraege (skalarer Betrag,
`quelle`) weiter, damit der Log nicht umgeschrieben werden muss; neu
geschrieben wird ausschliesslich dieses Format.

Schliesst ein spaeterer Lauf die Luecke (fehlender Auszug nachgereicht, Anker
jetzt geschrieben), vermerkt **sein** Laufeintrag das, statt den alten Eintrag
umzuschreiben:

```json
"normalisierung": {
  "reconciliation_erledigt": {
    "konto_id": "KTO-000",
    "bezug": "Logeintrag <zeitpunkt> des urspruenglichen Laufs",
    "grund": "Fehlender Auszug importiert, Anker cent-genau geschrieben"
  }
}
```

Mehrere Konten gehen als Liste. Der Pruefbericht blendet eine Differenz aus,
sobald ein **spaeterer** Eintrag sie fuer dasselbe Konto abhakt. Unabhaengig vom
Log rechnet er zusaetzlich jede Kette aufeinanderfolgender belegter Anker nach
(Anker + Buchungen bis zum naechsten Anker = naechster Anker); was dort nicht
aufgeht, steht immer im Bericht.

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

`konto_id` (optional) nennt das Konto, von dem gezahlt bzw. auf dem eingegangen
wird. Nur mit Beleg setzen (beobachtete Abbuchung oder Vertrag). Die Uebersicht
zeigt es bei den anstehenden Jahreszahlungen; die Prognose rechnet weiter auf
Haushaltsebene. Jede Regelzahlung, die eine konkrete Zahlung ist, bekommt ihr
Konto; Konsumplaene (Durchschnitt ueber viele Buchungen, oft mehrere Konten)
bekommen keins.

### Zuordnung zu Regelzahlungen

`tools/regelzahlung-matcher.mjs` (MCP `regelzahlungen_zuordnen`) setzt
`regelzahlung_id` an gebuchten Transaktionen. Das Erkennen bleibt beim Agenten
(ADR 0010): er bestaetigt die Regelzahlung und setzt ihr `konto_id`. Das Tool
matcht nur noch:

1. **Nur bestaetigte Regelzahlungen mit `konto_id`.** Ohne Konto meldet das Tool
   `ohne-konto` — so bleiben Konsumplaene draussen.
2. **Ankerbuchung.** Am Termin, der `anker_datum` am naechsten liegt (bis zu
   drei Termine davor oder danach), sucht das Tool die Buchung auf diesem Konto
   mit gleicher Richtung und Kategorie und cent-genau gleichem Betrag. Nur wenn
   kein Termin cent-genau trifft und die Regelzahlung `qualitaet = geschaetzt`
   ist (etwa ein Gehalt als Mittelwert), gilt ersatzweise 10 % Toleranz. Haben
   die Kandidaten verschiedene Kennungen, meldet es `anker-mehrdeutig`; ohne
   Kandidat `ohne-anker`.
3. **Kennung der Ankerbuchung.** Die `mandatsreferenz`, sonst die Gegenpartei.
4. **Termine.** Alle Termine aus `anker_datum` und Rhythmus, rueckwaerts bis zur
   ersten Buchung des Kontos, vorwaerts bis `aktiv_bis` bzw. zur letzten
   Buchung. Fenster je Termin: ein Viertel des Rhythmus, hoechstens 15 Tage
   (monatlich 7). Eine Nachfolgerin mit derselben Kennung reicht nicht vor das
   `aktiv_bis` der Vorgaengerin zurueck.
5. **Kandidaten je Termin.** Signal `mandat`: gleiche Mandatsreferenz, Betrag in
   50 % Toleranz (Beitragsdynamik ueber Jahre). Signal `gegenpartei`: gleiche
   Gegenpartei und Kategorie, Betrag in 10 % Toleranz.
6. **Eindeutig.** Je Termin hoechstens eine Buchung, je Buchung hoechstens ein
   Termin. Vergeben werden gegenseitig beste Paare (kleinste Betragsabweichung,
   dann kleinster Abstand). Gleich gute Alternativen stehen unter `mehrdeutig`.
   Eine vorhandene `regelzahlung_id` bleibt immer stehen.

Die Vorschau nennt je Regelzahlung Signal, Ankerbuchung, Termine, neue und
fehlende Buchungen (`je_regelzahlung`) sowie `uebersprungen` mit Grund. Die
Vorsorgeseite liest daraus gebuchte Beitraege, Beitragsbalken und den
Vorjahresvergleich.

## Vorsorge

Vorsorgeansprueche liegen in `DATENROOT/vorsorge.json` und folgen
`schemas/vorsorge.schema.json`. `art` ist der fachliche Diskriminator, z. B.
`gesetzliche-rente`, `betriebsrente`, `riester`, `rentenversicherung`,
`lebensversicherung` oder `schutzversicherung`. `kapitalbildend = true` bedeutet:
der aktuelle `rueckkaufswert` fliesst als Aktivum ins Nettovermoegen. Riester ist nie
kapitalbildend (Validator): das Kapital ist zweckgebunden, zu Rentenbeginn sind
hoechstens 30 Prozent als Einmalzahlung moeglich, der Rest wird verrentet; der
`rueckkaufswert` (Kuendigungsbetrag, schaedliche Verwendung) bleibt als
gebundenes Kapital erfasst, zaehlt aber nicht ins Nettovermoegen. Nicht
kapitalbildende Ansprueche sind Anwartschaften oder Schutzvertraege und erzeugen
ohne Szenario keine Bilanzposition.

Zeitwerte zu Vorsorge stehen in `DATENROOT/zeitwerte.jsonl` mit
`entitaet = "vorsorge"` und Feldern aus `schemas/zeitwerte.schema.json`:

- `rueckkaufswert`: aktueller verwertbarer Wert kapitalbildender Vorsorge.
- `erwartete_rente`: erwartete monatliche Leistung, als Netto-Wert oder klar
  gekennzeichnete Netto-Schaetzung.
- `erwartete_kapitalleistung`: erwartete einmalige Kapitalleistung.
- `vertragswert`: ausgewiesenes Vertragsguthaben (z. B. aus einem
  Vermittlerportal), auch bei nicht kuendbaren Vertraegen. Nur Anzeige, zaehlt
  nie ins Nettovermoegen. Ein Portalfeld "Rueckkaufswert" ohne ausgewiesenen
  Stornoabzug gehoert hierher, nicht nach `rueckkaufswert`.

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
- `frist-ueberfaellig`: eine erfasste Frist ist vorbei und nicht abgehakt (siehe
  Fristen).

## Fristen

Fristen und Termine, an denen gehandelt werden muss (Dynamik-Widerspruch,
Kuendigungsfrist, Kapitalwahl, Wiedervorlage), liegen als eigene Liste in
`DATENROOT/fristen.json` (`schemas/fristen.schema.json`, ADR 0032), nicht als
Fliesstext in Bemerkungen.

- `datum` ist der **letzte Tag**, an dem gehandelt werden muss, nicht der Tag
  des Ereignisses (Dynamik zum 01.12., Widerspruch bis 15.11. → `datum`
  `…-11-15`).
- `art`: `widerspruch`, `kuendigung`, `entscheidung`, `wiedervorlage`,
  `sonstiges`.
- Wiederkehrend mit `rhythmus_einheit` + `rhythmus_intervall` (nur zusammen,
  Werte wie bei Regelzahlungen); `datum` ist dann der Anker, also der erste
  noch offene Termin.
- Hoechstens ein Bezug: `vorsorge_id`, `darlehen_id`, `immobilie_id`,
  `konto_id`, `vermoegenswert_id` oder `regelzahlung_id`. Ohne Bezug ist
  erlaubt (Steuererklaerung).
- **Abhaken** ueber `erledigt_bis`: alle Termine bis einschliesslich diesem
  Datum sind erledigt. Einmalig: `erledigt_bis = datum`. Wiederkehrend: auf den
  erledigten Termin setzen, der naechste bleibt offen. Nie die Frist loeschen,
  nur weil sie erledigt ist; kein Status-Feld.
- Quelle und Begruendung (Brief, Police, Nachtrag) in `bemerkung`.

`app/fristen.mjs` rechnet `anstehendeFristen(data, heute, monate = 12)`: die
erfassten Termine plus abgeleitete Termine ohne eigenen Eintrag (Darlehen
`zinsbindung_bis` und `laufzeit_bis`, Vorsorge `leistung_beginn` — bei
`kapitalwahl = offen` als Entscheidung — und `aktiv_bis`, bestaetigte
Regelzahlungen mit `aktiv_bis`). Was schon aus diesen Feldern folgt, wird nicht
zusaetzlich als Frist erfasst. Ein ueberfaelliger, nicht abgehakter Termin
erscheint als Check `frist-ueberfaellig`.

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

Ein Szenario kann optional `phasen: [{name, ab}]` tragen (aufsteigend, ohne
doppelte Startdaten, keine nach `reichweite_bis`). Phasen sind reine Beschriftung
des Zeitstrahls in der App (Phasenbaender, Kennzahlen je Phase) und aendern die
Rechnung nicht.

Die Engine `szenarien.mjs` ist deterministisch und rechnet live ab dem
Rechenstichtag (nicht ab `stand`); die App schreibt keine Masterdaten — Szenarien
und Annahmen entstehen ausschliesslich ueber den Agenten. Siehe Skill
`szenarien-annahmen` fuer den Erstellungsprozess.

## Logos

Logos zeigen in der App, von wem eine Buchung kommt. Sie sind Echtdaten (das
Verzeichnis verraet, bei wem der Haushalt Kunde ist) und liegen nur im
Datenbestand, nie im Repo:

- `DATENROOT/logos.json`: Liste von `{ logo_id, name, gegenpartei_pattern,
  domain, datei, quelle, abgerufen_am }`. `gegenpartei_pattern` wirkt wie bei
  den Kategorisierungsregeln (lose normalisierter Teiltext, `|` trennt
  Alternativen); passen mehrere, gewinnt der laengste passende Teil.
- `DATENROOT/logos/<domain>.png`: so gross wie vom Dienst geliefert (bzw. wie die
  Bilddatei), hoechstens 128 px, RGBA.
- Regelzahlungen erben das Logo ueber ihre gebuchten Transaktionen
  (`regelzahlung_id`), Vorsorgevertraege ueber ihre Regelzahlungen
  (`vorsorge_id`). Ohne Treffer zeigt die App ein Kuerzel in fester Farbe.
- Quelle ist der Google-Favicon-Dienst (ADR 0030). Welche Domain zu einer
  Gegenpartei gehoert, entscheidet der Agent; `tools/logos.mjs` ruft ab,
  verkleinert, traegt ein und protokolliert im `agent_log.jsonl`.
- Kennt der Dienst die Domain nicht (404) oder liefert er das falsche Logo
  (etwa das der Konzernmutter), holt der Agent das Logo von der Website selbst
  (meist das Favicon aus `<link rel="icon">`), rastert ein SVG lokal zu PNG
  (macOS: `qlmanage -t -s 256 -o <ordner> <datei.svg>`) und gibt es als `bild`
  (Base64) mit `quelle` (URL der Herkunft) an `logos`. Fuer ein quadratisches
  Feld das quadratische Symbol nehmen, nicht den breiten Schriftzug.
- Liefert der Dienst nur ein winziges Bild, kann das Logo aus einer lokalen
  Bilddatei kommen (Briefkopf, Pressebereich): CLI `--datei <bild>`, MCP
  `logos` mit `datei` je Eintrag (Pfad unter `data/` oder `Belege/`, z. B.
  `data/inbox/<name>.png`). Nur PNG (bis 4096 px Kante, nicht interlaced) oder
  Baseline-JPEG (bis 1024 px), kein SVG; verkleinert auf hoechstens 128 px.
  Eine https-`quelle` (etwa die Adresse des Pressebereichs) ist optional; ohne
  sie steht `datei:<dateiname>` im Eintrag.

## Belege

Belege werden sprechend benannt und unter `Belege/` abgelegt. Datenfelder wie
`rohquelle` und `quelle_hinweis` zeigen auf den finalen App-relativen Belegpfad.

### Ablage nach Objekt

Belege liegen beim Objekt, zu dem sie gehoeren, darunter je Jahr. Das Jahr ist
das Datum des Belegs; bei Auszuegen ueber einen Zeitraum das Ende des Zeitraums.

| Klasse | Ordner |
| --- | --- |
| Konten und Depots | `Belege/Konten/<KTO-ID>_<Kurzname>/<Jahr>/` (Kontoauszuege, Umsatzlisten, Depotberichte, Bankpost zum Konto) |
| Immobilien | `Belege/Immobilien/<IMM-ID>_<Kurzname>/<Bereich>/` nach Bereich statt nach Jahr (siehe unten) |
| Darlehen | `Belege/Darlehen/<DAR-ID>_<Kurzname>/<Jahr>/` (Vertrag, Auszuege, Vertragsuebersichten) |
| Vorsorge | `Belege/Vorsorge/<VS-ID>_<Kurzname>/<Jahr>/` (Police, Standmitteilungen, Nachtraege) |
| Sonstige Vermoegenswerte | `Belege/Vermoegenswerte/<VMW-ID>_<Kurzname>/<Jahr>/` (Kaufbeleg, Gutachten, Wertnachweis, Mitgliedsbescheinigung) |
| Versicherungen | `Belege/Versicherungen/<Sparte>_<Versicherer>_<Vertragsnr>/<Jahr>/` (ohne ID; auch wenn es einen Vorsorge-Stammsatz gibt, bleiben die Belege hier) |
| Steuern | `Belege/Steuern/<Steuerjahr>/` |
| Sonstiges | `Belege/Sonstiges/<Jahr>/` (Belege ohne Objekt) |

- Die ID im Ordnernamen haelt die Zuordnung eindeutig, der Kurzname macht den
  Ordner lesbar (ohne Leerzeichen, Teile mit `-`, z. B. `KTO-001_Bank-Giro`).
- Belege zu mehreren Objekten einer Klasse liegen unter
  `Belege/<Klasse>/Allgemein/<Jahr>/` (ausser bei Immobilien, siehe unten).
- **Immobilien** haben feste Bereiche statt Jahresordnern (ADR 0031); ein
  Bereich entsteht erst mit seinem ersten Beleg:

  | Bereich | Inhalt | Jahresordner |
  | --- | --- | --- |
  | `Erwerb/` | Kauf, Uebertragung, Notar, Grundschuld, Grundbuch, Kataster | nein |
  | `Bau/` | Bauvertrag, Plaene, Flaechenberechnung, Genehmigungen, Abnahme, Nachbarzustimmungen, Foerderung | nein |
  | `Technik/` | Photovoltaik, Heizung, Anlagen: Anmeldungen, Protokolle, Wartungsvertraege | nein |
  | `Laufende-Kosten/<Jahr>/` | Grundsteuer, Wasser, Abfall, Energie, Schornsteinfeger, Reparaturen | Pflicht |
  | `Vermietung/` | Mietvertrag, Nachtraege, Schriftwechsel mit Mietern; `Vermietung/<Jahr>/`: Nebenkostenabrechnung samt Korrekturen | erlaubt |

  Jahr ist hier das **Abrechnungsjahr**, nicht das Datum des Schreibens (die
  Wasserrechnung fuer 2025 vom Januar 2026 liegt unter `2025/`). Ausserhalb der
  Jahresordner steht das Datum im Dateinamen. Einen Beleg zu mehreren
  Immobilien (z. B. ein Grundbuchauszug ueber zwei Blaetter) teilt der Agent,
  wenn er seitenweise trennbar ist; sonst liegt er als vollstaendige Kopie bei
  jeder Immobilie, jeweils mit deren ID im Namen (`belege_umziehen` mit
  `kopie: true`). `Immobilien/Allgemein/` gibt es nicht.
- Ein Darlehen hat seinen eigenen Ordner, auch wenn es zu einer Immobilie
  gehoert; die Immobilie findet seine Belege ueber `immobilie_id`.
- Eine Schutzversicherung als Vorsorge-Stammsatz nennt ihren Vertragsordner in
  `quelle_hinweis` (Pfad mit `/` am Ende, z. B.
  `Belege/Versicherungen/KFZ_Versicherer_123/`); die App zeigt dann alle Belege
  darunter am Vorsorgeobjekt.
- Neue Belege legt `beleg_ablegen` direkt dort ab; ein Ziel ausserhalb dieser
  Klassen oder ein Objektordner ohne `<ID>_<Kurzname>` bzw. `Allgemein` lehnt
  das Tool ab. Liegt ein Beleg falsch,
  zieht `belege_umziehen` ihn um und ersetzt alle Verweise in den Daten; ein
  Eintrag mit `kopie: true` kopiert stattdessen und laesst Quelle und Verweise.

Jedes PDF und jedes Bild (png/jpg/jpeg) unter `Belege/` hat einen
**Textzwilling**: gleicher Ordner, gleicher Basisname, Endung `.txt`. Der
Zwilling macht das Archiv durchsuchbar, ohne PDFs zu oeffnen. Der Normalfall
ist rohes `pdftotext -layout`-Ergebnis: nicht von Hand gepflegt und jederzeit
aus dem Beleg wiederherstellbar. Nur Bildscans und Fotos weichen davon ab,
siehe unten. HEIC/HEIF kommt nicht an: der Upload wandelt es in JPEG um. `tools/belege-text.mjs` erzeugt fehlende
Zwillinge und raeumt danach `data/inbox/standardized/` ab
(`npm run belege:text` fuer die Vorschau, `npm run belege:text:schreiben` zum
Anwenden).
CSVs unter `Belege/` bekommen keinen Zwilling, sie sind bereits Text.

Bildscans (PDF ohne Textebene) und Fotos gehen durch **OCR**: Seiten per
`pdftoppm -r 300` rastern, Text per `tesseract -l deu+eng` erkennen. Der
Zwilling beginnt dann mit `# Per OCR (tesseract) erkannt, <JJJJ-MM-TT>.`
Liegt derselbe OCR-Text schon als Vorlauf in `standardized/`, uebernimmt der
Zwilling ihn samt Kopfzeile und Datum — so bleibt er byte-identisch, und das
Aufraeumen findet den Vorlauf wieder. Hat ein Scan nur auf manchen Seiten eine
Textebene, bleiben diese Seiten roh und nur die leeren gehen durch OCR; der
Text traegt dann ebenfalls die OCR-Kopfzeile. Bringt OCR auf den leeren Seiten
nichts (Leerseite eines digitalen PDFs), bleibt es beim rohen pdftotext.

Ein Zwilling ist nie stumm leer. Liefert OCR fast nichts (unter 20 Zeichen)
oder fehlt `tesseract`, traegt der Zwilling die Kopfzeile `# Kein Textlayer —
Bildscan, <N> Seiten. Inhalt nur im PDF.` (bei Fotos `# Kein Textlayer —
Bild. …`) und erscheint bei jedem Lauf als „OCR ausstehend". Jeder Lauf
versucht diese Marker erneut per OCR und ersetzt sie, sobald es klappt. Ein
leerer Zwilling waere schlimmer als gar keiner: Die Suche faende nichts, und
ein fehlender Treffer ist von „das Dokument existiert nicht" nicht zu
unterscheiden.

Selbst liest der **Agent** einen Scan oder ein Foto nur noch, wenn OCR nichts
taugt (Marker oder offensichtlich unbrauchbarer OCR-Text): `datei_lesen` mit
`seite` liefert Seite bzw. Bild. Er schreibt den Zwilling dann selbst, mit der
Kopfzeile `# Vom Agenten aus dem Bildscan gelesen, <JJJJ-MM-TT>.`, damit die
Herkunft in der Datei ablesbar bleibt. Normale pdftotext-Zwillinge tragen
**keine** Kopfzeile: Sie muessen byte-identisch zum Textvorlauf bleiben, sonst
findet das Aufraeumen sie nicht wieder.

Ueber MCP sortiert `beleg_ablegen` die Rohdatei aus `data/inbox/` sprechend
benannt nach `Belege/` (das Benennungsschema steht im Skill `import-agent`,
Abschnitt „Belege benennen und ablegen"). Ein von Hand gelesener
Bildscan-Zwilling wird vorher per `datei_schreiben` als `<Rohdateiname>.txt`
neben die Rohdatei gelegt; `beleg_ablegen` nimmt ihn mit.

Ein **Sammelscan** (mehrere Briefe in einer Datei) wird vor dem Ablegen mit
`beleg_teilen` zerlegt: ein Teil je Brief, sprechend benannt. Die Teile landen
in der Inbox-Wurzel, das Original samt Textvorlauf im Papierkorb. Danach laufen
die Teile den normalen Weg: `inbox` fuer den Textvorlauf, dann `beleg_ablegen`
und `belege_text`.

Der umgekehrte Fall, eine **nachgereichte Seite** zu einem schon abgelegten
Beleg (etwa eine beim Scannen vergessene Rueckseite), geht mit
`beleg_ergaenzen`: Die Seiten werden an der richtigen Stelle in den Beleg
eingefuegt, Pfad und Name bleiben, so stimmt jeder `quelle_hinweis` weiter. Die
alte Fassung samt Zwilling und die Inbox-Datei landen im Papierkorb; danach
`belege_text` fuer den neuen Zwilling.

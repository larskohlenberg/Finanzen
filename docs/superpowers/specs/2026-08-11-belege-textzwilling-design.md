# Textvorlauf als Zwilling des Belegs ablegen

## Ausgangslage

`inbox.mjs` legt zu jedem PDF in `app/data/inbox/` einen deterministischen
Textvorlauf (`pdftotext -layout`) unter `app/data/inbox/standardized/` ab. Das
PDF selbst rührt der Lauf nicht an; nur CSVs wandern nach `processed/` oder
`error/`. Das Wegsortieren des PDF nach `Belege/` — samt sprechender Umbenennung
— macht der Agent von Hand.

Damit haben Beleg und Textvorlauf dieselbe Lebensdauer, aber verschiedene Orte:

| Ort | Bestand | gedachte Rolle | tatsächliche Rolle |
| --- | --- | --- | --- |
| `data/inbox/standardized/` | 86 TXT | Lesehilfe für den Lauf | Dauerablage, nie geleert |
| `Belege/<Jahr>/<Kategorie>/`, `Belege/Kontoauszuege/<Konto>/` | 84 PDF, 2 CSV | Belegarchiv | Belegarchiv |
| `data/inbox/processed/` | leer | Durchlauf | leer |

`standardized/` liegt als Geschwister neben `processed/` und `error/`, also in
einem per Konstruktion vergänglichen Bereich, füllt sich aber als einziger der
drei dauerhaft.

Die Verbindung zwischen Textvorlauf und Beleg ist allein der Dateiname. Der
Name des Textvorlaufs wird beim Inbox-Lauf aus dem Eingangsnamen abgeleitet, der
Beleg wird laut Skill erst später beim Ablegen sprechend umbenannt. Beide Namen
laufen deshalb systematisch auseinander. Im Bestand ist das bereits geschehen:

- 41 Textvorläufe heißen `Kontoauszug-4711000815-<Jahr>-<Monat>.txt`, während die
  zugehörigen Belege als `KTO-002_VWBank_Kontoauszug_<Jahr>-<Monat>.pdf` unter
  `Belege/Kontoauszuege/KTO-002/` liegen.
- `Rentenauskunft Altersrente.txt` gehört zu
  `2026_DRV-Bund_Altersrente_Rentenauskunft_12-345678-A-000.pdf`.

Von 84 Belegen und 86 Textvorläufen sind nur 42 über den Namen gepaart. Für 42
Belege ist der Textvorlauf nicht mehr auffindbar, und 44 Textvorläufe haben
keinen namensgleichen Beleg. Die 42 Treffer bestehen nur, weil diese PDFs
ausnahmsweise schon vor dem Inbox-Lauf umbenannt worden waren — also gerade
nicht so, wie der Ablauf beschrieben ist.

Drei Textvorläufe sind 2 bis 3 Byte groß
(`2025_MusterversicherungA_Testversicherung_Vertrag_A_*`). Bei diesen PDFs findet
`pdftotext` keine Textebene. Der Lauf meldet das heute nicht.

## Entscheidung

Der Textvorlauf ist ein dauerhaftes Derivat des Belegs und lebt am selben Ort
wie dieser. `data/inbox/standardized/` wird wieder zur Durchgangsstation.

Die tragende Invariante lautet:

> Jedes PDF unter `Belege/` hat einen Textzwilling: gleicher Ordner, gleicher
> Basisname, Endung `.txt`.

Der Zwilling wird nie von Hand gepflegt. Er ist reines `pdftotext -layout`-
Ergebnis und jederzeit aus dem Beleg wiederherstellbar. CSVs unter `Belege/`
bekommen keinen Zwilling, sie sind bereits Text.

Weil der Zwilling wiederherstellbar ist, wird er nicht verschoben, sondern am
Zielort neu erzeugt. Die Neuextraktion ist verlustfrei: Stichproben an
`TESTREF-026.pdf` und
`2026_DRV-Bund_Altersrente_Rentenauskunft_12-345678-A-000.pdf` ergeben
byte-identische Dateien (gleicher SHA-256) wie die vorhandenen Textvorläufe.

Daraus folgt die Paarung beim Aufräumen: Ein Textvorlauf in `standardized/` gilt
genau dann als redundant, wenn in `Belege/` ein Zwilling mit **identischem
SHA-256** existiert. Der Inhalt entscheidet, nicht der Name. Namen sind eine
Agentenentscheidung und driften; Inhalte tun das nicht.

## Gewünschtes Verhalten

Der Ablauf für einen neuen Beleg:

1. PDF nach `data/inbox/`.
2. `npm run inbox:schreiben` — Textvorlauf entsteht in `standardized/`.
3. Der Agent liest den Text, schlägt Daten vor, der Nutzer gibt frei.
4. Der Agent legt das PDF sprechend benannt unter `Belege/` ab. Unverändert
   gegenüber heute: nur das PDF wird bewegt.
5. `npm run belege:text:schreiben` — der Zwilling entsteht am Zielort, der
   redundante Textvorlauf in `standardized/` wird gelöscht.

Schritt 5 ist der einzige neue Handgriff. Er ist idempotent und darf beliebig
oft laufen.

## Technisches Design

### Neues Werkzeug `app/tools/belege-text.mjs`

Ein Lauf mit zwei Aufgaben.

**Erzeugen.** Rekursiv über `Belege/`. Jedes PDF ohne `.txt`-Geschwister bekommt
einen über `pdftotext -layout`. Vorhandene Zwillinge werden nicht angefasst.

**Aufräumen.** Für jede `.txt` in `data/inbox/standardized/` wird der SHA-256
gebildet und gegen die Hashes der Zwillinge unter `Belege/` gehalten. Bei
Treffer wird die Datei in `standardized/` gelöscht, sonst bleibt sie liegen und
erscheint im Bericht.

Das Werkzeug braucht keinen Datenroot. `Belege/` existiert genau einmal,
unabhängig von `master` und `demo`.

Vorschau und Schreiben folgen `inbox.mjs`: ohne `--schreiben` wird nichts
erzeugt und nichts gelöscht, der Bericht geht als JSON nach stdout. Neue
Skripte in `package.json`:

```
"belege:text": "node app/tools/belege-text.mjs",
"belege:text:schreiben": "node app/tools/belege-text.mjs --schreiben"
```

### Trennung von Planung und Wirkung

Wie bei `planInbox` in `inbox.mjs` liegt die Entscheidungslogik in einer reinen,
exportierten Funktion:

```
planBelegeText({ belege, staging }) → { erzeugen, loeschen, offen }
```

`belege` und `staging` sind Listen aus Pfad und — soweit vorhanden — Hash.
Die Funktion berührt weder Dateisystem noch `pdftotext`. `main()` sammelt die
Eingaben ein, ruft die Planung und führt sie aus.

### Bericht

Der Bericht macht zwei heute stumme Zustände sichtbar:

| Befund | Meldung |
| --- | --- |
| Extrakt praktisch leer | Scan ohne Textebene, Zwilling bleibt leer |
| Textvorlauf ohne Hash-Treffer | Beleg noch nicht abgelegt |

„Praktisch leer" heißt: der Extrakt enthält nach Entfernen von Leerraum und
Seitenumbrüchen keine Zeichen. Der leere Zwilling wird trotzdem geschrieben,
damit die Invariante hält und der Befund bei jedem Lauf sichtbar bleibt.

### Änderung an `inbox.mjs`

Die PDF-Extraktion nach `standardized/` bleibt. Der Agent muss den Text lesen,
um überhaupt entscheiden zu können, wie der Beleg heißt und wohin er gehört —
die Extraktion kann deshalb nicht ans Ende des Ablaufs wandern.

Geändert werden nur der Dateikopf-Kommentar und der `hinweis` im Bericht: Sie
benennen `standardized/` als Durchgangsstation und verweisen für den dauerhaften
Zwilling auf `belege-text.mjs`. Es entfällt kein Verhalten.

## Migration des Bestands

Kein Sonderweg. Der erste `belege:text:schreiben`-Lauf erledigt sie:

- 42 fehlende Zwillinge werden unter `Belege/` erzeugt.
- Die 41 verwaisten `Kontoauszug-4711000815-*.txt` und
  `Rentenauskunft Altersrente.txt` werden per Hash-Treffer gelöscht.
- Die 42 bereits namensgleichen Textvorläufe werden ebenfalls per Hash-Treffer
  gelöscht, da ihre Zwillinge unter `Belege/` liegen.

Zuerst wird die Vorschau gelesen, dann geschrieben.

Endzustand: 84 Zwillinge unter `Belege/`, 84 gelöschte Textvorläufe, 2
verbleibende Dateien in `standardized/`. `Kontoauszug.txt` und
`Umsatzanzeige - MusterbankB.txt` bleiben liegen, weil ihre PDFs noch
unverarbeitet in `data/inbox/` stecken und es deshalb keinen Hash-Treffer gibt.
Das ist das gewünschte Verhalten und erscheint als offener Punkt im Bericht.

## Fehler- und Randfälle

- **`pdftotext` fehlt oder bricht ab.** Die betroffene Datei wird als Fehler im
  Bericht geführt, der Lauf macht mit den übrigen weiter. Ohne Zwilling wird
  nichts in `standardized/` gelöscht, es geht also nichts verloren.
- **PDF ohne Textebene.** Zwilling wird als leere Datei geschrieben und im
  Bericht gemeldet. Kein OCR.
- **Textvorlauf ohne Hash-Treffer.** Bleibt liegen, erscheint im Bericht.
- **Zwilling ohne PDF** (etwa nach Umbenennen des Belegs von Hand). Wird im
  Bericht als verwaist gemeldet, aber nicht gelöscht.
- **Dateinamen in NFD.** `Belege/` und `standardized/` werden wie in
  `planInbox` vor dem Vergleich auf NFC normalisiert.

## Doku

- `app/docs/agent-context.md`: Abschnitt „Belege" erhält die Zwillings-
  Invariante; die PDF-Notiz bei den Import-Profilen wird auf „Durchgangsstation"
  präzisiert.
- `app/docs/skills/import-agent.md`, `vorsorge-erfassung-agent.md` und
  `stammdaten-erfassung-agent.md`: Der Schritt „Beleg ablegen" erhält den
  `belege:text`-Lauf.

Die App-Dokumentation verweist wie bisher nicht auf Dateien außerhalb von `app/`
(geprüft durch `tests/agent-docs.test.mjs`).

## Tests

Neu `tests/belege-text.test.mjs` gegen `planBelegeText`, nach dem Muster von
`tests/inbox-plan.test.mjs`. Kein Dateisystem, kein `pdftotext`.

Fälle:

- PDF ohne Zwilling steht in `erzeugen`.
- PDF mit Zwilling steht nicht in `erzeugen`.
- CSV unter `Belege/` wird ignoriert.
- Textvorlauf mit Hash-Treffer steht in `loeschen`.
- Textvorlauf ohne Hash-Treffer steht in `offen`.
- Leerer Extrakt wird als Scan ohne Textebene gemeldet.
- Zwilling ohne zugehöriges PDF steht in `offen`, nicht in `loeschen`.
- Namen in NFD und NFC paaren korrekt.

## Bewusst nicht enthalten

- **Kein OCR** für Scans ohne Textebene. Der Befund wird gemeldet; ob die drei
  MusterversicherungA-Belege OCR bekommen, ist eine eigene Entscheidung.
- **Keine laufende Konsistenzprüfung** vorhandener Zwillinge gegen ihr PDF.
  Belege im Archiv ändern sich nicht.
- **Kein Eintrag in `agent_log.jsonl`.** Der Lauf berührt keine Modelldaten.
- **Kein Ablage-Werkzeug**, das PDF und Text gemeinsam verschiebt. Die Paarung
  hinge dann daran, dass das Werkzeug auch benutzt wird; die Neuerzeugung aus
  `Belege/` hält die Invariante dagegen unabhängig davon, wie der Beleg dorthin
  gelangt ist.

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
(`2025_MusterversicherungA_Testversicherung_Vertrag_A_*`). Diese PDFs sind reine
Bildscans — ein JPEG pro Seite, 144 dpi, Graustufen — und haben keine Textebene.
Eine Prüfung aller 84 Belege zeigt, dass es genau diese drei sind. Der Lauf
meldet das heute nicht.

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

Ist der Textvorlauf aus Schritt 2 leer, ist das Dokument ein Bildscan. Dann
weicht der Ablauf ab Schritt 3 ab, siehe „Belege ohne Textebene".

## Technisches Design

### Neues Werkzeug `app/tools/belege-text.mjs`

Ein Lauf mit zwei Aufgaben.

**Erzeugen.** Rekursiv über `Belege/`. Jedes PDF ohne `.txt`-Geschwister bekommt
einen über `pdftotext -layout`. Liefert die Extraktion keinen Text, entsteht
stattdessen ein Marker-Zwilling (siehe „Belege ohne Textebene").

**Vorhandene Zwillinge werden nie überschrieben.** Ein Zwilling, den der Agent
aus einem Bildscan geschrieben hat, würde sonst beim nächsten Lauf durch ein
leeres `pdftotext`-Ergebnis ersetzt — stille Datenvernichtung durch ein
Werkzeug, das sich für idempotent hält.

**Aufräumen.** Für jede `.txt` in `data/inbox/standardized/` wird der SHA-256
gebildet und gegen die Hashes der Zwillinge unter `Belege/` gehalten. Bei
Treffer wird die Datei in `standardized/` gelöscht, sonst bleibt sie liegen und
erscheint im Bericht.

Ein **leerer** Textvorlauf wird immer gelöscht, unabhängig von Hash-Treffern.
Er trägt per Definition keine Information, findet als Bildscan-Extrakt ohnehin
nie einen Partner und ist über `inbox.mjs` in einer Sekunde wiederhergestellt.
Ohne diese Regel bliebe er dauerhaft als vermeintlich offener Punkt liegen.

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

Der Bericht macht drei heute stumme Zustände sichtbar:

| Befund | Meldung |
| --- | --- |
| Extraktion ohne Text | Bildscan, Marker-Zwilling geschrieben |
| Marker-Zwilling vorhanden | OCR ausstehend |
| Textvorlauf ohne Hash-Treffer | Beleg noch nicht abgelegt |

„Ohne Text" heißt: der Extrakt enthält nach Entfernen von Leerraum und
Seitenumbrüchen keine Zeichen.

„OCR ausstehend" wird bei **jedem** Lauf neu gemeldet, solange der Marker steht.
Der Bericht führt damit eine stehende Restliste der Belege, deren Inhalt noch
nicht im Archiv durchsuchbar ist.

### Änderung an `inbox.mjs`

Die PDF-Extraktion nach `standardized/` bleibt. Der Agent muss den Text lesen,
um überhaupt entscheiden zu können, wie der Beleg heißt und wohin er gehört —
die Extraktion kann deshalb nicht ans Ende des Ablaufs wandern.

Geändert werden nur der Dateikopf-Kommentar und der `hinweis` im Bericht: Sie
benennen `standardized/` als Durchgangsstation und verweisen für den dauerhaften
Zwilling auf `belege-text.mjs`. Es entfällt kein Verhalten.

## Belege ohne Textebene

Drei der 84 Belege sind reine Bildscans: ein JPEG pro Seite, 144 dpi,
Graustufen, kein Textlayer. Es sind die drei MusterversicherungA-Belege zur privaten
Krankenversicherung der Kinder, zusammen sieben Seiten. Das ist eine Eigenschaft
dieses Absenders, keine Ausnahme — es werden weiter etwa drei Dokumente pro Jahr
nachkommen.

### Warum ein leerer Zwilling nicht genügt

Der Zwilling existiert, damit das Belegarchiv durchsuchbar ist, ohne PDFs zu
öffnen. Ein leerer Zwilling liefert bei `grep -r "Beitragsanpassung" Belege/`
keinen Treffer — und ein fehlender Treffer ist nicht von „das Dokument existiert
nicht" zu unterscheiden. Die Suche lügt dann, statt zu schweigen. Ein Zwilling
ist deshalb nie stumm leer.

### Drei Zwillingsformen

| Form | Kopfzeile | Herkunft |
| --- | --- | --- |
| Normal | keine | rohes `pdftotext -layout` |
| Marker | `# Kein Textlayer — Bildscan, <N> Seiten. Inhalt nur im PDF.` | `belege-text.mjs` |
| Gelesen | `# Vom Agenten aus dem Bildscan gelesen, <JJJJ-MM-TT>.` | Agent beim Import |

Die Kopfzeile steht **nur** auf den beiden Sonderformen. Normale Zwillinge
bleiben rohes `pdftotext`-Ergebnis ohne jede Zutat, sonst wären sie nie mehr
byte-identisch mit ihrem Textvorlauf und die Hash-Paarung beim Aufräumen —
die Grundlage des ganzen Entwurfs — wäre gebrochen.

### OCR durch den Agenten beim Import

Der Agent liest den Beleg beim Import ohnehin, um Kategorie und sprechenden
Namen zu bestimmen. Bei einem Bildscan liest er statt der leeren TXT die
PDF-Seiten selbst und schreibt den Zwilling im selben Arbeitsschritt. Die
Texterfassung kostet damit nichts zusätzlich, und es entsteht keine Lücke, die
später nachgeholt werden müsste.

Der Ablauf ab Schritt 3:

3. Der Textvorlauf ist leer — das ist das Signal „Bildscan". Der Agent öffnet
   die PDF-Seiten und liest sie.
4. Er legt das PDF sprechend benannt unter `Belege/` ab und schreibt den
   Zwilling mit der Kopfzeile `# Vom Agenten aus dem Bildscan gelesen, <Datum>.`
   daneben.
5. `npm run belege:text:schreiben` findet einen vorhandenen Zwilling, lässt ihn
   unberührt und löscht den leeren Textvorlauf.

Der Zwilling ist in dieser Form nicht deterministisch reproduzierbar. Genau
deshalb trägt er die Kopfzeile: Seine Herkunft ist in der Datei selbst
abzulesen, nicht nur im Protokoll.

Die Marker-Form entsteht damit nur noch, wenn ein PDF ohne diesen Ablauf ins
Archiv gelangt — bei der Migration der drei bereits abgelegten MusterversicherungA-Belege
und beim Einsortieren von Hand.

### Kein eigenes OCR-Werkzeug

Weder `ocrmypdf` noch `tesseract` sind installiert; ein Einbau zöge rund ein
Gigabyte Abhängigkeiten für drei Dokumente pro Jahr nach sich, und tesseract ist
bei 144 dpi Graustufen grenzwertig. Der Agent liest diese Scans besser. Sollte
das Aufkommen steigen, ist `ocrmypdf` ein späterer, kleiner Schritt: Es brennt
eine Textebene ins PDF, danach greift die normale Pipeline unverändert. Die
Invariante und das Zwillingsformat ändern sich dadurch nicht — die Entscheidung
ist umkehrbar.

## Migration des Bestands

Kein Sonderweg. Der erste `belege:text:schreiben`-Lauf erledigt sie. Unter
`Belege/` liegt heute **kein einziger** Zwilling, es werden also alle 84
erzeugt: 81 normale und 3 Marker für die MusterversicherungA-Bildscans.

Gelöscht werden anschließend 84 der 86 Textvorläufe:

- 39 namensgleiche mit Hash-Treffer,
- 42 verwaiste mit Hash-Treffer — die 41 `Kontoauszug-4711000815-*.txt` und
  `Rentenauskunft Altersrente.txt`,
- 3 leere, die zu den MusterversicherungA-Bildscans gehören, über die Leer-Regel.

Zuerst wird die Vorschau gelesen, dann geschrieben.

Endzustand: 84 Zwillinge unter `Belege/`, davon 3 mit Marker, und 2
verbleibende Dateien in `standardized/`. `Kontoauszug.txt` und
`Umsatzanzeige - MusterbankB.txt` bleiben liegen, weil ihre PDFs noch
unverarbeitet in `data/inbox/` stecken und es deshalb keinen Hash-Treffer gibt.
Das ist das gewünschte Verhalten und erscheint als offener Punkt im Bericht.

Die drei MusterversicherungA-Belege werden danach einmalig nachgezogen: Der Agent liest die
sieben Seiten und ersetzt die Marker durch gelesene Zwillinge. Bis dahin steht
„OCR ausstehend" in jedem Bericht.

## Fehler- und Randfälle

- **`pdftotext` fehlt oder bricht ab.** Die betroffene Datei wird als Fehler im
  Bericht geführt, der Lauf macht mit den übrigen weiter. Ohne Zwilling wird
  nichts in `standardized/` gelöscht, es geht also nichts verloren.
- **PDF ohne Textebene.** Marker-Zwilling wird geschrieben, „OCR ausstehend"
  gemeldet. Kein automatisches OCR.
- **Vorhandener Zwilling.** Wird nie überschrieben, auch nicht, wenn eine
  Neuextraktion mehr Text ergäbe. Ein gelesener Zwilling ist sonst verloren.
- **Textvorlauf ohne Hash-Treffer.** Bleibt liegen, erscheint im Bericht —
  außer er ist leer, dann wird er gelöscht.
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
  `belege:text`-Lauf und die Bildscan-Abzweigung — leerer Textvorlauf heißt
  PDF-Seiten lesen und den Zwilling mit Kopfzeile selbst schreiben.

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
- Leerer Textvorlauf steht in `loeschen`, auch ohne Hash-Treffer.
- PDF ohne Text ergibt einen Marker-Zwilling, nicht eine leere Datei.
- Vorhandener Marker-Zwilling steht in `offen` mit „OCR ausstehend".
- Vom Agenten gelesener Zwilling steht weder in `erzeugen` noch in `offen`.
- Zwilling ohne zugehöriges PDF steht in `offen`, nicht in `loeschen`.
- Namen in NFD und NFC paaren korrekt.

## Bewusst nicht enthalten

- **Kein automatisches OCR** und keine OCR-Abhängigkeit im Repo. Bildscans
  liest der Agent beim Import, siehe „Belege ohne Textebene".
- **Keine laufende Konsistenzprüfung** vorhandener Zwillinge gegen ihr PDF.
  Belege im Archiv ändern sich nicht.
- **Kein Eintrag in `agent_log.jsonl`.** Der Lauf berührt keine Modelldaten.
- **Kein Ablage-Werkzeug**, das PDF und Text gemeinsam verschiebt. Die Paarung
  hinge dann daran, dass das Werkzeug auch benutzt wird; die Neuerzeugung aus
  `Belege/` hält die Invariante dagegen unabhängig davon, wie der Beleg dorthin
  gelangt ist.

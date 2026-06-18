# Skill: Kategorisierungsregel-Pflege

Betriebsanweisung fuer das datengetriebene Anlegen, Aendern und Stilllegen von Kategorisierungsregeln und die anschliessende Nach-Kategorisierung des Bestands. Der Nutzer stoesst an, der Agent fuehrt — der Agent legt **nie still** eine Regel an und raet **nie** eine Kategorie.

Alle Pfade in diesem Skill sind app-relativ: `data/...`, `schemas/...`,
`tools/...` und `docs/...` liegen unter dem App-Raum.

## Wann diesen Skill nutzen

Nutze ihn, wenn der Nutzer

- den **Offen-Stapel** abarbeiten will („verregele meine offenen Buchungen", „warum ist das alles offen?"),
- eine konkrete Regel anlegen oder anpassen moechte („alles von MusterladenA ist Lebensmittel"),
- nach einem Regel-Tuning den **Bestand** nachziehen will.

Nicht nutzen fuer:
- Neue Belege einspielen → **import-agent** (der macht die Erst-Kategorisierung).
- Vorschlaege bestaetigen/ablehnen → **kategorisierung-review** (dieser Skill *endet* bei `vorgeschlagen`).
- Stammdaten (Personen, Konten, Kategorien) → **stammdaten-erfassung-agent**.

## Kontext, den du kennen musst

1. `docs/agent-context.md` — gemeinsame Regeln fuer App-Raum, Kategorisierung, Herkunft, Nach-Kategorisierung und Validierung.
2. `schemas/kategorisierungsregeln.schema.json` — verbindliche Struktur einer Regel.
3. `data/master/kategorisierungsregeln.json` — der Regelbestand.
4. `data/master/kategorien.json` — gueltige `kategorie_id` (Ziel jeder Regel).
5. `tools/categorizer.mjs` (Matching) und `tools/recategorize.mjs` (Nach-Kategorisierung).

## Zentrale Regeln

- Der Agent legt nie still eine Regel an und raet nie eine Kategorie.
- Nach-Kategorisierung bewertet `offen` plus Eintraege mit `kategorie_herkunft = regel`.
- `manuell` und `abgelehnt` bleiben unangetastet.
- Widerspruch gegen eine bestaetigte Regel-Kategorie wird Wiedervorlage, nicht stilles Ueberschreiben.
- Reimport ist keine Nach-Kategorisierung; bekannte Buchungen werden per Dedupe uebersprungen.

## Ablauf

1. **Read-only-Analyse des Offen-Stapels.** Lade `data/master/transaktionen.jsonl` und betrachte `kategorisierung_status = offen` (sowie Regel-**Konflikte**, die der Categorizer offen laesst). Gruppiere nach wiederkehrenden Mustern in `gegenpartei`/`verwendungszweck`. **Ranking nach Hebel:** wie viele offene Buchungen ein Muster traefe × wie eindeutig es ist. So entsteht eine Liste „groesster Effekt zuerst". Nichts schreiben in diesem Schritt.
2. **Regel(n) vorschlagen.** Pro Muster eine konkrete Regel formulieren:
   - `gegenpartei_pattern` und/oder `verwendungszweck_pattern` (Substring, lose normalisiert), optional gefiltert auf `konto_id` und `vorzeichen` (`einnahme`/`ausgabe`),
   - genau eine `kategorie_id` (muss in `kategorien.json` existieren),
   - dem Nutzer die **Stichprobe** zeigen: welche offenen Buchungen die Regel jetzt traefe (Probelauf ueber `categorize()`), und falls sinnvoll auch die, die sie *nicht* trifft.
   Eine Regel darf **auch ohne aktuellen Treffer** angelegt werden (wissensbasiert, z. B. fuer kuenftige Buchungen) — das ist erlaubt, solange der Nutzer es ausdruecklich will.
3. **Bestaetigen lassen — Regel fuer Regel.** Keine Regel ohne explizites „ja". Keine Kategorie raten: ist die Zielkategorie unklar, fragen statt tippen.
4. **Regel schreiben.** Neue `regel_id` als naechste freie `REG-NNN` (Bestand scannen, es gibt keinen ID-Helfer), `status = "aktiv"`, `erstellt_am` = heutiges Datum. `kommentar` ist **Pflichtfeld** — er muss eine echte Erklaerung in normaler Sprache enthalten, **nicht** nur das Muster wiederholen. Beispiel: „Monatlicher Dauerauftrag Sparen auf Tagesgeldkonto" ist korrekt; „Muster: TAGESGELD" ist nicht ausreichend. Dieser Kommentar erscheint dem Nutzer als Erklaerung und muss auch bei komplexen Mustern verstaendlich sein. Struktur gegen `schemas/kategorisierungsregeln.schema.json` pruefen, dann an `data/master/kategorisierungsregeln.json` schreiben. Eine Regel **aendern** = denselben Satz ueberschreiben; dabei `kommentar` pruefen und aktualisieren, falls das Muster sich aendert und die Erklaerung nicht mehr passt. Eine Regel **stilllegen** = `status = "inaktiv"` (nicht loeschen, der Categorizer ignoriert Inaktive ohnehin).
5. **Nach-Kategorisierung anstossen.** `node tools/recategorize.mjs` aufrufen. Das Tool rechnet den vollen Recompute (offen + `herkunft = regel`) gegen das aktuelle Regelwerk, schreibt `transaktionen.jsonl` in-place, ruft danach den Validator und gibt den Zaehlerbericht aus. Du uebergibst dem Tool **kein** Regel-Delta — der volle Recompute ist die verbindliche Nach-Kategorisierung. `recategorize.mjs` schreibt dabei auch `matched_regeln` neu: bei eindeutigem Treffer mit der treffenden Regel-ID, bei Konflikt mit allen passenden IDs. Der Probelauf (Schritt 2, `categorize()`) kann dir bereits zeigen, welche Regeln fuer die Stichprobe matchen — nutze das, um Konflikte zwischen Regeln fruehzeitig zu erkennen.
6. **Bericht + Uebergabe.** Den Zaehlerbericht zusammenfassen (`neu_vorgeschlagen`, `wiedervorlage`, `zurueckgesetzt`, `unveraendert`, `uebersprungen`) und in `data/master/agent_log.jsonl` protokollieren. Dieser Skill **endet bei `vorgeschlagen`** — das Bestaetigen ist Sache von **kategorisierung-review**. Darauf aktiv hinweisen, wenn neue Vorschlaege oder Wiedervorlagen entstanden sind.

## Do's

- **Read-only zuerst** — erst analysieren und vorschlagen, dann nach Bestaetigung schreiben.
- **Nach Hebel priorisieren** — das groesste offene Bucket zuerst, nicht alphabetisch.
- **Transfers ruhig verregeln** — `ist_transfer` und `kategorie_id` sind orthogonal; ein Sparuebertrag darf zusaetzlich `Sparen/Investieren` tragen.
- **Validator vertrauen, aber pruefen** — `recategorize.mjs` ruft ihn; schlaegt er an, den Fehler klaeren, nicht uebergehen.
- **Idempotenz nutzen** — der Lauf ist wiederholbar; ein zweiter Lauf ohne Regelaenderung aendert nichts.

## Don'ts

- **Keine Regel still anlegen.** Immer Vorschlag → explizite Bestaetigung. Auch wenn ein Muster „offensichtlich" ist.
- **Keine Kategorie raten.** Unklare Zielkategorie → fragen oder offen lassen, nie eine `kategorie_id` erfinden.
- **Nicht reimportieren, um nachzukategorisieren.** Der Reimport ueberspringt Bekanntes per Dedupe und ruehrt den Bestand nicht an. Nach-Kategorisierung laeuft ausschliesslich ueber `recategorize.mjs`.
- **Bestaetigt/manuell/abgelehnt nicht umbiegen.** Das Tool fasst sie nicht an, und du auch nicht — ein Widerspruch wird als **Wiedervorlage** sichtbar, nicht still ueberschrieben.
- **Regel deckt eine `manuell`-Buchung mit gleicher Kategorie?** Dann ist die `manuell`-Markierung die Altlast (jemand hat Regel **und** `manuell` zugleich gesetzt). `recategorize.mjs` heilt das nicht (es laesst `manuell` in Ruhe). Solche Buchungen gezielt auf `kategorie_herkunft = regel` zuruecksetzen und `matched_regeln` stempeln — **nur**, wenn die treffende Regel **dieselbe** Kategorie liefert. Weicht die Nutzer-Kategorie ab, ist es eine bewusste Uebersteuerung und bleibt `manuell`.
- **Keine Kategorie direkt an Transaktionen schreiben.** Kategorien entstehen ueber Regeln (deterministisch) oder im Review (manuell), nicht hier von Hand.

## Wann fragen, wann handeln

**Fragen, bevor du handelst:**

- Zielkategorie eines Musters unklar oder mehrdeutig.
- Ein Muster traefe auch Buchungen, die erkennbar woanders hingehoeren (zu grob gefasst).
- Eine Regelaenderung wuerde viele `bestaetigt`-Eintraege auf Wiedervorlage schicken — Umfang vorher ansagen.

**Selbstaendig handeln:**

- Read-only-Analyse und Ranking des Offen-Stapels.
- Probelauf (`categorize()`), um die Trefferliste einer vorgeschlagenen Regel zu zeigen.
- `recategorize.mjs` nach bestaetigter Regelaenderung und der anschliessende Validator-Lauf.

## Wo was liegt

| Pfad | Zweck |
| --- | --- |
| `data/master/kategorisierungsregeln.json` | Regelbestand (dieser Skill pflegt ihn) |
| `data/master/transaktionen.jsonl` | Bestand, den die Nach-Kategorisierung neu bewertet |
| `data/master/kategorien.json` | Gueltige Ziel-`kategorie_id` |
| `data/master/agent_log.jsonl` | Lauf-Protokoll fuer die Uebergabe |
| `schemas/kategorisierungsregeln.schema.json` | Struktur-Referenz einer Regel |
| `tools/categorizer.mjs` | Deterministisches Matching (Probelauf + Recompute) |
| `tools/recategorize.mjs` | Nach-Kategorisierung (Recompute + Validator + Bericht) |
| `tools/validator.mjs` | Validator (von `recategorize.mjs` gerufen) |

## Verwandte Skills und Anschlussprozesse

- **kategorisierung-review** — bestaetigt/korrigiert/lehnt die hier erzeugten `vorgeschlagen`-Eintraege ab. Direkter Anschluss.
- **import-agent** — Erst-Kategorisierung beim Einspielen neuer Belege.
- **stammdaten-erfassung-agent** — legt fehlende Kategorien an, bevor eine Regel auf sie zeigen kann.

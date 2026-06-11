# Skill: Kategorisierungsregel-Pflege

Betriebsanweisung fuer das datengetriebene Anlegen, Aendern und Stilllegen von Kategorisierungsregeln und die anschliessende Nach-Kategorisierung des Bestands. Fachlich aus ADR 0017 entstanden; der Nutzer stoesst an, der Agent fuehrt — der Agent legt **nie still** eine Regel an und raet **nie** eine Kategorie.

Es gibt zwei Wurzeln, halte sie auseinander:

- **App-Datenraum** (`app/`): `data/...`, `schemas/...`, `tools/...` sind app-relativ.
- **Repo-Root** (eine Ebene ueber `app/`): `CONTEXT.md` und `docs/adr/...` liegen hier (ADR 0015). Pfade auf diese Doku sind repo-root-relativ.

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

Im **Repo-Root**:

1. `CONTEXT.md` — Eintraege **Kategorisierung** (Erst-/Nach-Kategorisierung, `kategorie_herkunft`), **Kategorisierungsregel**, **Transfer** (`ist_transfer` ⊥ `kategorie_id`).
2. `docs/adr/0017-nach-kategorisierung-des-bestands-bei-regelaenderung.md` — die massgebliche Policy.
3. `docs/adr/0003` (Validator/Tool deterministisch, Agent ruft) und `docs/adr/0010` (Erkennen = Agent-Urteil, Matchen = Tool).
4. `docs/adr/0002` (bestaetigte Kategorie ist Fakt) und `docs/adr/0006` (App schreibt keine Masterdaten).

Im **App-Datenraum** (`app/`):

5. `schemas/kategorisierungsregeln.schema.json` — verbindliche Struktur einer Regel.
6. `data/master/kategorisierungsregeln.json` — der Regelbestand.
7. `data/master/kategorien.json` — gueltige `kategorie_id` (Ziel jeder Regel).
8. `tools/categorizer.mjs` (Matching) und `tools/recategorize.mjs` (Nach-Kategorisierung).

## Ablauf

1. **Read-only-Analyse des Offen-Stapels.** Lade `data/master/transaktionen.jsonl` und betrachte `kategorisierung_status = offen` (sowie Regel-**Konflikte**, die der Categorizer offen laesst). Gruppiere nach wiederkehrenden Mustern in `gegenpartei`/`verwendungszweck`. **Ranking nach Hebel:** wie viele offene Buchungen ein Muster traefe × wie eindeutig es ist. So entsteht eine Liste „groesster Effekt zuerst". Nichts schreiben in diesem Schritt.
2. **Regel(n) vorschlagen.** Pro Muster eine konkrete Regel formulieren:
   - `gegenpartei_pattern` und/oder `verwendungszweck_pattern` (Substring, lose normalisiert), optional gefiltert auf `konto_id` und `vorzeichen` (`einnahme`/`ausgabe`),
   - genau eine `kategorie_id` (muss in `kategorien.json` existieren),
   - dem Nutzer die **Stichprobe** zeigen: welche offenen Buchungen die Regel jetzt traefe (Probelauf ueber `categorize()`), und falls sinnvoll auch die, die sie *nicht* trifft.
   Eine Regel darf **auch ohne aktuellen Treffer** angelegt werden (wissensbasiert, z. B. fuer kuenftige Buchungen) — das ist erlaubt, solange der Nutzer es ausdruecklich will.
3. **Bestaetigen lassen — Regel fuer Regel.** Keine Regel ohne explizites „ja". Keine Kategorie raten: ist die Zielkategorie unklar, fragen statt tippen.
4. **Regel schreiben.** Neue `regel_id` als naechste freie `REG-NNN` (Bestand scannen, es gibt keinen ID-Helfer), `status = "aktiv"`, `erstellt_am` = heutiges Datum, optional `kommentar`. Struktur gegen `schemas/kategorisierungsregeln.schema.json` pruefen, dann an `data/master/kategorisierungsregeln.json` schreiben. Eine Regel **aendern** = denselben Satz ueberschreiben; eine Regel **stilllegen** = `status = "inaktiv"` (nicht loeschen, der Categorizer ignoriert Inaktive ohnehin).
5. **Nach-Kategorisierung anstossen.** `node app/tools/recategorize.mjs` aufrufen. Das Tool rechnet den vollen Recompute (offen + `herkunft = regel`) gegen das aktuelle Regelwerk, schreibt `transaktionen.jsonl` in-place, ruft danach den Validator und gibt den Zaehlerbericht aus. Du uebergibst dem Tool **kein** Regel-Delta — der volle Recompute liefert dasselbe Ergebnis (ADR 0017).
6. **Bericht + Uebergabe.** Den Zaehlerbericht zusammenfassen (`neu_vorgeschlagen`, `wiedervorlage`, `zurueckgesetzt`, `unveraendert`, `uebersprungen`) und in `data/master/agent_log.jsonl` protokollieren. Dieser Skill **endet bei `vorgeschlagen`** — das Bestaetigen ist Sache von **kategorisierung-review**. Darauf aktiv hinweisen, wenn neue Vorschlaege oder Wiedervorlagen entstanden sind.

## Do's

- **Read-only zuerst** — erst analysieren und vorschlagen, dann nach Bestaetigung schreiben.
- **Nach Hebel priorisieren** — das groesste offene Bucket zuerst, nicht alphabetisch.
- **Transfers ruhig verregeln** — `ist_transfer` und `kategorie_id` sind orthogonal (CONTEXT, ADR-Hinweis); ein Sparuebertrag darf zusaetzlich `Sparen/Investieren` tragen.
- **Validator vertrauen, aber pruefen** — `recategorize.mjs` ruft ihn; schlaegt er an, den Fehler klaeren, nicht uebergehen.
- **Idempotenz nutzen** — der Lauf ist wiederholbar; ein zweiter Lauf ohne Regelaenderung aendert nichts.

## Don'ts

- **Keine Regel still anlegen.** Immer Vorschlag → explizite Bestaetigung. Auch wenn ein Muster „offensichtlich" ist.
- **Keine Kategorie raten.** Unklare Zielkategorie → fragen oder offen lassen, nie eine `kategorie_id` erfinden.
- **Nicht reimportieren, um nachzukategorisieren.** Der Reimport ueberspringt Bekanntes per Dedupe und ruehrt den Bestand nicht an (ADR 0017). Nach-Kategorisierung laeuft ausschliesslich ueber `recategorize.mjs`.
- **Bestaetigt/manuell/abgelehnt nicht umbiegen.** Das Tool fasst sie nicht an, und du auch nicht — ein Widerspruch wird als **Wiedervorlage** sichtbar, nicht still ueberschrieben.
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

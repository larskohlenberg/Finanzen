# Skill: Kategorisierung-Review

Betriebsanweisung fuer das Bestaetigen, Korrigieren und Ablehnen vorgeschlagener Kategorien — auf **Bucket-Granularitaet**, nicht Buchung fuer Buchung. Der Nutzer entscheidet, der Agent fuehrt und schreibt. Die App ist nur Anzeige — der Agent ist der einzige Aenderungskanal.

Alle Pfade in diesem Skill sind app-relativ: `data/...`, `schemas/...`,
`tools/...` und `docs/...` liegen unter dem App-Raum.

## Wann diesen Skill nutzen

Nutze ihn, wenn der Nutzer

- offene Vorschlaege durchgehen will („was steht zur Bestaetigung an?", „arbeite die Vorschlaege ab"),
- nach einem Regel-Lauf die neu erzeugten `vorgeschlagen`-Eintraege bestaetigen will,
- **Wiedervorlagen** klaeren will (ein Regel-Tuning hat einer fruheren Bestaetigung widersprochen).

Nicht nutzen fuer:
- Regeln anlegen/aendern → **kategorisierungsregel-pflege** (die *erzeugt* die Vorschlaege).
- Neue Belege einspielen → **import-agent**.

## Einstieg: Vorschlaege aktiv melden

Zu Beginn `DATENROOT/transaktionen.jsonl` auf `kategorisierung_status = vorgeschlagen` pruefen und **aktiv** melden: „Es liegen N Buchungen zur Bestaetigung vor, gruppiert in M Buckets." Die App erinnert nicht — der Agent muss es tun.

## Kontext, den du kennen musst

- `docs/agent-context.md` — gemeinsame Regeln fuer Status, Herkunft, Kategorisierung, Validierung und Agentenprotokoll.
- `schemas/transaktionen.schema.json` und `tools/validator.mjs`.
- `DATENROOT/transaktionen.jsonl`, `DATENROOT/kategorien.json`, `DATENROOT/agent_log.jsonl`.

## Zentrale Regeln

- Review bestaetigt, korrigiert oder lehnt bestehende `vorgeschlagen`-Eintraege ab.
- Bulk-Bestaetigung einer Regel-Kategorie setzt `kategorisierung_status = bestaetigt` und belaesst `kategorie_herkunft = regel`.
- Agenten-Einzelvorschlaege haben `kategorie_herkunft = agent`; sie sind keine Regeln und werden nicht nachkategorisiert.
- Der Agent darf offene Einzelbuchungen eigenstaendig als `vorgeschlagen` mit `kategorie_herkunft = agent` vorbereiten; das ist Review-Vorbereitung, keine finale Fachentscheidung.
- Bestaetigung eines Agenten-Einzelvorschlags setzt `kategorisierung_status = bestaetigt` und belaesst `kategorie_herkunft = agent`.
- Einzelkorrektur auf eine andere Zielkategorie setzt `kategorisierung_status = bestaetigt` und `kategorie_herkunft = manuell`.
- Ablehnung entfernt `kategorie_id`, `kategorie_herkunft` **und `matched_regeln`** und setzt `kategorisierung_status = abgelehnt`.
- Einzelkorrektur (`manuell`) entfernt ebenfalls `matched_regeln`, da die Kategorie nicht mehr aus einem Regelwerk stammt.
- Bulk-Bestaetigung einer Regel-Kategorie belaesst `kategorie_herkunft = regel` **und das bestehende `matched_regeln`** unveraendert.
- Bestaetigung eines Agenten-Einzelvorschlags belaesst `kategorie_herkunft = agent`; `matched_regeln` ist bei Agent-Vorschlaegen nie vorhanden und darf auch nach Bestaetigung nicht gesetzt werden.
- Keine Korrektur-Kategorie raten; die Zielkategorie nennt der Nutzer.

## Ablauf

1. **Buckets bilden.** Lade die `vorgeschlagen`-Eintraege und gruppiere sie:

   - **`kategorie_herkunft = regel` → primaer nach `regel_id`**, nicht nach Kategorie. Das ist die entscheidende Achse: Eine Regel ist dauerhaft und feuert auf kuenftige Importe, eine bestaetigte Buchung nicht. Wer nur Buchungen abnickt, hat das Muster nie geprueft. Der Bucket-Kopf zeigt darum **Muster, `kommentar` samt Belegstufe und Zielkategorie** — damit ist eine Bucket-Entscheidung zugleich das Urteil ueber die Regel.
   - **`kategorie_herkunft = agent` → nach Zielkategorie.** Das sind Einzelvorschlaege ohne Regel (Belegstufe E5/E6 aus **kategorisierungsregel-pflege**). `KAT-012`-Buckets sind hier der Normalfall und kein Fehler: Sie sagen „der Agent hat recherchiert und nichts gefunden" und sind genau die Liste, bei der deine Ortskenntnis gebraucht wird.

   Pro Bucket zeigen: Zielkategorie, **Anzahl** und eine **Stichprobe** (z. B. 3–5 Buchungen mit `buchungsdatum`, `gegenpartei`, `betrag`, `verwendungszweck`). Wiedervorlagen (zuvor `bestaetigt`, jetzt anderer Vorschlag) als eigenes Bucket hervorheben — hier widerspricht eine Regel einer fruheren Entscheidung.
   Fuer Agenten-Einzelvorschlaege (`kategorie_herkunft = agent`) ist die sichtbare Stichprobe Pflicht und groesser: mindestens 10 Buchungen oder 20 % des Buckets, je nachdem was kleiner ist; bei Buckets ab 5 Buchungen aber nie weniger als 5, bei kleineren Buckets alle anzeigen. Zusammensetzung: hoechste Betraege, juengste Buchungen, aelteste Buchungen und auffaellige Gegenparteien. Jede gezeigte Stichprobenzeile wird durchnummeriert, damit der Nutzer im Chat gezielt korrigieren kann. Der Agent darf nicht nur berichten, dass er Stichproben genommen hat; er muss sie dem Nutzer vor einer Bulk-Entscheidung anzeigen.
2. **Pro Bucket entscheiden lassen.** Vier Wege:
   - **Bulk-Bestaetigen** — die vorgeschlagene Kategorie stimmt fuer das ganze Bucket: `kategorisierung_status = bestaetigt`, `kategorie_herkunft` bleibt erhalten (`regel` bleibt `regel`, `agent` bleibt `agent`). Bei einem Regel-Bucket ist das zugleich die Freigabe des Musters.
   - **Regel verwerfen** *(nur Regel-Buckets)* — das Muster taugt nicht: Buchungen behandeln wie „Bulk-Ablehnen" **und** die Regel in `DATENROOT/kategorisierungsregeln.json` auf `status = "inaktiv"` setzen (nicht loeschen). Danach `tools/recategorize.mjs DATENROOT` laufen lassen, damit der Bestand die stillgelegte Regel nachvollzieht. Das ist die Rueckfallebene dafuer, dass Regeln ohne Vorab-Bestaetigung entstehen — ohne sie bliebe ein schlechtes Muster aktiv, auch wenn seine Buchungen abgelehnt wurden.
   - **Bulk-Ablehnen** — der Vorschlag ist falsch und die Buchungen sollen bewusst **unkategorisiert** bleiben: `kategorisierung_status = abgelehnt`, `kategorie_id` und `kategorie_herkunft` entfernen.
   - **Drill-down** — einzelne Buchungen ansehen und einzeln behandeln (gemischtes Bucket).

   Bei Agenten-Buckets gilt: Wenn die sichtbare Stichprobe mindestens einen plausiblen Ausreisser enthaelt, kein Bulk. Dann Drill-down oder Bucket splitten. Bulk nur, wenn die Stichprobe konsistent wirkt.

   **`KAT-012`-Buckets nie bulk-bestaetigen.** Eine Bestaetigung wuerde „noch zu klaeren" zur Endkategorie machen und die Buchung aus dem Blick nehmen. Hier ist Drill-down der Normalweg: Der Nutzer nennt die Kategorie, und wenn dabei ein wiederkehrendes Muster sichtbar wird, ist das ein Regel-Kandidat fuer **kategorisierungsregel-pflege** (Schritt 4).
3. **Einzelkorrektur.** Setzt der Nutzer fuer eine Buchung (oder Teilmenge) eine **andere** Zielkategorie, ist das ein menschlicher Akt: `kategorie_id` = die genannte Kategorie, `kategorisierung_status = bestaetigt`, `kategorie_herkunft = manuell`. Die Zielkategorie nennt der Nutzer — **nie raten**. `manuell` schuetzt den Eintrag vor kuenftigen Regellaeufen. **Aber nur fuer Einzelfaelle:** Soll aus der Korrektur eine **Regel** werden (gleiches Muster, gleiche Kategorie, vgl. Schritt 4), dann die Buchung **nicht** auf `manuell` setzen — Regel ueber **kategorisierungsregel-pflege** anlegen und Nach-Kategorisierung laufen lassen; die Buchung wird dann `kategorie_herkunft = regel` und zaehlt zur Regel. Regel **und** `manuell` auf derselben Buchung widersprechen sich.
4. **Aehnliche Faelle suchen.** Nach jeder Einzelkorrektur read-only nach aehnlichen offenen oder agent-vorgeschlagenen Buchungen suchen. Wenn ein wiederkehrendes Muster erkennbar ist, ist die Nutzerkorrektur selbst der Beleg (Belegstufe E2: derselbe Merchant ist jetzt entschieden) — dann uebernimmt **kategorisierungsregel-pflege** und legt die Regel an, mit Probelauf und ohne erneute Rueckfrage. Nur die *Kategorie* stand hier zur Debatte, nicht die Regelanlage. Diesen Uebergang ansagen, damit klar ist, dass aus der Einzelkorrektur ein dauerhaftes Muster wird.
5. **Schreiben mit Validator.** Aenderungen laufen ueber `tools/confirm.mjs` — nicht per Hand-Edit an `transaktionen.jsonl`. **Vor** dem Schreiben die Review-Tabelle zeigen; das Tool validiert nach dem Schreiben selbst.

   ```
   node app/tools/confirm.mjs --aktion=bestaetigen --regel_id=REG-219 DATENROOT
   node app/tools/confirm.mjs --aktion=bestaetigen --status=vorgeschlagen --herkunft=agent --kategorie_id=KAT-015 DATENROOT
   node app/tools/confirm.mjs --aktion=kategorie --kategorie=KAT-007 --gegenpartei="MAX MUSTERMANN" DATENROOT --schreiben
   ```

   `--regel_id=` ist der Filter, der ein Regel-Bucket exakt trifft — er matcht
   gegen `matched_regeln`. Damit ist „Bucket entschieden" genau ein Tool-Aufruf.

   Ohne `--schreiben` ist der Lauf eine Vorschau. Das Tool setzt die Herkunft
   nach der Tabelle unten automatisch — inklusive der `regel`-vs-`manuell`-Regel.
   Entschiedene Buchungen (`bestaetigt`/`abgelehnt`) ueberspringt es; eine
   bewusste Korrektur braucht `--auch-entschiedene`.
6. **Bericht.** Zaehler (bestaetigt, korrigiert, abgelehnt, offen verblieben) zusammenfassen und in `DATENROOT/agent_log.jsonl` protokollieren. Wenn Agenten-Einzelvorschlaege (`kategorie_herkunft = agent`) betroffen sind, zusaetzlich `agent_bestaetigt`, `agent_korrigiert` und `agent_abgelehnt` zaehlen. Keine urspruengliche Agenten-Kategorie an der Transaktion speichern; der Log ist die Qualitaetsspur.

## Herkunft richtig setzen — der entscheidende Punkt

| Aktion | `status` | `kategorie_herkunft` | `matched_regeln` | Wirkung beim naechsten Regel-Lauf |
| --- | --- | --- | --- | --- |
| Bulk-Bestaetigen (Regel stimmt) | `bestaetigt` | `regel` | **bleibt erhalten** | ein spaeteres Regel-Tuning, das widerspricht, kommt als **Wiedervorlage** — gewollt |
| Agenten-Vorschlag bestaetigen | `bestaetigt` | `agent` | nie vorhanden | von Regellaeufen **unangetastet** |
| Einzelkorrektur (andere Kategorie) | `bestaetigt` | `manuell` | **entfernen** | von Regellaeufen **unangetastet** |
| Ablehnen | `abgelehnt` | entfernt | **entfernen** | von Regellaeufen **unangetastet** |

Der Unterschied ist Absicht: `regel` haelt die Bestaetigung gegen ein spaeteres Regel-Tuning *ueberpruefbar*, `agent` erhaelt den Ursprung fuer spaetere Qualitaetsauswertungen, `manuell` zementiert eine bewusste Korrektur oder diktierte Ausnahme.

## Do's

- **Regel-Buckets nach `regel_id`** — mit Muster und Belegstufe im Kopf. Eine Bucket-Entscheidung ist zugleich das Urteil ueber das Muster; nach Kategorie gruppiert waere sie das nicht.
- **Bucket-Uebersicht zuerst** — Anzahl + Stichprobe, bevor irgendetwas bestaetigt wird.
- **Stichprobe vor jedem Bulk** — nie ein Bucket blind bulk-bestaetigen.
- **Agenten-Stichproben anzeigen** — bei `kategorie_herkunft = agent` die groessere gemischte Stichprobe im Chat zeigen, nicht nur intern pruefen.
- **Stichproben nummerieren** — jede sichtbare Stichprobenzeile mit stabiler Nummer in dieser Review-Runde versehen, damit der Nutzer per Nummer korrigieren kann.
- **Agenten-Bulk nur bei konsistenter Stichprobe** — sobald ein plausibler Ausreisser sichtbar ist, Drill-down oder Bucket splitten.
- **Korrekturen auswerten** — nach Nutzerkorrekturen aehnliche offene/agent-vorgeschlagene Buchungen suchen und Regel-Kandidaten vorschlagen.
- **Mit `tools/regel-vorschlag.mjs` starten, nicht mit der Einzelliste** — es buendelt den offenen Rueckstand nach Gegenpartei und sortiert nach Abdeckung. Ein Cluster mit 30 Buchungen ist eine Entscheidung, keine dreissig. Ein als `[Regelkonflikt]` markierter Cluster braucht **Regel-Reparatur** (kategorisierungsregel-pflege), keine zusaetzliche Regel.
- **Wiedervorlagen sichtbar machen** — sie sind der Grund, warum `regel`-Bestaetigungen ueberpruefbar bleiben.
- **Validator nach jedem Schreiben** (Tool prueft, Agent schreibt).

## Don'ts

- **Keinen Vorschlag still bestaetigen** — Bestaetigung ist immer eine Nutzerentscheidung.
- **Keine unsichtbare Stichprobe** — eine intern gelesene Stichprobe ersetzt nicht die Anzeige im Chat.
- **Kein Agenten-Bulk trotz Ausreisser** — ein plausibler Ausreisser in der Stichprobe reicht, um Bulk zu stoppen.
- **Keine Korrektur-Kategorie raten** — der Nutzer nennt die Zielkategorie; bei Unklarheit fragen.
- **`manuell`/`abgelehnt`/`bestaetigt` aus fremden Prozessen nicht umbiegen** — diese sind menschliche Akte.
- **Herkunft nicht verwechseln** — eine bestaetigte Regel-Kategorie bleibt `regel`, ein bestaetigter Agenten-Vorschlag bleibt `agent`; nur eine bewusst geaenderte Kategorie wird `manuell`. `manuell` zu setzen, wo der Nutzer nur „passt" sagt, zerstoert die spaetere Agenten-Qualitaetsauswertung.
- **Keine Regeln anlegen** — das ist **kategorisierungsregel-pflege**. Ein erkanntes Muster wird dorthin uebergeben, nicht hier geschrieben.
- **`KAT-012` nie bulk-bestaetigen** — „noch zu klaeren" als Endkategorie zu bestaetigen nimmt die Buchung aus dem Blick, ohne sie geklaert zu haben.
- **Ein Regel-Bucket nicht nur ablehnen** — taugt das Muster nicht, muss die Regel auf `inaktiv`. Sonst feuert sie beim naechsten Import erneut, und dieselbe Ablehnung faellt wieder an.
- **Regel und `manuell` schliessen sich aus** — wird fuer eine Buchung eine deckende Regel mit derselben Kategorie angelegt, ist ihre Herkunft `regel`, nicht `manuell`. Nie beides zugleich setzen; sonst zaehlt die Buchung nie zur Regel und die Regel wirkt faelschlich „tot".

## Wann fragen, wann handeln

**Fragen, bevor du handelst:**

- Bucket ist gemischt (Stichprobe zeigt offensichtlich verschiedene Faelle) → Drill-down anbieten, nicht bulk.
- Korrektur-Zielkategorie unklar.
- Eine Wiedervorlage betrifft eine grosse Zahl frueher bestaetigter Buchungen — Umfang ansagen.

**Selbstaendig handeln:**

- Buckets bilden, Stichproben ziehen, Wiedervorlagen markieren.
- Nach expliziter Bucket-Entscheidung schreiben und den Validator rufen.

## Wo was liegt

| Pfad | Zweck |
| --- | --- |
| `DATENROOT/transaktionen.jsonl` | Bestand (dieser Skill aendert `status`/`kategorie_id`/`kategorie_herkunft`) |
| `DATENROOT/kategorien.json` | Gueltige Ziel-`kategorie_id` fuer Korrekturen |
| `DATENROOT/agent_log.jsonl` | Lauf-Protokoll fuer die Uebergabe |
| `schemas/transaktionen.schema.json` | Struktur-Referenz |
| `tools/validator.mjs` | Validator (nach jedem Schreiben) |

## Verwandte Skills und Anschlussprozesse

- **kategorisierungsregel-pflege** — erzeugt die `vorgeschlagen`-Eintraege und die Wiedervorlagen, die dieser Skill abarbeitet. Direkter Vorprozess.
- **import-agent** — Erst-Kategorisierung beim Einspielen neuer Belege (erzeugt ebenfalls `vorgeschlagen`).

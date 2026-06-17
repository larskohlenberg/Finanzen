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

Zu Beginn `data/master/transaktionen.jsonl` auf `kategorisierung_status = vorgeschlagen` pruefen und **aktiv** melden: „Es liegen N Buchungen zur Bestaetigung vor, gruppiert in M Buckets." Die App erinnert nicht — der Agent muss es tun.

## Kontext, den du kennen musst

- `docs/agent-context.md` — gemeinsame Regeln fuer Status, Herkunft, Kategorisierung, Validierung und Agentenprotokoll.
- `schemas/transaktionen.schema.json` und `tools/validator.mjs`.
- `data/master/transaktionen.jsonl`, `data/master/kategorien.json`, `data/master/agent_log.jsonl`.

## Zentrale Regeln

- Review bestaetigt, korrigiert oder lehnt bestehende `vorgeschlagen`-Eintraege ab.
- Bulk-Bestaetigung einer Regel-Kategorie setzt `kategorisierung_status = bestaetigt` und belaesst `kategorie_herkunft = regel`.
- Einzelkorrektur auf eine andere Zielkategorie setzt `kategorisierung_status = bestaetigt` und `kategorie_herkunft = manuell`.
- Ablehnung entfernt `kategorie_id` und `kategorie_herkunft` und setzt `kategorisierung_status = abgelehnt`.
- Keine Korrektur-Kategorie raten; die Zielkategorie nennt der Nutzer.

## Ablauf

1. **Buckets bilden.** Lade die `vorgeschlagen`-Eintraege und gruppiere sie nach **vorgeschlagener `kategorie_id`** (und, wo unterscheidbar, nach der treffenden Regel). Pro Bucket zeigen: Zielkategorie, **Anzahl** und eine **Stichprobe** (z. B. 3–5 Buchungen mit `buchungsdatum`, `gegenpartei`, `betrag`, `verwendungszweck`). Wiedervorlagen (zuvor `bestaetigt`, jetzt anderer Vorschlag) als eigenes Bucket hervorheben — hier widerspricht eine Regel einer fruheren Entscheidung.
2. **Pro Bucket entscheiden lassen.** Drei Wege:
   - **Bulk-Bestaetigen** — die Regel-Kategorie stimmt fuer das ganze Bucket: `kategorisierung_status = bestaetigt`, `kategorie_herkunft = regel` (bleibt `regel`).
   - **Bulk-Ablehnen** — der Vorschlag ist falsch und die Buchungen sollen bewusst **unkategorisiert** bleiben: `kategorisierung_status = abgelehnt`, `kategorie_id` und `kategorie_herkunft` entfernen.
   - **Drill-down** — einzelne Buchungen ansehen und einzeln behandeln (gemischtes Bucket).
3. **Einzelkorrektur.** Setzt der Nutzer fuer eine Buchung (oder Teilmenge) eine **andere** Zielkategorie, ist das ein menschlicher Akt: `kategorie_id` = die genannte Kategorie, `kategorisierung_status = bestaetigt`, `kategorie_herkunft = manuell`. Die Zielkategorie nennt der Nutzer — **nie raten**. `manuell` schuetzt den Eintrag vor kuenftigen Regellaeufen.
4. **Schreiben mit Validator.** Aenderungen in-place in `transaktionen.jsonl` (ein Objekt pro Zeile, nur die betroffenen Felder anfassen). **Vor** dem Schreiben die Review-Tabelle zeigen, **nach** dem Schreiben `tools/validator.mjs` laufen lassen.
5. **Bericht.** Zaehler (bestaetigt, korrigiert, abgelehnt, offen verblieben) zusammenfassen und in `data/master/agent_log.jsonl` protokollieren.

## Herkunft richtig setzen — der entscheidende Punkt

| Aktion | `status` | `kategorie_herkunft` | Wirkung beim naechsten Regel-Lauf |
| --- | --- | --- | --- |
| Bulk-Bestaetigen (Regel stimmt) | `bestaetigt` | `regel` | ein spaeteres Regel-Tuning, das widerspricht, kommt als **Wiedervorlage** — gewollt |
| Einzelkorrektur (andere Kategorie) | `bestaetigt` | `manuell` | von Regellaeufen **unangetastet** |
| Ablehnen | `abgelehnt` | entfernt | von Regellaeufen **unangetastet** |

Der Unterschied ist Absicht: `regel` haelt die Bestaetigung gegen ein spaeteres Regel-Tuning *ueberpruefbar*, `manuell` zementiert eine bewusste Ausnahme.

## Do's

- **Bucket-Uebersicht zuerst** — Anzahl + Stichprobe, bevor irgendetwas bestaetigt wird.
- **Stichprobe vor jedem Bulk** — nie ein Bucket blind bulk-bestaetigen.
- **Wiedervorlagen sichtbar machen** — sie sind der Grund, warum `regel`-Bestaetigungen ueberpruefbar bleiben.
- **Validator nach jedem Schreiben** (Tool prueft, Agent schreibt).

## Don'ts

- **Keinen Vorschlag still bestaetigen** — Bestaetigung ist immer eine Nutzerentscheidung.
- **Keine Korrektur-Kategorie raten** — der Nutzer nennt die Zielkategorie; bei Unklarheit fragen.
- **`manuell`/`abgelehnt`/`bestaetigt` aus fremden Prozessen nicht umbiegen** — diese sind menschliche Akte.
- **Herkunft nicht verwechseln** — eine bestaetigte Regel-Kategorie bleibt `regel`; nur eine bewusst geaenderte Kategorie wird `manuell`. `manuell` zu setzen, wo der Nutzer nur „passt" sagt, verhindert faelschlich kuenftige Wiedervorlagen.
- **Keine Regeln anlegen** — das ist **kategorisierungsregel-pflege**.

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
| `data/master/transaktionen.jsonl` | Bestand (dieser Skill aendert `status`/`kategorie_id`/`kategorie_herkunft`) |
| `data/master/kategorien.json` | Gueltige Ziel-`kategorie_id` fuer Korrekturen |
| `data/master/agent_log.jsonl` | Lauf-Protokoll fuer die Uebergabe |
| `schemas/transaktionen.schema.json` | Struktur-Referenz |
| `tools/validator.mjs` | Validator (nach jedem Schreiben) |

## Verwandte Skills und Anschlussprozesse

- **kategorisierungsregel-pflege** — erzeugt die `vorgeschlagen`-Eintraege und die Wiedervorlagen, die dieser Skill abarbeitet. Direkter Vorprozess.
- **import-agent** — Erst-Kategorisierung beim Einspielen neuer Belege (erzeugt ebenfalls `vorgeschlagen`).

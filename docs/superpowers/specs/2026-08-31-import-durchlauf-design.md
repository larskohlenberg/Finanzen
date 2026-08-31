# Import-Durchlauf: Auto-Freigabe mit Gate und Lernschleife

Stand 2026-08-31. Ersetzt den manuellen Zwischenschritt zwischen Import und
Bestand durch **einen** Lauf, der kategorisiert, verregelt, prueft, freigibt und
aus dem eigenen Ergebnis lernt.

## Problem

Der Engpass ist nicht die Rechenarbeit, sondern die Zustimmungszeremonie.

Gemessen am Bestand vom 2026-08-31:

| | |
| --- | --- |
| Transaktionen gesamt | 4.378 |
| `bestaetigt` | 3.970 |
| `vorgeschlagen` | 408 |
| davon `kategorie_herkunft = regel` | 343 in 34 Buckets |
| davon `kategorie_herkunft = agent` | 65 in 4 Buckets |

Die Tools sind bereits gebuendelt: `confirm.mjs --regel_id=REG-271` erledigt ein
31er-Bucket in einem Aufruf, `regel-vorschlag.mjs` clustert den Offen-Stapel,
`recategorize.mjs` faehrt den Voll-Recompute. Was Zeit frisst, ist die
Vorschrift aus `kategorisierung-review.md`, pro Bucket eine nummerierte
Stichprobe zu zeigen und auf eine Entscheidung zu warten: 38 Buckets sind 38
Dialogrunden. Dazu kommen vier harte Haltestellen im Import (unklares Format,
unbekanntes Konto, nicht reconcilierbarer Kopf-Kontostand, fehlender
Saldo-Anker), die einen Lauf mittendrin abbrechen.

Zweites Problem: `agent_log.jsonl` fuehrt seit 106 Eintraegen Qualitaetsdaten
(`agent_bestaetigt`, `agent_korrigiert`, `agent_abgelehnt`, `anzahl_fehler`,
`neue_regeln`, `notiz`) und wird von keinem Lauf je gelesen. Das Log ist
write-only; es gibt keinen Rueckkanal von einem Lauf in den naechsten.

## Entscheidungen

Getroffen im Brainstorming vom 2026-08-31:

1. **Alles wird auto-freigegeben**, Regel- wie Agentenvorschlaege. Kontrolle
   erfolgt nachtraeglich ueber einen Pruefbericht, nicht vorab ueber Dialog.
2. **Auto-Freigaben bleiben von Regellaeufen anfassbar.** Eine Auto-Freigabe ist
   kein menschlicher Akt; ein spaeterer Regellauf darf sie neu bewerten.
3. **Drei Pruefungen**: harte Blocker (Validator, Dedupe, Saldo-Kette),
   Regel-Qualitaetsgate, Ausreisserbericht. Beleg-Abgleich gegen `Belege/`
   wurde bewusst abgewaehlt.
4. **Der Lauf haelt nie an**, erfindet aber auch nichts: unbekanntes Konto wird
   angelegt, unlesbare Zeilen gehen nach `error/`, ein nicht reconcilierbarer
   Kontostand wird **nicht** geschrieben.
5. **Die Freigabe ist ein Bestands-Tool**, kein Import-Schritt — damit wirkt
   schon der erste Lauf auf die vorhandenen 408 Vorschlaege.
6. **Modell und Effort werden ueber Subagenten festgelegt**; der Durchlauf-Skill
   orchestriert nur. `belegstufe` wird Pflichtfeld an der Regel.

## Architektur

```
Rohdatei --> Station 1 --> Station 2 --> Station 3 --> Station 4 --> Station 5
             Normali-      Regelanlage   freigabe      pruef-        lernen
             sierung       Belegleiter   .mjs          bericht.mjs   .mjs
             + import      E1-E6                                     |
             .mjs                                                    |
             ^ Subagent    ^ Subagent    ^ Tool        ^ Tool        ^ Tool
                                                                     |
             +-------------------- liest beim naechsten Lauf <-------+
```

Zwei Stationen sind Agent-Urteil, drei sind deterministische Tools mit
`node --test`. Das entspricht der Trennung aus ADR 0003 und ADR 0010: Erkennen
und Vorschlagen ist Urteil, Matchen und Rechnen ist Tool.

`app/docs/skills/import-durchlauf.md` ist ein **Skill**, kein Agent. Du
orchestrierst in der Hauptsitzung und bleibst damit der Korrekturkanal (ADR
0006). Der Skill ruft die Tools direkt und delegiert nur die zwei
Urteilsstationen an Subagenten.

### Warum das Gate und nicht mehr Sorgfalt

Das Gate ist modellunabhaengig. Ein schwaecheres Modell erzeugt dort nicht mehr
falsche Daten, sondern mehr durchgefallene Regeln — der Schaden materialisiert
sich als sichtbare Arbeit, nicht als stille Korruption im Bestand. Das ist der
tragende Gedanke der gesamten Konstruktion und der Grund, warum die
Zustimmungszeremonie ersatzlos entfallen kann.

Station 1 hat diesen Schutz nur teilweise: die Saldo-Kettenpruefung faengt
Betrags- und Vorzeichenfehler, aber keine vertauschte Gegenpartei. Deshalb
bekommt genau diese Station den hoechsten Effort.

## Datenmodell

### `bestaetigt_durch` an der Transaktion

```
bestaetigt_durch: "auto" | "mensch"
```

Vorhanden **genau dann**, wenn `kategorisierung_status = bestaetigt`. Der
Validator erzwingt beide Richtungen: keine Bestaetigung ohne Urheber, kein
Urheber ohne Bestaetigung.

Anzupassen an drei Stellen:
- `app/schemas/transaktionen.schema.json` (Property + Invariante)
- Schema-Spiegel in `app/tools/validate-core.mjs` (~Zeile 69)
- Invariantenpruefung in `app/tools/validate-core.mjs` (~Zeile 413)

Das Feld ist kein Audit-Feld, sondern Zustand mit drei Funktionen: es steuert
`istKandidat()` in der Nach-Kategorisierung, es definiert die Referenzmenge der
Spezifitaetspruefung, und es trennt im Pruefbericht Gesehenes von Ungesehenem.

### `istKandidat()` in `recategorize.mjs`

```js
function istKandidat(tx) {
  if (tx.kategorie_herkunft === "manuell") return false;
  if (tx.kategorisierung_status === "abgelehnt") return false;
  if (tx.bestaetigt_durch === "auto") return true;   // NEU
  return tx.kategorisierung_status === "offen" || tx.kategorie_herkunft === "regel";
}
```

Folge: Ein auto-freigegebener `KAT-012`-Eintrag wird von jeder spaeter
angelegten passenden Regel eingesammelt. Der blinde Fleck schrumpft mit jedem
Regel-Tuning von selbst, ohne dass jemand danach sucht.

`bestaetigt_durch = "mensch"` bleibt geschuetzt wie bisher `manuell`.

### `belegstufe` an der Kategorisierungsregel

```
belegstufe: enum ["E1", "E2", "E3", "E4"]
```

**Der Validator erzwingt den Wertebereich, das Gate erzwingt die Anwesenheit.**
Ein globales `required` wuerde die 295 Bestandsregeln sofort ungueltig machen.
Stattdessen: fehlt die Stufe, faellt die Regel durchs Gate und gibt nichts
automatisch frei. Das erzeugt genau den Druck, sie nachzutragen, ohne den
Bestand zu blockieren — und setzt "E5/E6 werden nie Regeln" dort durch, wo es
wirkt.

Bisher steht die Belegstufe nur als Prosa im `kommentar` und ist damit weder
pruefbar noch sortierbar. Als Pflichtfeld setzt sie die Belegleiter-Regel
"E5/E6 werden nie Regeln" technisch durch statt nur dokumentarisch, und der
Pruefbericht kann Regeln nach Evidenzschwaeche ordnen.

Der typische Fehlermodus eines Agenten ist nicht fehlendes Nachdenken, sondern
das Deklarieren von E6 ("nichts gefunden") als E4 ("Web-Recherche hat es
geklaert"). Solange die Stufe Fliesstext ist, sieht das niemand.

### Felder im `agent_log.jsonl`

Keine neue Datei, keine neue Mechanik — der Log existiert und wird um vier
Felder erweitert, damit `lernen.mjs` ihn auswerten kann:

| Feld | Geschrieben von | Inhalt |
| --- | --- | --- |
| `freigaben` | `freigabe.mjs` | `[{regel_id, belegstufe, anzahl}]` je auto-freigegebener Regel; Agentenvorschlaege unter `regel_id: null` mit `kategorie_id` |
| `gate_durchfall` | `freigabe.mjs` | `[{regel_id, grund}]` mit `grund` aus `konflikt \| spezifitaet \| belegstufe \| inaktiv \| kommentar` |
| `korrekturen` | `confirm.mjs` | `[{regel_id, belegstufe, von_kategorie, nach_kategorie, anzahl}]` beim Ueberschreiben von `bestaetigt_durch = "auto"` |
| `normalisierung` | Station 1 | `{quelle, format, zeilen_gesamt, zeilen_error, reconciliation_differenz}` |

`korrekturen` ist der entscheidende Eintrag: `app/data/**` ist gitignored, es
gibt also keine History, aus der sich eine Korrektur nachtraeglich ableiten
liesse. Sie muss im Moment der Korrektur erfasst werden — und `confirm.mjs` hat
dort alles zur Hand, weil es `matched_regeln` und `bestaetigt_durch` der
Buchung sieht, die es gerade ueberschreibt.

Kein Zaehler wird an der Regel persistiert. Aggregation bei Lesezugriff, wie
ADR 0018 es fuer den Hit-Count bereits entschieden hat.

## Komponenten

### `app/tools/freigabe.mjs` (neu)

Reine Funktion plus CLI plus `node --test`, Bauart wie `recategorize.mjs`.
Arbeitet ueber den Bestand, nicht ueber den Import-Stream.

```
freigabe({ transaktionen, regeln, kategorien }) -> { transaktionen, report }
```

Nimmt alle Buchungen mit `kategorisierung_status = "vorgeschlagen"`.

**Agentenvorschlaege (`kategorie_herkunft = "agent"`)**: werden freigegeben.
Sie sind ueber `istKandidat()` wieder einsammelbar, sobald eine passende Regel
entsteht.

**Regelvorschlaege (`kategorie_herkunft = "regel"`)**: freigegeben nur, wenn
**jede** Regel aus `matched_regeln` alle vier Kriterien besteht:

| Kriterium | Quelle |
| --- | --- |
| `status = "aktiv"` | Regelbestand |
| `kommentar` nicht leer | Validator erzwingt seit ADR 0018 |
| `belegstufe` in E1-E4 und nicht gesperrt | neu |
| Muster besteht Spezifitaetspruefung | neu |

**Kein Konfliktkriterium.** `categorize()` liefert bei mehreren Regeln mit
verschiedenen Kategorien `status = "offen"`, nicht `"vorgeschlagen"` — eine
konfliktbehaftete Buchung erreicht die Freigabe also nie. Eine Konfliktpruefung
im Gate waere toter Code. Der Probelauf bleibt dort, wo er wirkt: beim Anlegen
einer Regel in `kategorisierungsregel-pflege`.

Faellt eine Regel durch, bleiben ihre Buchungen `vorgeschlagen` und die Regel
landet mit Grund im Pruefbericht.

Ob eine Belegstufe gesperrt ist, wird **nicht gespeichert**, sondern bei jedem
Lauf aus dem Log neu gerechnet: `freigabe.mjs` ruft dafuer die Aggregation aus
`lernen.mjs`. Damit gibt es keinen Sperrzustand, der veralten oder mit den
Daten auseinanderlaufen koennte — dieselbe Begruendung, mit der ADR 0018 den
persistierten Hit-Count verworfen hat.

Geschrieben wird ueber die Mechanik von `confirm.mjs`, erweitert um
`bestaetigt_durch = "auto"`. Nach dem Schreiben laeuft der Validator.

#### Spezifitaetspruefung

> Fuer jeden Alternationszweig eines Musters: zaehle, ueber wie viele
> **verschiedene** `kategorie_id` er in der Referenzmenge streut. Streuen
> **alle** Zweige ueber >= 3 Kategorien, faellt die Regel durch.

Die Referenzmenge ist ausschliesslich `bestaetigt_durch = "mensch"` plus
`kategorie_herkunft = "manuell"`.

Diese Einschraenkung ist nicht kosmetisch: gegen den Gesamtbestand gerechnet
haette eine schlechte Regel, die soeben 650 Buchungen auf eine Kategorie
auto-bestaetigt hat, ploetzlich Streuung 1 und wuerde sich selbst als spezifisch
beweisen. Die Referenzmenge muss unbestechlich sein.

Der Zweig wird mit `normalizeLoose` normalisiert und als Substring gematcht —
dieselbe Semantik wie `patternMatches` in `categorizer.mjs`, damit Gate und
Categorizer nicht auseinanderlaufen.

Getroffen wird damit der in `kategorisierungsregel-pflege.md` dokumentierte
Fehlermodus: `Deutsche.Post.AG` matcht ueber den Token `salzgitter` 650
Buchungen quer ueber elf Kategorien. Streuung 11, Gate zu.

**Cold-Start ist bewusst akzeptiert.** Ist die menschlich bestaetigte Basis fuer
einen Merchant duenn, ist die Streuung 0 oder 1 und die Regel kommt durch. Die
Pruefung ist ein **Veto gegen nachweislich unspezifische Muster**, kein Beweis
fuer Spezifitaet. Sie kann nichts durchwinken, was sonst gestoppt worden waere.

### `app/tools/pruefbericht.mjs` (neu)

Read-only, blockiert nie, Exit-Code immer 0. Ersetzt die 38 Bucket-Dialoge
durch eine Liste:

- die 15 groessten auto-freigegebenen Betraege
- Merchants, die in diesem Lauf erstmals kategorisiert wurden
- Kategorien, deren Monatssumme deutlich vom Median der letzten sechs Monate
  abweicht
- **alle** auto-freigegebenen `KAT-012`
- Regeln, die am Gate gescheitert sind, mit Grund
- Regeln mit `belegstufe = E4` (reine Web-Recherche) als eigene Liste
- Konten ohne Saldo-Anker und Reconciliation-Differenzen
- die aktuellen Lernmetriken aus `lernen.mjs`

### `app/tools/lernen.mjs` (neu)

Aggregation ueber `agent_log.jsonl`. Kein Urteil, keine Prosa, nur Zahlen.

Zwei Modi, wie `confirm.mjs` sie bereits kennt: ohne Flag ist der Lauf eine
reine Auswertung, mit `--anwenden` schreibt er die aus den Metriken folgenden
Stilllegungen (siehe Lernschleife Stufe 2) und ruft danach `recategorize.mjs`.
Das Tool aendert ausschliesslich `status` an Regeln — nie eine Transaktion.

| Metrik | Berechnung |
| --- | --- |
| Korrekturquote je Regel | `korrekturen[regel_id] / freigaben[regel_id]` |
| Korrekturquote je Belegstufe | dasselbe, gruppiert ueber `belegstufe` |
| Gate-Durchfallquote je Grund | `gate_durchfall` gruppiert ueber `grund` |
| `KAT-012`-Quote je Lauf | Anteil der Agentenvorschlaege auf `KAT-012` |
| Fehlerquote je Format | `normalisierung.zeilen_error / zeilen_gesamt` je `format` |

### Aenderungen an bestehenden Komponenten

| Datei | Aenderung |
| --- | --- |
| `confirm.mjs` | setzt `bestaetigt_durch = "mensch"`; schreibt `korrekturen` ins Log beim Ueberschreiben von `auto` |
| `recategorize.mjs` | `istKandidat()` um `bestaetigt_durch === "auto"` erweitert |
| `regel-probelauf.mjs` | Spezifitaetspruefung ergaenzt, damit eine unspezifische Regel schon beim Anlegen auffaellt |
| `validate-core.mjs` | Invarianten fuer `bestaetigt_durch` und `belegstufe` |
| `transaktionen.schema.json` | Property `bestaetigt_durch` |
| `kategorisierungsregeln.schema.json` | Property `belegstufe`, required |
| `import-agent.md` | die vier Haltestellen entfallen (siehe unten) |
| `kategorisierung-review.md` | vom Pflicht-Gate zum Korrekturkanal |

## Import ohne Haltestellen

| Fall | bisher | kuenftig |
| --- | --- | --- |
| Konto fehlt in `konten.json` | Vorschlag, explizite Bestaetigung | direkt anlegen, im Bericht nennen |
| Format oder Bank unklar | nachfragen | Zeile nach `error/` |
| Kopf-Kontostand reconciliert | nachfragen | als Zeitwert schreiben |
| Kopf-Kontostand reconciliert nicht | nachfragen | **nicht schreiben**, Differenz in den Bericht |
| kein belegter Anker vorhanden | nachfragen | weiter, Konto als "ohne Anker" im Bericht |

Die vierte Zeile ist die wichtige: ein falscher Saldo-Anker verschiebt die
gesamte Liquiditaetsrechnung und ist, anders als eine Kategorie, nicht nebenbei
korrigierbar. Durchlaufen heisst nicht raten.

## Subagenten und Orchestrierung

```
.claude/agents/
  import-normalisierung.md   model: opus   effort: xhigh
                             tools: Read, Grep, Glob, Bash
  regel-recherche.md         model: opus   effort: xhigh
                             tools: Read, Grep, Glob, Bash, WebSearch, WebFetch
```

Die Schluessel `model` und `effort` sind an vorhandenen Agent-Definitionen im
Plugin-Cache verifiziert (`effort` mit Werten `medium` und `xhigh` in sieben
Definitionen im Einsatz).

**Die Definitionen duplizieren die Skill-Dokumente nicht, sie verweisen darauf.**
`regel-recherche.md` ist duenne Frontmatter plus "folge
`app/docs/skills/kategorisierungsregel-pflege.md`". Andernfalls entstuenden zwei
Wahrheiten, die auseinanderdriften.

Die Subagenten schreiben selbst und liefern einen Bericht zurueck. Der
Kontrollpunkt ist das Gate danach, nicht der Schreibvorgang.

Warum ueberhaupt Subagenten statt einer Betriebsanweisung im Skill: Ein
Skill-Dokument kann kein Modell erzwingen, es ist eine Bitte. Steht
`effort: xhigh` in der Frontmatter, gilt es bei jedem Lauf — auch dann, wenn
niemand mehr weiss, dass hier gruendlich nachgedacht werden muss. Dazu kommt die
Kontexttrennung: die Belegleiter-Recherche ueber 30+ Cluster erzeugt Websuchen
und Bestandsabfragen in Mengen, die sonst mit dem Ueberblick konkurrieren, den
das Orchestrieren braucht.

**Effort ist gestaffelt, nicht uniform.** An den Tool-Stationen entscheidet
Code; dort waere hoher Effort reine Kosten.

## Die Lernschleife

Trennlinie: **Zahlen sind Daten und laufen vollautomatisch. Anweisungstext
braucht Zustimmung.** Nicht aus Vorsicht, sondern weil ein still veraenderter
Anweisungstext der einzige Teil des Systems waere, dessen Fehler der Nutzer
nicht mehr bemerken kann — eine falsche Kategorie betrifft eine Buchung, eine
falsche Selbstanweisung jeden kuenftigen Lauf.

### Stufe 1: Messen (vollautomatisch)

`lernen.mjs` laeuft am Ende jedes Durchlaufs und aggregiert `agent_log.jsonl`.
Keine Introspektion, keine Selbsteinschaetzung — nur beobachtete Ergebnisse
gegen den einzigen verfuegbaren Grundwahrheitswert: die Korrekturen des Nutzers.

### Stufe 2: Handeln, wo es Daten sind (vollautomatisch)

**Regel-Stilllegung.** Eine Regel mit Korrekturquote > 30 % bei mindestens 10
Auto-Freigaben wird automatisch auf `status = "inaktiv"` gesetzt, danach laeuft
`recategorize.mjs`. Die Buchungen kommen als Vorschlaege zurueck.

**Belegstufen-Sperre.** Eine Belegstufe, deren Korrekturquote > 25 % bei
mindestens 20 Auto-Freigaben liegt, wird von der Auto-Freigabe ausgenommen;
ihre Regeln erzeugen dann nur noch Vorschlaege. Die Sperre faellt, wenn die
Quote ueber die letzten 20 Freigaben unter 15 % sinkt. Die Hysterese verhindert
Flattern an der Schwelle.

Damit lernt das Gate seine eigene Strenge aus beobachtetem Verhalten statt aus
einer einmal gesetzten Annahme.

**Zu den Schwellenwerten, in eigener Sache:** Im Brainstorming habe ich eine
risikobasierte Freigabe mit dem Argument abgelehnt, erfundene Schwellen seien
genau das, was die Belegleiter verbietet. Der Unterschied hier ist zweifach.
Erstens messen diese Schwellen kein Urteil darueber, was eine Buchung bedeutet,
sondern beobachtetes Verhalten gegen die Korrekturen des Nutzers. Zweitens
steuern sie eine **reversible und sichtbare** Aktion — eine stillgelegte Regel
steht im Pruefbericht und ist ein Datenwert, kein verlorener Inhalt. Die Werte
30/25/15 sind Startwerte; sobald genug Laeufe vorliegen, sind sie selbst
Gegenstand der Messung.

### Stufe 3: Vorschlagen, wo es Anweisungen sind

Erkenntnisse ueber Normalisierung ("bei dieser Bank ist die Gegenpartei
richtungsabhaengig") sind Anweisungen, keine Daten. Station 1 formuliert sie als
konkreten Diff-Vorschlag fuer `import-agent.md` und legt ihn in den
Pruefbericht. Der Vorschlag entsteht vollautomatisch; uebernommen wird er auf
ein Wort des Nutzers.

**Kein maschinenlesbares Importprofil.** Der Versuch ist dokumentiert
gescheitert: `DD.MM.YY` und richtungsabhaengige Gegenpartei sind im Profilformat
nicht abbildbar (ADR 0005 verbietet ohnehin bankspezifische Parser). Prosa im
Skill-Dokument ist der richtige Ort.

### Stufe 4: Lesen (vollautomatisch)

`import-durchlauf.md` beginnt damit, `lernen.mjs` zu rufen und die Metriken vor
den Lauf zu stellen. Das ist der eigentliche Rueckkanal: bisher wird das Log bei
jedem Lauf gefuellt und von keinem gelesen.

## Skill-Landschaft danach

| Skill | Rolle |
| --- | --- |
| `import-durchlauf.md` (neu) | duenner Orchestrator, ruft Tools und delegiert die zwei Urteilsstationen |
| `import-agent.md` | Haltestellen entfallen, sonst unveraendert; Ziel der Stufe-3-Vorschlaege |
| `kategorisierungsregel-pflege.md` | unveraendert; wird zum Inhalt von `regel-recherche.md` |
| `kategorisierung-review.md` | vom Pflicht-Gate zum Korrekturkanal |

Zwei ADRs begleiten die Aenderung:

- **ADR 0025 — Auto-Freigabe mit Gate statt Vorab-Review.** Praezisiert die
  Kandidatendefinition aus ADR 0017 und loest den Review-Zwang ab.
- **ADR 0026 — Lernschleife aus dem Agent-Log.** Haelt die Trennung zwischen
  automatischer Datenanpassung und zustimmungspflichtiger Textaenderung fest.

## Tests

Neue Tools bekommen `node --test` wie die sieben vorhandenen Tool-Tests.

`freigabe.test.mjs`:
- Regel mit Probelauf-Konflikt gibt nicht frei
- Muster mit Streuung >= 3 gibt nicht frei
- **Streuung wird nur gegen `mensch` und `manuell` gerechnet** — der
  Zirkularitaetstest: derselbe Bestand einmal mit und einmal ohne
  auto-Freigaben liefert dieselbe Streuung
- Regel ohne `belegstufe` in E1-E4 gibt nicht frei
- Agentenvorschlag wird freigegeben mit `bestaetigt_durch = "auto"`
- Buchung einer durchgefallenen Regel bleibt `vorgeschlagen`

`lernen.test.mjs`:
- Korrekturquote je Regel aus synthetischem Log
- Belegstufen-Sperre greift ab Schwelle und Mindestmenge
- Hysterese: Sperre faellt erst unter 15 %, nicht schon unter 25 %
- leeres Log liefert leere Metriken statt Division durch null

Erweiterungen:
- `recategorize.test.mjs`: `auto`-Eintrag ist Kandidat, `mensch`-Eintrag nicht
- `confirm.test.mjs`: setzt `bestaetigt_durch = "mensch"`; schreibt
  `korrekturen` beim Ueberschreiben einer Auto-Freigabe
- Validator: Bestaetigung <-> Urheber in beide Richtungen; `belegstufe`
  Pflicht bei neuen Regeln

Testdaten sind synthetisch. `tests/` ist versioniert — keine echten IBANs,
Kontonummern oder Namen.

## Migration

1. **Schema und Validator** erweitern, Invarianten zunaechst nur pruefen, wo das
   Feld vorhanden ist.
2. **Backfill `bestaetigt_durch = "mensch"`** fuer die 3.970 bestehenden
   `bestaetigt`-Eintraege. Konservativ: sie bleiben damit vor Regellaeufen
   geschuetzt, so wie heute. Als `"auto"` wuerde der erste `recategorize`-Lauf
   sie alle neu bewerten.
3. **`belegstufe`**: Pflicht gilt fuer neue Regeln. Die 295 Bestandsregeln
   erhalten die Stufe beim naechsten Anfassen, sonst blockierte der Validator
   sofort den gesamten Bestand.
4. **Erster Durchlauf** gegen den vorhandenen Stapel: 65 Agentenvorschlaege
   direkt freigegeben, 343 regelbasierte durchs Gate.

## Reihenfolge der Umsetzung

Die Lernschleife misst Freigaben gegen spaetere Korrekturen. Am Tag der
Implementierung enthaelt `agent_log.jsonl` kein einziges solches Paar — die
Metriken waeren leer und ihre Schwellen unpruefbar. Deshalb zwei Phasen:

**Phase 1 — Durchlauf.** Schema, Validator, `freigabe.mjs`,
`pruefbericht.mjs`, die Aenderungen an `confirm.mjs`, `recategorize.mjs` und
`regel-probelauf.mjs`, die zwei Subagenten, `import-durchlauf.md` und die
entfallenden Haltestellen. Ab hier laeuft der Import in einem Zug.

Die neuen Log-Felder (`freigaben`, `gate_durchfall`, `korrekturen`,
`normalisierung`) gehoeren **in Phase 1**, obwohl sie erst in Phase 2
ausgewertet werden. Sonst startet Phase 2 ohne Datenbasis und muss erneut
warten.

**Phase 2 — Lernschleife.** `lernen.mjs` samt Stilllegung und
Belegstufen-Sperre, sobald mehrere Laeufe Daten geliefert haben. Bis dahin
zeigt der Pruefbericht die Rohzaehlungen; das ist bereits nuetzlich und macht
sichtbar, ob die Startwerte 30/25/15 ueberhaupt in der richtigen
Groessenordnung liegen.

Phase 2 beginnt nicht nach einer festen Zeit, sondern sobald eine Belegstufe
die Mindestmenge von 20 Auto-Freigaben erreicht hat. Der Pruefbericht meldet
das von selbst.

## Bewusst nicht gebaut

- **Kein Konfidenz-Score und keine Betragsschwellen** in der Freigabe.
- **Kein Beleg-Abgleich gegen `Belege/`** — abgewaehlt wegen Laufzeit bei
  begrenztem Nutzen.
- **Kein neuer Audit-Log.** `agent_log.jsonl` existiert; er wird gelesen, nicht
  ersetzt.
- **Kein persistierter Zaehler an der Regel** — Aggregation bei Lesezugriff,
  wie ADR 0018 entschieden hat.
- **Keine App-Aenderung.** `bestaetigt_durch` bekommt vorerst keine Ansicht;
  der Pruefbericht ist der Kanal. Erst wenn er sich als unzureichend erweist,
  ist eine Filteransicht faellig.
- **Kein Triage-Split der Regelrecherche** in einen billigen lokalen und einen
  teuren Web-Schritt. Die Belegleiter legt diese Reihenfolge zwar nahe
  (E1/E2 vor E3/E4), aber ob `opus` mit `xhigh` ueber 30 Cluster zu langsam
  ist, ist noch nicht gemessen.

## Offene Punkte

- **Backfill-Richtung.** Falls einzelne der 3.970 Bestaetigungen in frueheren
  Sitzungen eher zuegig durchgewunken als geprueft wurden, waere `"auto"` fuer
  diese ehrlicher — sie kaemen dann bei kuenftigen Regellaeufen von selbst
  wieder hoch. Die Spec setzt `"mensch"`; gezielte Ausnahmen sind beim
  Implementieren nachtragbar.
- **Bekannte Datenluecke, unabhaengig von diesem Vorhaben.** KTO-006
  hat einen Anker im Juni 2026, aber null Transaktionen. Das bricht die
  Reconciliation-Kette und wird im Pruefbericht als Konto ohne Bewegungen
  auftauchen.

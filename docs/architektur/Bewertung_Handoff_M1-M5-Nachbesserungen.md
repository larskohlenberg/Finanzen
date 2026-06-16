# Kritische Bewertung: Handoff „Nachbesserungen am M1–M5-Stand"

**Quelle:** `…/Projekte/Finanzen_OneShot/docs/handoffs/handoff-m1-m5-nachbesserungen.md`
**Bewertet am:** 2026-06-16 · Branch `feat/m1-m5-nachbesserungen`

Das Handoff vergleicht Runde 2 mit einer One-Shot-Referenz und schlägt 10 Härtungen vor.
Kernbefund der Prüfung am echten Code: **Ein Großteil des Fundaments ist in Runde 2
bereits umgesetzt** — teils sauberer als in der Referenz. Mehrere Vorschläge widersprechen
sogar bewussten, getesteten Entscheidungen dieses Projekts. Umgesetzt wurde der Rest, der
tatsächlich eine Lücke schließt und zur Philosophie „Lücke zeigen statt raten" passt.

Legende: ✅ umgesetzt · ☑️ war bereits vorhanden · ❌ bewusst nicht übernommen · ⏭️ sinnvoll, aber als eigener Schritt verschoben

---

## §1 Strikte Betragsvalidierung — ✅ umgesetzt (teilweise war schon da)

Befund verifiziert: `toCents("")→0`, `toCents("1.5")→150` ([text.mjs:12](../../app/tools/lib/text.mjs)) sind
nachsichtig. Der Validator selbst lehnte `""`, `"1,5"`, `"1.5"` aber **schon** über das Muster
`^-?\d+\.\d{2}$` ab. Echte Lücken waren nur: `-0.00` und führende Nullen (`01.50`) passierten,
und der nachsichtige `toCents`-Pfad am Importeingang.

Umsetzung:
- Neuer strikter Helper `istGueltigerBetrag` ([text.mjs](../../app/tools/lib/text.mjs)): `^-?(0|[1-9]\d*)\.\d{2}$`, verbietet `-0.00`. `toCents` bleibt unverändert als Anzeige-/Konvertierungshelfer (wie vom Handoff vorgesehen).
- Validator: alle Cent-Felder (betrag, wert, anfangsbetrag, sollrate, anschaffungskosten, transfer-betrag) auf `money`/`nonNegative` umgestellt; `zinssatz` (2–4 Nachkommastellen) bleibt eigenes Muster.
- Importformat: `betrag` prüft strikt; leerer/fehlender Betrag bleibt Fehler, wird nie still 0.
- Tests: `m3-text` (Helper), `m1-validator` (`-0.00`/führende Null/`1.5`/`""` abgelehnt, gültige Daten weiter grün), `m3-import-format` angepasst.
- `npm run validate:master` bleibt grün — die Echtdaten erfüllen das strenge Format bereits.

Bewusst **kein** neues ADR: das ist eine Präzisierung von ADR 0004, keine neue Architekturentscheidung.

## §2 Drittes Qualitätslevel `offen` / worst-of — ✅ umgesetzt, aber NICHT als Enum-Wert

Geteilte Bewertung: Die **worst-of-Aggregation** ist sinnvoll und M9-relevant. Den Vorschlag,
`offen` in die `zeitwerte.qualitaet`-**Enum** aufzunehmen, habe ich verworfen: In Runde 2 ist
„offen" die **Abwesenheit** eines Belegs (kein Zeitwert → Position mit `fehlt:true`), nicht ein
eigener Wert. Eine Sentinel-Zeile „qualitaet=offen" wäre eine Zeile, die behauptet „ich kenne
den Wert nicht" — das Absenz-Modell ist ehrlicher und kollidiert nicht mit der Reconciliation.

Umsetzung als **abgeleitete** Aggregation:
- `gesamtQualitaet(positionen)` ([vermoegen.mjs](../../app/vermoegen.mjs)), Dominanz `belegt < geschaetzt < offen`; `computeNettovermoegen` liefert `qualitaet.gesamt`.
- Nettovermögens-KPI zeigt einen Worst-of-Badge („Gesamt: belegt/geschätzt/offen"). Im Browser verifiziert.
- Tests in `m5-vermoegen`. Erfüllt das Akzeptanzkriterium „mindestens Nettovermögen-KPI zeigt worst-of-Badge".

## §3 Cross-Entity-Checks im Validator — ☑️ überwiegend vorhanden

Prüfung gegen [validator.mjs](../../app/tools/validator.mjs):

| Vorschlag | Status |
|---|---|
| `transfer-inkonsistent` | ☑️ vorhanden (`validateTransfer`: Gegenbetrag, genau eine/zwei Referenzen, Pflichtfelder) |
| `zeitraum-ungueltig` | ☑️ vorhanden (`aktiv_bis` vs. `anker_datum`/`anfangsdatum`) |
| `anteile-ungueltig` | ☑️ vorhanden (`pruefeAnteile`, exakte Bruch-Summe = 1 per Integer-Arithmetik) |
| `kategorie-fehlt` | ☑️ vorhanden für `bestaetigt`; Existenzprüfung vorhanden |
| `dedupe-doppelt` „je Konto" | ☑️ effektiv erfüllt: `dedupe_hash` ist global eindeutig **und** `konto_id` steckt im Hash ([dedupe.mjs:12](../../app/tools/dedupe.mjs)) — „je Konto" ist damit gegenstandslos |
| `regex-ungueltig` | ❌ **nicht anwendbar**: der Categorizer nutzt Substring-Matching (`includes`), keine RegExp ([categorizer.mjs:8](../../app/tools/categorizer.mjs)). Es gibt keinen Regex zu kompilieren |

**Echte Kleinlücke (über das Handoff hinaus) — ✅ umgesetzt:** `kategorisierungsregeln` wurden
vom Master-Validator gar nicht geladen/geprüft. Jetzt nimmt `validate-core.mjs` sie als optionale
Collection auf (Feld-Schema + Cross-Check: `kategorie_id`/`konto_id` müssen existieren),
`loadMasterData` lädt sie, Tests in `m1-validator` decken gültige Regel, fehlende Referenzen und
Schemaverstöße ab. **Kein** „Regex kompiliert"-Check (Categorizer nutzt Substring-Matching).

## §4 Zeitwerte append-only vertraglich — ❌ nicht übernommen

Begründung:
1. **Nutzervorgabe:** In diesem privaten Projekt sollen keine Audit-/Append-only-/Versionierungs-Patterns vorgeschlagen werden.
2. **De facto schon so:** `zeitwerte.jsonl` ist ein Verlaufslog; `aktuellerZeitwert` nimmt den jüngsten Stand, die Reconciliation vergleicht aufeinanderfolgende belegte Stände. Das Verhalten existiert, ohne dass ein neues ADR es zur „Vertragsregel" erheben muss.
3. ADR 0002 hat In-Place-Updates für **Stammdaten** bewusst gewählt; ein zusätzliches „append-only"-ADR erzeugt nur Regel-Overhead ohne Verhaltensänderung.

## §5 Import-Härtung — gemischt

1. **Alles-oder-nichts bei Zeilenfehlern — ❌ nicht übernommen.** Runde 2 hat das **Gegenteil** bewusst entschieden und per Test verankert: „zeilenweise: kaputte Zeile blockiert saubere nicht" ([m3-import.test.mjs:94](../../tests/m3-import.test.mjs)). Fehlerhafte Zeilen landen sichtbar in `result.errors` (von der CLI ausgegeben) und im Agent-Prozess in `inbox/error/` — kein stiller Teilbestand. Eine Umkehr würde eine getestete, dokumentierte Entscheidung brechen. Den Trade-off halte ich für vertretbar zugunsten des bestehenden Verhaltens.
2. **Idempotenz als Test-Invariante — ✅ umgesetzt.** Es gab Re-Import-Tests; ergänzt um einen expliziten Regressionstest „Doppel-Import: 0 neu + serialisierter Bestand **byte-identisch**" ([m3-import.test.mjs](../../tests/m3-import.test.mjs)).
3. **Kontostand-Anker als automatischer „Beifang" — ❌ nicht übernommen.** Widerspricht der **gerade gemergten** Entscheidung (PR #2) und [import-agent.md](../../app/docs/skills/import-agent.md): Kopf-Kontostände dürfen **nicht still** als Zeitwert übernommen werden — der Agent reconciled (`Anker + Buchungen`) und fragt bei Lücke explizit nach. Ein automatisches Anhängen (Quelle = Exportdatei, ohne Rückfrage) verletzt „nicht still übernehmen" und ADR 0005.

## §6 Regelzahlungen und Liquidität — ☑️ Kern vorhanden, Rest ⏭️

1. **Monatsend-Klemmung — ☑️ bereits vorhanden UND getestet.** `addInterval` klemmt via `Math.min(d, lastDay)` ([liquiditaet.mjs:37](../../app/liquiditaet.mjs)); `occurrences` rechnet Anker × Intervall (driftfrei). Test „addInterval addiert Monate mit Monatsende-Clamping" existiert. Der Handoff-Testfall 31.01.→28.02.→31.03.→30.04. läuft korrekt.
2. **Qualität in die Prognose — ❌/N.A.** Regelzahlungen haben kein Qualitätsfeld; das Modell trennt stattdessen `bestaetigt`/`vorgeschlagen`, und die Prognose schließt Vorschläge sichtbar aus (`vorschlaege_nicht_enthalten`). Das „geschätzte Regelzahlung"-Konzept der Referenz existiert hier nicht.
3. **„Nächste Fälligkeit" je Regelzahlung — ✅ umgesetzt.** `naechsteFaelligkeit(rz, today)` in [liquiditaet.mjs](../../app/liquiditaet.mjs) (gleiche driftfreie Expansion + Monatsend-Klemmung wie `occurrences`, respektiert `aktiv_bis`); neue Spalte in der Regelzahlungs-Liste, abgelehnte/abgelaufene Einträge zeigen „—". Tests in `m4-liquiditaet`. Visuell verifiziert (u. a. Anker 31.01. → 30.06.).
4. **Liquiditätsverlauf als Liniendiagramm — ⏭️** Die Punkteserie liegt bereits vor (`monatsverlauf`/`verlauf`); es fehlt nur die SVG-Komponente. Siehe §8.2.

## §7 Vermögen und Darlehen — ☑️/⏭️

1. **Restschuld-Verlauf statt nur Stichtag — ⏭️** `restschuldHeute` iteriert die Fälligkeiten bereits; das `punkte`-Array zu exportieren ist billig — aber ohne Diagramm (§8.2) wäre es toter Code. Zusammen mit der Chart-Komponente sinnvoll.
2. **Fehlender Marktwert = Position bleibt sichtbar — ☑️ bereits erfüllt** (anders modelliert): `computeNettovermoegen` pusht **jede** Position, fehlender Wert als `fehlt:true`, `wert_cents:0`, `qualitaet:null` ([vermoegen.mjs](../../app/vermoegen.mjs)). Keine Position verschwindet still. Der Worst-of-Badge (§2) macht das jetzt zusätzlich als Gesamtaussage sichtbar.
3. **Bargeld als explizite Entscheidung — ☑️ bereits umgesetzt.** Kontotyp `bar` existiert und wird in Liquidität und Vermögen bewusst ignoriert; CONTEXT.md benennt den blinden Fleck. Die Guardrail-Formulierung ist eine **M6**-Aufgabe, hier verfrüht.

## §8 Review-UI — ⏭️ sinnvoll, eigener Schritt

1. **Deep-Links (`#/transaktionen/…`) — ⏭️** Kein Hash-Routing vorhanden. Echte Lücke, aber primär M8-Vorbereitung (Checks verlinken auf Datensätze). Eigener, fokussierter Schritt im 2.164-Zeilen-`main.js`.
2. **SVG-Liniendiagramm — ⏭️** Daten vorhanden, Komponente fehlt. Nice-to-have; die Tabellen beantworten „wie viel?" schon. Bündeln mit §6.4/§7.1.
3. **Validierungsfehler in der App (rotes Banner) — ✅ umgesetzt.** Die pure Validierungslogik liegt jetzt in [validate-core.mjs](../../app/tools/validate-core.mjs) (browserfähig, ohne Node-I/O); `validator.mjs` ist ein dünner Node-Wrapper (CLI + Datei-I/O). Beide nutzen **dieselbe** Logik. `main.js` validiert den geladenen Bestand einmal beim Laden; Erfolg → grüner Status-Chip, Fehler → rotes Banner mit Fehlerliste oben in jeder Ansicht + roter Chip. Das alte „Validierung extern"-Framing wurde abgelöst (Contract-Test entsprechend aktualisiert). Beide Pfade im Browser verifiziert.

## §9 `main.js` modularisieren — ⏭️ bewusst NICHT in diesem Branch

2.164 Zeilen, der Schmerz ist real. Aber: ein reiner Großrefactor gehört **nicht** in denselben
Branch wie Verhaltensänderungen — das macht das Review unzumutbar. Als eigener, durch
`ui-layout-contract.test.mjs` abgesicherter Schritt vor M6 sinnvoll.

## §10 Zugriffsschutz Webserver — ❌ jetzt nicht

ADR 0009 akzeptiert den ungeschützten LAN-Betrieb explizit für den Ist-Zustand. Token-Schutz/
GET-only/Traversal-Schutz sind „spätestens beim LAN-Deployment" relevant — aktuell verfrüht.
Wieder aufgreifen, sobald ein echtes Deployment ansteht.

## „Bewusst NICHT übernehmen" (Handoff-Schluss) — ✅ geteilt

Bruch-Anteile (Zähler/Nenner), Pagination, sprechende `TXN-…`-IDs, keine Bank-Parser: alle vier
Einschätzungen teile ich uneingeschränkt — Runde 2 ist hier überlegen.

---

## Zusammenfassung der Änderungen in diesem Branch

| Bereich | Änderung |
|---|---|
| §1 | `istGueltigerBetrag`; Validator + Importformat strikt; `-0.00`/führende Nullen abgelehnt |
| §2 | `gesamtQualitaet` (worst-of) + Nettovermögens-Badge; **kein** Enum-Eingriff |
| §5.2 | expliziter Byte-identisch-Idempotenztest |
| §8.3 | Pure Validierung in `validate-core.mjs`; In-App-Banner + Status-Chip (gleiche Logik wie CLI) |
| §3-Bonus | Kategorisierungsregeln im Master-Validator (referenzielle Integrität + Schema) |
| §6.3 | `naechsteFaelligkeit` + Spalte in der Regelzahlungs-Liste |
| Dev-Server | `serve_app.py` mit optionalem Port; `launch.json` nutzt no-cache-Server (stale ES-Module behoben) |
| Tests | 157 grün; `validate:master` grün; UI verifiziert |

**Verschoben (empfohlene Reihenfolge):**
§8.2/§6.4/§7.1 Liniendiagramm + Verläufe → §8.1 Deep-Links → §9 `main.js`-Split.
**Abgelehnt mit Begründung:** §3 `regex-ungueltig` (N.A.), §4 append-only, §5.1 alles-oder-nichts,
§5.3 Auto-Anker, §10 Serverschutz (jetzt).

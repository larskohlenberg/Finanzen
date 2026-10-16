# M6 — Szenarien und Arbeitsende-Fragen (Design)

**Stand:** 2026-06-22
**Bezug:** [Meilensteine_Runde2 §M6](../../runde2/Meilensteine_Runde2.md), ADR 0019, ADR 0020, ADR 0013, ADR 0016, ADR 0011.

## Ziel

Szenarien rechnen auf validierten Daten und expliziten Annahmen eine Was-wäre-wenn-Sicht (Liquidität, Restschuld, Nettovermögen über die Zeit). Keine zentrale Lebensentscheidung wird aus Platzhaltern als scheinbar belastbarer Wert dargestellt: jede Annahme zeigt ihre Qualität, das Szenario eine worst-of-Gesamtqualität, und Warnungen werden nicht weggekürzt.

## Abgrenzung (was M6 NICHT ist)

- **Kein Plan-Ist-Abgleich** (→ M8). M6 macht Planwerte nur abgleich-fähig (ADR 0020).
- **Kein Top-Level-`Ereignis`/Lebensphasen-Modell** (→ M7).
- **Keine Wertentwicklung** von Sachwerten — über den Horizont eingefroren (außer durch Kauf/Verkauf, siehe Engine).
- **Kein App-CRUD** — Szenarien/Annahmen entstehen über den Agent-Dialog (ADR 0006); die App zeigt nur an.

## Datenmodell

### Szenario (`data/master/szenarien.json`, Array — Annahmen eingebettet)

| Feld | Pflicht | Bemerkung |
|---|---|---|
| `szenario_id` | ✓ | `^SZN-\d{3}$` (Stammdaten-Konvention) |
| `name` | ✓ | |
| `beschreibung` | | freies Narrativ |
| `status` | ✓ | `entwurf \| bestaetigt \| verworfen` (ADR 0019) |
| `stand` | ✓ | Date — Stichtag der Annahmen (Gültigkeit) |
| `reichweite_bis` | ✓ | Date — Rechenhorizont |
| `annahmen` | ✓ | Array eingebetteter Annahmen (≥ 0) |
| `erstellt_am` | ✓ | Date |

### Annahme (eingebettet) — drei Arten + `gegenbuchung`

Parametrisierter Ansatz (erweiterbare `art`/`ziel_typ` statt Subtyp-Duplikate, wie beim *Weiteren Vermögenswert*). Der gemeinsame Kern ist eine datierte Cash-Bewegung mit optionaler **`gegenbuchung`** auf eine Bilanzposition.

Gemeinsame Felder: `annahme_id` (innerhalb des Szenarios eindeutig), `art`, `qualitaet` (`belegt | geschaetzt | offen`), optional `begruendung` (menschenlesbare Erklärung/Notiz, wird in der Annahmen-Tabelle gezeigt).

| `art` | Pflichtfelder | Wirkung |
|---|---|---|
| `einmalzahlung` | `datum`, `betrag` (Vorzeichen!), opt. `gegenbuchung` | datierter Cash-Ein/Ausgang (aggregiert) + optionaler Gegeneffekt |
| `regelzahlung-neu` | `ab`, `betrag`, `rhythmus_einheit`, `rhythmus_intervall`, opt. `bis`, `name`, opt. `gegenbuchung` | synthetische bestätigte Regelzahlung (nur im Lauf), aggregiert + optionaler Gegeneffekt |
| `regelzahlung-aenderung` | `regelzahlung_id`, `ab`, `aktion` (`beenden \| betrag-aendern`), bei `betrag-aendern`: `betrag` | modifiziert Kopie einer bestehenden Top-Level-Regelzahlung (reiner Cash-Stream, **keine** `gegenbuchung`) |

**Zwei unabhängige Beine.** Jede Annahme hat ein **Cash-Bein** (`betrag`, vorzeichenbehaftet, darf `0.00` sein) und optional ein **Bilanz-Bein** (`gegenbuchung`). Der **Nettovermögens-Effekt = Cash-Bein + Bilanz-Bein**. Sind beide Beine entgegengesetzt-gleich, ist es eine **Umschichtung** (neutral, z. B. Kauf/Verkauf/Sondertilgung); ist ein Bein null, ist es ein **echter Zu-/Abgang** (Erbschaft, Schenkung, Konsum). `vorzeichen-Konvention`: `betrag` ist immer der **Cash-Effekt** (− = raus, + = rein, wie bei Transaktion/Regelzahlung); die Magnitude des Bilanz-Beins ergibt sich aus `gegenbuchung`, die Richtung aus `ziel_typ`.

**`gegenbuchung`** referenziert **entweder** eine **bestehende** Bilanzposition (`ziel_id`) **oder** deklariert eine **neue** (`neue_position = { bezeichnung, wert }`) — genau eines von beiden:

| Fall | `ziel_typ` | Bilanz-Bein | Cash-Bein | Beispiel |
|---|---|---|---|---|
| Sondertilgung | `darlehen` (`ziel_id`) | Restschuld − \|betrag\| | − | Cash raus, Schuld runter |
| Depot-Verkauf / -Kauf | `depot` (`ziel_id`) | Depotwert ∓ (Gegenrichtung zum Cash) | + / − | Verkauf: +Cash/−Depot |
| Verkauf bestehender Sachwert | `immobilie`/`vermoegenswert` (`ziel_id`) | Position entfällt ab Datum | + (oder 0 bei Verschenken) | Haus verkaufen / verschenken |
| Kauf / Erbschaft / Schenkung erhalten | `immobilie`/`vermoegenswert`/`depot` (`neue_position`) | Position entsteht ab Datum (`wert`, eingefroren) | − (Kauf) oder 0 (Erbschaft/Schenkung) | Ferienhaus kaufen / Gold erben |

So fällt alles aus den zwei Beinen heraus: **Kauf** = Cash − price + neue Position + price (neutral); **Verkauf** = Cash + price − Position (neutral); **Sondertilgung** = Cash − + Restschuld − (neutral); **Bar-Erbschaft** = Cash +, kein Bilanz-Bein; **Sachwert-Erbschaft/-Schenkung** = `betrag = 0` + neue Position (Nettovermögen +); **Sachwert verschenken** = `betrag = 0` + bestehende Position entfällt (Nettovermögen −).

Die Engine hat hinter dieser gemeinsamen Form **typisierte Handler je `ziel_typ`** (Tilgungsprojektion / Werttopf / statische Position) — die `gegenbuchung` ist die gemeinsame Datenform, nicht eine einzige Rechenformel. Klemmung (nicht mehr verkaufen/tilgen als vorhanden — Cash **und** Position konsistent) und die `depot-vorbehalt`-Warnung hängen an `ziel_typ`.

**Cash-Seite aggregiert, kein `konto_id`:** die M4-Liquidität rechnet aggregiert; die Cash-Seite trägt kein `konto_id`. Das bestimmte Objekt nennt `gegenbuchung.ziel_id` (für `depot` ist das die Depot-`konto_id`). Feld-Mapping synthetischer Regelzahlungen auf `occurrences`: `ab`→`anker_datum`, `bis`→`aktiv_bis`, `name`→`bezeichnung`.

Die Grenze Faktum/Hypothese: bekannte Änderungen (z. B. Gehaltsstufe) bleiben Top-Level (zwei aufeinanderfolgende Regelzahlungen); die Annahme-Arten sind fürs Hypothetische.

**Plan auf Kategorie-Granularität:** geplante Konsumausgaben werden als kategoriebezogene `geschaetzt`-Regelzahlungen modelliert (`kategorie_id` gesetzt, keine `gegenpartei`) — „−500/Monat für Kategorie *Lebensmittel*". Ergänzender Kontext lebt in `begruendung`/`bemerkung`.

### Regelzahlung — Erweiterung (ADR 0020)

Neue Felder am bestehenden Schema (`regelzahlungen.schema.json`):
- `qualitaet`: `belegt | geschaetzt` (Pflicht für neue Datensätze; Migration siehe unten).
- `quelle_hinweis` (optional, String), `quelle_standdatum` (optional, Date) — wie bei anderen Stammdaten.

`belegt` = vertragliche Verpflichtung (exakt, oft `aktiv_bis` + `quelle_hinweis`). `geschaetzt` = Kategorie-Konsumplan.

## Engine (`app/szenarien.mjs` — deterministisch, rein, browser- und Node-fähig)

Geteilte reine Funktion wie `liquiditaet`/`vermoegen`; die **Basis** ist dieselbe Engine mit leerer Annahmenliste (kein Sonderfall). Eingabe: validierter Bestand + Szenario + Rechenstichtag. Ausgabe: monatliche Punkte, Annahmen-Echo, Gesamtqualität, Warnungen.

**Rechenstichtag und `stand`:** Die Engine rechnet **live ab heute** (Rechenstichtag = heute), konsistent mit der M4-Live-Liquidität (`occurrences` strikt nach `today`). `stand` ist Gültigkeits-/Staleness-Metadatum (wann die Annahmen erstellt/geprüft wurden), kein Rechen-Startpunkt. Eine Annahme mit `datum`/`ab` **vor** dem Rechenstichtag wird nicht still verrechnet, sondern als Warnung `annahme-vergangen` gemeldet. Sachwerte nutzen den jüngsten Zeitwert **bis zum Rechenstichtag**. Ein weit zurückliegender `stand` erzeugt eine Staleness-Warnung in der Ansicht.

1. **Regelzahlungen modifizieren (Kopie!):** `beenden` → `aktiv_bis = ab − 1 Tag`; `betrag-aendern` → Original endet am Vortag, Klon mit neuem Betrag ab `ab`; `regelzahlung-neu` → synthetische `bestaetigt`-Regelzahlung. Bestand bleibt unberührt. Greift eine `regelzahlung-aenderung` auf eine abgelaufene/nicht existierende Regelzahlung (z. B. `beenden` vor deren `anker_datum`), ist das kein stiller No-op, sondern Warnung `aenderung-wirkungslos`.
2. **Liquide Startposition** zum Rechenstichtag (M4-Logik: belegter Anker + Ist-Buchungen, **aggregiert** über liquide Konten). Depots getrennt summieren.
3. **Geldereignisse sammeln** bis `reichweite_bis`: Expansion **nur bestätigter** (modifizierter) Regelzahlungen über die bestehende `liquiditaet.occurrences`/`addInterval` (driftfreie Expansion + Monatsend-Klemmung — wiederverwenden, nicht nachbauen); + Einmalzahlungen. Jede Zahlung wirkt auf den **aggregierten Cash**; trägt sie eine `gegenbuchung`, wird zusätzlich der Gegeneffekt nach `ziel_typ` angewandt (Schritte 4/5). Klemmung je `ziel_typ`: `depot`-Verkauf > Depotwert → auf Depotwert klemmen + Warnung `depot-ueberzogen`; `darlehen`-Sondertilgung > offene Restschuld → auf Restschuld klemmen, **Cash-Abfluss ebenso** (kein Überzahlen).
4. **Restschuld-Projektion je Darlehen** (ADR 0013): über die Ratentermine gemäß Darlehens-Rhythmus (via `vermoegen.faelligkeiten`, **nicht** fix monatlich), je Termin `zins = round(rest × nominalsatz × periodenanteil)` (Cent-Integer, Satz skaliert, Periodenanteil aus dem Rhythmus), `tilgung = rate − zins`, `gegenbuchung(darlehen)`-Beträge am jeweiligen Termin abziehen, bei 0 klemmen + `abbezahlt_am`. Ohne Anker → `null` + Qualität `offen`. **Erreicht die Restschuld via Sondertilgung 0 (`abbezahlt_am`), endet die Sollrate-Regelzahlung dieses Darlehens** (die Engine kürzt die Regelzahlung mit passender `darlehen_id` auf `abbezahlt_am`) — sonst zahlt der Cash weiter auf ein getilgtes Darlehen.
5. **Monatliche Punkte** (Monatsende): `liquide` (kumulierte Cash-Ereignisse), `depot` (Start ± `gegenbuchung(depot)`), `restschuld` (Projektion), `sachwerte`, `nettovermoegen = liquide + depot + sachwerte − restschuld`. **Sachwerte** starten auf dem jüngsten Zeitwert **bis Rechenstichtag** (Cutoff-Variante von `aktuellerZeitwert` — der heutige Helper nimmt den absolut neuesten Eintrag und braucht für M6 eine Datumsobergrenze), eingefroren (ADR 0019, sichtbarer Hinweis). `gegenbuchung` macht sie zeitveränderlich: **Abbau** (`ziel_id`-Verkauf/-Schenkung) → Position fällt ab Datum aus der Serie; **Aufbau** (`neue_position`-Kauf/Erbschaft) → Position kommt ab Datum mit `wert` hinzu (danach eingefroren). Reale Zeitwert-Einträge **nach** einem szenario-internen Verkauf werden ignoriert (die Position ist im Szenario weg); umgekehrt erhält eine `neue_position` keinen realen Zeitwert (sie existiert nur im Szenario) — keine Doppelzählung.
6. **Qualität:** worst-of über alle Eingaben (Anker, Regelzahlungen, Annahmen) → `belegt < geschaetzt < offen`, wiederverwendet `gesamtQualitaet` aus `vermoegen.mjs`.
7. **Warnungen** — unverkürzt ans UI.

## Cash-Realismus-Guardrail (kategoriebasiert)

Pro Kategorie mit einer `geschaetzt`-Regelzahlung (`kategorie_id` gesetzt):
- **Ist** = Ausgaben (Betrag < 0, ohne Transfers) der letzten 3 vollen Kalendermonate in dieser Kategorie ÷ 3.
- **Plan** = `geschaetzt`-Regelzahlung(en) dieser Kategorie auf Monatswert normalisiert: über die nächsten 12 Monate per `occurrences` expandieren, summieren, ÷ 12.
- **Warnung `cash-realismus`** (je Kategorie), wenn `plan < SCHWELLE × ist` (`SCHWELLE = 0.9`, benannte Konstante), mit Kategorie + beiden Beträgen im Text.

`belegt`-Verpflichtungen werden nicht geprüft (Fakten). Global **`liquiditaet-negativ`**: erster Monatspunkt < 0 mit Datum/Betrag. Bar-Anteil bleibt bewusster blinder Fleck (CONTEXT.md).

**Warnung `kategorie-ungeplant`:** eine Kategorie hat in den letzten 3 vollen Monaten durchschnittliche Ist-Ausgaben über einer Materialitäts-Schwelle (`MATERIALITAET_MONAT`, benannte Konstante), aber **keine** bestätigte Regelzahlung (`belegt` oder `geschaetzt`), die sie abdeckt. Schließt den „zu rosige Zukunft"-Blind-Spot des rein kategoriebasierten Checks. Text nennt Kategorie + historischen Monatsschnitt.

## Quasi-liquide Reserven (ADR 0016)

Depotwert nie in den M4-Liquiditätssaldo mischen. Eine `gegenbuchung(depot)` ist ein datiertes Ereignis: Liquidität +, Depotwert −; sie erzeugt **immer** `depot-vorbehalt` („quasi-liquide Reserve mit Kurs-/Verfügbarkeitsvorbehalt — kein sicheres Geld"). Nur auf ausdrücklichen Nutzerwunsch. **Bewusste Vereinfachung:** Spread, Steuer und realisierter Gewinn/Verlust werden **nicht** gerechnet (der Verkauf ist 1:1 Depotwert→Cash); der `depot-vorbehalt` trägt diesen Vorbehalt qualitativ.

## UI

Neue View `app/views/szenarien.mjs` + Route (`#/szenarien`, `#/szenarien/SZN-…`):
- **Liste:** Name, Status-Badge, Annahmen-Zahl, Reichweite, Liquidität am Ende (rot wenn negativ), Qualitäts-Badge.
- **Detail:** KPI-Zeile **Szenario vs. Basis**; Warnungs-Boxen (nicht wegklickbar zusammengefasst); zwei Liniendiagramme (liquide, Nettovermögen — Szenario durchgezogen, Basis gestrichelt) via `charts.mjs`; Annahmen-Tabelle (Art/Inhalt/Qualität/Begründung). Nettovermögens-Linie mit Hinweis „Sachwerte zum Stichtag eingefroren".
- **Darlehen-Detail:** rein informativer Rückverweis auf `gegenbuchung(darlehen)`-Annahmen mit dieser `darlehen_id` (Szenarioname, Status, Qualität, Deep-Link) — **ohne Rechenwirkung**, mit Label „wirkt sich hier nicht aus, da zukunftsgerichtet".

## Agent (DoD ab M6)

- Neuer Skill `app/docs/skills/szenarien-annahmen.md`: Nutzerwunsch in datierte Einzelannahmen zerlegen, stille Zusatzannahmen explizit machen, Steuer-/SV-Effekte nie selbst „berechnen" (Nutzerwert oder grobe Schätzung mit Begründung), `bestaetigt` nur nach ausdrücklicher Abnahme, Engine-Warnungen unverkürzt weitergeben, `gegenbuchung(depot)` nur auf ausdrücklichen Wunsch. Der Skill referenziert die neuen App-Artefakte explizit (`data/master/szenarien.json`, Szenario-Schema, `qualitaet`-Erweiterung der Regelzahlung, Szenario-Teil des Validators) und bleibt frei von Root-Doku/ADR-Verweisen.
- `agent-context.md` um Szenario-Entität + Engine erweitern.
- **Next-Action-Mapping:** offene Szenario-**Entwürfe** werden **nicht** proaktiv zu Session-Beginn gemeldet (Pull, nicht Push — anders als offene Vorschläge/Importfehler).

## Validierung

`validate-core.mjs` nimmt `szenarien` als optionale Collection auf (Feld-Schema + Cross-Field). Regeln:
- Genau **eines** von `gegenbuchung.ziel_id` / `gegenbuchung.neue_position`.
- `ziel_id` muss zur `ziel_typ`-Collection existieren **und aktiv** sein; `depot`-`ziel_id` muss `kontotyp=depot` sein; `darlehen`/`immobilie`/`vermoegenswert` analog. `neue_position` braucht `bezeichnung` + `wert`.
- Dieselbe bestehende Position wird **nicht doppelt** abgebaut (kein Doppelverkauf) innerhalb eines Szenarios; Abbau nur auf eine nicht bereits verkaufte/abgelöste Position.
- `gegenbuchung` an `regelzahlung-neu` nur mit `ziel_typ ∈ darlehen | depot` und nur als bestehende `ziel_id` (wiederkehrende Sondertilgung / Sparplan) — **kein** `neue_position`, **kein** `immobilie`/`vermoegenswert` (eine Position entsteht/entfällt nicht monatlich). `gegenbuchung` gar nicht an `regelzahlung-aenderung`.
- `einmalzahlung` braucht `betrag ≠ 0` **oder** eine `gegenbuchung` (sonst wirkungslos).
- `regelzahlung_id` einer `regelzahlung-aenderung` muss existieren; `reichweite_bis ≥ stand`; `annahme_id` je Szenario eindeutig; art-spezifische Pflichtfelder.

`loadMasterData` lädt sie. Neue Regelzahlung-Felder (`qualitaet`) im Validator ergänzt.

## Tests (TDD)

1. Basis ohne Annahmen schreibt nur bestätigte Regelzahlungen fort.
2. Einmalzahlung (ohne `gegenbuchung`) + `beenden` wirken ab Datum.
3. `regelzahlung-neu` + `betrag-aendern` (Splitting am Stichtag).
4. `gegenbuchung(depot)`: Liquidität +, Depot −, `depot-vorbehalt` vorhanden.
5. `gegenbuchung(darlehen)`: Liquidität − UND Restschuld − am Termin; via `regelzahlung-neu` wiederkehrend expandiert.
6. Restschuld klemmt bei 0, `abbezahlt_am` korrekt; Sondertilgung > Restschuld klemmt Cash und Restschuld konsistent.
7. Guardrail: Kategorie-Ist hoch, geschätzter Plan niedrig → `cash-realismus`; materielles Ist ohne Regelzahlung → `kategorie-ungeplant`.
8. Vorgeschlagene (unbestätigte) Regelzahlungen wirken NICHT.
9. `gegenbuchung(immobilie)` Verkauf bestehender Position: fällt ab Datum aus der Nettovermögens-Serie, Liquidität +; neutral im Buchungsmoment; reale Zeitwerte nach dem Verkauf ignoriert.
10. **Kauf** (`neue_position`): Cash −, neue Position ab Datum + `wert`; neutral. **Sachwert-Erbschaft** (`betrag=0` + `neue_position`): Nettovermögen + `wert`, kein Cash. **Bar-Erbschaft** (`betrag>0`, keine `gegenbuchung`): Nettovermögen +.
11. **Volltilgung via Sondertilgung**: Restschuld 0 → Sollrate-Regelzahlung endet ab `abbezahlt_am` (kein weiterer Cash-Abfluss).
12. `belegt`-Regelzahlung löst keine `cash-realismus`-Warnung aus.
13. Nicht-monatlicher Darlehens-Rhythmus korrekt projiziert.
14. Validator: Szenario-Schema + `gegenbuchung`-Regeln (Doppelverkauf, `neue_position` vs. `ziel_id`, recurring nur darlehen/depot); `qualitaet`-Migration grün (`validate:master`).

## Migration

Bestehende Echtdaten-Regelzahlungen brauchen `qualitaet`. Der Agent schlägt nach Heuristik vor (vertraglich/exakt wie Miete, Gehalt, Versicherung → `belegt`; Kategorie-Schätzung → `geschaetzt`) und lässt den Nutzer bestätigen — nicht still geraten. Der reale Regelzahlungs-Bestand ist aktuell leer (`[]`); Reihenfolge: erst Daten setzen, dann `qualitaet` im Schema verpflichtend machen, damit `validate:master` grün bleibt.

## Offene Punkte

- Genaue Engine-Signatur/Modulgrenze (`szenarien.mjs` vs. Wiederverwendung aus `liquiditaet.mjs`/`vermoegen.mjs`) — wird im Implementierungsplan festgelegt.
- Konkreter Wert der `MATERIALITAET_MONAT`-Schwelle — im Plan an realen Daten kalibrieren.

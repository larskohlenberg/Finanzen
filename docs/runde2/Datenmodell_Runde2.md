# Datenmodell Runde 2

Stand: 27.05.2026

Dieses Dokument beschreibt die Struktur der Masterdaten. **Die fachliche Sprache steht in `CONTEXT.md`** — bei Begriffsfragen immer dort nachsehen. **Die Begruendungen fuer ueberraschende Entscheidungen stehen in `docs/adr/`**.

## Leitprinzip

Trennung von Rohdaten, fachlichen Masterdaten und Auswertungen. Auswertungen (Cashflow, Nettovermoegen, Saldo, Restschuld) werden berechnet, nicht als fuehrende Daten gepflegt.

## Dateien in `data/master/`

```text
personen.json
konten.json
kategorien.json
transaktionen.jsonl
transfers.json
regelzahlungen.json
immobilien.json
darlehen.json
verbindlichkeiten.json   (offen: Abgrenzung zu Darlehen — siehe M5)
versicherungen.json
renten.json
ereignisse.json
erwerbsstatus.json
sozialleistungen.json
annahmen.json
szenarien.json
zeitwerte.jsonl          (alle Werte mit zeitlichem Bezug, siehe CONTEXT.md)
agent_log.jsonl          (Lauf-Protokoll fuer autonome Agenten)
```

**Bewusst nicht im Modell** (im Vergleich zu fruehen Entwuerfen explizit gestrichen):

- `quellen.json` — Quellen sind inline am Datensatz (siehe `CONTEXT.md > Quelle`)
- `vorschlaege.jsonl` — Vorschlaege leben am Datensatz selbst per `kategorisierung_status = vorgeschlagen` (siehe `CONTEXT.md > Kategorisierung`)
- `agentenauftraege.jsonl`, `pruefregeln.json` — Agentenarbeit wird ueber Cron + Inbox-Konvention + Prompt gesteuert, nicht ueber Daten
- `checks.json`, `warnungen.jsonl` — Checks sind Code, Befunde werden live berechnet
- `vermoegen.json` — Vermoegenssicht entsteht berechnet aus Konten + Immobilien + Verbindlichkeiten + Zeitwerten

## Kernentitaeten (M1)

Hier nur die Entitaeten fuer M1. Spaetere Module werden mit ihrem Meilenstein detailliert.

### Person

Pflichtfelder:

- `person_id` (Format `PER-001`)
- `name`
- `status` (`aktiv | inaktiv`)
- `aktiv_bis` (optional, ISO-Datum)

Kein `rolle`-Feld. Lebensphasen werden ueber Ereignisse und Erwerbsstatus modelliert.

### Konto

Pflichtfelder:

- `konto_id` (Format `KTO-001`)
- `name`
- `kontotyp` (`giro | spar | tagesgeld | depot | kreditkarte | bar`)
- `kontoreferenz` (maskierte externe Kennung, z. B. IBAN-Endziffern oder Depotnummer-Endziffern)
- `inhaber_person_ids` (Liste, gleichberechtigt)
- `liquiditaetsrelevant` (Bool)
- `status` (`aktiv | geschlossen`)
- `aktiv_bis` (optional)

Kein `waehrung`-Feld (siehe `CONTEXT.md > Waehrung`).

### Kategorie

Pflichtfelder:

- `kategorie_id` (Format `KAT-001`)
- `name`
- `typ` (`einnahme | ausgabe | neutral`)
- `lebenshaltung_relevant` (Bool)
- `status` (`aktiv | inaktiv`)
- `aktiv_bis` (optional)

Kein `cashflow_wirkung`-Feld an der Kategorie noetig — der `typ` traegt die Richtung.

### Transaktion

Pflichtfelder:

- `transaktion_id` (Format `TXN-YYYYMMDD-000001`)
- `dedupe_hash` (siehe `CONTEXT.md > Transaktions-ID und Deduplikation`)
- `rohquelle` (Pfad zur Import-Datei)
- `konto_id`
- `buchungsdatum` (ISO Date)
- `betrag` (Decimal-String, exakt 2 Nachkommastellen, mit Vorzeichen)
- `gegenpartei`
- `verwendungszweck`
- `kategorisierung_status` (`offen | vorgeschlagen | bestaetigt | abgelehnt`)
- `ist_transfer` (Bool)

Optional:

- `kategorie_id` — Pflicht **nur** bei `kategorisierung_status = bestaetigt` (Cross-Field-Regel)
- `bank_referenz` — wenn der Bankexport eine eindeutige ID liefert (z. B. Ende-zu-Ende-ID)
- `transfer_id` — bei `ist_transfer = true` Pflicht (siehe Transfer)
- `bemerkung` — Freitext, vom Agenten oder Nutzer

Kein `cashflow_wirkung`-Feld (Vorzeichen + `ist_transfer` genuegen). Kein `waehrung`-Feld. Korrekturen erfolgen in-place (siehe `docs/adr/0002`).

### Transfer

Pflichtfelder:

- `transfer_id` (Format `TRF-YYYYMMDD-001`)
- `betrag` (Decimal-String, positiv)
- `typ` (`intern | extern`)

Bei `typ = intern`:

- `abgang_transaktion_id` Pflicht
- `zugang_transaktion_id` Pflicht
- Cross-Field: beide Transaktionen existieren, Betraege gegenlaeufig, gleicher Betrag

Bei `typ = extern`:

- Genau eine von `abgang_transaktion_id` / `zugang_transaktion_id` Pflicht
- `gegenseite_typ` (`bar | extern_familie | extern_sonstiges`)
- `begruendung` (Freitext, Pflicht)

### Zeitwerte (`zeitwerte.jsonl`)

Pro Eintrag:

- `entitaet` (`immobilie | rente | versicherung | ...`)
- `entitaet_id`
- `feld` (Name des bewerteten Felds, z. B. `marktwert`, `erwarteter_betrag`, `rueckkaufswert`)
- `wert` (Decimal-String)
- `standdatum` (ISO Date)
- `qualitaet` (`belegt | geschaetzt`)
- `quelle_hinweis` (optional)

Aktueller Wert pro `(entitaet_id, feld)` = neuester Eintrag nach `standdatum`. Anhaengen, nicht ueberschreiben — Verlauf bleibt erhalten.

### Agent-Lauf-Log (`agent_log.jsonl`)

Pro Lauf:

- `zeitpunkt` (ISO Timestamp mit lokalem Offset)
- `anlass` (z. B. `cron-import`, `manuell-review`)
- `inputs` (Liste der verarbeiteten Dateien/IDs)
- `anzahl_importiert`, `anzahl_offen`, `anzahl_fehler`
- `notiz` (Freitext-Zusammenfassung)
- `betroffene_ids` (Liste, optional)

## Pruefregeln fuer M1

Mindestens diese Cross-Field-Regeln muessen im Validator stehen:

1. Jede Transaktion referenziert ein existierendes Konto.
2. Wenn `kategorisierung_status = bestaetigt`, dann `kategorie_id` Pflicht und existierend.
3. Wenn `ist_transfer = true`, dann `transfer_id` Pflicht und existierend.
4. Transfer `typ = intern`: beide referenzierten Transaktionen existieren, ihre Betraege sind gegenlaeufig und betragsgleich.
5. Transfer `typ = extern`: genau eine Transaktion referenziert, `gegenseite_typ` und `begruendung` gesetzt.
6. `dedupe_hash` ist innerhalb `transaktionen.jsonl` eindeutig.
7. Betrag entspricht Pattern `^-?\d+\.\d{2}$`.
8. Wenn `aktiv_bis` gesetzt und in der Vergangenheit, darf die Entitaet nicht in **neuen** Datensaetzen referenziert werden (Altreferenzen bleiben gueltig).

## ID-Konventionen

```text
PER-001                    Person
KTO-001                    Konto
KAT-001                    Kategorie
TXN-YYYYMMDD-000001        Transaktion
TRF-YYYYMMDD-001           Transfer
REG-001                    Regelzahlung
IMM-001                    Immobilie
DAR-001                    Darlehen
VER-001                    Versicherung
RNT-001                    Rente
EVT-YYYYMMDD-001           Ereignis
```

## Spaetere Meilensteine (Strukturen offen)

Diese Entitaeten existieren als Dateien, sind aber im Detail erst in ihrem Meilenstein zu spezifizieren:

- **M4**: `regelzahlungen.json`, Verknuepfung Regelzahlung → Transaktion
- **M5**: `immobilien.json`, `darlehen.json`, `verbindlichkeiten.json` (Abgrenzung Darlehen ↔ Verbindlichkeiten noch offen)
- **M6**: `annahmen.json`, `szenarien.json`, `ereignisse.json`, `erwerbsstatus.json`, `sozialleistungen.json`
- **M7**: `versicherungen.json`, `renten.json` und Verknuepfung zu Regelzahlungen / Zeitwerten

Im M1-Schritt werden diese Dateien **nicht** angelegt — keine leeren Platzhalter, keine vorzeitige Detaillierung.

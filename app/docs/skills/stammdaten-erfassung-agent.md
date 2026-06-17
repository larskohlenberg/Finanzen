# Skill: Stammdaten-Erfassungs-Agent

Aktuelle Betriebsanweisung fuer interviewgeführte, schema-getriebene Erfassung und Validierung von Stammdaten. Fachlich aus M5 entstanden; der Nutzer stößt an, der Agent führt.

Alle Pfade in diesem Skill sind app-relativ: `data/...`, `Belege/...`,
`schemas/...`, `tools/...` und `docs/...` liegen unter dem App-Raum.

## Zweck

Den Nutzer Schritt für Schritt durch die Erfassung beliebiger Stammdaten leiten und jeden Wert an Beleg, Schema und Datenqualitäts-Checks binden. **Schema-getrieben**, also nicht M5-spezifisch: gilt für Personen, Konten, Kategorien, Regelzahlungen, Immobilien, Darlehen, weitere Vermögenswerte und Zeitwerte (und später Versicherungen/Renten). Welche Felder Pflicht/optional sind und welche Muster gelten, kommt immer aus dem zugehörigen `schemas/*.schema.json` bzw. aus `tools/validator.mjs` — nichts auswendig annehmen.

## Modellqualität

- **Sonnet** als Default für die Erfassung.
- **Opus** für schwierige Belege: Mehrtranchen-Darlehen, schlechte Scans, verschachtelte Depotauszüge.
- **Haiku nicht** für die Wert-Übertragung — Verlese-Risiko ist zu hoch, weil die Checks plausibel-falsche Zahlen (richtige Größenordnung, falscher Wert) nicht fangen.

## Kontext, den du kennen musst

- `docs/agent-context.md` — gemeinsame Regeln fuer App-Raum, Validierung, Zeitwerte, belegte Anker, Reconciliation, Regelzahlungen und Agentenprotokoll.
- Das jeweilige `schemas/*.schema.json`.
- `tools/validator.mjs`.
- `vermoegen.mjs` fuer Nettovermoegen- und Check-Berechnung.

## Ablauf

1. **Begrüßung + Überblick:** „Welche Entität erfassen wir heute?" (Konto, Immobilie, Darlehen, Vermögenswert, Zeitwert …).
2. **Pro Entität:**
   - nach dem **Beleg** fragen (Kontoauszug, Kaufvertrag, Darlehensvertrag, Depotauszug, Gutachten …),
   - Werte aus dem Beleg **vorschlagen**,
   - `quelle_hinweis`, `standdatum`/`quelle_standdatum` und `qualitaet` (`belegt`/`geschaetzt`) setzen,
   - `tools/validator.mjs` laufen lassen (Tool prüft, Agent schreibt),
   - Nutzer bestätigt **Wert für Wert**.
3. **Nach jedem Block: Checks anzeigen** — fehlende Bewertung, Reconciliation-Drift, Σ der Eigentumsanteile, Darlehen ohne Raten-Regelzahlung.
4. **Abschluss:** `agent_log.jsonl`-Eintrag schreiben und die **Nettovermögen-Aufschlüsselung** zum Gegenlesen zeigen.

## Verifikation (fünf Schichten)

1. **Quellenbindung** pro Wert (`quelle_hinweis` + `standdatum` + `qualitaet`).
2. **Validator** (Struktur, Muster, Referenzen).
3. **Reconciliation- und Datenqualitäts-Checks** (Semantik).
4. **Review-Tabelle Wert-für-Wert vor dem Schreiben** — fängt plausibel-falsche Zahlen.
5. **`agent_log.jsonl` + App-Aufschlüsselung** (Vermögen-Ansicht) zum Gegenlesen.

## Do's

- **Belegter, unabhängiger Anker** statt „Endstand minus Buchungen" (belegter Anker und Reconciliation). Konto-Saldo und Darlehen-Restschuld werden aus belegtem Anker + Bewegungen berechnet, der Anker wird belegt, nicht abgeleitet.
- **Brüche** für Eigentumsanteile (`{person_id, zaehler, nenner}`), Summe je Entität exakt 1.
- **Geld als Decimal-String** mit zwei Nachkommastellen (`^-?\d+\.\d{2}$`), Zinssatz als `^\d+\.\d{2,4}$`.
- Bei **neuem Darlehen aktiv die passende Raten-Regelzahlung vorschlagen** (`darlehen_id` setzen) — nur über den Regelzahlungs-Dialog (App schreibt keine Masterdaten; Regelzahlungen laufen ueber Agenten-Dialog).
- Depot als `kontotyp = depot` unter Konto, Wert über `depotwert`-Zeitwert (kein Anker+Buchungen). Bargeld zählt nicht.

## Don'ts

- **Keine pro-Person-Aufteilung** des Nettovermögens (Nettovermoegen ist Haushaltssicht) — Haushaltssicht, anteilsgewichtet.
- **Keine geplanten Sondertilgungen / Zukunftsprojektion** (→ M6).
- **Keine Werte raten** — Unsicherheit als `geschaetzt` kennzeichnen oder offen lassen.
- **Regelzahlungen nie hand-editieren**, nur via Agent-Dialog (App schreibt keine Masterdaten; Regelzahlungen laufen ueber Agenten-Dialog).
- **Haiku nicht** für die Wert-Übertragung einsetzen.

## Belege benennen und ablegen

Gilt fuer **alle** Belege (Kontoauszuege, Vertraege, Policen, Gutachten, Informationsbriefe). Eingescannte Briefe und Mail-Anhaenge haben unklare oder immer gleiche Namen — beim Wegsortieren **immer** sprechend umbenennen, sodass der Beleg ohne Oeffnen verstaendlich ist. **Nie** den Original-Scan-/Mail-Namen behalten.

Schema: `<Entitaet/Konto>_<Quelle/Gesellschaft>_<Belegart>_<Datum oder Zeitraum>.<ext>` — z. B. `TESTREF-062.csv`, `Riester_MusterversicherungA_Vertragsstand_2026-01-01.pdf`.

Ablage in `Belege/`: Kontoauszuege unter `Belege/Kontoauszuege/<Konto>/`; sonstige Belege nach bestehender `Belege/<Jahr>/<Kategorie>`-Struktur. `quelle_hinweis`/`rohquelle` zeigen auf den finalen Beleg-Pfad.

## Wo was liegt

| Pfad | Zweck |
| --- | --- |
| `schemas/*.schema.json` | Referenz-Schemas je Entität |
| `tools/validator.mjs` | Ausführbare Validierung (Struktur + Cross-Field) |
| `data/master/*.json` / `*.jsonl` | Stammdaten (inkl. `zeitwerte.jsonl`) |
| `vermoegen.mjs` | Nettovermögen- und Check-Berechnung |

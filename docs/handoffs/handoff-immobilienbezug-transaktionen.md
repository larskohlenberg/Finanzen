# Handoff: Objektbezug für Transaktionen — optionales Feld `immobilie_id`

**An:** Entwicklungsagent im Finanzmodell
**Entstanden aus:** Kategorisierung-Review am 2026-08-12. Beim Bulk-Bestätigen des
Regel-Buckets REG-225 (Handwerkerrechnungen am Haus, KAT-020) fiel auf, dass die
Rechnungen dieses Buckets zu *verschiedenen* Objekten gehören — das Modell kann das
heute nicht abbilden.

> **Hinweis zu Daten:** Dieses Dokument ist versioniert und enthält deshalb keine
> Beträge, Adressen oder Gegenparteinamen. Konkrete Zuordnungen stehen im nicht
> versionierten Lauf-Protokoll (siehe Abschnitt „Daten").
**Stand:** Modellfrage gestellt, kein Auftrag erteilt, nichts implementiert.

Dieses Dokument ist als Prompt gedacht: Es kann vollständig an einen
Entwicklungsagenten übergeben werden.

---

## Setup

- Arbeite im App-Raum. Alle Pfade in diesem Dokument sind app-relativ, wo nicht
  anders angegeben.
- **DATENMODUS: live**
- **DATENROOT: `data/master`**
- Lies zuerst `docs/agent-context.md`.
- Präzedenz-ADR, an der du dich orientierst:
  `docs/adr/0023-transaktion-erfuellt-regelzahlung.md`. Der Auftrag ist dieselbe
  Figur wie `regelzahlung_id`, nur mit `IMM-` statt `RZ-`.

## Ziel

Transaktionen sollen optional einer Immobilie zugeordnet werden können.

## Warum

Es gibt vier Immobilien (IMM-001 bis IMM-004). Heute lässt sich nicht beantworten,
was ein einzelnes Objekt kostet oder einbringt: `darlehen.json` trägt bereits ein
`immobilie_id` (DAR-001/DAR-002 → IMM-004), die Transaktionsseite hat kein
Gegenstück.

Betroffen sind zunächst die Buchungen auf KAT-020 Immobilie/Modernisierung
(Größenordnung: knapp 20), perspektivisch auch KAT-021 Mieteinnahme und
KAT-002 Wohnen (zusammen unter 100). Die genauen Schnitte rechnest du dir selbst
aus `DATENROOT/transaktionen.jsonl` — sie ändern sich mit jedem Import.

## Berührungspunkte — vorab verifiziert, bitte alle prüfen

1. **`schemas/transaktionen.schema.json`**
   Hat `additionalProperties: false`. Feld optional ergänzen, Pattern `^IMM-\d{3}$`.
   Vorbild: `immobilie_id` in `schemas/darlehen.schema.json`.
2. **`tools/validate-core.mjs` — ZWEITER SCHEMAORT, leicht zu übersehen.**
   Ab ca. Zeile 82 liegt ein Inline-Vertrag für Transaktionen (`regelzahlung_id`,
   `transfer_id`). Fehlt das Feld dort, ist der Validator entweder gegen dich oder
   prüft den Wert nie.
3. **`tools/validate-core.mjs` ca. Zeile 426 — Referenzprüfung.**
   Baue die Prüfung analog zu `regelzahlung_id`: eine gesetzte `immobilie_id` muss
   in `data.immobilien` existieren, sonst Fehler. Direkt darunter (ca. Zeile 487)
   steht dieselbe Prüfung für `darlehen.immobilie_id` als Vorlage.
4. **`views/transaktionen.mjs` — Detailansicht.**
   Vorbild: `regelzahlungForTransaction()` (ca. Zeile 52) und
   `renderTransactionDetail()` (ca. Zeile 476). Zugehöriger Test als Muster:
   `tests/transactions-regelzahlung-link.test.mjs`. Neue UI-Texte brauchen
   i18n-Schlüssel in `i18n.js`; es gibt `tests/i18n-coverage.test.mjs`.
5. **Schreibkanal** — siehe offene Frage (a). Aktuell existiert keiner.

## Offene Fragen — mit Lars klären, bevor du Daten schreibst

**(a) Wie wird das Feld gesetzt?**
`tools/confirm.mjs` ist der menschliche Kanal für KATEGORIE-Entscheidungen und kann
nichts anderes; Hand-Edits an `transaktionen.jsonl` verbieten die Skills
ausdrücklich. Optionen: `confirm.mjs` um eine Aktion erweitern, oder ein eigenes
schmales Tool. Präzedenz für Variante zwei: `tools/agent-vorschlag.mjs` ist genau
aus so einer Werkzeuglücke entstanden. Leg eine Empfehlung mit Begründung vor,
statt es einfach zu entscheiden.

**(b) Zuschnitt:** nur KAT-020, oder gleich KAT-021 und KAT-002 mit? Das FELD selbst
darf in keinem Fall kategoriegebunden sein — die Kategorie ist nicht der Anker.

**(c)** Braucht die App eine Objektsicht (Kosten und Erträge je Immobilie), oder
reicht die Detailanzeige? Nicht ungefragt bauen.

## Daten — Phase 2, erst nach abgenommener Phase 1

Alle Buchungen auf KAT-020. **Zwei Zuordnungen sind bereits entschieden**
(Nutzerentscheidung vom 2026-08-12): die beiden Gegenparteien des Regel-Buckets
REG-225 gehen auf zwei *verschiedene* Objekte. Welche das sind, steht im
Lauf-Protokoll `DATENROOT/agent_log.jsonl` — such den Eintrag mit `anlass`
beginnend „kategorisierung-review: A4". Das Protokoll ist nicht versioniert und
ist der richtige Ort für diese Angaben.

Die übrigen Zuordnungen nennt Lars im Dialog. **Nicht raten** — Beleg oder
Nutzeraussage, sonst bleibt das Feld weg. Ort, Betragshöhe und Zeitraum sind
laut `docs/agent-context.md` ausdrücklich keine Belege.

## Nicht-Ziele

- Kein Pflichtfeld, keine Migration der 2804 Bestandszeilen.
- Keine Änderung an Kategorien, Regeln oder Kategorisierungsstatus.
- Keine Audit-, Historien- oder Versionsfelder (ADR 0002: In-Place-Updates).
- Kein bankspezifischer Sonderweg (ADR 0005).

## Randbedingungen

- Tests laufen über `npm test` (`node --test tests/*.test.mjs`).
- Fixtures erweitern: `tests/fixtures/master-valid` (gültiger Objektbezug) und
  `tests/fixtures/master-invalid` (Verweis auf eine nicht existierende IMM-ID muss
  einen Validator-Fehler auslösen).
- `tests/` ist versioniert: **keine Echtdaten in Fixtures** — keine echten Namen,
  IBANs oder Kontonummern.
- `data/demo` mitziehen, falls das Feld dort sinnvoll demonstrierbar ist
  (`tests/demo-data.test.mjs`).
- Nach jedem schreibenden Lauf `node tools/validator.mjs data/master`, und den Lauf
  in `data/master/agent_log.jsonl` protokollieren.
- Prüfe vor jedem Schreibzugriff sichtbar, dass der Zielpfad unter DATENROOT liegt.
- Neue ADR 0024 im Stil von 0023, sobald die Modellentscheidung steht.
- Arbeite auf einem Feature-Branch. Den Merge macht Lars selbst.

## Abnahme

- `npm test` grün, `npm run validate:fixtures` und `npm run validate:master` grün.
- Eine unbekannte `immobilie_id` an einer Transaktion wird vom Validator als Fehler
  gemeldet — negativ getestet, nicht nur behauptet.
- Die Detailansicht zeigt den Objektbezug, mit i18n-Schlüsseln.
- Es gibt einen dokumentierten Weg, das Feld ohne Hand-Edit an der JSONL zu setzen.
- Bericht am Ende mit Zählern: geänderte Dateien, gesetzte Objektbezüge, Testlage.

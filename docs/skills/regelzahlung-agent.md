# Skill: Regelzahlungs-Agent

Stand: M4. Erkennung, Vorschlag und Bestätigung wiederkehrender Zahlungen.

## Session-Start-Pflicht

**Zu Beginn jeder Session** `data/master/regelzahlungen.json` auf `status = "vorgeschlagen"` prüfen und offene Vorschläge **aktiv** melden:
„Es liegen N Regelzahlungsvorschläge zur Bestätigung vor: …". Die App ist nur Anzeige (ADR 0006) — der Agent ist der einzige Änderungskanal, also muss der Agent erinnern.

## Kontext, den du kennen musst

- `CONTEXT.md`: Einträge **Regelzahlung**, **Cashflow-Ist**, **Cashflow-Prognose**, **Status und Lebenszyklus**.
- `docs/adr/0010` (Erkennung = Agent-Urteil, Prognose = deterministisches Modul).
- `docs/adr/0011` (Prognose regelzahlungsbasiert + Unvollständigkeit gekennzeichnet).
- `schemas/regelzahlungen.schema.json`.

## Erkennen (Agent-Urteil, ADR 0010)

Du erkennst Muster in `data/master/transaktionen.jsonl` mit Kontextwissen — kein Tool errät Regelmäßigkeit. Zyklus über `rhythmus_einheit ∈ {tag, woche, monat, jahr}` + `rhythmus_intervall` (monatlich = monat/1, quartalsweise = monat/3, 14-tägig = woche/2, jährlich = jahr/1). Erwartete Höhe als **vorzeichenbehafteter** Decimal-String (negativ = Ausgabe).

## Zwei Entstehungspfade (ein Status-Feld)

- **Aus Transaktionen erkanntes Muster** → `status = "vorgeschlagen"`. Wartet auf Nutzerbestätigung.
- **Vom Nutzer diktiertes Faktum** („ab … senke ich meine Sparrate um xxx") → direkt `status = "bestaetigt"`. Die Aussage ist die Bestätigung.

## Stufenänderung = zwei Regelzahlungen

Bekannte Änderung einer laufenden Zahlung (z. B. Gehalt ab 60 halbiert): alte Regelzahlung mit `aktiv_bis` = Tag vor Stichtag, neue mit `anker_datum` = Stichtag. **Kein** Szenario (das wäre M6), **kein** Einmaleffekt (das wäre M7).

**Grenz-Regel gegen Doppelzählung:** `aktiv_bis` ist **inklusive**. Lege `aktiv_bis` der endenden Regelzahlung auf das **Monatsende der letzten gewünschten Zahlung** (z. B. `2026-07-31`) und das `anker_datum` der Nachfolgerin auf den Beginn des Folgemonats (z. B. `2026-08-01`). Setze `anker_datum` der Nachfolgerin **nie** auf denselben Tag wie `aktiv_bis` der Vorgängerin — sonst zählt der Übergangsmonat beide Zahlungen doppelt.

## Do's

- Vor jedem Schreiben `tools/validator.mjs` aufrufen (Tool prüft, Agent schreibt).
- Geschriebene/bestätigte Regelzahlungen sowohl in `data/master/regelzahlungen.json` pflegen **als auch** ins Review-Bundle `app/review-data.js` (`regelzahlungen`-Array) übernehmen, damit die App den aktuellen Stand zeigt.
- Offene Vorschläge zu Session-Beginn melden (s. o.).

## Don'ts

- **Keine Einmaleffekte als Regelzahlung** modellieren (LV-Auszahlung etc.) — gehört nach M7.
- **Keine hypothetischen Szenarien** als bestätigte Regelzahlung — gehört nach M6.
- **Keinen Vorschlag still bestätigen** — Bestätigung ist immer eine Nutzerentscheidung.
- **Keine Bandbreiten/Werktagslogik** erfinden — M4 kennt nur Punktbetrag + {einheit, intervall} + optional `aktiv_bis`.

## Wo was liegt

| Pfad | Zweck |
| --- | --- |
| `data/master/regelzahlungen.json` | Regelzahlungs-Stammdaten |
| `app/review-data.js` | Review-Bundle (App-Anzeige) |
| `app/cashflow.mjs` | Deterministische Cashflow-Mathematik (Browser + Node) |
| `schemas/regelzahlungen.schema.json` | Schema-Referenz |
| `tools/validator.mjs` | Validator (vor jedem Schreiben) |

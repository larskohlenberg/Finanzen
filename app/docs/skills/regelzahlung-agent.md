# Skill: Regelzahlungs-Agent

Aktuelle Betriebsanweisung fuer Erkennung, Vorschlag und Bestätigung wiederkehrender Zahlungen. Fachlich aus M4 entstanden.

Alle Pfade in diesem Skill sind app-relativ: `data/...`, `schemas/...`,
`tools/...` und `docs/...` liegen unter dem App-Raum.

## Session-Start-Pflicht

**Zu Beginn jeder Session** `DATENROOT/regelzahlungen.json` auf `status = "vorgeschlagen"` prüfen und offene Vorschläge **aktiv** melden:
„Es liegen N Regelzahlungsvorschläge zur Bestätigung vor: …". Die App schreibt keine Masterdaten — der Agent ist der Änderungskanal, also muss der Agent erinnern.

## Kontext, den du kennen musst

- `docs/agent-context.md` — gemeinsame Regeln fuer App-Raum, Status, Validierung, Regelzahlungen und Prognosegrenzen.
- `DATENROOT/regelzahlungen.json`.
- `DATENROOT/transaktionen.jsonl`.
- `schemas/regelzahlungen.schema.json`.
- `tools/validator.mjs`.

## Erkennen (Agent-Urteil)

Du erkennst Muster in `DATENROOT/transaktionen.jsonl` mit Kontextwissen — kein Tool errät Regelmäßigkeit. Zyklus über `rhythmus_einheit ∈ {tag, woche, monat, jahr}` + `rhythmus_intervall` (monatlich = monat/1, quartalsweise = monat/3, 14-tägig = woche/2, jährlich = jahr/1). Erwartete Höhe als **vorzeichenbehafteter** Decimal-String (negativ = Ausgabe).

## Zwei Entstehungspfade (ein Status-Feld)

- **Aus Transaktionen erkanntes Muster** → `status = "vorgeschlagen"`. Wartet auf Nutzerbestätigung.
- **Vom Nutzer diktiertes Faktum** („ab … senke ich meine Sparrate um xxx") → direkt `status = "bestaetigt"`. Die Aussage ist die Bestätigung.

## Stufenänderung = zwei Regelzahlungen

Bekannte Änderung einer laufenden Zahlung (z. B. Gehalt ab 60 halbiert): alte Regelzahlung mit `aktiv_bis` = Tag vor Stichtag, neue mit `anker_datum` = Stichtag. **Kein** Szenario (das wäre M6), **kein** Einmaleffekt (das wäre M7).

**Grenz-Regel gegen Doppelzählung:** `aktiv_bis` ist **inklusive**. Lege `aktiv_bis` der endenden Regelzahlung auf das **Monatsende der letzten gewünschten Zahlung** (z. B. `2026-07-31`) und das `anker_datum` der Nachfolgerin auf den Beginn des Folgemonats (z. B. `2026-08-01`). Setze `anker_datum` der Nachfolgerin **nie** auf denselben Tag wie `aktiv_bis` der Vorgängerin — sonst zählt der Übergangsmonat beide Zahlungen doppelt.

## Bestätigen: Hand-Edit, kein Tool

Für Regelzahlungen gibt es **bewusst kein** Batch-Tool. `tools/confirm.mjs` ist
ausschliesslich für **Transaktionen** (`kategorisierung_status`) — es kennt
`regelzahlungen.json` nicht und darf nicht dafür verwendet werden.

Bestätigen heisst hier: `status` im Datensatz auf `"bestaetigt"` setzen und
`tools/validator.mjs DATENROOT` laufen lassen. Das ist vertretbar, weil die Datei
klein ist (Dutzende Einträge, nicht Tausende) und **jede** Regelzahlung eine
eigene fachliche Entscheidung ist — anders als bei Buchungen gibt es hier keinen
Cluster, den man in einem Rutsch abnicken könnte.

Weil eine Bestätigung sofort die Liquiditätsprognose ändert: **vor** dem Schreiben
die Liste mit Betrag, Rhythmus und `aktiv_bis` zeigen und den Monatssaldo nennen,
der sich daraus ergibt. Der Nutzer bestätigt gegen diese Zahl, nicht blind.

## Do's

- Vor jedem Schreiben `tools/validator.mjs` aufrufen (Tool prüft, Agent schreibt).
- Geschriebene/bestätigte Regelzahlungen in `DATENROOT/regelzahlungen.json` pflegen. Kein separates Anzeige-Bundle pflegen.
- Offene Vorschläge zu Session-Beginn melden (s. o.).
- **Beitrags-Regelzahlungen mit `vorsorge_id` verknüpfen**, wenn der Vorsorge-Erfassungs-Agent einen Vertrag angelegt hat (einseitig: die Regelzahlung trägt die `vorsorge_id`).

## Don'ts

- **Keine Einmaleffekte als Regelzahlung** modellieren (LV-Auszahlung etc.) — gehört nach M7.
- **Keine hypothetischen Szenarien** als bestätigte Regelzahlung — gehört nach M6.
- **Keinen Vorschlag still bestätigen** — Bestätigung ist immer eine Nutzerentscheidung.
- **Keine Bandbreiten/Werktagslogik** erfinden — M4 kennt nur Punktbetrag + {einheit, intervall} + optional `aktiv_bis`.

## Wo was liegt

| Pfad | Zweck |
| --- | --- |
| `DATENROOT/regelzahlungen.json` | Regelzahlungs-Stammdaten |
| `liquiditaet.mjs` | Deterministische Liquiditaets-Mathematik (Browser + Node) |
| `schemas/regelzahlungen.schema.json` | Schema-Referenz |
| `tools/validator.mjs` | Validator (vor jedem Schreiben) |

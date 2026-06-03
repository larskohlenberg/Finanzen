# M4 — Nachvollziehbare Prognose + Regelzahlungs-View

**Datum:** 2026-06-03
**Branch:** `fix/m4-prognose-nachvollziehbarkeit`
**Status:** Design freigegeben

## Problem

Die Cashflow-Prognose ist in der Weboberfläche eine Blackbox. Sichtbar sind nur
aggregierte Monatssummen (Monat + Netto), zwei Summen-Kacheln und Qualitäts-Chips
([app/main.js:544](../../../app/main.js), [renderMonatsTabelle:520](../../../app/main.js)).

Nicht sichtbar sind:

1. **Die Regelzahlungen selbst** — Betrag, Rhythmus, Anker-Datum, Gültig-bis,
   Status. Sie existieren im Datenmodell und in der getesteten Mathematik
   ([app/cashflow.mjs](../../../app/cashflow.mjs)), aber in keiner View
   (Stammdaten zeigt nur Personen/Konten/Kategorien).
2. **Die Herleitung pro Monat** — welche Regelzahlung mit welchem Betrag in einen
   Monat einfließt. `computeCashflowPrognose` verdichtet sofort zu Monatssummen
   ([cashflow.mjs:85-88](../../../app/cashflow.mjs)), die Einzelposten gehen verloren.

Folge: Die Prognose kann nicht geprüft werden — man muss sich blind darauf verlassen.

**Abgrenzung:** Der Ist-Cashflow hat dieses Problem *nicht*. Er ist eine reine
Aggregation tatsächlicher Buchungen ([computeCashflowIst:106](../../../app/cashflow.mjs)),
und jede Buchung ist bereits in der Transaktionen-View einzeln nachvollziehbar.
Der Ist-Teil bleibt daher unverändert.

## Ziel

Die Prognose vollständig nachvollziehbar machen: von den Eingangsdaten
(Regelzahlungen) über die Herleitung (welcher Posten in welchem Zeitraum) bis zum
Ergebnis (Periodensumme). Zusätzlich ein Filter zur freien Wahl von Granularität
und Zukunfts-Horizont.

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Regelzahlungs-Liste | Eigener Nav-Punkt „Regelzahlungen" |
| Aufschlüsselung Prognose | Aufklappbar, zwei Ebenen: Periode → Monate → Einzelposten |
| Filter | Nur Prognose: Granularität (Monat/Quartal/Jahr) + Bis-Datum |
| Horizont-Eingabe | Datumsfeld „Prognose bis" |
| Ist-Cashflow | Unverändert (Nachvollziehbarkeit via Transaktionen-View) |

## Architektur-Prinzip

Unverändert zum bestehenden Muster: reine, deterministische Mathematik in
`app/cashflow.mjs` (kein DOM, in Node testbar), Darstellung in `app/main.js`,
Texte in `app/i18n.js`. Vorgehen: neue pure Funktionen → Tests → UI.

## Komponenten

### 1. Rechenschicht — `app/cashflow.mjs`

**Neue Hilfsfunktion `periodenSchluessel(monat, granularitaet)`**
- Input: Monat als `"YYYY-MM"`, Granularität `"monat" | "quartal" | "jahr"`.
- Output: Periodenschlüssel — `"2026-08"` (Monat), `"2026-Q3"` (Quartal), `"2026"` (Jahr).
- **Fixe Kalenderquartale**, nicht rollierend: Q1 = Jan–Mär, Q2 = Apr–Jun,
  Q3 = Jul–Sep, Q4 = Okt–Dez. Formel: `Q = Math.floor((monatNr - 1) / 3) + 1`.

**Neue Funktion `computeCashflowPrognoseDetail(regelzahlungen, { today, horizonEnd, granularitaet })`**
- Iteriert wie `computeCashflowPrognose` über Regelzahlungen, berücksichtigt nur
  `status === "bestaetigt"`, zählt `vorgeschlagen` separat (ausgeschlossen).
- Behält **jede Einzelfälligkeit** als Posten:
  `{ datum, bezeichnung, regelzahlung_id, betrag_cents }`.
- Gruppiert hierarchisch: Periode → Monate → Posten.
- Rückgabe:

```
{
  perioden: [
    {
      periode: "2026-Q3",
      netto_cents,
      ist_laufend,        // true, wenn das Quartal das heutige Datum enthält
      monate: [
        {
          monat: "2026-08",
          netto_cents,
          ist_laufend,    // true, wenn dies der heutige Monat ist
          posten: [
            { datum: "2026-08-01", bezeichnung: "Miete", regelzahlung_id: "RZ-002", betrag_cents: -120000 },
            ...
          ]
        },
        ...
      ]
    },
    ...
  ],
  gesamt_netto_cents,
  horizont_ende,
  qualitaet: {
    bestaetigte_regelzahlungen,
    vorschlaege_nicht_enthalten,
    unbefristete_regelzahlungen,
    einmaleffekte_enthalten: false
  }
}
```

- Sortierung: Perioden, Monate und Posten je aufsteigend (Posten nach Datum).
- Bei Granularität `"monat"` enthält jede Periode genau einen Monat.
- **Laufender Zeitraum:** Die Prognose enthält nur Fälligkeiten *nach heute*
  (`cur > today` in `occurrences`). Das laufende Quartal und der laufende Monat
  sind daher **unvollständig** — der bereits vergangene Teil steckt im Ist.
  `ist_laufend` markiert die betroffene Periode bzw. den betroffenen Monat, damit
  die UI klarmachen kann, dass dort nur die *erwarteten/restlichen* Fälligkeiten
  stehen und der Zeitraum bewusst weniger Monate/Beträge zeigt.
  Bestimmung: `ist_laufend` der Periode = `periodenSchluessel(monatVon(today), gran) === periode`;
  `ist_laufend` des Monats = `monatVon(today) === monat`.

**Bestehende `computeCashflowPrognose`** bleibt erhalten (liefert weiterhin die
flache Monatsliste für die Summen-Kachel und Rückwärtskompatibilität der Tests).
Ob sie aus der Detail-Variante abgeleitet wird, entscheidet der Implementierungsplan
— ohne Verhaltensänderung der bestehenden Tests.

### 2. Darstellung — `app/main.js`

**a) Neuer Nav-Punkt „Regelzahlungen"**
- Eintrag in der Nav-Liste ([main.js:13](../../../app/main.js)), Routing in
  `renderView()` ([main.js:196](../../../app/main.js)).
- Neue Funktion `renderRegelzahlungen()`: Tabelle aller Regelzahlungen mit
  Spalten Bezeichnung, Betrag, Rhythmus (lesbar, z. B. „monatlich", „alle 3 Monate",
  „jährlich"), Anker-Datum, Gültig-bis (Datum oder „unbefristet"-Chip),
  Status-Chip (bestätigt/vorgeschlagen/abgelehnt).
- Hilfsfunktion `formatRhythmus(einheit, intervall)` für lesbare Rhythmus-Texte (i18n).

**b) Cashflow-Prognose mit Filter und Aufklapp-Tabelle**
- Filter-Leiste über der Prognose: drei Granularitäts-Buttons (Monat/Quartal/Jahr)
  und ein Datumsfeld „Prognose bis" (default = `defaultHorizonEnd`).
- `renderCashflow()` ([main.js:544](../../../app/main.js)) ruft zusätzlich
  `computeCashflowPrognoseDetail` mit den State-Werten auf und rendert eine
  zweistufig aufklappbare Tabelle:
  - Ebene 1: Periodenzeile (Periode + Netto), klickbar → klappt Monate auf.
  - Ebene 2: Monatszeile (Monat + Netto), klickbar → klappt Einzelposten auf.
  - Ebene 3: Postenzeile (Datum, Bezeichnung, Betrag).
- Bei Granularität „Monat" entfällt Ebene 1 visuell sinnvoll (Periode == Monat);
  Monatszeile klappt direkt zu Posten auf.
- **Summe bleibt sichtbar:** Beim Aufklappen bleibt die zugehörige Perioden- bzw.
  Monatszeile mit ihrer Netto-Summe **über** den aufgeklappten Detailzeilen stehen
  (Summenzeile ist die Kopfzeile des aufgeklappten Blocks, verschwindet nicht).
- **Laufender Zeitraum kenntlich:** Perioden/Monate mit `ist_laufend === true`
  tragen einen „laufend"-Chip und einen kurzen Hinweis, dass nur die noch
  erwarteten Fälligkeiten gezeigt werden (bereits Gebuchtes steht im Ist). So ist
  nachvollziehbar, warum das laufende Quartal/der laufende Monat weniger enthält.
- **Ist-Tabelle bleibt unverändert.**

**c) State**
- `state.cashflow = { granularitaet: "monat", bisDatum: <defaultHorizonEnd> }`.
- Aufgeklappte Zeilen: ein `Set` von Zeilen-Schlüsseln (Perioden-/Monatsschlüssel).
- Änderungen lösen Re-Render über das bestehende Event-Delegations-Muster aus
  (Daten-Attribute wie bei `data-view` / `data-master-section`).

### 3. Texte — `app/i18n.js`
- Neuer Block `regelzahlungen.*` (Titel, Lead, Spaltenköpfe, „unbefristet",
  Status-Labels falls nötig) — DE + EN.
- Erweiterung `cashflow.*` (Granularität Monat/Quartal/Jahr, „Prognose bis",
  Spaltenköpfe Datum/Bezeichnung, Aufklapp-Hinweise, „laufend" + Hinweistext
  „nur erwartete Fälligkeiten, Gebuchtes siehe Ist") — DE + EN.
- Nav-Label `nav.regelzahlungen` — DE + EN.
- Rhythmus-Texte für `formatRhythmus`.

## Datenfluss

```
data.regelzahlungen ──┐
                      ├─ computeCashflowPrognoseDetail(today, bisDatum, granularitaet)
state.cashflow ───────┘        │
                               └─ perioden[] → renderCashflow() → aufklappbare Tabelle

data.regelzahlungen ── renderRegelzahlungen() → Stammdaten-Tabelle (Eingangsdaten)
```

## Fehlerbehandlung / Randfälle

- **Leere Regelzahlungen / keine Fälligkeiten:** `perioden: []` → bestehende
  „leer"-Meldung in der Prognose (`cashflow.empty`).
- **Bis-Datum vor heute:** keine Fälligkeiten → leere Prognose; Datumsfeld erlaubt
  Korrektur. Kein Crash.
- **Unbefristete Regelzahlungen (`aktiv_bis` fehlt):** laufen bis zum gewählten
  Bis-Datum; bestehender „unbefristet"-Chip bleibt.
- **Quartals-/Jahresgrenzen:** über `periodenSchluessel` korrekt zugeordnet.
- **Vorgeschlagene Regelzahlungen:** nicht in der Prognose enthalten, aber in der
  Regelzahlungs-Liste sichtbar (mit Status-Chip) und als „X Vorschläge nicht
  enthalten"-Chip in der Prognose ausgewiesen.

## Tests (TDD)

Neue Tests in [tests/m4-cashflow.test.mjs](../../../tests/m4-cashflow.test.mjs),
gleicher Stil wie bestehend (`node:test`, `assert/strict`):

- `periodenSchluessel`: Monat/Quartal/Jahr inkl. fixer Quartalsgrenzen
  (`2026-03` → `2026-Q1`, `2026-04` → `2026-Q2`, `2026-07` → `2026-Q3`,
  `2026-10`/`2026-12` → `2026-Q4`).
- `computeCashflowPrognoseDetail`:
  - Gruppierung Periode → Monate → Posten korrekt.
  - Einzelposten bleiben erhalten (Datum, Bezeichnung, Betrag, ID).
  - Summen-Konsistenz: Σ Posten = Monatssumme = Σ Monate = Periodensumme;
    Σ Perioden = `gesamt_netto_cents`.
  - Bis-Datum-Grenze: keine Fälligkeit nach `horizonEnd`.
  - Vorschläge ausgeschlossen, `qualitaet`-Zähler stimmen.
  - Granularität „monat": je Periode genau ein Monat.
  - `ist_laufend`: gesetzt für Periode und Monat, die `today` enthalten;
    nicht gesetzt für rein zukünftige Perioden/Monate.

Die UI (`renderRegelzahlungen`, Filter, Aufklappen) wird nicht unit-getestet
(bestehendes Muster), sondern im Browser verifiziert (Preview-Workflow): Nav-Punkt
erscheint, Liste zeigt Regelzahlungen, Granularitäts-Buttons und Bis-Datum ändern
die Prognose, Zeilen klappen auf und zeigen die korrekten Einzelposten, die
Summenzeile bleibt beim Aufklappen sichtbar, laufendes Quartal/laufender Monat
sind als „laufend" markiert.

## Nicht im Umfang (YAGNI)

- Bearbeiten/Anlegen von Regelzahlungen über die UI (nur Anzeige).
- Einmaleffekte in der Prognose (`einmaleffekte_enthalten` bleibt `false`).
- Änderungen am Ist-Cashflow oder an der Transaktionen-View.
- Diagramme/Charts — Tabellen genügen für die Nachvollziehbarkeit.

# Transaktionssuche nach Regel-ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das bestehende Suchfeld der Transaktionsansicht findet Buchungen ueber ihre zugeordnete Kategorisierungsregel-ID.

**Architecture:** Die bestehende Suchfeldliste `transactionSearchFields(tx)` wird um die Werte aus `tx.matched_regeln` erweitert. Die vorhandene Normalisierung, UND-Verknuepfung der Suchbegriffe und Kombination mit allen anderen Filtern bleiben unveraendert.

**Tech Stack:** Vanilla JavaScript als ESM, nativer Node.js-Test-Runner (`node:test`), keine neuen Abhaengigkeiten.

## Global Constraints

- Nur Kategorisierungsregel-IDs aus `matched_regeln` sind neu durchsuchbar.
- Regelbedingungen, Regelkommentare und `regelzahlung_id` bleiben ausserhalb der Suche.
- Konto- und Kategorienamen bleiben bewusst aus dem Freitext-Suchindex ausgeschlossen.
- Die vorhandene Filterlogik und Benutzeroberflaeche werden nicht veraendert.

---

## Dateiuebersicht

- `tests/transactions-search.test.mjs`: Erweitert das synthetische Suchszenario und belegt die Suche nach einer konkreten Regel-ID.
- `app/views/transaktionen.mjs`: Liefert die gespeicherten Regel-IDs als weitere Felder an die vorhandene Freitextsuche.

### Task 1: Regel-ID in die Transaktionssuche aufnehmen

**Files:**
- Modify: `tests/transactions-search.test.mjs:27-69`
- Modify: `app/views/transaktionen.mjs:8-24`

**Interfaces:**
- Consumes: `tx.matched_regeln?: string[]`, `matchesQuery(felder, query): boolean` und `filteredTransactions(): object[]`.
- Produces: Keine neue exportierte Schnittstelle; `filteredTransactions()` beruecksichtigt Regel-IDs im vorhandenen Suchfilter.

- [ ] **Step 1: Failing-Test schreiben**

In `tests/transactions-search.test.mjs` neben den vorhandenen Konstanten eine eindeutige Regel-ID definieren:

```javascript
const RULE_ID = "REG-999";
```

Das synthetische Transaktionsobjekt in `withSearchScenario` um die Zuordnung ergaenzen:

```javascript
matched_regeln: [RULE_ID],
```

Anschliessend diesen Test ergaenzen:

```javascript
test("Suche nach konkreter Regel-ID matcht nur die zugeordnete Buchung", () => {
  withSearchScenario(() => {
    state.transactionFilters.search = RULE_ID;
    let ids = filteredTransactions().map((tx) => tx.transaktion_id);
    assert.ok(ids.includes(TX_ID), "Zugeordnete Regel-ID muss die Buchung finden");

    state.transactionFilters.search = "REG-998";
    ids = filteredTransactions().map((tx) => tx.transaktion_id);
    assert.ok(!ids.includes(TX_ID), "Andere Regel-ID darf die Buchung nicht finden");
  });
});
```

- [ ] **Step 2: Test laufen lassen und den erwarteten Fehlschlag pruefen**

Run:

```bash
node --test tests/transactions-search.test.mjs
```

Expected: Der neue Test scheitert an `Zugeordnete Regel-ID muss die Buchung finden`, waehrend die beiden bestehenden Suchtests bestehen.

- [ ] **Step 3: Minimale Implementierung schreiben**

In `transactionSearchFields(tx)` direkt nach den beiden Betragsdarstellungen die gespeicherten Regel-IDs in die Feldliste aufnehmen:

```javascript
    ...(tx.matched_regeln ?? []),
```

Die vorhandene Auslassung von Konto- und Kategorienamen sowie alle weiteren Suchfelder bleiben unveraendert.

- [ ] **Step 4: Zieltest und vollstaendige Testsuite ausfuehren**

Run:

```bash
node --test tests/transactions-search.test.mjs
npm test
```

Expected: Alle Tests bestehen ohne Fehler oder Warnungen.

- [ ] **Step 5: Aenderung pruefen und committen**

Run:

```bash
git diff --check
git diff -- tests/transactions-search.test.mjs app/views/transaktionen.mjs
git status --short
```

Expected: Nur der Suchtest, die Suchfeldliste sowie dieses bereits versionierte Planartefakt sind betroffen; `git diff --check` meldet nichts.

Commit:

```bash
git add tests/transactions-search.test.mjs app/views/transaktionen.mjs
git commit -m "feat(transaktionen): Suche nach Regel-ID"
```

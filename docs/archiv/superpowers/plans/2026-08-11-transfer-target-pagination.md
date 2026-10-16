# Transfer-Gegenbuchung auf Zielseite anzeigen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beim Öffnen einer Transfer-Gegenbuchung die Tabellen-Pagination auf die Seite der ausgewählten Gegenbuchung setzen und dieselbe Berechnung für Transaktions-Deep-Links verwenden.

**Architecture:** `app/views/transaktionen.mjs` stellt mit `transactionPageForId(transactionId)` eine reine, aus dem aktuellen Laufzeitzustand abgeleitete Seitenberechnung bereit. `app/main.js` nutzt diese Funktion nach dem Setzen der jeweiligen Filter sowohl für `paired-transfer` als auch für Deep-Links; die vorhandene Rendering-Logik markiert die ausgewählte Zeile und öffnet die Detail-Rail.

**Tech Stack:** JavaScript ES-Module, Node.js Test Runner (`node:test`), HTML-String-Rendering

## Global Constraints

- Die Berechnung muss die aktuelle Transaktionssortierung und `state.pageSize` berücksichtigen.
- Eine im gefilterten Bestand fehlende ID muss Seite 1 liefern.
- Der Kontofilter der Gegenbuchung bleibt gesetzt; andere Filterabläufe werden nicht verändert.
- Die bestehende Auswahlmarkierung über `state.selectedTransactionId` bleibt unverändert.
- Manuelles Blättern bei geöffneter Detail-Rail bleibt möglich.

---

### Task 1: Gemeinsame Zielseitenberechnung und Regressionstest

**Files:**
- Create: `tests/transfer-target-pagination.test.mjs`
- Modify: `app/views/transaktionen.mjs:31-43`
- Modify: `app/main.js:5,730-742,909-918`

**Interfaces:**
- Consumes: `filteredTransactions()`, `state.pageSize`, `state.transactionFilters`, `state.transactionSort`
- Produces: `transactionPageForId(transactionId: string): number`

- [x] **Step 1: Failing Regressionstest schreiben**

Der Test ersetzt den Transaktionsbestand vorübergehend durch zwölf kontrollierte Buchungen desselben Kontos. Die Ziel-ID liegt bei absteigender Datumssortierung außerhalb der ersten Seite.

```js
test("transactionPageForId respects sorting, page size, and missing IDs", () => {
  installTransactions(buildTransactions());
  state.transactionSort = { key: "date", dir: "desc" };
  state.pageSize = 5;
  assert.equal(transactionPageForId("TX-TARGET"), 3);

  state.transactionSort = { key: "date", dir: "asc" };
  assert.equal(transactionPageForId("TX-TARGET"), 1);
  assert.equal(transactionPageForId("TX-MISSING"), 1);
});

test("target page renders the paired transaction as selected with its detail rail", () => {
  installTransactions(buildTransactions());
  state.transactionSort = { key: "date", dir: "desc" };
  state.pageSize = 10;
  state.selectedTransactionId = "TX-TARGET";
  state.detailRailClosed = false;
  state.transactionPage = transactionPageForId("TX-TARGET");

  const html = renderTransactions();
  assert.equal(state.transactionPage, 2);
  assert.match(html, /transaction-row selected/);
  assert.match(html, /detail-panel/);
  assert.match(html, /data-transaction="TX-TARGET"/);
});
```

- [x] **Step 2: Test ausführen und roten Zustand bestätigen**

Run: `node --test tests/transfer-target-pagination.test.mjs`

Expected: FAIL, weil `app/views/transaktionen.mjs` noch keinen Export `transactionPageForId` besitzt.

- [x] **Step 3: Minimale gemeinsame Seitenberechnung implementieren**

In `app/views/transaktionen.mjs` direkt nach `filteredTransactions()` ergänzen:

```js
export function transactionPageForId(transactionId) {
  const index = filteredTransactions().findIndex((tx) => tx.transaktion_id === transactionId);
  return index >= 0 ? Math.floor(index / state.pageSize) + 1 : 1;
}
```

In `app/main.js` die Funktion importieren. Im `paired-transfer`-Handler nach Ziel-ID und Kontofilter setzen:

```js
state.detailRailClosed = false;
state.transactionPage = transactionPageForId(element.dataset.transaction);
```

In `applyRoute()` die lokale `findIndex`-Berechnung ersetzen:

```js
state.transactionPage = transactionPageForId(route.selectedTransactionId);
```

- [x] **Step 4: Fokussierten Test grün ausführen**

Run: `node --test tests/transfer-target-pagination.test.mjs`

Expected: 2 Tests bestehen.

- [x] **Step 5: Gesamte Testsuite ausführen**

Run: `npm test`

Expected: Alle Tests bestehen.

- [x] **Step 6: Änderung prüfen und committen**

```bash
git diff --check
git diff -- app/main.js app/views/transaktionen.mjs tests/transfer-target-pagination.test.mjs
git add app/main.js app/views/transaktionen.mjs tests/transfer-target-pagination.test.mjs docs/superpowers/plans/2026-08-11-transfer-target-pagination.md
git commit -m "fix(app): Transfer-Gegenbuchung auf Zielseite anzeigen"
```

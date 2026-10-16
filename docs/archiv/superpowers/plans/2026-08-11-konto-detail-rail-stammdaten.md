# Konto-Detail-Rail in den Stammdaten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Konto-Klick in Stammdaten öffnet eine adressierbare Detail-Rail mit Anker und Wertständen; die gefilterten Transaktionen bleiben über eine eigene Rail-Aktion erreichbar.

**Architecture:** `renderAccountTable` erhält eine optionale Zeilenaktion, sodass nur die Stammdaten das Auswahlverhalten ändern. Die Stammdaten-Rail verwendet den vorhandenen `renderVermoegenDetail`-Renderer mit einer aus `kontoWert` gebauten Konto-Position; dadurch gibt es nur eine Darstellung für Anker, Saldo und Wertstände. `main.js` verwaltet Auswahl und Schließen über den bereits gerouteten Zustand `selectedKonto`.

**Tech Stack:** Browser-ES-Module, HTML-String-Rendering, Node.js `node:test`, bestehendes Hash-Routing und Playwright-Browserprüfung.

## Global Constraints

- `#/konten/<konto_id>` bleibt die Route der Konto-Rail in Stammdaten.
- Die Kontentabelle der Übersicht behält ihren direkten Transaktions-Drilldown.
- Stammdaten, Ankerberechnung und Wertstände werden nicht dupliziert.
- Unabhängige lokale Transfer-Paginierungsänderungen bleiben unangetastet.

---

### Task 1: Konten-Sektion mit wiederverwendeter Detail-Rail

**Files:**
- Modify: `tests/stammdaten-regeln.test.mjs`
- Modify: `app/komponenten.mjs:153-205`
- Modify: `app/views/vermoegen.mjs:305`
- Modify: `app/views/stammdaten.mjs:1-70`
- Modify: `app/i18n.js` (`masterdata` in Deutsch und Englisch)

**Interfaces:**
- Consumes: `kontoWert(konto, zeitwerte, transaktionen, today)` und `renderVermoegenDetail(position, today)`.
- Produces: `renderAccountTable({ showId, rowAction })`, exportiertes `renderVermoegenDetail(position, today)` und Stammdaten-Markup mit `select-master-account`, `close-account-rail` sowie `account-transactions`.

- [ ] **Step 1: Failing Render-Test schreiben**

Ergänze in `tests/stammdaten-regeln.test.mjs` einen isolierten Test mit einem
Konto, zwei Kontostand-Zeitwerten und einer Buchung nach dem jüngsten Anker:

```js
test("Konten-Stammdaten öffnen Details mit Ankern und eigener Transaktionsaktion", () => {
  // data.konten/transaktionen/zeitwerte und kontenById sichern, Testdaten setzen
  state.masterSection = "konten";
  state.selectedKonto = "KTO-DETAIL";

  const html = renderMasterdata();

  assert.match(html, /layout-with-rail/);
  assert.match(html, /detail-panel/);
  assert.match(html, /Belegter Anker/);
  assert.match(html, /Buchungen seit Anker/);
  assert.match(html, /Aktueller Saldo/);
  assert.equal((html.match(/class="wertstand-item"/g) ?? []).length, 2);
  assert.match(html, /data-action="account-transactions" data-account="KTO-DETAIL"/);
  assert.match(html, /Transaktionen anzeigen/);
  // Zustand und Map im finally-Block wiederherstellen
});
```

Ergänze eine Assertion im bestehenden Konten-Test, dass die Stammdatenzeile
`data-action="select-master-account"` trägt.

- [ ] **Step 2: Test ausführen und korrektes Rot bestätigen**

Run: `node --test tests/stammdaten-regeln.test.mjs`

Expected: FAIL, weil die Stammdaten weder `select-master-account` noch eine
Konten-Rail mit eigener Transaktionsaktion rendern.

- [ ] **Step 3: Minimale Render-Implementierung schreiben**

Passe `renderAccountTable` und `renderAccountRows` so an, dass
`rowAction = "account-transactions"` der Default bleibt und die Stammdaten
`rowAction: "select-master-account"` übergeben können. Auswahlzeilen erhalten
`tabindex="0"`, `role="button"` und ein Konto-`aria-label`.

Exportiere in `app/views/vermoegen.mjs` den bestehenden Renderer:

```js
export function renderVermoegenDetail(p, today) {
  // bestehender Funktionskörper unverändert
}
```

Baue in `app/views/stammdaten.mjs` eine Konto-Position ohne Filter auf den
Vermögensbestand:

```js
function kontoPosition(konto, today) {
  const wert = kontoWert(konto, data.zeitwerte, data.transaktionen, today);
  return {
    klasse: "konto",
    id: konto.konto_id,
    name: konto.name,
    wert_cents: wert.wert_cents ?? 0,
    basis: wert.basis,
    qualitaet: wert.qualitaet,
    standdatum: wert.standdatum,
    fehlt: wert.wert_cents === null,
  };
}
```

Rendere für `masterSection === "konten"` ein `layout-with-rail`. Die Rail
enthält `renderVermoegenDetail(...)`, einen Schließen-Button und:

```html
<button class="linkish" data-action="account-transactions" data-account="...">
  Transaktionen anzeigen
</button>
```

Ergänze `masterdata.showTransactions` mit `"Transaktionen anzeigen"` und
`"Show transactions"`.

- [ ] **Step 4: Fokussierten Test grün ausführen**

Run: `node --test tests/stammdaten-regeln.test.mjs`

Expected: PASS.

### Task 2: Auswahl-, Schließ- und Navigationslogik

**Files:**
- Modify: `tests/ui-layout-contract.test.mjs`
- Modify: `app/main.js` im Klick-Handler und in `handleAction`

**Interfaces:**
- Consumes: Markup-Aktionen `select-master-account`, `close-account-rail` und die bestehende Aktion `account-transactions`.
- Produces: Zustandsübergänge für `state.view`, `state.masterSection` und `state.selectedKonto`, die durch `commitNavigation()` geroutet werden.

- [ ] **Step 1: Failing Contract-Test schreiben**

Ergänze in `tests/ui-layout-contract.test.mjs`:

```js
test("account masterdata uses a selectable detail rail with a separate transaction action", () => {
  assert.match(main, /action === "select-master-account"/);
  assert.match(main, /state\.selectedKonto = element\.dataset\.account/);
  assert.match(main, /action === "close-account-rail"/);
  assert.match(main, /state\.selectedKonto = ""/);
  assert.match(main, /data-action="account-transactions"/);
  assert.match(i18n, /showTransactions:\s*"Transaktionen anzeigen"/);
  assert.match(i18n, /showTransactions:\s*"Show transactions"/);
});
```

- [ ] **Step 2: Test ausführen und korrektes Rot bestätigen**

Run: `node --test tests/ui-layout-contract.test.mjs`

Expected: FAIL, weil `select-master-account` und `close-account-rail` noch nicht
behandelt werden.

- [ ] **Step 3: Minimale Interaktionslogik schreiben**

Ergänze in `handleAction`:

```js
if (action === "select-master-account") {
  state.view = "masterdata";
  state.masterSection = "konten";
  state.selectedKonto = element.dataset.account || "";
  commitNavigation();
  return;
}
if (action === "close-account-rail") {
  state.selectedKonto = "";
  commitNavigation();
  return;
}
```

Beim Wechsel der Stammdaten-Kachel wird `selectedKonto` zusammen mit der
anderen Detailauswahl geleert, damit keine verborgene Kontoauswahl in eine
spätere Route hineinwirkt.

- [ ] **Step 4: Contract-Test grün ausführen**

Run: `node --test tests/ui-layout-contract.test.mjs`

Expected: PASS.

- [ ] **Step 5: Vollständige Verifikation ausführen**

Run:

```bash
npm test
npm run validate:master
```

Expected: gesamte Testsuite PASS; Masterdatenvalidierung endet mit
`Validierung bestanden`.

Starte anschließend `python3 serve_app.py 8765` und prüfe mit dem
sandbox-kompatiblen Playwright-Runner:

1. `#/konten` zeigt keine offene Rail.
2. Kontozeilenklick bleibt in Stammdaten und setzt `#/konten/<id>`.
3. Die Rail zeigt Anker und Wertstände.
4. **Transaktionen anzeigen** wechselt zu `#/transaktionen` und setzt den
   Kontofilter.
5. Der Schließen-Button entfernt die Rail und setzt `#/stammdaten`.

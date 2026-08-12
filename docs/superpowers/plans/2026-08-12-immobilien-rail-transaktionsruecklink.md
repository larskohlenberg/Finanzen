# Immobilien-Rail-Transaktionsruecklink Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Immobilien-Rail oeffnet ueber `Transaktionen anzeigen` die bestehende Transaktionsansicht mit der Immobilien-ID als einzigem aktivem Filter.

**Architecture:** `renderVermoegenDetail()` rendert nur fuer Positionen der Klasse `immobilie` eine eigene, lokalisierte Klickaktion mit der Immobilien-ID. Der zentrale Action-Handler wechselt zur Transaktionsansicht, setzt alle Transaktionsfilter deterministisch zurueck und belegt nur `search` mit der ID; die bestehende Suche und das bestehende Routing erledigen den Rest.

**Tech Stack:** Vanilla JavaScript ES modules, HTML-String-Renderer, zentraler delegierter Action-Handler, `node:test`, vorhandene de/en-i18n-Tabelle.

## Global Constraints

- Keine neue Objektsicht, eingebettete Transaktionsliste oder eigener Immobilien-Dropdown.
- Die vorhandene Freitextsuche bleibt der einzige Immobilienfilter und erhaelt exakt die `IMM-…`-ID.
- Konto-, Status-, Kategorie-, Transfer-, Herkunfts- und Zeitraumfilter werden geleert; Seite wird auf `1` und Transaktionsauswahl auf leer gesetzt.
- Der bestehende i18n-Schluessel `masterdata.showTransactions` liefert `Transaktionen anzeigen` beziehungsweise `Show transactions`; kein duplizierter UI-Text.
- Keine Aenderung an `app/data/master`, `app/data/demo`, Kategorien, Regeln oder Kategorisierungsstatus.
- TDD: Produktionscode erst nach einem fachlich erwarteten roten Test.

---

### Task 1: Immobilien-Rail mit ID-Suchruecklink

**Files:**
- Modify: `tests/vermoegen-vorsorge-i18n.test.mjs`
- Modify: `tests/transfer-target-pagination.test.mjs`
- Modify: `app/views/vermoegen.mjs`
- Modify: `app/main.js`

**Interfaces:**
- Consumes: `renderVermoegenDetail(p, today)`, `state.transactionFilters`, `commitNavigation()`, `masterdata.showTransactions`.
- Produces: HTML-Aktion `data-action="immobilie-transactions" data-immobilie="IMM-001"`; Klickzustand `state.view === "transactions"` und `state.transactionFilters.search === "IMM-001"`.

- [ ] **Step 1: Failing Renderer-Test fuer den Rail-Link schreiben**

In `tests/vermoegen-vorsorge-i18n.test.mjs` einen Test mit synthetischer Immobilie und Marktwert ergaenzen. Daten und State im `try/finally` sichern und wiederherstellen. Fuer `de` und `en` muss `renderVermoegen()` dieselbe Action/ID und den lokalisierten Text liefern:

```js
test("Immobilien-Rail bietet den lokalisierten Ruecklink zu Transaktionen", () => {
  const originalData = {
    konten: data.konten,
    immobilien: data.immobilien,
    vermoegenswerte: data.vermoegenswerte,
    darlehen: data.darlehen,
    vorsorge: data.vorsorge,
    zeitwerte: data.zeitwerte,
  };
  const originalState = {
    lang: state.lang,
    vermoegenFilters: state.vermoegenFilters,
    selectedVermoegenId: state.selectedVermoegenId,
    vermoegenDetailRailClosed: state.vermoegenDetailRailClosed,
    vermoegenRailMode: state.vermoegenRailMode,
  };

  try {
    Object.assign(data, {
      konten: [],
      immobilien: [{
        immobilie_id: "IMM-001",
        bezeichnung: "Testhaus",
        status: "aktiv",
        eigentumsanteile: [],
      }],
      vermoegenswerte: [],
      darlehen: [],
      vorsorge: [],
      zeitwerte: [{
        entitaet: "immobilie",
        entitaet_id: "IMM-001",
        feld: "marktwert",
        wert: "100000.00",
        standdatum: "2026-01-01",
        qualitaet: "belegt",
      }],
    });
    Object.assign(state, {
      vermoegenFilters: { klasse: "", qualitaet: "" },
      selectedVermoegenId: "immobilie:IMM-001",
      vermoegenDetailRailClosed: false,
      vermoegenRailMode: "position",
    });

    for (const [lang, label] of [["de", "Transaktionen anzeigen"], ["en", "Show transactions"]]) {
      state.lang = lang;
      const html = renderVermoegen();
      assert.match(html, /data-action="immobilie-transactions" data-immobilie="IMM-001"/);
      assert.match(html, new RegExp(label));
    }
  } finally {
    Object.assign(data, originalData);
    Object.assign(state, originalState);
  }
});
```

- [ ] **Step 2: Failing Action-Test fuer Filterreset und Navigation schreiben**

In `tests/transfer-target-pagination.test.mjs` mit dem vorhandenen `clickAction()`-Harness einen Test ergaenzen. Der Test muss vor dem Klick konkurrierende Filter, eine spaetere Seite und eine Auswahl setzen:

```js
test("Immobilien-Ruecklink oeffnet die Transaktionssuche nur mit der Immobilien-ID", () => {
  resetTransactionState();
  state.transactionFilters = {
    account: "KTO-ALT",
    status: "offen",
    category: "KAT-ALT",
    transfer: "ja",
    origin: "regel",
    search: "alt",
    timeMode: "month",
    dateFrom: "2026-01-01",
    dateTo: "2026-01-31",
    month: "2026-01",
    quarterYear: "2026",
    quarter: "2",
    year: "2026",
  };
  state.transactionPage = 4;
  state.selectedTransactionId = TARGET_ID;
  historyCalls.length = 0;

  clickAction({ action: "immobilie-transactions", immobilie: "IMM-004" });

  assert.equal(state.view, "transactions");
  assert.deepEqual(state.transactionFilters, {
    account: "",
    status: "",
    category: "",
    transfer: "",
    origin: "",
    search: "IMM-004",
    timeMode: "none",
    dateFrom: "",
    dateTo: "",
    month: "",
    quarterYear: "",
    quarter: "1",
    year: "",
  });
  assert.equal(state.transactionPage, 1);
  assert.equal(state.selectedTransactionId, "");
  assert.equal(state.detailRailClosed, false);
  assert.equal(location.hash, "#/transaktionen");
});
```

- [ ] **Step 3: Tests ausfuehren und fachlich erwartetes RED bestaetigen**

Run:

```bash
node --test tests/vermoegen-vorsorge-i18n.test.mjs tests/transfer-target-pagination.test.mjs
```

Expected: Der Renderer-Test findet `data-action="immobilie-transactions"` nicht; der Action-Test behaelt die alte View beziehungsweise alte Filter, weil der Handler fehlt.

- [ ] **Step 4: Minimalen Rail-Link rendern**

In `app/views/vermoegen.mjs` im Branch `p.klasse === "immobilie" || p.klasse === "vermoegenswert"` nur fuer Immobilien folgende Section an die Rueckgabe anhaengen:

```js
const transaktionenLink = p.klasse === "immobilie"
  ? `<div class="detail-section"><button class="linkish" data-action="immobilie-transactions" data-immobilie="${escapeHtml(p.id)}">${escapeHtml(t("masterdata.showTransactions"))}</button></div>`
  : "";
```

Die bestehende Detailausgabe lautet danach vollstaendig:

```js
return head
  + (entity?.typ ? detailRow(t("labels.type"), escapeHtml(t(`vermoegen.typ.${entity.typ}`))) : "")
  + (entity?.adresse ? detailRow(t("vermoegen.adresse"), escapeHtml(entity.adresse)) : "")
  + (mw
    ? detailRow(t("vermoegen.marktwert"),
        `<strong>${escapeHtml(formatMoney(mwCents))}</strong><br>${escapeHtml(formatDate(mw.standdatum))} · ${qualitaetChip({ qualitaet: mw.qualitaet })}${mw.quelle_hinweis ? `<br><span class="muted">${escapeHtml(mw.quelle_hinweis)}</span>` : ""}`)
    : detailRow(t("vermoegen.marktwert"), `<span class="chip review">${iconSvg("review")}${escapeHtml(t("vermoegen.qualityFehlend"))}</span>`))
  + (entity?.eigentumsanteile ? detailRow(t("vermoegen.eigentumsanteile"), anteileHtml(entity.eigentumsanteile, mwCents)) : "")
  + detailRow(t("vermoegen.anteiligerWert"),
      p.fehlt ? `<span class="muted">${escapeHtml(t("vermoegen.standOhne"))}</span>` : `<strong>${escapeHtml(formatMoney(p.wert_cents))}</strong>`)
  + renderPositionWertstaende(p)
  + transaktionenLink;
```

Der Link darf bei `vermoegenswert` nicht erscheinen.

- [ ] **Step 5: Minimalen Action-Handler implementieren**

In `app/main.js` bei den Transaktionsaktionen ergaenzen:

```js
if (action === "immobilie-transactions") {
  state.view = "transactions";
  state.transactionFilters = {
    account: "",
    status: "",
    category: "",
    transfer: "",
    origin: "",
    search: element.dataset.immobilie || "",
    timeMode: "none",
    dateFrom: "",
    dateTo: "",
    month: "",
    quarterYear: "",
    quarter: "1",
    year: "",
  };
  state.transactionPage = 1;
  state.selectedTransactionId = "";
  state.detailRailClosed = false;
  commitNavigation();
  return;
}
```

- [ ] **Step 6: Fokussierte Tests auf GREEN bringen**

Run:

```bash
node --test tests/vermoegen-vorsorge-i18n.test.mjs tests/transfer-target-pagination.test.mjs tests/i18n-coverage.test.mjs tests/transactions-search.test.mjs
```

Expected: Alle Tests PASS, keine Warnungen.

- [ ] **Step 7: Gesamtverifikation und Browserpruefung**

Run:

```bash
npm test
npm run validate:fixtures
npm run validate:master
node app/tools/validator.mjs app/data/demo
git diff --check
```

Expected: Gesamtsuite und alle Validatoren PASS; kein Whitespace-Befund. Im laufenden Browser Demo-Modus waehlen, `IMM-001`-Immobilie oeffnen, `Transaktionen anzeigen` klicken und pruefen: Route `#/transaktionen`, Suchfeld `IMM-001`, 72 Treffer.

- [ ] **Step 8: Implementierung committen**

```bash
git add app/views/vermoegen.mjs app/main.js tests/vermoegen-vorsorge-i18n.test.mjs tests/transfer-target-pagination.test.mjs
git commit -m "feat: Von Immobilie zu Transaktionen springen"
```

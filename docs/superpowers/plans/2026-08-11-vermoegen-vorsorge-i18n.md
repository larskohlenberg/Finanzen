# Vorsorge Class Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Vermögensansicht zeigt Vorsorgepositionen lokalisiert und bietet sie im Klassenfilter an.

**Architecture:** Die vorhandene i18n-Struktur bleibt die einzige Quelle für Klassenlabels. Der bestehende Renderer verwendet den ergänzten Schlüssel sowohl in der Tabelle als auch in der Filteroption; die Fallbacklogik bleibt unverändert.

**Tech Stack:** JavaScript ES modules, serverseitiger Node-Test-Runner (`node:test`), HTML-String-Renderer.

## Global Constraints

- Deutsch zeigt „Vorsorge“, Englisch zeigt „Pension“.
- Der Rohschlüssel `vermoegen.klasse.vorsorge` darf nicht in der gerenderten Oberfläche erscheinen.
- Berechnung, Datenmodell und allgemeine i18n-Fallbacklogik bleiben unverändert.

---

### Task 1: Vorsorgeklasse lokalisieren und filterbar machen

**Files:**
- Create: `tests/vermoegen-vorsorge-i18n.test.mjs`
- Modify: `app/i18n.js:257-262,739-744`
- Modify: `app/views/vermoegen.mjs:197-203`

**Interfaces:**
- Consumes: `renderVermoegen(): string`, `state.lang`, `data.vorsorge`, `data.zeitwerte` und die vorhandenen i18n-Schlüssel unter `vermoegen.klasse`.
- Produces: `vermoegen.klasse.vorsorge` für `de` und `en` sowie die Filteroption `value="vorsorge"`.

- [ ] **Step 1: Failing Render-Regressionstest schreiben**

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
  const cleanPath = String(path).replace(/^\.\//, "").replace(/\?.*$/, "");
  const body = readFileSync(new URL(`../app/${cleanPath}`, import.meta.url), "utf8");
  return {
    ok: true,
    json: async () => JSON.parse(body),
    text: async () => body,
  };
};
await import("../app/i18n.js");

const { data, state } = await import("../app/runtime.mjs");
const { renderVermoegen } = await import("../app/views/vermoegen.mjs");

test("Vorsorgeklasse erscheint in Tabelle und Filter lokalisiert", () => {
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
      immobilien: [],
      vermoegenswerte: [],
      darlehen: [],
      vorsorge: [{
        vorsorge_id: "VS-I18N",
        name: "Testvorsorge",
        status: "aktiv",
        kapitalbildend: true,
      }],
      zeitwerte: [{
        entitaet: "vorsorge",
        entitaet_id: "VS-I18N",
        feld: "rueckkaufswert",
        wert: "1000.00",
        standdatum: "2026-08-11",
        qualitaet: "belegt",
      }],
    });
    state.vermoegenFilters = { klasse: "", qualitaet: "" };
    state.selectedVermoegenId = "";
    state.vermoegenDetailRailClosed = false;
    state.vermoegenRailMode = "position";

    for (const [lang, label] of [["de", "Vorsorge"], ["en", "Pension"]]) {
      state.lang = lang;
      const html = renderVermoegen();
      assert.match(html, new RegExp(`<td>${label}</td>`));
      assert.match(html, new RegExp(`<option value="vorsorge" >${label}</option>`));
      assert.doesNotMatch(html, /vermoegen\.klasse\.vorsorge/);
    }
  } finally {
    Object.assign(data, originalData);
    Object.assign(state, originalState);
  }
});
```

- [ ] **Step 2: Test ausführen und erwartetes Rot bestätigen**

Run: `node --test tests/vermoegen-vorsorge-i18n.test.mjs`

Expected: FAIL bei der deutschen Tabellenassertion, weil aktuell `vermoegen.klasse.vorsorge` statt „Vorsorge“ gerendert wird.

- [ ] **Step 3: Minimale Wörterbuch- und Filterergänzung implementieren**

In `app/i18n.js` im deutschen Klassenobjekt ergänzen:

```js
vorsorge: "Vorsorge",
```

Im englischen Klassenobjekt ergänzen:

```js
vorsorge: "Pension",
```

In `renderVermoegenFilters` direkt vor `darlehen` ergänzen:

```js
["vorsorge", t("vermoegen.klasse.vorsorge")],
```

- [ ] **Step 4: Gezielten Test grün ausführen**

Run: `node --test tests/vermoegen-vorsorge-i18n.test.mjs`

Expected: PASS mit einem bestandenen Test.

- [ ] **Step 5: Vollständige Verifikation ausführen**

Run: `npm test`

Expected: Alle Tests bestehen ohne Fehler.

Run: `git diff --check`

Expected: Keine Ausgabe und Exit-Code 0.

- [ ] **Step 6: Implementierung committen**

```bash
git add tests/vermoegen-vorsorge-i18n.test.mjs app/i18n.js app/views/vermoegen.mjs docs/superpowers/plans/2026-08-11-vermoegen-vorsorge-i18n.md
git commit -m "fix(vermoegen): Vorsorgeklasse lokalisieren"
```

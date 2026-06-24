# Fehlergrenze (Error Boundary) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render- und Aktionsfehler werden abgefangen und auf der Oberfläche sichtbar gemacht, statt die App still abbrechen zu lassen.

**Architecture:** Ein neues, reines Modul `app/error.mjs` kapselt die Fehlerbehandlung (`renderErrorPanel`, `safeRender`, `guard`). `app/main.js` umhüllt damit den View-Render (Render-Grenze) und die Event-Listener (Aktions-Grenze); Aktionsfehler werden über ein transientes `state.uiError` als schließbares Banner angezeigt.

**Tech Stack:** Vanilla ES-Module, `node:test` (Test-Runner), bestehende `t()`/`escapeHtml()`-Helfer aus `app/runtime.mjs`.

## Global Constraints

- Keine neuen Abhängigkeiten; reine ES-Module wie der Rest von `app/`.
- Keine Enterprise-Muster: kein Error-Tracking-Dienst, keine Retry-Automatik, keine Fehler-Persistenz.
- Domänen-Module bleiben deutsch benannt; Infrastruktur (`error.mjs`) englisch wie `main.js` (`renderErrorPanel`, `safeRender`, `guard`, `state.uiError`).
- Test-Kommando des Projekts: `npm test` (= `node --test tests/*.test.mjs`). Einzeldatei: `node --test tests/<name>.test.mjs`.
- i18n: `t()` löst Punkt-Notation auf und gibt bei fehlendem Key den Pfad selbst zurück. Neue Keys in **beiden** Sprachen (`de` und `en`) in `app/i18n.js`.
- `renderErrorPanel` darf nur von `t`/`escapeHtml` abhängen und muss trivial bleiben, damit es nicht selbst werfen kann.

---

### Task 1: Modul `app/error.mjs` mit reinen Fehler-Helfern

**Files:**
- Create: `app/error.mjs`
- Test: `tests/error.test.mjs`

**Interfaces:**
- Consumes: `t`, `escapeHtml` aus `app/runtime.mjs`.
- Produces:
  - `renderErrorPanel(error, kontext)` → `string` (HTML). Liest `error.message` und `error.stack`; akzeptiert sowohl echte `Error`-Objekte als auch `{ message, stack }`-Objekte.
  - `safeRender(fn, kontext)` → `string`. Gibt `fn()` zurück; bei `throw` `console.error(kontext, error)` und Rückgabe von `renderErrorPanel(error, kontext)`.
  - `guard(fn, onError)` → `(...args) => any`. Ruft `fn(...args)`; bei `throw` `console.error(error)` und `onError(error)` (wirft nicht weiter).

- [ ] **Step 1: Failing-Test schreiben**

Create `tests/error.test.mjs`:

```javascript
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

const { renderErrorPanel, safeRender, guard } = await import("../app/error.mjs");

test("renderErrorPanel zeigt Meldung und Stacktrace im aufklappbaren Block", () => {
  const error = new Error("toCents is not defined");
  error.stack = "Error: toCents is not defined\n    at renderRegelzahlungen";
  const html = renderErrorPanel(error, "view:regelzahlungen");
  assert.match(html, /<details>/, "Details-Block muss vorhanden sein");
  assert.match(html, /toCents is not defined/, "Fehlermeldung muss erscheinen");
  assert.match(html, /at renderRegelzahlungen/, "Stacktrace muss erscheinen");
});

test("safeRender reicht das HTML bei Erfolg unveraendert durch", () => {
  const html = safeRender(() => "<p>ok</p>", "view:test");
  assert.equal(html, "<p>ok</p>");
});

test("safeRender liefert das Fehler-Panel statt zu werfen", () => {
  const html = safeRender(() => {
    throw new Error("boom");
  }, "view:test");
  assert.match(html, /<details>/);
  assert.match(html, /boom/);
});

test("guard ruft onError mit dem Fehler auf und wirft nicht weiter", () => {
  let captured = null;
  const wrapped = guard(() => {
    throw new Error("klick kaputt");
  }, (err) => {
    captured = err;
  });
  assert.doesNotThrow(() => wrapped({ type: "click" }));
  assert.equal(captured?.message, "klick kaputt");
});

test("guard reicht Rueckgabewert und Argumente bei Erfolg durch", () => {
  const wrapped = guard((a, b) => a + b, () => {});
  assert.equal(wrapped(2, 3), 5);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node --test tests/error.test.mjs`
Expected: FAIL — `Cannot find module '../app/error.mjs'`.

- [ ] **Step 3: Modul implementieren**

Create `app/error.mjs`:

```javascript
// app/error.mjs
// Zentrale Fehlergrenze: kapselt Render- und Aktionsfehler, damit nie ein
// Bildschirm weiss bleibt und kein Handler einen Fehler still schluckt.
import { t, escapeHtml } from "./runtime.mjs";

// Bewusst trivial und nur von t/escapeHtml abhaengig, damit das Panel selbst
// nicht werfen kann.
export function renderErrorPanel(error, kontext) {
  const message = error?.message ?? String(error ?? "");
  const stack = error?.stack ?? "";
  const details = `${kontext ? `${kontext}\n\n` : ""}${message}\n\n${stack}`;
  return `
    <section class="error-panel" role="alert">
      <strong>${escapeHtml(t("error.viewTitle"))}</strong>
      <details>
        <summary>${escapeHtml(t("error.detailsToggle"))}</summary>
        <pre>${escapeHtml(details)}</pre>
      </details>
    </section>`;
}

// Render-Grenze: gibt das HTML von fn() zurueck, bei Fehler stattdessen das Panel.
export function safeRender(fn, kontext) {
  try {
    return fn();
  } catch (error) {
    console.error(kontext, error);
    return renderErrorPanel(error, kontext);
  }
}

// Aktions-Grenze: umhuellt einen Event-Handler; bei Fehler onError(error) statt
// stillem Abbruch.
export function guard(fn, onError) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (error) {
      console.error(error);
      onError(error);
    }
  };
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg bestätigen**

Run: `node --test tests/error.test.mjs`
Expected: PASS — 5 Tests grün.

- [ ] **Step 5: Commit**

```bash
git add app/error.mjs tests/error.test.mjs
git commit -m "feat: app/error.mjs — Fehlergrenze-Helfer (renderErrorPanel/safeRender/guard)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: i18n-Keys und CSS für das Fehler-Panel

**Files:**
- Modify: `app/i18n.js` (de-Block und en-Block: neuer Top-Level-Key `error`)
- Modify: `app/styles.css` (neue `.error-panel`-Klasse)
- Test: `tests/error-i18n.test.mjs`

**Interfaces:**
- Produces: i18n-Keys `error.viewTitle`, `error.detailsToggle`, `error.dismiss` in `de` und `en`; CSS-Klasse `.error-panel`.

- [ ] **Step 1: Failing-Test schreiben**

Create `tests/error-i18n.test.mjs`:

```javascript
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

const runtime = await import("../app/runtime.mjs");
const { t, state } = runtime;

for (const lang of ["de", "en"]) {
  test(`error-Keys sind in ${lang} aufgeloest (kein Pfad-Fallback)`, () => {
    state.lang = lang;
    for (const key of ["error.viewTitle", "error.detailsToggle", "error.dismiss"]) {
      assert.notEqual(t(key), key, `${key} muss in ${lang} einen Text liefern`);
    }
  });
}
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node --test tests/error-i18n.test.mjs`
Expected: FAIL — `t("error.viewTitle")` gibt den Pfad `"error.viewTitle"` zurück.

- [ ] **Step 3: i18n-Keys ergänzen**

In `app/i18n.js`, im **de**-Block (innerhalb von `de: { ... }`, z. B. direkt nach dem `nav: { ... }`-Objekt) einfügen:

```javascript
    error: {
      viewTitle: "Dieser Bereich konnte nicht geladen werden.",
      detailsToggle: "Technische Details",
      dismiss: "Schließen",
    },
```

Im **en**-Block (innerhalb von `en: { ... }`, analog nach dessen `nav: { ... }`) einfügen:

```javascript
    error: {
      viewTitle: "This section could not be loaded.",
      detailsToggle: "Technical details",
      dismiss: "Dismiss",
    },
```

- [ ] **Step 4: CSS ergänzen**

In `app/styles.css` am Ende anfügen:

```css
/* Fehlergrenze: ersetzt einen kaputten View bzw. zeigt einen Aktionsfehler. */
.error-panel {
  border: 1px solid var(--color-danger, #c0392b);
  border-radius: 8px;
  padding: 1rem;
  margin: 1rem 0;
  background: color-mix(in srgb, var(--color-danger, #c0392b) 8%, transparent);
}
.error-panel strong {
  display: block;
  margin-bottom: 0.5rem;
}
.error-panel pre {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.85em;
  margin: 0.5rem 0 0;
}
.error-banner-dismiss {
  margin-top: 0.5rem;
}
```

- [ ] **Step 5: Test laufen lassen, Erfolg bestätigen**

Run: `node --test tests/error-i18n.test.mjs`
Expected: PASS — beide Sprachen grün.

- [ ] **Step 6: Commit**

```bash
git add app/i18n.js app/styles.css tests/error-i18n.test.mjs
git commit -m "feat: i18n-Keys (de/en) und .error-panel-CSS fuer die Fehlergrenze

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Fehlergrenze in `app/main.js` und `state.uiError` verdrahten

**Files:**
- Modify: `app/runtime.mjs:77-114` (neues Feld `uiError` in `state`)
- Modify: `app/main.js` (Import; `render()`; `commitNavigation()`; Event-Listener `click`/`keydown`/`input`/`change`; neue Helfer `setUiError`/`renderUiErrorBanner`)
- Test: keine neue Unit-Test-Datei (Glue-Code in `main.js` ist im Test-Harness nicht importierbar, da `main.js` beim Import sofort Event-Listener an den DOM bindet). Verifikation über die volle Suite plus Browser-Smoke-Test.

**Interfaces:**
- Consumes: `renderErrorPanel`, `safeRender`, `guard` aus `app/error.mjs` (Task 1); `state.uiError` aus `app/runtime.mjs`.
- Produces: in `main.js` `setUiError(error, kontext)` (setzt `state.uiError` und ruft `render()`) und `renderUiErrorBanner()` (gibt `""` oder das Panel + Schließen-Button zurück).

- [ ] **Step 1: `state.uiError` ergänzen**

In `app/runtime.mjs`, im `state`-Objekt (nach `view: "overview",` in [app/runtime.mjs:78](../../../app/runtime.mjs)) einfügen:

```javascript
  uiError: null,
```

- [ ] **Step 2: Import in `main.js` ergänzen**

Oben in `app/main.js` zu den bestehenden Imports hinzufügen:

```javascript
import { renderErrorPanel, safeRender, guard } from "./error.mjs";
```

- [ ] **Step 3: Render-Grenze + Aktionsfehler-Banner in `render()`**

In `app/main.js` `render()` ([app/main.js:122-131](../../../app/main.js)) den `app.innerHTML`-Block so ändern, dass `renderView` über `safeRender` läuft und das Aktionsfehler-Banner erscheint:

```javascript
  app.innerHTML = `
    ${renderSidebar()}
    <main class="main" id="main-content" tabindex="-1">
      ${renderTopbar()}
      ${renderValidationBanner()}
      ${renderUiErrorBanner()}
      ${renderPromptFallback()}
      ${safeRender(renderView, "view:" + state.view)}
    </main>
    ${renderTabbar()}
  `;
```

- [ ] **Step 4: Helfer `setUiError` und `renderUiErrorBanner` ergänzen**

In `app/main.js` direkt vor `function renderView()` ([app/main.js:303](../../../app/main.js)) einfügen:

```javascript
// Aktions-Grenze: ein in einem Handler geworfener Fehler wird als schliessbares
// Banner sichtbar, statt nur in der Konsole zu landen.
function setUiError(error, kontext = "aktion") {
  state.uiError = {
    message: error?.message ?? String(error ?? ""),
    stack: error?.stack ?? "",
    kontext,
  };
  render();
}

function renderUiErrorBanner() {
  if (!state.uiError) return "";
  return `
    <div class="error-banner">
      ${renderErrorPanel(state.uiError, state.uiError.kontext)}
      <button class="chip neutral linkish error-banner-dismiss" data-error-dismiss>
        ${escapeHtml(t("error.dismiss"))}
      </button>
    </div>`;
}
```

- [ ] **Step 5: `state.uiError` bei Navigation zurücksetzen**

In `app/main.js` `commitNavigation()` ([app/main.js:820](../../../app/main.js)) als erste Zeile der Funktion einfügen:

```javascript
  state.uiError = null;
```

- [ ] **Step 6: Dismiss-Klick im click-Listener behandeln**

In `app/main.js` im `click`-Listener ([app/main.js:315](../../../app/main.js)) als erste Prüfung (vor `transferCell`) einfügen:

```javascript
  const errorDismiss = event.target.closest("[data-error-dismiss]");
  if (errorDismiss) {
    state.uiError = null;
    render();
    return;
  }
```

- [ ] **Step 7: Event-Listener mit `guard` umhüllen**

In `app/main.js` die vier Nutzer-Interaktions-Listener auf `app` umhüllen — jeweils den bestehenden Handler in `guard(<handler>, setUiError)` einwickeln. Beispiel `click` ([app/main.js:315](../../../app/main.js)):

```javascript
app.addEventListener("click", guard((event) => {
  // ... unveraenderter Body ...
}, setUiError));
```

Dasselbe Muster für `keydown` ([app/main.js:413](../../../app/main.js)), `input` ([app/main.js:426](../../../app/main.js)) und `change` ([app/main.js:434](../../../app/main.js)): Arrow-Function-Handler in `guard(..., setUiError)` einwickeln, schließende `)` entsprechend ergänzen.

- [ ] **Step 8: Volle Suite laufen lassen (Regressionssicherheit)**

Run: `npm test`
Expected: PASS — alle Tests grün (inkl. `error.test.mjs`, `error-i18n.test.mjs`, `regelzahlungen-view.test.mjs`).

- [ ] **Step 9: Browser-Smoke-Test (Happy Path)**

App über lokalen HTTP-Server starten (Repo-Wurzel): `python3 -m http.server 8000` und `http://localhost:8000/app/` öffnen (oder die Preview-Tools des Harness).
Prüfen: App lädt normal, durch alle Views navigieren (inkl. Regelzahlungen und Liquidität), keine Konsolenfehler, kein Fehler-Panel sichtbar.

- [ ] **Step 10: Browser-Smoke-Test (Fehlerpfad) via temporärer Edit**

Zur Verifikation der Render-Grenze temporär in `app/views/regelzahlungen.mjs` am Anfang von `renderRegelzahlungen()` `throw new Error("smoke-test boom");` einfügen, App neu laden, View „Regelzahlungen" öffnen.
Prüfen: Sidebar/Topbar bleiben bedienbar; im View-Bereich erscheint das Panel mit kurzer Meldung; „Technische Details" lässt sich aufklappen und zeigt `smoke-test boom` + Stacktrace. Danach den `throw` **wieder entfernen** und `npm test` erneut grün bestätigen.

- [ ] **Step 11: Commit**

```bash
git add app/runtime.mjs app/main.js
git commit -m "feat: Fehlergrenze in main.js verdrahtet (Render- und Aktions-Grenze)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Render-Grenze (kein weißer Bildschirm) → Task 3, Step 3 (`safeRender(renderView, …)`). ✓
- Aktions-Grenze (kein still geschluckter Fehler) → Task 3, Steps 4–7 (`guard` + `setUiError` + Banner). ✓
- Panel mit kurzer Meldung + aufklappbarem Stacktrace → Task 1 (`renderErrorPanel`) + Task 2 (i18n/CSS). ✓
- Sidebar/Topbar bleiben bedienbar → Task 3, Step 3 (separat gerendert, nur `renderView` umhüllt) + Verifikation Step 10. ✓
- `state.uiError` zurücksetzen → Task 3, Step 5 (Navigation) + Step 6 (Dismiss). ✓
- i18n de+en, CSS-Wiederverwendung, reine Helfer → Tasks 1+2. ✓
- Nicht-Ziele (kein Tracking/Retry/Persistenz) → nicht implementiert. ✓

**Placeholder-Scan:** Keine TBD/TODO; alle Code-Schritte enthalten vollständigen Code.

**Typ-Konsistenz:** `renderErrorPanel(error, kontext)`, `safeRender(fn, kontext)`, `guard(fn, onError)`, `setUiError(error, kontext)`, `state.uiError = { message, stack, kontext }` durchgängig identisch über alle Tasks verwendet. `renderErrorPanel` liest nur `.message`/`.stack` und funktioniert daher sowohl mit echten `Error`-Objekten (Render-Grenze) als auch mit dem `state.uiError`-Plain-Object (Banner).

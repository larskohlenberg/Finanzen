# Runde 2 Layout Guideline Umsetzung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the existing Finanzmodell app in line with the Runde 2 UI guideline without adding new product functions or generating new Stitch screens.

**Architecture:** Keep the current no-build vanilla HTML/CSS/JavaScript app. Add small, local UI helpers where they reduce repeated markup, then update `app/main.js`, `app/styles.css`, and `app/i18n.js` in focused passes. Treat Stitch as visual reference only; the implementation changes existing screens.

**Tech Stack:** Vanilla JavaScript ES modules, CSS custom properties, static HTML, Node test runner, local browser QA. Icons use a local Lucide-based SVG helper instead of introducing a bundler.

---

## Scope Boundaries

This plan is layout-only.

Do not add manual CRUD workflows, new data mutations, new forms, new backend behavior, or new Stitch screens. Existing navigation and review actions may remain. New event handlers are allowed only for layout states such as closing/opening detail rails, clearing existing filters, and toggling responsive UI.

## File Structure

- Modify: `app/main.js`
  - App shell rendering, page heads, overview layout, table/filter markup, detail rail markup, icon helper usage, layout-only event handlers.
- Modify: `app/styles.css`
  - Design tokens, responsive shell, cards, tables, filters, detail rails/bottom sheets, icon/button states, mobile density.
- Modify: `app/i18n.js`
  - Remove obsolete subtitle text from rendering path where possible, add labels for icon buttons, filter reset, detail close, release/work-state, and empty/resolved states.
- Create: `app/icons.js`
  - Local helper that renders selected Lucide-style SVG icons with stable size, stroke, aria behavior, and no external network dependency.
- Create: `tests/ui-layout-contract.test.mjs`
  - Static contract tests for layout-only invariants that can be checked without a browser.
- Reference only: `docs/runde2/UI_Guideline_Runde2.md`
  - Source of truth for acceptance criteria; update only if implementation uncovers an ambiguity that the user approves.
- Reference only: `.stitch/REVIEW_FINDINGS.md`
  - Review findings; no need to change during implementation unless a finding is explicitly resolved and the user asks to record it.

## Task 1: Add Static Layout Contract Tests

**Files:**
- Create: `tests/ui-layout-contract.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create failing static tests for the most important layout contracts**

Create `tests/ui-layout-contract.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const main = readFileSync(new URL("../app/main.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/styles.css", import.meta.url), "utf8");
const i18n = readFileSync(new URL("../app/i18n.js", import.meta.url), "utf8");

test("app shell has no visible Runde 2 subtitle in sidebar rendering", () => {
  assert.doesNotMatch(main, /brand-subtitle/);
  assert.doesNotMatch(main, /appSubtitle/);
});

test("body does not force a desktop minimum width", () => {
  assert.doesNotMatch(css, /body\s*{[^}]*min-width:\s*1040px/s);
});

test("table wrappers own horizontal overflow", () => {
  assert.match(css, /\.table-wrap\s*{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /table\s*{[^}]*min-width:/s);
});

test("transaction and vermoegen filters use the shared table filter renderer", () => {
  assert.match(main, /function renderTableFilters\(/);
  assert.match(main, /renderTableFilters\(\s*{[\s\S]*transactionFilters/s);
  assert.match(main, /renderTableFilters\(\s*{[\s\S]*vermoegenFilters/s);
});

test("filter clear controls are inline and never absolutely positioned above fields", () => {
  assert.match(css, /\.filter-clear/);
  assert.doesNotMatch(css, /\.filter-clear\s*{[^}]*position:\s*absolute/s);
});

test("manual CRUD labels are not rendered as primary screen actions", () => {
  assert.doesNotMatch(main, />\s*(Neu|Neues Konto|Konto hinzufügen|Konto hinzufuegen|Bearbeiten)\s*</);
});

test("local lucide icon helper is used instead of glyph-only navigation", () => {
  assert.match(main, /from "\.\/icons\.js"/);
  assert.match(main, /iconSvg\(/);
  assert.doesNotMatch(main, /\["vermoegen",\s*"nav\.vermoegen",\s*"▲"\]/);
});

test("generic leads are omitted for overview and transactions", () => {
  assert.match(main, /renderPageHead\(t\("overview\.title"\),\s*""/);
  assert.match(main, /renderPageHead\(t\("transactions\.title"\),\s*""/);
});

test("detail rails have close controls", () => {
  assert.match(main, /data-action="close-detail-rail"/);
  assert.match(i18n, /closeDetails/);
});
```

- [ ] **Step 2: Run the new test and verify it fails before implementation**

Run:

```bash
npm test -- tests/ui-layout-contract.test.mjs
```

Expected: FAIL because `tests/*.test.mjs` is the current package script and several new contracts are not implemented.

- [ ] **Step 3: Keep the existing test script working for all tests**

Modify `package.json` so the existing command still runs every `.test.mjs` file under `tests`:

```json
{
  "name": "finanzmodell-runde2",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "validate:m1": "node tools/validator.mjs data/master"
  }
}
```

No script change is needed if the file is placed directly in `tests/`.

- [ ] **Step 4: Run the full test suite and record current failure**

Run:

```bash
npm test
```

Expected: existing domain tests pass, new `ui-layout-contract.test.mjs` fails until later tasks implement the layout contracts.

## Task 2: Introduce Local Lucide Icon Helper

**Files:**
- Create: `app/icons.js`
- Modify: `app/main.js`
- Modify: `app/styles.css`
- Modify: `app/i18n.js`

- [ ] **Step 1: Add a local Lucide-based icon renderer**

Create `app/icons.js`:

```js
const icons = {
  overview: [
    '<path d="m3 9 9-7 9 7"/>',
    '<path d="M9 22V12h6v10"/>',
    '<path d="M21 22H3"/>',
  ],
  transactions: [
    '<path d="M8 6h13"/>',
    '<path d="M8 12h13"/>',
    '<path d="M8 18h13"/>',
    '<path d="M3 6h.01"/>',
    '<path d="M3 12h.01"/>',
    '<path d="M3 18h.01"/>',
  ],
  cashflow: [
    '<path d="M12 2v20"/>',
    '<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/>',
  ],
  regelzahlungen: [
    '<path d="M21 12a9 9 0 0 1-9 9 9.8 9.8 0 0 1-6.74-2.74L3 16"/>',
    '<path d="M3 21v-5h5"/>',
    '<path d="M3 12a9 9 0 0 1 15.74-6.26L21 8"/>',
    '<path d="M16 8h5V3"/>',
  ],
  vermoegen: [
    '<path d="m3 17 6-6 4 4 8-8"/>',
    '<path d="M14 7h7v7"/>',
  ],
  masterdata: [
    '<rect width="7" height="7" x="3" y="3" rx="1"/>',
    '<rect width="7" height="7" x="14" y="3" rx="1"/>',
    '<rect width="7" height="7" x="14" y="14" rx="1"/>',
    '<rect width="7" height="7" x="3" y="14" rx="1"/>',
  ],
  checks: [
    '<path d="M20 6 9 17l-5-5"/>',
  ],
  export: [
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    '<path d="M7 10l5 5 5-5"/>',
    '<path d="M12 15V3"/>',
  ],
  close: [
    '<path d="M18 6 6 18"/>',
    '<path d="m6 6 12 12"/>',
  ],
  more: [
    '<circle cx="12" cy="12" r="1"/>',
    '<circle cx="19" cy="12" r="1"/>',
    '<circle cx="5" cy="12" r="1"/>',
  ],
  chevronDown: [
    '<path d="m6 9 6 6 6-6"/>',
  ],
  search: [
    '<circle cx="11" cy="11" r="8"/>',
    '<path d="m21 21-4.3-4.3"/>',
  ],
  clear: [
    '<path d="M18 6 6 18"/>',
    '<path d="m6 6 12 12"/>',
  ],
  success: [
    '<path d="M20 6 9 17l-5-5"/>',
  ],
  review: [
    '<circle cx="12" cy="12" r="10"/>',
    '<path d="M12 8v4"/>',
    '<path d="M12 16h.01"/>',
  ],
  neutral: [
    '<circle cx="12" cy="12" r="10"/>',
    '<path d="M8 12h8"/>',
  ],
  transfer: [
    '<path d="M7 7h11l-4-4"/>',
    '<path d="M17 17H6l4 4"/>',
  ],
  account: [
    '<rect width="20" height="14" x="2" y="5" rx="2"/>',
    '<path d="M2 10h20"/>',
  ],
  depot: [
    '<path d="m3 17 6-6 4 4 8-8"/>',
    '<path d="M14 7h7v7"/>',
  ],
};

export function iconSvg(name, { label = "", decorative = true, className = "" } = {}) {
  const paths = icons[name] || icons.neutral;
  const aria = decorative
    ? 'aria-hidden="true" focusable="false"'
    : `role="img" aria-label="${escapeHtml(label)}"`;
  return `<svg class="icon ${className}" ${aria} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths.join("")}</svg>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
```

- [ ] **Step 2: Import and use the helper in navigation and chips**

At the top of `app/main.js`, add:

```js
import { iconSvg } from "./icons.js";
```

Change `navItems` to:

```js
const navItems = [
  ["overview", "nav.overview", "overview"],
  ["transactions", "nav.transactions", "transactions"],
  ["cashflow", "nav.cashflow", "cashflow"],
  ["regelzahlungen", "nav.regelzahlungen", "regelzahlungen"],
  ["vermoegen", "nav.vermoegen", "vermoegen"],
  ["masterdata", "nav.masterdata", "masterdata"],
  ["checks", "nav.checks", "checks"],
  ["export", "nav.export", "export"],
];
```

In `renderSidebar()`, replace:

```js
<span class="nav-icon">${icon}</span>
```

with:

```js
<span class="nav-icon">${iconSvg(icon)}</span>
```

Update `statusChip(status)`:

```js
function statusChip(status) {
  const className = status === "offen" ? "review" : status === "bestaetigt" ? "success" : "neutral";
  const icon = status === "offen" ? "review" : status === "bestaetigt" ? "success" : "neutral";
  return `<span class="chip ${className}">${iconSvg(icon)}${escapeHtml(t(`status.${status}`))}</span>`;
}
```

- [ ] **Step 3: Add icon styles with stable dimensions**

Add to `app/styles.css` near button/chip styles:

```css
.icon {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  display: inline-block;
}

.nav-icon {
  width: 22px;
  height: 22px;
  display: inline-grid;
  place-items: center;
}

.nav-icon .icon {
  width: 20px;
  height: 20px;
}

.chip .icon {
  width: 14px;
  height: 14px;
  flex-basis: 14px;
}

.icon-button {
  width: 36px;
  height: 36px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
}

.icon-button:hover,
.icon-button:focus-visible {
  color: var(--text);
  border-color: var(--accent);
  outline: none;
}
```

- [ ] **Step 4: Add i18n labels for icon-only controls**

In `app/i18n.js`, under `chrome`, add German strings:

```js
closeDetails: "Details schließen",
openMore: "Weitere Aktionen",
clearFilter: "Filter zurücksetzen",
clearAllFilters: "Alle Filter zurücksetzen",
```

Add English equivalents under `en.chrome`:

```js
closeDetails: "Close details",
openMore: "More actions",
clearFilter: "Clear filter",
clearAllFilters: "Clear all filters",
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test
```

Expected: domain tests pass; layout contract tests related to icons pass, later layout contracts may still fail.

## Task 3: Normalize App Shell, Header, and Responsive Navigation

**Files:**
- Modify: `app/main.js`
- Modify: `app/styles.css`
- Modify: `app/i18n.js`

- [ ] **Step 1: Remove visible sidebar subtitle and add release/work-state block**

In `renderSidebar()`, replace the brand copy:

```js
<div class="brand-copy">
  <div class="brand-title">${escapeHtml(t("appTitle"))}</div>
  <div class="brand-subtitle">${escapeHtml(t("appSubtitle"))}</div>
</div>
```

with:

```js
<div class="brand-copy">
  <div class="brand-title">${escapeHtml(t("appTitle"))}</div>
</div>
```

After `</nav>`, before `</aside>`, add:

```js
<div class="sidebar-meta">
  <span>${escapeHtml(t("chrome.workState"))}</span>
  <strong>${escapeHtml(t("chrome.releaseState"))}</strong>
</div>
```

In `app/i18n.js`, under `chrome`, add:

```js
workState: "Arbeitsstand",
releaseState: "M5 · lokal",
```

Under `en.chrome`, add:

```js
workState: "Work state",
releaseState: "M5 · local",
```

- [ ] **Step 2: Make the sidebar a full-height desktop rail and compact mobile shell**

Update `app/styles.css`:

```css
body {
  margin: 0;
  min-width: 0;
  background: var(--bg);
  color: var(--text);
}

.sidebar {
  min-height: 100vh;
  padding: 24px 18px;
  border-right: 1px solid var(--border);
  background: var(--surface);
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 18px;
}

.sidebar-meta {
  display: grid;
  gap: 3px;
  padding: 14px 10px 0;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 12px;
}

.sidebar-meta strong {
  color: var(--text);
  font-size: 13px;
}

.sidebar-collapsed .sidebar-meta {
  justify-items: center;
}

.sidebar-collapsed .sidebar-meta span {
  display: none;
}
```

Replace the current `@media (max-width: 1180px)` sidebar behavior with:

```css
@media (max-width: 1180px) {
  .app-shell,
  .app-shell.sidebar-collapsed {
    grid-template-columns: 1fr;
  }

  .sidebar {
    min-height: auto;
    position: sticky;
    top: 0;
    z-index: 3;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0;
    border: 0;
  }

  .brand-mark,
  .sidebar-collapsed .brand-mark {
    margin-bottom: 0;
  }

  .sidebar-toggle,
  .sidebar-meta {
    display: none;
  }

  .nav {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
    padding-top: 0;
    overflow-x: auto;
  }

  .nav-button {
    width: auto;
    min-width: 44px;
    min-height: 44px;
    justify-content: center;
    white-space: nowrap;
  }

  .layout-with-rail {
    grid-template-columns: 1fr;
  }

  .detail-panel {
    position: static;
  }
}
```

- [ ] **Step 3: Align topbar status and controls**

Update `.topbar`, `.work-status`, and `.controls`:

```css
.topbar {
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 8px 0 18px;
}

.work-status,
.controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.controls {
  justify-content: flex-end;
}
```

In `@media (max-width: 760px)`, use:

```css
.main {
  padding: 12px 12px 76px;
}

.topbar {
  min-height: auto;
  align-items: stretch;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 14px;
}

.controls,
.work-status {
  width: 100%;
}

.controls {
  justify-content: stretch;
}

.control-select {
  flex: 1;
  min-width: 0;
}
```

- [ ] **Step 4: Run static and browser checks**

Run:

```bash
npm test
```

Expected: static contracts for no `brand-subtitle` and no desktop body min-width pass.

Then open the app in the browser at the local URL used for this project and verify:

- Desktop 1280px: sidebar has no subtitle; release/work-state appears at sidebar bottom.
- 760px: app has no horizontal page overflow.
- 390px and 360px: topbar controls wrap without covering page title or table content.

## Task 4: Establish Shared Card, Table, Filter, and Detail CSS

**Files:**
- Modify: `app/styles.css`

- [ ] **Step 1: Tighten card/panel geometry and remove heavy decorative shadow**

Update root variables:

```css
:root {
  --radius: 6px;
  --radius-tight: 4px;
  --shadow: none;
}

:root[data-theme="dark"] {
  --shadow: none;
}
```

Update repeated card radii:

```css
.panel,
.mini-kpi,
.summary-cell,
.tile,
.rail-item,
.table-wrap,
.filter-bar,
.filter-field,
.filter-field select,
.pager-button,
.control-select {
  border-radius: var(--radius);
}
```

- [ ] **Step 2: Make tables consistently hoverable and horizontally scrollable**

Update table styles:

```css
.table-wrap {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
  font-size: 14px;
}

tbody tr.clickable,
tbody tr.transaction-row {
  cursor: pointer;
}

tbody tr.clickable:hover,
tbody tr.clickable:focus-within,
.transaction-row:hover,
.transaction-row:focus-within {
  background: var(--surface-2);
}

.transaction-row:hover .row-select-cell {
  background: transparent;
}
```

- [ ] **Step 3: Define the shared table filter component**

Replace `.filter-bar`, `.filter-field`, and select CSS with:

```css
.filter-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--surface-2) 68%, var(--surface));
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  min-width: 0;
}

.filter-actions {
  min-height: 58px;
  display: flex;
  align-items: end;
  justify-content: flex-end;
  gap: 8px;
}

.filter-field {
  min-width: 0;
  display: grid;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.filter-field.active {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: var(--accent-soft);
}

.filter-field label {
  color: var(--muted);
  font-size: 12px;
  font-weight: 750;
}

.filter-control-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
}

.filter-field select {
  min-width: 0;
  width: 100%;
  height: 40px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  padding: 0 34px 0 10px;
  font-weight: 700;
  text-overflow: ellipsis;
}

.filter-clear {
  width: 34px;
  height: 34px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
}

.filter-clear:hover,
.filter-clear:focus-visible {
  border-color: var(--accent);
  color: var(--text);
  outline: none;
}

.filter-reset {
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  font-weight: 700;
}

.filter-reset:hover,
.filter-reset:focus-visible {
  border-color: var(--accent);
  outline: none;
}
```

In `@media (max-width: 760px)`, add:

```css
.filter-bar {
  grid-template-columns: 1fr;
}

.filter-grid {
  grid-template-columns: 1fr;
}

.filter-actions {
  min-height: auto;
  justify-content: stretch;
}

.filter-reset {
  width: 100%;
}
```

- [ ] **Step 4: Define closeable desktop rails and mobile detail sections**

Add:

```css
.detail-panel {
  position: sticky;
  top: 18px;
}

.detail-panel.hidden {
  display: none;
}

.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.detail-head .section-title {
  margin-bottom: 0;
}

@media (max-width: 1180px) {
  .detail-panel {
    position: static;
  }
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test
```

Expected: table overflow and filter clear static contracts pass after Task 5 wires the shared renderer.

## Task 5: Build Shared Filter Rendering and Layout-Only Filter Clear

**Files:**
- Modify: `app/main.js`

- [ ] **Step 1: Add shared filter helpers**

Add near `renderTransactionFilters()`:

```js
function hasActiveFilters(filters) {
  return Object.values(filters).some((value) => value !== "");
}

function renderTableFilters({ fields, filters, filterAttr, clearAction, resetAction }) {
  return `
    <section class="filter-bar">
      <div class="filter-grid">
        ${fields.map((field) => renderFilterSelect({ ...field, filters, filterAttr, clearAction })).join("")}
      </div>
      <div class="filter-actions">
        ${hasActiveFilters(filters) ? `<button class="filter-reset" data-action="${escapeHtml(resetAction)}">${escapeHtml(t("chrome.clearAllFilters"))}</button>` : ""}
      </div>
    </section>
  `;
}

function renderFilterSelect({ name, label, options, filters, filterAttr, clearAction }) {
  const active = filters[name] !== "";
  return `
    <div class="filter-field ${active ? "active" : ""}">
      <label for="${escapeHtml(filterAttr)}-${escapeHtml(name)}">${escapeHtml(label)}</label>
      <div class="filter-control-row">
        <select id="${escapeHtml(filterAttr)}-${escapeHtml(name)}" ${filterAttr}="${escapeHtml(name)}">
          ${options.map(([value, text]) => `<option value="${escapeHtml(value)}" ${filters[name] === value ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}
        </select>
        ${active ? `<button class="filter-clear" data-action="${escapeHtml(clearAction)}" data-filter-name="${escapeHtml(name)}" aria-label="${escapeHtml(t("chrome.clearFilter"))}" title="${escapeHtml(t("chrome.clearFilter"))}">${iconSvg("clear")}</button>` : ""}
      </div>
    </div>
  `;
}
```

- [ ] **Step 2: Convert transaction filters to the shared renderer**

Replace `renderTransactionFilters()` with:

```js
function renderTransactionFilters() {
  return renderTableFilters({
    filters: state.transactionFilters,
    filterAttr: "data-filter",
    clearAction: "clear-transaction-filter",
    resetAction: "reset-transaction-filters",
    fields: [
      {
        name: "account",
        label: t("transactions.filterAccount"),
        options: [["", t("transactions.allAccounts")], ...data.konten.map((konto) => [konto.konto_id, konto.name])],
      },
      {
        name: "status",
        label: t("transactions.filterStatus"),
        options: [["", t("transactions.allStatuses")], ["offen", t("status.offen")], ["vorgeschlagen", t("status.vorgeschlagen")], ["bestaetigt", t("status.bestaetigt")], ["abgelehnt", t("status.abgelehnt")]],
      },
      {
        name: "category",
        label: t("transactions.filterCategory"),
        options: [["", t("transactions.allCategories")], ...data.kategorien.map((kategorie) => [kategorie.kategorie_id, kategorie.name])],
      },
      {
        name: "transfer",
        label: t("transactions.filterTransfer"),
        options: [["", t("transactions.allTransfers")], ["only", t("transactions.onlyTransfers")], ["without", t("transactions.withoutTransfers")]],
      },
    ],
  });
}
```

Remove the old `renderSelect()` function.

- [ ] **Step 3: Convert vermoegen filters to the shared renderer**

Replace `renderVermoegenFilters()` with:

```js
function renderVermoegenFilters() {
  return renderTableFilters({
    filters: state.vermoegenFilters,
    filterAttr: "data-vermoegen-filter",
    clearAction: "clear-vermoegen-filter",
    resetAction: "reset-vermoegen-filters",
    fields: [
      {
        name: "klasse",
        label: t("vermoegen.filterKlasse"),
        options: [["", t("vermoegen.filterAll")], ["konto", t("vermoegen.klasse.konto")], ["immobilie", t("vermoegen.klasse.immobilie")], ["vermoegenswert", t("vermoegen.klasse.vermoegenswert")], ["darlehen", t("vermoegen.klasse.darlehen")]],
      },
      {
        name: "qualitaet",
        label: t("vermoegen.filterQualitaet"),
        options: [["", t("vermoegen.filterAll")], ["belegt", t("vermoegen.qualityBelegt")], ["geschaetzt", t("vermoegen.qualityGeschaetzt")], ["fehlend", t("vermoegen.qualityFehlend")]],
      },
    ],
  });
}
```

Remove the old `renderVermoegenSelect()` function.

- [ ] **Step 4: Add layout-only clear/reset actions**

In `handleAction(event)`, before navigation actions, add:

```js
if (action === "clear-transaction-filter") {
  state.transactionFilters[element.dataset.filterName] = "";
  state.transactionPage = 1;
  commitNavigation();
  return;
}

if (action === "reset-transaction-filters") {
  state.transactionFilters = { account: "", status: "", category: "", transfer: "" };
  state.transactionPage = 1;
  commitNavigation();
  return;
}

if (action === "clear-vermoegen-filter") {
  state.vermoegenFilters[element.dataset.filterName] = "";
  commitNavigation();
  return;
}

if (action === "reset-vermoegen-filters") {
  state.vermoegenFilters = { klasse: "", qualitaet: "" };
  commitNavigation();
  return;
}
```

- [ ] **Step 5: Run tests and browser-check active filters**

Run:

```bash
npm test
```

Expected: shared filter renderer and inline clear contracts pass.

Browser QA:

- Open Transaktionen.
- Select a long account filter.
- Verify the clear icon appears inside the filter row and does not move the field down.
- Reset all filters.
- Repeat on Vermögen.
- Repeat at 390px and confirm no page-level horizontal overflow.

## Task 6: Update Overview Layout

**Files:**
- Modify: `app/main.js`
- Modify: `app/styles.css`
- Modify: `app/i18n.js`

- [ ] **Step 1: Remove generic overview lead and replace Roadmap with Nettovermögen KPI**

Add helper:

```js
function currentNettovermoegen() {
  return computeNettovermoegen(data, localTodayIso());
}
```

In `renderOverview()`, replace:

```js
${renderPageHead(t("overview.title"), t("overview.lead"))}
```

with:

```js
${renderPageHead(t("overview.title"), "")}
```

Replace the first `hero-kpi` section and Roadmap section with:

```js
<div class="overview-kpis">
  <section class="panel hero-kpi">
    <div>
      <div class="kpi-label">${escapeHtml(t("overview.totalBalance"))}</div>
      <div class="kpi-value">${escapeHtml(formatMoney(loadedTotalAccountsBalance()))}</div>
      <div class="kpi-note">${escapeHtml(t("overview.balanceNote"))}</div>
    </div>
  </section>
  <section class="panel hero-kpi">
    <div>
      <div class="kpi-label">${escapeHtml(t("vermoegen.netto"))}</div>
      <div class="kpi-value">${escapeHtml(formatMoney(currentNettovermoegen().netto_cents))}</div>
      <div class="kpi-note">${escapeHtml(t("overview.netWorthNote"))}</div>
    </div>
  </section>
</div>
```

Remove the entire Roadmap panel from the overview.

In `app/i18n.js`, add:

```js
netWorthNote: "Aktueller Vermögensstand aus M5",
```

and English:

```js
netWorthNote: "Current M5 net worth",
```

- [ ] **Step 2: Add Stand column and sort account/depot table by activity type and freshness**

Add helper functions near `accountBalance()`:

```js
function latestAccountDate(kontoId) {
  return data.transaktionen
    .filter((tx) => tx.konto_id === kontoId)
    .map((tx) => tx.buchungsdatum)
    .sort()
    .at(-1) || "";
}

function overviewAccountRank(konto) {
  if (konto.kontotyp === "giro") return 0;
  if (konto.kontotyp === "tagesgeld") return 1;
  if (konto.kontotyp === "depot") return 2;
  return 3;
}

function sortedOverviewAccounts() {
  return data.konten.slice().sort((a, b) => {
    const rank = overviewAccountRank(a) - overviewAccountRank(b);
    if (rank !== 0) return rank;
    const date = latestAccountDate(b.konto_id).localeCompare(latestAccountDate(a.konto_id));
    if (date !== 0) return date;
    return a.name.localeCompare(b.name);
  });
}
```

Replace `renderAccountTable()` with:

```js
function renderAccountTable() {
  const accounts = sortedOverviewAccounts();
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(t("labels.account"))}</th>
            <th>${escapeHtml(t("labels.owner"))}</th>
            <th>${escapeHtml(t("labels.type"))}</th>
            <th>${escapeHtml(t("labels.stand"))}</th>
            <th class="amount">${escapeHtml(t("labels.loadedBalance"))}</th>
            <th>${escapeHtml(t("labels.status"))}</th>
          </tr>
        </thead>
        <tbody>
          ${renderAccountRows(accounts)}
        </tbody>
      </table>
    </div>
  `;
}
```

Replace `renderAccountGroup()` with:

```js
function renderAccountRows(accounts) {
  return accounts.map((konto) => {
    const isDepot = konto.kontotyp === "depot";
    const balanceCell = isDepot ? `<span class="muted">—</span>` : escapeHtml(formatMoney(accountBalance(konto.konto_id)));
    const stand = latestAccountDate(konto.konto_id);
    const status = isDepot ? t("labels.depotValueMissing") : konto.kontoreferenz ? t("labels.accountStatusMissing") : t("labels.referenceMissing");
    const chipClass = isDepot ? "neutral" : konto.kontoreferenz ? "neutral" : "review";
    const chipIcon = isDepot || konto.kontoreferenz ? "neutral" : "review";
    return `
      <tr class="clickable" data-action="account-transactions" data-account="${escapeHtml(konto.konto_id)}">
        <td><button class="linkish" data-action="account-transactions" data-account="${escapeHtml(konto.konto_id)}">${escapeHtml(konto.name)}</button></td>
        <td>${escapeHtml(accountOwnerNames(konto))}</td>
        <td>${escapeHtml(accountTypeLabel(konto.kontotyp))}</td>
        <td>${stand ? escapeHtml(formatDate(stand)) : `<span class="muted">${escapeHtml(t("labels.noStand"))}</span>`}</td>
        <td class="amount">${balanceCell}</td>
        <td><span class="chip ${chipClass}">${iconSvg(chipIcon)} ${escapeHtml(status)}</span></td>
      </tr>
    `;
  }).join("");
}
```

In `app/i18n.js`, under `labels`, add:

```js
stand: "Stand",
noStand: "ohne Stand",
```

and English:

```js
stand: "As of",
noStand: "no date",
```

- [ ] **Step 3: Place rail content correctly on desktop and mobile**

Update overview rail markup:

```js
<aside class="rail overview-rail">
  <section class="panel panel-pad next-action">
    <h2 class="section-title">${escapeHtml(t("chrome.nextAction"))}</h2>
    <button class="linkish" data-action="filter-open-category">${escapeHtml(t("overview.nextActionText"))}</button>
    <p class="page-lead">${escapeHtml(t("checks.categoryOpen.detail"))}</p>
  </section>
  <section class="panel panel-pad checks-rail">
    <h2 class="section-title">${escapeHtml(t("overview.checksPreview"))}</h2>
    <div class="rail-list">${renderCheckItems(data.checks.slice(0, 4))}</div>
  </section>
</aside>
```

Add CSS:

```css
.overview-kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.overview-rail {
  grid-template-rows: auto 1fr;
}

.overview-rail .next-action {
  min-height: 100%;
}

@media (max-width: 760px) {
  .overview-kpis {
    grid-template-columns: 1fr;
  }

  .layout-with-rail {
    display: block;
  }

  .layout-with-rail > .stack,
  .layout-with-rail > .rail {
    display: grid;
    gap: 16px;
  }

  .layout-with-rail > .rail {
    margin-top: 16px;
  }
}
```

Mobile acceptance: the main account/depot table must appear before the secondary rail content. This is naturally satisfied because `.stack` renders before `.rail`.

- [ ] **Step 4: Run tests and browser QA**

Run:

```bash
npm test
```

Expected: generic overview lead contract passes.

Browser QA:

- Overview desktop: two KPI cards appear side by side; no Roadmap panel.
- Overview desktop: right rail is separate; Checks starts visually below next-action area.
- Overview mobile: KPI cards, Konten und Depots, then secondary rail content.
- Account table has hover and horizontal scroll at 360px.

## Task 7: Update Transactions Layout and Closeable Detail Rail

**Files:**
- Modify: `app/main.js`
- Modify: `app/styles.css`

- [ ] **Step 1: Remove generic transactions lead**

In `renderTransactions()`, replace:

```js
${renderPageHead(t("transactions.title"), t("transactions.lead"), breadcrumb)}
```

with:

```js
${renderPageHead(t("transactions.title"), "", breadcrumb)}
```

- [ ] **Step 2: Add detail rail open/closed state**

In `state`, add:

```js
detailRailClosed: false,
```

In `renderTransactions()`, replace the detail aside with:

```js
${state.detailRailClosed ? "" : `
  <aside class="panel panel-pad detail-panel">
    <div class="detail-head">
      <h2 class="section-title">${escapeHtml(t("transactions.details"))}</h2>
      <button class="icon-button" data-action="close-detail-rail" aria-label="${escapeHtml(t("chrome.closeDetails"))}" title="${escapeHtml(t("chrome.closeDetails"))}">${iconSvg("close")}</button>
    </div>
    ${selectedInFilter ? renderTransactionDetail(selectedInFilter) : `<p>${escapeHtml(t("transactions.noSelection"))}</p>`}
  </aside>
`}
```

In `handleAction(event)`, add:

```js
if (action === "close-detail-rail") {
  state.detailRailClosed = true;
  commitNavigation();
  return;
}
```

In the `select-transaction` branch, before `commitNavigation();`, add:

```js
state.detailRailClosed = false;
```

- [ ] **Step 3: Use full row hover without changing behavior**

In `renderTransactionRow(tx)`, keep existing `data-action` cells, but add `tabindex="0"` to selectable cells:

```js
<td class="row-select-cell" tabindex="0" ${selectAttrs}>${escapeHtml(formatDate(tx.buchungsdatum))}</td>
```

Repeat `tabindex="0"` for the other `.row-select-cell` cells so keyboard focus has the same visual state.

- [ ] **Step 4: Run tests and browser QA**

Run:

```bash
npm test
```

Expected: transaction lead and close rail contracts pass.

Browser QA:

- Transactions desktop: filters stay aligned with active account filter.
- Detail rail close icon hides the rail and gives table more room.
- Selecting a transaction reopens details.
- Mobile: details appear after main table area, not before it.

## Task 8: Apply Shared Layout Rules to Vermögen, Stammdaten, Checks, Cashflow, Regelzahlungen, Export

**Files:**
- Modify: `app/main.js`
- Modify: `app/styles.css`

- [ ] **Step 1: Make Vermögen detail rail closeable with same pattern**

In `state`, add:

```js
vermoegenDetailRailClosed: false,
```

In `renderVermoegen()`, replace detail aside with:

```js
${state.vermoegenDetailRailClosed ? "" : `
  <aside class="panel panel-pad detail-panel">
    <div class="detail-head">
      <h2 class="section-title">${escapeHtml(t("vermoegen.detailTitle"))}</h2>
      <button class="icon-button" data-action="close-vermoegen-detail-rail" aria-label="${escapeHtml(t("chrome.closeDetails"))}" title="${escapeHtml(t("chrome.closeDetails"))}">${iconSvg("close")}</button>
    </div>
    ${selected ? renderVermoegenDetail(selected, today) : `<p>${escapeHtml(t("vermoegen.noSelection"))}</p>`}
  </aside>
`}
```

In `handleAction(event)`, add:

```js
if (action === "close-vermoegen-detail-rail") {
  state.vermoegenDetailRailClosed = true;
  commitNavigation();
  return;
}
```

In the `select-vermoegen` branch, add before `commitNavigation();`:

```js
state.vermoegenDetailRailClosed = false;
```

- [ ] **Step 2: Remove CRUD-looking buttons and keep only review/navigation actions**

Search:

```bash
rg -n "Neu|Neues|Bearbeiten|Konto hinzufügen|Konto hinzufuegen" app
```

Expected: no rendered UI button text for manual CRUD actions. If any appear, remove the button from `app/main.js` and leave the surrounding review content intact.

- [ ] **Step 3: Reduce mobile density for tiles and export placeholder**

Update CSS:

```css
@media (max-width: 760px) {
  .tile {
    padding: 14px;
  }

  .tile strong {
    font-size: 15px;
  }

  .tile .count {
    margin: 10px 0 6px;
    font-size: 24px;
  }

  .empty-state {
    min-height: 180px;
    padding: 20px;
  }
}
```

- [ ] **Step 4: Remove inline style layout where possible**

Replace inline `style="margin-top: 16px;"` panels in `renderCashflow()`, `renderRegelzahlungen()`, and similar sections with class `section-spacing`:

```js
<section class="panel panel-pad section-spacing">
```

Add CSS:

```css
.section-spacing {
  margin-top: 16px;
}
```

Replace inline page lead margin in Cashflow:

```js
<p class="page-lead section-note">${escapeHtml(t("cashflow.incompleteNote"))}</p>
```

Add CSS:

```css
.section-note {
  margin-top: 12px;
}
```

- [ ] **Step 5: Run tests and browser QA**

Run:

```bash
npm test
```

Expected: all static layout contracts pass.

Browser QA:

- Vermögen desktop/mobile: detail area follows same close behavior as Transactions.
- Stammdaten mobile: tiles are compact and do not dominate the screen.
- Checks mobile: status cards are compact; if all checks are green in a future data set, use a resolved state rather than an empty-looking list.
- Export mobile: placeholder is quiet, not hero-sized.
- Regelzahlungen/Cashflow: tables retain horizontal scroll wrappers.

## Task 9: Final Responsive Browser Verification

**Files:**
- No source changes unless verification finds a defect.

- [ ] **Step 1: Start the local app**

If the app is served by an existing local server, use that URL. Otherwise start a simple local server from the repository root:

```bash
python3 -m http.server 61393
```

Open:

```text
http://localhost:61393/app/
```

- [ ] **Step 2: Verify desktop screens**

At 1280px width, verify:

- Übersicht
- Transaktionen
- Cashflow
- Regelzahlungen
- Vermögen
- Stammdaten
- Checks
- Export

Acceptance:

- No sidebar subtitle.
- Topbar status aligns with language/theme controls.
- Cards and panels use the same angular geometry.
- No manual CRUD buttons.
- Tables have hover/focus states.
- Tables scroll inside `.table-wrap`, not at page level.
- Filters use the shared pattern.
- Detail rails are closeable where present.

- [ ] **Step 3: Verify tablet/narrow screens**

At 768px and 1024px, verify:

- No page-level horizontal overflow.
- Rails move below main content.
- Filter fields remain contained.
- Header controls do not overlap titles or tables.

- [ ] **Step 4: Verify mobile screens**

At 390px and 360px, verify:

- Übersicht order: KPI cards, Konten und Depots, then secondary rail content.
- Transaktionen filters stack cleanly; active filter clear buttons do not move fields.
- Transaktionen table scrolls horizontally in its wrapper.
- Details are below main content or hidden when closed.
- Bottom/top navigation remains usable with 44px touch targets.
- Export placeholder is compact.

- [ ] **Step 5: Run final tests**

Run:

```bash
npm test
```

Expected: PASS for all tests.

## Self-Review

Spec coverage:

- App shell subtitle/release state: Task 3.
- Responsive layout and no mobile page overflow: Tasks 3, 4, 9.
- Lucide icon language: Task 2.
- Angular card geometry: Task 4.
- Shared filters and no filter layout shift: Tasks 4, 5.
- No manual CRUD buttons: Task 8.
- Overview KPI and mobile order: Task 6.
- Tables hover/horizontal scroll: Task 4 and browser QA in Tasks 6-9.
- Closeable detail rails: Tasks 7 and 8.
- No new Stitch screens and no feature changes: Scope Boundaries and all tasks.

Placeholder scan:

- No unresolved placeholders or open-ended implementation instructions are intentionally left in this plan.

Risk notes:

- `app/main.js` is large; keep changes incremental and run `npm test` after each task.
- The local icon helper uses selected Lucide-style SVG paths to avoid introducing a bundler. If the project later adds a frontend build pipeline, this helper can be replaced by direct `lucide` package imports.
- Browser QA is required because static tests cannot prove hover rendering, actual overflow, or mobile visual order.

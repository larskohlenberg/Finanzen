# Demodaten-Schalter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent "Demodaten" mode that switches the app between live master data and realistic German family demo data.

**Architecture:** Keep data mode selection at the app bootstrap boundary. `data-loader.mjs` loads the same file contract from either `app/data/master` or `app/data/demo`, while `runtime.mjs` persists the selected mode in `localStorage`; `main.js` renders a visible segmented switch and reloads after mode changes.

**Tech Stack:** Browser ES modules, Node test runner, existing validator and JSON/JSONL master data contract.

---

### Task 1: Loader Data Mode

**Files:**
- Modify: `app/data-loader.mjs`
- Modify: `tests/data-loader.test.mjs`

- [ ] **Step 1: Write failing tests**

Add tests that call `loadFinanceData({ dataMode: "demo" })` with a mocked `fetch` and assert paths use `./data/demo/*`, metadata is labelled as demo data, and default loading still uses `./data/master/*`.

- [ ] **Step 2: Run the loader test**

Run: `node --test tests/data-loader.test.mjs`
Expected before implementation: FAIL because `loadFinanceData` ignores `dataMode`.

- [ ] **Step 3: Implement minimal loader support**

Add `dataModes`, `normalizeDataMode`, and a base-path aware file loader in `app/data-loader.mjs`.

- [ ] **Step 4: Re-run the loader test**

Run: `node --test tests/data-loader.test.mjs`
Expected after implementation: PASS.

### Task 2: Persistent UI Switch

**Files:**
- Modify: `app/runtime.mjs`
- Modify: `app/main.js`
- Modify: `app/i18n.js`
- Modify: `app/styles.css`

- [ ] **Step 1: Add state contract**

Persist `state.dataMode` under `finance-m2-data-mode` and load data via `loadFinanceData({ dataMode })`.

- [ ] **Step 2: Add visible controls**

Render a mode chip plus a segmented `Echt | Demo` select in the topbar. On change, store the mode and reload the page so all derived maps and validation are rebuilt from the selected dataset.

- [ ] **Step 3: Add copy and styling**

Add German and English labels to `i18n.js`, and compact topbar styles that match the existing chip/control language.

### Task 3: Demo Dataset

**Files:**
- Create: `app/data/demo/personen.json`
- Create: `app/data/demo/konten.json`
- Create: `app/data/demo/kategorien.json`
- Create: `app/data/demo/transaktionen.jsonl`
- Create: `app/data/demo/transfers.json`
- Create: `app/data/demo/regelzahlungen.json`
- Create: `app/data/demo/szenarien.json`
- Create: `app/data/demo/immobilien.json`
- Create: `app/data/demo/darlehen.json`
- Create: `app/data/demo/vermoegenswerte.json`
- Create: `app/data/demo/zeitwerte.jsonl`
- Create: `app/data/demo/kategorisierungsregeln.json`

- [ ] **Step 1: Add realistic data**

Use a normal German household: two adults, two children, salaries, child benefit, rent, utilities, groceries, daycare/school, transport, insurance, vacations, emergency savings, ETF depot, one financed family car, and ordinary scenarios.

- [ ] **Step 2: Validate the data**

Run: `node app/tools/validator.mjs app/data/demo`
Expected: valid demo data with no schema or cross-field errors.

### Task 4: Final Verification

**Files:**
- All modified files

- [ ] **Step 1: Run focused tests**

Run: `node --test tests/data-loader.test.mjs`
Expected: PASS.

- [ ] **Step 2: Run full tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Validate master and demo data**

Run: `npm run validate:master`
Run: `node app/tools/validator.mjs app/data/demo`
Expected: both PASS.

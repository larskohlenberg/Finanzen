# App Deploybarer Datenraum Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migriere die Finanzmodell-App verlustfrei so, dass `app/` der fuehrende deploybare App-Raum fuer Daten, Belege, Schemas, fachliche Tools und Agenten-Betriebsanweisungen wird.

**Architecture:** Die Migration erfolgt in zwei Phasen. Phase 1 verschiebt Dateien und Pfadreferenzen ohne Runtime-Umbau der Webseite; Phase 2 ersetzt `app/review-data.js` durch direktes Laden einzelner Masterdateien per `fetch()`.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, ES-Module, Node.js `node --test`, JSON, JSONL, lokale Webserver-Auslieferung unter `app/`.

---

## Zielstruktur

Nach Phase 1:

```text
app/
  index.html
  main.js
  styles.css
  data/
    master/
    inbox/
  Belege/
  schemas/
  tools/
  docs/
    skills/

docs/
  adr/
  architektur/
  superpowers/
tests/
package.json
```

`app/review-data.js` bleibt in Phase 1 unveraendert der technische Runtime-Einstieg der aktuellen Webseite. Fuehrende Masterdaten liegen aber bereits unter `app/data/master/`.

Nach Phase 2 laedt die App die Masterdateien direkt aus `app/data/master/`; `app/review-data.js` entfaellt.

## Dateiverantwortung

- `app/data/`: produktive App-Daten, Inbox, Import-Zwischenstaende, Agent-Logs.
- `app/Belege/`: produktive Belege/Rohdokumente mit app-relativen Referenzen.
- `app/schemas/`: Betriebsschemas fuer App, Tools und spaeteres Backend.
- `app/tools/`: fachliche Agenten-/Betriebs-Tools.
- `app/docs/skills/`: Agenten-Betriebsanweisungen.
- `tests/`: automatisierte Entwicklungstests gegen `app/tools/` und `app/data/`.
- `docs/adr/`: Architekturentscheidungen, inklusive ADR 0015.

## Phase 1: Strukturmigration

### Task 1: Vorher-Bestand erfassen

**Files:**
- Read: `data/`
- Read: `schemas/`
- Read: `Belege/`
- Read: `docs/skills/`
- Create: `/tmp/finanzen-app-migration-before.sha256`
- Create: `/tmp/finanzen-app-migration-before-files.txt`
- Create: `/tmp/finanzen-app-migration-before-files.nul`

- [ ] **Step 1: Dateiliste ohne `.DS_Store` erzeugen**

Run:

```bash
find data schemas Belege docs/skills -type f ! -name .DS_Store | sort > /tmp/finanzen-app-migration-before-files.txt
find data schemas Belege docs/skills -type f ! -name .DS_Store -print0 | sort -z > /tmp/finanzen-app-migration-before-files.nul
```

Expected: command exits with code `0`. If one of the roots does not exist, inspect the missing root and decide whether it is already migrated or intentionally absent before continuing.

- [ ] **Step 2: Checksummen erzeugen**

Run:

```bash
xargs -0 shasum -a 256 < /tmp/finanzen-app-migration-before-files.nul > /tmp/finanzen-app-migration-before.sha256
```

Expected: command exits with code `0` and `/tmp/finanzen-app-migration-before.sha256` contains one checksum per file.

### Task 2: App-Zielordner anlegen und Dateien verschieben

**Files:**
- Move: `data/` -> `app/data/`
- Move: `schemas/` -> `app/schemas/`
- Move: `Belege/` -> `app/Belege/`
- Move: `docs/skills/` -> `app/docs/skills/`
- Move: `tools/` -> `app/tools/`

- [ ] **Step 1: Zielordner vorbereiten**

Run:

```bash
mkdir -p app/docs
```

Expected: command exits with code `0`.

- [ ] **Step 2: Produktive Daten verschieben**

Run:

```bash
mv data app/data
mv schemas app/schemas
mv Belege app/Belege
mv docs/skills app/docs/skills
mv tools app/tools
```

Expected: command exits with code `0`. If a target already exists, stop and inspect before merging.

### Task 3: Pfade in Tools und Package-Scripts anpassen

**Files:**
- Modify: `package.json`
- Modify: `app/tools/import.mjs`
- Modify: `app/tools/validator.mjs`
- Modify: all moved files in `app/tools/` that reference `../data/`, `../schemas/`, `data/master`, or `schemas/`

- [ ] **Step 1: Pfadreferenzen finden**

Run:

```bash
rg "data/master|../data|schemas/|../schemas|tools/" package.json app/tools tests app/docs/skills docs -g '!*DS_Store'
```

Expected: command prints remaining old references for review.

- [ ] **Step 2: `package.json` Scripts anpassen**

Change:

```json
"test": "node --test tests/*.test.mjs",
"validate:m1": "node tools/validator.mjs data/master"
```

to:

```json
"test": "node --test tests/*.test.mjs",
"validate:m1": "node app/tools/validator.mjs app/data/master"
```

- [ ] **Step 3: `app/tools/import.mjs` Default-Masterpfad anpassen**

Change:

```js
const masterRoot = new URL("../data/master/", import.meta.url);
```

to:

```js
const masterRoot = new URL("../data/master/", import.meta.url);
```

Note: The string stays visually identical after the move because `import.mjs` now lives in `app/tools/`; `../data/master/` resolves to `app/data/master/`.

- [ ] **Step 4: `app/tools/validator.mjs` Default-Masterpfad pruefen**

Ensure any default like:

```js
new URL("../data/master/", import.meta.url)
```

resolves from `app/tools/validator.mjs` to `app/data/master/`. If the file uses CLI paths, keep CLI support and update documentation/examples to `app/data/master`.

### Task 4: Tests auf neue Toolpfade umstellen

**Files:**
- Modify: `tests/*.test.mjs`

- [ ] **Step 1: Alte Tool-Imports finden**

Run:

```bash
rg "../tools|tools/" tests -g '!*DS_Store'
```

Expected: command prints test imports that need migration.

- [ ] **Step 2: Testimports anpassen**

For each test import like:

```js
import { runImport } from "../tools/import.mjs";
```

change to:

```js
import { runImport } from "../app/tools/import.mjs";
```

Apply the same rule for `validator.mjs`, `categorizer.mjs`, `transfer-matcher.mjs`, `dedupe.mjs`, `ids.mjs`, and `import-format.mjs`.

### Task 5: Agenten-Betriebsanweisungen auf App-Pfade umstellen

**Files:**
- Modify: `app/docs/skills/import-agent.md`
- Modify: `app/docs/skills/stammdaten-erfassung-agent.md`
- Modify: `app/docs/skills/regelzahlung-agent.md`

- [ ] **Step 1: Alte Pfade finden**

Run:

```bash
rg "data/|schemas/|tools/|Belege/|app/review-data.js|docs/skills" app/docs/skills -g '!*DS_Store'
```

Expected: command prints path references for review.

- [ ] **Step 2: Fuehrende Pfade app-relativ machen**

Use these replacements in operating instructions:

```text
data/master/...        remains data/master/... inside app/docs/skills
data/inbox/...         remains data/inbox/... inside app/docs/skills
Belege/...             remains Belege/... inside app/docs/skills
schemas/...            remains schemas/... inside app/docs/skills
tools/...              remains tools/... inside app/docs/skills
```

Do not write `app/data/...` inside app-internal operating instructions unless the text explicitly talks about repository paths from project root.

- [ ] **Step 3: Root-relative references only where needed**

When an instruction is for a developer running from project root, use explicit project-root paths:

```text
node app/tools/validator.mjs app/data/master
```

### Task 6: Dateninterne Pfade app-relativ migrieren

**Files:**
- Modify: `app/data/master/transaktionen.jsonl`
- Modify: `app/data/master/agent_log.jsonl`
- Modify: any `app/data/master/*.json` or `*.jsonl` containing `rohquelle`, `quelle_hinweis`, `inputs`

- [ ] **Step 1: Datenpfade finden**

Run:

```bash
rg '"(rohquelle|quelle_hinweis|inputs)"|data/inbox|data/master|app/Belege|app/data|Belege/' app/data/master -g '!*DS_Store'
```

Expected: command prints references that may need app-relative normalization.

- [ ] **Step 2: App-prefix entfernen**

Change values like:

```json
"rohquelle": "app/Belege/Kontoauszuege/..."
```

to:

```json
"rohquelle": "Belege/Kontoauszuege/..."
```

- [ ] **Step 3: Root-Pfade auf App-Raum normalisieren**

For productive references, use app-relative paths:

```json
"rohquelle": "Belege/Kontoauszuege/TESTREF-061/..."
```

and:

```json
"inputs": ["data/inbox/..."]
```

Do not use absolute local filesystem paths in app data.

### Task 7: Integritaet nach dem Verschieben pruefen

**Files:**
- Create: `/tmp/finanzen-app-migration-after.sha256`
- Create: `/tmp/finanzen-app-migration-after-files.txt`
- Create: `/tmp/finanzen-app-migration-after-files.nul`

- [ ] **Step 1: Neue Dateiliste erzeugen**

Run:

```bash
find app/data app/schemas app/Belege app/docs/skills app/tools -type f ! -name .DS_Store | sort > /tmp/finanzen-app-migration-after-files.txt
find app/data app/schemas app/Belege app/docs/skills app/tools -type f ! -name .DS_Store -print0 | sort -z > /tmp/finanzen-app-migration-after-files.nul
```

Expected: command exits with code `0`.

- [ ] **Step 2: Pfade fuer Checksummenvergleich normalisieren**

Run:

```bash
sed -E 's#^(data|schemas|Belege|docs/skills|tools)#app/&#' /tmp/finanzen-app-migration-before-files.txt | sort > /tmp/finanzen-app-migration-before-files-normalized.txt
diff -u /tmp/finanzen-app-migration-before-files-normalized.txt /tmp/finanzen-app-migration-after-files.txt
```

Expected: no diff, except intentional files created after the before-snapshot. Investigate every difference before continuing.

- [ ] **Step 3: Checksummen nachher erzeugen und vergleichen**

Run:

```bash
xargs -0 shasum -a 256 < /tmp/finanzen-app-migration-after-files.nul | sed 's#app/data#data#; s#app/schemas#schemas#; s#app/Belege#Belege#; s#app/docs/skills#docs/skills#; s#app/tools#tools#' | sort > /tmp/finanzen-app-migration-after-normalized.sha256
sort /tmp/finanzen-app-migration-before.sha256 > /tmp/finanzen-app-migration-before-sorted.sha256
diff -u /tmp/finanzen-app-migration-before-sorted.sha256 /tmp/finanzen-app-migration-after-normalized.sha256
```

Expected: no diff for files that were only moved. Files intentionally edited after moving will differ and must be reviewed separately with `git diff`.

### Task 8: Phase-1-Verifikation

**Files:**
- Read: `package.json`
- Read: `app/data/master/`
- Read: `app/tools/`
- Read: `tests/`

- [ ] **Step 1: Syntax pruefen**

Run:

```bash
node --check app/main.js
node --check app/cashflow.mjs
node --check app/vermoegen.mjs
node --check app/tools/import.mjs
node --check app/tools/validator.mjs
```

Expected: each command exits with code `0`.

- [ ] **Step 2: Automatisierte Tests ausfuehren**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Masterdaten validieren**

Run:

```bash
npm run validate:m1
```

Expected: validator exits with code `0` and reports the master data as valid.

- [ ] **Step 4: Alte fuehrende Ordner pruefen**

Run:

```bash
find data schemas Belege tools docs/skills -type f ! -name .DS_Store
```

Expected: command either reports missing paths or no files. If files remain, inspect them before deciding whether they are project artifacts or migration leftovers.

## Phase 2: Runtime-Migration

### Task 9: Browser-Datenloader einfuehren

**Files:**
- Create: `app/data-loader.mjs`
- Modify: `app/main.js`
- Modify: `app/index.html`
- Test: add focused Node tests if parsing helpers are exported as pure functions

- [ ] **Step 1: Loader-Modul erstellen**

Create `app/data-loader.mjs` with:

```js
export async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

export async function loadJsonl(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const text = await response.text();
  return parseJsonl(text, path);
}

export function parseJsonl(text, path = "JSONL") {
  return text
    .split(/\r?\n/)
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.trim().length > 0)
    .map(({ line, number }) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${path}:${number}: ${error.message}`);
      }
    });
}

export async function loadFinanceData() {
  const [
    personen,
    konten,
    kategorien,
    transaktionen,
    transfers,
    regelzahlungen,
    immobilien,
    darlehen,
    vermoegenswerte,
    zeitwerte,
  ] = await Promise.all([
    loadJson("./data/master/personen.json"),
    loadJson("./data/master/konten.json"),
    loadJson("./data/master/kategorien.json"),
    loadJsonl("./data/master/transaktionen.jsonl"),
    loadJson("./data/master/transfers.json"),
    loadJson("./data/master/regelzahlungen.json"),
    loadJson("./data/master/immobilien.json"),
    loadJson("./data/master/darlehen.json"),
    loadJson("./data/master/vermoegenswerte.json"),
    loadJsonl("./data/master/zeitwerte.jsonl"),
  ]);

  return {
    metadata: {
      bundleVersion: "live-master",
      label: "Live-Masterdaten",
      generatedAt: new Date().toISOString().slice(0, 10),
      validation: "not-run-in-browser",
    },
    personen,
    konten,
    kategorien,
    transaktionen,
    transfers,
    regelzahlungen,
    immobilien,
    darlehen,
    vermoegenswerte,
    zeitwerte,
    checks: [],
    importfehler: [],
  };
}
```

- [ ] **Step 2: `main.js` asynchron bootstrappen**

Refactor the top-level bootstrap from:

```js
const data = window.FINANCE_REVIEW_DATA;
const dictionaries = window.FINANCE_I18N;
```

to an async initialization that imports `loadFinanceData()` and renders only after data is loaded. Keep the existing visible bootstrap error pattern and show the failing filename/message.

- [ ] **Step 3: `index.html` Review-Bundle entfernen**

Remove:

```html
<script src="./review-data.js" defer></script>
```

Keep `i18n.js` until dictionaries are migrated separately.

### Task 10: Runtime-Verifikation

**Files:**
- Read: `app/index.html`
- Read: `app/main.js`
- Read: `app/data-loader.mjs`

- [ ] **Step 1: Syntax pruefen**

Run:

```bash
node --check app/data-loader.mjs
node --check app/main.js
```

Expected: both commands exit with code `0`.

- [ ] **Step 2: Lokalen Webserver aus `app/` starten**

Run:

```bash
python3 -m http.server 8000 --directory app
```

Expected: server starts and serves `http://localhost:8000/`.

- [ ] **Step 3: App im Browser pruefen**

Open:

```text
http://localhost:8000/
```

Expected: App renders from `app/data/master/*`, no white page, no missing `review-data.js` error.

- [ ] **Step 4: Tests und Validator ausfuehren**

Run:

```bash
npm test
npm run validate:m1
```

Expected: all tests pass and master validation succeeds.

### Task 11: `review-data.js` entfernen und Doku nachziehen

**Files:**
- Delete: `app/review-data.js`
- Modify: `app/README.md`
- Modify: docs that still describe `review-data.js` as current behavior

- [ ] **Step 1: Referenzen finden**

Run:

```bash
rg "review-data.js|FINANCE_REVIEW_DATA|Review-Bundle" app docs tests package.json -g '!*DS_Store'
```

Expected: command prints references. Keep historical references in old plans/ADRs if clearly historical; update current operating docs.

- [ ] **Step 2: Current docs aktualisieren**

In `app/README.md`, replace the old local-file/review-bundle wording with:

```md
# App

Die App ist eine geschuetzte Web-App und wird ueber einen Webserver aus dem Verzeichnis `app/` ausgeliefert. Sie laedt ihre fuehrenden Daten zur Laufzeit aus `data/master/`.

Der `file://`-Betrieb und das alte `review-data.js`-Bundle sind nicht mehr der fuehrende Betriebsmodus.
```

- [ ] **Step 3: Finale Verifikation**

Run:

```bash
node --check app/main.js
node --check app/data-loader.mjs
npm test
npm run validate:m1
```

Expected: all commands exit with code `0`.

## Self-Review

- ADR 0015 deckt die harte Architekturentscheidung ab: `app/` ist deploybarer Datenraum.
- Phase 1 ist verlustfrei geplant: Dateiliste und Checksummen vor/nach Migration.
- Phase 1 laesst `review-data.js` funktional in Ruhe.
- Phase 2 ersetzt `review-data.js` durch direktes Laden einzelner Masterdateien.
- Keine dauerhaften Spiegelpfade sind vorgesehen.
- App-interne Datenpfade bleiben app-relativ.

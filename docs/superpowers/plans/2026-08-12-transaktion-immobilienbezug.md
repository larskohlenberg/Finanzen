# Optionaler Immobilienbezug fuer Transaktionen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transaktionen erhalten einen optionalen, sicher pflegbaren Immobilienbezug, der validiert, im Detail verlinkt, nach Immobilien-ID durchsucht und nach jedem Import verpflichtend geprueft wird.

**Architecture:** `Transaktion.immobilie_id` ist eine direkte optionale Viele-zu-eins-Referenz auf `Immobilie`. Ein neues Exact-ID-CLI kapselt alle JSONL-Aenderungen; der Import bleibt fachlich getrennt, uebergibt aber die neu geschriebenen IDs an das Agenten-Review. UI und Suche lesen nur den validierten Bezug.

**Tech Stack:** Node.js ES modules, `node:test`, JSON/JSONL, bestehende browserfaehige Validator- und View-Module.

## Global Constraints

- Alle Produktpfade sind app-relativ; Ausfuehrungsbefehle in diesem Plan starten, sofern nicht anders vermerkt, im Repository-Root.
- `DATENMODUS: live` und `DATENROOT: data/master` gelten fuer produktive Datenlaeufe.
- Phase 1 schreibt keine Live-Transaktion und keinen Live-Logeintrag.
- `immobilie_id` bleibt optional und ist nie an eine Kategorie gebunden.
- Zuordnungen entstehen nur aus eindeutigem Beleg oder Nutzerentscheidung; Suchsignale duerfen keine automatische Zuordnung ausloesen.
- Keine Aenderung an Kategorien, Regeln, Kategorisierungsstatus, Cashflowwirkung, Audit- oder Historienfeldern.
- Keine Hand-Edits an `app/data/master/transaktionen.jsonl` oder `app/data/demo/transaktionen.jsonl`; JSONL-Aenderungen laufen ueber `tools/transaktion-immobilie.mjs`.
- Nach jedem schreibenden Datenlauf folgt der Validator fuer den betroffenen Datenroot; Live-Laeufe werden in `data/master/agent_log.jsonl` protokolliert.
- Tests und Fixtures enthalten keine echten Namen, IBANs, Kontonummern oder Adressen.
- `.DS_Store` bleibt vollstaendig unberuehrt.

---

## File Map

**Create:**

- `app/tools/transaktion-immobilie.mjs` — reine Zuordnungslogik und sicherer CLI-Schreibkanal.
- `tests/transaktion-immobilie-tool.test.mjs` — Unit- und CLI-Verhalten des Schreibkanals.
- `tests/transactions-immobilie-link.test.mjs` — Aufloesung, Detail-Querlink und i18n.
- `tests/fixtures/master-valid/immobilien.json` — synthetisches gueltiges Referenzziel.
- `tests/fixtures/master-invalid/immobilien.json` — synthetischer Immobilienbestand fuer den Negativfall.
- `app/data/demo/agent_log.jsonl` — vom neuen Tool erzeugter, fiktiver Demo-Laufeintrag.

**Modify:**

- `app/schemas/transaktionen.schema.json` — optionales `immobilie_id`.
- `app/tools/validate-core.mjs` — Inline-Vertrag und Referenzpruefung.
- `tests/fixtures/master-valid/transaktionen.jsonl` — gueltiger Objektbezug.
- `tests/fixtures/master-invalid/transaktionen.jsonl` — unbekannter Objektbezug.
- `tests/m1-validator.test.mjs` — Fixtures laden und Negativfehler belegen.
- `tests/m5-validator.test.mjs` — Format- und Referenzverhalten des Core-Validators.
- `app/docs/agent-context.md` — Domaenenregel und neues Tool.
- `app/tools/inbox.mjs` — importierte IDs in Bericht und Protokoll bewahren.
- `tests/inbox-plan.test.mjs` — beobachtbares Berichts-/Protokollverhalten.
- `app/docs/skills/import-agent.md` — verpflichtendes Immobilien-Gate.
- `app/views/transaktionen.mjs` — Aufloesung, Detailzeile und Suchfeld.
- `app/i18n.js` — `transactions.immobilie` in Deutsch und Englisch.
- `tests/transactions-search.test.mjs` — Suche nach Immobilien-ID.
- `app/data/demo/transaktionen.jsonl` — 72 eindeutige Demo-Bezuege, erzeugt mit dem neuen Tool.
- `tests/demo-data.test.mjs` — Demo-Zuordnungen und Gesamtvaliditaet.

**Already completed in design commit `f7c60fd`:**

- `CONTEXT.md`
- `docs/adr/0024-transaktion-hat-optionalen-immobilienbezug.md`
- `docs/superpowers/specs/2026-08-12-transaktion-immobilienbezug-design.md`

---

### Task 1: Datenvertrag und referenzielle Validierung

**Files:**

- Create: `tests/fixtures/master-valid/immobilien.json`
- Create: `tests/fixtures/master-invalid/immobilien.json`
- Modify: `tests/fixtures/master-valid/transaktionen.jsonl`
- Modify: `tests/fixtures/master-invalid/transaktionen.jsonl`
- Modify: `tests/m1-validator.test.mjs`
- Modify: `tests/m5-validator.test.mjs`
- Modify: `app/schemas/transaktionen.schema.json`
- Modify: `app/tools/validate-core.mjs`

**Interfaces:**

- Consumes: `data.immobilien: Array<{ immobilie_id: string, ... }>` und `data.transaktionen`.
- Produces: optionales `Transaktion.immobilie_id: string` mit `^IMM-\d{3}$`; `validateMasterData(data)` meldet unbekannte Referenzen.

- [ ] **Step 1: Gueltige und ungueltige synthetische Fixtures anlegen**

`tests/fixtures/master-valid/immobilien.json`:

```json
[
  {
    "immobilie_id": "IMM-001",
    "bezeichnung": "Testobjekt",
    "eigentumsanteile": [
      { "person_id": "PER-001", "zaehler": 1, "nenner": 1 }
    ],
    "status": "aktiv"
  }
]
```

`tests/fixtures/master-invalid/immobilien.json`:

```json
[
  {
    "immobilie_id": "IMM-001",
    "bezeichnung": "Testobjekt",
    "eigentumsanteile": [
      { "person_id": "PER-001", "zaehler": 1, "nenner": 1 }
    ],
    "status": "aktiv"
  }
]
```

`tests/fixtures/master-valid/transaktionen.jsonl`:

```json
{"transaktion_id":"TXN-4bacb864-48f3-444b-9523-0e32eb870e63","dedupe_hash":"fixture-hash-1","rohquelle":"data/inbox/test.csv","konto_id":"KTO-001","buchungsdatum":"2026-06-01","betrag":"100.00","gegenpartei":"Fixture Payer","verwendungszweck":"Fixture income","kategorisierung_status":"bestaetigt","ist_transfer":false,"kategorie_id":"KAT-001","immobilie_id":"IMM-001"}
```

`tests/fixtures/master-invalid/transaktionen.jsonl`:

```json
{"transaktion_id":"TXN-985b0957-5a5c-47f6-9066-6eacbf976a55","dedupe_hash":"duplicate-fixture-hash","rohquelle":"data/inbox/test.csv","konto_id":"KTO-999","buchungsdatum":"2026-06-01","betrag":"100.00","gegenpartei":"Fixture Payer","verwendungszweck":"Fixture income","kategorisierung_status":"bestaetigt","ist_transfer":false,"kategorie_id":"KAT-001","immobilie_id":"IMM-999"}
{"transaktion_id":"TXN-a944a8ec-b41e-4837-b6a8-87cb2d76b8dd","dedupe_hash":"duplicate-fixture-hash","rohquelle":"data/inbox/test.csv","konto_id":"KTO-001","buchungsdatum":"2026-06-01","betrag":"50.00","gegenpartei":"Fixture Payer","verwendungszweck":"Fixture income","kategorisierung_status":"bestaetigt","ist_transfer":false}
```

- [ ] **Step 2: Failing tests fuer beide Schemaorte und die Referenz schreiben**

`tests/m1-validator.test.mjs` laedt in `loadMasterData()` zusaetzlich:

```js
immobilien: await readJson(`${root}immobilien.json`),
```

Direkt nach den vorhandenen Invalid-Assertions:

```js
assert.match(invalidResult.errors.join("\n"), /immobilie_id.*IMM-999.*existiert nicht/);
```

`tests/m5-validator.test.mjs` erhaelt:

```js
import { readFileSync } from "node:fs";

test("JSON-Transaktionsvertrag erlaubt eine Immobilienreferenz", () => {
  const schema = JSON.parse(readFileSync(
    new URL("../app/schemas/transaktionen.schema.json", import.meta.url),
    "utf8",
  ));
  assert.equal(schema.items.properties.immobilie_id.pattern, "^IMM-\\d{3}$");
});

test("Transaktion mit existierender immobilie_id ist valide", () => {
  const data = basisMitTransaktion("regel");
  data.immobilien.push({
    immobilie_id: "IMM-001",
    bezeichnung: "Testobjekt",
    eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }],
    status: "aktiv",
  });
  data.transaktionen[0].immobilie_id = "IMM-001";

  const result = validateMasterData(data);
  assert.equal(result.valid, true, result.errors.join("\n"));
});

test("Transaktion mit unbekannter immobilie_id ist ungueltig", () => {
  const data = basisMitTransaktion("regel");
  data.transaktionen[0].immobilie_id = "IMM-999";

  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /immobilie_id.*IMM-999.*existiert nicht/);
});

test("Transaktion mit falsch formatierter immobilie_id ist ungueltig", () => {
  const data = basisMitTransaktion("regel");
  data.transaktionen[0].immobilie_id = "IMM-1";

  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /immobilie_id.*Format ungueltig/);
});
```

- [ ] **Step 3: RED verifizieren**

Run:

```bash
node --test tests/m1-validator.test.mjs tests/m5-validator.test.mjs
npm run validate:fixtures
```

Expected: FAIL, weil `immobilie_id` im Inline-Vertrag und JSON-Schema fehlt; der gueltige Fixture-Lauf meldet das Feld als unbekannt.

- [ ] **Step 4: Minimalen JSON- und Inline-Vertrag implementieren**

In `app/schemas/transaktionen.schema.json` direkt neben `regelzahlung_id`:

```json
"immobilie_id": { "type": "string", "pattern": "^IMM-\\d{3}$" },
```

In `app/tools/validate-core.mjs` im Inline-Vertrag:

```js
immobilie_id: { type: "string", pattern: /^IMM-\d{3}$/ },
```

Zu Beginn von `validateCrossFieldRules` den Immobilienindex zusammen mit den anderen Indizes erzeugen:

```js
const immobilien = byId(data.immobilien, "immobilie_id");
```

Die spaetere doppelte Deklaration entfernen. Im ersten Transaktionslauf direkt nach `regelzahlung_id`:

```js
if (transaktion.immobilie_id && !immobilien.has(transaktion.immobilie_id)) {
  errors.push(
    `transaktionen.${transaktion.transaktion_id}.immobilie_id: ${transaktion.immobilie_id} existiert nicht`,
  );
}
```

- [ ] **Step 5: GREEN verifizieren**

Run:

```bash
node --test tests/m1-validator.test.mjs tests/m5-validator.test.mjs
npm run validate:fixtures
```

Expected: PASS. Insbesondere enthaelt der Invalid-Lauf den Fehler zu `IMM-999`.

- [ ] **Step 6: Task-Commit**

```bash
git add app/schemas/transaktionen.schema.json app/tools/validate-core.mjs tests/fixtures/master-valid/immobilien.json tests/fixtures/master-invalid/immobilien.json tests/fixtures/master-valid/transaktionen.jsonl tests/fixtures/master-invalid/transaktionen.jsonl tests/m1-validator.test.mjs tests/m5-validator.test.mjs
git commit -m "feat: Immobilienbezug an Transaktionen validieren"
```

---

### Task 2: Sicheres Exact-ID-Schreibwerkzeug

**Files:**

- Create: `app/tools/transaktion-immobilie.mjs`
- Create: `tests/transaktion-immobilie-tool.test.mjs`
- Modify: `app/docs/agent-context.md`

**Interfaces:**

- Consumes: `aktualisiereImmobilienbezug({ transaktionen, immobilien, ids, immobilieId, entfernen, ersetzen })`.
- Produces: `{ transaktionen, report, blockiert }`; CLI mit `--ids`, genau einer Aktion, optional `--ersetzen`, `--schreiben`.
- Side effects on successful CLI write: rewrite `transaktionen.jsonl`, post-validate, append one `agent_log.jsonl` record.

- [ ] **Step 1: Failing Unit-Tests fuer die reine Zuordnungslogik schreiben**

`tests/transaktion-immobilie-tool.test.mjs` beginnt mit:

```js
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { aktualisiereImmobilienbezug } from "../app/tools/transaktion-immobilie.mjs";

const immobilien = [{ immobilie_id: "IMM-001" }, { immobilie_id: "IMM-002" }];
const tx = (id, over = {}) => ({
  transaktion_id: id,
  konto_id: "KTO-001",
  buchungsdatum: "2026-01-01",
  betrag: "-10.00",
  gegenpartei: "Testfirma",
  verwendungszweck: "Test",
  kategorisierung_status: "bestaetigt",
  kategorie_id: "KAT-001",
  kategorie_herkunft: "manuell",
  ist_transfer: false,
  ...over,
});

test("setzt den Bezug und laesst fachfremde Felder unveraendert", () => {
  const original = tx("TXN-A");
  const out = aktualisiereImmobilienbezug({
    transaktionen: [original],
    immobilien,
    ids: ["TXN-A"],
    immobilieId: "IMM-001",
  });

  assert.equal(out.blockiert, false);
  assert.deepEqual(out.transaktionen[0], { ...original, immobilie_id: "IMM-001" });
  assert.deepEqual(out.report, {
    betroffen: 1,
    gesetzt: 1,
    entfernt: 0,
    unveraendert: 0,
    konflikte: [],
    nicht_gefunden: [],
  });
});

test("identischer Zweitlauf ist idempotent", () => {
  const original = tx("TXN-A", { immobilie_id: "IMM-001" });
  const out = aktualisiereImmobilienbezug({
    transaktionen: [original],
    immobilien,
    ids: ["TXN-A"],
    immobilieId: "IMM-001",
  });

  assert.equal(out.report.unveraendert, 1);
  assert.equal(out.report.gesetzt, 0);
  assert.deepEqual(out.transaktionen, [original]);
});

test("abweichender bestehender Bezug blockiert atomar ohne --ersetzen", () => {
  const a = tx("TXN-A", { immobilie_id: "IMM-002" });
  const b = tx("TXN-B");
  const out = aktualisiereImmobilienbezug({
    transaktionen: [a, b],
    immobilien,
    ids: ["TXN-A", "TXN-B"],
    immobilieId: "IMM-001",
  });

  assert.equal(out.blockiert, true);
  assert.deepEqual(out.report.konflikte, ["TXN-A"]);
  assert.deepEqual(out.transaktionen, [a, b]);
});

test("--ersetzen erlaubt die bewusste Korrektur", () => {
  const out = aktualisiereImmobilienbezug({
    transaktionen: [tx("TXN-A", { immobilie_id: "IMM-002" })],
    immobilien,
    ids: ["TXN-A"],
    immobilieId: "IMM-001",
    ersetzen: true,
  });
  assert.equal(out.blockiert, false);
  assert.equal(out.transaktionen[0].immobilie_id, "IMM-001");
  assert.equal(out.report.gesetzt, 1);
});

test("--entfernen loescht nur immobilie_id", () => {
  const original = tx("TXN-A", { immobilie_id: "IMM-001" });
  const out = aktualisiereImmobilienbezug({
    transaktionen: [original],
    immobilien,
    ids: ["TXN-A"],
    entfernen: true,
  });
  assert.equal(Object.hasOwn(out.transaktionen[0], "immobilie_id"), false);
  assert.equal(out.transaktionen[0].kategorie_id, original.kategorie_id);
  assert.equal(out.report.entfernt, 1);
});

test("unbekannte Transaktions-ID blockiert den gesamten Lauf", () => {
  const original = tx("TXN-A");
  const out = aktualisiereImmobilienbezug({
    transaktionen: [original],
    immobilien,
    ids: ["TXN-A", "TXN-FEHLT"],
    immobilieId: "IMM-001",
  });
  assert.equal(out.blockiert, true);
  assert.deepEqual(out.report.nicht_gefunden, ["TXN-FEHLT"]);
  assert.deepEqual(out.transaktionen, [original]);
});

test("unbekannte Immobilie und widerspruechliche Optionen sind Fehler", () => {
  assert.throws(
    () => aktualisiereImmobilienbezug({
      transaktionen: [tx("TXN-A")],
      immobilien,
      ids: ["TXN-A"],
      immobilieId: "IMM-999",
    }),
    /IMM-999.*existiert nicht/,
  );
  assert.throws(
    () => aktualisiereImmobilienbezug({
      transaktionen: [tx("TXN-A")],
      immobilien,
      ids: ["TXN-A"],
      immobilieId: "IMM-001",
      entfernen: true,
    }),
    /genau eine Aktion/,
  );
});
```

- [ ] **Step 2: RED der Unit-Tests verifizieren**

Run:

```bash
node --test tests/transaktion-immobilie-tool.test.mjs
```

Expected: FAIL mit `ERR_MODULE_NOT_FOUND` fuer `app/tools/transaktion-immobilie.mjs`.

- [ ] **Step 3: Reine Zuordnungsfunktion minimal implementieren**

`app/tools/transaktion-immobilie.mjs` exportiert:

```js
export function aktualisiereImmobilienbezug({
  transaktionen,
  immobilien,
  ids,
  immobilieId,
  entfernen = false,
  ersetzen = false,
}) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("ids ist Pflicht");
  }
  if (Boolean(immobilieId) === Boolean(entfernen)) {
    throw new Error("genau eine Aktion angeben: --immobilie oder --entfernen");
  }
  if (entfernen && ersetzen) {
    throw new Error("--ersetzen ist nur zusammen mit --immobilie erlaubt");
  }
  if (immobilieId && !(immobilien ?? []).some((imm) => imm.immobilie_id === immobilieId)) {
    throw new Error(`immobilie_id ${immobilieId} existiert nicht`);
  }

  const gesucht = [...new Set(ids)];
  const byId = new Map(transaktionen.map((entry) => [entry.transaktion_id, entry]));
  const nichtGefunden = gesucht.filter((id) => !byId.has(id));
  const konflikte = entfernen || ersetzen
    ? []
    : gesucht.filter((id) => {
        const current = byId.get(id)?.immobilie_id;
        return current && current !== immobilieId;
      });
  const report = {
    betroffen: gesucht.length - nichtGefunden.length,
    gesetzt: 0,
    entfernt: 0,
    unveraendert: 0,
    konflikte,
    nicht_gefunden: nichtGefunden,
  };

  if (nichtGefunden.length || konflikte.length) {
    return { transaktionen, report, blockiert: true };
  }

  const ziel = new Set(gesucht);
  const next = transaktionen.map((entry) => {
    if (!ziel.has(entry.transaktion_id)) return entry;
    if (entfernen) {
      if (!Object.hasOwn(entry, "immobilie_id")) {
        report.unveraendert += 1;
        return entry;
      }
      const copy = { ...entry };
      delete copy.immobilie_id;
      report.entfernt += 1;
      return copy;
    }
    if (entry.immobilie_id === immobilieId) {
      report.unveraendert += 1;
      return entry;
    }
    report.gesetzt += 1;
    return { ...entry, immobilie_id: immobilieId };
  });

  return { transaktionen: next, report, blockiert: false };
}
```

- [ ] **Step 4: Unit-Tests GREEN machen**

Run:

```bash
node --test tests/transaktion-immobilie-tool.test.mjs
```

Expected: alle Unit-Tests PASS.

- [ ] **Step 5: Failing CLI-Integrationstest fuer Vorschau, Schreiben und Log ergaenzen**

Im selben Testfile:

```js
test("CLI-Vorschau schreibt nichts; --schreiben persistiert, validiert und protokolliert", () => {
  const temp = mkdtempSync(join(tmpdir(), "transaktion-immobilie-"));
  try {
    cpSync("tests/fixtures/master-valid", temp, { recursive: true });
    const txPath = join(temp, "transaktionen.jsonl");
    const [fixtureTx] = readFileSync(txPath, "utf8").trim().split(/\r?\n/).map(JSON.parse);
    delete fixtureTx.immobilie_id;
    writeFileSync(txPath, `${JSON.stringify(fixtureTx)}\n`);
    const before = readFileSync(txPath, "utf8");
    const tool = "app/tools/transaktion-immobilie.mjs";
    const args = [
      tool,
      `--ids=${fixtureTx.transaktion_id}`,
      "--immobilie=IMM-001",
      temp,
    ];

    const preview = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(preview.stdout, /"modus": "vorschau"/);
    assert.equal(readFileSync(txPath, "utf8"), before);
    assert.equal(existsSync(join(temp, "agent_log.jsonl")), false);

    const write = spawnSync(process.execPath, [...args, "--schreiben"], { encoding: "utf8" });
    assert.equal(write.status, 0, write.stderr);
    const [written] = readFileSync(txPath, "utf8").trim().split(/\r?\n/).map(JSON.parse);
    assert.equal(written.immobilie_id, "IMM-001");
    const log = readFileSync(join(temp, "agent_log.jsonl"), "utf8")
      .trim().split(/\r?\n/).map(JSON.parse);
    assert.equal(log.length, 1);
    assert.equal(log[0].anlass, "transaktion-immobilie");
    assert.deepEqual(log[0].betroffene_ids, [fixtureTx.transaktion_id]);
    assert.equal(log[0].immobilienbezuege_gesetzt, 1);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
```

- [ ] **Step 6: RED des CLI-Tests verifizieren**

Run:

```bash
node --test tests/transaktion-immobilie-tool.test.mjs
```

Expected: FAIL, weil CLI-Parsing, Persistenz und Protokoll noch fehlen.

- [ ] **Step 7: CLI mit atomarem Vorabcheck, Post-Validierung und Log implementieren**

Ergaenze `app/tools/transaktion-immobilie.mjs` um Node-I/O-Imports, Argumentparser und `main()`:

```js
import { appendFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dataRootFromArg } from "./data-root.mjs";
import { loadMasterData, validateMasterData } from "./validator.mjs";

function parseArgs(argv) {
  const args = {
    ids: [],
    immobilieId: undefined,
    entfernen: false,
    ersetzen: false,
    schreiben: false,
    root: undefined,
  };
  for (const arg of argv) {
    if (arg === "--entfernen") {
      args.entfernen = true;
    } else if (arg === "--ersetzen") {
      args.ersetzen = true;
    } else if (arg === "--schreiben") {
      args.schreiben = true;
    } else if (arg.startsWith("--ids=")) {
      args.ids = arg.slice("--ids=".length).split(",")
        .map((value) => value.trim()).filter(Boolean);
    } else if (arg.startsWith("--immobilie=")) {
      args.immobilieId = arg.slice("--immobilie=".length);
    } else if (arg.startsWith("--")) {
      throw new Error(`unbekanntes Argument: ${arg}`);
    } else if (args.root === undefined) {
      args.root = arg;
    } else {
      throw new Error(`mehr als ein Datenroot angegeben: ${arg}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataRoot = dataRootFromArg(
    args.root,
    new URL("../data/master/", import.meta.url),
    new URL("../", import.meta.url),
  );
  const data = await loadMasterData(dataRoot);
  const out = aktualisiereImmobilienbezug({
    transaktionen: data.transaktionen,
    immobilien: data.immobilien,
    ids: args.ids,
    immobilieId: args.immobilieId,
    entfernen: args.entfernen,
    ersetzen: args.ersetzen,
  });

  if (out.blockiert) {
    console.log(JSON.stringify({ modus: "blockiert", ...out.report }, null, 2));
    process.exitCode = 2;
    return;
  }
  if (!args.schreiben) {
    console.log(JSON.stringify({ modus: "vorschau", ...out.report }, null, 2));
    return;
  }

  const beforeWrite = validateMasterData({ ...data, transaktionen: out.transaktionen });
  if (!beforeWrite.valid) {
    throw new Error(`Validierung vor Schreiben fehlgeschlagen:\n${beforeWrite.errors.join("\n")}`);
  }

  await writeFile(
    new URL("transaktionen.jsonl", dataRoot),
    out.transaktionen.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
  );

  const afterWrite = validateMasterData(await loadMasterData(dataRoot));
  if (!afterWrite.valid) {
    throw new Error(`Validierung nach Schreiben fehlgeschlagen:\n${afterWrite.errors.join("\n")}`);
  }

  const logEntry = {
    zeitpunkt: new Date().toISOString(),
    anlass: "transaktion-immobilie",
    inputs: ["transaktionen.jsonl", "immobilien.json"],
    anzahl_importiert: 0,
    anzahl_offen: 0,
    anzahl_fehler: 0,
    immobilienbezuege_gesetzt: out.report.gesetzt,
    immobilienbezuege_entfernt: out.report.entfernt,
    notiz: args.entfernen
      ? "Immobilienbezug von Transaktionen entfernt"
      : `Immobilienbezug ${args.immobilieId} an Transaktionen gesetzt`,
    betroffene_ids: [...new Set(args.ids)],
  };
  await appendFile(
    new URL("agent_log.jsonl", dataRoot),
    `${JSON.stringify(logEntry)}\n`,
  );
  console.log(JSON.stringify({ modus: "geschrieben", ...out.report }, null, 2));
}
```

Der CLI-Einstieg folgt dem bestehenden Muster:

```js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 8: Neues Tool im App-Agentenkontext auffindbar machen**

In `app/docs/agent-context.md` unter `Wichtige Tools`:

```md
- `tools/transaktion-immobilie.mjs`: einen belegten oder vom Nutzer
  entschiedenen Immobilienbezug fuer explizite Transaktions-IDs setzen,
  entfernen oder bewusst ersetzen.
```

Im Abschnitt zur Transaktion die Beleggrenze aus ADR 0024 app-relativ wiedergeben; keine Referenz auf Root-ADR oder `CONTEXT.md` einfuegen.

- [ ] **Step 9: GREEN fuer Werkzeug und Agentenvertrag verifizieren**

Run:

```bash
node --test tests/transaktion-immobilie-tool.test.mjs tests/agent-docs.test.mjs
npm run validate:fixtures
```

Expected: PASS; der bestehende CLI-Auffindbarkeitstest erkennt das neue Tool im Agentenkontext.

- [ ] **Step 10: Task-Commit**

```bash
git add app/tools/transaktion-immobilie.mjs app/docs/agent-context.md tests/transaktion-immobilie-tool.test.mjs
git commit -m "feat: Immobilienbezug sicher pflegen"
```

---

### Task 3: Verpflichtendes Import-Gate mit erhaltenen IDs

**Files:**

- Modify: `app/tools/inbox.mjs`
- Modify: `tests/inbox-plan.test.mjs`
- Modify: `app/docs/skills/import-agent.md`

**Interfaces:**

- Produces: `importLaufBericht({ auftrag, profil, normalized, result })` mit `geschriebene_ids`.
- Produces: `betroffeneTransaktionsIds(laeufe): string[]` fuer den Inbox-Log.
- Agent contract: jede neue ID wird vor Importabschluss auf Immobilienbezug geprueft.

- [ ] **Step 1: Failing Tests fuer Bericht und Log-Aggregation schreiben**

Import in `tests/inbox-plan.test.mjs` erweitern:

```js
import {
  betroffeneTransaktionsIds,
  importLaufBericht,
  planInbox,
} from "../app/tools/inbox.mjs";
```

Tests:

```js
test("CSV-Laufbericht behaelt die neu geschriebenen Transaktions-IDs", () => {
  const bericht = importLaufBericht({
    auftrag: { datei: "test.csv", art: "csv" },
    profil: { profil_id: "test-profil" },
    normalized: { eintraege: [{}, {}], fehler: [] },
    result: {
      written: [
        { transaktion_id: "TXN-A", kategorisierung_status: "offen" },
        { transaktion_id: "TXN-B", kategorisierung_status: "vorgeschlagen" },
      ],
      skipped_dedupe: [],
      errors: [],
      transfers_matched: [],
    },
  });

  assert.deepEqual(bericht.geschriebene_ids, ["TXN-A", "TXN-B"]);
  assert.equal(bericht.geschrieben, 2);
});

test("Inbox-Protokoll aggregiert betroffene IDs stabil ueber alle CSV-Laeufe", () => {
  const ids = betroffeneTransaktionsIds([
    { art: "pdf-text" },
    { art: "csv", geschriebene_ids: ["TXN-A", "TXN-B"] },
    { art: "csv", geschriebene_ids: [] },
    { art: "csv", geschriebene_ids: ["TXN-C"] },
  ]);
  assert.deepEqual(ids, ["TXN-A", "TXN-B", "TXN-C"]);
});
```

- [ ] **Step 2: RED verifizieren**

Run:

```bash
node --test tests/inbox-plan.test.mjs
```

Expected: FAIL, weil beide Exporte fehlen.

- [ ] **Step 3: Berichtsfunktionen implementieren und im echten Inbox-Pfad verwenden**

In `app/tools/inbox.mjs`:

```js
export function importLaufBericht({ auftrag, profil, normalized, result }) {
  return {
    datei: auftrag.datei,
    art: "csv",
    profil: profil.profil_id,
    gelesen: normalized.eintraege.length,
    lesefehler: normalized.fehler.length,
    geschrieben: result.written.length,
    geschriebene_ids: result.written.map((entry) => entry.transaktion_id),
    uebersprungen_dedupe: result.skipped_dedupe.length,
    importfehler: result.errors.length,
    transfer_treffer: result.transfers_matched.length,
    ...(normalized.fehler.length ? { erste_lesefehler: normalized.fehler.slice(0, 3) } : {}),
    ...(result.errors.length ? { erste_importfehler: result.errors.slice(0, 3) } : {}),
  };
}

export function betroffeneTransaktionsIds(laeufe) {
  return laeufe.flatMap((lauf) => lauf.geschriebene_ids ?? []);
}
```

Den handgebauten CSV-Bericht durch `importLaufBericht(...)` ersetzen und im Protokoll setzen:

```js
betroffene_ids: betroffeneTransaktionsIds(bericht.laeufe),
```

- [ ] **Step 4: Import-Agent um das verpflichtende Gate ergaenzen**

In `app/docs/skills/import-agent.md` nach Transfer-Match und vor Abschluss/Protokoll:

```md
### Immobiliencheck fuer neue Transaktionen

Pruefe vor dem Abschluss jedes Importlaufs genau die IDs aus
`result.written` beziehungsweise `geschriebene_ids`:

1. Alle neuen Buchungen auf einen moeglichen Immobilienbezug sichten.
2. Kategorie, Gegenpartei, Adresse, Buchungstext und Belegpfad nur als
   Suchsignale verwenden, nie als alleinigen Zuordnungsanker.
3. Bei eindeutigem Beleg `tools/transaktion-immobilie.mjs` verwenden.
4. Bei einem bloss plausiblen Bezug die Kandidaten gruppiert dem Nutzer
   vorlegen; ohne Beleg oder Nutzerentscheidung bleibt `immobilie_id` weg.
5. Im Abschlussbericht `geprueft`, `zugeordnet`, `ohne_hinweis` und
   `ungeklaert` nennen.
```

Die nummerierten Prozessschritte so neu nummerieren, dass der Gate-Schritt tatsaechlich vor dem Abschlussbericht liegt. Kein Test darf bloss nach diesem Wortlaut greppen; das maschinenpruefbare Verhalten sind die erhaltenen IDs.

- [ ] **Step 5: GREEN verifizieren**

Run:

```bash
node --test tests/inbox-plan.test.mjs tests/agent-docs.test.mjs
npm test
```

Expected: PASS; `result.written` erreicht Bericht und `agent_log.betroffene_ids` ueber dieselben produktiven Helper.

- [ ] **Step 6: Task-Commit**

```bash
git add app/tools/inbox.mjs app/docs/skills/import-agent.md tests/inbox-plan.test.mjs
git commit -m "feat: Immobiliencheck an Import anschliessen"
```

---

### Task 4: Detail-Querlink, i18n und Suche nach Immobilien-ID

**Files:**

- Create: `tests/transactions-immobilie-link.test.mjs`
- Modify: `tests/transactions-search.test.mjs`
- Modify: `app/views/transaktionen.mjs`
- Modify: `app/i18n.js`

**Interfaces:**

- Produces: `immobilieForTransaction(tx): Immobilie | undefined`.
- UI: `data-action="open-vermoegen-entity" data-vklasse="immobilie" data-vid="<IMM-ID>"`.
- Search: `transactionSearchFields(tx)` enthaelt nur `tx.immobilie_id`, nicht Bezeichnung oder Adresse.

- [ ] **Step 1: Failing Detail- und i18n-Tests schreiben**

`tests/transactions-immobilie-link.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

globalThis.document = { querySelector: () => ({ innerHTML: "" }) };
globalThis.localStorage = {
  getItem: (key) => key === "finance-m2-data-mode" ? "demo" : null,
  setItem: () => {},
};
globalThis.window = globalThis;
globalThis.fetch = async (path) => {
  const cleanPath = String(path).replace(/^\.\//, "").replace(/\?.*$/, "");
  const body = readFileSync(new URL(`../app/${cleanPath}`, import.meta.url), "utf8");
  return { ok: true, json: async () => JSON.parse(body), text: async () => body };
};
await import("../app/i18n.js");

const { immobilieForTransaction, renderTransactionDetail } =
  await import("../app/views/transaktionen.mjs");
const { data } = await import("../app/runtime.mjs");

const immobilie = data.immobilien[0];
const konto = data.konten[0];

function txMit(over = {}) {
  return {
    transaktion_id: "TXN-00000000-0000-4000-8000-000000000999",
    konto_id: konto.konto_id,
    buchungsdatum: "2026-06-02",
    betrag: "-56.83",
    gegenpartei: "Testgegenpartei",
    verwendungszweck: "Test",
    kategorisierung_status: "bestaetigt",
    kategorie_herkunft: "manuell",
    ist_transfer: false,
    ...over,
  };
}

test("immobilieForTransaction loest nur bekannte IDs auf", () => {
  assert.equal(immobilieForTransaction(txMit()), undefined);
  assert.equal(immobilieForTransaction(txMit({ immobilie_id: "IMM-999" })), undefined);
  assert.equal(
    immobilieForTransaction(txMit({ immobilie_id: immobilie.immobilie_id }))?.immobilie_id,
    immobilie.immobilie_id,
  );
});

test("Detailansicht zeigt die Immobilie als Querlink", () => {
  const html = renderTransactionDetail(txMit({ immobilie_id: immobilie.immobilie_id }));
  assert.match(html, /data-action="open-vermoegen-entity"/);
  assert.match(html, /data-vklasse="immobilie"/);
  assert.match(html, new RegExp(`data-vid="${immobilie.immobilie_id}"`));
  assert.match(html, new RegExp(immobilie.immobilie_id));
});

test("Detailansicht laesst die Immobilienzeile ohne Bezug weg", () => {
  const html = renderTransactionDetail(txMit());
  assert.doesNotMatch(html, /data-vklasse="immobilie"/);
});

test("Immobilienlabel ist in beiden Sprachen gepflegt", () => {
  assert.equal(window.FINANCE_I18N.de.transactions.immobilie, "Immobilie");
  assert.equal(window.FINANCE_I18N.en.transactions.immobilie, "Property");
});
```

- [ ] **Step 2: Failing Suchtest ergaenzen**

In `tests/transactions-search.test.mjs`:

```js
const IMMOBILIE_ID = "IMM-777";
```

Die synthetische Transaktion erhaelt `immobilie_id: IMMOBILIE_ID`. Neuer Test:

```js
test("Suche nach Immobilien-ID findet nur die zugeordnete Buchung", () => {
  withSearchScenario(() => {
    state.transactionFilters.search = IMMOBILIE_ID;
    let ids = filteredTransactions().map((entry) => entry.transaktion_id);
    assert.ok(ids.includes(TX_ID));

    state.transactionFilters.search = "IMM-778";
    ids = filteredTransactions().map((entry) => entry.transaktion_id);
    assert.ok(!ids.includes(TX_ID));
  });
});
```

- [ ] **Step 3: RED verifizieren**

Run:

```bash
node --test tests/transactions-immobilie-link.test.mjs tests/transactions-search.test.mjs
```

Expected: FAIL, weil Resolver, Detailzeile, Suchfeld und i18n-Key fehlen.

- [ ] **Step 4: Resolver, Detail-Querlink und Suche minimal implementieren**

In `app/views/transaktionen.mjs`:

```js
export function immobilieForTransaction(tx) {
  if (!tx?.immobilie_id) return undefined;
  return (data.immobilien ?? []).find(
    (immobilie) => immobilie.immobilie_id === tx.immobilie_id,
  );
}
```

`transactionSearchFields(tx)` erhaelt `tx.immobilie_id` als eigenes Element. In `renderTransactionDetail(tx)`:

```js
const immobilie = immobilieForTransaction(tx);
```

Nach der Kontozeile:

```js
${immobilie ? detailRow(
  t("transactions.immobilie"),
  `<button class="linkish" data-action="open-vermoegen-entity" data-vklasse="immobilie" data-vid="${escapeHtml(immobilie.immobilie_id)}">${escapeHtml(`${immobilie.immobilie_id} · ${immobilie.bezeichnung}`)}</button>`,
) : ""}
```

In `app/i18n.js`:

```js
immobilie: "Immobilie",
```

und:

```js
immobilie: "Property",
```

- [ ] **Step 5: GREEN verifizieren**

Run:

```bash
node --test tests/transactions-immobilie-link.test.mjs tests/transactions-search.test.mjs tests/i18n-coverage.test.mjs
npm test
```

Expected: PASS; bestehende Konto-, Regel-ID- und Textsuche bleiben unveraendert.

- [ ] **Step 6: Task-Commit**

```bash
git add app/views/transaktionen.mjs app/i18n.js tests/transactions-immobilie-link.test.mjs tests/transactions-search.test.mjs
git commit -m "feat: Immobilienbezug in Transaktionen anzeigen"
```

---

### Task 5: Demodaten mit dem neuen Werkzeug erzeugen

**Files:**

- Modify: `tests/demo-data.test.mjs`
- Modify via tool: `app/data/demo/transaktionen.jsonl`
- Create via tool: `app/data/demo/agent_log.jsonl`

**Interfaces:**

- Consumes: die 72 expliziten IDs der zwei vollstaendigen Demo-Serien.
- Produces: 72 Demo-Transaktionen mit `immobilie_id = "IMM-001"` und einen Demo-Laufeintrag.

- [ ] **Step 1: Failing Demo-Verhaltenstest schreiben**

`tests/demo-data.test.mjs` erhaelt:

```js
test("Demodaten zeigen den Immobilienbezug an Darlehensrate und Hausgeld", () => {
  const data = demoData();
  const objektbezogen = data.transaktionen.filter((entry) =>
    ["Hannoversche Bank", "Hausverwaltung Lindenhof"].includes(entry.gegenpartei)
  );

  assert.equal(objektbezogen.length, 72);
  assert.ok(objektbezogen.every((entry) => entry.immobilie_id === "IMM-001"));
  assert.equal(validateMasterData(data).valid, true);
});
```

- [ ] **Step 2: RED verifizieren**

Run:

```bash
node --test tests/demo-data.test.mjs
```

Expected: FAIL, weil die 72 Zeilen noch kein `immobilie_id` tragen.

- [ ] **Step 3: Exakte Demo-ID-Liste setzen und Vorschau ausfuehren**

```bash
DEMO_IMMOBILIEN_TX_IDS="TXN-00000000-0000-4000-8000-000000000004,TXN-00000000-0000-4000-8000-000000000005,TXN-00000000-0000-4000-8000-000000000017,TXN-00000000-0000-4000-8000-000000000018,TXN-00000000-0000-4000-8000-00000000002a,TXN-00000000-0000-4000-8000-00000000002b,TXN-00000000-0000-4000-8000-00000000003d,TXN-00000000-0000-4000-8000-00000000003e,TXN-00000000-0000-4000-8000-00000000004f,TXN-00000000-0000-4000-8000-000000000050,TXN-00000000-0000-4000-8000-000000000062,TXN-00000000-0000-4000-8000-000000000063,TXN-00000000-0000-4000-8000-000000000075,TXN-00000000-0000-4000-8000-000000000076,TXN-00000000-0000-4000-8000-000000000087,TXN-00000000-0000-4000-8000-000000000088,TXN-00000000-0000-4000-8000-000000000099,TXN-00000000-0000-4000-8000-00000000009a,TXN-00000000-0000-4000-8000-0000000000ac,TXN-00000000-0000-4000-8000-0000000000ad,TXN-00000000-0000-4000-8000-0000000000bf,TXN-00000000-0000-4000-8000-0000000000c0,TXN-00000000-0000-4000-8000-0000000000d1,TXN-00000000-0000-4000-8000-0000000000d2,TXN-00000000-0000-4000-8000-0000000000e4,TXN-00000000-0000-4000-8000-0000000000e5,TXN-00000000-0000-4000-8000-0000000000f7,TXN-00000000-0000-4000-8000-0000000000f8,TXN-00000000-0000-4000-8000-00000000010a,TXN-00000000-0000-4000-8000-00000000010b,TXN-00000000-0000-4000-8000-00000000011d,TXN-00000000-0000-4000-8000-00000000011e,TXN-00000000-0000-4000-8000-00000000012f,TXN-00000000-0000-4000-8000-000000000130,TXN-00000000-0000-4000-8000-000000000142,TXN-00000000-0000-4000-8000-000000000143,TXN-00000000-0000-4000-8000-000000000155,TXN-00000000-0000-4000-8000-000000000156,TXN-00000000-0000-4000-8000-000000000167,TXN-00000000-0000-4000-8000-000000000168,TXN-00000000-0000-4000-8000-000000000179,TXN-00000000-0000-4000-8000-00000000017a,TXN-00000000-0000-4000-8000-00000000018c,TXN-00000000-0000-4000-8000-00000000018d,TXN-00000000-0000-4000-8000-00000000019f,TXN-00000000-0000-4000-8000-0000000001a0,TXN-00000000-0000-4000-8000-0000000001b1,TXN-00000000-0000-4000-8000-0000000001b2,TXN-00000000-0000-4000-8000-0000000001c4,TXN-00000000-0000-4000-8000-0000000001c5,TXN-00000000-0000-4000-8000-0000000001d7,TXN-00000000-0000-4000-8000-0000000001d8,TXN-00000000-0000-4000-8000-0000000001ea,TXN-00000000-0000-4000-8000-0000000001eb,TXN-00000000-0000-4000-8000-0000000001fd,TXN-00000000-0000-4000-8000-0000000001fe,TXN-00000000-0000-4000-8000-00000000020f,TXN-00000000-0000-4000-8000-000000000210,TXN-00000000-0000-4000-8000-000000000222,TXN-00000000-0000-4000-8000-000000000223,TXN-00000000-0000-4000-8000-000000000235,TXN-00000000-0000-4000-8000-000000000236,TXN-00000000-0000-4000-8000-000000000247,TXN-00000000-0000-4000-8000-000000000248,TXN-00000000-0000-4000-8000-000000000259,TXN-00000000-0000-4000-8000-00000000025a,TXN-00000000-0000-4000-8000-00000000026c,TXN-00000000-0000-4000-8000-00000000026d,TXN-00000000-0000-4000-8000-00000000027f,TXN-00000000-0000-4000-8000-000000000280,TXN-00000000-0000-4000-8000-000000000291,TXN-00000000-0000-4000-8000-000000000292"
node app/tools/transaktion-immobilie.mjs --ids="$DEMO_IMMOBILIEN_TX_IDS" --immobilie=IMM-001 app/data/demo
```

Expected preview: `betroffen: 72`, `gesetzt: 72`, keine Konflikte, keine fehlenden IDs. Vor `--schreiben` die ausgegebene Anzahl mit der literal geprueften Serienlaenge 72 vergleichen.

- [ ] **Step 4: Demo mit demselben exakten Aufruf schreiben**

```bash
node app/tools/transaktion-immobilie.mjs --ids="$DEMO_IMMOBILIEN_TX_IDS" --immobilie=IMM-001 app/data/demo --schreiben
node app/tools/validator.mjs app/data/demo
```

Expected: Schreibbericht `gesetzt: 72`, danach `Master data validation passed`. Der Toollauf erzeugt `app/data/demo/agent_log.jsonl`; keine Live-Datei unter `app/data/master` wird angefasst.

- [ ] **Step 5: GREEN verifizieren**

Run:

```bash
node --test tests/demo-data.test.mjs tests/transactions-immobilie-link.test.mjs tests/transactions-search.test.mjs
npm test
```

Expected: PASS; Demo-Suche nach `IMM-001` und Detail-Link werden durch versionierte, rein fiktive Daten demonstrierbar.

- [ ] **Step 6: Task-Commit**

```bash
git add app/data/demo/transaktionen.jsonl app/data/demo/agent_log.jsonl tests/demo-data.test.mjs
git commit -m "test: Immobilienbezug in Demodaten zeigen"
```

---

### Task 6: Phase-1-Gesamtverifikation und Abnahmegrenze

**Files:**

- Verify only; keine Live-Datei aendern.

**Interfaces:**

- Consumes: vollstaendige Phase-1-Implementierung.
- Produces: belastbarer Test-/Validatorbericht und Zaehler fuer Lars; Phase 2 bleibt gesperrt.

- [ ] **Step 1: Negativtest gezielt sichtbar ausfuehren**

Run:

```bash
node --test --test-name-pattern "unbekannter immobilie_id" tests/m5-validator.test.mjs
```

Expected: PASS; der Test prueft literal `IMM-999` und `existiert nicht`.

- [ ] **Step 2: Alle geforderten Test- und Validatorlaeufe frisch ausfuehren**

Run:

```bash
npm test
npm run validate:fixtures
npm run validate:master
node app/tools/validator.mjs app/data/demo
git diff --check
```

Expected: alle Befehle Exit 0, keine Warnungen oder Fehler.

- [ ] **Step 3: Live-Unveraendertheit und Zaehler pruefen**

Read-only aus `app/data/master/transaktionen.jsonl` ermitteln:

```bash
node --input-type=module -e 'import {readFile} from "node:fs/promises"; const rows=(await readFile("app/data/master/transaktionen.jsonl","utf8")).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse); console.log(JSON.stringify({gesamt:rows.length,mit_immobilie_id:rows.filter((entry)=>entry.immobilie_id).length,kat020:rows.filter((entry)=>entry.kategorie_id==="KAT-020").length},null,2));'
```

Expected fuer Phase 1: `gesamt: 2804`, `mit_immobilie_id: 0`, `kat020: 16`.

Read-only Demo-Zaehler:

```bash
node --input-type=module -e 'import {readFile} from "node:fs/promises"; const rows=(await readFile("app/data/demo/transaktionen.jsonl","utf8")).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse); console.log(JSON.stringify({mit_immobilie_id:rows.filter((entry)=>entry.immobilie_id).length,imm001:rows.filter((entry)=>entry.immobilie_id==="IMM-001").length},null,2));'
```

Expected: `mit_immobilie_id: 72` und `imm001: 72`.

- [ ] **Step 4: Verification-before-completion anwenden und Arbeitsbaum pruefen**

Run:

```bash
git status --short --branch
git log --oneline --decorate -6
```

Expected: Branch `feature/transaktion-immobilienbezug`, keine unbeabsichtigten oder uncommitteten Dateien. `.DS_Store` ignorieren und nicht anfassen.

- [ ] **Step 5: Phase-1-Bericht und ausdrueckliche Datenfreigabe anfordern**

Bericht an Lars:

- geaenderte/neu angelegte versionierte Dateien,
- gesetzte Live-Objektbezuege: `0`,
- gesetzte Demo-Objektbezuege: `72`,
- Tests: Gesamtzahl, `0` Fehler,
- `validate:fixtures`, `validate:master` und Demo-Validator: gruen,
- negativer `IMM-999`-Referenztest: gruen,
- Branch und letzte Commits.

Danach stoppen. Phase 2 beginnt erst nach Lars' ausdruecklicher Abnahme von Phase 1. Erst dann werden die vier bereits entschiedenen KAT-020-Zuordnungen ueber das neue Tool geschrieben, validiert und protokolliert; die uebrigen zwoelf werden gruppiert erfragt.

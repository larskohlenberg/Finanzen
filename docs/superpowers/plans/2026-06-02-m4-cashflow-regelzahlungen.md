# M4 — Cashflow & Regelzahlungen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wiederkehrende Zahlungen werden als Regelzahlungen (Status getrennt) modelliert; die App rechnet Cashflow-Ist (aus Transaktionen) und Cashflow-Prognose (aus bestätigten Regelzahlungen) **live** und zeigt Datenqualität neben jeder Kennzahl.

**Architecture:** Die Prognose-/Ist-Mathematik ist ein reines, deterministisches ES-Modul `app/cashflow.mjs` — node-getestet **und** vom Browser importiert (ADR 0012, webserver-only). Erkennung von Regelzahlungen ist Agent-Urteil, die Prognose-Mathematik ist deterministisch (ADR 0010). Eine Regelzahlung ist **ein** Datensatz mit `status`-Feld (kein separates Vorschlags-File). Die M4-Prognose ist bewusst unvollständig und kennzeichnet das (ADR 0011).

**Tech Stack:** ESM `.mjs`, `node --test`, hand-rolled Validator (kein Ajv, keine Deps), klassische Browser-Scripts + ein ES-Modul `main.js`, Claude-Preview zur App-Verifikation.

**Vorgelesen (verbindlich):** `CONTEXT.md` (Einträge Regelzahlung, Cashflow-Ist, Cashflow-Prognose), `docs/adr/0010`, `0011`, `0012`, `docs/runde2/Meilensteine_Runde2.md` (M4).

**Gesamt-Verifikation nach jeder Aufgabe:**
```bash
npm test
npm run validate:m1
node --check app/main.js && node --check app/cashflow.mjs && node --check app/i18n.js && node --check app/review-data.js
```

---

## File Structure

| Datei | Verantwortung | Aktion |
| --- | --- | --- |
| `schemas/regelzahlungen.schema.json` | JSON-Schema-Doku der Regelzahlung (Agent-Referenz) | Create |
| `data/master/regelzahlungen.json` | Regelzahlungs-Stammdaten (Demo-Start) | Create |
| `tools/validator.mjs` | + `regelzahlungen`-Schema, Cross-Field-Regeln, `integer`/`min`, `loadMasterData` | Modify |
| `tests/m4-regelzahlung-validator.test.mjs` | Validator-Tests Regelzahlung | Create |
| `app/cashflow.mjs` | Reine Cashflow-Mathematik (Ist, Prognose, Datumslogik) | Create |
| `tests/m4-cashflow.test.mjs` | Tests der Cashflow-Mathematik | Create |
| `app/review-data.js` | + `regelzahlungen` ins Review-Bundle | Modify |
| `app/index.html` | `main.js` als `type="module"` | Modify |
| `app/main.js` | Import cashflow.mjs, Nav-Eintrag, Cashflow-View, Qualitäts-Chips | Modify |
| `app/i18n.js` | Sprach-Keys (de+en) für Cashflow | Modify |
| `app/README.md` | Webserver-only-Hinweis (ADR 0008/0012) | Modify |
| `docs/skills/regelzahlung-agent.md` | Regelzahlungs-Agent-Skill | Create |
| `docs/skills/import-agent.md` | Querverweis aktualisieren | Modify |

---

## Task 1: Regelzahlung-Schema + Validator-Erweiterung

**Files:**
- Create: `schemas/regelzahlungen.schema.json`
- Create: `data/master/regelzahlungen.json`
- Modify: `tools/validator.mjs`
- Test: `tests/m4-regelzahlung-validator.test.mjs`

- [ ] **Step 1: JSON-Schema-Datei anlegen**

Create `schemas/regelzahlungen.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Regelzahlung",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["regelzahlung_id", "bezeichnung", "betrag", "rhythmus_einheit", "rhythmus_intervall", "anker_datum", "status", "erstellt_am"],
    "additionalProperties": false,
    "properties": {
      "regelzahlung_id": { "type": "string", "pattern": "^RZ-\\d{3}$" },
      "bezeichnung": { "type": "string", "minLength": 1 },
      "betrag": { "type": "string", "pattern": "^-?\\d+\\.\\d{2}$" },
      "rhythmus_einheit": { "type": "string", "enum": ["tag", "woche", "monat", "jahr"] },
      "rhythmus_intervall": { "type": "integer", "minimum": 1 },
      "anker_datum": { "type": "string", "format": "date" },
      "aktiv_bis": { "type": "string", "format": "date" },
      "status": { "type": "string", "enum": ["vorgeschlagen", "bestaetigt", "abgelehnt"] },
      "kategorie_id": { "type": "string", "pattern": "^KAT-\\d{3}$" },
      "erstellt_am": { "type": "string", "format": "date" },
      "bemerkung": { "type": "string" }
    }
  }
}
```

- [ ] **Step 2: Demo-Datenstand anlegen**

Create `data/master/regelzahlungen.json` (Demo, klar gekennzeichnet — wie die Demo-Transaktionen; wird im Wrap-up entfernt):

```json
[
  { "regelzahlung_id": "RZ-001", "bezeichnung": "Gehalt Lars (Demo)", "betrag": "3500.00", "rhythmus_einheit": "monat", "rhythmus_intervall": 1, "anker_datum": "2026-01-30", "status": "bestaetigt", "kategorie_id": "KAT-001", "erstellt_am": "2026-06-02", "bemerkung": "Demo" },
  { "regelzahlung_id": "RZ-002", "bezeichnung": "Miete (Demo)", "betrag": "-1200.00", "rhythmus_einheit": "monat", "rhythmus_intervall": 1, "anker_datum": "2026-01-01", "status": "bestaetigt", "kategorie_id": "KAT-002", "erstellt_am": "2026-06-02", "bemerkung": "Demo" },
  { "regelzahlung_id": "RZ-003", "bezeichnung": "Handyvertrag (Demo)", "betrag": "-29.99", "rhythmus_einheit": "monat", "rhythmus_intervall": 1, "anker_datum": "2025-07-01", "aktiv_bis": "2027-07-01", "status": "vorgeschlagen", "kategorie_id": "KAT-007", "erstellt_am": "2026-06-02", "bemerkung": "Demo, Vorschlag" }
]
```

- [ ] **Step 3: Failing test schreiben**

Create `tests/m4-regelzahlung-validator.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMasterData } from "../tools/validator.mjs";

function base() {
  return {
    personen: [{ person_id: "PER-001", name: "Lars", status: "aktiv" }],
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    kategorien: [{ kategorie_id: "KAT-001", name: "Gehalt", typ: "einnahme", lebenshaltung_relevant: false, status: "aktiv" }],
    transaktionen: [],
    transfers: [],
  };
}

function rz(extra = {}) {
  return { regelzahlung_id: "RZ-001", bezeichnung: "Gehalt", betrag: "3500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-30", status: "bestaetigt", kategorie_id: "KAT-001", erstellt_am: "2026-06-02", ...extra };
}

test("gueltige Regelzahlung passiert den Validator", () => {
  const data = { ...base(), regelzahlungen: [rz()] };
  const result = validateMasterData(data);
  assert.equal(result.valid, true, result.errors.join("\n"));
});

test("fehlendes regelzahlungen-Feld ist erlaubt (optional)", () => {
  const result = validateMasterData(base());
  assert.equal(result.valid, true, result.errors.join("\n"));
});

test("unbekannte kategorie_id wird gemeldet", () => {
  const data = { ...base(), regelzahlungen: [rz({ kategorie_id: "KAT-999" })] };
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /KAT-999 existiert nicht/);
});

test("aktiv_bis vor anker_datum wird gemeldet", () => {
  const data = { ...base(), regelzahlungen: [rz({ anker_datum: "2026-05-01", aktiv_bis: "2026-04-01" })] };
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /aktiv_bis: liegt vor anker_datum/);
});

test("rhythmus_intervall 0 ist ungueltig", () => {
  const data = { ...base(), regelzahlungen: [rz({ rhythmus_intervall: 0 })] };
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /rhythmus_intervall: muss mindestens 1 sein/);
});

test("nicht-ganzzahliges rhythmus_intervall ist ungueltig", () => {
  const data = { ...base(), regelzahlungen: [rz({ rhythmus_intervall: 1.5 })] };
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /rhythmus_intervall: muss eine Ganzzahl sein/);
});
```

- [ ] **Step 4: Test ausführen, Fehlschlag bestätigen**

Run: `node --test tests/m4-regelzahlung-validator.test.mjs`
Expected: FAIL — `regelzahlungen: muss eine Liste sein` o. ä., weil das Schema noch fehlt.

- [ ] **Step 5: Validator erweitern — Schema-Eintrag**

In `tools/validator.mjs`, im `schemas`-Objekt nach dem `transfers`-Block (vor der schließenden `};` von `schemas`) ergänzen:

```js
  regelzahlungen: {
    optional: true,
    required: ["regelzahlung_id", "bezeichnung", "betrag", "rhythmus_einheit", "rhythmus_intervall", "anker_datum", "status", "erstellt_am"],
    fields: {
      regelzahlung_id: { type: "string", pattern: /^RZ-\d{3}$/ },
      bezeichnung: { type: "string", minLength: 1 },
      betrag: { type: "string", pattern: /^-?\d+\.\d{2}$/ },
      rhythmus_einheit: { type: "string", enum: ["tag", "woche", "monat", "jahr"] },
      rhythmus_intervall: { type: "number", integer: true, min: 1 },
      anker_datum: { type: "string", format: "date" },
      aktiv_bis: { type: "string", format: "date" },
      status: { type: "string", enum: ["vorgeschlagen", "bestaetigt", "abgelehnt"] },
      kategorie_id: { type: "string", pattern: /^KAT-\d{3}$/ },
      erstellt_am: { type: "string", format: "date" },
      bemerkung: { type: "string" },
    },
  },
```

- [ ] **Step 6: Validator erweitern — optionale Collections überspringen**

In `tools/validator.mjs`, in `validateMasterData`, die Schleife anpassen:

```js
  for (const [collectionName, schema] of Object.entries(schemas)) {
    if (schema.optional && data[collectionName] === undefined) continue;
    validateCollection(collectionName, data[collectionName], schema, errors);
  }
```

- [ ] **Step 7: Validator erweitern — integer/min für Zahlen**

In `tools/validator.mjs`, in `validateField`, direkt nach dem `if (typeof value !== rule.type) { ... return; }`-Block ergänzen:

```js
  if (rule.integer && !Number.isInteger(value)) {
    errors.push(`${path}: muss eine Ganzzahl sein`);
  }
  if (rule.min !== undefined && value < rule.min) {
    errors.push(`${path}: muss mindestens ${rule.min} sein`);
  }
```

- [ ] **Step 8: Validator erweitern — Cross-Field-Regeln Regelzahlung**

In `tools/validator.mjs`, in `validateCrossFieldRules`, vor der schließenden `}` (nach dem `data.transfers?.forEach(...)`) ergänzen:

```js
  data.regelzahlungen?.forEach((rz) => {
    if (rz.kategorie_id && !kategorien.has(rz.kategorie_id)) {
      errors.push(`regelzahlungen.${rz.regelzahlung_id}.kategorie_id: ${rz.kategorie_id} existiert nicht`);
    }
    if (rz.aktiv_bis && rz.anker_datum && rz.aktiv_bis < rz.anker_datum) {
      errors.push(`regelzahlungen.${rz.regelzahlung_id}.aktiv_bis: liegt vor anker_datum`);
    }
  });
```

- [ ] **Step 9: Validator erweitern — loadMasterData**

In `tools/validator.mjs`, in `loadMasterData`, das zurückgegebene Objekt ergänzen:

```js
    transfers: await readJson(new URL("transfers.json", root)),
    regelzahlungen: await readJson(new URL("regelzahlungen.json", root)),
```

- [ ] **Step 10: Tests ausführen, grün bestätigen**

Run: `node --test tests/m4-regelzahlung-validator.test.mjs`
Expected: PASS (6 tests).

Run: `npm test` — Expected: alle bestehenden + neuen Tests grün.
Run: `npm run validate:m1` — Expected: `M1 validation passed` (lädt jetzt auch `regelzahlungen.json`).

- [ ] **Step 11: Commit**

```bash
git add schemas/regelzahlungen.schema.json data/master/regelzahlungen.json tools/validator.mjs tests/m4-regelzahlung-validator.test.mjs
git commit -m "feat(m4): Regelzahlung-Schema + Validator-Erweiterung

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Cashflow-Modul — Datumslogik (addInterval, occurrences)

**Files:**
- Create: `app/cashflow.mjs`
- Test: `tests/m4-cashflow.test.mjs`

- [ ] **Step 1: Failing test schreiben**

Create `tests/m4-cashflow.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { addInterval, occurrences } from "../app/cashflow.mjs";

test("addInterval addiert Tage", () => {
  assert.equal(addInterval("2026-01-30", "tag", 5), "2026-02-04");
});

test("addInterval addiert Wochen", () => {
  assert.equal(addInterval("2026-01-01", "woche", 2), "2026-01-15");
});

test("addInterval addiert Monate mit Monatsende-Clamping", () => {
  assert.equal(addInterval("2026-01-31", "monat", 1), "2026-02-28");
  assert.equal(addInterval("2026-01-31", "monat", 3), "2026-04-30");
});

test("addInterval addiert Jahre und clampt Schaltjahr", () => {
  assert.equal(addInterval("2024-02-29", "jahr", 1), "2025-02-28");
});

test("occurrences liefert nur Fälligkeiten nach heute bis Horizont", () => {
  const rz = { anker_datum: "2026-01-01", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  const result = occurrences(rz, "2026-03-15", "2026-06-30");
  assert.deepEqual(result, ["2026-04-01", "2026-05-01", "2026-06-01"]);
});

test("occurrences stoppt an aktiv_bis (24-Monate-Vertrag)", () => {
  const rz = { anker_datum: "2025-07-01", aktiv_bis: "2027-07-01", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  const result = occurrences(rz, "2027-04-15", "2030-12-31");
  assert.deepEqual(result, ["2027-05-01", "2027-06-01", "2027-07-01"]);
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `node --test tests/m4-cashflow.test.mjs`
Expected: FAIL — `Cannot find module '../app/cashflow.mjs'`.

- [ ] **Step 3: Minimale Implementierung**

Create `app/cashflow.mjs`:

```js
// app/cashflow.mjs
// Reine, deterministische Cashflow-Mathematik. Kein DOM, keine Node-Abhaengigkeiten.
// Eine getestete Funktion an zwei Aufrufstellen: Browser (app/main.js) und Node (tests/).
// Liegt unter app/, weil der Webserver nur das App-Verzeichnis ausliefert (ADR 0009/0012).

export function toCents(decimalString) {
  const sign = decimalString.startsWith("-") ? -1 : 1;
  const unsigned = decimalString.replace("-", "");
  const [euros, cents] = unsigned.split(".");
  return sign * (Number(euros) * 100 + Number(cents));
}

export function monatVon(isoDate) {
  return isoDate.slice(0, 7);
}

export function addInterval(isoDate, einheit, intervall) {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (einheit === "tag") {
    return new Date(Date.UTC(y, m - 1, d + intervall)).toISOString().slice(0, 10);
  }
  if (einheit === "woche") {
    return new Date(Date.UTC(y, m - 1, d + intervall * 7)).toISOString().slice(0, 10);
  }
  if (einheit === "monat") {
    const totalMonths = y * 12 + (m - 1) + intervall;
    const ny = Math.floor(totalMonths / 12);
    const nm = totalMonths % 12;
    const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    return new Date(Date.UTC(ny, nm, Math.min(d, lastDay))).toISOString().slice(0, 10);
  }
  if (einheit === "jahr") {
    const ny = y + intervall;
    const lastDay = new Date(Date.UTC(ny, m, 0)).getUTCDate();
    return new Date(Date.UTC(ny, m - 1, Math.min(d, lastDay))).toISOString().slice(0, 10);
  }
  throw new Error(`Unbekannte Rhythmus-Einheit: ${einheit}`);
}

export function occurrences(regelzahlung, today, horizonEnd) {
  const ende = regelzahlung.aktiv_bis && regelzahlung.aktiv_bis < horizonEnd ? regelzahlung.aktiv_bis : horizonEnd;
  const dates = [];
  let cur = regelzahlung.anker_datum;
  let guard = 0;
  while (cur <= ende && guard < 100000) {
    if (cur > today) dates.push(cur);
    cur = addInterval(cur, regelzahlung.rhythmus_einheit, regelzahlung.rhythmus_intervall);
    guard++;
  }
  return dates;
}
```

- [ ] **Step 4: Tests ausführen, grün bestätigen**

Run: `node --test tests/m4-cashflow.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add app/cashflow.mjs tests/m4-cashflow.test.mjs
git commit -m "feat(m4): Cashflow-Datumslogik addInterval/occurrences

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Cashflow-Ist

**Files:**
- Modify: `app/cashflow.mjs`
- Test: `tests/m4-cashflow.test.mjs`

- [ ] **Step 1: Failing test ergänzen**

In `tests/m4-cashflow.test.mjs` am Ende ergänzen (Import-Zeile oben um `computeCashflowIst` erweitern):

```js
import { addInterval, occurrences, computeCashflowIst } from "../app/cashflow.mjs";
```

```js
test("computeCashflowIst summiert je Monat, ohne Transfers, bis heute", () => {
  const tx = [
    { buchungsdatum: "2026-04-01", betrag: "3500.00", ist_transfer: false, kategorisierung_status: "bestaetigt" },
    { buchungsdatum: "2026-04-10", betrag: "-1200.00", ist_transfer: false, kategorisierung_status: "bestaetigt" },
    { buchungsdatum: "2026-04-12", betrag: "-500.00", ist_transfer: true, kategorisierung_status: "bestaetigt" },
    { buchungsdatum: "2026-05-02", betrag: "-80.00", ist_transfer: false, kategorisierung_status: "offen" },
    { buchungsdatum: "2026-07-01", betrag: "-50.00", ist_transfer: false, kategorisierung_status: "bestaetigt" },
  ];
  const result = computeCashflowIst(tx, { today: "2026-05-31" });
  assert.deepEqual(result.monate, [
    { monat: "2026-04", netto_cents: 230000 },
    { monat: "2026-05", netto_cents: -8000 },
  ]);
  assert.equal(result.gesamt_netto_cents, 222000);
  assert.equal(result.qualitaet.gesamt_anzahl, 3);
  assert.equal(result.qualitaet.offene_kategorie_anzahl, 1);
});
```

(Transfer ausgeschlossen, Juli-Buchung liegt nach `today` → ausgeschlossen, offene Kategorie gezählt.)

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `node --test tests/m4-cashflow.test.mjs`
Expected: FAIL — `computeCashflowIst is not a function`.

- [ ] **Step 3: Implementierung ergänzen**

In `app/cashflow.mjs` ergänzen:

```js
export function computeCashflowIst(transaktionen, { today }) {
  const monate = new Map();
  let gesamt = 0;
  let offen = 0;
  for (const tx of transaktionen) {
    if (tx.ist_transfer === true) continue;
    if (tx.buchungsdatum > today) continue;
    gesamt++;
    if (tx.kategorisierung_status !== "bestaetigt") offen++;
    const monat = monatVon(tx.buchungsdatum);
    monate.set(monat, (monate.get(monat) ?? 0) + toCents(tx.betrag));
  }
  const monatsListe = [...monate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monat, netto_cents]) => ({ monat, netto_cents }));
  return {
    monate: monatsListe,
    gesamt_netto_cents: monatsListe.reduce((s, m) => s + m.netto_cents, 0),
    qualitaet: { gesamt_anzahl: gesamt, offene_kategorie_anzahl: offen },
  };
}
```

- [ ] **Step 4: Tests ausführen, grün bestätigen**

Run: `node --test tests/m4-cashflow.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/cashflow.mjs tests/m4-cashflow.test.mjs
git commit -m "feat(m4): computeCashflowIst (Monats-Ist aus Transaktionen)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Cashflow-Prognose + Horizont

**Files:**
- Modify: `app/cashflow.mjs`
- Test: `tests/m4-cashflow.test.mjs`

- [ ] **Step 1: Failing test ergänzen**

Import-Zeile erweitern um `computeCashflowPrognose, defaultHorizonEnd`:

```js
import { addInterval, occurrences, computeCashflowIst, computeCashflowPrognose, defaultHorizonEnd } from "../app/cashflow.mjs";
```

Tests ergänzen:

```js
function rz(extra = {}) {
  return { regelzahlung_id: "RZ-001", betrag: "-1200.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt", ...extra };
}

test("defaultHorizonEnd nimmt das späteste aktiv_bis, mindestens Fallback", () => {
  const liste = [rz({ aktiv_bis: "2030-01-01" }), rz({ regelzahlung_id: "RZ-002", aktiv_bis: "2028-01-01" })];
  assert.equal(defaultHorizonEnd(liste, "2026-06-01", 12), "2030-01-01");
});

test("defaultHorizonEnd fällt auf today+Fallback zurück, wenn alle unbefristet", () => {
  const liste = [rz()];
  assert.equal(defaultHorizonEnd(liste, "2026-06-01", 12), "2027-06-01");
});

test("computeCashflowPrognose projiziert nur bestätigte ab nach heute", () => {
  const liste = [
    rz({ betrag: "3500.00", anker_datum: "2026-01-30", kategorie_id: "KAT-001" }),
    rz({ regelzahlung_id: "RZ-009", status: "vorgeschlagen", betrag: "-99.00" }),
  ];
  const result = computeCashflowPrognose(liste, { today: "2026-06-15", horizonEnd: "2026-08-31" });
  assert.deepEqual(result.monate, [
    { monat: "2026-06", netto_cents: 350000 },
    { monat: "2026-07", netto_cents: 350000 },
    { monat: "2026-08", netto_cents: 350000 },
  ]);
  assert.equal(result.qualitaet.bestaetigte_regelzahlungen, 1);
  assert.equal(result.qualitaet.vorschlaege_nicht_enthalten, 1);
  assert.equal(result.qualitaet.einmaleffekte_enthalten, false);
  assert.equal(result.horizont_ende, "2026-08-31");
});

test("Stufenänderung: zwei aufeinanderfolgende Regelzahlungen ohne Überlappung", () => {
  const liste = [
    rz({ regelzahlung_id: "RZ-A", betrag: "3500.00", anker_datum: "2026-01-01", aktiv_bis: "2026-07-31" }),
    rz({ regelzahlung_id: "RZ-B", betrag: "1750.00", anker_datum: "2026-08-01" }),
  ];
  const result = computeCashflowPrognose(liste, { today: "2026-06-15", horizonEnd: "2026-09-30" });
  assert.deepEqual(result.monate, [
    { monat: "2026-07", netto_cents: 350000 },
    { monat: "2026-08", netto_cents: 175000 },
    { monat: "2026-09", netto_cents: 175000 },
  ]);
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `node --test tests/m4-cashflow.test.mjs`
Expected: FAIL — `computeCashflowPrognose is not a function`.

- [ ] **Step 3: Implementierung ergänzen**

In `app/cashflow.mjs` ergänzen:

```js
export function defaultHorizonEnd(regelzahlungen, today, fallbackMonate = 12) {
  let max = null;
  for (const rz of regelzahlungen) {
    if (rz.status !== "bestaetigt") continue;
    if (rz.aktiv_bis && (max === null || rz.aktiv_bis > max)) max = rz.aktiv_bis;
  }
  const fallback = addInterval(today, "monat", fallbackMonate);
  if (max === null) return fallback;
  return max > fallback ? max : fallback;
}

export function computeCashflowPrognose(regelzahlungen, { today, horizonEnd }) {
  const ende = horizonEnd ?? defaultHorizonEnd(regelzahlungen, today);
  const monate = new Map();
  let bestaetigt = 0;
  let vorschlaege = 0;
  let unbefristet = 0;
  for (const rz of regelzahlungen) {
    if (rz.status === "vorgeschlagen") { vorschlaege++; continue; }
    if (rz.status !== "bestaetigt") continue;
    bestaetigt++;
    if (!rz.aktiv_bis) unbefristet++;
    const betrag = toCents(rz.betrag);
    for (const datum of occurrences(rz, today, ende)) {
      const monat = monatVon(datum);
      monate.set(monat, (monate.get(monat) ?? 0) + betrag);
    }
  }
  const monatsListe = [...monate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([monat, netto_cents]) => ({ monat, netto_cents }));
  return {
    monate: monatsListe,
    gesamt_netto_cents: monatsListe.reduce((s, m) => s + m.netto_cents, 0),
    horizont_ende: ende,
    qualitaet: {
      bestaetigte_regelzahlungen: bestaetigt,
      vorschlaege_nicht_enthalten: vorschlaege,
      unbefristete_regelzahlungen: unbefristet,
      einmaleffekte_enthalten: false,
    },
  };
}
```

- [ ] **Step 4: Tests ausführen, grün bestätigen**

Run: `node --test tests/m4-cashflow.test.mjs`
Expected: PASS (11 tests).
Run: `npm test` — alle grün.

- [ ] **Step 5: Commit**

```bash
git add app/cashflow.mjs tests/m4-cashflow.test.mjs
git commit -m "feat(m4): computeCashflowPrognose + Horizont (defaultHorizonEnd)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: App auf ES-Modul umstellen + Regelzahlungen ins Bundle

Kein Node-Unit-Test (Browser-only) → Verifikation per `node --check` + Claude-Preview.

**Files:**
- Modify: `app/index.html`
- Modify: `app/review-data.js`
- Modify: `app/main.js`

- [ ] **Step 1: index.html — main.js als Modul**

In `app/index.html` Zeile 10 ersetzen:

```html
    <script src="./main.js" defer></script>
```

durch:

```html
    <script src="./main.js" type="module"></script>
```

(`review-data.js` und `i18n.js` bleiben `defer` — sie laufen synchron vor dem deferred Modul.)

- [ ] **Step 2: Regelzahlungen ins Review-Bundle**

In `app/review-data.js`, im Objekt `window.FINANCE_REVIEW_DATA` nach dem `importfehler: [...]`-Array (vor der schließenden `};`) ergänzen:

```js
  regelzahlungen: [
    { regelzahlung_id: "RZ-001", bezeichnung: "Gehalt Lars (Demo)", betrag: "3500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-30", status: "bestaetigt", kategorie_id: "KAT-001", erstellt_am: "2026-06-02", bemerkung: "Demo" },
    { regelzahlung_id: "RZ-002", bezeichnung: "Miete (Demo)", betrag: "-1200.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt", kategorie_id: "KAT-002", erstellt_am: "2026-06-02", bemerkung: "Demo" },
    { regelzahlung_id: "RZ-003", bezeichnung: "Handyvertrag (Demo)", betrag: "-29.99", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2025-07-01", aktiv_bis: "2027-07-01", status: "vorgeschlagen", kategorie_id: "KAT-007", erstellt_am: "2026-06-02", bemerkung: "Demo, Vorschlag" },
  ],
```

- [ ] **Step 3: main.js — Import + Daten-Guard**

In `app/main.js` ganz oben (vor `const data = ...`) einfügen:

```js
import { computeCashflowIst, computeCashflowPrognose } from "./cashflow.mjs";
```

In `app/main.js` nach `const data = window.FINANCE_REVIEW_DATA;` (Zeile 1) ergänzen:

```js
data.regelzahlungen = data.regelzahlungen ?? [];
```

- [ ] **Step 4: node --check**

Run: `node --check app/main.js && node --check app/cashflow.mjs && node --check app/review-data.js`
Expected: kein Output (Syntax ok).

- [ ] **Step 5: Preview — App lädt ohne Fehler**

- Server starten: `preview_start` (Server `finanz-app` aus `.claude/launch.json`).
- `preview_console_logs` prüfen: **keine** Fehler (insb. kein Modul-/CORS-/`is not defined`-Fehler).
- `preview_snapshot`: Übersicht rendert wie zuvor (Regression-Check, dass die Modul-Umstellung nichts bricht).

Bei Fehler: Quellcode lesen, fixen, ab Step 4 wiederholen.

- [ ] **Step 6: Commit**

```bash
git add app/index.html app/review-data.js app/main.js
git commit -m "feat(m4): App als ES-Modul, Regelzahlungen im Review-Bundle (ADR 0012)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Cashflow-View + Navigation + Qualitäts-Chips + i18n

Kein Node-Unit-Test (Browser-only) → Verifikation per `node --check` + Claude-Preview.

**Files:**
- Modify: `app/i18n.js`
- Modify: `app/main.js`

- [ ] **Step 1: i18n — Keys ergänzen (de UND en)**

In `app/i18n.js`, im **de**-Block: in `nav` ergänzen `cashflow: "Cashflow",` und nach dem `transactions`-Abschnitt einen neuen Abschnitt einfügen:

```js
    cashflow: {
      title: "Cashflow",
      lead: "Monats-Ist aus Transaktionen und Prognose aus bestätigten Regelzahlungen.",
      ist: "Cashflow-Ist (bis heute)",
      prognose: "Cashflow-Prognose",
      monthlyTable: "Monatsverlauf",
      month: "Monat",
      net: "Netto",
      horizonTo: "Horizont bis",
      qualityConfirmed: "bestätigte Regelzahlungen",
      qualityProposalsExcluded: "Vorschläge nicht enthalten",
      qualityOpenCategories: "Buchungen mit offener Kategorie",
      incompleteNote: "Enthält nur wiederkehrende Zahlungen. Einmalige Ereignisse (z. B. Versicherungsleistung, ab M7) und Szenarien (ab M6) sind nicht berücksichtigt.",
      empty: "Keine bestätigten Regelzahlungen — Prognose leer.",
    },
```

Im **en**-Block dieselben Schlüssel mit englischen Werten (`nav.cashflow: "Cashflow"`):

```js
    cashflow: {
      title: "Cash flow",
      lead: "Monthly actuals from transactions and a forecast from confirmed recurring payments.",
      ist: "Actual cash flow (to date)",
      prognose: "Cash flow forecast",
      monthlyTable: "Monthly breakdown",
      month: "Month",
      net: "Net",
      horizonTo: "Horizon until",
      qualityConfirmed: "confirmed recurring payments",
      qualityProposalsExcluded: "proposals not included",
      qualityOpenCategories: "bookings with open category",
      incompleteNote: "Only recurring payments. One-off events (e.g. insurance payout, from M7) and scenarios (from M6) are not included.",
      empty: "No confirmed recurring payments — forecast empty.",
    },
```

- [ ] **Step 2: main.js — Nav-Eintrag**

In `app/main.js` im `navItems`-Array nach der `transactions`-Zeile ergänzen:

```js
  ["cashflow", "nav.cashflow", "€"],
```

(Unicode-Glyph konsistent zum Bestand; geht in die bekannte Glyph→SVG-Sammelaufgabe #5 ein.)

- [ ] **Step 3: main.js — View-Dispatch**

In `app/main.js`, in `renderView()` (bei den `if (state.view === ...)`-Zeilen) ergänzen:

```js
  if (state.view === "cashflow") return renderCashflow();
```

- [ ] **Step 4: main.js — renderCashflow + Hilfsfunktion**

In `app/main.js` vor `function renderMasterdata()` einfügen:

```js
function heuteIso() {
  return new Date().toISOString().slice(0, 10);
}

function renderMonatsTabelle(monate) {
  if (monate.length === 0) return "";
  return `
    <table class="data-table">
      <thead><tr><th>${escapeHtml(t("cashflow.month"))}</th><th class="amount">${escapeHtml(t("cashflow.net"))}</th></tr></thead>
      <tbody>
        ${monate.map((m) => `<tr><td>${escapeHtml(m.monat)}</td><td class="amount">${escapeHtml(formatMoney(m.netto_cents))}</td></tr>`).join("")}
      </tbody>
    </table>`;
}

function renderCashflow() {
  const today = heuteIso();
  const ist = computeCashflowIst(data.transaktionen, { today });
  const prognose = computeCashflowPrognose(data.regelzahlungen, { today });

  return `
    ${renderPageHead(t("cashflow.title"), t("cashflow.lead"))}
    <div class="tile-grid">
      <div class="tile tile-static">
        <span class="tile-label">${escapeHtml(t("cashflow.ist"))}</span>
        <div class="count">${escapeHtml(formatMoney(ist.gesamt_netto_cents))}</div>
        <span class="chip ${ist.qualitaet.offene_kategorie_anzahl > 0 ? "review" : "success"}">
          <span>${ist.qualitaet.offene_kategorie_anzahl > 0 ? "?" : "✓"}</span>
          ${ist.qualitaet.offene_kategorie_anzahl} ${escapeHtml(t("cashflow.qualityOpenCategories"))}
        </span>
      </div>
      <div class="tile tile-static">
        <span class="tile-label">${escapeHtml(t("cashflow.prognose"))}</span>
        <div class="count">${escapeHtml(formatMoney(prognose.gesamt_netto_cents))}</div>
        <span class="chip neutral"><span>•</span>${prognose.qualitaet.bestaetigte_regelzahlungen} ${escapeHtml(t("cashflow.qualityConfirmed"))}</span>
        ${prognose.qualitaet.vorschlaege_nicht_enthalten > 0 ? `<span class="chip review"><span>?</span>${prognose.qualitaet.vorschlaege_nicht_enthalten} ${escapeHtml(t("cashflow.qualityProposalsExcluded"))}</span>` : ""}
        <span class="chip neutral"><span>•</span>${escapeHtml(t("cashflow.horizonTo"))} ${escapeHtml(prognose.horizont_ende)}</span>
      </div>
    </div>
    <p class="page-lead">${escapeHtml(t("cashflow.incompleteNote"))}</p>
    <section class="rail">
      <h2 class="section-title">${escapeHtml(t("cashflow.ist"))} · ${escapeHtml(t("cashflow.monthlyTable"))}</h2>
      ${renderMonatsTabelle(ist.monate)}
    </section>
    <section class="rail">
      <h2 class="section-title">${escapeHtml(t("cashflow.prognose"))} · ${escapeHtml(t("cashflow.monthlyTable"))}</h2>
      ${prognose.monate.length > 0 ? renderMonatsTabelle(prognose.monate) : `<p class="page-lead">${escapeHtml(t("cashflow.empty"))}</p>`}
    </section>`;
}
```

> **Hinweis für den Implementer:** Prüfe vor dem Schreiben die tatsächlichen CSS-Klassennamen in `app/styles.css` und bestehende Render-Helfer in `app/main.js` (z. B. `renderPageHead`, `tile-static`, `tile-label`, `count`, `chip`, `data-table`, `rail`, `section-title`). Verwende die real existierenden Klassen; passe Markup an den Bestand an, statt neue Klassen zu erfinden. Falls `tile-label`/`data-table` nicht existieren, nimm die im Checks-/Overview-View verwendeten Äquivalente.

- [ ] **Step 5: node --check**

Run: `node --check app/main.js && node --check app/i18n.js`
Expected: kein Output.

- [ ] **Step 6: Preview — Cashflow-View verifizieren**

- `preview_start` (bzw. reload; bei CSS-Caching Stylesheet cache-gebustet neu laden).
- `preview_console_logs`: keine Fehler.
- `preview_click` auf den Cashflow-Nav-Eintrag, dann `preview_snapshot`: Ist-Kachel, Prognose-Kachel, Qualitäts-Chips (inkl. „1 Vorschläge nicht enthalten" wegen RZ-003), Unvollständigkeits-Hinweis und beide Monatstabellen sichtbar.
- `preview_screenshot` als Beleg.
- Sprache auf EN umschalten, erneut `preview_snapshot`: Keys übersetzt, keine rohen `cashflow.*`-Schlüssel sichtbar.

Bei Problemen: Quelle lesen, fixen, ab Step 5 wiederholen.

- [ ] **Step 7: Commit**

```bash
git add app/i18n.js app/main.js
git commit -m "feat(m4): Cashflow-View mit Ist/Prognose und Qualitäts-Chips

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Regelzahlungs-Agent-Skill + Doku

**Files:**
- Create: `docs/skills/regelzahlung-agent.md`
- Modify: `app/README.md`
- Modify: `docs/skills/import-agent.md`

- [ ] **Step 1: Regelzahlungs-Agent-Skill schreiben**

Create `docs/skills/regelzahlung-agent.md`:

```markdown
# Skill: Regelzahlungs-Agent

Stand: M4. Erkennung, Vorschlag und Bestätigung wiederkehrender Zahlungen.

## Session-Start-Pflicht

**Zu Beginn jeder Session** `data/master/regelzahlungen.json` auf `status = "vorgeschlagen"` prüfen und offene Vorschläge **aktiv** melden:
„Es liegen N Regelzahlungsvorschläge zur Bestätigung vor: …". Die App ist nur Anzeige (ADR 0006) — der Agent ist der einzige Änderungskanal, also muss der Agent erinnern.

## Kontext, den du kennen musst

- `CONTEXT.md`: Einträge **Regelzahlung**, **Cashflow-Ist**, **Cashflow-Prognose**, **Status und Lebenszyklus**.
- `docs/adr/0010` (Erkennung = Agent-Urteil, Prognose = deterministisches Modul).
- `docs/adr/0011` (Prognose regelzahlungsbasiert + Unvollständigkeit gekennzeichnet).
- `schemas/regelzahlungen.schema.json`.

## Erkennen (Agent-Urteil, ADR 0010)

Du erkennst Muster in `data/master/transaktionen.jsonl` mit Kontextwissen — kein Tool errät Regelmäßigkeit. Zyklus über `rhythmus_einheit ∈ {tag, woche, monat, jahr}` + `rhythmus_intervall` (monatlich = monat/1, quartalsweise = monat/3, 14-tägig = woche/2, jährlich = jahr/1). Erwartete Höhe als **vorzeichenbehafteter** Decimal-String (negativ = Ausgabe).

## Zwei Entstehungspfade (ein Status-Feld)

- **Aus Transaktionen erkanntes Muster** → `status = "vorgeschlagen"`. Wartet auf Nutzerbestätigung.
- **Vom Nutzer diktiertes Faktum** („ab … senke ich meine Sparrate um xxx") → direkt `status = "bestaetigt"`. Die Aussage ist die Bestätigung.

## Stufenänderung = zwei Regelzahlungen

Bekannte Änderung einer laufenden Zahlung (z. B. Gehalt ab 60 halbiert): alte Regelzahlung mit `aktiv_bis` = Tag vor Stichtag, neue mit `anker_datum` = Stichtag. **Kein** Szenario (das wäre M6), **kein** Einmaleffekt (das wäre M7).

## Do's

- Vor jedem Schreiben `tools/validator.mjs` aufrufen (Tool prüft, Agent schreibt).
- Geschriebene/bestätigte Regelzahlungen sowohl in `data/master/regelzahlungen.json` pflegen **als auch** ins Review-Bundle `app/review-data.js` (`regelzahlungen`-Array) übernehmen, damit die App den aktuellen Stand zeigt.
- Offene Vorschläge zu Session-Beginn melden (s. o.).

## Don'ts

- **Keine Einmaleffekte als Regelzahlung** modellieren (LV-Auszahlung etc.) — gehört nach M7.
- **Keine hypothetischen Szenarien** als bestätigte Regelzahlung — gehört nach M6.
- **Keinen Vorschlag still bestätigen** — Bestätigung ist immer eine Nutzerentscheidung.
- **Keine Bandbreiten/Werktagslogik** erfinden — M4 kennt nur Punktbetrag + {einheit, intervall} + optional `aktiv_bis`.

## Wo was liegt

| Pfad | Zweck |
| --- | --- |
| `data/master/regelzahlungen.json` | Regelzahlungs-Stammdaten |
| `app/review-data.js` | Review-Bundle (App-Anzeige) |
| `app/cashflow.mjs` | Deterministische Cashflow-Mathematik (Browser + Node) |
| `schemas/regelzahlungen.schema.json` | Schema-Referenz |
| `tools/validator.mjs` | Validator (vor jedem Schreiben) |
```

- [ ] **Step 2: app/README.md — Webserver-only-Hinweis**

In `app/README.md` einen Abschnitt ergänzen (am Ende):

```markdown
## Betriebsmodus

Ab M4 läuft die App **nur über einen lokalen Webserver** (Synology Web Station bzw. lokaler Preview-Server), nicht mehr per `file://`-Doppelklick: `main.js` ist ein ES-Modul und importiert `cashflow.mjs`; Browser blockieren ES-Module unter `file://`. Hintergrund: ADR 0008 (Webserver zulässig), ADR 0009 (Zugriffsschutz LAN), ADR 0012 (App als ES-Modul).
```

- [ ] **Step 3: import-agent.md — Querverweis aktualisieren**

In `docs/skills/import-agent.md`, im Abschnitt „Verwandte Skills", die Zeile

```markdown
- **regelzahlungserkennung** (ab M4) — wiederkehrende Buchungen als Regelzahlungen markieren.
```

ersetzen durch:

```markdown
- **regelzahlung-agent** (M4, `docs/skills/regelzahlung-agent.md`) — wiederkehrende Buchungen als Regelzahlungen erkennen, vorschlagen, bestätigen.
```

- [ ] **Step 4: Gesamt-Verifikation**

Run:
```bash
npm test
npm run validate:m1
node --check app/main.js && node --check app/cashflow.mjs && node --check app/i18n.js && node --check app/review-data.js
```
Expected: alle Tests grün, `M1 validation passed`, keine Syntaxfehler.

- [ ] **Step 5: Commit**

```bash
git add docs/skills/regelzahlung-agent.md app/README.md docs/skills/import-agent.md
git commit -m "docs(m4): Regelzahlungs-Agent-Skill + Webserver-only-Hinweis

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Exit-Kriterien-Abdeckung (Self-Review)

| M4-Exit-Kriterium | Task |
| --- | --- |
| Regelzahlungsvorschläge von bestätigten getrennt (ein Datensatz, Status-Feld) | Task 1 (Schema `status`), Task 4 (nur `bestaetigt` projiziert) |
| Cashflow-Ist basiert auf Transaktionen | Task 3 |
| Cashflow-Prognose kennzeichnet unbestätigte Annahmen + Unvollständigkeit | Task 4 (Qualitätszähler), Task 6 (`incompleteNote`, Chips) |
| Dashboard zeigt Datenqualität neben Kennzahlen (faktische Zähler) | Task 6 (Qualitäts-Chips) |
| Regelzahlungs-Agent-Skill + aktive Meldung offener Vorschläge | Task 7 |

## Offene Annahmen / bewusst draußen

- Kein `konto_id` an der Regelzahlung in M4 (YAGNI; Prognose ist konto-aggregiert). Bei Bedarf später nachrüstbar.
- Kein Reconciliation Ist↔erwartet (→ M8), keine Einmaleffekte (→ M7), keine Szenarien (→ M6).
- Horizont-Steuerung im UI (Slider o. ä.) ist M9; in M4 ist der Horizont der per `defaultHorizonEnd` berechnete Boden.
- Unicode-Nav-Glyph `€` geht in die bestehende Glyph→SVG-Sammelaufgabe (#5) ein.
```

# Regel-Provenance & Regelansicht — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kategorisierungsregeln in der App ansehen und nachvollziehen (Wirkung, getroffene Transaktionen, Konflikte), Herkunft (`regel`/`manuell`) sichtbar machen und Regeln verständlich (Klartext + Beispiele) statt technokratisch darstellen.

**Architecture:** Die Zuordnung Transaktion→Regel wird beim Kategorisieren als `matched_regeln` gespeichert (nicht bei Anzeige live nachgerechnet). Die App invertiert dieses Feld in einem memoisierten Selektor zu Regel→Transaktionen; Treffer-Counts werden im Selektor aggregiert, nicht persistiert. Erklärbarkeit entsteht aus einem deterministischen Klartext-Helfer + echten Beispiel-Gegenparteien + Pflicht-`kommentar`.

**Tech Stack:** Vanilla ESM (`type: module`), nativer `node --test`, kein Build, keine Dependencies. Browser-Module unter `app/`, Tools unter `app/tools/`, Tests unter `tests/`.

**Datenhinweis:** `app/data/master/*` ist gitignored (Echtdaten). Daten-Migrationen (Kommentar-Bereinigung, Backfill) sind lokale Einmal-Operationen und werden **nicht** committet. Nur Quellcode/Schemas/Docs werden committet.

---

## Dateiübersicht

**Tooling / Daten-Vertrag (committet):**
- `app/schemas/transaktionen.schema.json` — `matched_regeln` ergänzen
- `app/schemas/kategorisierungsregeln.schema.json` — `kommentar` required
- `app/tools/validate-core.mjs` — Feld + Required + Cross-Field-Invariante
- `app/tools/import.mjs` — `matched_regeln` schreiben
- `app/tools/recategorize.mjs` — `matched_regeln` stempeln/pflegen

**App (committet):**
- `app/data-loader.mjs` — Regeln laden
- `app/selektoren.mjs` — `regelWirkung()`
- `app/komponenten.mjs` — `regelKlartext()`, `herkunftLabel()`
- `app/routing.mjs` — Route `#/regeln/REG-…`
- `app/views/stammdaten.mjs` — Kachel „Regeln", Liste, Regel-Detail
- `app/views/transaktionen.mjs` — Herkunft in Detail-Rail + Tabelle + Filter
- `app/main.js` — Klick-/Routing-Verdrahtung
- `app/i18n.js` — neue Labels

**Docs (committet):**
- `app/docs/agent-context.md`, `app/docs/skills/{import-agent,kategorisierung-review,kategorisierungsregel-pflege,validierung-agent}.md`
- `docs/adr/0018-regel-provenance-und-erklaerbarkeit.md`

**Lokale Daten-Migration (NICHT committet):**
- `app/data/master/kategorisierungsregeln.json` — 64 Auto-Kommentare bereinigen
- `app/data/master/transaktionen.jsonl` — Backfill via recategorize

---

## Phase 1 — Provenance in Daten & Tooling

### Task 1: `matched_regeln` im Datenvertrag

**Files:**
- Modify: `app/schemas/transaktionen.schema.json`
- Modify: `app/tools/validate-core.mjs:50-86` (transaktionen-Schema)
- Test: `tests/m1-validator.test.mjs`

- [ ] **Step 1: Failing-Test schreiben** — in `tests/m1-validator.test.mjs` ergänzen:

```javascript
test("matched_regeln akzeptiert ein Array von REG-IDs", () => {
  const data = baseValidData();
  data.transaktionen[0].matched_regeln = ["REG-001", "REG-042"];
  const result = validateMasterData(data);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("matched_regeln mit ungueltiger ID wird abgelehnt", () => {
  const data = baseValidData();
  data.transaktionen[0].matched_regeln = ["REG-1"]; // falsches Format
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
});
```

Falls `baseValidData()` noch nicht existiert, stattdessen den vorhandenen Fixture-Lademechanismus der Datei nutzen (am Dateikopf prüfen, wie `validateMasterData` dort schon aufgerufen wird) und ein gültiges Transaktionsobjekt um `matched_regeln` erweitern.

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node --test tests/m1-validator.test.mjs`
Expected: FAIL — `matched_regeln: unbekanntes Feld`.

- [ ] **Step 3: Schema-JSON ergänzen** — in `app/schemas/transaktionen.schema.json` bei `properties` ergänzen:

```json
      "matched_regeln": { "type": "array", "items": { "type": "string", "pattern": "^REG-\\d{3}$" } },
```

- [ ] **Step 4: Validator-Inline-Schema ergänzen** — in `app/tools/validate-core.mjs` im `transaktionen.fields`-Block (nach `kategorie_herkunft`) ergänzen:

```javascript
      matched_regeln: { type: "array", itemPattern: /^REG-\d{3}$/ },
```

- [ ] **Step 5: Test laufen lassen, Erfolg prüfen**

Run: `node --test tests/m1-validator.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/schemas/transaktionen.schema.json app/tools/validate-core.mjs tests/m1-validator.test.mjs
git commit -m "feat: matched_regeln in Transaktions-Datenvertrag"
```

---

### Task 2: Import speichert `matched_regeln`

**Files:**
- Modify: `app/tools/import.mjs:94-99`
- Test: `tests/m3-import.test.mjs`

- [ ] **Step 1: Failing-Test schreiben** — in `tests/m3-import.test.mjs` ergänzen. Muster der vorhandenen Tests übernehmen (sie rufen die Import-Funktion mit Zeilen + Regeln auf). Zwei Fälle:

```javascript
test("Import schreibt matched_regeln bei eindeutigem Regel-Treffer", () => {
  // Arrange: eine Zeile, die genau eine Regel trifft (z.B. gegenpartei 'MusterladenB'),
  // Regelwerk mit REG-001 gegenpartei_pattern 'musterladenb' -> KAT-003.
  // Act: importiere.
  // Assert:
  assert.deepEqual(tx.matched_regeln, ["REG-001"]);
  assert.equal(tx.kategorie_herkunft, "regel");
});

test("Import schreibt matched_regeln auch bei Regel-Konflikt (offen)", () => {
  // Arrange: Zeile trifft REG-A (->KAT-003) und REG-B (->KAT-017).
  // Assert:
  assert.equal(tx.kategorisierung_status, "offen");
  assert.equal(tx.kategorie_id, undefined);
  assert.deepEqual(tx.matched_regeln.sort(), ["REG-A", "REG-B"].sort());
});
```

Die genaue Arrange-Struktur an die bestehenden Tests in der Datei angleichen (gleiche Helper/Signaturen verwenden).

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node --test tests/m3-import.test.mjs`
Expected: FAIL — `tx.matched_regeln` ist `undefined`.

- [ ] **Step 3: Implementierung** — in `app/tools/import.mjs` direkt **nach** dem `if (verdict.kategorie_id) { … }`-Block (nach Zeile 99), aber **vor** der `optionalTransactionFields`-Schleife einfügen:

```javascript
    // Regel-Provenance: alle treffenden Regeln merken (auch bei Konflikt ohne
    // Kategorie), damit Wirkung und Konflikte ohne Live-Re-Derivation sichtbar sind.
    if (verdict.matched_regeln.length) {
      transaktion.matched_regeln = verdict.matched_regeln;
    }
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `node --test tests/m3-import.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/tools/import.mjs tests/m3-import.test.mjs
git commit -m "feat: Import speichert matched_regeln (Treffer und Konflikt)"
```

---

### Task 3: Recategorize stempelt und pflegt `matched_regeln`

**Files:**
- Modify: `app/tools/recategorize.mjs:21-58`
- Test: `tests/recategorize.test.mjs`

- [ ] **Step 1: Failing-Tests schreiben** — in `tests/recategorize.test.mjs` ergänzen:

```javascript
test("recategorize stempelt matched_regeln auf neu vorgeschlagene Buchung", () => {
  const regeln = [{ regel_id: "REG-001", gegenpartei_pattern: "musterladenb", kategorie_id: "KAT-003", status: "aktiv" }];
  const tx = { transaktion_id: "TXN-x", kategorisierung_status: "offen", gegenpartei: "MusterladenB Markt", verwendungszweck: "" };
  const out = recategorize({ transaktionen: [tx], regeln });
  assert.deepEqual(out.transaktionen[0].matched_regeln, ["REG-001"]);
});

test("recategorize stempelt Konflikt-Regeln auf offene Buchung", () => {
  const regeln = [
    { regel_id: "REG-001", gegenpartei_pattern: "shop", kategorie_id: "KAT-003", status: "aktiv" },
    { regel_id: "REG-002", gegenpartei_pattern: "shop", kategorie_id: "KAT-017", status: "aktiv" },
  ];
  const tx = { transaktion_id: "TXN-y", kategorisierung_status: "offen", gegenpartei: "Shop", verwendungszweck: "" };
  const out = recategorize({ transaktionen: [tx], regeln });
  assert.equal(out.transaktionen[0].kategorisierung_status, "offen");
  assert.deepEqual(out.transaktionen[0].matched_regeln.sort(), ["REG-001", "REG-002"]);
});

test("recategorize laesst manuell unangetastet (kein matched_regeln)", () => {
  const regeln = [{ regel_id: "REG-001", gegenpartei_pattern: "musterladenb", kategorie_id: "KAT-003", status: "aktiv" }];
  const tx = { transaktion_id: "TXN-z", kategorisierung_status: "bestaetigt", kategorie_herkunft: "manuell", kategorie_id: "KAT-099", gegenpartei: "MusterladenB", verwendungszweck: "" };
  const out = recategorize({ transaktionen: [tx], regeln });
  assert.equal(out.transaktionen[0].matched_regeln, undefined);
});

test("recategorize entfernt veraltete Quelle bei bestaetigt ohne aktuellen Treffer", () => {
  const regeln = [];
  const tx = { transaktion_id: "TXN-w", kategorisierung_status: "bestaetigt", kategorie_herkunft: "regel", kategorie_id: "KAT-003", matched_regeln: ["REG-001"], gegenpartei: "Alt", verwendungszweck: "" };
  const out = recategorize({ transaktionen: [tx], regeln });
  assert.equal(out.transaktionen[0].matched_regeln, undefined);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node --test tests/recategorize.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implementierung** — in `app/tools/recategorize.mjs` die Helfer ersetzen/ergänzen:

`alsRegelVorschlag` neu (bekommt das ganze Verdict):

```javascript
function alsRegelVorschlag(tx, verdict) {
  return { ...tx, kategorisierung_status: "vorgeschlagen", kategorie_id: verdict.kategorie_id, kategorie_herkunft: "regel", matched_regeln: verdict.matched_regeln };
}
```

`alsOffen` neu (Konflikt-Regeln behalten, sonst Provenance entfernen):

```javascript
function alsOffen(tx, verdict) {
  const { kategorie_id, kategorie_herkunft, matched_regeln, ...rest } = tx;
  if (verdict.matched_regeln.length) return { ...rest, kategorisierung_status: "offen", matched_regeln: verdict.matched_regeln };
  return { ...rest, kategorisierung_status: "offen" };
}
```

Helfer für „bestaetigt bleibt, aber Provenance pflegen":

```javascript
// Nur eine eindeutige, mit der bestaetigten Kategorie konsistente Trefferliste
// ist eine gueltige Quelle. Sonst Quelle entfernen ("nicht mehr ermittelbar").
function stampeKonsistenteQuelle(tx, verdict) {
  if (verdict.status === "vorgeschlagen" && verdict.kategorie_id === tx.kategorie_id) {
    return { ...tx, matched_regeln: verdict.matched_regeln };
  }
  const { matched_regeln, ...rest } = tx;
  return rest;
}
```

`recompute` neu:

```javascript
function recompute(tx, regeln) {
  const verdict = categorize(tx, regeln);
  const treffer = verdict.status === "vorgeschlagen";

  if (tx.kategorisierung_status === "bestaetigt") {
    if (treffer && verdict.kategorie_id !== tx.kategorie_id) {
      return alsRegelVorschlag(tx, verdict);
    }
    return stampeKonsistenteQuelle(tx, verdict);
  }

  if (treffer) return alsRegelVorschlag(tx, verdict);

  // Kein eindeutiger Treffer. War schon offen ohne Kategorie: nur Konflikt-Quelle
  // pflegen (Buchung nicht sinnlos neu schreiben, aber Konflikt sichtbar machen).
  if (tx.kategorisierung_status === "offen" && !Object.hasOwn(tx, "kategorie_id")) {
    if (verdict.matched_regeln.length) return { ...tx, matched_regeln: verdict.matched_regeln };
    const { matched_regeln, ...rest } = tx;
    return matched_regeln ? rest : tx;
  }
  return alsOffen(tx, verdict);
}
```

`changed` neu (Array-Vergleich ergänzen):

```javascript
function sameRegeln(a, b) {
  const xa = a ?? [];
  const xb = b ?? [];
  return xa.length === xb.length && xa.every((id, i) => id === xb[i]);
}

function changed(a, b) {
  return a.kategorisierung_status !== b.kategorisierung_status
    || a.kategorie_id !== b.kategorie_id
    || a.kategorie_herkunft !== b.kategorie_herkunft
    || !sameRegeln(a.matched_regeln, b.matched_regeln);
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `node --test tests/recategorize.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/tools/recategorize.mjs tests/recategorize.test.mjs
git commit -m "feat: recategorize pflegt matched_regeln (Treffer/Konflikt/Quelle)"
```

---

### Task 4: Cross-Field-Invariante für `matched_regeln`

**Files:**
- Modify: `app/tools/validate-core.mjs:296-345` (`validateCrossFieldRules`)
- Test: `tests/m1-validator.test.mjs`

- [ ] **Step 1: Failing-Tests schreiben** — in `tests/m1-validator.test.mjs`:

```javascript
test("matched_regeln auf manueller Buchung ist ungueltig", () => {
  const data = baseValidData();
  const tx = data.transaktionen[0];
  tx.kategorie_herkunft = "manuell";
  tx.kategorie_id = "KAT-003";
  tx.kategorisierung_status = "bestaetigt";
  tx.matched_regeln = ["REG-001"];
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
});

test("matched_regeln muss auf existierende Regeln zeigen", () => {
  const data = baseValidData();
  data.kategorisierungsregeln = [{ regel_id: "REG-001", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-01-01", kommentar: "x" }];
  data.transaktionen[0].matched_regeln = ["REG-999"];
  data.transaktionen[0].kategorie_herkunft = "regel";
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node --test tests/m1-validator.test.mjs`
Expected: FAIL (beide neuen Tests sind grün, obwohl sie rot sein sollten → noch keine Prüfung).

- [ ] **Step 3: Implementierung** — in `validateCrossFieldRules` (vor dem schließenden `}`) ergänzen:

```javascript
  const regelIds = new Set((data.kategorisierungsregeln ?? []).map((r) => r.regel_id));
  data.transaktionen?.forEach((tx) => {
    if (!Object.hasOwn(tx, "matched_regeln")) return;
    if (tx.kategorie_herkunft === "manuell") {
      errors.push(`transaktionen.${tx.transaktion_id}.matched_regeln: nicht erlaubt bei manueller Herkunft`);
    }
    if (tx.kategorisierung_status === "abgelehnt") {
      errors.push(`transaktionen.${tx.transaktion_id}.matched_regeln: nicht erlaubt bei abgelehnt`);
    }
    for (const id of tx.matched_regeln) {
      if (!regelIds.has(id)) {
        errors.push(`transaktionen.${tx.transaktion_id}.matched_regeln: ${id} existiert nicht`);
      }
    }
  });
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `node --test tests/m1-validator.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/tools/validate-core.mjs tests/m1-validator.test.mjs
git commit -m "feat: Invariante matched_regeln nur bei regel/offen, existierende REG"
```

---

## Phase 2 — Erklärbarkeit im Datenvertrag

### Task 5: `kommentar` wird Pflicht

**Files:**
- Modify: `app/schemas/kategorisierungsregeln.schema.json`
- Modify: `app/tools/validate-core.mjs:171` (`kategorisierungsregeln.required`)
- Test: `tests/m1-validator.test.mjs`

- [ ] **Step 1: Failing-Test schreiben**:

```javascript
test("Regel ohne kommentar ist ungueltig", () => {
  const data = baseValidData();
  data.kategorisierungsregeln = [{ regel_id: "REG-001", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-01-01" }];
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node --test tests/m1-validator.test.mjs`
Expected: FAIL (Regel ohne kommentar gilt noch als gültig).

- [ ] **Step 3: Schema-JSON** — in `app/schemas/kategorisierungsregeln.schema.json` `required` ändern auf:

```json
    "required": ["regel_id", "kategorie_id", "status", "erstellt_am", "kommentar"],
```

und das `kommentar`-Property auf nicht-leer:

```json
      "kommentar": { "type": "string", "minLength": 1 }
```

- [ ] **Step 4: Validator-Inline** — in `app/tools/validate-core.mjs` `kategorisierungsregeln.required` ändern auf:

```javascript
    required: ["regel_id", "kategorie_id", "status", "erstellt_am", "kommentar"],
```

und `kommentar`-Feld:

```javascript
      kommentar: { type: "string", minLength: 1 },
```

- [ ] **Step 5: Test laufen lassen, Erfolg prüfen**

Run: `node --test tests/m1-validator.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/schemas/kategorisierungsregeln.schema.json app/tools/validate-core.mjs tests/m1-validator.test.mjs
git commit -m "feat: kommentar ist Pflichtfeld jeder Kategorisierungsregel"
```

---

### Task 6: Auto-Kommentare bereinigen (lokale Daten-Migration, NICHT committen)

**Files:**
- Modify (lokal): `app/data/master/kategorisierungsregeln.json`

- [ ] **Step 1: Betroffene Regeln auflisten**

Run:
```bash
node -e 'const d=require("./app/data/master/kategorisierungsregeln.json");for(const r of d){const k=(r.kommentar||"");if(/abgeleitet/i.test(k)||/^inhalts-regel/i.test(k))console.log(r.regel_id, JSON.stringify(r.gegenpartei_pattern||r.verwendungszweck_pattern), "->", r.kategorie_id, "|", JSON.stringify(k));}'
```
Expected: ~64 Zeilen.

- [ ] **Step 2: Klartext-Kommentare formulieren** — pro Regel den `kommentar` so umschreiben, dass er den *Zweck* in Alltagssprache nennt (was wird erkannt, warum diese Kategorie), kein Pattern-Restatement. Beispiel: `"Inhalts-Regel (abgeleitet): \"restaurant\" -> KAT-017"` → `"Restaurantbesuche (Verwendungszweck/Name enthält \"restaurant\") -> Essen gehen"`. Die Zielkategorie über `app/data/master/kategorien.json` nachschlagen, damit der Klartext den echten Kategorie-Namen nennt.

- [ ] **Step 3: Datei schreiben** — `app/data/master/kategorisierungsregeln.json` mit den überarbeiteten Kommentaren speichern (Struktur sonst unverändert, KAT-012 „Noch zu klären" bleibt unberührt).

- [ ] **Step 4: Validieren**

Run: `node app/tools/validator.mjs app/data/master`
Expected: keine `kommentar`-Fehler.

- [ ] **Step 5: Kein Commit** — Datei ist gitignored. Stattdessen prüfen:

Run: `git status --porcelain app/data/master/kategorisierungsregeln.json`
Expected: leere Ausgabe (ignoriert).

---

## Phase 3 — Backfill (lokale Daten-Migration, NICHT committen)

### Task 7: Bestand einmalig stempeln

**Files:**
- Modify (lokal): `app/data/master/transaktionen.jsonl`

- [ ] **Step 1: Vorzustand festhalten**

Run:
```bash
node -e 'const fs=require("fs");const n=fs.readFileSync("app/data/master/transaktionen.jsonl","utf8").trim().split("\n").map(JSON.parse).filter(t=>t.matched_regeln).length;console.log("mit matched_regeln vorher:",n)'
```
Expected: `0`.

- [ ] **Step 2: Recategorize laufen lassen**

Run: `node app/tools/recategorize.mjs`
Expected: JSON-Report (neu_vorgeschlagen/wiedervorlage/zurueckgesetzt/unveraendert/uebersprungen); kein Validierungsfehler.

- [ ] **Step 3: Nachzustand prüfen**

Run:
```bash
node -e 'const fs=require("fs");const t=fs.readFileSync("app/data/master/transaktionen.jsonl","utf8").trim().split("\n").map(JSON.parse);console.log("regel+matched:",t.filter(x=>x.kategorie_herkunft==="regel"&&x.matched_regeln).length);console.log("manuell+matched (muss 0):",t.filter(x=>x.kategorie_herkunft==="manuell"&&x.matched_regeln).length)'
```
Expected: viele `regel+matched`, `manuell+matched` = `0`.

- [ ] **Step 4: Validieren** — `node app/tools/validator.mjs app/data/master` → grün. Kein Commit (gitignored).

---

## Phase 4 — App: Laden & Wirkungs-Selektor

### Task 8: Regeln laden

**Files:**
- Modify: `app/data-loader.mjs:36-81`
- Test: `tests/data-loader.test.mjs`

- [ ] **Step 1: Failing-Test schreiben** — prüfen, wie `tests/data-loader.test.mjs` `loadFinanceData`/`fetch` mockt, und einen Test ergänzen, der bestätigt, dass `kategorisierungsregeln` geladen und im Ergebnis enthalten ist:

```javascript
test("loadFinanceData liefert kategorisierungsregeln", async () => {
  // fetch-Mock so erweitern, dass ./data/master/kategorisierungsregeln.json
  // ein Array mit einer Regel zurueckgibt.
  const data = await loadFinanceData();
  assert.ok(Array.isArray(data.kategorisierungsregeln));
});
```

Wenn der vorhandene Test eine exakte Schlüsselmenge des Rückgabeobjekts prüft, diese Erwartung um `kategorisierungsregeln` erweitern.

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node --test tests/data-loader.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implementierung** — in `app/data-loader.mjs`:
  1. Destrukturierungsliste und `Promise.all` um eine Position erweitern:

```javascript
    vermoegenswerte,
    zeitwerte,
    kategorisierungsregeln,
  ] = await Promise.all([
    // … bestehende Einträge …
    loadJsonl("./data/master/zeitwerte.jsonl", { refreshToken }),
    loadJson("./data/master/kategorisierungsregeln.json", { refreshToken }),
  ]);
```

  2. Im Rückgabeobjekt ergänzen (nach `zeitwerte,`):

```javascript
    kategorisierungsregeln,
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `node --test tests/data-loader.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/data-loader.mjs tests/data-loader.test.mjs
git commit -m "feat: Kategorisierungsregeln in den App-Bestand laden"
```

---

### Task 9: Selektor `regelWirkung()`

**Files:**
- Modify: `app/selektoren.mjs`
- Test: `tests/selektoren-regelwirkung.test.mjs` (neu)

`regelWirkung()` invertiert `matched_regeln` über alle Transaktionen zu einer Map `regel_id -> { transaktionen, anzahl }` und memoisiert über eine Referenz auf das geladene `data.transaktionen`-Array (neu berechnen, wenn sich die Array-Referenz ändert — `data` wird beim Reload neu zugewiesen).

- [ ] **Step 1: Failing-Test schreiben** — `tests/selektoren-regelwirkung.test.mjs`:

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import { regelWirkungAus } from "../app/selektoren.mjs";

test("regelWirkungAus zaehlt Treffer pro Regel und sammelt Transaktionen", () => {
  const txs = [
    { transaktion_id: "TXN-1", matched_regeln: ["REG-001"] },
    { transaktion_id: "TXN-2", matched_regeln: ["REG-001", "REG-002"] },
    { transaktion_id: "TXN-3" },
  ];
  const w = regelWirkungAus(txs);
  assert.equal(w.get("REG-001").anzahl, 2);
  assert.equal(w.get("REG-002").anzahl, 1);
  assert.deepEqual(w.get("REG-001").transaktionen.map((t) => t.transaktion_id), ["TXN-1", "TXN-2"]);
  assert.equal(w.has("REG-003"), false);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node --test tests/selektoren-regelwirkung.test.mjs`
Expected: FAIL — Export fehlt.

- [ ] **Step 3: Implementierung** — in `app/selektoren.mjs` ergänzen:

```javascript
// Reine Inversion (testbar ohne Modulzustand): matched_regeln -> Regel-Treffer.
export function regelWirkungAus(transaktionen) {
  const map = new Map();
  for (const tx of transaktionen) {
    for (const id of tx.matched_regeln ?? []) {
      let eintrag = map.get(id);
      if (!eintrag) {
        eintrag = { transaktionen: [], anzahl: 0 };
        map.set(id, eintrag);
      }
      eintrag.transaktionen.push(tx);
      eintrag.anzahl += 1;
    }
  }
  return map;
}

// Memoisiert ueber die Array-Referenz: wird nur bei Reload (neues data.transaktionen)
// neu berechnet. Ein O(N)-Tally-Pass, kein String-Matching.
let _wirkungQuelle = null;
let _wirkungCache = null;
export function regelWirkung() {
  if (_wirkungQuelle !== data.transaktionen) {
    _wirkungQuelle = data.transaktionen;
    _wirkungCache = regelWirkungAus(data.transaktionen);
  }
  return _wirkungCache;
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `node --test tests/selektoren-regelwirkung.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/selektoren.mjs tests/selektoren-regelwirkung.test.mjs
git commit -m "feat: Selektor regelWirkung (Regel->Transaktionen, memoisiert)"
```

---

## Phase 5 — App: Routing, Klartext-Helfer, Regel-Ansicht

### Task 10: Route `#/regeln/REG-…`

**Files:**
- Modify: `app/routing.mjs`
- Test: `tests/routing.test.mjs`

- [ ] **Step 1: Failing-Tests schreiben** — in `tests/routing.test.mjs`:

```javascript
test("parseRoute erkennt Regel-Detail", () => {
  assert.deepEqual(parseRoute("#/regeln/REG-001"), { view: "masterdata", masterSection: "regeln", selectedRegel: "REG-001" });
});
test("parseRoute erkennt Regel-Liste", () => {
  assert.deepEqual(parseRoute("#/regeln"), { view: "masterdata", masterSection: "regeln" });
});
test("routeFromState erzeugt Regel-Detail-Hash", () => {
  assert.equal(routeFromState({ view: "masterdata", masterSection: "regeln", selectedRegel: "REG-001" }), "#/regeln/REG-001");
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node --test tests/routing.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implementierung** — in `app/routing.mjs`:
  1. In `routeFromState`, vor dem `return \`#/${VIEW_SLUG…}\``:

```javascript
  if (state.view === "masterdata" && state.masterSection === "regeln" && state.selectedRegel) {
    return `#/regeln/${encodeURIComponent(state.selectedRegel)}`;
  }
```

  2. In `parseRoute`, neben dem `konten`-Zweig:

```javascript
  if (head === "regeln") {
    return tail
      ? { view: "masterdata", masterSection: "regeln", selectedRegel: tail }
      : { view: "masterdata", masterSection: "regeln" };
  }
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `node --test tests/routing.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/routing.mjs tests/routing.test.mjs
git commit -m "feat: adressierbare Route fuer Regel-Detail"
```

---

### Task 11: Klartext-Helfer `regelKlartext()` und Herkunfts-Label

**Files:**
- Modify: `app/komponenten.mjs`
- Test: `tests/komponenten-regelklartext.test.mjs` (neu)

- [ ] **Step 1: Failing-Test schreiben** — `tests/komponenten-regelklartext.test.mjs`:

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import { regelKlartext } from "../app/komponenten.mjs";

const kat = (id) => ({ "KAT-003": "Lebensmittel", "KAT-017": "Essen gehen" }[id] || id);

test("Gegenpartei-Pattern wird in Klartext uebersetzt", () => {
  const s = regelKlartext({ gegenpartei_pattern: "musterladenb", kategorie_id: "KAT-003" }, kat);
  assert.match(s, /Lebensmittel/);
  assert.match(s, /Gegenpartei/);
  assert.match(s, /enthält/);
  assert.match(s, /musterladenb/);
});

test("Verwendungszweck- und Vorzeichen-Bedingung werden ergaenzt", () => {
  const s = regelKlartext({ verwendungszweck_pattern: "miete", vorzeichen: "ausgabe", kategorie_id: "KAT-017" }, kat);
  assert.match(s, /Verwendungszweck/);
  assert.match(s, /Ausgabe/);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag prüfen**

Run: `node --test tests/komponenten-regelklartext.test.mjs`
Expected: FAIL — Export fehlt.

- [ ] **Step 3: Implementierung** — in `app/komponenten.mjs` ergänzen (`categoryName` existiert dort bereits als Default-Auflöser):

```javascript
// Deterministische Klartext-Erklaerung einer Regel aus ihren Feldern. Macht die
// Match-Semantik ("enthaelt", Gross-/Kleinschreibung egal) explizit, damit z.B.
// "amzn.mktp" nicht als Regex missverstanden wird. Reine Ableitung, kein Feld.
export function regelKlartext(regel, kategorieAufloesen = categoryName) {
  const teile = [];
  if (regel.gegenpartei_pattern) teile.push(`die Gegenpartei den Text »${regel.gegenpartei_pattern}« enthält`);
  if (regel.verwendungszweck_pattern) teile.push(`der Verwendungszweck den Text »${regel.verwendungszweck_pattern}« enthält`);
  if (regel.konto_id) teile.push(`die Buchung auf Konto ${regel.konto_id} liegt`);
  if (regel.vorzeichen === "ausgabe") teile.push(`es eine Ausgabe ist`);
  if (regel.vorzeichen === "einnahme") teile.push(`es eine Einnahme ist`);
  const bedingung = teile.length ? teile.join(" und ") : "die Buchung passt";
  return `Bucht auf ${kategorieAufloesen(regel.kategorie_id)}, wenn ${bedingung} (Groß-/Kleinschreibung egal).`;
}

export function herkunftLabel(tx) {
  if (tx.kategorie_herkunft === "manuell") return "Manuell";
  if (tx.kategorie_herkunft === "regel") return "Regel";
  return "—";
}
```

- [ ] **Step 4: Test laufen lassen, Erfolg prüfen**

Run: `node --test tests/komponenten-regelklartext.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/komponenten.mjs tests/komponenten-regelklartext.test.mjs
git commit -m "feat: Klartext-Erklaerung und Herkunfts-Label fuer Regeln"
```

---

### Task 12: Stammdaten-Kachel „Regeln" + Liste + Regel-Detail

**Files:**
- Modify: `app/views/stammdaten.mjs`
- Modify: `app/i18n.js`
- Modify: `app/main.js` (Klick auf Regelzeile → `selectedRegel`)
- Test: `tests/stammdaten-regeln.test.mjs` (neu, render-Smoke)

- [ ] **Step 1: i18n-Labels ergänzen** — in `app/i18n.js` unter `masterdata` Schlüssel ergänzen:

```javascript
      rules: "Regeln",
      ruleHits: "Treffer",
      ruleDead: "greift nie",
      ruleCondition: "Bedingung",
      ruleExamples: "Beispiele",
      ruleNote: "Notiz",
      ruleMatchedTx: "Getroffene Transaktionen",
```

- [ ] **Step 2: Render-Smoke-Test schreiben** — `tests/stammdaten-regeln.test.mjs`. Muster aus einem bestehenden View-Test der Datei `tests/` übernehmen (View-Module setzen `data`/`state` über `runtime.mjs`; prüfen, wie z.B. `tests/transactions-sort.test.mjs` den Zustand aufbaut). Test: bei `state.masterSection = "regeln"` enthält `renderMasterdata()` die Regel-IDs und den Treffer-Count; bei gesetztem `state.selectedRegel` enthält die Ausgabe die Klartext-Bedingung.

- [ ] **Step 3: Test laufen lassen, Fehlschlag prüfen**

Run: `node --test tests/stammdaten-regeln.test.mjs`
Expected: FAIL.

- [ ] **Step 4: Implementierung `stammdaten.mjs`**:
  1. Importe ergänzen: `import { regelWirkung } from "../selektoren.mjs";` und `regelKlartext, categoryName` aus `../komponenten.mjs`.
  2. Vierte Kachel im `tile-grid` (nach der Kategorien-Kachel):

```javascript
      <button class="tile ${state.masterSection === "regeln" ? "active" : ""}" data-master-section="regeln">
        <strong>${escapeHtml(t("masterdata.rules"))}</strong>
        <div class="count">${data.kategorisierungsregeln.length}</div>
        <span class="chip success">${iconSvg("success")}${escapeHtml(t("masterdata.active"))}</span>
      </button>
```

  3. `sectionTitle()` um `regeln` erweitern (→ `t("masterdata.rules")`).
  4. In `renderMasterSection()` vor dem Default:

```javascript
  if (state.masterSection === "regeln") {
    return state.selectedRegel ? renderRegelDetail(state.selectedRegel) : renderRegelListe();
  }
```

  5. Neue Funktionen:

```javascript
function renderRegelListe() {
  const wirkung = regelWirkung();
  const rows = data.kategorisierungsregeln.map((regel) => {
    const treffer = wirkung.get(regel.regel_id)?.anzahl ?? 0;
    const tot = treffer === 0 ? `<span class="chip review">${escapeHtml(t("masterdata.ruleDead"))}</span>` : "";
    return `
      <tr class="rule-row linkish" data-rule="${escapeHtml(regel.regel_id)}" tabindex="0">
        <td>${escapeHtml(regel.regel_id)}</td>
        <td>${escapeHtml(regelKlartext(regel, categoryName))}</td>
        <td>${escapeHtml(t(`status.${regel.status}`))}</td>
        <td>${treffer} ${tot}</td>
      </tr>`;
  }).join("");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>${escapeHtml(t("labels.id"))}</th>
          <th>${escapeHtml(t("masterdata.ruleCondition"))}</th>
          <th>${escapeHtml(t("labels.status"))}</th>
          <th>${escapeHtml(t("masterdata.ruleHits"))}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderRegelDetail(regelId) {
  const regel = data.kategorisierungsregeln.find((r) => r.regel_id === regelId);
  if (!regel) return renderRegelListe();
  const treffer = regelWirkung().get(regelId)?.transaktionen ?? [];
  const beispiele = [...new Set(treffer.map((t) => t.gegenpartei).filter(Boolean))].slice(0, 5);
  const txRows = treffer.slice(0, 50).map((tx) => `
    <tr class="linkish" data-action="open-transaction" data-transaction="${escapeHtml(tx.transaktion_id)}" tabindex="0">
      <td>${escapeHtml(tx.buchungsdatum || "")}</td>
      <td>${escapeHtml(tx.gegenpartei || "")}</td>
    </tr>`).join("");
  return `
    <button class="linkish" data-master-section="regeln">← ${escapeHtml(t("masterdata.rules"))}</button>
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t("masterdata.ruleCondition"))}</div>
      <div class="detail-value">${escapeHtml(regelKlartext(regel, categoryName))}</div>
    </div>
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t("masterdata.ruleNote"))}</div>
      <div class="detail-value">${escapeHtml(regel.kommentar)}</div>
    </div>
    ${beispiele.length ? `<div class="detail-section">
      <div class="detail-label">${escapeHtml(t("masterdata.ruleExamples"))}</div>
      <div class="detail-value muted">${beispiele.map((b) => escapeHtml(b)).join(" · ")}</div>
    </div>` : ""}
    <div class="detail-section">
      <div class="detail-label">${escapeHtml(t("masterdata.ruleMatchedTx"))} (${treffer.length})</div>
      <div class="table-wrap"><table><tbody>${txRows}</tbody></table></div>
    </div>`;
}
```

  6. `data-rule` und `← Regeln` (über vorhandenes `data-master-section`) müssen verdrahtet werden — siehe Step 5/6.

- [ ] **Step 5: `main.js` verdrahten** — im Klick-Handler (bei `data-master-section`, ~Zeile 350) sicherstellen, dass ein Wechsel der Sektion `state.selectedRegel = ""` zurücksetzt:

```javascript
  const masterSection = event.target.closest("[data-master-section]");
  if (masterSection) {
    state.masterSection = masterSection.dataset.masterSection;
    state.selectedRegel = "";
    render();
    return;
  }
```

und einen neuen Zweig für die Regelzeile ergänzen (analog zu `open-account-master`):

```javascript
  const ruleRow = event.target.closest("[data-rule]");
  if (ruleRow) {
    state.view = "masterdata";
    state.masterSection = "regeln";
    state.selectedRegel = ruleRow.dataset.rule;
    render();
    return;
  }
```

  `data-rule` zur Attribut-Allowlist (Zeile ~30-31) hinzufügen: `"data-rule"`. Außerdem `selectedRegel` in `snapshotState()`/`restoreState()`/`applyRoute()` aufnehmen (analog zu `selectedKonto`): in `snapshotState` `selectedRegel: state.selectedRegel`, in `restoreState` `state.selectedRegel = snapshot.selectedRegel || ""`, in `applyRoute` `if (route.selectedRegel) state.selectedRegel = route.selectedRegel;`. In der State-Initialisierung (dort wo `selectedKonto` initialisiert wird) `selectedRegel: ""` ergänzen.

- [ ] **Step 6: Test laufen lassen, Erfolg prüfen**

Run: `node --test tests/stammdaten-regeln.test.mjs tests/routing.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/views/stammdaten.mjs app/i18n.js app/main.js tests/stammdaten-regeln.test.mjs
git commit -m "feat: Regel-Kachel, Regelliste mit Wirkung und Regel-Detail"
```

---

## Phase 6 — App: Herkunft in Transaktionen sichtbar

### Task 13: Herkunft + Regel-Link im Detail-Rail

**Files:**
- Modify: `app/views/transaktionen.mjs:478-483` (Kategorie-Sektion in `renderTransactionDetail`)
- Modify: `app/i18n.js`
- Test: `tests/transactions-herkunft.test.mjs` (neu)

- [ ] **Step 1: i18n** — in `app/i18n.js` unter `transactions` ergänzen:

```javascript
      origin: "Quelle",
      originManual: "Manuell",
      originRuleConflict: "offen – Regeln widersprechen sich",
```

- [ ] **Step 2: Failing-Test** — `tests/transactions-herkunft.test.mjs`: Detail-HTML für drei Fälle prüfen (manuell → „Manuell"; regel mit `matched_regeln:["REG-001"]` → enthält `REG-001` + `data-rule`; offen mit `matched_regeln` zweier Regeln → Konflikt-Text). Render-Setup aus `tests/detail-rail-initial-state.test.mjs` übernehmen.

- [ ] **Step 3: Test laufen lassen, Fehlschlag prüfen**

Run: `node --test tests/transactions-herkunft.test.mjs`
Expected: FAIL.

- [ ] **Step 4: Implementierung** — in `renderTransactionDetail` die Kategorie-`detail-section` um eine Herkunft-Zeile erweitern. Direkt nach dem `statusChip(...)` innerhalb der Kategorie-Sektion einsetzen:

```javascript
        <div class="detail-sub">${escapeHtml(t("transactions.origin"))}: ${renderHerkunft(tx)}</div>
```

und Helfer am Dateiende ergänzen (Import `herkunftLabel` aus `../komponenten.mjs` nicht nötig, Logik inline):

```javascript
function renderHerkunft(tx) {
  if (tx.kategorie_herkunft === "manuell") return escapeHtml(t("transactions.originManual"));
  const ids = tx.matched_regeln ?? [];
  if (tx.kategorisierung_status === "offen" && ids.length) {
    return `${escapeHtml(t("transactions.originRuleConflict"))} (${ids.map((id) => escapeHtml(id)).join(", ")})`;
  }
  if (tx.kategorie_herkunft === "regel" && ids.length) {
    return ids.map((id) => `<button class="linkish" data-rule="${escapeHtml(id)}">${escapeHtml(id)}</button>`).join(", ");
  }
  if (tx.kategorie_herkunft === "regel") return escapeHtml(t("labels.unknownSource") || "Regel (Quelle unbekannt)");
  return "—";
}
```

(Label `labels.unknownSource` in `app/i18n.js` unter `labels` ergänzen: `unknownSource: "Regel (Quelle unbekannt)"`.)

- [ ] **Step 5: Test laufen lassen, Erfolg prüfen**

Run: `node --test tests/transactions-herkunft.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/views/transaktionen.mjs app/i18n.js tests/transactions-herkunft.test.mjs
git commit -m "feat: Herkunft und Regel-Link im Transaktions-Detail"
```

---

### Task 14: Herkunfts-Marker + Filter in der Tabelle

**Files:**
- Modify: `app/views/transaktionen.mjs` (Zeile ~26-31 Filterlogik, ~248-257 Filterdefinition, ~397-404 Zeilenrender)
- Modify: `app/i18n.js`
- Test: `tests/table-filter-result-count.test.mjs` (vorhandenes Muster) oder `tests/transactions-herkunft.test.mjs` erweitern

- [ ] **Step 1: i18n** — unter `transactions` ergänzen:

```javascript
      filterOrigin: "Herkunft",
      allOrigins: "Alle Herkünfte",
```

- [ ] **Step 2: Failing-Test** — Filter testen: bei `state.transactionFilters.origin = "manuell"` enthält die gefilterte Zeilenmenge nur manuelle Buchungen. Muster aus `tests/transactions-search.test.mjs` übernehmen.

- [ ] **Step 3: Test laufen lassen, Fehlschlag prüfen**

Run: `node --test tests/transactions-herkunft.test.mjs`
Expected: FAIL.

- [ ] **Step 4: Implementierung**:
  1. Filterprädikat ergänzen (im `filter`-Block neben `status`/`category`):

```javascript
    if (state.transactionFilters.origin && (tx.kategorie_herkunft || "") !== state.transactionFilters.origin) return false;
```

  2. Filter-Select definieren (bei den übrigen Filterfeldern):

```javascript
      {
        name: "origin",
        label: t("transactions.filterOrigin"),
        options: [
          ["", t("transactions.allOrigins")],
          ["regel", t("transactions.originManual") === "Manuell" ? "Regel" : "Regel"],
          ["manuell", t("transactions.originManual")],
        ],
      },
```

  (Den `regel`-Label-Text bei Bedarf als eigenen i18n-Key `transactions.originRule: "Regel"` sauberer führen statt des Inline-Ausdrucks.)

  3. `origin` in den State der Transaktionsfilter aufnehmen (dort wo `status`/`category` initialisiert werden: `origin: ""`), und in der Zähl-Logik aktiver Filter (`regular`-Berechnung Zeile ~381) `"origin"` ergänzen.

  4. Zeilen-Marker: in `renderTransactionRow` (~397) in der Kategorie-Zelle ein kleines Herkunfts-Chip ergänzen, z.B.:

```javascript
      ${tx.kategorie_herkunft === "manuell" ? `<span class="chip neutral" title="${escapeHtml(t("transactions.originManual"))}">M</span>` : ""}
```

- [ ] **Step 5: Test laufen lassen, Erfolg prüfen**

Run: `node --test tests/transactions-herkunft.test.mjs tests/table-filter-result-count.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/views/transaktionen.mjs app/i18n.js tests/transactions-herkunft.test.mjs
git commit -m "feat: Herkunfts-Marker und -Filter in der Transaktionstabelle"
```

---

## Phase 7 — Skill-Docs & ADR

### Task 15: Agenten-Dokumentation und ADR 0018

**Files:**
- Modify: `app/docs/agent-context.md`
- Modify: `app/docs/skills/import-agent.md`
- Modify: `app/docs/skills/kategorisierung-review.md`
- Modify: `app/docs/skills/kategorisierungsregel-pflege.md`
- Modify: `app/docs/skills/validierung-agent.md`
- Create: `docs/adr/0018-regel-provenance-und-erklaerbarkeit.md`
- Test: `tests/agent-docs.test.mjs`

- [ ] **Step 1: `agent-context.md`** — Abschnitt ergänzen: `matched_regeln` als Array der treffenden Regeln; Invariante (gesetzt bei `regel`-Kategorisierung und offen-Konflikt; **nie** bei `manuell`/`abgelehnt`); Konflikt ist ableitbar (`offen` + nicht-leer). Verboten-Muster aus `tests/agent-docs.test.mjs` (CONTEXT.md, docs/adr, docs/superpowers, Repo-Root, Projektroot) **nicht** verwenden.

- [ ] **Step 2: `import-agent.md`** — beim Kategorisier-Schritt ergänzen: bei eindeutigem Treffer **und** bei Konflikt `matched_regeln` mitschreiben (das übernimmt `import.mjs` automatisch — als Verhalten dokumentieren, nicht als manuelle Aktion).

- [ ] **Step 3: `kategorisierung-review.md`** — kritische Regel: Einzelkorrektur (`herkunft = manuell`) und Ablehnung (`abgelehnt`) **entfernen** `matched_regeln`; Bulk-Bestätigen (bleibt `regel`) behält es. In die bestehende Aktions-/Herkunft-Tabelle einarbeiten.

- [ ] **Step 4: `kategorisierungsregel-pflege.md`** — Schritt 4 „optional kommentar" → „**Pflicht**: Klartext-Erklärung (kein Pattern-Restatement)". Änderungsfall ergänzen: wird das Pattern angepasst, `kommentar` mitziehen. Notiz: `recategorize.mjs` stempelt jetzt `matched_regeln`; Probelauf zeigt Trefferregeln.

- [ ] **Step 5: `validierung-agent.md`** — Invariante erwähnen: `matched_regeln` nur bei `regel`/offen-Konflikt; `kommentar` ist Pflicht. Validator prüft beides.

- [ ] **Step 6: ADR 0018 schreiben** — `docs/adr/0018-regel-provenance-und-erklaerbarkeit.md` im Stil der vorhandenen ADRs (Kontext/Entscheidung/Konsequenzen): Provenance gespeichert statt live (Skalierung + manuelle Entscheidungen), Konflikt-Sichtbarkeit, Count aggregiert statt persistiert, Backfill über einmaligen Recompute, Erklärbarkeit (Klartext + Beispiele + Pflicht-`kommentar`).

- [ ] **Step 7: Doc-Tests laufen lassen**

Run: `node --test tests/agent-docs.test.mjs`
Expected: PASS (jedes Skill referenziert weiterhin `docs/agent-context.md`, keine verbotenen Root-Referenzen).

- [ ] **Step 8: Commit**

```bash
git add app/docs/agent-context.md app/docs/skills/*.md docs/adr/0018-regel-provenance-und-erklaerbarkeit.md
git commit -m "docs: Regel-Provenance/Erklaerbarkeit in Agenten-Docs und ADR 0018"
```

---

## Abschluss

- [ ] **Gesamt-Testlauf**

Run: `npm test`
Expected: alle Tests grün.

- [ ] **Validierung Bestand**

Run: `npm run validate:master`
Expected: keine Fehler.

- [ ] **Manuelle Sichtprüfung** (lokaler Webserver) — Stammdaten → Regeln: Liste mit Treffer-Counts, tote Regeln markiert; Klick → Detail mit Klartext/Beispielen/Transaktionen. Transaktion mit Herkunft „Manuell" und eine mit Regel-Link; Konflikt-Buchung zeigt Widerspruch.

---

## Self-Review-Notiz (für den Plan-Autor erledigt)

- Spec-Abdeckung: Provenance (T1-4), Erklärbarkeit/kommentar (T5-6, T11, T15), Backfill (T7), Laden/Selektor (T8-9), Routing/Regel-Ansicht (T10-12), Herkunft sichtbar (T13-14), Skill-Docs/ADR (T15) — alle Spec-Abnahmekriterien 1-9 abgedeckt.
- Typkonsistenz: `regelWirkung()`/`regelWirkungAus()`, `regelKlartext(regel, kategorieAufloesen)`, `matched_regeln`-Array, `state.selectedRegel`, Route-Fragment `{ view:"masterdata", masterSection:"regeln", selectedRegel }` durchgängig verwendet.
- Datentrennung: Daten-Migrationen (T6, T7) ausdrücklich ohne Commit (gitignored).

# M5 — Vermögen, Verbindlichkeiten und Immobilien — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vermögenswerte und Schulden werden als getrennte Stammdaten (Immobilien, Darlehen, weitere Vermögenswerte) mit Quellenstatus geführt, und ein berechnetes Gesamt-Nettovermögen mit sichtbarer Datenqualität entsteht.

**Architecture:** Neue Entitäten als Schemas + Erweiterung des bestehenden deterministischen Validators (`tools/validator.mjs`). Eine neue geteilte, reine Berechnungs-Bibliothek `app/vermoegen.mjs` (analog `app/cashflow.mjs`) berechnet Konto-Saldo/Restschuld aus belegtem Anker + Bewegungen, Marktwerte aus Zeitwerten, anteilsgewichtetes Nettovermögen und die M5-Checks. Die App bekommt eine neue Nav-Ansicht „Vermögen". Echte Datenerfassung ist ein separater, interviewgeführter Testschritt (nicht Teil dieses Bau-Plans).

**Tech Stack:** Node ESM (`.mjs`), `node --test`, Vanilla-JS-App (kein Build), JSON/JSONL Masterdaten.

**Verbindliche Bezugsdokumente:** `CONTEXT.md` (Glossar: Konto, Immobilie, Darlehen, Nettovermögen, Weiterer Vermögenswert, Zeitwerte, Geladener Saldo und Kontostand), `docs/adr/0013-anker-und-reconciliation-fuer-berechenbare-werte.md`, `docs/adr/0014-nettovermoegen-als-haushaltssicht.md`, `docs/adr/0001` (Konto ohne Quoten), `docs/adr/0006` (Regelzahlungen nur via Agent-Dialog), `docs/runde2/Meilensteine_Runde2.md` (M5 + vorgemerkte M6/M8-Punkte).

**Bewusst NICHT in M5 (siehe Meilenstein-Notizen):** geplante künftige Sondertilgungen, Restschuld-Projektion auf Zukunftsdatum, Cash-Realismus-Guardrail (→ M6); Plan-Ist-Abgleich über alle Planwerte (→ M8); externer Miteigentümer-Eintrag (`extern: true`) wird erst bei Bedarf gebaut, die Berechnung ist aber von Anfang an anteilsgewichtet.

---

## File Structure

**Neu:**
- `schemas/immobilien.schema.json` — Referenz-Schema Immobilie.
- `schemas/darlehen.schema.json` — Referenz-Schema Darlehen.
- `schemas/vermoegenswerte.schema.json` — Referenz-Schema weiterer Vermögenswert.
- `schemas/zeitwerte.schema.json` — Referenz-Schema Zeitwert-Eintrag.
- `app/vermoegen.mjs` — reine Berechnung: Zeitwert-Auflösung, Konto-Saldo, Restschuld (Annuität), anteilsgewichtete Marktwerte, Nettovermögen, Reconciliation + M5-Checks. Liegt unter `app/`, weil der Webserver nur `app/` ausliefert (ADR 0009/0012).
- `tests/m5-validator.test.mjs` — Validator-Tests M5.
- `tests/m5-vermoegen.test.mjs` — Berechnungs-Tests M5.
- `data/master/immobilien.json`, `data/master/darlehen.json`, `data/master/vermoegenswerte.json`, `data/master/zeitwerte.jsonl` — zunächst kleine, klar markierte Demo-Daten (echte Daten kommen im Testschritt).
- `docs/skills/stammdaten-erfassung-agent.md` — interviewgeführter, schema-getriebener Erfassungs-Agent.

**Geändert:**
- `tools/validator.mjs` — neue Collections im `schemas`-Objekt, neue Cross-Field-Regeln, `loadMasterData` lädt die neuen Dateien (optional/robust gegen fehlende Datei), `regelzahlungen` bekommt optionales `darlehen_id`.
- `schemas/regelzahlungen.schema.json` — optionales `darlehen_id`.
- `app/main.js` — Nav-Punkt „vermoegen", `renderVermoegen()`, M5-Checks im Checks-Bereich, Import von `vermoegen.mjs`.
- `app/i18n.js` — Labels für die neue Ansicht.
- `app/styles.css` — ggf. kleine Stilergänzungen (Positionsliste).
- `app/review-data.js` — Demo-Daten der neuen Entitäten + Zeitwerte (klar als Demo markiert).
- `schemas/README.md` — neue Schemas erwähnen.

**Konventionen (aus dem Code abgeleitet):** Geld als Decimal-String `^-?\d+\.\d{2}$` auf Platte, Cent-Integer im Code via `toCents` (String-Split, kein Float). Datumswerte ISO `YYYY-MM-DD`. Validator: `schemas`-Objekt mit `required`/`fields`, generischer `validateField`, plus `validateCrossFieldRules`. Eigentumsanteile als exakter Bruch `{person_id, zaehler, nenner}` (Integer-Arithmetik, keine Float-Toleranz).

---

## Task 1: Referenz-Schemas der neuen Entitäten

**Files:**
- Create: `schemas/immobilien.schema.json`
- Create: `schemas/darlehen.schema.json`
- Create: `schemas/vermoegenswerte.schema.json`
- Create: `schemas/zeitwerte.schema.json`
- Modify: `schemas/regelzahlungen.schema.json`
- Modify: `schemas/README.md`

> Diese `.schema.json` sind Referenz/Doku (wie `regelzahlungen.schema.json`); die ausführbare Validierung liegt in `tools/validator.mjs` (Task 2). Beide müssen konsistent sein.

- [ ] **Step 1: Immobilien-Schema schreiben**

`schemas/immobilien.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Immobilie",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["immobilie_id", "bezeichnung", "eigentumsanteile", "status"],
    "additionalProperties": false,
    "properties": {
      "immobilie_id": { "type": "string", "pattern": "^IMM-\\d{3}$" },
      "bezeichnung": { "type": "string", "minLength": 1 },
      "eigentumsanteile": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "required": ["person_id", "zaehler", "nenner"],
          "additionalProperties": false,
          "properties": {
            "person_id": { "type": "string", "pattern": "^PER-\\d{3}$" },
            "zaehler": { "type": "integer", "minimum": 1 },
            "nenner": { "type": "integer", "minimum": 1 }
          }
        }
      },
      "status": { "type": "string", "enum": ["aktiv", "verkauft"] },
      "adresse": { "type": "string" },
      "anschaffungsdatum": { "type": "string", "format": "date" },
      "anschaffungskosten": { "type": "string", "pattern": "^-?\\d+\\.\\d{2}$" },
      "quelle_hinweis": { "type": "string" },
      "quelle_standdatum": { "type": "string", "format": "date" },
      "aktiv_bis": { "type": "string", "format": "date" },
      "bemerkung": { "type": "string" }
    }
  }
}
```

- [ ] **Step 2: Darlehen-Schema schreiben**

`schemas/darlehen.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Darlehen",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["darlehen_id", "bezeichnung", "status", "anfangsbetrag", "anfangsdatum", "zinssatz", "sollrate", "rhythmus_einheit", "rhythmus_intervall"],
    "additionalProperties": false,
    "properties": {
      "darlehen_id": { "type": "string", "pattern": "^DAR-\\d{3}$" },
      "bezeichnung": { "type": "string", "minLength": 1 },
      "status": { "type": "string", "enum": ["aktiv", "abgeloest"] },
      "anfangsbetrag": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
      "anfangsdatum": { "type": "string", "format": "date" },
      "zinssatz": { "type": "string", "pattern": "^\\d+\\.\\d{2,4}$" },
      "sollrate": { "type": "string", "pattern": "^\\d+\\.\\d{2}$" },
      "rhythmus_einheit": { "type": "string", "enum": ["tag", "woche", "monat", "jahr"] },
      "rhythmus_intervall": { "type": "integer", "minimum": 1 },
      "immobilie_id": { "type": "string", "pattern": "^IMM-\\d{3}$" },
      "konto_id": { "type": "string", "pattern": "^KTO-\\d{3}$" },
      "zinsbindung_bis": { "type": "string", "format": "date" },
      "aktiv_bis": { "type": "string", "format": "date" },
      "quelle_hinweis": { "type": "string" },
      "quelle_standdatum": { "type": "string", "format": "date" },
      "bemerkung": { "type": "string" }
    }
  }
}
```

- [ ] **Step 3: Vermögenswerte-Schema schreiben**

`schemas/vermoegenswerte.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Weiterer Vermoegenswert",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["vermoegenswert_id", "typ", "bezeichnung", "eigentumsanteile", "status"],
    "additionalProperties": false,
    "properties": {
      "vermoegenswert_id": { "type": "string", "pattern": "^VMW-\\d{3}$" },
      "typ": { "type": "string", "enum": ["edelmetall", "beteiligung", "sonstiges"] },
      "bezeichnung": { "type": "string", "minLength": 1 },
      "eigentumsanteile": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "required": ["person_id", "zaehler", "nenner"],
          "additionalProperties": false,
          "properties": {
            "person_id": { "type": "string", "pattern": "^PER-\\d{3}$" },
            "zaehler": { "type": "integer", "minimum": 1 },
            "nenner": { "type": "integer", "minimum": 1 }
          }
        }
      },
      "status": { "type": "string", "enum": ["aktiv", "veraeussert"] },
      "quelle_hinweis": { "type": "string" },
      "quelle_standdatum": { "type": "string", "format": "date" },
      "aktiv_bis": { "type": "string", "format": "date" },
      "bemerkung": { "type": "string" }
    }
  }
}
```

- [ ] **Step 4: Zeitwerte-Schema schreiben**

`schemas/zeitwerte.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Zeitwert",
  "type": "object",
  "required": ["entitaet", "entitaet_id", "feld", "wert", "standdatum", "qualitaet"],
  "additionalProperties": false,
  "properties": {
    "entitaet": { "type": "string", "enum": ["konto", "immobilie", "vermoegenswert", "darlehen"] },
    "entitaet_id": { "type": "string", "minLength": 1 },
    "feld": { "type": "string", "enum": ["kontostand", "depotwert", "marktwert", "restschuld"] },
    "wert": { "type": "string", "pattern": "^-?\\d+\\.\\d{2}$" },
    "standdatum": { "type": "string", "format": "date" },
    "qualitaet": { "type": "string", "enum": ["belegt", "geschaetzt"] },
    "quelle_hinweis": { "type": "string" }
  }
}
```

- [ ] **Step 5: `darlehen_id` zur Regelzahlung ergänzen**

In `schemas/regelzahlungen.schema.json` innerhalb von `properties` (nach `kategorie_id`) ergänzen:

```json
      "darlehen_id": { "type": "string", "pattern": "^DAR-\\d{3}$" },
```

- [ ] **Step 6: README ergänzen**

In `schemas/README.md` die vier neuen Schemas und das neue optionale `darlehen_id` der Regelzahlung in der Auflistung erwähnen (eine Zeile je Datei, Format wie bei den bestehenden Einträgen).

- [ ] **Step 7: JSON-Gültigkeit prüfen**

Run: `node -e "for (const f of ['immobilien','darlehen','vermoegenswerte','zeitwerte','regelzahlungen']) JSON.parse(require('fs').readFileSync('schemas/'+f+'.schema.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 8: Commit**

```bash
git add schemas/
git commit -m "feat(m5): Referenz-Schemas für Immobilien, Darlehen, Vermögenswerte, Zeitwerte"
```

---

## Task 2: Validator um M5-Entitäten + Cross-Field-Regeln erweitern

**Files:**
- Modify: `tools/validator.mjs`
- Test: `tests/m5-validator.test.mjs`

Die Validierung lebt im `schemas`-Objekt + `validateCrossFieldRules` in `tools/validator.mjs`. Eigentumsanteile (Array von Objekten) werden NICHT über den generischen `validateField` geprüft (der kennt nur String-Item-Pattern), sondern über eine dedizierte Cross-Field-Regel inkl. exakter Bruch-Summenprüfung.

- [ ] **Step 1: Failing-Test für neue Collections + Bruch-Summe schreiben**

`tests/m5-validator.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMasterData } from "../tools/validator.mjs";

function basis() {
  return {
    personen: [
      { person_id: "PER-001", name: "Person A", status: "aktiv" },
      { person_id: "PER-002", name: "Person B", status: "aktiv" },
    ],
    konten: [
      { konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" },
    ],
    kategorien: [],
    transaktionen: [],
    transfers: [],
    regelzahlungen: [],
    immobilien: [],
    darlehen: [],
    vermoegenswerte: [],
    zeitwerte: [],
  };
}

test("gültige Immobilie mit Bruch-Anteilen Summe 1 ist valide", () => {
  const data = basis();
  data.immobilien.push({
    immobilie_id: "IMM-001",
    bezeichnung: "EFH",
    eigentumsanteile: [
      { person_id: "PER-001", zaehler: 2, nenner: 3 },
      { person_id: "PER-002", zaehler: 1, nenner: 3 },
    ],
    status: "aktiv",
  });
  const result = validateMasterData(data);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("Eigentumsanteile mit Summe != 1 ist Fehler", () => {
  const data = basis();
  data.immobilien.push({
    immobilie_id: "IMM-001",
    bezeichnung: "EFH",
    eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 3 }],
    status: "aktiv",
  });
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("eigentumsanteile") && e.includes("Summe")));
});

test("Eigentumsanteil mit unbekannter person_id ist Fehler", () => {
  const data = basis();
  data.immobilien.push({
    immobilie_id: "IMM-001",
    bezeichnung: "EFH",
    eigentumsanteile: [{ person_id: "PER-999", zaehler: 1, nenner: 1 }],
    status: "aktiv",
  });
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("PER-999")));
});

test("Darlehen mit kaputter immobilie_id/konto_id ist Fehler", () => {
  const data = basis();
  data.darlehen.push({
    darlehen_id: "DAR-001", bezeichnung: "Hyp", status: "aktiv",
    anfangsbetrag: "300000.00", anfangsdatum: "2020-01-01", zinssatz: "1.85",
    sollrate: "1200.00", rhythmus_einheit: "monat", rhythmus_intervall: 1,
    immobilie_id: "IMM-404", konto_id: "KTO-404",
  });
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("IMM-404")));
  assert.ok(result.errors.some((e) => e.includes("KTO-404")));
});

test("Zeitwert mit kaputter entitaet_id ist Fehler", () => {
  const data = basis();
  data.zeitwerte.push({
    entitaet: "konto", entitaet_id: "KTO-404", feld: "kontostand",
    wert: "1000.00", standdatum: "2026-01-01", qualitaet: "belegt",
  });
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("KTO-404")));
});

test("Regelzahlung mit kaputter darlehen_id ist Fehler", () => {
  const data = basis();
  data.regelzahlungen.push({
    regelzahlung_id: "RZ-001", bezeichnung: "Rate", betrag: "-1200.00",
    rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01",
    status: "bestaetigt", erstellt_am: "2026-01-01", darlehen_id: "DAR-404",
  });
  const result = validateMasterData(data);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("DAR-404")));
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `node --test tests/m5-validator.test.mjs`
Expected: FAIL (Collections unbekannt / `eigentumsanteile: unbekanntes Feld` bzw. fehlende Regeln).

- [ ] **Step 3: Neue Collections im `schemas`-Objekt ergänzen**

In `tools/validator.mjs` im `schemas`-Objekt nach `regelzahlungen` ergänzen. `eigentumsanteile` und `zeitwerte`-Spezialfälle werden hier nur grob als `array`/Objekt zugelassen und in den Cross-Field-Regeln genau geprüft:

```js
  immobilien: {
    optional: true,
    required: ["immobilie_id", "bezeichnung", "eigentumsanteile", "status"],
    fields: {
      immobilie_id: { type: "string", pattern: /^IMM-\d{3}$/ },
      bezeichnung: { type: "string", minLength: 1 },
      eigentumsanteile: { type: "array", minItems: 1 },
      status: { type: "string", enum: ["aktiv", "verkauft"] },
      adresse: { type: "string" },
      anschaffungsdatum: { type: "string", format: "date" },
      anschaffungskosten: { type: "string", pattern: /^-?\d+\.\d{2}$/ },
      quelle_hinweis: { type: "string" },
      quelle_standdatum: { type: "string", format: "date" },
      aktiv_bis: { type: "string", format: "date" },
      bemerkung: { type: "string" },
    },
  },
  darlehen: {
    optional: true,
    required: ["darlehen_id", "bezeichnung", "status", "anfangsbetrag", "anfangsdatum", "zinssatz", "sollrate", "rhythmus_einheit", "rhythmus_intervall"],
    fields: {
      darlehen_id: { type: "string", pattern: /^DAR-\d{3}$/ },
      bezeichnung: { type: "string", minLength: 1 },
      status: { type: "string", enum: ["aktiv", "abgeloest"] },
      anfangsbetrag: { type: "string", pattern: /^\d+\.\d{2}$/ },
      anfangsdatum: { type: "string", format: "date" },
      zinssatz: { type: "string", pattern: /^\d+\.\d{2,4}$/ },
      sollrate: { type: "string", pattern: /^\d+\.\d{2}$/ },
      rhythmus_einheit: { type: "string", enum: ["tag", "woche", "monat", "jahr"] },
      rhythmus_intervall: { type: "number", integer: true, min: 1 },
      immobilie_id: { type: "string", pattern: /^IMM-\d{3}$/ },
      konto_id: { type: "string", pattern: /^KTO-\d{3}$/ },
      zinsbindung_bis: { type: "string", format: "date" },
      aktiv_bis: { type: "string", format: "date" },
      quelle_hinweis: { type: "string" },
      quelle_standdatum: { type: "string", format: "date" },
      bemerkung: { type: "string" },
    },
  },
  vermoegenswerte: {
    optional: true,
    required: ["vermoegenswert_id", "typ", "bezeichnung", "eigentumsanteile", "status"],
    fields: {
      vermoegenswert_id: { type: "string", pattern: /^VMW-\d{3}$/ },
      typ: { type: "string", enum: ["edelmetall", "beteiligung", "sonstiges"] },
      bezeichnung: { type: "string", minLength: 1 },
      eigentumsanteile: { type: "array", minItems: 1 },
      status: { type: "string", enum: ["aktiv", "veraeussert"] },
      quelle_hinweis: { type: "string" },
      quelle_standdatum: { type: "string", format: "date" },
      aktiv_bis: { type: "string", format: "date" },
      bemerkung: { type: "string" },
    },
  },
  zeitwerte: {
    optional: true,
    required: ["entitaet", "entitaet_id", "feld", "wert", "standdatum", "qualitaet"],
    fields: {
      entitaet: { type: "string", enum: ["konto", "immobilie", "vermoegenswert", "darlehen"] },
      entitaet_id: { type: "string", minLength: 1 },
      feld: { type: "string", enum: ["kontostand", "depotwert", "marktwert", "restschuld"] },
      wert: { type: "string", pattern: /^-?\d+\.\d{2}$/ },
      standdatum: { type: "string", format: "date" },
      qualitaet: { type: "string", enum: ["belegt", "geschaetzt"] },
      quelle_hinweis: { type: "string" },
    },
  },
```

- [ ] **Step 4: `darlehen_id` zur Regelzahlung im Validator ergänzen**

In `tools/validator.mjs` im `regelzahlungen.fields`-Block nach `kategorie_id` ergänzen:

```js
      darlehen_id: { type: "string", pattern: /^DAR-\d{3}$/ },
```

- [ ] **Step 5: Cross-Field-Regeln für M5 ergänzen**

In `tools/validator.mjs` am Ende von `validateCrossFieldRules` (vor der schließenden Klammer) ergänzen. Maps für Immobilien/Darlehen vorher anlegen:

```js
  const immobilien = byId(data.immobilien, "immobilie_id");
  const darlehen = byId(data.darlehen, "darlehen_id");
  const vermoegenswerte = byId(data.vermoegenswerte, "vermoegenswert_id");

  const pruefeAnteile = (prefix, anteile, personen) => {
    if (!Array.isArray(anteile)) return;
    let num = 0, den = 1;
    anteile.forEach((a, i) => {
      const p = `${prefix}.eigentumsanteile[${i}]`;
      if (!a || typeof a !== "object") { errors.push(`${p}: muss ein Objekt sein`); return; }
      const extern = a.extern === true;
      if (!extern && !personen.has(a.person_id)) {
        errors.push(`${p}.person_id: ${a.person_id} existiert nicht`);
      }
      if (!Number.isInteger(a.zaehler) || a.zaehler < 1) errors.push(`${p}.zaehler: muss Ganzzahl >= 1 sein`);
      if (!Number.isInteger(a.nenner) || a.nenner < 1) errors.push(`${p}.nenner: muss Ganzzahl >= 1 sein`);
      if (Number.isInteger(a.zaehler) && Number.isInteger(a.nenner) && a.nenner >= 1) {
        num = num * a.nenner + a.zaehler * den;
        den = den * a.nenner;
      }
    });
    if (den !== 0 && num !== den) {
      errors.push(`${prefix}.eigentumsanteile: Summe der Anteile muss genau 1 sein`);
    }
  };

  data.immobilien?.forEach((imm) => pruefeAnteile(`immobilien.${imm.immobilie_id}`, imm.eigentumsanteile, personen));
  data.vermoegenswerte?.forEach((vmw) => pruefeAnteile(`vermoegenswerte.${vmw.vermoegenswert_id}`, vmw.eigentumsanteile, personen));

  data.darlehen?.forEach((dar) => {
    if (dar.immobilie_id && !immobilien.has(dar.immobilie_id)) {
      errors.push(`darlehen.${dar.darlehen_id}.immobilie_id: ${dar.immobilie_id} existiert nicht`);
    }
    if (dar.konto_id && !konten.has(dar.konto_id)) {
      errors.push(`darlehen.${dar.darlehen_id}.konto_id: ${dar.konto_id} existiert nicht`);
    }
    if (dar.aktiv_bis && dar.anfangsdatum && dar.aktiv_bis < dar.anfangsdatum) {
      errors.push(`darlehen.${dar.darlehen_id}.aktiv_bis: liegt vor anfangsdatum`);
    }
  });

  const zeitwertEntitaeten = {
    konto: konten, immobilie: immobilien, vermoegenswert: vermoegenswerte, darlehen,
  };
  data.zeitwerte?.forEach((zw, i) => {
    const map = zeitwertEntitaeten[zw.entitaet];
    if (map && !map.has(zw.entitaet_id)) {
      errors.push(`zeitwerte[${i}].entitaet_id: ${zw.entitaet_id} existiert nicht (${zw.entitaet})`);
    }
  });

  data.regelzahlungen?.forEach((rz) => {
    if (rz.darlehen_id && !darlehen.has(rz.darlehen_id)) {
      errors.push(`regelzahlungen.${rz.regelzahlung_id}.darlehen_id: ${rz.darlehen_id} existiert nicht`);
    }
  });
```

> Hinweis: `eigentumsanteile`-Items dürfen auch `extern: true` ohne `person_id` tragen (Zukunftsfall). Der generische `validateField` lässt `eigentumsanteile` als `array` durch; die Item-Form prüft `pruefeAnteile`. Damit der generische Validator `extern`/Objekt-Items nicht als „unbekanntes Feld" ablehnt, bleibt `eigentumsanteile` bewusst nur `type: array` im `fields`-Block.

- [ ] **Step 6: `loadMasterData` um neue Dateien erweitern (robust gegen fehlende Datei)**

In `tools/validator.mjs` eine tolerante Lesefunktion ergänzen und `loadMasterData` erweitern:

```js
async function readJsonOptional(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readJsonlOptional(path) {
  try {
    const text = await readFile(path, "utf8");
    return text.split(/\r?\n/).filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
```

Und in `loadMasterData` die Rückgabe ergänzen:

```js
    immobilien: await readJsonOptional(new URL("immobilien.json", root), []),
    darlehen: await readJsonOptional(new URL("darlehen.json", root), []),
    vermoegenswerte: await readJsonOptional(new URL("vermoegenswerte.json", root), []),
    zeitwerte: await readJsonlOptional(new URL("zeitwerte.jsonl", root)),
```

- [ ] **Step 7: Tests ausführen, Erfolg bestätigen**

Run: `node --test tests/m5-validator.test.mjs`
Expected: PASS (alle 6 Tests).

- [ ] **Step 8: Bestehende Tests + M1-Validierung weiterhin grün**

Run: `npm test && npm run validate:m1`
Expected: alle Tests PASS; `M1 validation passed` (Dateien fehlen noch → `loadMasterData` liefert leere Listen, keine Fehler).

- [ ] **Step 9: Commit**

```bash
git add tools/validator.mjs tests/m5-validator.test.mjs
git commit -m "feat(m5): Validator für Immobilien, Darlehen, Vermögenswerte, Zeitwerte + Bruch-Anteile"
```

---

## Task 3: Berechnungs-Bibliothek `app/vermoegen.mjs` — Zeitwerte, Saldo, Restschuld

**Files:**
- Create: `app/vermoegen.mjs`
- Test: `tests/m5-vermoegen.test.mjs`

Reine, DOM-freie Funktionen analog `app/cashflow.mjs`. `toCents` und `addInterval` aus `cashflow.mjs` wiederverwenden (DRY).

- [ ] **Step 1: Failing-Test für Zeitwert-Auflösung, Konto-Saldo, Restschuld schreiben**

`tests/m5-vermoegen.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { aktuellerZeitwert, kontoWert, restschuldHeute, anteilWertCents } from "../app/vermoegen.mjs";

test("aktuellerZeitwert nimmt den jüngsten Eintrag pro (entitaet_id, feld)", () => {
  const zw = [
    { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-01-31", qualitaet: "belegt" },
    { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1200.00", standdatum: "2026-03-31", qualitaet: "belegt" },
  ];
  const result = aktuellerZeitwert(zw, "konto", "KTO-001", "kontostand");
  assert.equal(result.wert, "1200.00");
  assert.equal(result.standdatum, "2026-03-31");
});

test("kontoWert für Cash-Konto: Anker + Buchungen nach Standdatum", () => {
  const konto = { konto_id: "KTO-001", kontotyp: "giro", liquiditaetsrelevant: true };
  const zw = [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-01-31", qualitaet: "belegt" }];
  const tx = [
    { konto_id: "KTO-001", buchungsdatum: "2026-01-15", betrag: "500.00", ist_transfer: false }, // vor Anker -> ignoriert
    { konto_id: "KTO-001", buchungsdatum: "2026-02-10", betrag: "-200.00", ist_transfer: false },
    { konto_id: "KTO-001", buchungsdatum: "2026-02-20", betrag: "50.00", ist_transfer: true }, // Transfer zählt mit (Saldo, nicht Cashflow)
  ];
  const result = kontoWert(konto, zw, tx, "2026-03-01");
  // 1000.00 - 200.00 + 50.00 = 850.00
  assert.equal(result.wert_cents, 85000);
  assert.equal(result.basis, "anker+buchungen");
});

test("kontoWert für Depot: nur depotwert, keine Buchungssumme", () => {
  const konto = { konto_id: "KTO-006", kontotyp: "depot", liquiditaetsrelevant: true };
  const zw = [{ entitaet: "konto", entitaet_id: "KTO-006", feld: "depotwert", wert: "25000.00", standdatum: "2026-02-01", qualitaet: "belegt" }];
  const tx = [{ konto_id: "KTO-006", buchungsdatum: "2026-02-15", betrag: "-100.00", ist_transfer: false }];
  const result = kontoWert(konto, zw, tx, "2026-03-01");
  assert.equal(result.wert_cents, 2500000);
  assert.equal(result.basis, "depotwert");
});

test("kontoWert für bar: kein Beitrag", () => {
  const konto = { konto_id: "KTO-009", kontotyp: "bar", liquiditaetsrelevant: false };
  const result = kontoWert(konto, [], [], "2026-03-01");
  assert.equal(result.wert_cents, null);
  assert.equal(result.basis, "bar-ignoriert");
});

test("kontoWert ohne Anker: fehlend markiert", () => {
  const konto = { konto_id: "KTO-001", kontotyp: "giro", liquiditaetsrelevant: true };
  const result = kontoWert(konto, [], [], "2026-03-01");
  assert.equal(result.wert_cents, null);
  assert.equal(result.basis, "anker-fehlt");
});

test("restschuldHeute: Annuität, eine Monatsrate nach Anker", () => {
  // Anker 200000.00 zum 2026-01-31, Zins 1.80% p.a., Rate 800.00/Monat
  const dar = { darlehen_id: "DAR-001", status: "aktiv", anfangsbetrag: "300000.00", anfangsdatum: "2020-01-31", zinssatz: "1.80", sollrate: "800.00", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  const zw = [{ entitaet: "darlehen", entitaet_id: "DAR-001", feld: "restschuld", wert: "200000.00", standdatum: "2026-01-31", qualitaet: "belegt" }];
  // Eine Fälligkeit (2026-02-29? Anker-Tag 31 -> Februar clamped 28) bis today 2026-03-01
  const result = restschuldHeute(dar, zw, "2026-03-01");
  // Zins Monat = round(20000000 * 1.80 / 100 / 12) = round(300000) = 30000 Cent = 300.00
  // Tilgung = 80000 - 30000 = 50000 Cent; Restschuld = 20000000 - 50000 = 19950000
  assert.equal(result.wert_cents, 19950000);
  assert.equal(result.basis, "anker+tilgung");
});

test("restschuldHeute ohne Anker: fehlend markiert", () => {
  const dar = { darlehen_id: "DAR-001", status: "aktiv", anfangsbetrag: "300000.00", anfangsdatum: "2020-01-31", zinssatz: "1.80", sollrate: "800.00", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  const result = restschuldHeute(dar, [], "2026-03-01");
  assert.equal(result.wert_cents, null);
  assert.equal(result.basis, "anker-fehlt");
});

test("anteilWertCents summiert nur person_id-Anteile, externe fallen raus", () => {
  // 90000.00 Marktwert, 2/3 PER-001, 1/3 extern
  const cents = anteilWertCents(9000000, [
    { person_id: "PER-001", zaehler: 2, nenner: 3 },
    { extern: true, zaehler: 1, nenner: 3 },
  ]);
  assert.equal(cents, 6000000);
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `node --test tests/m5-vermoegen.test.mjs`
Expected: FAIL ("does not provide an export named 'aktuellerZeitwert'").

- [ ] **Step 3: `app/vermoegen.mjs` mit den Kernfunktionen implementieren**

`app/vermoegen.mjs`:

```js
// app/vermoegen.mjs
// Reine, deterministische Vermögens-/Nettovermögens-Mathematik. Kein DOM, keine Node-Abhängigkeiten.
// Eine getestete Funktion an zwei Aufrufstellen: Browser (app/main.js) und Node (tests/).
// Liegt unter app/, weil der Webserver nur das App-Verzeichnis ausliefert (ADR 0009/0012).
// Modell-Begründungen: ADR 0013 (Anker + Reconciliation), ADR 0014 (Nettovermögen Haushaltssicht).

import { toCents, addInterval } from "./cashflow.mjs";

const PERIODEN_PRO_JAHR = { tag: 365, woche: 52, monat: 12, jahr: 1 };

export function aktuellerZeitwert(zeitwerte, entitaet, entitaetId, feld) {
  let best = null;
  for (const zw of zeitwerte ?? []) {
    if (zw.entitaet !== entitaet || zw.entitaet_id !== entitaetId || zw.feld !== feld) continue;
    if (best === null || zw.standdatum > best.standdatum) best = zw;
  }
  return best;
}

// Konto-Wert nach Kontotyp (ADR 0013).
export function kontoWert(konto, zeitwerte, transaktionen, today) {
  if (konto.kontotyp === "bar") {
    return { wert_cents: null, basis: "bar-ignoriert", standdatum: null, qualitaet: null };
  }
  if (konto.kontotyp === "depot") {
    const dw = aktuellerZeitwert(zeitwerte, "konto", konto.konto_id, "depotwert");
    if (!dw) return { wert_cents: null, basis: "depotwert-fehlt", standdatum: null, qualitaet: null };
    return { wert_cents: toCents(dw.wert), basis: "depotwert", standdatum: dw.standdatum, qualitaet: dw.qualitaet };
  }
  // giro | spar | tagesgeld | kreditkarte: Anker + Buchungen danach
  const anker = aktuellerZeitwert(zeitwerte, "konto", konto.konto_id, "kontostand");
  if (!anker) return { wert_cents: null, basis: "anker-fehlt", standdatum: null, qualitaet: null };
  let summe = toCents(anker.wert);
  for (const tx of transaktionen ?? []) {
    if (tx.konto_id !== konto.konto_id) continue;
    if (tx.buchungsdatum <= anker.standdatum) continue;
    if (tx.buchungsdatum > today) continue;
    summe += toCents(tx.betrag);
  }
  return { wert_cents: summe, basis: "anker+buchungen", standdatum: anker.standdatum, qualitaet: anker.qualitaet };
}

// Restschuld nach Annuität: Anker + Tilgung der seit Anker fälligen Perioden (ADR 0013).
export function restschuldHeute(darlehen, zeitwerte, today) {
  const anker = aktuellerZeitwert(zeitwerte, "darlehen", darlehen.darlehen_id, "restschuld");
  if (!anker) return { wert_cents: null, basis: "anker-fehlt", standdatum: null, qualitaet: null };
  let rest = toCents(anker.wert);
  const rateCents = toCents(darlehen.sollrate);
  const zinssatz = Number(darlehen.zinssatz); // % p.a.
  const ppj = PERIODEN_PRO_JAHR[darlehen.rhythmus_einheit] / darlehen.rhythmus_intervall;
  for (const datum of faelligkeiten(darlehen, anker.standdatum, today)) {
    const zinsCents = Math.round((rest * zinssatz) / 100 / ppj);
    const tilgung = rateCents - zinsCents;
    rest -= tilgung;
    if (rest < 0) rest = 0;
  }
  return { wert_cents: rest, basis: "anker+tilgung", standdatum: anker.standdatum, qualitaet: anker.qualitaet };
}

// Fälligkeitstermine eines Darlehens strikt nach `nach` (exklusiv) bis `bis` (inklusiv).
export function faelligkeiten(darlehen, nach, bis) {
  const dates = [];
  let step = 0;
  let guard = 0;
  let cur = darlehen.anfangsdatum;
  while (cur <= bis && guard < 100000) {
    if (cur > nach) dates.push(cur);
    step++;
    cur = addInterval(darlehen.anfangsdatum, darlehen.rhythmus_einheit, darlehen.rhythmus_intervall * step);
    guard++;
  }
  return dates;
}

// Anteilsgewichteter Wert in Cent — nur Anteile MIT person_id zählen (ADR 0014).
export function anteilWertCents(marktwertCents, eigentumsanteile) {
  let summe = 0;
  for (const a of eigentumsanteile ?? []) {
    if (a.extern === true || !a.person_id) continue;
    summe += Math.round((marktwertCents * a.zaehler) / a.nenner);
  }
  return summe;
}
```

- [ ] **Step 4: Tests ausführen, Erfolg bestätigen**

Run: `node --test tests/m5-vermoegen.test.mjs`
Expected: PASS (alle 8 Tests).

- [ ] **Step 5: Commit**

```bash
git add app/vermoegen.mjs tests/m5-vermoegen.test.mjs
git commit -m "feat(m5): reine Berechnung für Zeitwerte, Konto-Saldo, Restschuld, Anteilswert"
```

---

## Task 4: Nettovermögen-Aggregat + M5-Checks

**Files:**
- Modify: `app/vermoegen.mjs`
- Test: `tests/m5-vermoegen.test.mjs`

- [ ] **Step 1: Failing-Test für `computeNettovermoegen` und `computeVermoegenChecks` schreiben**

In `tests/m5-vermoegen.test.mjs` ergänzen (Import erweitern):

```js
import { computeNettovermoegen, computeVermoegenChecks, STANDDATUM_SCHWELLEN } from "../app/vermoegen.mjs";

function vollDaten() {
  return {
    personen: [{ person_id: "PER-001", name: "Person A", status: "aktiv" }, { person_id: "PER-002", name: "Person B", status: "aktiv" }],
    konten: [
      { konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" },
      { konto_id: "KTO-006", name: "Depot", kontotyp: "depot", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" },
    ],
    transaktionen: [{ konto_id: "KTO-001", buchungsdatum: "2026-02-10", betrag: "-200.00", ist_transfer: false }],
    immobilien: [{ immobilie_id: "IMM-001", bezeichnung: "EFH", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }], status: "aktiv" }],
    darlehen: [{ darlehen_id: "DAR-001", bezeichnung: "Hyp", status: "aktiv", anfangsbetrag: "300000.00", anfangsdatum: "2020-01-31", zinssatz: "1.80", sollrate: "800.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, immobilie_id: "IMM-001" }],
    vermoegenswerte: [{ vermoegenswert_id: "VMW-001", typ: "edelmetall", bezeichnung: "Gold", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }], status: "aktiv" }],
    regelzahlungen: [],
    zeitwerte: [
      { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-01-31", qualitaet: "belegt" },
      { entitaet: "konto", entitaet_id: "KTO-006", feld: "depotwert", wert: "25000.00", standdatum: "2026-02-01", qualitaet: "belegt" },
      { entitaet: "immobilie", entitaet_id: "IMM-001", feld: "marktwert", wert: "400000.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" },
      { entitaet: "darlehen", entitaet_id: "DAR-001", feld: "restschuld", wert: "200000.00", standdatum: "2026-01-31", qualitaet: "belegt" },
      { entitaet: "vermoegenswert", entitaet_id: "VMW-001", feld: "marktwert", wert: "5000.00", standdatum: "2026-02-01", qualitaet: "geschaetzt" },
    ],
  };
}

test("computeNettovermoegen summiert Aktiva minus Passiva", () => {
  const r = computeNettovermoegen(vollDaten(), "2026-03-01");
  // Aktiva: Giro 800.00 + Depot 25000.00 + Immobilie 400000.00 + Gold 5000.00 = 430800.00
  // Passiva: Restschuld 199500.00 (Zins 300, Tilgung 500 für eine Februar-Rate)
  // Netto = 430800.00 - 199500.00 = 231300.00
  assert.equal(r.aktiva_cents, 43080000);
  assert.equal(r.passiva_cents, 19950000);
  assert.equal(r.netto_cents, 23130000);
  assert.ok(r.positionen.length >= 5);
});

test("computeVermoegenChecks meldet fehlenden Marktwert und fehlenden Anker", () => {
  const daten = vollDaten();
  daten.zeitwerte = daten.zeitwerte.filter((z) => !(z.entitaet === "immobilie") && !(z.entitaet === "konto" && z.entitaet_id === "KTO-001"));
  const checks = computeVermoegenChecks(daten, "2026-03-01");
  assert.ok(checks.some((c) => c.art === "marktwert-fehlt" && c.entitaet_id === "IMM-001"));
  assert.ok(checks.some((c) => c.art === "anker-fehlt" && c.entitaet_id === "KTO-001"));
});

test("computeVermoegenChecks meldet aktives Darlehen ohne Raten-Regelzahlung", () => {
  const checks = computeVermoegenChecks(vollDaten(), "2026-03-01");
  assert.ok(checks.some((c) => c.art === "darlehen-ohne-regelzahlung" && c.entitaet_id === "DAR-001"));
});

test("computeVermoegenChecks: Reconciliation-Drift bei zwei belegten Kontoständen", () => {
  const daten = vollDaten();
  daten.zeitwerte.push({ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "5000.00", standdatum: "2026-02-28", qualitaet: "belegt" });
  // gebucht zwischen 01-31 und 02-28: -200.00 -> erwartet 800.00, belegt 5000.00 -> Drift
  const checks = computeVermoegenChecks(daten, "2026-03-01");
  assert.ok(checks.some((c) => c.art === "reconciliation-drift" && c.entitaet_id === "KTO-001"));
});

test("computeVermoegenChecks: veralteter Marktwert je Schwelle", () => {
  const daten = vollDaten();
  // Immobilie marktwert standdatum 2026-01-01, today weit später -> > 12 Monate
  const checks = computeVermoegenChecks(daten, "2027-06-01");
  assert.ok(checks.some((c) => c.art === "bewertung-veraltet" && c.entitaet_id === "IMM-001"));
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `node --test tests/m5-vermoegen.test.mjs`
Expected: FAIL ("does not provide an export named 'computeNettovermoegen'").

- [ ] **Step 3: Aggregat + Checks in `app/vermoegen.mjs` implementieren**

Am Ende von `app/vermoegen.mjs` ergänzen:

```js
export const STANDDATUM_SCHWELLEN = {
  immobilie: 12,
  vermoegenswert_edelmetall: 6,
  vermoegenswert_beteiligung: 12,
  vermoegenswert_sonstiges: 12,
  depot_aktiv: 1,
  depot_ruhig: 3,
};

function monateZwischen(vonIso, bisIso) {
  const [vy, vm, vd] = vonIso.split("-").map(Number);
  const [by, bm, bd] = bisIso.split("-").map(Number);
  let m = (by - vy) * 12 + (bm - vm);
  if (bd < vd) m -= 1;
  return m;
}

function hatDepotBewegungLetztenMonat(kontoId, transaktionen, today) {
  const grenze = addInterval(today, "monat", -1);
  return (transaktionen ?? []).some((tx) => tx.konto_id === kontoId && tx.buchungsdatum > grenze && tx.buchungsdatum <= today);
}

export function computeNettovermoegen(data, today) {
  const positionen = [];
  let aktiva = 0;
  let passiva = 0;
  let belegt = 0, geschaetzt = 0, fehlend = 0;

  for (const konto of data.konten ?? []) {
    if (konto.status === "geschlossen") continue;
    if (konto.kontotyp === "bar") continue;
    const w = kontoWert(konto, data.zeitwerte, data.transaktionen, today);
    if (w.wert_cents === null) { fehlend++; positionen.push({ klasse: "konto", id: konto.konto_id, name: konto.name, wert_cents: 0, basis: w.basis, qualitaet: null, standdatum: null, fehlt: true }); continue; }
    aktiva += w.wert_cents;
    if (w.qualitaet === "belegt") belegt++; else if (w.qualitaet === "geschaetzt") geschaetzt++;
    positionen.push({ klasse: "konto", id: konto.konto_id, name: konto.name, wert_cents: w.wert_cents, basis: w.basis, qualitaet: w.qualitaet, standdatum: w.standdatum, fehlt: false });
  }

  for (const imm of data.immobilien ?? []) {
    if (imm.status === "verkauft") continue;
    const mw = aktuellerZeitwert(data.zeitwerte, "immobilie", imm.immobilie_id, "marktwert");
    if (!mw) { fehlend++; positionen.push({ klasse: "immobilie", id: imm.immobilie_id, name: imm.bezeichnung, wert_cents: 0, basis: "marktwert-fehlt", qualitaet: null, standdatum: null, fehlt: true }); continue; }
    const cents = anteilWertCents(toCents(mw.wert), imm.eigentumsanteile);
    aktiva += cents;
    if (mw.qualitaet === "belegt") belegt++; else geschaetzt++;
    positionen.push({ klasse: "immobilie", id: imm.immobilie_id, name: imm.bezeichnung, wert_cents: cents, basis: "marktwert", qualitaet: mw.qualitaet, standdatum: mw.standdatum, fehlt: false });
  }

  for (const vmw of data.vermoegenswerte ?? []) {
    if (vmw.status === "veraeussert") continue;
    const mw = aktuellerZeitwert(data.zeitwerte, "vermoegenswert", vmw.vermoegenswert_id, "marktwert");
    if (!mw) { fehlend++; positionen.push({ klasse: "vermoegenswert", id: vmw.vermoegenswert_id, name: vmw.bezeichnung, wert_cents: 0, basis: "marktwert-fehlt", qualitaet: null, standdatum: null, fehlt: true }); continue; }
    const cents = anteilWertCents(toCents(mw.wert), vmw.eigentumsanteile);
    aktiva += cents;
    if (mw.qualitaet === "belegt") belegt++; else geschaetzt++;
    positionen.push({ klasse: "vermoegenswert", id: vmw.vermoegenswert_id, name: vmw.bezeichnung, wert_cents: cents, basis: "marktwert", qualitaet: mw.qualitaet, standdatum: mw.standdatum, fehlt: false });
  }

  for (const dar of data.darlehen ?? []) {
    if (dar.status === "abgeloest") continue;
    const r = restschuldHeute(dar, data.zeitwerte, today);
    if (r.wert_cents === null) { fehlend++; positionen.push({ klasse: "darlehen", id: dar.darlehen_id, name: dar.bezeichnung, wert_cents: 0, basis: r.basis, qualitaet: null, standdatum: null, fehlt: true }); continue; }
    passiva += r.wert_cents;
    if (r.qualitaet === "belegt") belegt++; else if (r.qualitaet === "geschaetzt") geschaetzt++;
    positionen.push({ klasse: "darlehen", id: dar.darlehen_id, name: dar.bezeichnung, wert_cents: -r.wert_cents, basis: r.basis, qualitaet: r.qualitaet, standdatum: r.standdatum, fehlt: false });
  }

  return {
    aktiva_cents: aktiva,
    passiva_cents: passiva,
    netto_cents: aktiva - passiva,
    positionen,
    qualitaet: { belegt, geschaetzt, fehlend },
  };
}

export function computeVermoegenChecks(data, today) {
  const checks = [];

  for (const konto of data.konten ?? []) {
    if (konto.status === "geschlossen" || konto.kontotyp === "bar" || konto.kontotyp === "depot") continue;
    if (!konto.liquiditaetsrelevant) continue;
    const anker = aktuellerZeitwert(data.zeitwerte, "konto", konto.konto_id, "kontostand");
    if (!anker) {
      checks.push({ art: "anker-fehlt", entitaet: "konto", entitaet_id: konto.konto_id, text: `Konto ${konto.name}: kein belegter Kontostand` });
      continue;
    }
    // Reconciliation über aufeinanderfolgende belegte Stände
    const staende = (data.zeitwerte ?? [])
      .filter((z) => z.entitaet === "konto" && z.entitaet_id === konto.konto_id && z.feld === "kontostand")
      .sort((a, b) => a.standdatum.localeCompare(b.standdatum));
    for (let i = 1; i < staende.length; i++) {
      const von = staende[i - 1], bis = staende[i];
      let gebucht = 0;
      for (const tx of data.transaktionen ?? []) {
        if (tx.konto_id !== konto.konto_id) continue;
        if (tx.buchungsdatum > von.standdatum && tx.buchungsdatum <= bis.standdatum) gebucht += toCents(tx.betrag);
      }
      const erwartet = toCents(von.wert) + gebucht;
      if (erwartet !== toCents(bis.wert)) {
        checks.push({ art: "reconciliation-drift", entitaet: "konto", entitaet_id: konto.konto_id, text: `Konto ${konto.name}: Buchungen passen nicht zum Kontoauszug ${bis.standdatum} (erwartet ${(erwartet / 100).toFixed(2)}, belegt ${bis.wert})` });
      }
    }
  }

  for (const konto of data.konten ?? []) {
    if (konto.kontotyp !== "depot" || konto.status === "geschlossen") continue;
    const dw = aktuellerZeitwert(data.zeitwerte, "konto", konto.konto_id, "depotwert");
    if (!dw) { checks.push({ art: "marktwert-fehlt", entitaet: "konto", entitaet_id: konto.konto_id, text: `Depot ${konto.name}: kein Depotwert` }); continue; }
    const aktiv = hatDepotBewegungLetztenMonat(konto.konto_id, data.transaktionen, today);
    const schwelle = aktiv ? STANDDATUM_SCHWELLEN.depot_aktiv : STANDDATUM_SCHWELLEN.depot_ruhig;
    if (monateZwischen(dw.standdatum, today) >= schwelle) {
      checks.push({ art: "bewertung-veraltet", entitaet: "konto", entitaet_id: konto.konto_id, text: `Depot ${konto.name}: Depotwert vom ${dw.standdatum} älter als ${schwelle} Monat(e)` });
    }
  }

  for (const imm of data.immobilien ?? []) {
    if (imm.status === "verkauft") continue;
    const mw = aktuellerZeitwert(data.zeitwerte, "immobilie", imm.immobilie_id, "marktwert");
    if (!mw) { checks.push({ art: "marktwert-fehlt", entitaet: "immobilie", entitaet_id: imm.immobilie_id, text: `Immobilie ${imm.bezeichnung}: kein Marktwert` }); continue; }
    if (monateZwischen(mw.standdatum, today) >= STANDDATUM_SCHWELLEN.immobilie) {
      checks.push({ art: "bewertung-veraltet", entitaet: "immobilie", entitaet_id: imm.immobilie_id, text: `Immobilie ${imm.bezeichnung}: Marktwert vom ${mw.standdatum} älter als ${STANDDATUM_SCHWELLEN.immobilie} Monate` });
    }
  }

  for (const vmw of data.vermoegenswerte ?? []) {
    if (vmw.status === "veraeussert") continue;
    const mw = aktuellerZeitwert(data.zeitwerte, "vermoegenswert", vmw.vermoegenswert_id, "marktwert");
    if (!mw) { checks.push({ art: "marktwert-fehlt", entitaet: "vermoegenswert", entitaet_id: vmw.vermoegenswert_id, text: `Vermögenswert ${vmw.bezeichnung}: kein Marktwert` }); continue; }
    const schwelle = STANDDATUM_SCHWELLEN[`vermoegenswert_${vmw.typ}`] ?? 12;
    if (monateZwischen(mw.standdatum, today) >= schwelle) {
      checks.push({ art: "bewertung-veraltet", entitaet: "vermoegenswert", entitaet_id: vmw.vermoegenswert_id, text: `Vermögenswert ${vmw.bezeichnung}: Wert vom ${mw.standdatum} älter als ${schwelle} Monat(e)` });
    }
  }

  for (const dar of data.darlehen ?? []) {
    if (dar.status === "abgeloest") continue;
    const anker = aktuellerZeitwert(data.zeitwerte, "darlehen", dar.darlehen_id, "restschuld");
    if (!anker) checks.push({ art: "anker-fehlt", entitaet: "darlehen", entitaet_id: dar.darlehen_id, text: `Darlehen ${dar.bezeichnung}: kein belegter Restschuldstand` });
    const hatRate = (data.regelzahlungen ?? []).some((rz) => rz.darlehen_id === dar.darlehen_id && rz.status === "bestaetigt");
    if (!hatRate) checks.push({ art: "darlehen-ohne-regelzahlung", entitaet: "darlehen", entitaet_id: dar.darlehen_id, text: `Darlehen ${dar.bezeichnung}: Rate nicht in der Cashflow-Prognose — Regelzahlung anlegen?` });
  }

  return checks;
}
```

- [ ] **Step 4: Tests ausführen, Erfolg bestätigen**

Run: `node --test tests/m5-vermoegen.test.mjs`
Expected: PASS (alle Tests inkl. der neuen 5).

- [ ] **Step 5: Gesamte Test-Suite grün**

Run: `npm test`
Expected: alle Tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/vermoegen.mjs tests/m5-vermoegen.test.mjs
git commit -m "feat(m5): Nettovermögen-Aggregat und M5-Datenqualitäts-Checks"
```

---

## Task 5: App-Ansicht „Vermögen" + Checks-Integration + Demo-Daten

**Files:**
- Modify: `app/main.js`
- Modify: `app/i18n.js`
- Modify: `app/review-data.js`
- Modify: `app/styles.css` (nur falls nötig)

- [ ] **Step 1: Demo-Daten in `app/review-data.js` ergänzen**

Im Objekt `window.FINANCE_REVIEW_DATA` neue, klar als Demo markierte Felder ergänzen (analog zu den Demo-Transaktionen; im Wrap-up zu entfernen). `bundleVersion` auf `"m5-review-1"` und `label` auf `"M5 Review-Daten (Demo)"` setzen. Konkrete Demo-Werte (passend zu den bestehenden Demo-Konten KTO-001/KTO-006):

```js
  immobilien: [
    { immobilie_id: "IMM-001", bezeichnung: "DEMO Eigenheim", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 2 }, { person_id: "PER-002", zaehler: 1, nenner: 2 }], status: "aktiv", quelle_hinweis: "DEMO" },
  ],
  darlehen: [
    { darlehen_id: "DAR-001", bezeichnung: "DEMO Hypothek", status: "aktiv", anfangsbetrag: "300000.00", anfangsdatum: "2020-01-31", zinssatz: "1.80", sollrate: "1000.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, immobilie_id: "IMM-001", konto_id: "KTO-003", quelle_hinweis: "DEMO" },
  ],
  vermoegenswerte: [
    { vermoegenswert_id: "VMW-001", typ: "edelmetall", bezeichnung: "DEMO Gold", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }], status: "aktiv", quelle_hinweis: "DEMO" },
  ],
  zeitwerte: [
    { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "3500.00", standdatum: "2026-05-01", qualitaet: "belegt", quelle_hinweis: "DEMO" },
    { entitaet: "konto", entitaet_id: "KTO-006", feld: "depotwert", wert: "25000.00", standdatum: "2026-05-01", qualitaet: "geschaetzt", quelle_hinweis: "DEMO" },
    { entitaet: "immobilie", entitaet_id: "IMM-001", feld: "marktwert", wert: "450000.00", standdatum: "2026-01-01", qualitaet: "geschaetzt", quelle_hinweis: "DEMO" },
    { entitaet: "darlehen", entitaet_id: "DAR-001", feld: "restschuld", wert: "250000.00", standdatum: "2026-05-01", qualitaet: "belegt", quelle_hinweis: "DEMO" },
    { entitaet: "vermoegenswert", entitaet_id: "VMW-001", feld: "marktwert", wert: "8000.00", standdatum: "2026-04-01", qualitaet: "geschaetzt", quelle_hinweis: "DEMO" },
  ],
```

- [ ] **Step 2: Spiegel-Datendateien in `data/master/` anlegen**

Inhaltlich identische Demo-Daten als echte Master-Dateien anlegen, damit `npm run validate:m1` die neuen Entitäten prüft:
- `data/master/immobilien.json` (Array mit IMM-001 wie oben)
- `data/master/darlehen.json` (Array mit DAR-001 wie oben)
- `data/master/vermoegenswerte.json` (Array mit VMW-001 wie oben)
- `data/master/zeitwerte.jsonl` (eine Zeile pro Zeitwert-Objekt oben)

- [ ] **Step 3: Validierung der Master-Demo-Daten**

Run: `npm run validate:m1`
Expected: `M1 validation passed`.

- [ ] **Step 4: i18n-Labels ergänzen**

In `app/i18n.js` für beide Sprachen (Struktur wie bei `nav.cashflow`/`cashflow.*` vorhanden) ergänzen: `nav.vermoegen`, `vermoegen.title`, `vermoegen.lead`, `vermoegen.netto`, `vermoegen.aktiva`, `vermoegen.passiva`, `vermoegen.position`, `vermoegen.basis`, `vermoegen.standOhne` ("kein Wert"), `vermoegen.qualityBelegt`, `vermoegen.qualityGeschaetzt`, `vermoegen.qualityFehlend`, `vermoegen.incompleteNote` ("Bargeld zählt nicht; geplante Sondertilgungen/Zukunft folgen in M6."). Deutsche Texte als Default, englische analog (Projekt nutzt zweisprachige i18n).

- [ ] **Step 5: Nav-Punkt + Routing in `app/main.js`**

In `app/main.js`:
1. Import oben ergänzen: `import { computeNettovermoegen, computeVermoegenChecks } from "./vermoegen.mjs";`
2. In `navItems` nach dem `regelzahlungen`-Eintrag ergänzen: `["vermoegen", "nav.vermoegen", "▲"]` (Glyphe provisorisch; SVG-Icon-Durchgang ist vorgemerkt).
3. In der Render-Weiche (bei `if (state.view === "cashflow") return renderCashflow();`) ergänzen: `if (state.view === "vermoegen") return renderVermoegen();`

- [ ] **Step 6: `renderVermoegen()` implementieren**

In `app/main.js` eine Funktion analog zu `renderCashflow()` (Muster: `renderPageHead`, `escapeHtml`, `t`, Chips, Tabelle). Geld via Cent→`(cents/100).toFixed(2)`. Struktur:
- Kopf: Netto-Summe groß, darunter Aktiva/Passiva.
- Qualitäts-Chips: `belegt`/`geschaetzt`/`fehlend` aus `result.qualitaet`.
- Hinweis `vermoegen.incompleteNote`.
- Positions-Tabelle: Klasse, Name, Wert (Cent→EUR), Basis, Standdatum, Qualität; fehlende Positionen sichtbar als „kein Wert" markiert (`pos.fehlt`).

```js
function renderVermoegen() {
  const today = localTodayIso();
  const r = computeNettovermoegen(data, today);
  const eur = (c) => (c / 100).toFixed(2);
  const rows = r.positionen.map((p) => `
    <tr>
      <td>${escapeHtml(t(`vermoegen.klasse.${p.klasse}`))}</td>
      <td>${escapeHtml(p.name)}</td>
      <td class="amount">${p.fehlt ? `<span class="muted">${escapeHtml(t("vermoegen.standOhne"))}</span>` : escapeHtml(eur(p.wert_cents))}</td>
      <td>${escapeHtml(p.standdatum ?? "—")}</td>
      <td>${p.qualitaet ? `<span class="chip ${p.qualitaet === "belegt" ? "success" : "neutral"}">${escapeHtml(t(`vermoegen.quality${p.qualitaet === "belegt" ? "Belegt" : "Geschaetzt"}`))}</span>` : `<span class="chip review">? ${escapeHtml(t("vermoegen.qualityFehlend"))}</span>`}</td>
    </tr>`).join("");
  return `
    ${renderPageHead(t("vermoegen.title"), t("vermoegen.lead"))}
    <div class="cashflow-summary">
      <div><strong>${escapeHtml(t("vermoegen.netto"))}</strong> <span class="amount">${escapeHtml(eur(r.netto_cents))}</span></div>
      <div>${escapeHtml(t("vermoegen.aktiva"))}: ${escapeHtml(eur(r.aktiva_cents))} · ${escapeHtml(t("vermoegen.passiva"))}: ${escapeHtml(eur(r.passiva_cents))}</div>
      <div>
        <span class="chip success">• ${r.qualitaet.belegt} ${escapeHtml(t("vermoegen.qualityBelegt"))}</span>
        <span class="chip neutral">• ${r.qualitaet.geschaetzt} ${escapeHtml(t("vermoegen.qualityGeschaetzt"))}</span>
        <span class="chip review">? ${r.qualitaet.fehlend} ${escapeHtml(t("vermoegen.qualityFehlend"))}</span>
      </div>
    </div>
    <p class="page-lead" style="margin-top: 12px;">${escapeHtml(t("vermoegen.incompleteNote"))}</p>
    <table class="data-table">
      <thead><tr>
        <th>${escapeHtml(t("vermoegen.klasseHead"))}</th>
        <th>${escapeHtml(t("vermoegen.position"))}</th>
        <th class="amount">${escapeHtml(t("vermoegen.wert"))}</th>
        <th>${escapeHtml(t("vermoegen.stand"))}</th>
        <th>${escapeHtml(t("vermoegen.basis"))}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}
```

> Zusätzliche i18n-Keys aus diesem Snippet mit aufnehmen: `vermoegen.klasse.konto|immobilie|vermoegenswert|darlehen`, `vermoegen.klasseHead`, `vermoegen.wert`, `vermoegen.stand`.

- [ ] **Step 7: M5-Checks in den Checks-Bereich einspeisen**

Im bestehenden `renderChecks()` (Ansicht `checks`) die M5-Checks mit aufnehmen: `const m5 = computeVermoegenChecks(data, localTodayIso());` und diese Liste in die vorhandene Checks-Darstellung einreihen (gleiche Chip-/Listendarstellung wie Importfehler). Falls der Arbeitsstatus-Streifen Zähler zeigt, die Anzahl `m5.length` analog zu bestehenden Chips ergänzen. Den genauen Einhängepunkt an der bestehenden Checks-Aggregation in `main.js` orientieren (nicht neu erfinden — bestehende Struktur wiederverwenden).

- [ ] **Step 8: Syntaxprüfung aller berührten App-Dateien**

Run:
```bash
node --check app/main.js && node --check app/vermoegen.mjs && node --check app/i18n.js && node --check app/review-data.js
```
Expected: keine Ausgabe (alle ok).

- [ ] **Step 9: Visuelle Prüfung über lokalen Webserver**

Run: `python3 -m http.server 8765 --directory app` (oder bestehender Preview-Server), dann im Browser `http://localhost:8765/` öffnen.
Expected: Nav-Punkt „Vermögen" erscheint; Ansicht zeigt Netto = Aktiva − Passiva mit Demo-Daten; Qualitäts-Chips sichtbar; Checks-Bereich zeigt M5-Checks (z. B. Darlehen ohne Regelzahlung). **Nicht** per `file://` prüfen (ES-Module, ADR 0012). Bei CSS-Cache: hart neu laden.

- [ ] **Step 10: Commit**

```bash
git add app/ data/master/
git commit -m "feat(m5): App-Ansicht Vermögen, M5-Checks, Demo-Daten"
```

---

## Task 6: Interviewgeführter Stammdaten-Erfassungs-Agent (Skill-Doku)

**Files:**
- Create: `docs/skills/stammdaten-erfassung-agent.md`

Allgemeiner, schema-getriebener Agent (nicht M5-spezifisch). Beschreibt das Interview-Muster für die Erfassung beliebiger Stammdaten mit Schema. Format/Stil an `docs/skills/regelzahlung-agent.md` und `docs/skills/import-agent.md` anlehnen.

- [ ] **Step 1: Skill-Dokument schreiben**

Inhalt von `docs/skills/stammdaten-erfassung-agent.md` (Kernpunkte, in Prosa + Listen ausformuliert):
- **Zweck:** Den Nutzer interviewgeführt durch Erfassung und Validierung von Stammdaten leiten. Nutzer stößt an, der Agent führt. Schema-getrieben: gilt für Personen, Konten, Kategorien, Regelzahlungen, Immobilien, Darlehen, Vermögenswerte, Zeitwerte (und später Versicherungen/Renten).
- **Modellqualität:** Sonnet als Default; Opus für schwierige Belege (Mehrtranchen-Darlehen, schlechte Scans, verschachtelte Depotauszüge); Haiku nicht für Wert-Übertragung (Verlese-Risiko, da Checks plausibel-falsche Zahlen nicht fangen).
- **Ablauf:** (1) Begrüßung + Überblick „welche Entität heute". (2) Pro Entität: nach Beleg fragen → Werte vorschlagen → `quelle_hinweis` + `standdatum` + `qualitaet` setzen → Validator (`tools/validator.mjs`) laufen lassen → Nutzer bestätigt Wert für Wert. (3) Nach jedem Block: Checks anzeigen (fehlende Bewertung, Reconciliation, Σ-Anteile, Darlehen ohne Regelzahlung). (4) Abschluss: `agent_log.jsonl`-Eintrag + Nettovermögen-Aufschlüsselung zum Gegenlesen.
- **Verifikation (5 Schichten):** Quellenbindung pro Wert; Validator (Struktur); Reconciliation-/Datenqualitäts-Checks (Semantik); Review-Tabelle Wert-für-Wert vor dem Schreiben (fängt plausibel-falsche Zahlen); `agent_log.jsonl` + App-Aufschlüsselung.
- **Do's:** belegter, unabhängiger Anker statt „Endstand − Buchungen" (ADR 0013); Brüche für Eigentumsanteile; Geld als Decimal-String mit zwei Nachkommastellen; bei neuem Darlehen aktiv die passende Raten-Regelzahlung vorschlagen (ADR 0006).
- **Don'ts:** keine pro-Person-Aufteilung des Nettovermögens (ADR 0014); keine geplanten Sondertilgungen/Zukunftsprojektion (→ M6); keine Werte raten — Unsicherheit als `geschaetzt` kennzeichnen oder offen lassen; Regelzahlungen nie hand-editieren, nur via Agent-Dialog (ADR 0006).
- **Verweise:** `CONTEXT.md`, ADR 0006/0013/0014, `docs/runde2/Meilensteine_Runde2.md`.

- [ ] **Step 2: Commit**

```bash
git add docs/skills/stammdaten-erfassung-agent.md
git commit -m "docs(m5): interviewgeführter Stammdaten-Erfassungs-Agent-Skill"
```

---

## Task 7: Gesamt-Verifikation

**Files:** keine (nur Prüfung).

- [ ] **Step 1: Volle Test-Suite**

Run: `npm test`
Expected: alle Tests PASS (inkl. m5-validator, m5-vermoegen).

- [ ] **Step 2: M1-Validierung über echte Master-Daten**

Run: `npm run validate:m1`
Expected: `M1 validation passed`.

- [ ] **Step 3: Syntax aller App-Dateien**

Run:
```bash
node --check app/main.js && node --check app/cashflow.mjs && node --check app/vermoegen.mjs && node --check app/i18n.js && node --check app/review-data.js
```
Expected: keine Fehler.

- [ ] **Step 4: Exit-Kriterien M5 gegenprüfen (manuell)**

Gegen `docs/runde2/Meilensteine_Runde2.md > M5`:
- [ ] Immobilien, Darlehen, Konten und Depots sind getrennte Entitäten (Depots als `kontotyp=depot` unter Konto — Meilenstein-Wortlaut ggf. präzisieren).
- [ ] Bewertungen haben Standdatum und Quelle (Zeitwerte mit `standdatum`, `qualitaet`, `quelle_hinweis`).
- [ ] Nettovermögen ist berechnet, nicht manuell gepflegt (`computeNettovermoegen`, kein gespeicherter Wert).
- [ ] Fehlende Quellen erzeugen sichtbare Checks (`computeVermoegenChecks`, im Checks-Bereich).

- [ ] **Step 5: Meilenstein-Wortlaut präzisieren**

In `docs/runde2/Meilensteine_Runde2.md > M5` das Exit-Kriterium „Immobilien, Darlehen, Konten und Depots haben getrennte Entitäten" auf „Immobilien, Darlehen und Konten (inkl. Depots als `kontotyp=depot`) haben getrennte Entitäten" präzisieren (war im Grilling als sprachliche Undeutlichkeit geklärt).

- [ ] **Step 6: Abschluss-Commit**

```bash
git add docs/runde2/Meilensteine_Runde2.md
git commit -m "docs(m5): M5-Exit-Kriterium Depot-Wortlaut präzisiert"
```

---

## Nachgelagert (NICHT Teil dieses Plans)

- **Testschritt „echte Daten":** Erfassung deiner realen Immobilien, Darlehen, Vermögenswerte und belegten Kontostände/Depotwerte/Restschulden via interviewgeführtem Erfassungs-Agent (Task 6). Eigene Sitzung; braucht deine Belege.
- **Demo-Daten-Wrap-up:** Demo-Einträge in `app/review-data.js` und `data/master/*` entfernen (zusammen mit den bereits vorgemerkten M4-Demo-Daten).
- **Branch-Abschluss:** `superpowers:finishing-a-development-branch` (Merge `--no-ff` nach `main`, Push — nach expliziter Freigabe).

---

## Self-Review

**Spec-Abdeckung (gegen Grilling-Ergebnisse):**
- Getrennte Entitäten Immobilie/Darlehen/Vermögenswert + Depot unter Konto → Task 1/2/5. ✓
- Eigentumsanteile als Bruch + Σ=1 exakt → Task 2 (`pruefeAnteile`). ✓
- Anker + Reconciliation für Saldo/Restschuld (ADR 0013) → Task 3/4. ✓
- Depot = depotwert, bar ignoriert → Task 3. ✓
- Annuität finanzmathematisch (Cent-Integer, Zins/Tilgung) → Task 3 (`restschuldHeute`). ✓
- Anteilsgewichtetes Haushalts-Nettovermögen (ADR 0014), externer Anteil fällt raus → Task 3/4 (`anteilWertCents`). ✓
- `darlehen_id` an Regelzahlung + Check „Darlehen ohne Regelzahlung" + Agent-Regel → Task 1/2/4/6. ✓
- Checks: fehlende Bewertung/Anker, Reconciliation-Drift, veraltete Bewertung (Schwellen pro Typ, anpassbar) → Task 4. ✓
- Interviewgeführter, schema-getriebener Erfassungs-Agent (Sonnet-Default) → Task 6. ✓
- Echte Daten als separater Testschritt → „Nachgelagert". ✓

**Platzhalter-Scan:** keine TBD/TODO; Code in allen Code-Schritten vorhanden (App-Schritt 7 verweist bewusst auf bestehende Checks-Struktur statt sie zu erfinden).

**Typ-Konsistenz:** Funktionsnamen über Tasks konsistent (`aktuellerZeitwert`, `kontoWert`, `restschuldHeute`, `faelligkeiten`, `anteilWertCents`, `computeNettovermoegen`, `computeVermoegenChecks`, `STANDDATUM_SCHWELLEN`); Rückgabeform `{wert_cents, basis, standdatum, qualitaet}` einheitlich; Check-Objektform `{art, entitaet, entitaet_id, text}` einheitlich.

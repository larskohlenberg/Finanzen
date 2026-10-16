# M6 Szenarien — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Szenarien rechnen auf dem validierten Bestand + expliziten Annahmen eine Was-wäre-wenn-Sicht (Liquidität, Restschuld, Nettovermögen über die Zeit), mit sichtbarer Datenqualität und nicht-wegklickbaren Warnungen.

**Architecture:** Eine neue deterministische, reine Engine `app/szenarien.mjs` (browser- und Node-fähig, wie `liquiditaet.mjs`/`vermoegen.mjs`) rechnet ein Szenario auf monatliche Punkte. Sie wiederverwendet bestehende Helfer (`occurrences`, `addInterval`, `faelligkeiten`, `gesamtQualitaet`, `anteilWertCents`, ein cutoff-fähiges `aktuellerZeitwert`). Die Basis ist dieselbe Engine mit leerer Annahmenliste. Szenarien liegen in `app/data/master/szenarien.json` (Annahmen eingebettet); Validierung läuft über `validate-core.mjs` (deklarativ für Top-Level + bespoke Cross-Field für Annahmen). Eine neue View `app/views/szenarien.mjs` zeigt Liste + Detail.

**Tech Stack:** Vanilla ES-Module (`.mjs`), `node:test`, keine Build-Tools, keine Fremd-Libs. Cent-Integer-Arithmetik. SVG-Diagramme via bestehendem `app/charts.mjs`.

## Global Constraints

- **Geldbeträge:** auf Platte Decimal-String `^-?\d+\.\d{2}$`; intern Cent-Integer; Konvertierung nur über `toCents` (aus `app/tools/lib/text.mjs`, re-exportiert in `liquiditaet.mjs`). Verbatim ADR 0004.
- **Datumswerte:** ISO `YYYY-MM-DD`, keine Zeit/Zeitzone.
- **IDs:** Stammdaten-Konvention `^SZN-\d{3}$` für Szenarien (sequenziell, wie `KAT-\d{3}`).
- **Reine Funktionen:** `app/szenarien.mjs` darf **keine** Node-I/O importieren (muss im Browser ladbar bleiben — wie `validate-core.mjs`).
- **App ist nur Anzeige (ADR 0006):** keine Schreib-/CRUD-Funktion in der View; Szenarien entstehen über den Agenten.
- **Tests:** `node --test tests/*.test.mjs`; nach jeder Task `npm test` grün + `npm run validate:master` grün.
- **Engine rechnet live ab heute:** Rechenstichtag = `today` (Parameter, nicht `stand`).

---

### Task 1: Cutoff-fähiges `aktuellerZeitwert`

Die Engine braucht „jüngster Zeitwert **bis Rechenstichtag**". Der bestehende Helper nimmt den absolut neuesten Eintrag. Optionalen `bis`-Parameter ergänzen (rückwärtskompatibel: ohne `bis` unverändert).

**Files:**
- Modify: `app/vermoegen.mjs:11-18`
- Test: `tests/m6-szenarien.test.mjs` (neu)

**Interfaces:**
- Produces: `aktuellerZeitwert(zeitwerte, entitaet, entitaetId, feld, bis = null)` — bei gesetztem `bis` nur Einträge mit `standdatum <= bis`; gibt den jüngsten zurück oder `null`.

- [ ] **Step 1: Failing test schreiben**

In neuer Datei `tests/m6-szenarien.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { aktuellerZeitwert } from "../app/vermoegen.mjs";

const ZW = [
  { entitaet: "immobilie", entitaet_id: "IMM-001", feld: "marktwert", wert: "400000.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" },
  { entitaet: "immobilie", entitaet_id: "IMM-001", feld: "marktwert", wert: "999999.00", standdatum: "2030-01-01", qualitaet: "geschaetzt" },
];

test("aktuellerZeitwert mit bis-Cutoff ignoriert spätere Stände", () => {
  assert.equal(aktuellerZeitwert(ZW, "immobilie", "IMM-001", "marktwert", "2026-06-22").wert, "400000.00");
});

test("aktuellerZeitwert ohne bis nimmt den neuesten", () => {
  assert.equal(aktuellerZeitwert(ZW, "immobilie", "IMM-001", "marktwert").wert, "999999.00");
});
```

- [ ] **Step 2: Test rot**

Run: `node --test tests/m6-szenarien.test.mjs`
Expected: FAIL (Cutoff wird ignoriert, erster Test liefert `999999.00`).

- [ ] **Step 3: Implementierung**

`app/vermoegen.mjs`, Funktion ersetzen:

```js
export function aktuellerZeitwert(zeitwerte, entitaet, entitaetId, feld, bis = null) {
  let best = null;
  for (const zw of zeitwerte ?? []) {
    if (zw.entitaet !== entitaet || zw.entitaet_id !== entitaetId || zw.feld !== feld) continue;
    if (bis && zw.standdatum > bis) continue;
    if (best === null || zw.standdatum > best.standdatum) best = zw;
  }
  return best;
}
```

- [ ] **Step 4: Tests grün**

Run: `node --test tests/m6-szenarien.test.mjs` → PASS.
Run: `npm test` → alle grün (Rückwärtskompatibilität: bestehende Aufrufe ohne `bis` unverändert).

- [ ] **Step 5: Commit**

```bash
git add app/vermoegen.mjs tests/m6-szenarien.test.mjs
git commit -m "feat(m6): aktuellerZeitwert mit optionalem bis-Cutoff"
```

---

### Task 2: Regelzahlung-Erweiterung `qualitaet` + `quelle_hinweis`

`qualitaet` (`belegt|geschaetzt`) trennt vertragliche Verpflichtung von Konsumplan (ADR 0020); `quelle_hinweis`/`quelle_standdatum` wie bei anderen Stammdaten. Der reale Bestand ist `[]`, daher bricht nichts.

**Files:**
- Modify: `app/schemas/regelzahlungen.schema.json`
- Modify: `app/tools/validate-core.mjs:98-115` (Collection `regelzahlungen`, `fields`)
- Test: `tests/m4-regelzahlung-validator.test.mjs`

**Interfaces:**
- Produces: Regelzahlung-Feld `qualitaet ∈ {belegt, geschaetzt}` (für neue Datensätze gesetzt), optional `quelle_hinweis` (String), `quelle_standdatum` (Date).

- [ ] **Step 1: Failing test**

In `tests/m4-regelzahlung-validator.test.mjs` ergänzen (am Ende, vor evtl. vorhandenem Abschluss):

```js
test("Regelzahlung mit qualitaet=geschaetzt und quelle_hinweis ist valide", () => {
  const data = basisDatenMitRegelzahlung({ qualitaet: "geschaetzt", kategorie_id: "KAT-003", quelle_hinweis: "Vertrag.pdf" });
  assert.deepEqual(validateMasterData(data).errors, []);
});

test("Regelzahlung mit unbekannter qualitaet ist Fehler", () => {
  const data = basisDatenMitRegelzahlung({ qualitaet: "vielleicht" });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("qualitaet")));
});
```

Falls `basisDatenMitRegelzahlung` nicht existiert, oben im File ergänzen (an die dort genutzte Fixture angelehnt — eine minimal valide `regelzahlungen`-Collection plus Pflicht-Stammdaten; `overrides` werden in den Regelzahlungs-Datensatz gemischt). Wenn die Testdatei bereits eine vergleichbare Helper-Funktion hat, **diese** nutzen und nur die zwei Tests ergänzen.

- [ ] **Step 2: Test rot**

Run: `node --test tests/m4-regelzahlung-validator.test.mjs`
Expected: FAIL (`additionalProperties`/unbekanntes Feld bzw. `qualitaet`-Enum noch nicht geprüft).

- [ ] **Step 3: Schema-Dateien anpassen**

`app/schemas/regelzahlungen.schema.json` — in `properties` ergänzen (vor `bemerkung`):

```json
      "qualitaet": { "type": "string", "enum": ["belegt", "geschaetzt"] },
      "quelle_hinweis": { "type": "string" },
      "quelle_standdatum": { "type": "string", "format": "date" },
```

`app/tools/validate-core.mjs`, Collection `regelzahlungen` → `fields` ergänzen:

```js
      qualitaet: { type: "string", enum: ["belegt", "geschaetzt"] },
      quelle_hinweis: { type: "string" },
      quelle_standdatum: { type: "string", format: "date" },
```

(`qualitaet` bewusst **noch nicht** in `required` — Migration erst, wenn reale Daten existieren; siehe Task-Hinweis unten.)

- [ ] **Step 4: Tests grün**

Run: `node --test tests/m4-regelzahlung-validator.test.mjs` → PASS.
Run: `npm test` und `npm run validate:master` → grün.

- [ ] **Step 5: Commit**

```bash
git add app/schemas/regelzahlungen.schema.json app/tools/validate-core.mjs tests/m4-regelzahlung-validator.test.mjs
git commit -m "feat(m6): Regelzahlung-qualitaet (belegt|geschaetzt) + quelle_hinweis"
```

---

### Task 3: Szenario-Schema, Datendatei und Validierung

Szenario-Collection (Top-Level deklarativ) + bespoke Cross-Field-Validierung der eingebetteten Annahmen und `gegenbuchung` (der deklarative Validator kann keine verschachtelten Objekte — daher eigene Funktion `validateSzenarien`, analog `validateTransfer`).

**Files:**
- Create: `app/data/master/szenarien.json` (Inhalt: `[]`)
- Create: `app/schemas/szenarien.schema.json`
- Modify: `app/tools/validate-core.mjs` (Collection `szenarien` in `schemas`; `validateSzenarien` in `validateCrossFieldRules`)
- Modify: `app/data-loader.mjs:36-80` (`szenarien` laden)
- Test: `tests/m6-szenarien-validator.test.mjs` (neu)

**Interfaces:**
- Consumes: `validateMasterData(data)` → `{ errors: string[] }` (bestehend).
- Produces: Datenform Szenario:
  ```
  { szenario_id: "SZN-001", name, beschreibung?, status: "entwurf|bestaetigt|verworfen",
    stand: "YYYY-MM-DD", reichweite_bis: "YYYY-MM-DD", erstellt_am: "YYYY-MM-DD",
    annahmen: [ Annahme ] }
  ```
  Annahme (gemeinsam): `{ annahme_id, art, qualitaet: "belegt|geschaetzt|offen", begruendung? }` plus art-spezifisch:
  - `einmalzahlung`: `datum`, `betrag` (Decimal-String, darf `"0.00"`), optional `gegenbuchung`
  - `regelzahlung-neu`: `ab`, `betrag`, `rhythmus_einheit`, `rhythmus_intervall`, optional `bis`, `name`, optional `gegenbuchung` (nur `ziel_typ ∈ {darlehen, depot}`, nur `ziel_id`)
  - `regelzahlung-aenderung`: `regelzahlung_id`, `ab`, `aktion: "beenden|betrag-aendern"`, bei `betrag-aendern`: `betrag` (keine `gegenbuchung`)
  - `gegenbuchung`: `{ ziel_typ: "darlehen|depot|immobilie|vermoegenswert" }` plus genau eines von `ziel_id` ODER `neue_position: { bezeichnung, wert }`.

- [ ] **Step 1: Failing tests**

`tests/m6-szenarien-validator.test.mjs` (neu):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMasterData } from "../app/tools/validate-core.mjs";

function basis(annahmen = [], extra = {}) {
  return {
    personen: [{ person_id: "PER-001", name: "Person A", status: "aktiv" }],
    konten: [
      { konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" },
      { konto_id: "KTO-006", name: "Depot", kontotyp: "depot", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" },
    ],
    kategorien: [{ kategorie_id: "KAT-001", name: "Wohnen", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" }],
    transaktionen: [],
    transfers: [],
    darlehen: [{ darlehen_id: "DAR-001", bezeichnung: "Hyp", status: "aktiv", anfangsbetrag: "300000.00", anfangsdatum: "2020-01-31", zinssatz: "1.80", sollrate: "800.00", rhythmus_einheit: "monat", rhythmus_intervall: 1 }],
    immobilien: [{ immobilie_id: "IMM-001", bezeichnung: "EFH", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }], status: "aktiv" }],
    vermoegenswerte: [{ vermoegenswert_id: "VMW-001", typ: "edelmetall", bezeichnung: "Gold", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }], status: "aktiv" }],
    zeitwerte: [],
    szenarien: [{ szenario_id: "SZN-001", name: "Test", status: "entwurf", stand: "2026-06-01", reichweite_bis: "2030-01-01", erstellt_am: "2026-06-01", annahmen, ...extra }],
  };
}

test("gültiges Szenario mit Einmalzahlung ist valide", () => {
  const data = basis([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2027-01-01", betrag: "20000.00" }]);
  assert.deepEqual(validateMasterData(data).errors, []);
});

test("reichweite_bis vor stand ist Fehler", () => {
  const data = basis([], { reichweite_bis: "2025-01-01" });
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("reichweite_bis")));
});

test("doppelte annahme_id im Szenario ist Fehler", () => {
  const data = basis([
    { annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2027-01-01", betrag: "10.00" },
    { annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2027-02-01", betrag: "10.00" },
  ]);
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("annahme_id")));
});

test("gegenbuchung mit unbekannter ziel_id ist Fehler", () => {
  const data = basis([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2027-01-01", betrag: "-5000.00", gegenbuchung: { ziel_typ: "darlehen", ziel_id: "DAR-999" } }]);
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("DAR-999")));
});

test("gegenbuchung darf nicht zugleich ziel_id und neue_position haben", () => {
  const data = basis([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2027-01-01", betrag: "-5000.00", gegenbuchung: { ziel_typ: "immobilie", ziel_id: "IMM-001", neue_position: { bezeichnung: "X", wert: "1.00" } } }]);
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("gegenbuchung")));
});

test("depot-gegenbuchung mit Nicht-Depot-Konto ist Fehler", () => {
  const data = basis([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2027-01-01", betrag: "5000.00", gegenbuchung: { ziel_typ: "depot", ziel_id: "KTO-001" } }]);
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("Depot")));
});

test("regelzahlung-neu mit gegenbuchung(immobilie) ist Fehler", () => {
  const data = basis([{ annahme_id: "A1", art: "regelzahlung-neu", qualitaet: "geschaetzt", ab: "2027-01-01", betrag: "-100.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, gegenbuchung: { ziel_typ: "immobilie", ziel_id: "IMM-001" } }]);
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("wiederkehrend")));
});

test("einmalzahlung ohne Betrag und ohne gegenbuchung ist Fehler", () => {
  const data = basis([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2027-01-01", betrag: "0.00" }]);
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("wirkungslos")));
});

test("doppelter Verkauf derselben Position ist Fehler", () => {
  const data = basis([
    { annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2027-01-01", betrag: "400000.00", gegenbuchung: { ziel_typ: "immobilie", ziel_id: "IMM-001" } },
    { annahme_id: "A2", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2028-01-01", betrag: "400000.00", gegenbuchung: { ziel_typ: "immobilie", ziel_id: "IMM-001" } },
  ]);
  assert.ok(validateMasterData(data).errors.some((e) => e.includes("IMM-001")));
});
```

- [ ] **Step 2: Tests rot**

Run: `node --test tests/m6-szenarien-validator.test.mjs`
Expected: FAIL (Collection `szenarien` unbekannt → `additionalProperties`/keine Regeln).

- [ ] **Step 3: Datendatei + formales Schema**

`app/data/master/szenarien.json`:
```json
[]
```

`app/schemas/szenarien.schema.json` (formales JSON-Schema, parallel zu den anderen — dokumentiert die Form; die wirksame Prüfung liegt in `validate-core.mjs`):
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Szenario",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["szenario_id", "name", "status", "stand", "reichweite_bis", "erstellt_am", "annahmen"],
    "additionalProperties": false,
    "properties": {
      "szenario_id": { "type": "string", "pattern": "^SZN-\\d{3}$" },
      "name": { "type": "string", "minLength": 1 },
      "beschreibung": { "type": "string" },
      "status": { "type": "string", "enum": ["entwurf", "bestaetigt", "verworfen"] },
      "stand": { "type": "string", "format": "date" },
      "reichweite_bis": { "type": "string", "format": "date" },
      "erstellt_am": { "type": "string", "format": "date" },
      "annahmen": { "type": "array" }
    }
  }
}
```

- [ ] **Step 4: Deklarative Collection in validate-core.mjs**

In `const schemas = { … }` ergänzen (analog zu `regelzahlungen`, `optional: true`):

```js
  szenarien: {
    optional: true,
    required: ["szenario_id", "name", "status", "stand", "reichweite_bis", "erstellt_am", "annahmen"],
    fields: {
      szenario_id: { type: "string", pattern: /^SZN-\d{3}$/ },
      name: { type: "string", minLength: 1 },
      beschreibung: { type: "string" },
      status: { type: "string", enum: ["entwurf", "bestaetigt", "verworfen"] },
      stand: { type: "string", format: "date" },
      reichweite_bis: { type: "string", format: "date" },
      erstellt_am: { type: "string", format: "date" },
      annahmen: { type: "array" },
    },
  },
```

- [ ] **Step 5: Bespoke Cross-Field-Validierung**

In `validateCrossFieldRules(data, errors)` einen Aufruf am Ende ergänzen: `validateSzenarien(data, errors);` und die Funktion (neben `validateTransfer`) hinzufügen:

```js
function validateSzenarien(data, errors) {
  // Nur AKTIVE Zielpositionen sind gültige Gegenbuchungs-Ziele (Spec).
  const darlehenIds = new Set((data.darlehen ?? []).filter((d) => d.status !== "abgeloest").map((d) => d.darlehen_id));
  const depotIds = new Set((data.konten ?? []).filter((k) => k.kontotyp === "depot" && k.status !== "geschlossen").map((k) => k.konto_id));
  const immoIds = new Set((data.immobilien ?? []).filter((i) => i.status !== "verkauft").map((i) => i.immobilie_id));
  const vmwIds = new Set((data.vermoegenswerte ?? []).filter((v) => v.status !== "veraeussert").map((v) => v.vermoegenswert_id));
  const rzIds = new Set((data.regelzahlungen ?? []).map((r) => r.regelzahlung_id));
  const idMengen = { darlehen: darlehenIds, depot: depotIds, immobilie: immoIds, vermoegenswert: vmwIds };

  for (const sz of data.szenarien ?? []) {
    const p = `szenarien.${sz.szenario_id}`;
    if (sz.reichweite_bis < sz.stand) errors.push(`${p}: reichweite_bis liegt vor stand`);

    const gesehen = new Set();
    const verkauft = new Set(); // ziel_typ:ziel_id, gegen Doppelverkauf
    for (const a of sz.annahmen ?? []) {
      const ap = `${p}.${a.annahme_id ?? "?"}`;
      if (!a.annahme_id) errors.push(`${ap}: annahme_id fehlt`);
      else if (gesehen.has(a.annahme_id)) errors.push(`${ap}: annahme_id doppelt`);
      gesehen.add(a.annahme_id);

      if (!["einmalzahlung", "regelzahlung-neu", "regelzahlung-aenderung"].includes(a.art)) {
        errors.push(`${ap}: art unbekannt`);
        continue;
      }
      if (!["belegt", "geschaetzt", "offen"].includes(a.qualitaet)) errors.push(`${ap}: qualitaet ungueltig`);

      if (a.art === "regelzahlung-aenderung") {
        if (!rzIds.has(a.regelzahlung_id)) errors.push(`${ap}: regelzahlung_id ${a.regelzahlung_id} existiert nicht`);
        if (!isIsoDate(a.ab)) errors.push(`${ap}: ab fehlt/ungueltig`);
        if (!["beenden", "betrag-aendern"].includes(a.aktion)) errors.push(`${ap}: aktion ungueltig`);
        if (a.aktion === "betrag-aendern" && !istGueltigerBetrag(a.betrag)) errors.push(`${ap}: betrag-aendern braucht gueltigen betrag`);
        if (a.gegenbuchung) errors.push(`${ap}: regelzahlung-aenderung darf keine gegenbuchung haben`);
        continue;
      }

      // Art-spezifische Pflichtfelder
      if (a.art === "einmalzahlung") {
        if (!isIsoDate(a.datum)) errors.push(`${ap}: datum fehlt/ungueltig`);
        if (typeof a.betrag !== "string" || !istGueltigerBetrag(a.betrag)) errors.push(`${ap}: betrag fehlt/ungueltig`);
      } else if (a.art === "regelzahlung-neu") {
        if (!isIsoDate(a.ab)) errors.push(`${ap}: ab fehlt/ungueltig`);
        if (typeof a.betrag !== "string" || !istGueltigerBetrag(a.betrag)) errors.push(`${ap}: betrag fehlt/ungueltig`);
        if (!["tag", "woche", "monat", "jahr"].includes(a.rhythmus_einheit)) errors.push(`${ap}: rhythmus_einheit ungueltig`);
        if (!Number.isInteger(a.rhythmus_intervall) || a.rhythmus_intervall < 1) errors.push(`${ap}: rhythmus_intervall ungueltig`);
      }

      // einmalzahlung | regelzahlung-neu: Cash-Bein + optionale gegenbuchung
      const hatBetrag = typeof a.betrag === "string" && istGueltigerBetrag(a.betrag) && a.betrag !== "0.00";
      if (a.art === "einmalzahlung" && !hatBetrag && !a.gegenbuchung) {
        errors.push(`${ap}: einmalzahlung ohne Betrag und ohne gegenbuchung ist wirkungslos`);
      }

      if (a.gegenbuchung) {
        const g = a.gegenbuchung;
        const hatZiel = !!g.ziel_id, hatNeu = !!g.neue_position;
        if (hatZiel === hatNeu) errors.push(`${ap}: gegenbuchung braucht genau eines von ziel_id / neue_position`);
        if (!idMengen[g.ziel_typ]) errors.push(`${ap}: gegenbuchung.ziel_typ ungueltig`);
        if (a.art === "regelzahlung-neu") {
          if (!["darlehen", "depot"].includes(g.ziel_typ)) errors.push(`${ap}: wiederkehrende gegenbuchung nur fuer darlehen|depot`);
          if (hatNeu) errors.push(`${ap}: wiederkehrende gegenbuchung braucht bestehende ziel_id`);
        }
        if (hatZiel && idMengen[g.ziel_typ] && !idMengen[g.ziel_typ].has(g.ziel_id)) {
          errors.push(`${ap}: gegenbuchung.ziel_id ${g.ziel_id} existiert nicht in ${g.ziel_typ}`);
        }
        if (g.ziel_typ === "depot" && hatZiel && !depotIds.has(g.ziel_id)) {
          errors.push(`${ap}: depot-gegenbuchung verlangt ein Konto mit kontotyp=Depot`);
        }
        if (hatNeu && (!g.neue_position.bezeichnung || !istGueltigerBetrag(g.neue_position.wert))) {
          errors.push(`${ap}: neue_position braucht bezeichnung und gueltigen wert`);
        }
        // Doppelverkauf/-abbau bestehender Sachwert-Positionen
        if (hatZiel && (g.ziel_typ === "immobilie" || g.ziel_typ === "vermoegenswert")) {
          const key = `${g.ziel_typ}:${g.ziel_id}`;
          if (verkauft.has(key)) errors.push(`${ap}: Position ${g.ziel_id} wird im Szenario mehrfach abgebaut`);
          verkauft.add(key);
        }
      }
    }
  }
}
```

(`istGueltigerBetrag` ist bereits in `validate-core.mjs` importiert.)

- [ ] **Step 6: data-loader erweitern**

`app/data-loader.mjs`: in der `Promise.all`-Liste `loadJson("./data/master/szenarien.json", { refreshToken })` ergänzen und `szenarien` in das destrukturierte Ergebnis **und** das zurückgegebene Objekt aufnehmen (gleich wie `regelzahlungen`).

- [ ] **Step 7: Tests grün**

Run: `node --test tests/m6-szenarien-validator.test.mjs` → PASS.
Run: `npm test` und `npm run validate:master` → grün (leere `szenarien.json` ist valide).

- [ ] **Step 8: Commit**

```bash
git add app/data/master/szenarien.json app/schemas/szenarien.schema.json app/tools/validate-core.mjs app/data-loader.mjs tests/m6-szenarien-validator.test.mjs
git commit -m "feat(m6): Szenario-Schema, Datendatei und Annahmen-Validierung"
```

---

### Task 4: Engine-Kern — Basis-Projektion und Regelzahlungs-Modifikation

Neues Modul `app/szenarien.mjs`. Liquide Cash-Serie aus bestätigten (modifizierten) Regelzahlungen + Einmalzahlungen (Cash-Bein), ohne Gegenbuchungen. Basis = leere Annahmenliste.

**Files:**
- Create: `app/szenarien.mjs`
- Test: `tests/m6-szenarien.test.mjs` (erweitern)

**Interfaces:**
- Consumes: `occurrences`, `addInterval`, `localTodayIso`, `monatVon`, `toCents` aus `app/liquiditaet.mjs`.
- Produces:
  - `rechneSzenario(data, szenario, today)` → `{ punkte: Punkt[], qualitaet, warnungen: Warnung[] }` mit `Punkt = { monat: "YYYY-MM", liquide_cents, depot_cents, restschuld_cents, sachwerte_cents, netto_cents }`, `Warnung = { code, text, datum? }`.
  - `computeSzenario(data, szenario, today)` → `{ szenario: <rechneSzenario>, basis: <rechneSzenario mit annahmen:[]> }`.
  - Intern: `modifizierteRegelzahlungen(data, szenario)` → Array bestätigter Regelzahlungen (Kopien, mit `regelzahlung-aenderung`/`regelzahlung-neu` angewandt) + `warnungen`.

- [ ] **Step 1: Failing tests** (Akzeptanz 1, 2, 3, 8) in `tests/m6-szenarien.test.mjs` ergänzen:

```js
import { rechneSzenario } from "../app/szenarien.mjs";

function dataMitRz(rz = []) {
  return { konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    transaktionen: [], zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-06-22", qualitaet: "belegt" }],
    darlehen: [], immobilien: [], vermoegenswerte: [], regelzahlungen: rz };
}
const sz = (annahmen = [], reichweite_bis = "2026-12-31") => ({ szenario_id: "SZN-001", name: "T", status: "entwurf", stand: "2026-06-22", reichweite_bis, erstellt_am: "2026-06-22", annahmen });

test("Basis: nur bestätigte Regelzahlungen wirken (Miete -500/Monat, 6 Monate)", () => {
  const data = dataMitRz([{ regelzahlung_id: "RZ-001", bezeichnung: "Miete", betrag: "-500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-22", status: "bestaetigt", qualitaet: "belegt", erstellt_am: "2026-06-01" }]);
  const r = rechneSzenario(data, sz([]), "2026-06-22");
  const letzte = r.punkte[r.punkte.length - 1];
  assert.equal(letzte.liquide_cents, 100000 - 6 * 50000); // 1000 - 3000 = -2000
});

test("Vorgeschlagene Regelzahlung wirkt NICHT", () => {
  const data = dataMitRz([{ regelzahlung_id: "RZ-001", bezeichnung: "X", betrag: "-500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-22", status: "vorgeschlagen", qualitaet: "geschaetzt", erstellt_am: "2026-06-01" }]);
  const r = rechneSzenario(data, sz([]), "2026-06-22");
  assert.equal(r.punkte[r.punkte.length - 1].liquide_cents, 100000);
});

test("einmalzahlung (Cash-Bein) wirkt ab Datum", () => {
  const data = dataMitRz([]);
  const r = rechneSzenario(data, sz([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2026-08-15", betrag: "2000.00" }]), "2026-06-22");
  assert.equal(r.punkte[r.punkte.length - 1].liquide_cents, 100000 + 200000);
});

test("regelzahlung-aenderung beenden stoppt die Regelzahlung", () => {
  const data = dataMitRz([{ regelzahlung_id: "RZ-001", bezeichnung: "Miete", betrag: "-500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-22", status: "bestaetigt", qualitaet: "belegt", erstellt_am: "2026-06-01" }]);
  const r = rechneSzenario(data, sz([{ annahme_id: "A1", art: "regelzahlung-aenderung", qualitaet: "geschaetzt", regelzahlung_id: "RZ-001", ab: "2026-09-01", aktion: "beenden" }]), "2026-06-22");
  // Juli + August = 2 x -500 = -1000
  assert.equal(r.punkte[r.punkte.length - 1].liquide_cents, 100000 - 100000);
});
```

- [ ] **Step 2: Tests rot**

Run: `node --test tests/m6-szenarien.test.mjs`
Expected: FAIL (`rechneSzenario` nicht definiert).

- [ ] **Step 3: Engine-Kern implementieren**

`app/szenarien.mjs`:

```js
// app/szenarien.mjs — deterministische, reine Szenario-Engine (browser- & node-fähig).
// Keine Node-I/O. Rechnet ab Rechenstichtag `today` (nicht `stand`).
import { occurrences, addInterval, monatVon, toCents } from "./liquiditaet.mjs";

const startSaldoCents = (data, today) => {
  // aggregierter liquider Startsaldo: belegter Anker + Ist-Buchungen je liquidem Konto bis today
  let summe = 0;
  for (const konto of data.konten ?? []) {
    if (konto.status === "geschlossen") continue;
    if (!konto.liquiditaetsrelevant || konto.kontotyp === "bar" || konto.kontotyp === "depot") continue;
    let best = null;
    for (const zw of data.zeitwerte ?? []) {
      if (zw.entitaet === "konto" && zw.entitaet_id === konto.konto_id && zw.feld === "kontostand" && zw.standdatum <= today) {
        if (!best || zw.standdatum > best.standdatum) best = zw;
      }
    }
    if (!best) continue;
    let s = toCents(best.wert);
    for (const tx of data.transaktionen ?? []) {
      if (tx.konto_id === konto.konto_id && tx.buchungsdatum > best.standdatum && tx.buchungsdatum <= today) s += toCents(tx.betrag);
    }
    summe += s;
  }
  return summe;
};

export function modifizierteRegelzahlungen(data, szenario) {
  const warnungen = [];
  const aenderungen = (szenario.annahmen ?? []).filter((a) => a.art === "regelzahlung-aenderung");
  const neue = (szenario.annahmen ?? []).filter((a) => a.art === "regelzahlung-neu");
  let rzs = (data.regelzahlungen ?? []).filter((r) => r.status === "bestaetigt").map((r) => ({ ...r }));

  for (const ae of aenderungen) {
    const ziel = rzs.find((r) => r.regelzahlung_id === ae.regelzahlung_id);
    if (!ziel) { warnungen.push({ code: "aenderung-wirkungslos", text: `Änderung auf unbekannte Regelzahlung ${ae.regelzahlung_id}` }); continue; }
    const vortag = addInterval(ae.ab, "tag", -1);
    if (vortag < ziel.anker_datum) { warnungen.push({ code: "aenderung-wirkungslos", text: `Änderung ${ae.annahme_id} liegt vor dem Anker der Regelzahlung` }); continue; }
    if (ziel.aktiv_bis && ziel.aktiv_bis < ae.ab) { warnungen.push({ code: "aenderung-wirkungslos", text: `Regelzahlung ${ae.regelzahlung_id} ist vor ${ae.ab} bereits abgelaufen` }); continue; }
    if (ae.aktion === "beenden") {
      ziel.aktiv_bis = ziel.aktiv_bis && ziel.aktiv_bis < vortag ? ziel.aktiv_bis : vortag;
    } else if (ae.aktion === "betrag-aendern") {
      const klon = { ...ziel, regelzahlung_id: `${ziel.regelzahlung_id}~${ae.annahme_id}`, anker_datum: ae.ab, betrag: ae.betrag };
      ziel.aktiv_bis = ziel.aktiv_bis && ziel.aktiv_bis < vortag ? ziel.aktiv_bis : vortag;
      rzs.push(klon);
    }
  }
  for (const n of neue) {
    rzs.push({ regelzahlung_id: n.annahme_id, bezeichnung: n.name ?? "Szenario-Zahlung", betrag: n.betrag, qualitaet: n.qualitaet,
      rhythmus_einheit: n.rhythmus_einheit, rhythmus_intervall: n.rhythmus_intervall, anker_datum: n.ab, aktiv_bis: n.bis, status: "bestaetigt", _gegenbuchung: n.gegenbuchung });
  }
  return { rzs, warnungen };
}

const QUALITAET_RANG = { belegt: 0, geschaetzt: 1, offen: 2 };
function worstOf(qualitaeten) {
  let s = null;
  for (const q of qualitaeten) { const r = q ?? "offen"; if (s === null || QUALITAET_RANG[r] > QUALITAET_RANG[s]) s = r; }
  return s ?? "belegt";
}

export function rechneSzenario(data, szenario, today) {
  const horizon = szenario.reichweite_bis;
  const warnungen = [];
  const { rzs, warnungen: mw } = modifizierteRegelzahlungen(data, szenario);
  warnungen.push(...mw);

  // Cash-Ereignisse je Datum sammeln. Generisches Cash-Bein NUR für Annahmen OHNE
  // gegenbuchung — gegenbuchung-Annahmen buchen ihr (effektives) Cash in Tasks 5/6/7.
  const ereignisse = []; // { datum, cents }
  for (const rz of rzs) {
    if (rz._gegenbuchung) continue; // Gegenbuchungs-Regelzahlung: Cash via Handler (Task 5/6)
    for (const datum of occurrences(rz, today, horizon)) ereignisse.push({ datum, cents: toCents(rz.betrag) });
  }
  const startDatum = (a) => (a.art === "einmalzahlung" ? a.datum : a.ab);
  for (const a of szenario.annahmen ?? []) {
    const d = startDatum(a);
    if (d && d <= today) { warnungen.push({ code: "annahme-vergangen", text: `Annahme ${a.annahme_id} liegt vor dem Rechenstichtag`, datum: d }); }
    if (a.art === "einmalzahlung" && !a.gegenbuchung && a.datum > today && a.datum <= horizon && a.betrag && a.betrag !== "0.00") {
      ereignisse.push({ datum: a.datum, cents: toCents(a.betrag) });
    }
  }
  ereignisse.sort((x, y) => x.datum.localeCompare(y.datum));

  // Monatsraster bauen: Startsaldo + kumulierte Ereignisse je Monatsende
  const punkte = [];
  let lauf = startSaldoCents(data, today);
  let ev = 0;
  let cur = monatVon(today);
  const horizonMonat = monatVon(horizon);
  while (cur <= horizonMonat) {
    const monatsEnde = addInterval(`${cur}-01`, "monat", 1); // erster des Folgemonats; Ereignisse < dem zählen
    while (ev < ereignisse.length && ereignisse[ev].datum < monatsEnde) { lauf += ereignisse[ev].cents; ev++; }
    punkte.push({ monat: cur, liquide_cents: lauf, depot_cents: 0, restschuld_cents: 0, sachwerte_cents: 0, netto_cents: lauf });
    cur = monatVon(addInterval(`${cur}-01`, "monat", 1));
  }

  // Qualität: worst-of über Annahmen UND beitragende Regelzahlungen (Darlehen-Anker
  // kommen in Task 5 hinzu) — Spec: worst-of über alle Eingaben.
  const qualitaet = worstOf([
    ...(szenario.annahmen ?? []).map((a) => a.qualitaet),
    ...rzs.filter((rz) => occurrences(rz, today, horizon).length).map((rz) => rz.qualitaet),
  ]);
  if (punkte.length && punkte[0].liquide_cents < 0) warnungen.push({ code: "liquiditaet-negativ", text: `Liquidität bereits im ersten Monat negativ`, datum: punkte[0].monat });
  return { punkte, qualitaet, warnungen };
}

export function computeSzenario(data, szenario, today) {
  return { szenario: rechneSzenario(data, szenario, today), basis: rechneSzenario(data, { ...szenario, annahmen: [] }, today) };
}
```

- [ ] **Step 4: Tests grün**

Run: `node --test tests/m6-szenarien.test.mjs` → PASS (1, 2, 3, 8).
Run: `npm test` → grün.

- [ ] **Step 5: Commit**

```bash
git add app/szenarien.mjs tests/m6-szenarien.test.mjs
git commit -m "feat(m6): Szenario-Engine-Kern (Cash-Serie, Regelzahlungs-Modifikation, Basis)"
```

---

### Task 5: Gegenbuchung `darlehen` — Sondertilgung, Restschuld-Projektion, Volltilgung stoppt Rate

**Files:**
- Modify: `app/szenarien.mjs`
- Test: `tests/m6-szenarien.test.mjs`

**Interfaces:**
- Consumes: `faelligkeiten` aus `app/vermoegen.mjs`.
- Produces: `restschuld_cents` je Punkt. **Architektur-Invariante:** Sondertilgungen werden als **effektive (geklemmte) Ereignisse** modelliert — Cash und Restschuld nutzen denselben Betrag am selben Datum. `restschuldProjektion(...)` liefert `{ reihe, abbezahlt_am, qualitaet, effektive }` mit `effektive = [{ annahme_id, datum, effektiv_cents }]`; die **Cash-Seite zieht `effektiv_cents`** (nicht den nominellen Betrag) ab. Erreicht die Restschuld 0, wird die Sollrate-Regelzahlung des Darlehens auf `aktiv_bis = abbezahlt_am − 1 Tag` gekürzt (kein weiterer Cash-Abfluss). Wichtig: Task 4 darf das Cash-Bein einer `gegenbuchung`-Annahme **nicht** generisch buchen (siehe Task-4-Anpassung) — die Gegenbuchungs-Handler (5/6/7) buchen es effektiv.

- [ ] **Step 1: Failing tests** (Akzeptanz 5, 6, 11) — exakte Cent-Werte, Cash gepinnt:

```js
import { rechneSzenario } from "../app/szenarien.mjs";

function dataMitDarlehen() {
  return { konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    transaktionen: [], immobilien: [], vermoegenswerte: [],
    zeitwerte: [
      { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "100000.00", standdatum: "2026-06-22", qualitaet: "belegt" },
      { entitaet: "darlehen", entitaet_id: "DAR-001", feld: "restschuld", wert: "10000.00", standdatum: "2026-06-22", qualitaet: "belegt" },
    ],
    darlehen: [{ darlehen_id: "DAR-001", bezeichnung: "Rest", status: "aktiv", anfangsbetrag: "10000.00", anfangsdatum: "2026-06-22", zinssatz: "0.00", sollrate: "1000.00", rhythmus_einheit: "monat", rhythmus_intervall: 1 }],
    regelzahlungen: [{ regelzahlung_id: "RZ-001", bezeichnung: "Darlehensrate", betrag: "-1000.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-06-22", status: "bestaetigt", qualitaet: "belegt", darlehen_id: "DAR-001", erstellt_am: "2026-06-01" }] };
}

// Anker 10000.00 (1_000_000 ct), Rate 1000.00 (100_000 ct), Zins 0, Sondertilgung 5000.00 am 15.07.
// Ereigniskette: 15.07 ST(-5000)→rest 500_000; 22.07 Rate→400_000; 22.08→300_000; 22.09→200_000.
test("Sondertilgung: Restschuld Ende Juli exakt 400_000, Cash konsistent", () => {
  const data = dataMitDarlehen();
  const r = rechneSzenario(data, sz([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "belegt", datum: "2026-07-15", betrag: "-5000.00", gegenbuchung: { ziel_typ: "darlehen", ziel_id: "DAR-001" } }], "2026-09-30"), "2026-06-22");
  assert.equal(r.punkte.find((p) => p.monat === "2026-07").restschuld_cents, 400000);
  // Cash Ende Sept: 10_000_000 − ST 500_000 − 3×Rate(07,08,09) 300_000 = 9_200_000
  assert.equal(r.punkte[r.punkte.length - 1].liquide_cents, 9200000);
});

test("Volltilgung via Sondertilgung stoppt die Sollrate (Cash exakt)", () => {
  const data = dataMitDarlehen();
  // ST 10000.00 am 15.07 → rest 0, abbezahlt_am 2026-07-15; Sollrate auf 2026-07-14 gekürzt → keine Rate mehr.
  const r = rechneSzenario(data, sz([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "belegt", datum: "2026-07-15", betrag: "-10000.00", gegenbuchung: { ziel_typ: "darlehen", ziel_id: "DAR-001" } }], "2026-12-31"), "2026-06-22");
  const letzte = r.punkte[r.punkte.length - 1];
  assert.equal(letzte.restschuld_cents, 0);
  assert.equal(letzte.liquide_cents, 9000000); // 10_000_000 − ST 1_000_000, KEINE Rate
});
```

- [ ] **Step 2: Tests rot** → `restschuld_cents` ist 0 / Cash falsch (Rate läuft weiter).

- [ ] **Step 3: Implementierung** — in `app/szenarien.mjs`:

`faelligkeiten` importieren: `import { faelligkeiten } from "./vermoegen.mjs";` und `const PPJ = { tag: 365, woche: 52, monat: 12, jahr: 1 };`.

**(a) Rohe Sondertilgungs-Ereignisse** sammeln (Nominalbetrag): aus `einmalzahlung` mit `gegenbuchung.ziel_typ==="darlehen"` (`{ annahme_id, darlehen_id: g.ziel_id, datum, nominal_cents: Math.abs(toCents(betrag)) }`) und aus `regelzahlung-neu`-Klonen mit `_gegenbuchung?.ziel_typ==="darlehen"` (je `occurrences`-Termin ein Ereignis mit `annahme_id` = `${id}@${datum}`).

**(b) `restschuldProjektion`** — chronologischer Merge von Ratenterminen und Sondertilgungen, liefert effektive (geklemmte) Beträge:

```js
function restschuldProjektion(darlehen, zeitwerte, today, horizon, sondertilgungen) {
  let best = null;
  for (const zw of zeitwerte ?? []) if (zw.entitaet === "darlehen" && zw.entitaet_id === darlehen.darlehen_id && zw.feld === "restschuld" && zw.standdatum <= today) if (!best || zw.standdatum > best.standdatum) best = zw;
  if (!best) return { reihe: [], abbezahlt_am: null, qualitaet: "offen", effektive: [] };
  let rest = toCents(best.wert);
  const rate = toCents(darlehen.sollrate);
  const satz = Number(darlehen.zinssatz);
  const ppj = PPJ[darlehen.rhythmus_einheit] / darlehen.rhythmus_intervall;
  // Ereignisse chronologisch; bei Datumsgleichheit Rate vor Sondertilgung.
  const meineST = sondertilgungen.filter((s) => s.darlehen_id === darlehen.darlehen_id);
  const events = [
    ...faelligkeiten(darlehen, best.standdatum, horizon).map((d) => ({ datum: d, typ: "rate" })),
    ...meineST.map((s) => ({ datum: s.datum, typ: "st", st: s })),
  ].sort((a, b) => a.datum.localeCompare(b.datum) || (a.typ === "rate" ? -1 : 1));
  const reihe = [];
  const effektive = [];
  let abbezahlt_am = null;
  for (const ev of events) {
    if (rest === 0) { if (ev.typ === "st") effektive.push({ annahme_id: ev.st.annahme_id, datum: ev.datum, effektiv_cents: 0 }); reihe.push({ datum: ev.datum, rest_cents: 0 }); continue; }
    if (ev.typ === "rate") {
      const zins = Math.round((rest * satz) / 100 / ppj);
      rest = Math.max(0, rest - (rate - zins));
    } else {
      const eff = Math.min(ev.st.nominal_cents, rest);
      rest -= eff;
      effektive.push({ annahme_id: ev.st.annahme_id, datum: ev.datum, effektiv_cents: eff });
    }
    if (rest === 0 && !abbezahlt_am) abbezahlt_am = ev.datum;
    reihe.push({ datum: ev.datum, rest_cents: rest });
  }
  return { reihe, abbezahlt_am, qualitaet: best.qualitaet, effektive };
}
```

**(c) Integration in `rechneSzenario`** (vor dem Cash-Sammeln):
1. Sondertilgungen (a) sammeln; je Darlehen `restschuldProjektion` rechnen; alle `reihe`-Einträge und `effektive`-Listen behalten.
2. Für jedes Darlehen mit `abbezahlt_am`: die Sollrate-Regelzahlung(en) (`rz.darlehen_id === darlehen.darlehen_id`) **vor** dem Cash-Sammeln auf `aktiv_bis = min(vorhandenes aktiv_bis, addInterval(abbezahlt_am, "tag", -1))` kürzen.
3. **Cash der Sondertilgungen** als Ereignisse mit `cents = -effektiv_cents` am `datum` einspeisen (effektiv, nicht nominal). Das generische Cash-Bein dieser Annahmen ist in Task 4 ausgeschlossen (gegenbuchung-Annahmen werden dort übersprungen).
4. Restschuld je Monatspunkt: über alle Darlehen die Summe des jüngsten `rest_cents` mit `datum ≤ Monatsende`; vor dem ersten Ereignis gilt der Ankerwert. `netto_cents = liquide + depot + sachwerte − restschuld`.
5. `worstOf` um die `qualitaet` der beteiligten Darlehen-Anker erweitern (siehe Task-4-Anpassung der Qualität).

- [ ] **Step 4: Tests grün** → `node --test tests/m6-szenarien.test.mjs` PASS; `npm test` grün.

- [ ] **Step 5: Commit**

```bash
git add app/szenarien.mjs tests/m6-szenarien.test.mjs
git commit -m "feat(m6): Sondertilgung + Restschuld-Projektion + Volltilgung stoppt Rate"
```

---

### Task 6: Gegenbuchung `depot` — Verkauf/Kauf, Vorbehalt, Klemmung

**Files:** Modify `app/szenarien.mjs`; Test `tests/m6-szenarien.test.mjs`.

**Interfaces:** Produces `depot_cents` je Punkt. `gegenbuchung(depot)` bucht ihr **Cash selbst** (Task 4 überspringt Gegenbuchungs-Cash) und ändert den Depotwert gegenläufig. Verkauf (Cash +) senkt Depotwert; Kauf/Sparplan (Cash −) erhöht ihn. Verkauf > verfügbarer Depotwert klemmt (Cash = Depotwert) + Warnung `depot-ueberzogen`; **jede** `gegenbuchung(depot)` erzeugt `depot-vorbehalt`.

- [ ] **Step 1: Failing test** (Akzeptanz 4):

```js
test("gegenbuchung(depot) Verkauf: Liquidität +, Depot −, depot-vorbehalt", () => {
  const data = { konten: [
      { konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" },
      { konto_id: "KTO-006", name: "Depot", kontotyp: "depot", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    transaktionen: [], darlehen: [], immobilien: [], vermoegenswerte: [],
    zeitwerte: [
      { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-06-22", qualitaet: "belegt" },
      { entitaet: "konto", entitaet_id: "KTO-006", feld: "depotwert", wert: "25000.00", standdatum: "2026-06-22", qualitaet: "belegt" }],
    regelzahlungen: [] };
  const r = rechneSzenario(data, sz([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2026-08-01", betrag: "10000.00", gegenbuchung: { ziel_typ: "depot", ziel_id: "KTO-006" } }], "2026-12-31"), "2026-06-22");
  const letzte = r.punkte[r.punkte.length - 1];
  assert.equal(letzte.liquide_cents, 100000 + 1000000);
  assert.equal(letzte.depot_cents, 2500000 - 1000000);
  assert.ok(r.warnungen.some((w) => w.code === "depot-vorbehalt"));
});
```

- [ ] **Step 2: Test rot** → `depot_cents` noch 0.

- [ ] **Step 3: Implementierung** —
  1. Depot-Startwert je Depotkonto = `toCents` des jüngsten `depotwert`-Zeitwerts mit `standdatum ≤ today` (über `aktuellerZeitwert(..., today)`); je Depotkonto laufender Wert in einer Map.
  2. `gegenbuchung(depot)`-Ereignisse sammeln: aus `einmalzahlung` (ein Ereignis am `datum`) und `regelzahlung-neu` mit `_gegenbuchung.ziel_typ==="depot"` (je `occurrences`-Termin ein Ereignis). Je Ereignis `cashCents = toCents(betrag)` (Verkauf > 0, Kauf < 0).
  3. **Effektiv klemmen** bei Verkauf: `eff = Math.min(cashCents, depotWert[ziel_id])`; falls `eff < cashCents` → Warnung `depot-ueberzogen`. Depotwert: bei Verkauf `−eff`, bei Kauf `−cashCents` (also `+|cashCents|`). **Cash-Ereignis** mit `eff` (Verkauf) bzw. `cashCents` (Kauf) in dieselbe `ereignisse`-Liste wie Task 4 einspeisen.
  4. Je Monatspunkt `depot_cents` = Summe der laufenden Depotwerte aller Depotkonten zum Monatsende (Ereignisse mit `datum < Monatsende` angewandt).
  5. Für **jede** `gegenbuchung(depot)`-Annahme ein `depot-vorbehalt`-Warnobjekt (Text aus `gegenbuchung.vorbehalt`, falls vorhanden).

- [ ] **Step 4: Tests grün**; `npm test` grün.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(m6): Depot-Gegenbuchung (Verkauf/Kauf, Vorbehalt, Klemmung)"
```

---

### Task 7: Gegenbuchung `immobilie`/`vermoegenswert` — Verkauf, Kauf, Erbschaft; Nettovermögens-Serie

**Files:** Modify `app/szenarien.mjs`; Test `tests/m6-szenarien.test.mjs`.

**Interfaces:** Produces `sachwerte_cents` je Punkt (zeitveränderlich). Bestehende aktive Sachwert-Positionen starten mit anteilsgewichtetem Marktwert (jüngster Zeitwert ≤ today, `anteilWertCents`), eingefroren. `gegenbuchung` mit `ziel_id` (Abbau) entfernt die Position ab Datum; mit `neue_position` (Aufbau) fügt `wert` ab Datum hinzu.

- [ ] **Step 1: Failing tests** (Akzeptanz 9, 10):

```js
import { } from "../app/szenarien.mjs";

test("Immobilien-Verkauf: Position fällt ab Datum raus, Liquidität +, neutral", () => {
  const data = { konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    transaktionen: [], darlehen: [], vermoegenswerte: [],
    immobilien: [{ immobilie_id: "IMM-001", bezeichnung: "EFH", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }], status: "aktiv" }],
    zeitwerte: [
      { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-06-22", qualitaet: "belegt" },
      { entitaet: "immobilie", entitaet_id: "IMM-001", feld: "marktwert", wert: "400000.00", standdatum: "2026-06-22", qualitaet: "geschaetzt" }],
    regelzahlungen: [] };
  const vorher = rechneSzenario(data, sz([], "2027-01-31"), "2026-06-22").punkte[0].netto_cents;
  const r = rechneSzenario(data, sz([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2026-09-01", betrag: "400000.00", gegenbuchung: { ziel_typ: "immobilie", ziel_id: "IMM-001" } }], "2027-01-31"), "2026-06-22");
  // Zeitpunkt pinnen: August (vor Verkauf) noch voll, September (Verkauf) raus.
  assert.equal(r.punkte.find((p) => p.monat === "2026-08").sachwerte_cents, 40000000);
  assert.equal(r.punkte.find((p) => p.monat === "2026-09").sachwerte_cents, 0);
  const letzte = r.punkte[r.punkte.length - 1];
  assert.equal(letzte.sachwerte_cents, 0);               // Position raus
  assert.equal(letzte.liquide_cents, 100000 + 40000000); // Cash rein
  assert.equal(letzte.netto_cents, vorher);              // im Buchungsmoment neutral
});

test("Sachwert-Erbschaft (betrag=0 + neue_position): Nettovermögen steigt", () => {
  const data = { konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    transaktionen: [], darlehen: [], immobilien: [], vermoegenswerte: [],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-06-22", qualitaet: "belegt" }],
    regelzahlungen: [] };
  const r = rechneSzenario(data, sz([{ annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2026-09-01", betrag: "0.00", gegenbuchung: { ziel_typ: "vermoegenswert", neue_position: { bezeichnung: "Erbe Gold", wert: "50000.00" } } }], "2027-01-31"), "2026-06-22");
  const letzte = r.punkte[r.punkte.length - 1];
  assert.equal(letzte.sachwerte_cents, 5000000);
  assert.equal(letzte.netto_cents, 100000 + 5000000);
});
```

- [ ] **Step 2: Tests rot** → `sachwerte_cents` noch 0.

- [ ] **Step 3: Implementierung** — `anteilWertCents`, `aktuellerZeitwert` aus `vermoegen.mjs` importieren.
  1. Startwert `sachwerte_cents` = Summe über aktive Immobilien (`status !== "verkauft"`) und Vermögenswerte (`status !== "veraeussert"`): `anteilWertCents(toCents(aktuellerZeitwert(zeitwerte, klasse, id, "marktwert", today).wert), eigentumsanteile)`. Positionen ohne Zeitwert tragen 0 (und gelten als `offen` für die Qualität).
  2. `gegenbuchung(immobilie|vermoegenswert)`-Ereignisse sammeln. **Abbau** (`ziel_id`): `sachwerteDelta = −(anteilsgewichteter Marktwert der Position)` ab `datum`; **Cash** `+toCents(betrag)` (Verkauf) bzw. `0` (Verschenken, `betrag="0.00"`). **Aufbau** (`neue_position`): `sachwerteDelta = +toCents(wert)` ab `datum`; **Cash** `toCents(betrag)` (Kauf negativ, Erbschaft `0`). Cash-Ereignisse in dieselbe `ereignisse`-Liste einspeisen (Task 4 bucht Gegenbuchungs-Cash nicht).
  3. Je Monatspunkt `sachwerte_cents` = Startwert + Summe aller `sachwerteDelta` mit `datum < Monatsende`. Reale `marktwert`-Zeitwerte **nach** einem Abbau-Datum werden ignoriert (Position ist im Szenario weg); `neue_position` hat ohnehin keinen realen Zeitwert.
  4. `netto_cents = liquide + depot + sachwerte − restschuld`. Qualität (`worstOf`) um die `qualitaet` der beitragenden Sachwert-Zeitwerte erweitern.

- [ ] **Step 4: Tests grün**; `npm test` grün.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(m6): Sachwert-Gegenbuchung (Verkauf/Kauf/Erbschaft) + Nettovermögens-Serie"
```

---

### Task 8: Cash-Realismus-Guardrail + `kategorie-ungeplant`

**Files:** Modify `app/szenarien.mjs` (oder separater Export im selben Modul); Test `tests/m6-szenarien.test.mjs`.

**Interfaces:**
- Produces: `guardrailWarnungen(data, today)` → `Warnung[]` mit Codes `cash-realismus`, `kategorie-ungeplant` (nutzt die bestätigten Regelzahlungen des Bestands + Ist-Transaktionen, nicht die Szenario-Annahmen). Wird in `rechneSzenario` an `warnungen` angehängt. Konstanten `GUARDRAIL_SCHWELLE = 0.9`, `MATERIALITAET_MONAT_CENTS = 5000` (50 €, kalibrierbar).

- [ ] **Step 1: Failing test** (Akzeptanz 7, 12):

```js
test("cash-realismus: geschätzter Plan deutlich unter Ist", () => {
  const data = { konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    kategorien: [{ kategorie_id: "KAT-003", name: "Lebensmittel", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" }],
    transaktionen: [ // 3 volle Monate je -800 in KAT-003
      { konto_id: "KTO-001", buchungsdatum: "2026-03-15", betrag: "-800.00", ist_transfer: false, kategorie_id: "KAT-003", kategorisierung_status: "bestaetigt" },
      { konto_id: "KTO-001", buchungsdatum: "2026-04-15", betrag: "-800.00", ist_transfer: false, kategorie_id: "KAT-003", kategorisierung_status: "bestaetigt" },
      { konto_id: "KTO-001", buchungsdatum: "2026-05-15", betrag: "-800.00", ist_transfer: false, kategorie_id: "KAT-003", kategorisierung_status: "bestaetigt" }],
    darlehen: [], immobilien: [], vermoegenswerte: [], zeitwerte: [],
    regelzahlungen: [{ regelzahlung_id: "RZ-001", bezeichnung: "Lebensmittel-Plan", betrag: "-500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-01", status: "bestaetigt", qualitaet: "geschaetzt", kategorie_id: "KAT-003", erstellt_am: "2026-06-01" }] };
  const r = rechneSzenario(data, sz([], "2027-06-30"), "2026-06-22");
  assert.ok(r.warnungen.some((w) => w.code === "cash-realismus"));
});

test("kategorie-ungeplant: materielles Ist ohne Regelzahlung", () => {
  const data = { konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    kategorien: [{ kategorie_id: "KAT-003", name: "Lebensmittel", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" }],
    transaktionen: [
      { konto_id: "KTO-001", buchungsdatum: "2026-03-15", betrag: "-800.00", ist_transfer: false, kategorie_id: "KAT-003", kategorisierung_status: "bestaetigt" },
      { konto_id: "KTO-001", buchungsdatum: "2026-04-15", betrag: "-800.00", ist_transfer: false, kategorie_id: "KAT-003", kategorisierung_status: "bestaetigt" },
      { konto_id: "KTO-001", buchungsdatum: "2026-05-15", betrag: "-800.00", ist_transfer: false, kategorie_id: "KAT-003", kategorisierung_status: "bestaetigt" }],
    darlehen: [], immobilien: [], vermoegenswerte: [], zeitwerte: [], regelzahlungen: [] };
  const r = rechneSzenario(data, sz([], "2027-06-30"), "2026-06-22");
  assert.ok(r.warnungen.some((w) => w.code === "kategorie-ungeplant"));
});

test("belegt-Regelzahlung löst KEINE cash-realismus-Warnung aus", () => {
  const data = { konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    kategorien: [{ kategorie_id: "KAT-001", name: "Wohnen", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" }],
    transaktionen: [
      { konto_id: "KTO-001", buchungsdatum: "2026-03-15", betrag: "-1200.00", ist_transfer: false, kategorie_id: "KAT-001", kategorisierung_status: "bestaetigt" },
      { konto_id: "KTO-001", buchungsdatum: "2026-04-15", betrag: "-1200.00", ist_transfer: false, kategorie_id: "KAT-001", kategorisierung_status: "bestaetigt" },
      { konto_id: "KTO-001", buchungsdatum: "2026-05-15", betrag: "-1200.00", ist_transfer: false, kategorie_id: "KAT-001", kategorisierung_status: "bestaetigt" }],
    darlehen: [], immobilien: [], vermoegenswerte: [], zeitwerte: [],
    regelzahlungen: [{ regelzahlung_id: "RZ-001", bezeichnung: "Miete", betrag: "-1200.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-01", status: "bestaetigt", qualitaet: "belegt", kategorie_id: "KAT-001", erstellt_am: "2026-06-01" }] };
  const r = rechneSzenario(data, sz([], "2027-06-30"), "2026-06-22");
  assert.ok(!r.warnungen.some((w) => w.code === "cash-realismus")); // belegt wird nicht plausibilisiert
  assert.ok(!r.warnungen.some((w) => w.code === "kategorie-ungeplant")); // Kategorie ist abgedeckt
});
```

- [ ] **Step 2: Tests rot**.

- [ ] **Step 3: Implementierung** — `guardrailWarnungen(data, today)`. **Alle Beträge als positive Ausgaben-Magnituden** rechnen (`Math.abs` der negativen Cent-Summen), sonst kippt der `<`-Vergleich:
  - Ist je Kategorie: `ist_monat_cents` = `Math.abs(Σ toCents(betrag))` für `betrag<0`, `ist_transfer!==true`, der **letzten 3 vollen Kalendermonate** vor `today` (Monats-Cutoffs via `monatVon(today)`), gruppiert nach `kategorie_id`, ÷ 3.
  - Plan je Kategorie: nur **`geschaetzt`**-Regelzahlungen mit `kategorie_id` → über die nächsten 12 Monate per `occurrences(rz, today, addInterval(today,"monat",12))` expandieren, `plan_monat_cents` = `Math.abs(Σ Ausgaben-Termine)` ÷ 12.
  - `cash-realismus` (je Kategorie) wenn `plan_monat_cents < GUARDRAIL_SCHWELLE * ist_monat_cents` (`GUARDRAIL_SCHWELLE = 0.9`). Beispiel: `500_00 < 0.9 * 800_00 = 720_00` → Warnung.
  - `kategorie-ungeplant` (je Kategorie): `ist_monat_cents > MATERIALITAET_MONAT_CENTS` (= 5000), aber **keine** bestätigte Regelzahlung (egal welche `qualitaet`) referenziert die `kategorie_id`.
  - `guardrailWarnungen` in `rechneSzenario` aufrufen, Ergebnis an `warnungen` anhängen.

- [ ] **Step 4: Tests grün**; `npm test` grün.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(m6): Cash-Realismus-Guardrail + kategorie-ungeplant"
```

---

### Task 9: View `szenarien` — Liste, Detail (Szenario vs. Basis), Diagramme, Routing

**Files:**
- Create: `app/views/szenarien.mjs`
- Modify: `app/routing.mjs` (Slug `szenarien`, Deep-Link `#/szenarien/SZN-…`)
- Modify: `app/main.js` (View registrieren, Nav-Eintrag, `computeSzenario` beim Laden), `app/runtime.mjs` falls Bestands-Ableitungen nötig
- Modify: `app/i18n.js` (Labels), ggf. `app/views/uebersicht.mjs` (Nav)
- Verifikation: Browser (preview)

**Interfaces:**
- Consumes: `computeSzenario(data, szenario, today)`, `linienDiagramm` aus `app/charts.mjs`, Tabellen-/Chip-Bausteine aus `app/komponenten.mjs`.

- [ ] **Step 1: View-Modul anlegen** — `app/views/szenarien.mjs` nach dem Muster von `app/views/vermoegen.mjs`: exportiert eine Render-Funktion, die bei fehlender Auswahl die **Liste** (Name, Status-Badge, Annahmen-Zahl, Reichweite, Liquidität am Ende [rot wenn <0], Qualitäts-Badge) und bei gewählter `SZN-…` das **Detail** rendert: KPI-Zeile Szenario vs. Basis (Liquidität-Ende, Nettovermögen-Ende), Warnungs-Boxen (je `warnungen`-Eintrag eine Box, nicht zusammenfassen), zwei `linienDiagramm` (liquide, netto — Szenario durchgezogen, Basis gestrichelt), Annahmen-Tabelle (Art, Inhalt, `qualitaet`-Badge, `begruendung`). Nettovermögens-Diagramm mit Fußnote „Sachwerte zum Stichtag eingefroren". **Staleness-Hinweis** (Spec): liegt `stand` mehr als 6 Monate vor `today`, eine sichtbare Notiz „Annahmen-Stand vom {stand} — möglicherweise veraltet" zeigen.

- [ ] **Step 2: Routing** — in `app/routing.mjs`: `VIEW_SLUG` um `szenarien: "szenarien"` ergänzen; in `routeFromState` Deep-Link `#/szenarien/<id>` bei `state.view==="szenarien" && state.selectedSzenarioId`; in `parseRoute` `head === "szenarien"` behandeln (mit/ohne `tail`). Test in `tests/routing.test.mjs` ergänzen (Hin- und Rückrichtung, analog vorhandener Fälle).

- [ ] **Step 3: Einbinden** — in `app/main.js`: View in die Render-Dispatch-Tabelle + Nav aufnehmen; beim Laden `today = localTodayIso()` und je Szenario `computeSzenario` bereitstellen (lazy beim Öffnen reicht). Labels in `app/i18n.js`.

- [ ] **Step 4: Browser-Verifikation** — Dev-Server starten (`preview_start`), eine Test-`szenarien.json` mit 1–2 Szenarien lokal anlegen (NICHT committen, Echtdaten-Regel beachten), View öffnen: `preview_snapshot` (Liste + Detail sichtbar), `preview_console_logs` (keine Fehler), `preview_screenshot` (Diagramme Szenario vs. Basis). Danach die Test-Daten wieder auf `[]` zurücksetzen.

- [ ] **Step 5: Commit**

```bash
git add app/views/szenarien.mjs app/routing.mjs app/main.js app/i18n.js tests/routing.test.mjs
git commit -m "feat(m6): Szenarien-View (Liste, Detail Szenario vs. Basis, Diagramme, Routing)"
```

---

### Task 10: Darlehen-Detail — informativer Rückverweis auf Sondertilgungs-Annahmen

**Files:** Modify `app/views/vermoegen.mjs` (Darlehen-Detail-Bereich); Verifikation Browser.

**Interfaces:** Consumes `data.szenarien`; rein lesend, keine Rechenwirkung.

- [ ] **Step 1: Implementierung** — im Darlehen-Detail die Szenarien nach `gegenbuchung.ziel_typ==="darlehen" && ziel_id===darlehen_id` durchsuchen und je Treffer eine Zeile zeigen (Szenarioname, Status-Badge, `qualitaet`, Deep-Link `#/szenarien/<id>`) unter der Überschrift „In Szenarien geplante Sondertilgungen", mit Label „wirkt sich hier **nicht** aus (zukunftsgerichtet)". Kein Einfluss auf `restschuldHeute`.

- [ ] **Step 2: Browser-Verifikation** — mit lokaler Test-`szenarien.json` (Sondertilgung auf vorhandenes Darlehen): Darlehen-Detail öffnen, `preview_snapshot` zeigt den Rückverweis, Klick auf Deep-Link führt zum Szenario (`preview_click` + `preview_snapshot`). Test-Daten danach zurücksetzen.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(m6): Darlehen-Detail zeigt geplante Sondertilgungen (read-only)"
```

---

### Task 11: Agenten-DoD — Skill, agent-context, Next-Action

**Files:**
- Create: `app/docs/skills/szenarien-annahmen.md`
- Modify: `app/docs/agent-context.md`
- Modify: `app/next-action.mjs` (sicherstellen: Szenario-Entwürfe erzeugen **keine** Push-Aktion)
- Test: `tests/agent-docs.test.mjs` (falls dort App-Doc-Konsistenz geprüft wird), `tests/next-action.test.mjs`

**Interfaces:** Doku + Verhalten; keine neue Engine-API.

- [ ] **Step 1: Skill schreiben** — `app/docs/skills/szenarien-annahmen.md`: Zweck; Prozess (Nutzerwunsch in datierte Einzelannahmen zerlegen; Faktum vs. Hypothese; stille Zusatzannahmen explizit machen; Steuer-/SV-Effekte nie selbst berechnen — Nutzerwert oder grobe Schätzung mit `begruendung`; `bestaetigt` nur nach ausdrücklicher Abnahme; Engine-Warnungen unverkürzt weitergeben; `gegenbuchung(depot)` nur auf ausdrücklichen Wunsch). Referenzen **nur** auf App-Artefakte: `data/master/szenarien.json`, `schemas/szenarien.schema.json`, Regelzahlung-`qualitaet`, Szenario-Teil des Validators. **Keine** Verweise auf Root-Doku/ADRs.

- [ ] **Step 2: agent-context erweitern** — `app/docs/agent-context.md` um die Szenario-Entität, die fünf Wirk-Fälle (Kauf/Verkauf/Sondertilgung/Erbschaft/Schenkung über `gegenbuchung`) und die Engine (`szenarien.mjs`, nur Anzeige) ergänzen.

- [ ] **Step 3: Next-Action** — sicherstellen/Test ergänzen, dass offene Szenario-**Entwürfe** **nicht** als Session-Start-Push-Aktion gemeldet werden (Pull, nicht Push). Falls `next-action.mjs` ein Mapping pflegt, dort nichts für Szenarien hinzufügen; Test in `tests/next-action.test.mjs`: ein `entwurf`-Szenario erzeugt keine Next-Action.

- [ ] **Step 4: Doc-/Konsistenz-Tests** — `npm test` (inkl. `tests/agent-docs.test.mjs`, falls es Skills/agent-context auf Konsistenz prüft) grün.

- [ ] **Step 5: Commit**

```bash
git add app/docs/skills/szenarien-annahmen.md app/docs/agent-context.md app/next-action.mjs tests/next-action.test.mjs
git commit -m "feat(m6): Agenten-DoD — szenarien-annahmen-Skill, agent-context, Next-Action"
```

---

## Migration-Hinweis (nach Task 2, vor Echtbetrieb)

`qualitaet` wird erst dann `required`, wenn reale Regelzahlungen existieren. Der Agent setzt `qualitaet` beim Anlegen (Vorschlag nach Heuristik: vertraglich/exakt → `belegt`, Kategorie-Schätzung → `geschaetzt`) und lässt den Nutzer bestätigen. Reihenfolge bei realem Bestand: erst alle Datensätze mit `qualitaet` versehen, dann `qualitaet` in `required` aufnehmen, `npm run validate:master` grün halten.

## Abschluss-Verifikation (nach Task 11)

- [ ] `npm test` — alle Tests grün (inkl. neue m6-Tests).
- [ ] `npm run validate:master` — grün.
- [ ] Browser-Durchlauf: Szenarien-Liste, Detail Szenario vs. Basis, alle Warnungen sichtbar, Darlehen-Rückverweis, Deep-Links — keine Konsolenfehler.

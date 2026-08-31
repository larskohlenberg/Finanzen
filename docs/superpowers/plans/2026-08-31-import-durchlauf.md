# Import-Durchlauf mit Auto-Freigabe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Import laeuft in einem Zug durch — kategorisieren, verregeln, pruefen, freigeben — und lernt aus den Korrekturen des Nutzers, statt 38 Bucket-Dialoge zu erzwingen.

**Architecture:** Ein deterministisches Gate (`freigabe.mjs`) bestaetigt Vorschlaege automatisch und haelt nur zurueck, was seine Regel nicht rechtfertigen kann. Ein Pruefbericht ersetzt die Vorab-Zustimmung durch Nachkontrolle. Eine Lernschleife wertet das vorhandene `agent_log.jsonl` aus und zieht schlechte Regeln selbsttaetig aus dem Verkehr.

**Tech Stack:** Node.js ES-Module, `node --test`, keine Laufzeitabhaengigkeiten. Tools sind reine Funktion + CLI, wie die sieben vorhandenen Tool-Tests es vorgeben.

**Spec:** `docs/superpowers/specs/2026-08-31-import-durchlauf-design.md`

## Global Constraints

- **Datenroot ist ein Argument, nie hartkodiert.** Tools nehmen ihn ueber `dataRootFromArg` aus `app/tools/data-root.mjs`.
- **Reine Funktion + CLI.** Exportierte Kernfunktion ohne Dateizugriff, CLI-Teil darunter mit `if (process.argv[1] === fileURLToPath(import.meta.url))`.
- **Schreibende Tools laufen ohne Flag als Vorschau.** Erst `--schreiben` bzw. `--anwenden` schreibt. Muster: `confirm.mjs`.
- **Nach jedem Schreiben laeuft der Validator.** Muster: `inbox.mjs`, `confirm.mjs`.
- **Betraege sind Decimal-Strings**, Rechnen ueber `toCents` aus `app/tools/lib/text.mjs`. Nie Float.
- **Freitextvergleich ueber `normalizeLoose`** aus derselben Datei — dieselbe Funktion, die `categorizer.mjs` nutzt, damit Gate und Categorizer nicht auseinanderlaufen.
- **`tests/` ist versioniert.** Nur synthetische Fixtures: keine echten IBANs, Kontonummern, Namen, Bankennamen oder Betraege aus dem Bestand.
- **`docs/` ist versioniert.** Dieselbe Regel gilt fuer Prosa in ADRs und Skill-Dokumenten.
- **Tests laufen mit `npm test`** (`node --test tests/*.test.mjs`).
- **Commit-Sprache Deutsch, ohne Umlaute** (Projektkonvention: `ue`, `ae`, `oe`, `ss`).

---

## Phase 1 — Der Durchlauf

Nach Phase 1 laeuft der Import in einem Zug und gibt automatisch frei. Die
Log-Felder werden bereits geschrieben, obwohl sie erst Phase 2 auswertet —
sonst startet Phase 2 ohne Datenbasis.

### Task 1: `bestaetigt_durch` an der Transaktion

**Files:**
- Modify: `app/schemas/transaktionen.schema.json`
- Modify: `app/tools/validate-core.mjs` (Schema-Spiegel ~Zeile 72, Invarianten ~Zeile 413)
- Test: `tests/validator-bestaetigt-durch.test.mjs` (neu)

**Interfaces:**
- Consumes: nichts
- Produces: Feld `bestaetigt_durch: "auto" | "mensch"` an der Transaktion, vom Validator in beide Richtungen erzwungen. Alle folgenden Tasks setzen dieses Feld voraus.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/validator-bestaetigt-durch.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { validateMasterData } from "../app/tools/validate-core.mjs";

function basis(extra = {}) {
  return {
    personen: [], konten: [{ konto_id: "KTO-001", name: "Testkonto", kontotyp: "giro", inhaber_person_ids: [] }],
    kategorien: [{ kategorie_id: "KAT-003", name: "Testkategorie" }],
    transaktionen: [], ...extra,
  };
}

function tx(props) {
  return {
    transaktion_id: "TXN-11111111-1111-4111-8111-111111111111",
    dedupe_hash: "h1", rohquelle: "data/inbox/x.csv", konto_id: "KTO-001",
    buchungsdatum: "2026-05-20", betrag: "-10.00", gegenpartei: "Testladen",
    verwendungszweck: "", ist_transfer: false, ...props,
  };
}

test("bestaetigt ohne bestaetigt_durch ist ungueltig", () => {
  const data = basis({ transaktionen: [tx({ kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "manuell" })] });
  const out = validateMasterData(data);
  assert.equal(out.valid, false);
  assert.ok(out.errors.some((e) => e.includes("bestaetigt_durch")));
});

test("bestaetigt_durch ohne bestaetigt ist ungueltig", () => {
  const data = basis({ transaktionen: [tx({ kategorisierung_status: "offen", bestaetigt_durch: "auto" })] });
  const out = validateMasterData(data);
  assert.equal(out.valid, false);
  assert.ok(out.errors.some((e) => e.includes("bestaetigt_durch")));
});

test("bestaetigt mit bestaetigt_durch ist gueltig", () => {
  const data = basis({ transaktionen: [tx({ kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "manuell", bestaetigt_durch: "mensch" })] });
  assert.equal(validateMasterData(data).valid, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/validator-bestaetigt-durch.test.mjs`
Expected: FAIL — die ersten beiden Tests, weil der Validator das Feld noch nicht kennt.

- [ ] **Step 3: Schema-Spiegel erweitern**

In `app/tools/validate-core.mjs`, direkt nach der Zeile `kategorie_herkunft: { type: "string", enum: ["regel", "agent", "manuell"] },`:

```javascript
      bestaetigt_durch: { type: "string", enum: ["auto", "mensch"] },
```

- [ ] **Step 4: Invariante ergaenzen**

In `app/tools/validate-core.mjs` in derselben Transaktionsschleife, in der `kategorie_id`-Pflicht geprueft wird (~Zeile 413):

```javascript
    // Eine Bestaetigung ohne Urheber laesst nicht mehr unterscheiden, ob ein
    // Mensch hingeschaut hat — davon haengt ab, ob recategorize sie anfassen darf.
    if (transaktion.kategorisierung_status === "bestaetigt" && !transaktion.bestaetigt_durch) {
      errors.push(`transaktionen.${transaktion.transaktion_id}.bestaetigt_durch: Pflicht bei bestaetigt`);
    }
    if (transaktion.kategorisierung_status !== "bestaetigt" && transaktion.bestaetigt_durch) {
      errors.push(`transaktionen.${transaktion.transaktion_id}.bestaetigt_durch: nur erlaubt bei bestaetigt`);
    }
```

- [ ] **Step 5: JSON-Schema nachziehen**

In `app/schemas/transaktionen.schema.json` bei den Properties, nach `kategorie_herkunft`:

```json
    "bestaetigt_durch": { "type": "string", "enum": ["auto", "mensch"] },
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests/validator-bestaetigt-durch.test.mjs`
Expected: PASS, alle drei.

- [ ] **Step 7: Commit**

```bash
git add app/schemas/transaktionen.schema.json app/tools/validate-core.mjs tests/validator-bestaetigt-durch.test.mjs
git commit -m "feat: bestaetigt_durch an der Transaktion mit Validator-Invariante"
```

---

### Task 2: Backfill des Bestands auf `mensch`

**Files:**
- Create: `app/tools/migrate-bestaetigt-durch.mjs`
- Test: manuell gegen `app/data/master` (Vorschau, dann `--schreiben`)

**Interfaces:**
- Consumes: das Feld aus Task 1
- Produces: alle `bestaetigt`-Eintraege im Bestand tragen `bestaetigt_durch`. Ohne diesen Task schlaegt der Validator auf dem echten Bestand fehl.

Der Bestand hat 3.970 bestaetigte Eintraege ohne das neue Feld. Sie werden `mensch` — konservativ, weil sie damit vor Regellaeufen geschuetzt bleiben wie bisher. Vom Nutzer am 2026-08-31 ausdruecklich bestaetigt.

- [ ] **Step 1: Migrationsskript schreiben**

```javascript
// app/tools/migrate-bestaetigt-durch.mjs
//
// Einmalige Migration: bestehende bestaetigte Buchungen bekommen
// bestaetigt_durch = "mensch". Konservativ, weil sie damit vor Regellaeufen
// geschuetzt bleiben — genau wie vor Einfuehrung des Feldes.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dataRootFromArg } from "./data-root.mjs";

export function migriere(transaktionen) {
  let geaendert = 0;
  const next = transaktionen.map((tx) => {
    if (tx.kategorisierung_status !== "bestaetigt") return tx;
    if (tx.bestaetigt_durch) return tx;
    geaendert += 1;
    return { ...tx, bestaetigt_durch: "mensch" };
  });
  return { transaktionen: next, geaendert };
}

async function main() {
  const args = process.argv.slice(2);
  const schreiben = args.includes("--schreiben");
  const masterRoot = dataRootFromArg(args.find((a) => !a.startsWith("--")));
  const url = new URL("transaktionen.jsonl", masterRoot);
  const text = await readFile(url, "utf8");
  const transaktionen = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

  const out = migriere(transaktionen);
  console.log(`${out.geaendert} Buchung(en) erhalten bestaetigt_durch = "mensch".`);
  if (!schreiben) {
    console.log("Vorschau — nichts geschrieben. Mit --schreiben anwenden.");
    return;
  }
  await writeFile(url, out.transaktionen.map((tx) => JSON.stringify(tx)).join("\n") + "\n");
  console.log("Geschrieben.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
```

- [ ] **Step 2: Vorschau laufen lassen**

Run: `node app/tools/migrate-bestaetigt-durch.mjs app/data/master`
Expected: `3970 Buchung(en) erhalten bestaetigt_durch = "mensch".` gefolgt von der Vorschau-Zeile.

- [ ] **Step 3: Schreiben**

Run: `node app/tools/migrate-bestaetigt-durch.mjs app/data/master --schreiben`

- [ ] **Step 4: Validator gegen den echten Bestand**

Run: `npm run validate:master`
Expected: keine Fehler zu `bestaetigt_durch`.

- [ ] **Step 5: Commit**

```bash
git add app/tools/migrate-bestaetigt-durch.mjs
git commit -m "feat: Migration setzt bestaetigt_durch auf mensch fuer den Bestand"
```

---

### Task 3: `confirm.mjs` setzt `bestaetigt_durch = "mensch"`

**Files:**
- Modify: `app/tools/confirm.mjs`
- Test: `tests/confirm.test.mjs`

**Interfaces:**
- Consumes: Feld aus Task 1
- Produces: jede menschliche Bestaetigung traegt `bestaetigt_durch: "mensch"`. Task 8 setzt spiegelbildlich `"auto"`.

- [ ] **Step 1: Write the failing test**

An `tests/confirm.test.mjs` anhaengen:

```javascript
test("bestaetigen setzt bestaetigt_durch mensch", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"] });
  const out = confirmTransactions({ transaktionen: [t], regeln, filter: { regel_id: "REG-001" }, entscheidung: { aktion: "bestaetigen" } });
  assert.equal(out.transaktionen[0].bestaetigt_durch, "mensch");
});

test("ablehnen setzt kein bestaetigt_durch", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"] });
  const out = confirmTransactions({ transaktionen: [t], regeln, filter: { regel_id: "REG-001" }, entscheidung: { aktion: "ablehnen" } });
  assert.equal(Object.hasOwn(out.transaktionen[0], "bestaetigt_durch"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/confirm.test.mjs`
Expected: FAIL — `bestaetigt_durch` ist `undefined`.

- [ ] **Step 3: Implementierung**

In `app/tools/confirm.mjs` in der Entscheidungsfunktion: wo `kategorisierung_status: "bestaetigt"` gesetzt wird, `bestaetigt_durch: "mensch"` ergaenzen. Im `ablehnen`-Zweig das Feld mit `delete` bzw. Destructuring entfernen, analog zu `kategorie_id` und `matched_regeln`.

```javascript
  if (entscheidung.aktion === "ablehnen") {
    const { kategorie_id, kategorie_herkunft, matched_regeln, bestaetigt_durch, ...rest } = tx;
    return { ...rest, kategorisierung_status: "abgelehnt" };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/confirm.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/tools/confirm.mjs tests/confirm.test.mjs
git commit -m "feat: confirm.mjs kennzeichnet menschliche Bestaetigungen"
```

---

### Task 4: `recategorize.mjs` fasst Auto-Freigaben wieder an

**Files:**
- Modify: `app/tools/recategorize.mjs:16-20`
- Test: `tests/recategorize.test.mjs`

**Interfaces:**
- Consumes: Feld aus Task 1
- Produces: `istKandidat()` behandelt `bestaetigt_durch === "auto"` als Kandidat. Damit heilt sich ein auto-freigegebener Bestand bei jedem Regel-Tuning selbst.

- [ ] **Step 1: Write the failing test**

An `tests/recategorize.test.mjs` anhaengen:

```javascript
test("auto-bestaetigt wird neu bewertet, mensch-bestaetigt nicht", () => {
  const auto = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-999", kategorie_herkunft: "agent", bestaetigt_durch: "auto" });
  const mensch = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-999", kategorie_herkunft: "agent", bestaetigt_durch: "mensch" });
  const out = recategorize({ transaktionen: [auto, mensch], regeln });
  // REG-001 deckt MusterladenA mit KAT-003 ab: Wiedervorlage nur fuer den auto-Eintrag.
  assert.equal(out.transaktionen[0].kategorisierung_status, "vorgeschlagen");
  assert.equal(out.transaktionen[0].kategorie_id, "KAT-003");
  assert.equal(out.transaktionen[1].kategorisierung_status, "bestaetigt");
  assert.equal(out.transaktionen[1].kategorie_id, "KAT-999");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/recategorize.test.mjs`
Expected: FAIL — der auto-Eintrag bleibt `bestaetigt`, weil `herkunft = agent` ihn heute ausschliesst.

- [ ] **Step 3: Implementierung**

`app/tools/recategorize.mjs`, Funktion `istKandidat`:

```javascript
function istKandidat(tx) {
  if (tx.kategorie_herkunft === "manuell") return false;
  if (tx.kategorisierung_status === "abgelehnt") return false;
  // Eine Auto-Freigabe ist kein menschlicher Akt: nie hat jemand hingeschaut,
  // also darf ein spaeterer Regellauf sie neu bewerten.
  if (tx.bestaetigt_durch === "auto") return true;
  return tx.kategorisierung_status === "offen" || tx.kategorie_herkunft === "regel";
}
```

- [ ] **Step 4: Wiedervorlage muss das Feld raeumen**

Ein Eintrag, der von `bestaetigt` auf `vorgeschlagen` zurueckfaellt, darf kein `bestaetigt_durch` mehr tragen (Invariante aus Task 1). In `alsRegelVorschlag` das Feld entfernen:

```javascript
function alsRegelVorschlag(tx, verdict) {
  const { bestaetigt_durch, ...rest } = tx;
  return { ...rest, kategorisierung_status: "vorgeschlagen", kategorie_id: verdict.kategorie_id, kategorie_herkunft: "regel", matched_regeln: verdict.matched_regeln };
}
```

Ebenso in `alsOffen`:

```javascript
function alsOffen(tx, verdict) {
  const { kategorie_id, kategorie_herkunft, matched_regeln, bestaetigt_durch, ...rest } = tx;
  if ((verdict.matched_regeln ?? []).length) return { ...rest, kategorisierung_status: "offen", matched_regeln: verdict.matched_regeln };
  return { ...rest, kategorisierung_status: "offen" };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, inklusive der bestehenden recategorize-Tests.

- [ ] **Step 6: Commit**

```bash
git add app/tools/recategorize.mjs tests/recategorize.test.mjs
git commit -m "feat: Nach-Kategorisierung bewertet Auto-Freigaben neu"
```

---

### Task 5: `belegstufe` an der Kategorisierungsregel

**Files:**
- Modify: `app/schemas/kategorisierungsregeln.schema.json`
- Modify: `app/tools/validate-core.mjs` (Regel-Schemaspiegel ~Zeile 216-224)
- Test: `tests/validator-belegstufe.test.mjs` (neu)

**Interfaces:**
- Consumes: nichts
- Produces: optionales Feld `belegstufe: "E1" | "E2" | "E3" | "E4"` an der Regel. Task 8 macht seine Anwesenheit zur Gate-Bedingung.

Der Validator erzwingt nur den **Wertebereich**, nicht die Anwesenheit — ein
globales `required` wuerde die 295 Bestandsregeln sofort ungueltig machen. Die
Anwesenheit erzwingt das Gate: ohne Stufe keine Auto-Freigabe.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/validator-belegstufe.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { validateMasterData } from "../app/tools/validate-core.mjs";

function mitRegel(regel) {
  return {
    personen: [], konten: [], transaktionen: [],
    kategorien: [{ kategorie_id: "KAT-003", name: "Testkategorie" }],
    kategorisierungsregeln: [{ regel_id: "REG-001", gegenpartei_pattern: "testladen", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "Testregel", ...regel }],
  };
}

test("belegstufe E2 ist gueltig", () => {
  assert.equal(validateMasterData(mitRegel({ belegstufe: "E2" })).valid, true);
});

test("belegstufe E6 ist ungueltig", () => {
  const out = validateMasterData(mitRegel({ belegstufe: "E6" }));
  assert.equal(out.valid, false);
  assert.ok(out.errors.some((e) => e.includes("belegstufe")));
});

test("fehlende belegstufe ist gueltig (Bestandsregeln)", () => {
  assert.equal(validateMasterData(mitRegel({})).valid, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/validator-belegstufe.test.mjs`
Expected: FAIL beim E6-Test — unbekannte Felder werden heute nicht geprueft.

- [ ] **Step 3: Schema-Spiegel erweitern**

In `app/tools/validate-core.mjs` im Block `kategorisierungsregeln.fields`, nach `kommentar`:

```javascript
      belegstufe: { type: "string", enum: ["E1", "E2", "E3", "E4"] },
```

- [ ] **Step 4: JSON-Schema nachziehen**

In `app/schemas/kategorisierungsregeln.schema.json` bei den Properties:

```json
    "belegstufe": { "type": "string", "enum": ["E1", "E2", "E3", "E4"] },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/validator-belegstufe.test.mjs`
Expected: PASS, alle drei.

- [ ] **Step 6: Commit**

```bash
git add app/schemas/kategorisierungsregeln.schema.json app/tools/validate-core.mjs tests/validator-belegstufe.test.mjs
git commit -m "feat: belegstufe als gepruefter Wertebereich an der Regel"
```

---

### Task 6: Spezifitaetspruefung als eigenes Modul

**Files:**
- Create: `app/tools/lib/spezifitaet.mjs`
- Test: `tests/spezifitaet.test.mjs` (neu)

**Interfaces:**
- Consumes: `normalizeLoose` aus `app/tools/lib/text.mjs`, Feld `bestaetigt_durch` aus Task 1
- Produces:
  - `referenzmenge(transaktionen) -> Transaktion[]` — nur menschlich entschiedene Buchungen
  - `streuung(zweig, referenz) -> number` — Anzahl verschiedener `kategorie_id`
  - `istSpezifisch(regel, referenz) -> boolean`

Zwei Feinheiten, die die Korrektheit tragen:

**Referenzmenge.** Gegen den Gesamtbestand gerechnet haette eine schlechte Regel,
die soeben Hunderte Buchungen auf eine Kategorie auto-bestaetigt hat, ploetzlich
Streuung 1 und wuerde sich selbst als spezifisch beweisen. Deshalb zaehlen nur
`bestaetigt_durch = "mensch"` und `kategorie_herkunft = "manuell"`.

**Verknuepfungslogik.** Innerhalb eines Feldes ist `a|b` ein ODER — ein
generischer Zweig ist ein Leck, also muessen **alle** Zweige eines Feldes
spezifisch sein. Zwischen `gegenpartei_pattern` und `verwendungszweck_pattern`
gilt UND — ein spezifisches Feld genuegt, um die Regel eng zu machen.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/spezifitaet.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { referenzmenge, streuung, istSpezifisch } from "../app/tools/lib/spezifitaet.mjs";

let n = 0;
function tx(props) {
  n += 1;
  return {
    transaktion_id: `TXN-${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`,
    konto_id: "KTO-001", buchungsdatum: "2026-05-20", betrag: "-10.00",
    gegenpartei: "", verwendungszweck: "", ist_transfer: false, ...props,
  };
}

// "ortstoken" streut ueber drei Kategorien, "testladen" nur ueber eine.
const referenz = [
  tx({ gegenpartei: "Testladen Ortstoken", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", bestaetigt_durch: "mensch" }),
  tx({ gegenpartei: "Baumarkt Ortstoken", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-005", bestaetigt_durch: "mensch" }),
  tx({ gegenpartei: "Apotheke Ortstoken", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-007", bestaetigt_durch: "mensch" }),
];

test("referenzmenge nimmt nur menschlich Entschiedenes", () => {
  const alle = [...referenz,
    tx({ gegenpartei: "Auto Ortstoken", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-009", bestaetigt_durch: "auto" }),
    tx({ gegenpartei: "Offen Ortstoken", kategorisierung_status: "offen" })];
  assert.equal(referenzmenge(alle).length, 3);
});

test("streuung zaehlt verschiedene Kategorien", () => {
  assert.equal(streuung("ortstoken", referenz), 3);
  assert.equal(streuung("testladen", referenz), 1);
});

test("Muster nur aus einem breit streuenden Token faellt durch", () => {
  assert.equal(istSpezifisch({ gegenpartei_pattern: "Ortstoken" }, referenz), false);
});

test("spezifisches Muster besteht", () => {
  assert.equal(istSpezifisch({ gegenpartei_pattern: "Testladen" }, referenz), true);
});

test("ODER-Alternation: ein generischer Zweig macht das Feld unspezifisch", () => {
  assert.equal(istSpezifisch({ gegenpartei_pattern: "Testladen|Ortstoken" }, referenz), false);
});

test("UND ueber Felder: ein spezifisches Feld genuegt", () => {
  assert.equal(istSpezifisch({ gegenpartei_pattern: "Ortstoken", verwendungszweck_pattern: "Testladen" }, referenz), true);
});

test("Regel ohne Muster ist nie spezifisch", () => {
  assert.equal(istSpezifisch({}, referenz), false);
});

test("leere Referenzmenge laesst durch (Cold-Start ist ein Veto, kein Beweis)", () => {
  assert.equal(istSpezifisch({ gegenpartei_pattern: "Ortstoken" }, []), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/spezifitaet.test.mjs`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: Implementierung**

```javascript
// app/tools/lib/spezifitaet.mjs
//
// Veto gegen nachweislich unspezifische Regelmuster. Kein Beweis fuer
// Spezifitaet: ist die Referenzmenge duenn, kommt eine Regel durch. Die
// Pruefung kann also nichts durchwinken, was sonst gestoppt worden waere —
// sie faengt nur den Fall, der belegbar ueber viele Kategorien streut.
import { normalizeLoose } from "./text.mjs";

// Ab drei verschiedenen Kategorien traegt ein Zweig keine Kategorieaussage mehr.
const UNSPEZIFISCH_AB_KATEGORIEN = 3;

// Nur menschlich entschiedene Buchungen. Auto-Freigaben sind ausgeschlossen,
// weil eine schlechte Regel sonst ihre eigenen Freigaben als Beleg fuer ihre
// Spezifitaet zaehlen wuerde.
export function referenzmenge(transaktionen) {
  return transaktionen.filter((tx) => tx.kategorie_id
    && (tx.bestaetigt_durch === "mensch" || tx.kategorie_herkunft === "manuell"));
}

function zweige(pattern) {
  return String(pattern ?? "").split("|").map(normalizeLoose).filter((z) => z.length > 0);
}

export function streuung(zweig, referenz) {
  const kategorien = new Set();
  for (const tx of referenz) {
    const heuhaufen = `${normalizeLoose(tx.gegenpartei)} ${normalizeLoose(tx.verwendungszweck)}`;
    if (heuhaufen.includes(zweig)) kategorien.add(tx.kategorie_id);
  }
  return kategorien.size;
}

// Innerhalb eines Feldes ist die Alternation ein ODER: ein generischer Zweig
// ist ein Leck, also muessen ALLE Zweige spezifisch sein.
function feldIstSpezifisch(pattern, referenz) {
  const zw = zweige(pattern);
  if (zw.length === 0) return false;
  return zw.every((z) => streuung(z, referenz) < UNSPEZIFISCH_AB_KATEGORIEN);
}

// Zwischen den Feldern gilt UND: ein spezifisches Feld macht die Regel eng.
export function istSpezifisch(regel, referenz) {
  const muster = [regel.gegenpartei_pattern, regel.verwendungszweck_pattern].filter(Boolean);
  if (muster.length === 0) return false;
  return muster.some((p) => feldIstSpezifisch(p, referenz));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/spezifitaet.test.mjs`
Expected: PASS, alle acht.

- [ ] **Step 5: Commit**

```bash
git add app/tools/lib/spezifitaet.mjs tests/spezifitaet.test.mjs
git commit -m "feat: Spezifitaetspruefung gegen menschlich entschiedene Referenzmenge"
```

---

### Task 7: Probelauf warnt vor unspezifischen Mustern

**Files:**
- Modify: `app/tools/regel-probelauf.mjs`
- Test: `tests/regel-probelauf.test.mjs`

**Interfaces:**
- Consumes: `istSpezifisch`, `referenzmenge` aus Task 6
- Produces: `probelauf()` liefert zusaetzlich `unspezifisch: [{regel_id}]` und zaehlt diese in `blockiert` mit.

Eine unspezifische Regel soll schon beim Anlegen auffallen, nicht erst wenn das
Gate sie stumm zurueckhaelt.

- [ ] **Step 1: Write the failing test**

An `tests/regel-probelauf.test.mjs` anhaengen:

```javascript
test("unspezifisches Muster blockiert den Probelauf", () => {
  const bestand = [
    { transaktion_id: "TXN-1", gegenpartei: "Testladen Ortstoken", verwendungszweck: "", betrag: "-10.00", konto_id: "KTO-001", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", bestaetigt_durch: "mensch" },
    { transaktion_id: "TXN-2", gegenpartei: "Baumarkt Ortstoken", verwendungszweck: "", betrag: "-10.00", konto_id: "KTO-001", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-005", bestaetigt_durch: "mensch" },
    { transaktion_id: "TXN-3", gegenpartei: "Apotheke Ortstoken", verwendungszweck: "", betrag: "-10.00", konto_id: "KTO-001", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-007", bestaetigt_durch: "mensch" },
  ];
  const out = probelauf({ transaktionen: bestand, bestandsRegeln: [], kandidaten: [{ regel_id: "REG-900", gegenpartei_pattern: "Ortstoken", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-08-31", kommentar: "zu breit" }] });
  assert.equal(out.unspezifisch.length, 1);
  assert.equal(out.unspezifisch[0].regel_id, "REG-900");
  assert.equal(out.blockiert, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/regel-probelauf.test.mjs`
Expected: FAIL — `out.unspezifisch` ist `undefined`.

- [ ] **Step 3: Implementierung**

In `app/tools/regel-probelauf.mjs` oben importieren:

```javascript
import { referenzmenge, istSpezifisch } from "./lib/spezifitaet.mjs";
```

In `probelauf(...)` vor dem `return`:

```javascript
  const referenz = referenzmenge(transaktionen);
  const unspezifisch = kandidaten
    .filter((regel) => !istSpezifisch(regel, referenz))
    .map((regel) => ({ regel_id: regel.regel_id }));
```

`blockiert` erweitern und `unspezifisch` mit zurueckgeben:

```javascript
  const blockiert = struktur_fehler.length > 0 || neue_konflikte.length > 0 || wiedervorlagen.length > 0 || unspezifisch.length > 0;

  return { treffer, pro_regel, neue_konflikte, wiedervorlagen, ohne_treffer, struktur_fehler, unspezifisch, blockiert };
```

Im Berichtsteil (bei `NEUE REGELKONFLIKTE`) ergaenzen:

```javascript
  if (out.unspezifisch.length) {
    zeilen.push("");
    zeilen.push(`UNSPEZIFISCHE MUSTER (${out.unspezifisch.length}) — blockiert:`);
    for (const u of out.unspezifisch) zeilen.push(`  - ${u.regel_id}: Muster streut ueber drei oder mehr Kategorien`);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/tools/regel-probelauf.mjs tests/regel-probelauf.test.mjs
git commit -m "feat: Probelauf blockiert unspezifische Muster"
```

---

### Task 8: `freigabe.mjs` — das Gate

**Files:**
- Create: `app/tools/freigabe.mjs`
- Modify: `package.json` (npm-Scripts)
- Test: `tests/freigabe.test.mjs` (neu)

**Interfaces:**
- Consumes: `referenzmenge`, `istSpezifisch` aus Task 6; `bestaetigt_durch` aus Task 1; `belegstufe` aus Task 5
- Produces: `freigabe({ transaktionen, regeln, gesperrteBelegstufen }) -> { transaktionen, report }` mit `report = { freigegeben, agent_freigegeben, zurueckgehalten, freigaben, gate_durchfall }`. Task 9 schreibt `freigaben` und `gate_durchfall` ins Log, Task 13 fuellt `gesperrteBelegstufen`.

**Kein Konfliktkriterium.** `categorize()` liefert bei mehreren Regeln mit
verschiedenen Kategorien `status = "offen"` — eine konfliktbehaftete Buchung
erreicht die Freigabe nie. Verifiziert am Code am 2026-08-31.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/freigabe.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { freigabe } from "../app/tools/freigabe.mjs";

let n = 0;
function tx(props) {
  n += 1;
  return {
    transaktion_id: `TXN-${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`,
    dedupe_hash: `h${n}`, rohquelle: "data/inbox/x.csv", konto_id: "KTO-001",
    buchungsdatum: "2026-05-20", betrag: "-10.00", gegenpartei: "Testladen",
    verwendungszweck: "", ist_transfer: false, ...props,
  };
}
function regel(props) {
  return { regel_id: "REG-001", gegenpartei_pattern: "testladen", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "Testregel", belegstufe: "E2", ...props };
}
function vorschlag(props) {
  return tx({ kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"], ...props });
}

test("saubere Regel gibt frei", () => {
  const out = freigabe({ transaktionen: [vorschlag()], regeln: [regel()] });
  assert.equal(out.transaktionen[0].kategorisierung_status, "bestaetigt");
  assert.equal(out.transaktionen[0].bestaetigt_durch, "auto");
  assert.equal(out.report.freigegeben, 1);
});

test("Agentenvorschlag wird freigegeben", () => {
  const t = tx({ kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-012", kategorie_herkunft: "agent" });
  const out = freigabe({ transaktionen: [t], regeln: [] });
  assert.equal(out.transaktionen[0].bestaetigt_durch, "auto");
  assert.equal(out.report.agent_freigegeben, 1);
});

test("fehlende belegstufe haelt zurueck", () => {
  const r = regel(); delete r.belegstufe;
  const out = freigabe({ transaktionen: [vorschlag()], regeln: [r] });
  assert.equal(out.transaktionen[0].kategorisierung_status, "vorgeschlagen");
  assert.equal(out.report.gate_durchfall[0].grund, "belegstufe");
});

test("inaktive Regel haelt zurueck", () => {
  const out = freigabe({ transaktionen: [vorschlag()], regeln: [regel({ status: "inaktiv" })] });
  assert.equal(out.report.gate_durchfall[0].grund, "inaktiv");
});

test("leerer Kommentar haelt zurueck", () => {
  const out = freigabe({ transaktionen: [vorschlag()], regeln: [regel({ kommentar: "  " })] });
  assert.equal(out.report.gate_durchfall[0].grund, "kommentar");
});

test("gesperrte Belegstufe haelt zurueck", () => {
  const out = freigabe({ transaktionen: [vorschlag()], regeln: [regel({ belegstufe: "E4" })], gesperrteBelegstufen: ["E4"] });
  assert.equal(out.report.gate_durchfall[0].grund, "gesperrt");
});

test("unspezifisches Muster haelt zurueck", () => {
  const referenz = [
    tx({ gegenpartei: "Testladen Ortstoken", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", bestaetigt_durch: "mensch" }),
    tx({ gegenpartei: "Baumarkt Ortstoken", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-005", bestaetigt_durch: "mensch" }),
    tx({ gegenpartei: "Apotheke Ortstoken", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-007", bestaetigt_durch: "mensch" }),
  ];
  const v = vorschlag({ gegenpartei: "Neuer Laden Ortstoken" });
  const out = freigabe({ transaktionen: [...referenz, v], regeln: [regel({ gegenpartei_pattern: "ortstoken" })] });
  assert.equal(out.report.gate_durchfall[0].grund, "spezifitaet");
  assert.equal(out.report.zurueckgehalten, 1);
});

test("Auto-Freigaben dieses Laufs veraendern die Referenzmenge nicht", () => {
  // Zirkularitaetstest: die Referenzmenge wird EINMAL vor dem Lauf gebildet.
  const referenz = [
    tx({ gegenpartei: "Testladen Ortstoken", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", bestaetigt_durch: "mensch" }),
    tx({ gegenpartei: "Baumarkt Ortstoken", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-005", bestaetigt_durch: "mensch" }),
    tx({ gegenpartei: "Apotheke Ortstoken", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-007", bestaetigt_durch: "mensch" }),
  ];
  const viele = Array.from({ length: 50 }, () => vorschlag({ gegenpartei: "Irgendwas Ortstoken" }));
  const out = freigabe({ transaktionen: [...referenz, ...viele], regeln: [regel({ gegenpartei_pattern: "ortstoken" })] });
  assert.equal(out.report.freigegeben, 0);
  assert.equal(out.report.zurueckgehalten, 50);
});

test("nicht-vorgeschlagene Buchungen bleiben unberuehrt", () => {
  const offen = tx({ kategorisierung_status: "offen" });
  const out = freigabe({ transaktionen: [offen], regeln: [regel()] });
  assert.deepEqual(out.transaktionen[0], offen);
});

test("freigaben zaehlt je Regel", () => {
  const out = freigabe({ transaktionen: [vorschlag(), vorschlag()], regeln: [regel()] });
  assert.equal(out.report.freigaben[0].regel_id, "REG-001");
  assert.equal(out.report.freigaben[0].anzahl, 2);
  assert.equal(out.report.freigaben[0].belegstufe, "E2");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/freigabe.test.mjs`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: Kernfunktion implementieren**

```javascript
// app/tools/freigabe.mjs
//
// Auto-Freigabe mit Gate (ADR 0025). Arbeitet ueber den Bestand, nicht ueber
// den Import-Stream — damit wirkt der Lauf auch auf Vorschlaege, die vor
// Einfuehrung des Gates liegen geblieben sind.
//
// Abgrenzung zu confirm.mjs: dort entscheidet ein Mensch und darf darum auch
// korrigieren. Hier entscheidet das Regelwerk; jede Freigabe traegt
// bestaetigt_durch = "auto" und bleibt fuer recategorize.mjs anfassbar.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadMasterData, validateMasterData } from "./validator.mjs";
import { dataRootFromArg } from "./data-root.mjs";
import { referenzmenge, istSpezifisch } from "./lib/spezifitaet.mjs";

const BELEGSTUFEN = new Set(["E1", "E2", "E3", "E4"]);

// Warum eine Regel nicht automatisch freigeben darf. null heisst: sie darf.
// Kein Konfliktkriterium — categorize() liefert bei widersprechenden Regeln
// "offen", eine konfliktbehaftete Buchung erreicht dieses Gate also nie.
function gateGrund(regel, referenz, gesperrt) {
  if (!regel) return "unbekannt";
  if (regel.status !== "aktiv") return "inaktiv";
  if (!String(regel.kommentar ?? "").trim()) return "kommentar";
  if (!BELEGSTUFEN.has(regel.belegstufe)) return "belegstufe";
  if (gesperrt.includes(regel.belegstufe)) return "gesperrt";
  if (!istSpezifisch(regel, referenz)) return "spezifitaet";
  return null;
}

export function freigabe({ transaktionen, regeln, gesperrteBelegstufen = [] }) {
  // EINMAL vor dem Lauf gebildet: sonst zaehlten die Freigaben dieses Laufs
  // als Beleg fuer ihre eigene Spezifitaet.
  const referenz = referenzmenge(transaktionen);
  const index = new Map(regeln.map((r) => [r.regel_id, r]));
  const gate = new Map();
  const pruefe = (id) => {
    if (!gate.has(id)) gate.set(id, gateGrund(index.get(id), referenz, gesperrteBelegstufen));
    return gate.get(id);
  };

  const freigaben = new Map();
  const durchfall = new Map();
  let freigegeben = 0, agent_freigegeben = 0, zurueckgehalten = 0;

  const next = transaktionen.map((tx) => {
    if (tx.kategorisierung_status !== "vorgeschlagen") return tx;

    if (tx.kategorie_herkunft === "agent") {
      agent_freigegeben += 1;
      const key = `agent:${tx.kategorie_id}`;
      const eintrag = freigaben.get(key) ?? { regel_id: null, belegstufe: null, kategorie_id: tx.kategorie_id, anzahl: 0 };
      eintrag.anzahl += 1;
      freigaben.set(key, eintrag);
      return { ...tx, kategorisierung_status: "bestaetigt", bestaetigt_durch: "auto" };
    }

    const ids = tx.matched_regeln ?? [];
    const gruende = ids.map((id) => [id, pruefe(id)]).filter(([, grund]) => grund !== null);
    if (ids.length === 0 || gruende.length > 0) {
      for (const [id, grund] of gruende) durchfall.set(id, grund);
      zurueckgehalten += 1;
      return tx;
    }

    freigegeben += 1;
    for (const id of ids) {
      const key = `regel:${id}`;
      const eintrag = freigaben.get(key) ?? { regel_id: id, belegstufe: index.get(id).belegstufe, kategorie_id: tx.kategorie_id, anzahl: 0 };
      eintrag.anzahl += 1;
      freigaben.set(key, eintrag);
    }
    return { ...tx, kategorisierung_status: "bestaetigt", bestaetigt_durch: "auto" };
  });

  return {
    transaktionen: next,
    report: {
      freigegeben, agent_freigegeben, zurueckgehalten,
      freigaben: [...freigaben.values()],
      gate_durchfall: [...durchfall].map(([regel_id, grund]) => ({ regel_id, grund })),
    },
  };
}
```

- [ ] **Step 4: CLI ergaenzen**

Unter die Kernfunktion, Muster aus `confirm.mjs`:

```javascript
const USAGE = `Aufruf: node app/tools/freigabe.mjs [datenroot] [--schreiben]

Gibt vorgeschlagene Buchungen automatisch frei, soweit ihre Regel das Gate
besteht. Ohne --schreiben laeuft nur die Vorschau.`;

async function readJsonl(url) {
  const text = await readFile(url, "utf8");
  return text.split(/\r?\n/).filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
}

function berichte(report) {
  console.log(`Freigegeben ueber Regeln: ${report.freigegeben}`);
  console.log(`Freigegeben als Agentenvorschlag: ${report.agent_freigegeben}`);
  console.log(`Zurueckgehalten: ${report.zurueckgehalten}`);
  if (report.gate_durchfall.length) {
    console.log("\nAm Gate gescheitert:");
    for (const d of report.gate_durchfall) console.log(`  - ${d.regel_id}: ${d.grund}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) { console.log(USAGE); return; }
  const schreiben = args.includes("--schreiben");
  const masterRoot = dataRootFromArg(args.find((a) => !a.startsWith("--")));

  const [transaktionen, regeln] = await Promise.all([
    readJsonl(new URL("transaktionen.jsonl", masterRoot)),
    readFile(new URL("kategorisierungsregeln.json", masterRoot), "utf8").then(JSON.parse),
  ]);

  const out = freigabe({ transaktionen, regeln });
  berichte(out.report);

  if (!schreiben) { console.log("\nVorschau — nichts geschrieben. Mit --schreiben anwenden."); return; }

  await writeFile(new URL("transaktionen.jsonl", masterRoot), out.transaktionen.map((tx) => JSON.stringify(tx)).join("\n") + "\n");

  const validation = validateMasterData(await loadMasterData(masterRoot));
  if (!validation.valid) {
    console.error("Validierung nach Freigabe fehlgeschlagen:");
    for (const fehler of validation.errors.slice(0, 20)) console.error(`- ${fehler}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
```

- [ ] **Step 5: npm-Scripts ergaenzen**

In `package.json` unter `scripts`:

```json
    "freigabe": "node app/tools/freigabe.mjs app/data/master",
    "freigabe:schreiben": "node app/tools/freigabe.mjs app/data/master --schreiben",
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, alle zehn Freigabe-Tests.

- [ ] **Step 7: Commit**

```bash
git add app/tools/freigabe.mjs tests/freigabe.test.mjs package.json
git commit -m "feat: freigabe.mjs gibt Vorschlaege hinter einem Gate automatisch frei"
```

---

### Task 9: Log-Felder fuer die spaetere Lernschleife

**Files:**
- Modify: `app/tools/freigabe.mjs` (CLI-Teil)
- Modify: `app/tools/confirm.mjs`
- Test: `tests/confirm.test.mjs`

**Interfaces:**
- Consumes: `report.freigaben` und `report.gate_durchfall` aus Task 8
- Produces: Eintraege in `agent_log.jsonl` mit den Feldern `freigaben`, `gate_durchfall`, `korrekturen`. Task 12 aggregiert genau diese.

`app/data/**` ist gitignored — es gibt keine History, aus der sich eine
Korrektur nachtraeglich ableiten liesse. Sie muss im Moment der Korrektur
erfasst werden. Diese Felder gehoeren deshalb in Phase 1, obwohl sie erst
Phase 2 auswertet.

- [ ] **Step 1: Write the failing test**

An `tests/confirm.test.mjs` anhaengen:

```javascript
test("Korrektur einer Auto-Freigabe wird im report vermerkt", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"], bestaetigt_durch: "auto" });
  const out = confirmTransactions({
    transaktionen: [t], regeln,
    filter: { ids: [t.transaktion_id], auch_entschiedene: true },
    entscheidung: { aktion: "kategorie", kategorie_id: "KAT-005" },
  });
  assert.equal(out.report.korrekturen.length, 1);
  assert.equal(out.report.korrekturen[0].regel_id, "REG-001");
  assert.equal(out.report.korrekturen[0].von_kategorie, "KAT-003");
  assert.equal(out.report.korrekturen[0].nach_kategorie, "KAT-005");
});

test("Korrektur einer menschlichen Bestaetigung zaehlt nicht als Lernsignal", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"], bestaetigt_durch: "mensch" });
  const out = confirmTransactions({
    transaktionen: [t], regeln,
    filter: { ids: [t.transaktion_id], auch_entschiedene: true },
    entscheidung: { aktion: "kategorie", kategorie_id: "KAT-005" },
  });
  assert.equal(out.report.korrekturen.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/confirm.test.mjs`
Expected: FAIL — `out.report.korrekturen` ist `undefined`.

- [ ] **Step 3: `confirm.mjs` sammelt Korrekturen**

In `confirmTransactions` den `report` um `korrekturen: []` erweitern. In der
`map`-Schleife, bevor die Entscheidung angewandt wird:

```javascript
    // Lernsignal: nur das Ueberschreiben einer Auto-Freigabe zaehlt. Eine
    // Korrektur an einer menschlichen Entscheidung sagt nichts ueber die
    // Regelqualitaet aus — da hat schon jemand hingeschaut.
    if (tx.bestaetigt_durch === "auto") {
      const nach = entscheidung.aktion === "kategorie" ? entscheidung.kategorie_id : null;
      if (nach !== tx.kategorie_id) {
        for (const regel_id of tx.matched_regeln ?? []) {
          report.korrekturen.push({
            regel_id,
            belegstufe: regeln.find((r) => r.regel_id === regel_id)?.belegstufe ?? null,
            von_kategorie: tx.kategorie_id ?? null,
            nach_kategorie: nach,
          });
        }
      }
    }
```

- [ ] **Step 4: `confirm.mjs` schreibt ins Log**

Im CLI-Teil nach dem Schreiben von `transaktionen.jsonl`, Muster aus `inbox.mjs:195`:

```javascript
  if (out.report.korrekturen.length) {
    const protokoll = {
      zeitpunkt: new Date().toISOString(),
      anlass: "korrektur",
      inputs: ["data/master/transaktionen.jsonl"],
      korrekturen: out.report.korrekturen,
      notiz: `confirm.mjs: ${out.report.korrekturen.length} Korrektur(en) an Auto-Freigaben`,
    };
    const logUrl = new URL("agent_log.jsonl", masterRoot);
    const bisher = await readFile(logUrl, "utf8").catch(() => "");
    await writeFile(logUrl, `${bisher.replace(/\n*$/, "\n")}${JSON.stringify(protokoll)}\n`);
  }
```

- [ ] **Step 5: `freigabe.mjs` schreibt ins Log**

Im CLI-Teil von `freigabe.mjs`, nach dem Schreiben und vor der Validierung:

```javascript
  const protokoll = {
    zeitpunkt: new Date().toISOString(),
    anlass: "freigabe",
    inputs: ["data/master/transaktionen.jsonl"],
    freigaben: out.report.freigaben,
    gate_durchfall: out.report.gate_durchfall,
    notiz: `freigabe.mjs: ${out.report.freigegeben} ueber Regeln, ${out.report.agent_freigegeben} als Agentenvorschlag, ${out.report.zurueckgehalten} zurueckgehalten`,
  };
  const logUrl = new URL("agent_log.jsonl", masterRoot);
  const bisher = await readFile(logUrl, "utf8").catch(() => "");
  await writeFile(logUrl, `${bisher.replace(/\n*$/, "\n")}${JSON.stringify(protokoll)}\n`);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/tools/confirm.mjs app/tools/freigabe.mjs tests/confirm.test.mjs
git commit -m "feat: Freigaben, Gate-Durchfall und Korrekturen im Agent-Log erfassen"
```

---

### Task 10: `pruefbericht.mjs` — die Nachkontrolle

**Files:**
- Create: `app/tools/pruefbericht.mjs`
- Modify: `package.json`
- Test: `tests/pruefbericht.test.mjs` (neu)

**Interfaces:**
- Consumes: `bestaetigt_durch` aus Task 1, `belegstufe` aus Task 5, `gate_durchfall` aus Task 9
- Produces: `pruefbericht({ transaktionen, regeln, konten, zeitwerte, log }) -> { grosse, nur_auto_merchants, ausreisser, kat012, gate_durchfall, e4_regeln, konten_ohne_anker }`. Rein lesend, Exit-Code immer 0.

Feldwerte am Bestand verifiziert: Konto-Anker liegen als Zeitwert mit
`entitaet = "konto"` und `feld = "kontostand"` bzw. `"depotwert"` vor.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/pruefbericht.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { pruefbericht } from "../app/tools/pruefbericht.mjs";

let n = 0;
function tx(props) {
  n += 1;
  return {
    transaktion_id: `TXN-${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`,
    konto_id: "KTO-001", buchungsdatum: "2026-05-20", betrag: "-10.00",
    gegenpartei: "Testladen", verwendungszweck: "", ist_transfer: false, ...props,
  };
}
const auto = (p) => tx({ kategorisierung_status: "bestaetigt", bestaetigt_durch: "auto", kategorie_id: "KAT-003", ...p });
const mensch = (p) => tx({ kategorisierung_status: "bestaetigt", bestaetigt_durch: "mensch", kategorie_id: "KAT-003", ...p });
const leer = { transaktionen: [], regeln: [], konten: [], zeitwerte: [], log: [] };

test("grosse Betraege kommen zuerst und nur aus Auto-Freigaben", () => {
  const out = pruefbericht({ ...leer, transaktionen: [
    auto({ betrag: "-50.00" }), auto({ betrag: "-900.00" }), mensch({ betrag: "-5000.00" }),
  ] });
  assert.equal(out.grosse.length, 2);
  assert.equal(out.grosse[0].betrag, "-900.00");
});

test("Merchants ohne jede menschliche Bestaetigung werden gemeldet", () => {
  const out = pruefbericht({ ...leer, transaktionen: [
    auto({ gegenpartei: "Nie Gesehen" }), auto({ gegenpartei: "Schon Bekannt" }), mensch({ gegenpartei: "Schon Bekannt" }),
  ] });
  assert.deepEqual(out.nur_auto_merchants.map((m) => m.gegenpartei), ["Nie Gesehen"]);
});

test("auto-freigegebene KAT-012 werden vollstaendig gelistet", () => {
  const out = pruefbericht({ ...leer, transaktionen: [
    auto({ kategorie_id: "KAT-012" }), auto({ kategorie_id: "KAT-003" }), mensch({ kategorie_id: "KAT-012" }),
  ] });
  assert.equal(out.kat012.length, 1);
});

test("E4-Regeln werden separat gelistet", () => {
  const out = pruefbericht({ ...leer, regeln: [
    { regel_id: "REG-001", belegstufe: "E4", kategorie_id: "KAT-003", status: "aktiv", kommentar: "Web" },
    { regel_id: "REG-002", belegstufe: "E2", kategorie_id: "KAT-003", status: "aktiv", kommentar: "Bestand" },
  ] });
  assert.deepEqual(out.e4_regeln.map((r) => r.regel_id), ["REG-001"]);
});

test("Konten ohne Anker werden gemeldet", () => {
  const out = pruefbericht({ ...leer,
    konten: [{ konto_id: "KTO-001", name: "Mit Anker", kontotyp: "giro" }, { konto_id: "KTO-002", name: "Ohne Anker", kontotyp: "giro" }],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "100.00", standdatum: "2026-01-01", qualitaet: "belegt" }],
  });
  assert.deepEqual(out.konten_ohne_anker.map((k) => k.konto_id), ["KTO-002"]);
});

test("Gate-Durchfall kommt aus dem juengsten Freigabe-Logeintrag", () => {
  const out = pruefbericht({ ...leer, log: [
    { zeitpunkt: "2026-08-30T10:00:00+02:00", anlass: "freigabe", gate_durchfall: [{ regel_id: "REG-900", grund: "spezifitaet" }] },
    { zeitpunkt: "2026-08-31T10:00:00+02:00", anlass: "freigabe", gate_durchfall: [{ regel_id: "REG-901", grund: "belegstufe" }] },
  ] });
  assert.deepEqual(out.gate_durchfall.map((d) => d.regel_id), ["REG-901"]);
});

test("nicht reconcilierte Kontostaende werden gemeldet", () => {
  const out = pruefbericht({ ...leer, log: [
    { anlass: "import", normalisierung: { quelle: "auszug-a.csv", zeilen_gesamt: 10, zeilen_error: 0, reconciliation_differenz: "-12.34" } },
    { anlass: "import", normalisierung: { quelle: "auszug-b.csv", zeilen_gesamt: 5, zeilen_error: 0 } },
  ] });
  assert.equal(out.reconciliation.length, 1);
  assert.equal(out.reconciliation[0].quelle, "auszug-a.csv");
});

test("leerer Bestand liefert leere Listen statt Fehler", () => {
  const out = pruefbericht(leer);
  assert.deepEqual(out.grosse, []);
  assert.deepEqual(out.ausreisser, []);
  assert.deepEqual(out.reconciliation, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/pruefbericht.test.mjs`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: Kernfunktion implementieren**

```javascript
// app/tools/pruefbericht.mjs
//
// Nachkontrolle statt Vorab-Zustimmung (ADR 0025). Rein lesend, blockiert nie.
// Ersetzt die Bucket-Dialoge durch eine Liste dessen, was ein Mensch sich
// ansehen sollte — vor allem das, was nie ein Mensch gesehen hat.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dataRootFromArg } from "./data-root.mjs";
import { normalizeLoose, toCents } from "./lib/text.mjs";

const GROSSE_ANZAHL = 15;
const AUSREISSER_FAKTOR = 2;
const AUSREISSER_MINDESTABWEICHUNG_CENT = 10000; // 100 EUR: darunter ist Rauschen

const istAuto = (tx) => tx.bestaetigt_durch === "auto";
const istMensch = (tx) => tx.bestaetigt_durch === "mensch" || tx.kategorie_herkunft === "manuell";

function median(werte) {
  if (werte.length === 0) return 0;
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

// Kategorien, deren juengster Monat stark vom Median der sechs davor abweicht.
function ausreisser(transaktionen) {
  const proKategorieMonat = new Map();
  for (const tx of transaktionen) {
    if (!tx.kategorie_id) continue;
    const key = `${tx.kategorie_id}|${tx.buchungsdatum.slice(0, 7)}`;
    proKategorieMonat.set(key, (proKategorieMonat.get(key) ?? 0) + Math.abs(toCents(tx.betrag)));
  }
  const proKategorie = new Map();
  for (const [key, summe] of proKategorieMonat) {
    const [kategorie_id, monat] = key.split("|");
    if (!proKategorie.has(kategorie_id)) proKategorie.set(kategorie_id, []);
    proKategorie.get(kategorie_id).push({ monat, summe });
  }
  const treffer = [];
  for (const [kategorie_id, monate] of proKategorie) {
    if (monate.length < 3) continue;
    monate.sort((a, b) => a.monat.localeCompare(b.monat));
    const juengster = monate[monate.length - 1];
    const vergleich = median(monate.slice(-7, -1).map((m) => m.summe));
    if (vergleich === 0) continue;
    const abweichung = juengster.summe - vergleich;
    if (juengster.summe > vergleich * AUSREISSER_FAKTOR && abweichung > AUSREISSER_MINDESTABWEICHUNG_CENT) {
      treffer.push({ kategorie_id, monat: juengster.monat, summe_cent: juengster.summe, median_cent: vergleich });
    }
  }
  return treffer;
}

export function pruefbericht({ transaktionen, regeln, konten, zeitwerte, log }) {
  const autos = transaktionen.filter(istAuto);

  const menschlicheMerchants = new Set(transaktionen.filter(istMensch).map((tx) => normalizeLoose(tx.gegenpartei)));
  const nurAuto = new Map();
  for (const tx of autos) {
    const key = normalizeLoose(tx.gegenpartei);
    if (menschlicheMerchants.has(key)) continue;
    const e = nurAuto.get(key) ?? { gegenpartei: tx.gegenpartei, anzahl: 0, kategorie_id: tx.kategorie_id };
    e.anzahl += 1;
    nurAuto.set(key, e);
  }

  const letzteFreigabe = [...log].filter((e) => e.anlass === "freigabe").pop();
  const ankerIds = new Set((zeitwerte ?? [])
    .filter((z) => z.entitaet === "konto" && (z.feld === "kontostand" || z.feld === "depotwert"))
    .map((z) => z.entitaet_id));

  return {
    grosse: [...autos].sort((a, b) => Math.abs(toCents(b.betrag)) - Math.abs(toCents(a.betrag))).slice(0, GROSSE_ANZAHL),
    nur_auto_merchants: [...nurAuto.values()].sort((a, b) => b.anzahl - a.anzahl),
    ausreisser: ausreisser(transaktionen),
    kat012: autos.filter((tx) => tx.kategorie_id === "KAT-012"),
    gate_durchfall: letzteFreigabe?.gate_durchfall ?? [],
    e4_regeln: (regeln ?? []).filter((r) => r.belegstufe === "E4" && r.status === "aktiv"),
    konten_ohne_anker: (konten ?? []).filter((k) => !ankerIds.has(k.konto_id)),
    // Ein Kopf-Kontostand, der nicht aufging, wurde bewusst NICHT geschrieben.
    // Genau deshalb muss er hier sichtbar sein, sonst verschwindet die Luecke.
    reconciliation: (log ?? [])
      .flatMap((e) => e.normalisierung ? [e.normalisierung] : [])
      .filter((n) => n.reconciliation_differenz),
  };
}
```

- [ ] **Step 4: CLI ergaenzen**

```javascript
function zeile(betrag, text) {
  return `  ${String(betrag).padStart(12)}  ${text}`;
}

function renderBericht(b) {
  const z = [];
  z.push(`GROESSTE AUTO-FREIGABEN (${b.grosse.length})`);
  for (const tx of b.grosse) z.push(zeile(tx.betrag, `${tx.buchungsdatum}  ${tx.gegenpartei}  [${tx.kategorie_id}]`));

  z.push("", `MERCHANTS, DIE NIE EIN MENSCH BESTAETIGT HAT (${b.nur_auto_merchants.length})`);
  for (const m of b.nur_auto_merchants.slice(0, 20)) z.push(`  ${String(m.anzahl).padStart(4)}x  ${m.gegenpartei}  [${m.kategorie_id}]`);

  z.push("", `KATEGORIE-AUSREISSER (${b.ausreisser.length})`);
  for (const a of b.ausreisser) z.push(`  ${a.kategorie_id}  ${a.monat}: ${(a.summe_cent / 100).toFixed(2)} gegen Median ${(a.median_cent / 100).toFixed(2)}`);

  z.push("", `AUTO-FREIGEGEBEN AUF KAT-012 — NOCH ZU KLAEREN (${b.kat012.length})`);
  for (const tx of b.kat012) z.push(zeile(tx.betrag, `${tx.buchungsdatum}  ${tx.gegenpartei}`));

  z.push("", `AM GATE GESCHEITERT (${b.gate_durchfall.length})`);
  for (const d of b.gate_durchfall) z.push(`  ${d.regel_id}: ${d.grund}`);

  z.push("", `REGELN NUR AUF WEB-RECHERCHE, BELEGSTUFE E4 (${b.e4_regeln.length})`);
  for (const r of b.e4_regeln) z.push(`  ${r.regel_id}  [${r.kategorie_id}]  ${r.kommentar}`);

  z.push("", `KONTEN OHNE BELEGTEN ANKER (${b.konten_ohne_anker.length})`);
  for (const k of b.konten_ohne_anker) z.push(`  ${k.konto_id}  ${k.name}`);

  z.push("", `NICHT RECONCILIERTE KONTOSTAENDE (${b.reconciliation.length})`);
  for (const r of b.reconciliation) z.push(`  ${r.quelle}: Differenz ${r.reconciliation_differenz}`);
  return z.join("\n");
}

async function readJsonl(url) {
  const text = await readFile(url, "utf8").catch(() => "");
  return text.split(/\r?\n/).filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
}
async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

async function main() {
  const masterRoot = dataRootFromArg(process.argv.slice(2).find((a) => !a.startsWith("--")));
  const [transaktionen, zeitwerte, log, regeln, konten] = await Promise.all([
    readJsonl(new URL("transaktionen.jsonl", masterRoot)),
    readJsonl(new URL("zeitwerte.jsonl", masterRoot)),
    readJsonl(new URL("agent_log.jsonl", masterRoot)),
    readJson(new URL("kategorisierungsregeln.json", masterRoot)),
    readJson(new URL("konten.json", masterRoot)),
  ]);
  console.log(renderBericht(pruefbericht({ transaktionen, regeln, konten, zeitwerte, log })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
```

- [ ] **Step 5: npm-Script ergaenzen**

```json
    "pruefbericht": "node app/tools/pruefbericht.mjs app/data/master",
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Gegen den echten Bestand laufen lassen**

Run: `npm run pruefbericht`
Expected: ein lesbarer Bericht; `konten_ohne_anker` meldet drei Konten.

- [ ] **Step 8: Commit**

```bash
git add app/tools/pruefbericht.mjs tests/pruefbericht.test.mjs package.json
git commit -m "feat: pruefbericht.mjs als Nachkontrolle statt Vorab-Zustimmung"
```

---

### Task 11: Subagenten, Orchestrator-Skill und Doku

**Files:**
- Create: `.claude/agents/import-normalisierung.md`
- Create: `.claude/agents/regel-recherche.md`
- Create: `app/docs/skills/import-durchlauf.md`
- Create: `docs/adr/0025-auto-freigabe-mit-gate.md`
- Modify: `.gitignore`
- Modify: `app/docs/skills/import-agent.md`
- Modify: `app/docs/skills/kategorisierung-review.md`

**Interfaces:**
- Consumes: `freigabe.mjs` aus Task 8, `pruefbericht.mjs` aus Task 10
- Produces: der Skill `import-durchlauf`, den der Nutzer aufruft.

- [ ] **Step 1: `.gitignore` oeffnen fuer Agent-Definitionen**

`.claude/` ist heute vollstaendig ignoriert. Die Agent-Definitionen sind aber
Projektkonfiguration und muessen versioniert sein, sonst gehen Modell und
Effort beim naechsten Rechner verloren. Nach dem Muster, das die Datei fuer
`app/data/**/README.md` bereits verwendet:

```
.claude/
!.claude/agents/
!.claude/agents/*.md
```

Wichtig: `.claude/settings.local.json` bleibt ignoriert — dort stehen lokale
Permissions, die nicht ins Repo gehoeren.

- [ ] **Step 2: Subagent fuer die Normalisierung**

```markdown
---
name: import-normalisierung
description: Normalisiert eine Bank-Rohdatei in die Standardform und spielt sie ueber import.mjs ein. Nutzen, wenn ein Kontoauszug oder Banking-Export eingelesen werden soll.
model: opus
effort: xhigh
tools: Read, Grep, Glob, Bash
---

Folge `app/docs/skills/import-agent.md` vollstaendig. Dieses Dokument ist die
Wahrheit; hier steht nur, was zusaetzlich gilt.

Deine Station ist die riskanteste der Pipeline: Eine falsche Spaltenzuordnung
korrumpiert stumm tausende Zeilen, und die Saldo-Kettenpruefung faengt zwar
Betrags- und Vorzeichenfehler, aber keine vertauschte Gegenpartei. Arbeite
entsprechend langsam.

Der Lauf haelt nie an:

- Konto fehlt in `konten.json` -> anlegen und im Bericht nennen.
- Format oder Bank unklar -> Zeile nach `error/`, nie raten.
- Kopf-Kontostand reconciliert -> als Zeitwert schreiben.
- Kopf-Kontostand reconciliert nicht -> **nicht** schreiben, Differenz berichten.
- Kein belegter Anker -> weiter, Konto als "ohne Anker" berichten.

Durchlaufen heisst nicht raten. Ein falscher Saldo-Anker verschiebt die
gesamte Liquiditaetsrechnung und ist, anders als eine Kategorie, nicht
nebenbei korrigierbar.

Faellt dir eine wiederverwendbare Erkenntnis ueber das Format auf, formuliere
sie am Ende als konkreten Textvorschlag fuer `app/docs/skills/import-agent.md`.
Aendere das Dokument **nicht** selbst — der Vorschlag geht in den Bericht.

Gib am Ende zurueck: Anzahl importiert, Anzahl nach `error/`, angelegte Konten,
Anker-Status je Konto, Reconciliation-Differenzen, Formatvorschlaege.
```

- [ ] **Step 3: Subagent fuer die Regelrecherche**

```markdown
---
name: regel-recherche
description: Arbeitet den Offen-Stapel ueber die Belegleiter ab und legt Kategorisierungsregeln an. Nutzen, wenn offene oder unkategorisierte Buchungen verregelt werden sollen.
model: opus
effort: xhigh
tools: Read, Grep, Glob, Bash, WebSearch, WebFetch
---

Folge `app/docs/skills/kategorisierungsregel-pflege.md` vollstaendig. Dieses
Dokument ist die Wahrheit; hier steht nur, was zusaetzlich gilt.

Jede Regel, die du anlegst, traegt `belegstufe` als Feld — `E1` bis `E4`. Das
ist Pflicht, nicht Kommentar: Ohne Stufe gibt das Gate die Buchungen der Regel
nicht automatisch frei.

`E5` und `E6` werden **nie** Regeln. Sie sind Agenten-Einzelvorschlaege, E6
immer auf `KAT-012`.

Der haeufigste Fehler an dieser Station ist nicht zu wenig Nachdenken, sondern
das Hochstufen: E6 als E4 zu deklarieren, weil eine Websuche irgendetwas
geliefert hat. Wenn die Recherche die **Leistung** nicht geklaert hat, ist es
E6 — auch nach zwanzig Minuten Suche.

Beginne mit `node app/tools/regel-vorschlag.mjs DATENROOT`; die Reihenfolge des
Berichts ist der Hebel. E1 und E2 vor E3 und E4: sie sind lokal und geben keine
Merchant-Namen an eine Suchmaschine.

Pruefe jede Kandidatenregel mit `node app/tools/regel-probelauf.mjs` bevor du
sie schreibst. Ein `unspezifisch`-Befund heisst: das Muster traegt keine
Kategorieaussage, es streut ueber drei oder mehr Kategorien. Verwirf es.

Gib am Ende zurueck: angelegte Regeln je Belegstufe, Anzahl erzeugter
Vorschlaege, verbleibende E5/E6-Faelle.
```

- [ ] **Step 4: Orchestrator-Skill**

```markdown
# Skill: Import-Durchlauf

Ein Lauf von der Rohdatei bis zum freigegebenen Bestand. Dieser Skill
**orchestriert nur** — die Urteilsarbeit liegt in Subagenten, das Rechnen in
Tools.

Alle Pfade sind app-relativ: `data/...`, `tools/...`, `docs/...` liegen unter
dem App-Raum.

## Wann diesen Skill nutzen

Wenn neue Belege eingespielt werden sollen ("importier den Auszug", "arbeite
die Inbox ab") oder der Offen-Stapel in einem Zug abgearbeitet werden soll.

Nicht nutzen fuer einzelne Korrekturen an bereits freigegebenen Buchungen —
das ist **kategorisierung-review**.

## Ablauf

1. **Lernmetriken lesen.** `node tools/lernen.mjs DATENROOT` und den Befund
   vor den Lauf stellen. Gesperrte Belegstufen und stillgelegte Regeln nennen.
   (Ab Phase 2; vorher entfaellt der Schritt.)
2. **Normalisieren und importieren.** Je Rohdatei den Subagenten
   `import-normalisierung` beauftragen. Der Lauf haelt nie an.
3. **Verregeln.** Den Subagenten `regel-recherche` auf den Offen-Stapel
   ansetzen. Er legt Regeln an und ruft `recategorize.mjs`.
4. **Freigeben.** `node tools/freigabe.mjs DATENROOT --schreiben`.
5. **Pruefen.** `node tools/pruefbericht.mjs DATENROOT` und den Bericht
   ungekuerzt zeigen.
6. **Protokollieren.** Die Zaehler in `DATENROOT/agent_log.jsonl` festhalten.

## Zentrale Regeln

- **Keine Vorab-Zustimmung einholen.** Das Gate entscheidet, der Pruefbericht
  ist die Kontrolle. Bucket-Dialoge gehoeren nicht in diesen Skill.
- **Den Pruefbericht vollstaendig zeigen**, nicht zusammenfassen. Er ist der
  einzige Ort, an dem der Nutzer sieht, was nie ein Mensch angesehen hat.
- **Textvorschlaege aus Station 2 nie selbst uebernehmen.** Sie aendern
  kuenftiges Verhalten und brauchen ein Wort des Nutzers.
- **Bei einem harten Validierungsfehler stoppen.** Der Lauf haelt nicht fuer
  Entscheidungen an, aber sehr wohl fuer kaputte Daten.

## Do's

- Den Bericht mit den groessten Betraegen und den `KAT-012`-Faellen eroeffnen —
  dort ist die Aufmerksamkeit am wertvollsten.
- Am Gate gescheiterte Regeln als Arbeitsliste anbieten: das ist Regelarbeit
  an einer Handvoll Mustern, nicht an hunderten Buchungen.

## Don'ts

- **Keine Kategorie raten**, um den Offen-Stapel zu leeren. Ohne Beleg ist es
  `KAT-012`.
- **Keinen Saldo-Anker uebernehmen, der nicht reconciliert.**
- **Keine Regel selbst anlegen** — das ist Station 3.
```

- [ ] **Step 5: ADR 0025 schreiben**

```markdown
# Auto-Freigabe mit Gate statt Vorab-Review

Vorgeschlagene Kategorien werden nicht mehr einzeln vom Nutzer bestaetigt,
sondern von einem deterministischen Gate automatisch freigegeben. Die Kontrolle
verschiebt sich von einer Zustimmung vorab auf einen Pruefbericht danach.

## Begruendung

Der Engpass war nie das Rechnen. `confirm.mjs --regel_id=` erledigt ein Bucket
in einem Aufruf. Was Zeit frisst, ist die Vorschrift, pro Bucket eine
Stichprobe zu zeigen und auf eine Entscheidung zu warten: 38 Buckets sind 38
Dialogrunden, und dieser Aufwand faellt bei jedem Import erneut an.

Das Gate ist **modellunabhaengig**. Ein schwaecheres Urteil bei der Regelanlage
erzeugt nicht mehr falsche Daten, sondern mehr durchgefallene Regeln — der
Schaden materialisiert sich als sichtbare Arbeit, nicht als stille Korruption
im Bestand. Das ist der Grund, warum die Zustimmungszeremonie ersatzlos
entfallen kann.

Eine Auto-Freigabe traegt `bestaetigt_durch = "auto"` und ist damit **kein
menschlicher Akt**: `recategorize.mjs` darf sie neu bewerten. Ein
auto-freigegebener `KAT-012`-Eintrag wird von jeder spaeter angelegten
passenden Regel eingesammelt. Der blinde Fleck schrumpft mit jedem
Regel-Tuning von selbst.

## Das Gate

Eine Regel gibt automatisch frei, wenn sie aktiv ist, einen Kommentar traegt,
eine `belegstufe` in E1-E4 hat, deren Stufe nicht gesperrt ist, und ihr Muster
die Spezifitaetspruefung besteht.

**Kein Konfliktkriterium.** `categorize()` liefert bei widersprechenden Regeln
`status = "offen"`, nie `"vorgeschlagen"` — eine konfliktbehaftete Buchung
erreicht das Gate nicht.

Die **Spezifitaetspruefung** zaehlt, ueber wie viele Kategorien ein
Musterzweig in der Referenzmenge streut. Ab drei Kategorien traegt er keine
Kategorieaussage mehr. Die Referenzmenge sind ausschliesslich menschlich
entschiedene Buchungen: gegen den Gesamtbestand gerechnet wuerde eine schlechte
Regel ihre eigenen Freigaben als Beleg fuer ihre Spezifitaet zaehlen.

Die Pruefung ist ein **Veto**, kein Beweis. Bei duenner Referenzmenge kommt
eine Regel durch; sie kann nichts durchwinken, was sonst gestoppt worden waere.

## Verworfene Alternativen

- **Freigabe nach Risikoschwelle** (Betrag, Neuheit des Merchants). Die
  Schwellen waeren erfundene Zahlen ohne Beleg — genau das, was die Belegleiter
  in `kategorisierungsregel-pflege` verbietet.
- **Freigabe im Import-Lauf statt als Bestands-Tool.** Erreicht die vorhandenen
  Vorschlaege nie, weil der Dedupe-Hash Bekanntes ueberspringt, und liesse
  nach einem Regel-Tuning keine erneute Freigabe zu.
- **Nur Regel-Buckets automatisch freigeben, Agentenvorschlaege im Dialog.**
  Haette den Rueckstand um 84 % gesenkt, aber den Dialog als Pflichtstation
  erhalten. Der Nutzer hat sich am 2026-08-31 bewusst fuer die vollstaendige
  Automatisierung entschieden.
- **`belegstufe` als globales Pflichtfeld.** Haette die 295 Bestandsregeln
  sofort ungueltig gemacht. Stattdessen erzwingt der Validator den Wertebereich
  und das Gate die Anwesenheit.

## Konsequenz

- Neues Feld `bestaetigt_durch` (`auto | mensch`) an der Transaktion, vom
  Validator in beide Richtungen erzwungen.
- Neues Feld `belegstufe` (`E1`-`E4`) an der Kategorisierungsregel.
- Neue Tools `freigabe.mjs` und `pruefbericht.mjs`.
- `istKandidat()` in `recategorize.mjs` behandelt `auto` als Kandidat.
- `kategorisierung-review` ist nicht mehr Pflichtstation, sondern
  Korrekturkanal.
- Diese ADR praezisiert ADR 0017 in der Kandidatendefinition und erweitert
  ADR 0018 um `belegstufe`.
```

- [ ] **Step 6: `import-agent.md` entschaerfen**

Die vier Haltestellen entfernen. Betroffen sind die Abschnitte zu
Reconciliation-Pflicht, fehlendem Anker, Schritt 1 (Rohdatei sichten) und
Schritt 2 (Konto zuordnen). Jede Formulierung "beim Nutzer nachfragen" /
"nach expliziter Bestaetigung" ersetzen durch die Tabelle aus dem Subagenten in
Step 2. Der Grundsatz "niemals raten" bleibt unveraendert — er wird nicht
schwaecher, sondern verlagert sich von "fragen" auf "in den Bericht".

- [ ] **Step 7: `kategorisierung-review.md` umwidmen**

Im Abschnitt "Wann diesen Skill nutzen" ergaenzen, dass Review kein
Pflichtdurchlauf mehr ist, sondern der Kanal fuer Korrekturen an dem, was der
Pruefbericht zutage foerdert. Der Hinweis, dass eine Korrektur an einer
Auto-Freigabe `--auch-entschiedene` braucht, gehoert dazu.

- [ ] **Step 8: Validator gegen den Bestand**

Run: `npm test && npm run validate:master`
Expected: PASS, keine Fehler.

- [ ] **Step 9: Commit**

```bash
git add .gitignore .claude/agents app/docs/skills docs/adr/0025-auto-freigabe-mit-gate.md
git commit -m "feat: Durchlauf-Skill, Subagenten mit gepinntem Modell und ADR 0025"
```

---

## Phase 2 — Die Lernschleife

Phase 2 wertet aus, was Phase 1 protokolliert. Sie beginnt nicht nach einer
festen Zeit, sondern sobald eine Belegstufe 20 Auto-Freigaben erreicht hat.
Die Tools sind vorher schon testbar — mit synthetischen Logs.

### Task 12: `lernen.mjs` — Metriken aus dem Agent-Log

**Files:**
- Create: `app/tools/lernen.mjs`
- Modify: `package.json`
- Test: `tests/lernen.test.mjs` (neu)

**Interfaces:**
- Consumes: Log-Felder `freigaben`, `gate_durchfall`, `korrekturen` aus Task 9
- Produces: `metriken(log) -> { je_regel, je_belegstufe, gate_gruende, gesperrte_belegstufen, stillzulegende_regeln }`

Schwellenwerte, in eigener Sache: Diese Zahlen messen kein Urteil darueber, was
eine Buchung bedeutet, sondern beobachtetes Verhalten gegen die Korrekturen des
Nutzers. Und sie steuern eine reversible, sichtbare Aktion. Sie sind
Startwerte und selbst Gegenstand der Messung, sobald genug Laeufe vorliegen.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/lernen.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { metriken } from "../app/tools/lernen.mjs";

const freigabe = (freigaben, gate_durchfall = []) => ({ zeitpunkt: "2026-08-31T10:00:00+02:00", anlass: "freigabe", freigaben, gate_durchfall });
const korrektur = (korrekturen) => ({ zeitpunkt: "2026-08-31T11:00:00+02:00", anlass: "korrektur", korrekturen });

test("leeres Log liefert leere Metriken statt Division durch null", () => {
  const m = metriken([]);
  assert.deepEqual(m.je_regel, []);
  assert.deepEqual(m.gesperrte_belegstufen, []);
  assert.deepEqual(m.stillzulegende_regeln, []);
});

test("Korrekturquote je Regel", () => {
  const m = metriken([
    freigabe([{ regel_id: "REG-001", belegstufe: "E2", anzahl: 10 }]),
    korrektur([{ regel_id: "REG-001", belegstufe: "E2", von_kategorie: "KAT-003", nach_kategorie: "KAT-005" }]),
    korrektur([{ regel_id: "REG-001", belegstufe: "E2", von_kategorie: "KAT-003", nach_kategorie: "KAT-005" }]),
  ]);
  assert.equal(m.je_regel[0].regel_id, "REG-001");
  assert.equal(m.je_regel[0].freigaben, 10);
  assert.equal(m.je_regel[0].korrekturen, 2);
  assert.equal(m.je_regel[0].quote, 0.2);
});

test("Regel ueber 30 Prozent bei mindestens 10 Freigaben wird stillgelegt", () => {
  const korrekturen = Array.from({ length: 4 }, () => ({ regel_id: "REG-001", belegstufe: "E2", von_kategorie: "KAT-003", nach_kategorie: "KAT-005" }));
  const m = metriken([freigabe([{ regel_id: "REG-001", belegstufe: "E2", anzahl: 10 }]), korrektur(korrekturen)]);
  assert.deepEqual(m.stillzulegende_regeln, ["REG-001"]);
});

test("zu wenige Freigaben legen nichts still", () => {
  const m = metriken([
    freigabe([{ regel_id: "REG-001", belegstufe: "E2", anzahl: 3 }]),
    korrektur([{ regel_id: "REG-001", belegstufe: "E2", von_kategorie: "KAT-003", nach_kategorie: "KAT-005" }]),
  ]);
  assert.deepEqual(m.stillzulegende_regeln, []);
});

test("Belegstufe ueber 25 Prozent bei mindestens 20 Freigaben wird gesperrt", () => {
  const korrekturen = Array.from({ length: 6 }, () => ({ regel_id: "REG-002", belegstufe: "E4", von_kategorie: "KAT-003", nach_kategorie: "KAT-005" }));
  const m = metriken([freigabe([{ regel_id: "REG-002", belegstufe: "E4", anzahl: 20 }]), korrektur(korrekturen)]);
  assert.deepEqual(m.gesperrte_belegstufen, ["E4"]);
});

test("Belegstufe unter 25 Prozent bleibt offen", () => {
  const korrekturen = Array.from({ length: 4 }, () => ({ regel_id: "REG-002", belegstufe: "E4", von_kategorie: "KAT-003", nach_kategorie: "KAT-005" }));
  const m = metriken([freigabe([{ regel_id: "REG-002", belegstufe: "E4", anzahl: 20 }]), korrektur(korrekturen)]);
  assert.deepEqual(m.gesperrte_belegstufen, []);
});

test("Gate-Gruende werden gezaehlt", () => {
  const m = metriken([freigabe([], [{ regel_id: "REG-900", grund: "spezifitaet" }, { regel_id: "REG-901", grund: "spezifitaet" }, { regel_id: "REG-902", grund: "belegstufe" }])]);
  assert.equal(m.gate_gruende.spezifitaet, 2);
  assert.equal(m.gate_gruende.belegstufe, 1);
});

test("Agentenvorschlaege ohne regel_id stuerzen nicht ab", () => {
  const m = metriken([freigabe([{ regel_id: null, belegstufe: null, kategorie_id: "KAT-012", anzahl: 5 }])]);
  assert.deepEqual(m.je_regel, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/lernen.test.mjs`
Expected: FAIL — Modul existiert nicht.

- [ ] **Step 3: Implementierung**

```javascript
// app/tools/lernen.mjs
//
// Lernschleife (ADR 0026). Wertet agent_log.jsonl aus, das bisher write-only
// war. Kein Urteil, keine Selbsteinschaetzung — nur beobachtete Ergebnisse
// gegen den einzigen verfuegbaren Grundwahrheitswert: die Korrekturen des
// Nutzers an Auto-Freigaben.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dataRootFromArg } from "./data-root.mjs";

const REGEL_QUOTE = 0.30;
const REGEL_MINDESTMENGE = 10;
const STUFE_SPERREN_AB = 0.25;
const STUFE_ENTSPERREN_UNTER = 0.15;  // Hysterese gegen Flattern an der Schwelle
const STUFE_MINDESTMENGE = 20;

function zaehle(log) {
  const freigaben = new Map();
  const korrekturen = new Map();
  const stufeFreigaben = new Map();
  const stufeKorrekturen = new Map();
  const gate_gruende = {};

  for (const eintrag of log) {
    for (const f of eintrag.freigaben ?? []) {
      if (f.belegstufe) stufeFreigaben.set(f.belegstufe, (stufeFreigaben.get(f.belegstufe) ?? 0) + f.anzahl);
      if (!f.regel_id) continue;   // Agentenvorschlaege tragen keine Regel
      freigaben.set(f.regel_id, (freigaben.get(f.regel_id) ?? 0) + f.anzahl);
    }
    for (const k of eintrag.korrekturen ?? []) {
      if (k.belegstufe) stufeKorrekturen.set(k.belegstufe, (stufeKorrekturen.get(k.belegstufe) ?? 0) + 1);
      if (!k.regel_id) continue;
      korrekturen.set(k.regel_id, (korrekturen.get(k.regel_id) ?? 0) + 1);
    }
    for (const d of eintrag.gate_durchfall ?? []) {
      gate_gruende[d.grund] = (gate_gruende[d.grund] ?? 0) + 1;
    }
  }
  return { freigaben, korrekturen, stufeFreigaben, stufeKorrekturen, gate_gruende };
}

export function metriken(log, gesperrtBisher = []) {
  const z = zaehle(log);

  const je_regel = [...z.freigaben].map(([regel_id, anzahl]) => ({
    regel_id, freigaben: anzahl,
    korrekturen: z.korrekturen.get(regel_id) ?? 0,
    quote: (z.korrekturen.get(regel_id) ?? 0) / anzahl,
  })).sort((a, b) => b.quote - a.quote);

  const je_belegstufe = [...z.stufeFreigaben].map(([belegstufe, anzahl]) => ({
    belegstufe, freigaben: anzahl,
    korrekturen: z.stufeKorrekturen.get(belegstufe) ?? 0,
    quote: (z.stufeKorrekturen.get(belegstufe) ?? 0) / anzahl,
  })).sort((a, b) => b.quote - a.quote);

  // Hysterese: eine gesperrte Stufe faellt erst unter der niedrigeren Schwelle
  // zurueck, damit sie nicht bei jedem Lauf zwischen offen und gesperrt springt.
  const gesperrte_belegstufen = je_belegstufe.filter((s) => {
    if (s.freigaben < STUFE_MINDESTMENGE) return false;
    return gesperrtBisher.includes(s.belegstufe)
      ? s.quote >= STUFE_ENTSPERREN_UNTER
      : s.quote > STUFE_SPERREN_AB;
  }).map((s) => s.belegstufe);

  const stillzulegende_regeln = je_regel
    .filter((r) => r.freigaben >= REGEL_MINDESTMENGE && r.quote > REGEL_QUOTE)
    .map((r) => r.regel_id);

  return { je_regel, je_belegstufe, gate_gruende: z.gate_gruende, gesperrte_belegstufen, stillzulegende_regeln };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/lernen.test.mjs`
Expected: PASS, alle acht.

- [ ] **Step 5: Commit**

```bash
git add app/tools/lernen.mjs tests/lernen.test.mjs
git commit -m "feat: lernen.mjs wertet das Agent-Log zu Qualitaetsmetriken aus"
```

---

### Task 13: Stilllegung anwenden und Sperre ins Gate zurueckspeisen

**Files:**
- Modify: `app/tools/lernen.mjs` (CLI mit `--anwenden`)
- Modify: `app/tools/freigabe.mjs` (CLI liest gesperrte Stufen)
- Modify: `package.json`
- Create: `docs/adr/0026-lernschleife-aus-dem-agent-log.md`

**Interfaces:**
- Consumes: `metriken()` aus Task 12, `gesperrteBelegstufen` aus Task 8
- Produces: der geschlossene Kreis — schlechte Regeln legen sich selbst still, schwache Belegstufen verlieren ihre Auto-Freigabe.

- [ ] **Step 1: CLI fuer `lernen.mjs`**

Der Code unten ruft `gesperrteBelegstufenAus()`. Diese Funktion entsteht in
Step 2 in derselben Datei — erst nach Step 2 ist die Datei lauffaehig.

```javascript
const USAGE = `Aufruf: node app/tools/lernen.mjs [datenroot] [--anwenden]

Wertet agent_log.jsonl aus. Ohne --anwenden nur Bericht. Mit --anwenden werden
Regeln ueber der Korrekturquote auf inaktiv gesetzt; danach muss
recategorize.mjs laufen. Das Tool aendert ausschliesslich den Status von
Regeln — nie eine Transaktion.`;

function renderMetriken(m) {
  const z = [];
  z.push("KORREKTURQUOTE JE REGEL (absteigend)");
  for (const r of m.je_regel.slice(0, 15)) z.push(`  ${r.regel_id}  ${(r.quote * 100).toFixed(0)}%  (${r.korrekturen}/${r.freigaben})`);
  z.push("", "KORREKTURQUOTE JE BELEGSTUFE");
  for (const s of m.je_belegstufe) z.push(`  ${s.belegstufe}  ${(s.quote * 100).toFixed(0)}%  (${s.korrekturen}/${s.freigaben})`);
  z.push("", "GATE-DURCHFALL NACH GRUND");
  for (const [grund, anzahl] of Object.entries(m.gate_gruende)) z.push(`  ${grund}: ${anzahl}`);
  z.push("", `GESPERRTE BELEGSTUFEN: ${m.gesperrte_belegstufen.join(", ") || "keine"}`);
  z.push(`STILLZULEGENDE REGELN: ${m.stillzulegende_regeln.join(", ") || "keine"}`);
  return z.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) { console.log(USAGE); return; }
  const anwenden = args.includes("--anwenden");
  const masterRoot = dataRootFromArg(args.find((a) => !a.startsWith("--")));

  const logText = await readFile(new URL("agent_log.jsonl", masterRoot), "utf8").catch(() => "");
  const log = logText.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  const regeln = JSON.parse(await readFile(new URL("kategorisierungsregeln.json", masterRoot), "utf8"));

  const m = metriken(log, gesperrteBelegstufenAus(log));
  console.log(renderMetriken(m));

  if (!anwenden) { console.log("\nVorschau — nichts geschrieben. Mit --anwenden Regeln stilllegen."); return; }
  if (m.stillzulegende_regeln.length === 0) { console.log("\nNichts stillzulegen."); return; }

  const next = regeln.map((r) => m.stillzulegende_regeln.includes(r.regel_id) ? { ...r, status: "inaktiv" } : r);
  await writeFile(new URL("kategorisierungsregeln.json", masterRoot), JSON.stringify(next, null, 2) + "\n");
  console.log(`\n${m.stillzulegende_regeln.length} Regel(n) auf inaktiv gesetzt. Jetzt recategorize.mjs laufen lassen.`);
}
```

- [ ] **Step 2: Sperrzustand zustandslos ableiten**

Der Sperrzustand wird nicht gespeichert, sondern aus dem Log neu gerechnet —
dieselbe Begruendung, mit der ADR 0018 den persistierten Hit-Count verworfen
hat. Damit die Hysterese greift, braucht `metriken()` den vorigen Zustand;
er kommt aus dem Log selbst:

```javascript
// Der zuletzt protokollierte Sperrzustand. Wird nicht als eigener Zustand
// gefuehrt, sondern aus dem juengsten Freigabe-Eintrag gelesen.
export function gesperrteBelegstufenAus(log) {
  const letzte = [...log].filter((e) => e.anlass === "freigabe" && e.gesperrte_belegstufen).pop();
  return letzte?.gesperrte_belegstufen ?? [];
}
```

- [ ] **Step 3: `freigabe.mjs` konsumiert die Sperre**

Im CLI-Teil von `freigabe.mjs` das Log mitlesen und die Sperre uebergeben:

```javascript
import { metriken, gesperrteBelegstufenAus } from "./lernen.mjs";

  const logText = await readFile(new URL("agent_log.jsonl", masterRoot), "utf8").catch(() => "");
  const log = logText.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  const gesperrteBelegstufen = metriken(log, gesperrteBelegstufenAus(log)).gesperrte_belegstufen;

  const out = freigabe({ transaktionen, regeln, gesperrteBelegstufen });
```

Und im Protokoll-Eintrag den Zustand festhalten, damit die Hysterese ihn beim naechsten Mal findet:

```javascript
    gesperrte_belegstufen: gesperrteBelegstufen,
```

- [ ] **Step 4: npm-Scripts**

```json
    "lernen": "node app/tools/lernen.mjs app/data/master",
    "lernen:anwenden": "node app/tools/lernen.mjs app/data/master --anwenden",
```

- [ ] **Step 5: Pruefbericht zeigt die Lernmetriken**

Der Pruefbericht ist der Ort, an dem der Nutzer hinsieht — also gehoeren die
Metriken dorthin, nicht in einen zweiten Bericht.

In `app/tools/pruefbericht.mjs` importieren und das Ergebnis durchreichen:

```javascript
import { metriken, gesperrteBelegstufenAus } from "./lernen.mjs";
```

In `pruefbericht({...})` dem Rueckgabeobjekt hinzufuegen:

```javascript
    lernen: metriken(log ?? [], gesperrteBelegstufenAus(log ?? [])),
```

Und im Rendering, vor dem `return`:

```javascript
  z.push("", `REGELN MIT HOHER KORREKTURQUOTE (${b.lernen.je_regel.filter((r) => r.quote > 0).length})`);
  for (const r of b.lernen.je_regel.filter((r) => r.quote > 0).slice(0, 10)) {
    z.push(`  ${r.regel_id}  ${(r.quote * 100).toFixed(0)}%  (${r.korrekturen}/${r.freigaben})`);
  }
  z.push("", `GESPERRTE BELEGSTUFEN: ${b.lernen.gesperrte_belegstufen.join(", ") || "keine"}`);
```

Den bestehenden Test `leerer Bestand liefert leere Listen statt Fehler` um
eine Zeile erweitern, damit die leere Log-Auswertung abgesichert bleibt:

```javascript
  assert.deepEqual(out.lernen.je_regel, []);
```

- [ ] **Step 6: ADR 0026 schreiben**

```markdown
# Lernschleife aus dem Agent-Log

Jeder Durchlauf misst sein eigenes Ergebnis gegen die Korrekturen des Nutzers
und zieht Konsequenzen. Zahlen wirken automatisch; Anweisungstext nur nach
Zustimmung.

## Begruendung

`agent_log.jsonl` fuehrte 106 Eintraege mit Qualitaetsdaten und wurde von
keinem Lauf je gelesen. Die Luecke war nicht ein fehlender Speicher, sondern
ein fehlender Rueckkanal — deshalb entsteht hier kein neuer Log, sondern der
vorhandene wird auswertbar.

Korrekturen lassen sich **nicht** nachtraeglich rekonstruieren: `app/data/**`
ist gitignored, es gibt keine History der Transaktionsdatei. Sie werden im
Moment der Korrektur von `confirm.mjs` erfasst, das `matched_regeln` und
`bestaetigt_durch` der ueberschriebenen Buchung ohnehin zur Hand hat.

## Die Trennlinie

**Zahlen sind Daten und wirken automatisch.** Eine Regel mit einer
Korrekturquote ueber 30 % bei mindestens 10 Freigaben legt sich selbst still;
eine Belegstufe ueber 25 % bei mindestens 20 Freigaben verliert die
Auto-Freigabe. Beides ist reversibel, steht im Pruefbericht und aendert nur
einen Datenwert.

**Anweisungstext braucht Zustimmung.** Erkenntnisse ueber Normalisierung sind
Anweisungen an kuenftige Laeufe. Sie werden automatisch als Diff-Vorschlag
formuliert, aber nie selbst uebernommen — ein still veraenderter
Anweisungstext waere der einzige Teil des Systems, dessen Fehler der Nutzer
nicht mehr bemerken kann. Eine falsche Kategorie betrifft eine Buchung, eine
falsche Selbstanweisung jeden kuenftigen Lauf.

## Kein gespeicherter Sperrzustand

Ob eine Belegstufe gesperrt ist, wird bei jedem Lauf neu gerechnet. Der
vorige Zustand kommt aus dem juengsten Freigabe-Eintrag und dient nur der
Hysterese: eine gesperrte Stufe faellt erst unter 15 % zurueck, damit sie nicht
bei jedem Lauf zwischen offen und gesperrt springt. Dieselbe Begruendung, mit
der ADR 0018 den persistierten Hit-Count verworfen hat.

## Zu den Schwellenwerten

30/25/15 sind Startwerte. Anders als eine risikobasierte Freigabeschwelle
messen sie kein Urteil darueber, was eine Buchung bedeutet, sondern
beobachtetes Verhalten gegen eine Grundwahrheit. Und sie steuern eine
reversible, sichtbare Aktion. Sobald genug Laeufe vorliegen, sind sie selbst
Gegenstand der Messung.

## Verworfene Alternativen

- **Freitext-Lessons, die der Agent sich selbst schreibt.** Unbegrenztes
  Wachstum, und ein falsch gezogener Schluss verfestigt sich, weil er in
  jedem Folgelauf wieder gelesen wird.
- **Persistierter Zaehler an der Regel.** Muesste bei jedem Eingriff
  aktuell gehalten werden; Aggregation bei Lesezugriff ist deterministisch
  und aktuell (ADR 0018).
- **Maschinenlesbare Importprofile.** Bereits gescheitert: Datumsformate wie
  `DD.MM.YY` und richtungsabhaengige Gegenparteien sind im Profilformat nicht
  abbildbar, und ADR 0005 verbietet bankspezifische Parser ohnehin.
```

- [ ] **Step 7: Run tests**

Run: `npm test && npm run validate:master`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/tools/lernen.mjs app/tools/freigabe.mjs app/tools/pruefbericht.mjs tests/pruefbericht.test.mjs package.json docs/adr/0026-lernschleife-aus-dem-agent-log.md
git commit -m "feat: Lernschleife legt schlechte Regeln still und sperrt schwache Belegstufen"
```

---

## Abschluss

- [ ] **Vollstaendiger Lauf gegen den echten Bestand**

```bash
npm test && npm run validate:master && npm run freigabe
```

Erwartung vor dem Schreiben: 65 Agentenvorschlaege werden freigegeben, die 343
regelbasierten laufen durchs Gate. Regeln ohne `belegstufe` — also alle 295
Bestandsregeln — halten ihre Buchungen zurueck, bis die Stufe nachgetragen ist.
Das ist gewollt: der Gate-Durchfallbericht ist die Arbeitsliste dafuer.

# Vorsorge-Tabelle, Detail-Rail und gebuchte Beiträge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Vorsorgeansicht erhält sichtbare IDs, kombinierbare Filter, vollständige Sortierung und eine adressierbare Detail-Rail; tatsächliche Beitragsbuchungen werden explizit über ihre Regelzahlung verknüpft und in beiden Rails navigierbar angezeigt.

**Architecture:** `Transaktion.regelzahlung_id` ist die einzige neue persistierte Beziehung. Der Vorsorgebezug wird im Browser über `Transaktion → Regelzahlung → Vorsorge` abgeleitet. `app/views/vorsorge.mjs` kapselt Filterung, Sortierung und Rail-Rendering auf dem vorhandenen Runtime-Zustand; `main.js` orchestriert nur DOM-Ereignisse und Navigation, `routing.mjs` bleibt die reine Zustand-zu-Hash-Grenze.

**Tech Stack:** Vanilla JavaScript/ES-Module, HTML-String-Rendering, `node:test`, JSON Schema, bestehendes Hash-Routing, keine neuen Abhängigkeiten.

## Global Constraints

- Die App bleibt vollständig schreibgeschützt; Datenpflege erfolgt über Agenten und Betriebstools.
- Keine direkte `vorsorge_id` an Transaktionen; der Bezug wird ausschließlich über `regelzahlung_id` abgeleitet.
- Eine Transaktion erfüllt höchstens eine Regelzahlung; eine Regelzahlung kann viele Transaktionen haben.
- Keine heuristische Zuordnung über Betrag, Gegenpartei, Mandatsreferenz oder Rhythmus.
- Keine zusätzliche Vorsorgespalte und kein zusätzlicher Vorsorgefilter in der Transaktionstabelle.
- Freitext in der Vorsorgeansicht durchsucht auch Bemerkung und Quellenhinweis.
- Standardsortierung der Vorsorgetabelle ist ID aufsteigend; fehlende Werte stehen in beiden Richtungen am Ende.
- `#/vorsorge/<vorsorge_id>` adressiert eine geöffnete Vorsorge-Rail.
- Geld bleibt auf Platte Decimal-String mit zwei Nachkommastellen und intern Cent-Integer.
- Alle neuen Texte werden auf Deutsch und Englisch ergänzt.
- Test-Driven Development: jeder Produktionsschritt beginnt mit einem beobachteten, fachlich richtigen Fehlschlag.

---

### Task 1: Explizite Transaktion-zu-Regelzahlung-Beziehung

**Files:**
- Modify: `app/schemas/transaktionen.schema.json`
- Modify: `app/schemas/importformat.schema.json`
- Modify: `app/tools/validate-core.mjs`
- Modify: `app/tools/import-format.mjs`
- Modify: `app/tools/import.mjs`
- Modify: `app/tools/inbox.mjs`
- Modify: `app/docs/agent-context.md`
- Modify: `app/docs/skills/import-agent.md`
- Modify: `app/docs/skills/vorsorge-erfassung-agent.md`
- Test: `tests/m7-vorsorge.test.mjs`
- Test: `tests/m3-import-format.test.mjs`
- Test: `tests/m3-import.test.mjs`

**Interfaces:**
- Consumes: vorhandene `Regelzahlung.regelzahlung_id` und `Regelzahlung.vorsorge_id`.
- Produces: optionales `Transaktion.regelzahlung_id: string`; `validateImportEntry(entry, kontenIds, regelzahlungIds = new Set())`; `runImport({ entries, konten, kategorien, kategorisierungsregeln, transaktionen, transfers, regelzahlungen = [] })`.

- [ ] **Step 1: Failing Masterdaten-Tests schreiben**

Ergänze in `tests/m7-vorsorge.test.mjs` eine vollständige offene Transaktion und zwei Beziehungstests:

```js
const TXN_BEITRAG = "TXN-11111111-1111-4111-8111-111111111111";

function beitragsTransaktion(extra = {}) {
  return {
    transaktion_id: TXN_BEITRAG,
    dedupe_hash: "hash-vorsorge-beitrag",
    rohquelle: "Belege/2026/Versicherungen/beitrag.csv",
    konto_id: "KTO-001",
    buchungsdatum: "2026-06-15",
    betrag: "-162.00",
    gegenpartei: "MusterversicherungA",
    verwendungszweck: "Riester Beitrag",
    kategorisierung_status: "offen",
    ist_transfer: false,
    ...extra,
  };
}

test("Transaktion darf eine existierende Regelzahlung erfüllen", () => {
  const result = validateMasterData(basis({
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    regelzahlungen: [{ regelzahlung_id: "RZ-001", bezeichnung: "Riester", betrag: "-162.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt", erstellt_am: "2026-01-01", qualitaet: "belegt" }],
    transaktionen: [beitragsTransaktion({ regelzahlung_id: "RZ-001" })],
  }));
  assert.deepEqual(result.errors, []);
});

test("Transaktion darf keine unbekannte Regelzahlung referenzieren", () => {
  const result = validateMasterData(basis({
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    regelzahlungen: [],
    transaktionen: [beitragsTransaktion({ regelzahlung_id: "RZ-999" })],
  }));
  assert.match(result.errors.join("\n"), /regelzahlung_id.*RZ-999.*existiert nicht/);
});
```

- [ ] **Step 2: Failing Importformat- und Pipeline-Tests schreiben**

Ergänze in `tests/m3-import-format.test.mjs`:

```js
import { readFileSync } from "node:fs";

const regelzahlungIds = new Set(["RZ-001"]);

test("Importformat akzeptiert eine existierende regelzahlung_id", () => {
  assert.deepEqual(validateImportEntry({ ...valid, regelzahlung_id: "RZ-001" }, kontenIds, regelzahlungIds), []);
});

test("Importformat lehnt eine unbekannte regelzahlung_id ab", () => {
  assert.match(
    validateImportEntry({ ...valid, regelzahlung_id: "RZ-999" }, kontenIds, regelzahlungIds).join("\n"),
    /regelzahlung_id.*unbekannt/,
  );
});

test("JSON-Datenverträge erlauben die Regelzahlungsreferenz", () => {
  for (const name of ["importformat", "transaktionen"]) {
    const schema = JSON.parse(readFileSync(new URL(`../app/schemas/${name}.schema.json`, import.meta.url), "utf8"));
    const properties = schema.items?.properties ?? schema.properties;
    assert.equal(properties.regelzahlung_id.pattern, "^RZ-\\d{3}$", name);
  }
});
```

Ergänze in `tests/m3-import.test.mjs`:

```js
test("Import übernimmt die explizite Regelzahlungszuordnung", () => {
  const out = runImport({
    entries: [entry("KTO-001", "2026-05-20", "-162.00", "MusterversicherungA", "Riester", { regelzahlung_id: "RZ-001" })],
    konten,
    kategorien,
    kategorisierungsregeln: regeln,
    transaktionen: [],
    transfers: [],
    regelzahlungen: [{ regelzahlung_id: "RZ-001" }],
  });

  assert.equal(out.result.errors.length, 0);
  assert.equal(out.transaktionen[0].regelzahlung_id, "RZ-001");
});
```

- [ ] **Step 3: Fokussierte Tests rot ausführen**

Run:

```bash
node --test tests/m7-vorsorge.test.mjs tests/m3-import-format.test.mjs tests/m3-import.test.mjs
```

Expected: FAIL. Der valide Masterfall meldet `regelzahlung_id` als unbekanntes Feld; das Importformat erkennt die unbekannte ID noch nicht; die Pipeline verwirft das neue Feld.

- [ ] **Step 4: JSON-Schemas und Core-Validator minimal erweitern**

Ergänze in beiden JSON-Schemas unter `properties`:

```json
"regelzahlung_id": { "type": "string", "pattern": "^RZ-\\d{3}$" }
```

Ergänze in `validate-core.mjs` im `transaktionen.fields`-Objekt:

```js
regelzahlung_id: { type: "string", pattern: /^RZ-\d{3}$/ },
```

Lege in `validateCrossFieldRules` vor der Transaktionsschleife die Map an und prüfe den Rückverweis in derselben Schleife:

```js
const regelzahlungen = byId(data.regelzahlungen, "regelzahlung_id");

if (transaktion.regelzahlung_id && !regelzahlungen.has(transaktion.regelzahlung_id)) {
  errors.push(`transaktionen.${transaktion.transaktion_id}.regelzahlung_id: ${transaktion.regelzahlung_id} existiert nicht`);
}
```

- [ ] **Step 5: Importgrenze und Pipeline minimal erweitern**

Ändere die Signaturen und die optionale Feldübernahme:

```js
// app/tools/import-format.mjs
const regelzahlungPattern = /^RZ-\d{3}$/;

export function validateImportEntry(entry, kontenIds, regelzahlungIds = new Set()) {
  if (Object.hasOwn(entry, "regelzahlung_id")) {
    if (typeof entry.regelzahlung_id !== "string" || !regelzahlungPattern.test(entry.regelzahlung_id)) {
      errors.push("regelzahlung_id: Format ungueltig");
    } else if (!regelzahlungIds.has(entry.regelzahlung_id)) {
      errors.push(`regelzahlung_id: ${entry.regelzahlung_id} unbekannt`);
    }
  }
  return errors;
}
```

Der neue Block steht unmittelbar vor dem bestehenden `return errors`; alle vorhandenen Prüfungen bleiben unverändert davor stehen.

```js
// app/tools/import.mjs
const optionalTransactionFields = [
  "wertstellungsdatum",
  "transaktionstyp",
  "kundenreferenz",
  "empfaenger",
  "empfaenger_iban",
  "mandatsreferenz",
  "glaeubiger_id",
  "regelzahlung_id",
];

export function runImport({ entries, konten, kategorien, kategorisierungsregeln, transaktionen, transfers, regelzahlungen = [] }) {
  const regelzahlungIds = new Set(regelzahlungen.map((rz) => rz.regelzahlung_id));
}
```

Ersetze innerhalb der vorhandenen `entries.forEach`-Schleife den Aufruf durch:

```js
const formatErrors = validateImportEntry(entry, kontenIds, regelzahlungIds);
```

Lade in `import.mjs` und `inbox.mjs` `regelzahlungen.json` gemeinsam mit den anderen Masterdaten und übergib `regelzahlungen` an `runImport`. Die CLI-Ladung in `import.mjs` wird damit:

```js
const [konten, kategorien, transaktionen, transfers, kategorisierungsregeln, regelzahlungen] = await Promise.all([
  readJson(new URL("konten.json", masterRoot)),
  readJson(new URL("kategorien.json", masterRoot)),
  readJsonl(new URL("transaktionen.jsonl", masterRoot)),
  readJson(new URL("transfers.json", masterRoot)),
  readJson(new URL("kategorisierungsregeln.json", masterRoot)),
  readJson(new URL("regelzahlungen.json", masterRoot)),
]);
```

- [ ] **Step 6: Fokussierte Tests grün ausführen**

Run:

```bash
node --test tests/m7-vorsorge.test.mjs tests/m3-import-format.test.mjs tests/m3-import.test.mjs tests/inbox-plan.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Agentenanweisungen präzisieren**

Ergänze in `app/docs/agent-context.md` unter Transaktionsdaten:

```markdown
Eine tatsächliche Buchung kann optional `regelzahlung_id` tragen. Das bedeutet:
Diese Buchung erfüllt genau diese erwartete Regelzahlung. Die Zuordnung wird nur
nach Beleg- oder Nutzerklärung gesetzt; bei Unsicherheit bleibt das Feld weg.
Ein Vorsorgebezug wird über `Transaktion → Regelzahlung → Vorsorge` abgeleitet.
```

Ergänze in `app/docs/skills/import-agent.md` nach dem Kategorisierungsschritt:

```markdown
Ist aus Beleg oder Nutzerentscheidung eindeutig, welche Regelzahlung die Buchung
erfüllt, `regelzahlung_id` im standardisierten Eintrag setzen. Nie allein aus
Betragsgleichheit oder ähnlicher Gegenpartei zuordnen.
```

Ergänze in `app/docs/skills/vorsorge-erfassung-agent.md` nach „Beiträge verknüpfen“:

```markdown
Bereits eindeutig geklärte Beitragsbuchungen tragen die `regelzahlung_id` der
zugehörigen Beitrags-Regelzahlung. Keine `vorsorge_id` an Transaktionen ergänzen.
```

- [ ] **Step 8: Task-Commit erstellen**

```bash
git add app/schemas/transaktionen.schema.json app/schemas/importformat.schema.json app/tools/validate-core.mjs app/tools/import-format.mjs app/tools/import.mjs app/tools/inbox.mjs app/docs/agent-context.md app/docs/skills/import-agent.md app/docs/skills/vorsorge-erfassung-agent.md tests/m7-vorsorge.test.mjs tests/m3-import-format.test.mjs tests/m3-import.test.mjs
git commit -m "feat: Transaktionen mit Regelzahlungen verknüpfen"
```

---

### Task 2: Sichtbare IDs, Vorsorgefilter und vollständige Sortierung

**Files:**
- Modify: `app/runtime.mjs`
- Modify: `app/views/vorsorge.mjs`
- Modify: `app/main.js`
- Modify: `app/i18n.js`
- Test: `tests/m7-vorsorge-view.test.mjs`

**Interfaces:**
- Consumes: `renderTableFilters`, `matchesQuery`, bestehende Vorsorge-, Personen- und Zeitwertdaten.
- Produces: `vorsorgeRows(): Vorsorge[]`, `setVorsorgeFilter(name, value): void`, `resetVorsorgeFilters(): void`, `toggleVorsorgeSort(key): void`; Markup-Attribute `data-vorsorge-filter` und `data-vorsorge-sort`.

- [ ] **Step 1: Failing Filter- und ID-Tests schreiben**

Erweitere die Runtime-Destrukturierung um `personenById` und die View-Destrukturierung auf:

```js
const { data, state, personenById } = runtime;
const { renderVorsorge, vorsorgeRows, setVorsorgeFilter, resetVorsorgeFilters, toggleVorsorgeSort } = vorsorgeView;
```

Ergänze eine Fixture-Sicherung und teste die unsichtbaren Suchfelder sowie die kombinierten Filter:

```js
test("Vorsorge zeigt IDs und durchsucht Bemerkung sowie Quelle", () => {
  data.vorsorge = [
    { vorsorge_id: "VS-001", art: "riester", name: "Riester", person_id: "PER-001", status: "aktiv", kapitalbildend: true, geprueft_am: "2026-01-01", bemerkung: "Altvertrag mit Dynamik" },
    { vorsorge_id: "VS-002", art: "betriebsrente", name: "BAV", person_id: "PER-002", status: "geplant", kapitalbildend: false, quelle_hinweis: "Standmitteilung Personalabteilung" },
  ];
  data.personen = [{ person_id: "PER-001", name: "Lena" }, { person_id: "PER-002", name: "Martin" }];
  personenById.set("PER-001", data.personen[0]);
  personenById.set("PER-002", data.personen[1]);
  state.vorsorgeFilters = { search: "Dynamik", art: "", person: "", status: "", pruefstatus: "" };

  assert.deepEqual(vorsorgeRows().map((vs) => vs.vorsorge_id), ["VS-001"]);
  const html = renderVorsorge();
  assert.match(html, /<th[^>]*>.*ID/s);
  assert.match(html, /<td>VS-001<\/td>/);

  state.vorsorgeFilters.search = "Personalabteilung";
  assert.deepEqual(vorsorgeRows().map((vs) => vs.vorsorge_id), ["VS-002"]);
});

test("Vorsorgefilter werden gemeinsam angewendet", () => {
  state.vorsorgeFilters = { search: "", art: "riester", person: "PER-001", status: "aktiv", pruefstatus: "geprueft" };
  assert.deepEqual(vorsorgeRows().map((vs) => vs.vorsorge_id), ["VS-001"]);
});

test("Vorsorge-Zustandshelfer setzen, sortieren und leeren deterministisch", () => {
  resetVorsorgeFilters();
  setVorsorgeFilter("art", "riester");
  assert.equal(state.vorsorgeFilters.art, "riester");
  toggleVorsorgeSort("name");
  assert.deepEqual(state.vorsorgeSort, { key: "name", dir: "asc" });
  toggleVorsorgeSort("name");
  assert.deepEqual(state.vorsorgeSort, { key: "name", dir: "desc" });
  resetVorsorgeFilters();
  assert.deepEqual(state.vorsorgeFilters, { search: "", art: "", person: "", status: "", pruefstatus: "" });
});
```

Sichere und restauriere in `try/finally` exakt die in diesen Tests veränderten Werte: `data.vorsorge`, `data.personen`, `data.zeitwerte`, `data.regelzahlungen`, `data.transaktionen`, `state.vorsorgeFilters`, `state.vorsorgeSort`, `state.selectedVorsorgeId` sowie die vorherigen Map-Einträge von `personenById` für `PER-001` und `PER-002`. Dadurch beeinflusst die globale Runtime-Fixture keine anderen Tests.

- [ ] **Step 2: Failing Sortiertest mit handabgeleiteten Erwartungen schreiben**

Nutze drei Datensätze mit eindeutigen Anzeigewerten und prüfe jeden Schlüssel in beide Richtungen:

```js
test("Vorsorge sortiert jede Tabellenspalte stabil", () => {
  const erwartungen = {
    id: { asc: ["VS-001", "VS-002", "VS-003"], desc: ["VS-003", "VS-002", "VS-001"] },
    name: { asc: ["VS-002", "VS-003", "VS-001"], desc: ["VS-001", "VS-003", "VS-002"] },
    art: { asc: ["VS-002", "VS-001", "VS-003"], desc: ["VS-003", "VS-001", "VS-002"] },
    person: { asc: ["VS-002", "VS-003", "VS-001"], desc: ["VS-001", "VS-002", "VS-003"] },
    status: { asc: ["VS-001", "VS-002", "VS-003"], desc: ["VS-003", "VS-002", "VS-001"] },
    wert: { asc: ["VS-001", "VS-002", "VS-003"], desc: ["VS-002", "VS-001", "VS-003"] },
  };

  for (const [key, expected] of Object.entries(erwartungen)) {
    state.vorsorgeSort = { key, dir: "asc" };
    assert.deepEqual(vorsorgeRows().map((vs) => vs.vorsorge_id), expected.asc, `${key} asc`);
    state.vorsorgeSort = { key, dir: "desc" };
    assert.deepEqual(vorsorgeRows().map((vs) => vs.vorsorge_id), expected.desc, `${key} desc`);
  }
});
```

Die Fixture ist exakt so belegt:

```js
data.vorsorge = [
  { vorsorge_id: "VS-001", name: "Zeta", art: "riester", person_id: "PER-002", status: "aktiv", kapitalbildend: true },
  { vorsorge_id: "VS-002", name: "Alpha", art: "betriebsrente", person_id: "PER-001", status: "beendet", kapitalbildend: false },
  { vorsorge_id: "VS-003", name: "Mitte", art: "schutzversicherung", person_id: "PER-001", status: "ruhend", kapitalbildend: false },
];
data.personen = [{ person_id: "PER-001", name: "Anna" }, { person_id: "PER-002", name: "Zoe" }];
personenById.set("PER-001", data.personen[0]);
personenById.set("PER-002", data.personen[1]);
data.zeitwerte = [
  { entitaet: "vorsorge", entitaet_id: "VS-001", feld: "rueckkaufswert", wert: "100.00", standdatum: "2026-01-01", qualitaet: "belegt" },
  { entitaet: "vorsorge", entitaet_id: "VS-002", feld: "erwartete_rente", wert: "200.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" },
];
```

Damit ist die erwartete Personenreihenfolge `["VS-002", "VS-003", "VS-001"]`; der aufsteigende ID-Tiebreaker ist an den beiden `Anna`-Einträgen beobachtbar.

- [ ] **Step 3: Tests rot ausführen**

Run:

```bash
node --test tests/m7-vorsorge-view.test.mjs
```

Expected: FAIL mit fehlendem Export `vorsorgeRows` beziehungsweise fehlender ID-/Filterdarstellung.

- [ ] **Step 4: Runtime-Zustand und View-Ableitungen implementieren**

Ergänze `state` in `runtime.mjs`:

```js
vorsorgeFilters: { search: "", art: "", person: "", status: "", pruefstatus: "" },
vorsorgeSort: { key: "id", dir: "asc" },
selectedVorsorgeId: "",
```

Importiere in `vorsorge.mjs` zusätzlich `state`, `renderTableFilters` und `matchesQuery`. Implementiere die Zustandshelfer:

```js
export function setVorsorgeFilter(name, value) {
  if (Object.hasOwn(state.vorsorgeFilters, name)) state.vorsorgeFilters[name] = value;
}

export function resetVorsorgeFilters() {
  state.vorsorgeFilters = { search: "", art: "", person: "", status: "", pruefstatus: "" };
}

export function toggleVorsorgeSort(key) {
  state.vorsorgeSort = state.vorsorgeSort.key === key
    ? { key, dir: state.vorsorgeSort.dir === "asc" ? "desc" : "asc" }
    : { key, dir: "asc" };
}
```

Implementiere `vorsorgeRows()` mit diesem Filterkern:

```js
export function vorsorgeRows() {
  const f = state.vorsorgeFilters;
  const rows = (data.vorsorge ?? []).filter((vs) => {
    if (f.art && vs.art !== f.art) return false;
    if (f.person && vs.person_id !== f.person) return false;
    if (f.status && vs.status !== f.status) return false;
    if (f.pruefstatus === "geprueft" && !vs.geprueft_am) return false;
    if (f.pruefstatus === "ungeprueft" && vs.geprueft_am) return false;
    return matchesQuery([
      vs.vorsorge_id,
      vs.name,
      vs.art,
      vorsorgeArtLabel(vs.art),
      personName(vs.person_id),
      vs.status,
      statusLabel(vs.status),
      vs.bemerkung,
      vs.quelle_hinweis,
    ], f.search);
  });
  return sortVorsorge(rows);
}
```

Nutze dieselbe Wertableitung für Tabellenanzeige und Sortierung:

```js
function vorsorgeWert(vs) {
  if (vs.kapitalbildend) {
    return aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, "rueckkaufswert");
  }
  return aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, "erwartete_rente")
    || aktuellerZeitwert(data.zeitwerte, "vorsorge", vs.vorsorge_id, "erwartete_kapitalleistung");
}

function vorsorgeArtLabel(art) {
  const key = `vorsorge.art.${art}`;
  const label = t(key);
  return label === key ? art : label;
}
```

Der vollständige Comparator behandelt fehlende Werte vor Anwendung der Richtung und nutzt die ID immer aufsteigend als Tiebreaker:

```js
function sortVorsorge(rows) {
  const { key, dir } = state.vorsorgeSort;
  const factor = dir === "asc" ? 1 : -1;
  const locale = state.lang === "de" ? "de" : "en";
  return rows.slice().sort((a, b) => {
    if (key === "wert") {
      const aw = vorsorgeWert(a);
      const bw = vorsorgeWert(b);
      if (!aw && !bw) return a.vorsorge_id.localeCompare(b.vorsorge_id);
      if (!aw) return 1;
      if (!bw) return -1;
      const cmp = cents(aw.wert) - cents(bw.wert);
      return cmp === 0 ? a.vorsorge_id.localeCompare(b.vorsorge_id) : cmp * factor;
    }
    const value = (vs) => {
      if (key === "name") return vs.name;
      if (key === "art") return vorsorgeArtLabel(vs.art);
      if (key === "person") return personName(vs.person_id);
      if (key === "status") return statusLabel(vs.status);
      return vs.vorsorge_id;
    };
    const cmp = String(value(a) ?? "").localeCompare(String(value(b) ?? ""), locale);
    return cmp === 0 ? a.vorsorge_id.localeCompare(b.vorsorge_id) : cmp * factor;
  });
}
```

Definiere die Filteroptionen ohne versteckte Wertebereiche:

```js
const VORSORGE_ARTEN = ["lebensversicherung", "rentenversicherung", "gesetzliche-rente", "betriebsrente", "riester", "ruerup", "schutzversicherung", "sonstig"];
const VORSORGE_STATUS = ["aktiv", "gekuendigt", "ruhend", "geplant", "laufend", "beendet"];

function vorsorgeArtOptions() {
  return [["", t("vorsorge.allArten")], ...VORSORGE_ARTEN.map((art) => [art, vorsorgeArtLabel(art)])];
}

function vorsorgePersonOptions() {
  return [["", t("vorsorge.allPersonen")], ...(data.personen ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, state.lang === "de" ? "de" : "en"))
    .map((person) => [person.person_id, person.name])];
}

function vorsorgeStatusOptions() {
  return [["", t("vorsorge.allStatus")], ...VORSORGE_STATUS.map((status) => [status, statusLabel(status)])];
}
```

- [ ] **Step 5: Filterleiste, ID-Spalte und Sortierköpfe rendern**

Verwende die vorhandene Komponente:

```js
function renderVorsorgeFilters(resultCount) {
  return renderTableFilters({
    searchFields: [{ name: "search", label: t("vorsorge.filterSearch"), type: "search", placeholder: t("vorsorge.searchPlaceholder") }],
    fields: [
      { name: "art", label: t("vorsorge.filterArt"), options: vorsorgeArtOptions() },
      { name: "person", label: t("vorsorge.filterPerson"), options: vorsorgePersonOptions() },
      { name: "status", label: t("vorsorge.filterStatus"), options: vorsorgeStatusOptions() },
      { name: "pruefstatus", label: t("vorsorge.filterPruefstatus"), options: [["", t("vorsorge.allPruefstatus")], ["geprueft", t("vorsorge.geprueft")], ["ungeprueft", t("vorsorge.ungeprueft")]] },
    ],
    filters: state.vorsorgeFilters,
    filterAttr: "vorsorge-filter",
    clearAction: "clear-vorsorge-filter",
    resetAction: "reset-vorsorge-filters",
    resultCount,
    totalCount: (data.vorsorge ?? []).length,
  });
}
```

Kapsle das vorhandene Hinweis-Markup und die neue Tabelle in klar benannten HTML-Helfern:

```js
function renderVorsorgeHinweis() {
  return `
    <section class="panel panel-pad section-spacing vorsorge-hint">
      <span class="chip ungeprueft">${escapeHtml(t("vorsorge.ungeprueft"))}</span>
      <p>${escapeHtml(t("vorsorge.ungeprueftHinweis"))}</p>
    </section>`;
}

function vorsorgeSortHeader(key, label, amount = false) {
  const indicator = state.vorsorgeSort.key === key ? (state.vorsorgeSort.dir === "asc" ? " ▲" : " ▼") : "";
  return `<th${amount ? ' class="amount"' : ""}><button class="linkish sort-th" data-vorsorge-sort="${escapeHtml(key)}">${escapeHtml(label)}${escapeHtml(indicator)}</button></th>`;
}

function renderVorsorgeRow(vs) {
  return `
    <tr>
      <td>${escapeHtml(vs.vorsorge_id)}</td>
      <td><strong>${escapeHtml(vs.name)}</strong>${beitraegeHtml(vs.vorsorge_id)}${nachfolgerHtml(vs)}</td>
      <td>${escapeHtml(vorsorgeArtLabel(vs.art))}</td>
      <td>${escapeHtml(personName(vs.person_id))}</td>
      <td class="amount">${wertHtml(vs)}</td>
      <td><div class="vorsorge-status">${statusChip(vs)}${vorsorgeBadges(vs)}</div></td>
    </tr>`;
}

function renderVorsorgeTabelle(rows) {
  return `
    <section class="panel panel-pad section-spacing">
      ${renderVorsorgeFilters(rows.length)}
      ${rows.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr>
              ${vorsorgeSortHeader("id", t("labels.id"))}
              ${vorsorgeSortHeader("name", t("regelzahlungen.bezeichnung"))}
              ${vorsorgeSortHeader("art", t("labels.type"))}
              ${vorsorgeSortHeader("person", t("labels.owner"))}
              ${vorsorgeSortHeader("wert", t("vermoegen.wert"), true)}
              ${vorsorgeSortHeader("status", t("labels.status"))}
            </tr></thead>
            <tbody>${rows.map(renderVorsorgeRow).join("")}</tbody>
          </table>
        </div>` : `<p class="muted">${escapeHtml(t("vorsorge.noMatches"))}</p>`}
    </section>`;
}
```

Task 2 schließt mit diesem noch railfreien Seitenrenderer:

```js
export function renderVorsorge() {
  const rows = vorsorgeRows();
  return `
    ${renderPageHead(t("vorsorge.title"), t("vorsorge.lead"))}
    ${renderVorsorgeHinweis()}
    ${renderVorsorgeTabelle(rows)}
  `;
}
```

Die erste Zelle jeder Tabellenzeile ist `<td>VS-001</td>`. Jeder Header ist ein Button mit `data-vorsorge-sort="id|name|art|person|wert|status"`. Bei null Treffern rendert die Tabellenfläche `t("vorsorge.noMatches")`. Die Auswahlattribute kommen erst gemeinsam mit der funktionsfähigen Rail in Task 3 hinzu.

- [ ] **Step 6: Hauptinteraktionen anbinden**

Importiere `setVorsorgeFilter`, `resetVorsorgeFilters` und `toggleVorsorgeSort` in `main.js`. Ergänze `FOCUS_ATTRS` um `data-vorsorge-filter` und `data-vorsorge-sort`; ergänze `KEY_ACTIVATION_SELECTOR` um `[data-vorsorge-sort]`.

Im `input`-Handler behandle Vorsorgesuche vor dem Transaktionsfilter:

```js
const vorsorgeFilter = event.target.closest("input[data-vorsorge-filter]");
if (vorsorgeFilter) {
  setVorsorgeFilter(vorsorgeFilter.dataset.vorsorgeFilter, vorsorgeFilter.value);
  render();
  return;
}
```

Im `change`-Handler:

```js
const vorsorgeFilter = event.target.closest("[data-vorsorge-filter]");
if (vorsorgeFilter) {
  setVorsorgeFilter(vorsorgeFilter.dataset.vorsorgeFilter, vorsorgeFilter.value);
  state.view = "vorsorge";
  render();
  return;
}
```

Im Klick-Handler schalte Sortierung:

```js
const vorsorgeSort = event.target.closest("[data-vorsorge-sort]");
if (vorsorgeSort) {
  toggleVorsorgeSort(vorsorgeSort.dataset.vorsorgeSort);
  render();
  return;
}
```

In `handleAction` implementiere:

```js
if (action === "clear-vorsorge-filter") {
  setVorsorgeFilter(element.dataset.filterName, "");
  render();
  return;
}
if (action === "reset-vorsorge-filters") {
  resetVorsorgeFilters();
  render();
  return;
}
```

- [ ] **Step 7: i18n vollständig ergänzen und Test grün ausführen**

Ergänze unter `vorsorge` diese Texte:

```js
// de
filterSearch: "Suche",
searchPlaceholder: "ID, Name, Art, Person, Bemerkung oder Quelle",
filterArt: "Art",
filterPerson: "Person",
filterStatus: "Status",
filterPruefstatus: "Prüfstatus",
allArten: "Alle Arten",
allPersonen: "Alle Personen",
allStatus: "Alle Status",
allPruefstatus: "Alle Prüfstatus",
noMatches: "Keine Vorsorgeeinträge für die aktuelle Filterauswahl.",
art: {
  lebensversicherung: "Lebensversicherung",
  rentenversicherung: "Rentenversicherung",
  "gesetzliche-rente": "Gesetzliche Rente",
  betriebsrente: "Betriebsrente",
  riester: "Riester",
  ruerup: "Rürup",
  schutzversicherung: "Schutzversicherung",
  sonstig: "Sonstige Vorsorge",
},

// en
filterSearch: "Search",
searchPlaceholder: "ID, name, type, person, note, or source",
filterArt: "Type",
filterPerson: "Person",
filterStatus: "Status",
filterPruefstatus: "Review status",
allArten: "All types",
allPersonen: "All people",
allStatus: "All statuses",
allPruefstatus: "All review statuses",
noMatches: "No pension entries match the current filters.",
art: {
  lebensversicherung: "Life insurance",
  rentenversicherung: "Pension insurance",
  "gesetzliche-rente": "Statutory pension",
  betriebsrente: "Occupational pension",
  riester: "Riester pension",
  ruerup: "Rürup pension",
  schutzversicherung: "Protection insurance",
  sonstig: "Other pension provision",
},
```

Run:

```bash
node --test tests/m7-vorsorge-view.test.mjs tests/i18n-coverage.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Task-Commit erstellen**

```bash
git add app/runtime.mjs app/views/vorsorge.mjs app/main.js app/i18n.js tests/m7-vorsorge-view.test.mjs
git commit -m "feat: Vorsorgetabelle filtern und sortieren"
```

---

### Task 3: Adressierbare Vorsorge-Detail-Rail

**Files:**
- Modify: `app/views/vorsorge.mjs`
- Modify: `app/runtime.mjs`
- Modify: `app/main.js`
- Modify: `app/routing.mjs`
- Modify: `app/i18n.js`
- Test: `tests/m7-vorsorge-view.test.mjs`
- Test: `tests/routing.test.mjs`

**Interfaces:**
- Consumes: `vorsorgeRows()`, `detailRow`, aktuelle Zeitwerte, verknüpfte Regelzahlungen.
- Produces: `renderVorsorgeDetail(vs): string`, Route `#/vorsorge/<id>`, Aktionen `select-vorsorge`, `close-vorsorge-rail`.

- [ ] **Step 1: Failing Routing-Tests schreiben**

Ergänze in `tests/routing.test.mjs`:

```js
test("Vorsorge-Rail ist adressierbar", () => {
  assert.equal(
    routeFromState({ view: "vorsorge", selectedVorsorgeId: "VS-003" }),
    "#/vorsorge/VS-003",
  );
  assert.equal(routeFromState({ view: "vorsorge", selectedVorsorgeId: "" }), "#/vorsorge");
  assert.deepEqual(parseRoute("#/vorsorge/VS-003"), { view: "vorsorge", selectedVorsorgeId: "VS-003" });
  assert.deepEqual(parseRoute("#/vorsorge"), { view: "vorsorge" });
});
```

- [ ] **Step 2: Failing Rail-Render-Test schreiben**

Ergänze in `tests/m7-vorsorge-view.test.mjs` diese vollständige Fixture mit drei aktuellen Zeitwerten, Vorgänger/Nachfolger und einer Regelzahlung:

```js
test("ausgewählte Vorsorge zeigt vollständige Detail-Rail", () => {
  data.personen = [{ person_id: "PER-001", name: "Lena" }];
  data.vorsorge = [
    { vorsorge_id: "VS-002", art: "riester", name: "Riester alt", person_id: "PER-001", status: "gekuendigt", kapitalbildend: true },
    {
      vorsorge_id: "VS-003",
      art: "riester",
      name: "Riester Lena",
      person_id: "PER-001",
      status: "aktiv",
      kapitalbildend: true,
      kapitalwahl: "offen",
      geprueft_am: "2026-01-15",
      leistung_beginn: "2042-08-01",
      ersetzt_vorsorge_id: "VS-002",
      quelle_hinweis: "Standmitteilung 2026",
      quelle_standdatum: "2026-01-01",
      bemerkung: "Kapitalwahl offen",
    },
    { vorsorge_id: "VS-004", art: "riester", name: "Riester Nachfolger", person_id: "PER-001", status: "geplant", kapitalbildend: true, ersetzt_vorsorge_id: "VS-003" },
  ];
  data.zeitwerte = [
    { entitaet: "vorsorge", entitaet_id: "VS-003", feld: "rueckkaufswert", wert: "9100.00", standdatum: "2026-01-01", qualitaet: "belegt" },
    { entitaet: "vorsorge", entitaet_id: "VS-003", feld: "erwartete_rente", wert: "240.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" },
    { entitaet: "vorsorge", entitaet_id: "VS-003", feld: "erwartete_kapitalleistung", wert: "31000.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" },
  ];
  data.regelzahlungen = [{ regelzahlung_id: "RZ-014", bezeichnung: "Riester-Beitrag", betrag: "-162.00", vorsorge_id: "VS-003" }];
  data.transaktionen = [];
  state.vorsorgeFilters = { search: "", art: "", person: "", status: "", pruefstatus: "" };
  state.selectedVorsorgeId = "VS-003";
  const html = renderVorsorge();

  assert.match(html, /layout-with-rail/);
  assert.match(html, /detail-panel/);
  assert.match(html, /data-action="close-vorsorge-rail"/);
  assert.match(html, /VS-003/);
  assert.match(html, /Standmitteilung 2026/);
  assert.match(html, /Kapitalwahl offen/);
  assert.match(html, /Riester-Beitrag/);
  assert.match(html, /Rückkaufswert/);
  assert.match(html, /Erwartete Rente/);
  assert.match(html, /Riester alt/);
  assert.match(html, /Riester Nachfolger/);
});

test("ausgefilterte oder unbekannte Vorsorge öffnet keine Rail", () => {
  state.selectedVorsorgeId = "VS-999";
  assert.doesNotMatch(renderVorsorge(), /detail-panel/);
  state.selectedVorsorgeId = "VS-003";
  state.vorsorgeFilters.search = "kein Treffer";
  assert.doesNotMatch(renderVorsorge(), /detail-panel/);
});
```

- [ ] **Step 3: Tests rot ausführen**

Run:

```bash
node --test tests/routing.test.mjs tests/m7-vorsorge-view.test.mjs
```

Expected: FAIL, weil Vorsorgetails noch ignoriert und keine Detail-Rail gerendert werden.

- [ ] **Step 4: Routing implementieren**

Ergänze vor dem reinen View-Fallback in `routeFromState`:

```js
if (state.view === "vorsorge" && state.selectedVorsorgeId) {
  return `#/vorsorge/${encodeURIComponent(state.selectedVorsorgeId)}`;
}
```

Ändere den Vorsorgezweig in `parseRoute`:

```js
if (head === "vorsorge") {
  return tail ? { view: "vorsorge", selectedVorsorgeId: tail } : { view: "vorsorge" };
}
```

Nimm `selectedVorsorgeId` in `snapshotState` und `restoreState` auf. Behandle in `applyRoute` Liste, gültigen Deep-Link und unbekannten Tail gemeinsam:

```js
if (route.view === "vorsorge") {
  const known = route.selectedVorsorgeId
    ? (data.vorsorge ?? []).some((vs) => vs.vorsorge_id === route.selectedVorsorgeId)
    : false;
  if (known) {
    resetVorsorgeFilters();
    state.selectedVorsorgeId = route.selectedVorsorgeId;
  } else {
    state.selectedVorsorgeId = "";
  }
}
```

Damit leert auch ein direkter Aufruf von `#/vorsorge` eine vorherige Auswahl.

- [ ] **Step 5: Rail-Renderer implementieren**

Bestimme die Auswahl ausschließlich innerhalb der sichtbaren Zeilen:

```js
const rows = vorsorgeRows();
const selected = state.selectedVorsorgeId
  ? rows.find((vs) => vs.vorsorge_id === state.selectedVorsorgeId)
  : undefined;
const railOpen = Boolean(selected);
```

Rendere den bestehenden Hinweis und die Tabelle im linken Stack und die Rail nur bei gültiger sichtbarer Auswahl:

```js
return `
  ${renderPageHead(t("vorsorge.title"), t("vorsorge.lead"))}
  <div class="layout-with-rail ${railOpen ? "" : "rail-closed"}">
    <div class="stack">
      ${renderVorsorgeHinweis()}
      ${renderVorsorgeTabelle(rows)}
    </div>
    ${railOpen ? `
      <aside class="panel panel-pad detail-panel">
        <div class="detail-head">
          <h2 class="section-title">${escapeHtml(t("vorsorge.detailTitle"))}</h2>
          <button class="icon-button" data-action="close-vorsorge-rail" aria-label="${escapeHtml(t("chrome.closeDetails"))}">${iconSvg("close")}</button>
        </div>
        ${renderVorsorgeDetail(selected)}
      </aside>` : ""}
  </div>`;
```

Verwende die in Task 2 definierten Helfer `renderVorsorgeHinweis()` und `renderVorsorgeTabelle(rows)` ohne Änderungen an ihrem Inhalt. Beide geben ausschließlich HTML zurück.

`renderVorsorgeDetail(vs)` verwendet `detailRow(...)` für Stammdaten und getrennte Abschnitte:

```js
export function renderVorsorgeDetail(vs) {
  const beitraege = (data.regelzahlungen ?? []).filter((rz) => rz.vorsorge_id === vs.vorsorge_id);
  const zeitwerte = aktuelleVorsorgeZeitwerte(vs.vorsorge_id);
  const nachfolger = (data.vorsorge ?? []).find((candidate) => candidate.ersetzt_vorsorge_id === vs.vorsorge_id);
  const vorgaenger = vs.ersetzt_vorsorge_id
    ? (data.vorsorge ?? []).find((candidate) => candidate.vorsorge_id === vs.ersetzt_vorsorge_id)
    : undefined;

  return `
    ${detailRow(t("labels.id"), escapeHtml(vs.vorsorge_id))}
    ${detailRow(t("regelzahlungen.bezeichnung"), `<strong>${escapeHtml(vs.name)}</strong>`)}
    ${detailRow(t("labels.type"), escapeHtml(vorsorgeArtLabel(vs.art)))}
    ${detailRow(t("labels.owner"), escapeHtml(personName(vs.person_id)))}
    ${detailRow(t("labels.status"), statusChip(vs))}
    ${renderVorsorgeDates(vs)}
    ${renderVorsorgeZeitwerte(zeitwerte)}
    ${renderVorsorgeNachfolge(vorgaenger, nachfolger)}
    ${renderVorsorgeQuelle(vs)}
    ${vs.bemerkung ? detailRow(t("vorsorge.bemerkung"), escapeHtml(vs.bemerkung)) : ""}
    ${renderErwarteteBeitraege(beitraege)}
  `;
}
```

Importiere `detailRow` aus `komponenten.mjs`. `aktuelleVorsorgeZeitwerte` ruft `aktuellerZeitwert` für `rueckkaufswert`, `erwartete_rente` und `erwartete_kapitalleistung` auf, entfernt fehlende Ergebnisse und zeigt je Feld Betrag, Standdatum und Qualitätslabel. Optionale Abschnitte werden bei fehlenden Daten ausgelassen.

Definiere die im Renderer verwendeten Helfer vollständig:

```js
function aktuelleVorsorgeZeitwerte(vorsorgeId) {
  return ["rueckkaufswert", "erwartete_rente", "erwartete_kapitalleistung"]
    .map((feld) => aktuellerZeitwert(data.zeitwerte, "vorsorge", vorsorgeId, feld))
    .filter(Boolean);
}

function renderVorsorgeDates(vs) {
  return [
    detailRow(t("vorsorge.kapitalbildendLabel"), escapeHtml(vs.kapitalbildend ? t("labels.yes") : t("labels.no"))),
    vs.kapitalwahl ? detailRow(t("vorsorge.kapitalwahl"), escapeHtml(vs.kapitalwahl)) : "",
    vs.leistung_beginn ? detailRow(t("vorsorge.leistungBeginn"), escapeHtml(formatDate(vs.leistung_beginn))) : "",
    vs.aktiv_bis ? detailRow(t("vorsorge.aktivBis"), escapeHtml(formatDate(vs.aktiv_bis))) : "",
    vs.geprueft_am ? detailRow(t("vorsorge.geprueftAm"), escapeHtml(formatDate(vs.geprueft_am))) : "",
  ].join("");
}

function renderVorsorgeZeitwerte(zeitwerte) {
  if (!zeitwerte.length) return "";
  const feldLabel = {
    rueckkaufswert: t("vorsorge.rueckkaufswert"),
    erwartete_rente: t("vorsorge.erwarteteRente"),
    erwartete_kapitalleistung: t("vorsorge.erwarteteKapitalleistung"),
  };
  const rows = zeitwerte.map((zw) => `
    <div class="rail-item">
      <strong>${escapeHtml(feldLabel[zw.feld] || zw.feld)}</strong>
      <span>${escapeHtml(formatMoney(cents(zw.wert)))}</span>
      <span class="muted">${escapeHtml(formatDate(zw.standdatum))} · ${escapeHtml(t(`vorsorge.qualitaet.${zw.qualitaet}`))}</span>
    </div>`).join("");
  return detailRow(t("vorsorge.zeitwerte"), `<div class="rail-list">${rows}</div>`);
}

function renderVorsorgeNachfolge(vorgaenger, nachfolger) {
  return [
    vorgaenger ? detailRow(t("vorsorge.vorgaenger"), escapeHtml(`${vorgaenger.vorsorge_id} · ${vorgaenger.name}`)) : "",
    nachfolger ? detailRow(t("vorsorge.nachfolger"), escapeHtml(`${nachfolger.vorsorge_id} · ${nachfolger.name}`)) : "",
  ].join("");
}

function renderVorsorgeQuelle(vs) {
  if (!vs.quelle_hinweis && !vs.quelle_standdatum) return "";
  const value = [
    vs.quelle_hinweis ? escapeHtml(vs.quelle_hinweis) : "",
    vs.quelle_standdatum ? escapeHtml(formatDate(vs.quelle_standdatum)) : "",
  ].filter(Boolean).join(" · ");
  return detailRow(t("vorsorge.vertragsquelle"), value);
}

function renderErwarteteBeitraege(beitraege) {
  if (!beitraege.length) return "";
  const rows = beitraege.map((rz) => `
    <div class="rail-item">
      <strong>${escapeHtml(`${rz.regelzahlung_id} · ${rz.bezeichnung}`)}</strong>
      <span>${escapeHtml(formatMoney(cents(rz.betrag)))}</span>
    </div>`).join("");
  return detailRow(t("vorsorge.erwarteteBeitraege"), `<div class="rail-list">${rows}</div>`);
}
```

- [ ] **Step 6: Auswahl- und Schließaktionen anbinden**

Ergänze jede Vorsorgezeile um die Auswahlattribute und markiere nur die aktuelle sichtbare Auswahl:

```html
<tr class="clickable selected" data-action="select-vorsorge" data-vorsorge="VS-003" tabindex="0" role="button" aria-label="Riester Lena">
```

Ergänze `FOCUS_ATTRS` um `data-vorsorge` und `KEY_ACTIVATION_SELECTOR` um `[data-vorsorge]`.

Ergänze in `handleAction`:

```js
if (action === "select-vorsorge") {
  state.view = "vorsorge";
  state.selectedVorsorgeId = element.dataset.vorsorge || "";
  commitNavigation();
  return;
}
if (action === "close-vorsorge-rail") {
  state.selectedVorsorgeId = "";
  commitNavigation();
  return;
}
```

Setze die Klasse `selected` nur an der aktuell ausgewählten sichtbaren Zeile. Ergänze diese i18n-Texte:

```js
// de
detailTitle: "Vorsorgedetails",
kapitalbildendLabel: "Kapitalbildend",
leistungBeginn: "Leistungsbeginn",
aktivBis: "Aktiv bis",
geprueftAm: "Geprüft am",
vertragsquelle: "Vertragsquelle",
bemerkung: "Bemerkung",
erwarteteBeitraege: "Erwartete Beiträge",
vorgaenger: "Vorgänger",
zeitwerte: "Aktuelle Werte",
qualitaet: { belegt: "belegt", geschaetzt: "geschätzt" },

// en
detailTitle: "Pension details",
kapitalbildendLabel: "Capital-forming",
leistungBeginn: "Benefit start",
aktivBis: "Active until",
geprueftAm: "Reviewed on",
vertragsquelle: "Contract source",
bemerkung: "Note",
erwarteteBeitraege: "Expected contributions",
vorgaenger: "Predecessor",
zeitwerte: "Current values",
qualitaet: { belegt: "documented", geschaetzt: "estimated" },
```

Die vorhandenen Schlüssel `kapitalwahl` und `nachfolger` bleiben erhalten und werden wiederverwendet.

- [ ] **Step 7: Fokussierte Tests grün ausführen**

Run:

```bash
node --test tests/routing.test.mjs tests/m7-vorsorge-view.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Task-Commit erstellen**

```bash
git add app/views/vorsorge.mjs app/runtime.mjs app/main.js app/routing.mjs app/i18n.js tests/m7-vorsorge-view.test.mjs tests/routing.test.mjs
git commit -m "feat: Vorsorgedetails in Rail anzeigen"
```

---

### Task 4: Gebuchte Beiträge und Rücklink in der Transaktions-Rail

**Files:**
- Modify: `app/views/vorsorge.mjs`
- Modify: `app/views/transaktionen.mjs`
- Modify: `app/main.js`
- Modify: `app/i18n.js`
- Test: `tests/m7-vorsorge-view.test.mjs`
- Test: `tests/detail-rail-initial-state.test.mjs`

**Interfaces:**
- Consumes: `Transaktion.regelzahlung_id`, `Regelzahlung.vorsorge_id`, vorhandene Aktion `open-transaction`.
- Produces: `gebuchteBeitraege(vorsorgeId): Transaktion[]`, `vorsorgeForTransaction(tx): Vorsorge | undefined`, Aktion `open-vorsorge`.

- [ ] **Step 1: Failing Test für die fünf neuesten Beitragsbuchungen schreiben**

Erweitere die Destrukturierung aus `vorsorgeView` um `gebuchteBeitraege`. Ergänze sechs zugeordnete und eine fremde Transaktion. Die erwarteten IDs werden als Literale geprüft:

```js
test("Vorsorge-Rail zeigt nur die fünf neuesten explizit verknüpften Beiträge", () => {
  data.personen = [{ person_id: "PER-001", name: "Lena" }];
  data.vorsorge = [{ vorsorge_id: "VS-003", art: "riester", name: "Riester Lena", person_id: "PER-001", status: "aktiv", kapitalbildend: true }];
  data.zeitwerte = [];
  data.regelzahlungen = [
    { regelzahlung_id: "RZ-001", bezeichnung: "Alt", betrag: "-10.00", vorsorge_id: "VS-003" },
    { regelzahlung_id: "RZ-002", bezeichnung: "Neu", betrag: "-20.00", vorsorge_id: "VS-003" },
    { regelzahlung_id: "RZ-999", bezeichnung: "Fremd", betrag: "-70.00", vorsorge_id: "VS-999" },
  ];
  data.transaktionen = [
    { transaktion_id: "TXN-1", regelzahlung_id: "RZ-001", buchungsdatum: "2026-01-01", betrag: "-10.00", gegenpartei: "A" },
    { transaktion_id: "TXN-2", regelzahlung_id: "RZ-001", buchungsdatum: "2026-02-01", betrag: "-20.00", gegenpartei: "B" },
    { transaktion_id: "TXN-3", regelzahlung_id: "RZ-002", buchungsdatum: "2026-03-01", betrag: "-30.00", gegenpartei: "C" },
    { transaktion_id: "TXN-4", regelzahlung_id: "RZ-002", buchungsdatum: "2026-04-01", betrag: "-40.00", gegenpartei: "D" },
    { transaktion_id: "TXN-5", regelzahlung_id: "RZ-002", buchungsdatum: "2026-05-01", betrag: "-50.00", gegenpartei: "E" },
    { transaktion_id: "TXN-6", regelzahlung_id: "RZ-002", buchungsdatum: "2026-06-01", betrag: "-60.00", gegenpartei: "F" },
    { transaktion_id: "TXN-X", regelzahlung_id: "RZ-999", buchungsdatum: "2026-07-01", betrag: "-70.00", gegenpartei: "X" },
  ];
  state.vorsorgeFilters = { search: "", art: "", person: "", status: "", pruefstatus: "" };
  state.selectedVorsorgeId = "VS-003";

  assert.deepEqual(gebuchteBeitraege("VS-003").map((tx) => tx.transaktion_id), ["TXN-6", "TXN-5", "TXN-4", "TXN-3", "TXN-2"]);
  const html = renderVorsorge();
  assert.equal((html.match(/data-action="open-transaction"/g) ?? []).length, 5);
  assert.doesNotMatch(html, /TXN-1|TXN-X/);
});
```

- [ ] **Step 2: Failing Test für den Vorsorgebezug in der Transaktions-Rail schreiben**

Importiere in `tests/detail-rail-initial-state.test.mjs` `transaktionenById` aus `runtime.mjs`. Pflege die Map während des Tests explizit:

```js
test("Transaktions-Rail zeigt die abgeleitete Vorsorge anklickbar", () => {
  const tx = {
    transaktion_id: "TXN-11111111-1111-4111-8111-111111111111",
    regelzahlung_id: "RZ-001",
    konto_id: data.konten[0].konto_id,
    buchungsdatum: "2026-06-15",
    betrag: "-162.00",
    gegenpartei: "MusterversicherungA",
    verwendungszweck: "Riester",
    kategorisierung_status: "offen",
    ist_transfer: false,
    rohquelle: "Belege/riester.csv",
  };
  data.transaktionen = [tx];
  data.regelzahlungen = [{ regelzahlung_id: "RZ-001", vorsorge_id: "VS-003" }];
  data.vorsorge = [{ vorsorge_id: "VS-003", name: "Riester Lena" }];
  transaktionenById.set(tx.transaktion_id, tx);
  resetTransactionState();
  state.selectedTransactionId = tx.transaktion_id;

  const html = renderTransactions();
  assert.match(html, /Vorsorge/);
  assert.match(html, /data-action="open-vorsorge" data-vorsorge="VS-003"/);
  assert.match(html, /VS-003 · Riester Lena/);
});
```

Restauriere Daten, Zustand und Map-Eintrag im `finally`-Block.

- [ ] **Step 3: Tests rot ausführen**

Run:

```bash
node --test tests/m7-vorsorge-view.test.mjs tests/detail-rail-initial-state.test.mjs
```

Expected: FAIL mit fehlenden Exports beziehungsweise fehlendem Vorsorge-Link.

- [ ] **Step 4: Gebuchte Beiträge in der Vorsorge-Rail implementieren**

```js
export function gebuchteBeitraege(vorsorgeId) {
  const regelzahlungIds = new Set(
    (data.regelzahlungen ?? [])
      .filter((rz) => rz.vorsorge_id === vorsorgeId)
      .map((rz) => rz.regelzahlung_id),
  );
  return (data.transaktionen ?? [])
    .filter((tx) => regelzahlungIds.has(tx.regelzahlung_id))
    .slice()
    .sort((a, b) => String(b.buchungsdatum).localeCompare(String(a.buchungsdatum))
      || String(b.transaktion_id).localeCompare(String(a.transaktion_id)))
    .slice(0, 5);
}
```

Rendere nur bei Treffern einen Rail-Abschnitt `t("vorsorge.gebuchteBeitraege")`. Jede Zeile enthält einen Button:

```html
<button class="linkish" data-action="open-transaction" data-transaction="TXN-…">
  15.06.2026 · MusterversicherungA · −162,00 €
</button>
```

- [ ] **Step 5: Vorsorge in der Transaktions-Rail ableiten**

Implementiere in `transaktionen.mjs`:

```js
export function vorsorgeForTransaction(tx) {
  if (!tx?.regelzahlung_id) return undefined;
  const regelzahlung = (data.regelzahlungen ?? []).find((rz) => rz.regelzahlung_id === tx.regelzahlung_id);
  if (!regelzahlung?.vorsorge_id) return undefined;
  return (data.vorsorge ?? []).find((vs) => vs.vorsorge_id === regelzahlung.vorsorge_id);
}
```

Ergänze in `renderTransactionDetail` nach dem Kontoabschnitt:

```js
const vorsorge = vorsorgeForTransaction(tx);

${vorsorge ? detailRow(
  t("transactions.vorsorge"),
  `<button class="linkish" data-action="open-vorsorge" data-vorsorge="${escapeHtml(vorsorge.vorsorge_id)}">${escapeHtml(`${vorsorge.vorsorge_id} · ${vorsorge.name}`)}</button>`,
) : ""}
```

Importiere dafür `detailRow` aus `komponenten.mjs`.

- [ ] **Step 6: Rücknavigation zur Vorsorge anbinden**

Ergänze in `handleAction`:

```js
if (action === "open-vorsorge") {
  state.view = "vorsorge";
  resetVorsorgeFilters();
  state.selectedVorsorgeId = element.dataset.vorsorge || "";
  commitNavigation();
  return;
}
```

Ergänze `transactions.vorsorge: "Vorsorge"` und `vorsorge.gebuchteBeitraege: "Gebuchte Beiträge"` auf Deutsch sowie `transactions.vorsorge: "Pension provision"` und `vorsorge.gebuchteBeitraege: "Booked contributions"` auf Englisch. Es werden ausdrücklich weder Transaktionsfilter noch Tabellenspalten ergänzt.

- [ ] **Step 7: Fokussierte Tests grün ausführen**

Run:

```bash
node --test tests/m7-vorsorge-view.test.mjs tests/detail-rail-initial-state.test.mjs tests/routing.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Task-Commit erstellen**

```bash
git add app/views/vorsorge.mjs app/views/transaktionen.mjs app/main.js app/i18n.js tests/m7-vorsorge-view.test.mjs tests/detail-rail-initial-state.test.mjs
git commit -m "feat: Vorsorge und Beitragsbuchungen verlinken"
```

---

### Task 5: Gesamtabnahme und Browser-Klickpfad

**Files:**
- Verify only: keine geplanten Produktionsänderungen

**Interfaces:**
- Consumes: die vier vorherigen Task-Commits.
- Produces: frische Test-, Validierungs- und Browserbelege für die Abnahme.

- [ ] **Step 1: Alle fokussierten Tests gemeinsam ausführen**

```bash
node --test tests/m7-vorsorge.test.mjs tests/m3-import-format.test.mjs tests/m3-import.test.mjs tests/m7-vorsorge-view.test.mjs tests/detail-rail-initial-state.test.mjs tests/routing.test.mjs
```

Expected: PASS ohne Fehler oder Warnungen.

- [ ] **Step 2: Gesamte Testsuite ausführen**

```bash
npm test
```

Expected: alle Tests PASS, 0 FAIL.

- [ ] **Step 3: Live-Masterdaten validieren**

```bash
npm run validate:master
```

Expected: `Master data validation passed`.

- [ ] **Step 4: App lokal starten**

```bash
python3 serve_app.py 8765
```

Expected: Server lauscht auf `http://127.0.0.1:8765` und bleibt für die Browserprüfung aktiv.

- [ ] **Step 5: Browser-Abnahme mit dem user-scoped Playwright-Skill durchführen**

Verwende die sandbox-kompatiblen Chromium-Helfer des Playwright-Skills; kein direktes `chromium.launch()`. Prüfe nacheinander:

1. `#/vorsorge` zeigt die ID-Spalte und keine offene Rail.
2. Suche nach einem Text aus `bemerkung` oder `quelle_hinweis` reduziert die Trefferzahl korrekt.
3. Art-, Person-, Status- und Prüfstatusfilter wirken kombiniert; Zurücksetzen stellt alle Zeilen wieder her.
4. Jeder Sortierkopf schaltet `▲`/`▼`; fehlende Werte bleiben bei Wertsortierung unten.
5. Klick und Tastaturaktivierung einer Zeile öffnen `#/vorsorge/<id>` und zeigen Quelle, Bemerkung, Zeitwerte und erwartete Beiträge.
6. Schließen führt zu `#/vorsorge`; eine unbekannte ID zeigt keine leere Rail.
7. Falls der gewählte Datenbestand explizit verknüpfte Beitragsbuchungen enthält, öffnet ein Buchungslink die Transaktions-Rail und deren Vorsorgelink führt zurück. Fehlt eine solche reale Verknüpfung, wird dieser Pfad durch die fokussierten Fixture-Tests aus Step 1 belegt und im Abnahmebericht als „kein verknüpfter Live-/Demo-Datensatz vorhanden“ ausgewiesen.
8. Auf schmalem Viewport stapelt sich die Rail unter der Tabelle ohne horizontalen Seitenüberlauf.

- [ ] **Step 6: Arbeitsbaum und Commitfolge prüfen**

```bash
git status --short --branch
git log -5 --oneline --decorate
```

Expected: keine unerwarteten oder uncommitteten Dateien; die vier Feature-Commits aus Tasks 1 bis 4 sind sichtbar.

# Textzwilling der Belege — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jedes PDF unter `app/Belege/` bekommt einen gleichnamigen `.txt`-Zwilling, und `app/data/inbox/standardized/` wird wieder zur Durchgangsstation.

**Architecture:** Ein neues Werkzeug `app/tools/belege-text.mjs` erzeugt fehlende Zwillinge aus den Belegen und räumt redundante Textvorläufe über den SHA-256 des Inhalts ab. Die Entscheidungslogik liegt in zwei reinen, exportierten Funktionen ohne Dateisystemzugriff; `main()` sammelt die Fakten ein und führt aus. Bildscans ohne Textebene bekommen einen Marker-Zwilling, den der Agent beim Import durch gelesenen Text ersetzt.

**Tech Stack:** Node.js ESM (v26), `node:test`, Poppler `pdftotext`, `node:crypto` für SHA-256. Keine neuen Abhängigkeiten.

**Spec:** `docs/superpowers/specs/2026-08-11-belege-textzwilling-design.md`

## Global Constraints

- Alle Pfade in App-Dokumentation sind app-relativ (`data/...`, `Belege/...`, `tools/...`). App-Doku verweist nie auf Dateien außerhalb von `app/` — geprüft durch `tests/agent-docs.test.mjs`.
- Deutschsprachige Bezeichner und Berichtsfelder, wie in `inbox.mjs` und `normalize.mjs`.
- `app/Belege/` und `app/data/` sind gitignored. Es werden **keine** Belege, Zwillinge oder Kontodaten committet.
- Kommentare im Code erklären das *Warum*, nicht das *Was* — Hausform siehe Kopf von `app/tools/inbox.mjs`.
- Vorschau ist Standard: Ohne `--schreiben` wird nichts erzeugt, nichts gelöscht.
- Der Marker-Kopf lautet exakt `# Kein Textlayer — Bildscan, <N> Seiten. Inhalt nur im PDF.`
- Der Gelesen-Kopf lautet exakt `# Vom Agenten aus dem Bildscan gelesen, <JJJJ-MM-TT>.`
- Normale Zwillinge tragen **keine** Kopfzeile. Sie sind rohes `pdftotext -layout`-Ergebnis, sonst bricht die Hash-Paarung.

## Abweichung vom Spec

Der Spec nennt eine Planungsfunktion `planBelegeText({ belege, staging })`. Bei der Ausarbeitung zeigt sich, dass Erzeugen und Aufräumen zwangsläufig in zwei Phasen laufen: Das Aufräumen paart über die Hashes der Zwillinge, und die entstehen erst beim Erzeugen. Der Plan verwendet deshalb zwei reine Funktionen — `planZwillinge` und `planAufraeumen`. Die Trennung von Planung und Wirkung, um die es dem Spec geht, bleibt unverändert.

## Verifizierte Vorbedingungen

Diese Fakten sind vor dem Planen am Bestand geprüft und dürfen als gegeben gelten:

- `pdftotext -layout <pdf> -` schreibt nach stdout und ist **byte-identisch** zur Dateiausgabe und zu den vorhandenen Textvorläufen (SHA-256 an `2025_VPV_Classic_Jaehrliche_Information_700000001` verifiziert). Kein Temp-File nötig.
- Die Zahl der Form-Feeds (`\f`) im Extrakt entspricht der Seitenzahl des PDF (an vier Belegen gegen `pdfinfo` geprüft, 2/2/3/5). Kein `pdfinfo`-Aufruf nötig.
- Genau 3 der 84 Belege haben keine Textebene: `Belege/2025/Versicherungen/2025_MusterversicherungA_Testversicherung_Vertrag_A_{Beitragsanpassung,Beitragsrechnung,Nachtrag}_TEST-VERTRAG-001.pdf`. Ihre Extrakte bestehen nur aus Form-Feeds (2, 2, 3 Byte).
- Unter `Belege/` liegt heute kein einziger `.txt`-Zwilling. Bestand: 84 PDF, 2 CSV.
- In `data/inbox/standardized/` liegen 86 `.txt`.

## File Structure

| Datei | Verantwortung |
| --- | --- |
| `app/tools/belege-text.mjs` (neu) | Planungsfunktionen, Extraktion, Bericht, Ausführung |
| `tests/belege-text.test.mjs` (neu) | Tests gegen die reinen Planungsfunktionen |
| `package.json` (ändern) | Skripte `belege:text`, `belege:text:schreiben` |
| `app/tools/inbox.mjs` (ändern) | Kopfkommentar und Berichts-`hinweis`: `standardized/` ist Durchgangsstation |
| `app/docs/agent-context.md` (ändern) | Abschnitt „Belege": Zwillings-Invariante; PDF-Notiz bei den Import-Profilen |
| `app/docs/skills/import-agent.md` (ändern) | Schritt 9: Zwilling und Bildscan-Abzweigung |
| `app/docs/skills/vorsorge-erfassung-agent.md` (ändern) | Schritt 2: Bildscan-Abzweigung |
| `app/docs/skills/stammdaten-erfassung-agent.md` (ändern) | Abschnitt „Belege benennen und ablegen": Zwilling |

---

### Task 1: Planungsfunktion `planZwillinge`

Entscheidet allein aus einer Dateiliste, welche PDFs einen Zwilling brauchen und welche Auffälligkeiten zu melden sind. Kein Dateisystem, kein `pdftotext`.

**Files:**
- Create: `app/tools/belege-text.mjs`
- Test: `tests/belege-text.test.mjs`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `MARKER_KOPF = "# Kein Textlayer"` (String, Präfix)
  - `GELESEN_KOPF = "# Vom Agenten aus dem Bildscan gelesen"` (String, Präfix)
  - `planZwillinge({ belege }) → { erzeugen, offen }`
    - `belege`: `Array<{ pfad: string, hash?: string, kopf?: string }>` — alle Dateien unter `Belege/` mit app-relativem Pfad; `hash` und `kopf` (erste Zeile) nur bei `.txt`
    - `erzeugen`: `Array<{ pdf: string, ziel: string }>`, nach `pdf` sortiert
    - `offen`: `Array<{ ort: string, grund: string }>`, nach `ort` sortiert

- [ ] **Step 1: Testdatei anlegen mit den Fällen für `planZwillinge`**

Datei `tests/belege-text.test.mjs`:

```javascript
// tests/belege-text.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { planZwillinge, MARKER_KOPF, GELESEN_KOPF } from "../app/tools/belege-text.mjs";

test("PDF ohne Zwilling steht im Erzeugungsplan", () => {
  const plan = planZwillinge({ belege: [{ pfad: "Belege/2025/Rente/a.pdf" }] });
  assert.deepEqual(plan.erzeugen, [{ pdf: "Belege/2025/Rente/a.pdf", ziel: "Belege/2025/Rente/a.txt" }]);
  assert.deepEqual(plan.offen, []);
});

test("PDF mit vorhandenem Zwilling wird nicht neu erzeugt", () => {
  const plan = planZwillinge({
    belege: [
      { pfad: "Belege/2025/Rente/a.pdf" },
      { pfad: "Belege/2025/Rente/a.txt", hash: "aaa", kopf: "MusterversicherungA Vertrag" },
    ],
  });
  assert.deepEqual(plan.erzeugen, []);
  assert.deepEqual(plan.offen, []);
});

test("CSV unter Belege bekommt keinen Zwilling", () => {
  const plan = planZwillinge({ belege: [{ pfad: "Belege/Kontoauszuege/KTO-001/x.csv" }] });
  assert.deepEqual(plan.erzeugen, []);
  assert.deepEqual(plan.offen, []);
});

test("Marker-Zwilling wird bei jedem Lauf als offene OCR gemeldet", () => {
  const plan = planZwillinge({
    belege: [
      { pfad: "Belege/2025/Versicherungen/scan.pdf" },
      { pfad: "Belege/2025/Versicherungen/scan.txt", hash: "bbb", kopf: `${MARKER_KOPF} — Bildscan, 2 Seiten. Inhalt nur im PDF.` },
    ],
  });
  assert.deepEqual(plan.erzeugen, [], "der Marker zaehlt als vorhandener Zwilling");
  assert.deepEqual(plan.offen, [{ ort: "Belege/2025/Versicherungen/scan.txt", grund: "OCR ausstehend" }]);
});

test("vom Agenten gelesener Zwilling gilt als erledigt", () => {
  const plan = planZwillinge({
    belege: [
      { pfad: "Belege/2025/Versicherungen/scan.pdf" },
      { pfad: "Belege/2025/Versicherungen/scan.txt", hash: "ccc", kopf: `${GELESEN_KOPF} 2026-08-11.` },
    ],
  });
  assert.deepEqual(plan.erzeugen, []);
  assert.deepEqual(plan.offen, [], "gelesen ist kein offener Punkt mehr");
});

test("Zwilling ohne zugehoerigen Beleg wird gemeldet, nicht geloescht", () => {
  const plan = planZwillinge({ belege: [{ pfad: "Belege/2025/Rente/verwaist.txt", hash: "ddd", kopf: "irgendwas" }] });
  assert.deepEqual(plan.erzeugen, []);
  assert.deepEqual(plan.offen, [{ ort: "Belege/2025/Rente/verwaist.txt", grund: "Zwilling ohne Beleg" }]);
});

test("Zwilling und Beleg paaren unabhaengig von der Unicode-Normalform", () => {
  // macOS liefert Dateinamen aus readdir in NFD. Ohne Angleichung faende ein
  // NFC-Zwilling sein NFD-PDF nie und der Lauf wuerde ihn doppelt erzeugen.
  const nfc = "Belege/2025/Sonstiges/Grundstück".normalize("NFC");
  const nfd = nfc.normalize("NFD");
  assert.notEqual(nfc, nfd, "Testvoraussetzung: die Normalformen unterscheiden sich");

  const plan = planZwillinge({ belege: [{ pfad: `${nfd}.pdf` }, { pfad: `${nfc}.txt`, hash: "eee", kopf: "Text" }] });
  assert.deepEqual(plan.erzeugen, []);
  assert.deepEqual(plan.offen, []);
});

test("liefert eine stabile, sortierte Reihenfolge fuer reproduzierbare Laeufe", () => {
  const plan = planZwillinge({ belege: [{ pfad: "Belege/b.pdf" }, { pfad: "Belege/a.pdf" }, { pfad: "Belege/c.pdf" }] });
  assert.deepEqual(plan.erzeugen.map((e) => e.pdf), ["Belege/a.pdf", "Belege/b.pdf", "Belege/c.pdf"]);
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

```bash
node --test tests/belege-text.test.mjs
```

Erwartet: FAIL mit `Cannot find module .../app/tools/belege-text.mjs`

- [ ] **Step 3: `belege-text.mjs` mit `planZwillinge` anlegen**

Datei `app/tools/belege-text.mjs`:

```javascript
// app/tools/belege-text.mjs
//
// Textzwilling der Belege: Jedes PDF unter `Belege/` hat eine gleichnamige
// `.txt` daneben. Der Zwilling ist rohes `pdftotext -layout`-Ergebnis und
// deshalb jederzeit aus dem Beleg wiederherstellbar — er wird neu erzeugt,
// nicht verschoben.
//
// `data/inbox/standardized/` wird ueber den Inhalts-Hash aufgeraeumt, nicht
// ueber den Dateinamen: Der Agent benennt Belege beim Ablegen um, Namen
// driften also systematisch auseinander. Inhalte tun das nicht.

export const MARKER_KOPF = "# Kein Textlayer";
export const GELESEN_KOPF = "# Vom Agenten aus dem Bildscan gelesen";

const nfc = (wert) => wert.normalize("NFC");
const nachPfad = (a, b) => a.pfad.localeCompare(b.pfad);
const istPdf = (pfad) => /\.pdf$/i.test(pfad);
const istTxt = (pfad) => /\.txt$/i.test(pfad);
const zielFuer = (pfad) => pfad.replace(/\.pdf$/i, ".txt");

export function planZwillinge({ belege }) {
  const dateien = belege.map((datei) => ({ ...datei, pfad: nfc(datei.pfad) })).sort(nachPfad);
  const pdfs = dateien.filter((datei) => istPdf(datei.pfad));
  const zwillinge = dateien.filter((datei) => istTxt(datei.pfad));
  const zwillingNachPfad = new Map(zwillinge.map((zwilling) => [zwilling.pfad, zwilling]));
  const erwarteteZwillinge = new Set(pdfs.map((pdf) => zielFuer(pdf.pfad)));

  const erzeugen = [];
  const offen = [];

  for (const pdf of pdfs) {
    const ziel = zielFuer(pdf.pfad);
    const vorhanden = zwillingNachPfad.get(ziel);
    if (!vorhanden) {
      erzeugen.push({ pdf: pdf.pfad, ziel });
      continue;
    }
    // Der Marker bleibt so lange stehen, bis der Agent den Scan gelesen hat.
    // Ihn bei jedem Lauf zu melden macht daraus eine Restliste, die nicht
    // veralten kann, weil sie aus dem Dateisystem hergeleitet wird.
    if ((vorhanden.kopf ?? "").startsWith(MARKER_KOPF)) {
      offen.push({ ort: vorhanden.pfad, grund: "OCR ausstehend" });
    }
  }

  for (const zwilling of zwillinge) {
    if (!erwarteteZwillinge.has(zwilling.pfad)) {
      offen.push({ ort: zwilling.pfad, grund: "Zwilling ohne Beleg" });
    }
  }

  offen.sort((a, b) => a.ort.localeCompare(b.ort));
  return { erzeugen, offen };
}
```

- [ ] **Step 4: Test laufen lassen und grünen Lauf bestätigen**

```bash
node --test tests/belege-text.test.mjs
```

Erwartet: PASS, 8 Tests.

- [ ] **Step 5: Committen**

```bash
git add app/tools/belege-text.mjs tests/belege-text.test.mjs
git commit -m "feat(belege): Erzeugungsplan fuer Textzwillinge"
```

---

### Task 2: Planungsfunktion `planAufraeumen`

Entscheidet, welche Textvorläufe in `standardized/` redundant sind. Paart über den Inhalts-Hash, nicht über den Namen.

**Files:**
- Modify: `app/tools/belege-text.mjs`
- Test: `tests/belege-text.test.mjs`

**Interfaces:**
- Consumes: `MARKER_KOPF` aus Task 1
- Produces:
  - `planAufraeumen({ zwillinge, staging }) → { loeschen, offen }`
    - `zwillinge`: `Array<{ pfad: string, hash: string }>` — alle `.txt` unter `Belege/`, einschließlich der in diesem Lauf neu erzeugten
    - `staging`: `Array<{ name: string, hash: string, zeichen: number }>` — `.txt` in `data/inbox/standardized/`; `zeichen` = Anzahl Zeichen ohne Leerraum und Form-Feeds
    - `loeschen`: `Array<{ name: string, grund: string }>`, nach `name` sortiert
    - `offen`: `Array<{ ort: string, grund: string }>`, nach `ort` sortiert

- [ ] **Step 1: Tests für `planAufraeumen` anhängen**

An `tests/belege-text.test.mjs` anhängen, und den Import in Zeile 4 erweitern:

```javascript
import { planZwillinge, planAufraeumen, MARKER_KOPF, GELESEN_KOPF } from "../app/tools/belege-text.mjs";
```

```javascript
test("Textvorlauf mit Hash-Treffer ist redundant und wird geloescht", () => {
  const plan = planAufraeumen({
    zwillinge: [{ pfad: "Belege/Kontoauszuege/KTO-002/TESTREF-026.txt", hash: "5f52" }],
    staging: [{ name: "Kontoauszug-4711000815-2023-01.txt", hash: "5f52", zeichen: 4200 }],
  });
  assert.deepEqual(plan.loeschen, [{
    name: "Kontoauszug-4711000815-2023-01.txt",
    grund: "Hash-Treffer: Belege/Kontoauszuege/KTO-002/TESTREF-026.txt",
  }]);
  assert.deepEqual(plan.offen, []);
});

test("der Name spielt keine Rolle — nur der Inhalt entscheidet", () => {
  // Genau der Bestandsfall: 41 Textvorlaeufe tragen den Bank-Downloadnamen,
  // ihre Belege wurden beim Ablegen sprechend umbenannt.
  const plan = planAufraeumen({
    zwillinge: [{ pfad: "Belege/2026/Rente/2026_DRV-Bund_Altersrente_Rentenauskunft_12-345678-A-000.txt", hash: "2bc4" }],
    staging: [{ name: "Rentenauskunft Altersrente.txt", hash: "2bc4", zeichen: 9100 }],
  });
  assert.equal(plan.loeschen.length, 1);
  assert.equal(plan.loeschen[0].name, "Rentenauskunft Altersrente.txt");
});

test("Textvorlauf ohne Hash-Treffer bleibt liegen und wird gemeldet", () => {
  const plan = planAufraeumen({
    zwillinge: [{ pfad: "Belege/2025/Rente/a.txt", hash: "aaa" }],
    staging: [{ name: "Umsatzanzeige - MusterbankB.txt", hash: "zzz", zeichen: 5000 }],
  });
  assert.deepEqual(plan.loeschen, []);
  assert.deepEqual(plan.offen, [{ ort: "Umsatzanzeige - MusterbankB.txt", grund: "Beleg noch nicht abgelegt" }]);
});

test("leerer Textvorlauf wird immer geraeumt, auch ohne Hash-Treffer", () => {
  // Der Extrakt eines Bildscans besteht nur aus Form-Feeds. Er traegt keine
  // Information, findet nie einen Partner und bliebe sonst ewig als
  // vermeintlich offener Punkt liegen.
  const plan = planAufraeumen({
    zwillinge: [],
    staging: [{ name: "2025_MusterversicherungA_Testversicherung_Vertrag_A_Nachtrag_TEST-VERTRAG-001.txt", hash: "leer3", zeichen: 0 }],
  });
  assert.deepEqual(plan.loeschen, [{
    name: "2025_MusterversicherungA_Testversicherung_Vertrag_A_Nachtrag_TEST-VERTRAG-001.txt",
    grund: "leerer Textvorlauf",
  }]);
  assert.deepEqual(plan.offen, []);
});

test("leerer Vorlauf gewinnt gegen einen Hash-Treffer und meldet den einfachen Grund", () => {
  const plan = planAufraeumen({
    zwillinge: [{ pfad: "Belege/2025/Versicherungen/scan.txt", hash: "leer2" }],
    staging: [{ name: "scan.txt", hash: "leer2", zeichen: 0 }],
  });
  assert.deepEqual(plan.loeschen, [{ name: "scan.txt", grund: "leerer Textvorlauf" }]);
});

test("liefert eine stabile, sortierte Reihenfolge", () => {
  const plan = planAufraeumen({
    zwillinge: [],
    staging: [
      { name: "c.txt", hash: "c", zeichen: 5 },
      { name: "a.txt", hash: "a", zeichen: 5 },
      { name: "b.txt", hash: "b", zeichen: 5 },
    ],
  });
  assert.deepEqual(plan.offen.map((eintrag) => eintrag.ort), ["a.txt", "b.txt", "c.txt"]);
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

```bash
node --test tests/belege-text.test.mjs
```

Erwartet: FAIL mit `planAufraeumen is not a function`

- [ ] **Step 3: `planAufraeumen` implementieren**

In `app/tools/belege-text.mjs` unter `planZwillinge` einfügen:

```javascript
export function planAufraeumen({ zwillinge, staging }) {
  const pfadNachHash = new Map();
  for (const zwilling of [...zwillinge].sort(nachPfad)) {
    if (zwilling.hash && !pfadNachHash.has(zwilling.hash)) pfadNachHash.set(zwilling.hash, nfc(zwilling.pfad));
  }

  const loeschen = [];
  const offen = [];

  for (const vorlauf of [...staging].sort((a, b) => a.name.localeCompare(b.name))) {
    if (vorlauf.zeichen === 0) {
      loeschen.push({ name: vorlauf.name, grund: "leerer Textvorlauf" });
      continue;
    }
    const treffer = pfadNachHash.get(vorlauf.hash);
    if (treffer) {
      loeschen.push({ name: vorlauf.name, grund: `Hash-Treffer: ${treffer}` });
      continue;
    }
    offen.push({ ort: vorlauf.name, grund: "Beleg noch nicht abgelegt" });
  }

  return { loeschen, offen };
}
```

- [ ] **Step 4: Test laufen lassen und grünen Lauf bestätigen**

```bash
node --test tests/belege-text.test.mjs
```

Erwartet: PASS, 14 Tests.

- [ ] **Step 5: Committen**

```bash
git add app/tools/belege-text.mjs tests/belege-text.test.mjs
git commit -m "feat(belege): Aufraeumplan ueber den Inhalts-Hash"
```

---

### Task 3: Ausführung, Bericht und npm-Skripte

Verbindet die Planung mit Dateisystem und `pdftotext`. Vorschau ist Standard.

**Files:**
- Modify: `app/tools/belege-text.mjs`
- Modify: `package.json:6-16`

**Interfaces:**
- Consumes: `planZwillinge`, `planAufraeumen`, `MARKER_KOPF` aus Tasks 1–2
- Produces: `istLeer(text) → boolean`, `seitenZahl(text) → number`, `markerText(seiten) → string`; CLI `node app/tools/belege-text.mjs [--schreiben]`

- [ ] **Step 1: Tests für die drei Hilfsfunktionen anhängen**

Import in `tests/belege-text.test.mjs` erweitern:

```javascript
import { planZwillinge, planAufraeumen, istLeer, seitenZahl, markerText, MARKER_KOPF, GELESEN_KOPF } from "../app/tools/belege-text.mjs";
```

Tests anhängen:

```javascript
test("istLeer erkennt einen Bildscan-Extrakt aus reinen Form-Feeds", () => {
  // Der Bestandsfall: die drei MusterversicherungA-Belege liefern exakt "\f\f" bzw "\f\f\f".
  assert.equal(istLeer("\f\f"), true);
  assert.equal(istLeer(""), true);
  assert.equal(istLeer("   \n\n \f "), true);
  assert.equal(istLeer("MusterversicherungA\f"), false);
});

test("seitenZahl zaehlt Form-Feeds — pdftotext setzt einen pro Seite", () => {
  assert.equal(seitenZahl("\f\f"), 2);
  assert.equal(seitenZahl("\f\f\f"), 3);
  assert.equal(seitenZahl("Text ohne Seitenwechsel"), 0);
});

test("markerText schreibt die vereinbarte Kopfzeile", () => {
  assert.equal(markerText(2), "# Kein Textlayer — Bildscan, 2 Seiten. Inhalt nur im PDF.\n");
  assert.ok(markerText(2).startsWith(MARKER_KOPF), "der Marker muss von planZwillinge wiedererkannt werden");
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

```bash
node --test tests/belege-text.test.mjs
```

Erwartet: FAIL mit `istLeer is not a function`

- [ ] **Step 3: Hilfsfunktionen und `main()` implementieren**

Importe an den Kopf von `app/tools/belege-text.mjs` (nach dem Kommentarblock, vor `export const MARKER_KOPF`):

```javascript
import { readFile, writeFile, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

const execFileAsync = promisify(execFile);
```

Ans Ende der Datei anhängen:

```javascript
export function istLeer(text) {
  return text.replace(/\s/g, "").length === 0;
}

export function seitenZahl(text) {
  return (text.match(/\f/g) ?? []).length;
}

export function markerText(seiten) {
  return `${MARKER_KOPF} — Bildscan, ${seiten} Seiten. Inhalt nur im PDF.\n`;
}

const BELEGE = new URL("../Belege/", import.meta.url);
const STAGING = new URL("../data/inbox/standardized/", import.meta.url);

const hashVon = (inhalt) => createHash("sha256").update(inhalt).digest("hex");
const ersteZeile = (text) => text.split("\n", 1)[0];
const urlUnterBelege = (pfad) => new URL(pfad.split("/").slice(1).map(encodeURIComponent).join("/"), BELEGE);

async function dateienUnter(ordner, praefix) {
  const eintraege = await readdir(ordner, { withFileTypes: true });
  const gefunden = [];
  for (const eintrag of eintraege.sort((a, b) => a.name.localeCompare(b.name))) {
    if (eintrag.name.startsWith(".")) continue;
    const pfad = `${praefix}${eintrag.name}`;
    if (eintrag.isDirectory()) {
      gefunden.push(...(await dateienUnter(new URL(`${encodeURIComponent(eintrag.name)}/`, ordner), `${pfad}/`)));
      continue;
    }
    gefunden.push(pfad);
  }
  return gefunden;
}

async function ladeBelege() {
  const pfade = await dateienUnter(BELEGE, "Belege/");
  return Promise.all(pfade.map(async (pfad) => {
    if (!istTxt(pfad)) return { pfad };
    const inhalt = await readFile(urlUnterBelege(pfad));
    return { pfad, hash: hashVon(inhalt), kopf: ersteZeile(inhalt.toString("utf8")) };
  }));
}

async function ladeStaging() {
  let namen;
  try {
    namen = (await readdir(STAGING)).filter((name) => istTxt(name) && !name.startsWith("."));
  } catch {
    return [];
  }
  return Promise.all(namen.sort().map(async (name) => {
    const inhalt = await readFile(new URL(encodeURIComponent(name), STAGING));
    return { name, hash: hashVon(inhalt), zeichen: inhalt.toString("utf8").replace(/\s/g, "").length };
  }));
}

// `pdftotext … -` schreibt nach stdout und liefert dabei exakt dieselben Bytes
// wie die Dateiausgabe. Deshalb kein Temp-File — und der Hash bleibt mit den
// vorhandenen Textvorlaeufen vergleichbar.
async function extrahiere(pdfUrl) {
  const { stdout } = await execFileAsync("pdftotext", ["-layout", fileURLToPath(pdfUrl), "-"], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: "utf8",
  });
  return stdout;
}

async function main() {
  const schreiben = process.argv.slice(2).includes("--schreiben");
  const belege = await ladeBelege();
  const { erzeugen, offen: offeneBelege } = planZwillinge({ belege });

  const bericht = {
    modus: schreiben ? "geschrieben" : "vorschau",
    belege: belege.filter((datei) => istPdf(datei.pfad)).length,
    erzeugt: [],
    geloescht: [],
    offen: [],
    fehler: [],
  };

  // Die neu erzeugten Zwillinge fliessen in die zweite Phase ein, auch in der
  // Vorschau. Sonst zeigte der Vorschaulauf jeden Textvorlauf als offen an und
  // waere fuer die Migration wertlos.
  const neueZwillinge = [];

  for (const auftrag of erzeugen) {
    let text;
    try {
      text = await extrahiere(urlUnterBelege(auftrag.pdf));
    } catch (error) {
      bericht.fehler.push({ ort: auftrag.pdf, grund: error.message });
      continue;
    }
    const bildscan = istLeer(text);
    const inhalt = bildscan ? markerText(seitenZahl(text)) : text;
    if (schreiben) await writeFile(urlUnterBelege(auftrag.ziel), inhalt);
    neueZwillinge.push({ pfad: auftrag.ziel, hash: hashVon(Buffer.from(inhalt, "utf8")) });
    bericht.erzeugt.push({ ort: auftrag.ziel, art: bildscan ? "marker" : "text" });
    if (bildscan) bericht.offen.push({ ort: auftrag.ziel, grund: "OCR ausstehend" });
  }

  const zwillinge = [...belege.filter((datei) => istTxt(datei.pfad)), ...neueZwillinge];
  const { loeschen, offen: offenesStaging } = planAufraeumen({ zwillinge, staging: await ladeStaging() });

  for (const auftrag of loeschen) {
    if (schreiben) await rm(new URL(encodeURIComponent(auftrag.name), STAGING), { force: true });
    bericht.geloescht.push(auftrag);
  }

  bericht.offen.push(...offeneBelege, ...offenesStaging);
  console.log(JSON.stringify(bericht, null, 2));

  if (!schreiben) console.log("\nVorschau — nichts erzeugt, nichts geloescht. Mit --schreiben anwenden.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Test laufen lassen und grünen Lauf bestätigen**

```bash
node --test tests/belege-text.test.mjs
```

Erwartet: PASS, 17 Tests.

- [ ] **Step 5: npm-Skripte ergänzen**

In `package.json` nach der Zeile `"inbox:schreiben": ...` einfügen:

```json
    "belege:text": "node app/tools/belege-text.mjs",
    "belege:text:schreiben": "node app/tools/belege-text.mjs --schreiben",
```

- [ ] **Step 6: Vorschaulauf gegen den echten Bestand — nichts darf sich ändern**

```bash
npm run belege:text
```

Erwartet im JSON: `"modus": "vorschau"`, `belege: 84`, 84 Einträge unter `erzeugt` (davon 3 mit `"art": "marker"`), 84 Einträge unter `geloescht`, 2 Einträge unter `offen` mit `"Beleg noch nicht abgelegt"` plus 3 mit `"OCR ausstehend"`, `fehler: []`.

Danach prüfen, dass die Vorschau wirklich nichts angefasst hat:

```bash
ls app/data/inbox/standardized/*.txt | wc -l && find app/Belege -name "*.txt" | wc -l
```

Erwartet: `86` und `0`.

- [ ] **Step 7: Gesamte Testsuite laufen lassen**

```bash
npm test
```

Erwartet: PASS, keine Regression in den bestehenden Tests.

- [ ] **Step 8: Committen**

```bash
git add app/tools/belege-text.mjs tests/belege-text.test.mjs package.json
git commit -m "feat(belege): belege-text.mjs mit Vorschau und Bericht"
```

---

### Task 4: Dokumentation

Die Invariante und der neue Handgriff müssen dort stehen, wo der Agent sie liest.

**Files:**
- Modify: `app/tools/inbox.mjs:1-11`, `app/tools/inbox.mjs:112`
- Modify: `app/docs/agent-context.md:213-215`, `app/docs/agent-context.md:330-333`
- Modify: `app/docs/skills/import-agent.md:119-121`, `app/docs/skills/import-agent.md:154`, `app/docs/skills/import-agent.md:168-170`
- Modify: `app/docs/skills/vorsorge-erfassung-agent.md:53-60`
- Modify: `app/docs/skills/stammdaten-erfassung-agent.md:90`

**Interfaces:**
- Consumes: das CLI aus Task 3
- Produces: nichts für spätere Tasks

- [ ] **Step 1: Kopfkommentar von `inbox.mjs` präzisieren**

In `app/tools/inbox.mjs` den Absatz in Zeilen 7–11 ersetzen:

```javascript
// Bewusste Grenze: PDFs werden NICHT automatisch in Buchungen zerlegt. Sie
// bekommen einen deterministischen Textvorlauf (pdftotext -layout) nach
// `data/inbox/standardized/`; die Zeilenextraktion bleibt Agentenarbeit
// (ADR 0005). Der Gewinn ist trotzdem gross: der Agent liest Text statt
// PDF-Binaer, wiederholbar und pruefbar.
//
// `standardized/` ist Durchgangsstation, kein Archiv. Der dauerhafte
// Textzwilling entsteht neben dem Beleg unter `Belege/` — siehe
// `belege-text.mjs`, das den Vorlauf danach wieder abraeumt.
```

- [ ] **Step 2: Berichts-`hinweis` in `inbox.mjs` ergänzen**

In `app/tools/inbox.mjs:112` den `hinweis` ersetzen:

```javascript
      bericht.laeufe.push({ datei: auftrag.datei, art: "pdf-text", ziel: `data/inbox/standardized/${zielName}`, hinweis: "Zeilenextraktion durch den Agenten; Textzwilling danach ueber belege-text.mjs" });
```

- [ ] **Step 3: `agent-context.md` — PDF-Notiz und Abschnitt „Belege"**

Zeilen 213–215 ersetzen:

```markdown
PDFs werden **nicht** automatisch in Buchungen zerlegt. `inbox.mjs` legt einen
deterministischen Textvorlauf (`pdftotext -layout`) nach
`data/inbox/standardized/` ab; die Zeilenextraktion bleibt Agentenarbeit.
`standardized/` ist dabei Durchgangsstation, kein Archiv — der dauerhafte
Textzwilling entsteht neben dem Beleg, siehe Abschnitt „Belege".
```

Abschnitt „Belege" (Zeilen 330–333) ersetzen:

```markdown
## Belege

Belege werden sprechend benannt und unter `Belege/` abgelegt. Datenfelder wie
`rohquelle` und `quelle_hinweis` zeigen auf den finalen App-relativen Belegpfad.

Jedes PDF unter `Belege/` hat einen **Textzwilling**: gleicher Ordner, gleicher
Basisname, Endung `.txt`. Der Zwilling macht das Archiv durchsuchbar, ohne PDFs
zu oeffnen. Er ist rohes `pdftotext -layout`-Ergebnis, wird nie von Hand
gepflegt und ist jederzeit aus dem Beleg wiederherstellbar. `tools/belege-text.mjs`
erzeugt fehlende Zwillinge und raeumt danach `data/inbox/standardized/` ab
(`npm run belege:text` fuer die Vorschau, `belege:text:schreiben` zum Anwenden).
CSVs unter `Belege/` bekommen keinen Zwilling, sie sind bereits Text.

Ein Zwilling ist nie stumm leer. Hat ein PDF keine Textebene, traegt sein
Zwilling die Kopfzeile `# Kein Textlayer — Bildscan, <N> Seiten. Inhalt nur im
PDF.` und erscheint bei jedem Lauf als „OCR ausstehend". Ein leerer Zwilling
waere schlimmer als gar keiner: Die Suche faende nichts, und ein fehlender
Treffer ist von „das Dokument existiert nicht" nicht zu unterscheiden.

Bildscans liest der **Agent beim Import** — er sieht das Dokument dort ohnehin
an, um Kategorie und Namen zu bestimmen. Er schreibt den Zwilling dann selbst,
mit der Kopfzeile `# Vom Agenten aus dem Bildscan gelesen, <JJJJ-MM-TT>.`,
damit die Herkunft in der Datei ablesbar bleibt. Normale Zwillinge tragen
**keine** Kopfzeile: Sie muessen byte-identisch zum Textvorlauf bleiben, sonst
findet das Aufraeumen sie nicht wieder.
```

- [ ] **Step 4: `import-agent.md` anpassen**

Zeilen 119–121 ersetzen:

```markdown
- **PDFs.** `inbox.mjs` legt nur den Textvorlauf (`pdftotext -layout`) nach
  `data/inbox/standardized/` ab. Die Zeilenextraktion bleibt deine Arbeit — aber
  auf Text statt auf PDF-Binaer. Ist der Vorlauf **leer**, ist das Dokument ein
  Bildscan: dann die PDF-Seiten selbst lesen (siehe Schritt 9).
```

Schritt 9 (Zeile 154) ersetzen:

```markdown
9. **Beleg sprechend umbenennen und ablegen** (siehe Abschnitt unten): Rohbeleg in `Belege/` einsortieren, **niemals** den Scan-/Mail-Originalnamen behalten. Danach `npm run belege:text:schreiben` — das legt den Textzwilling neben den Beleg und raeumt den Vorlauf in `standardized/` ab. War der Vorlauf leer (Bildscan), schreibst du den Zwilling selbst: `<Belegname>.txt` neben das PDF, erste Zeile `# Vom Agenten aus dem Bildscan gelesen, <JJJJ-MM-TT>.`, darunter der gelesene Text. Zwischen-JSONL verwerfen. Bei Fehler: nach `data/inbox/error/` plus strukturierte Begleitdatei.
```

Am Ende des Abschnitts „Belege benennen und ablegen" (nach Zeile 170) anhängen:

```markdown
Zu jedem abgelegten PDF gehoert ein **Textzwilling** mit gleichem Basisname und
Endung `.txt` im selben Ordner. `npm run belege:text` zeigt die Vorschau,
`npm run belege:text:schreiben` wendet sie an. Der Lauf ist idempotent und
ueberschreibt nie einen vorhandenen Zwilling.
```

In der Tabelle in Zeile 210 die Zeile zu `data/inbox/standardized/` ersetzen:

```markdown
| `data/inbox/standardized/` | Normalisierte Zwischenform, Durchgangsstation |
```

- [ ] **Step 5: `vorsorge-erfassung-agent.md` anpassen**

Zeilen 53–60 ersetzen:

```markdown
   Liegen die PDFs in `data/inbox/`, zuerst **einmal** `npm run inbox:schreiben`
   fahren: der Lauf legt zu jedem PDF einen Textvorlauf (`pdftotext -layout`)
   unter `data/inbox/standardized/<name>.txt` ab. Danach den **Text** lesen statt
   des PDF-Binaers — bei einem Stapel Policen ist das der Unterschied zwischen
   einer Sitzung und mehreren. Der Lauf schreibt dabei **keine** Vorsorgedaten;
   er zerlegt nichts und deutet nichts. Bleibt eine Zahl im Text unklar oder
   zweideutig (Tabellen, Fussnoten, schlechter Scan), das Original-PDF oeffnen —
   der Textvorlauf ist eine Lesehilfe, kein Ersatz fuer den Beleg.

   Ist der Vorlauf **leer**, hat das PDF keine Textebene. Dann die Seiten des
   PDF selbst lesen und beim Ablegen den Textzwilling von Hand schreiben, erste
   Zeile `# Vom Agenten aus dem Bildscan gelesen, <JJJJ-MM-TT>.`

   Nach dem Ablegen des Belegs `npm run belege:text:schreiben` fahren: Das legt
   den Textzwilling neben den Beleg und raeumt `standardized/` ab.
```

- [ ] **Step 6: `stammdaten-erfassung-agent.md` anpassen**

Zeile 90 ersetzen:

```markdown
Ablage in `Belege/`: Kontoauszuege unter `Belege/Kontoauszuege/<Konto>/`; sonstige Belege nach bestehender `Belege/<Jahr>/<Kategorie>`-Struktur. `quelle_hinweis`/`rohquelle` zeigen auf den finalen Beleg-Pfad.

Nach dem Ablegen `npm run belege:text:schreiben` fahren — jedes PDF unter
`Belege/` braucht seinen Textzwilling. Hat der Beleg keine Textebene (leerer
Textvorlauf), die Seiten selbst lesen und den Zwilling von Hand schreiben,
erste Zeile `# Vom Agenten aus dem Bildscan gelesen, <JJJJ-MM-TT>.`
```

- [ ] **Step 7: Doku-Test laufen lassen**

```bash
npm test
```

Erwartet: PASS. `tests/agent-docs.test.mjs` prüft, dass die App-Doku nicht auf `CONTEXT.md`, `docs/adr`, `docs/superpowers`, „Repo-Root" oder „Projektroot" verweist — die neuen Absätze tun das nicht.

- [ ] **Step 8: Committen**

```bash
git add app/tools/inbox.mjs app/docs/agent-context.md app/docs/skills/import-agent.md app/docs/skills/vorsorge-erfassung-agent.md app/docs/skills/stammdaten-erfassung-agent.md
git commit -m "docs: Textzwilling der Belege in Agentendoku verankern"
```

---

### Task 5: Migration des Bestands

Der erste schreibende Lauf. Er berührt nur gitignorierte Dateien, es entsteht kein Commit.

**Files:**
- Keine Quelldateien. Wirkt auf `app/Belege/` und `app/data/inbox/standardized/`.

**Interfaces:**
- Consumes: das CLI aus Task 3
- Produces: 84 Zwillinge unter `Belege/`, davon 3 Marker

- [ ] **Step 1: Ausgangszustand festhalten**

```bash
find app/Belege -name "*.pdf" | wc -l && find app/Belege -name "*.txt" | wc -l && ls app/data/inbox/standardized/*.txt | wc -l
```

Erwartet: `84`, `0`, `86`

- [ ] **Step 2: Vorschau lesen und gegen die Erwartung prüfen**

```bash
npm run belege:text
```

Erwartet: 84 unter `erzeugt` (81 mit `"art": "text"`, 3 mit `"art": "marker"`), 84 unter `geloescht`, `fehler: []`. Unter `offen` genau 5 Einträge: 3× `"OCR ausstehend"` für die MusterversicherungA-Belege, 2× `"Beleg noch nicht abgelegt"` für `Kontoauszug.txt` und `Umsatzanzeige - MusterbankB.txt`.

Weicht etwas ab, **nicht schreiben**, sondern die Abweichung klären.

- [ ] **Step 3: Migration anwenden**

```bash
npm run belege:text:schreiben
```

- [ ] **Step 4: Endzustand verifizieren**

```bash
find app/Belege -name "*.pdf" | wc -l && find app/Belege -name "*.txt" | wc -l && ls app/data/inbox/standardized/*.txt | wc -l
```

Erwartet: `84`, `84`, `2`

Stichprobe, dass ein Zwilling wirklich Inhalt trägt und die Suche greift:

```bash
grep -rl "Rentenauskunft" app/Belege --include="*.txt" | head -3
```

Erwartet: mindestens `app/Belege/2026/Rente/2026_DRV-Bund_Altersrente_Rentenauskunft_12-345678-A-000.txt`

- [ ] **Step 5: Idempotenz nachweisen**

```bash
npm run belege:text:schreiben
```

Erwartet: `erzeugt: []`, `geloescht: []`, `offen` weiterhin mit den 3 `"OCR ausstehend"` und 2 `"Beleg noch nicht abgelegt"`. Nichts wird doppelt erzeugt, nichts überschrieben.

- [ ] **Step 6: Bestätigen, dass nichts Gitrelevantes entstanden ist**

```bash
git status --short
```

Erwartet: leer. `app/Belege` und `app/data` sind gitignored.

---

### Task 6: Die drei Bildscans lesen

Ersetzt die Marker durch gelesenen Text. Einmalige Nacharbeit für Belege, die vor Einführung des Ablaufs abgelegt wurden.

**Files:**
- Create: `app/Belege/2025/Versicherungen/2025_MusterversicherungA_Testversicherung_Vertrag_A_Beitragsanpassung_TEST-VERTRAG-001.txt`
- Create: `app/Belege/2025/Versicherungen/2025_MusterversicherungA_Testversicherung_Vertrag_A_Beitragsrechnung_TEST-VERTRAG-001.txt`
- Create: `app/Belege/2025/Versicherungen/2025_MusterversicherungA_Testversicherung_Vertrag_A_Nachtrag_TEST-VERTRAG-001.txt`

**Interfaces:**
- Consumes: die Marker-Zwillinge aus Task 5
- Produces: nichts für spätere Tasks

- [ ] **Step 1: Offene Punkte auflisten lassen**

```bash
npm run belege:text
```

Erwartet: 3 Einträge `"OCR ausstehend"` mit den Pfaden der drei MusterversicherungA-Zwillinge.

- [ ] **Step 2: Das erste PDF lesen und den Zwilling schreiben**

PDF `app/Belege/2025/Versicherungen/2025_MusterversicherungA_Testversicherung_Vertrag_A_Beitragsanpassung_TEST-VERTRAG-001.pdf` seitenweise lesen (2 Seiten). Den Marker-Zwilling überschreiben mit:

```
# Vom Agenten aus dem Bildscan gelesen, <heutiges Datum JJJJ-MM-TT>.

<gelesener Text, Seite fuer Seite, Tabellen als Text belassen>
```

Nichts deuten und nichts zusammenfassen — der Zwilling gibt wieder, was auf den Seiten steht. Bei unleserlichen Stellen `[unleserlich]` schreiben statt zu raten.

- [ ] **Step 3: Das zweite PDF lesen und den Zwilling schreiben**

Gleiches Vorgehen für `2025_MusterversicherungA_Testversicherung_Vertrag_A_Beitragsrechnung_TEST-VERTRAG-001.pdf` (2 Seiten).

- [ ] **Step 4: Das dritte PDF lesen und den Zwilling schreiben**

Gleiches Vorgehen für `2025_MusterversicherungA_Testversicherung_Vertrag_A_Nachtrag_TEST-VERTRAG-001.pdf` (3 Seiten).

- [ ] **Step 5: Restliste verifizieren**

```bash
npm run belege:text
```

Erwartet: kein Eintrag mehr mit `"OCR ausstehend"`. Unter `offen` bleiben nur die 2 nicht abgelegten Textvorläufe.

Und gegenprüfen, dass die Belege jetzt durchsuchbar sind:

```bash
grep -rl "MusterversicherungA" app/Belege/2025/Versicherungen --include="*Kinder*.txt" | wc -l
```

Erwartet: `3`

- [ ] **Step 6: Bestätigen, dass nichts Gitrelevantes entstanden ist**

```bash
git status --short
```

Erwartet: leer.

---

## Abnahme

Nach Task 6 gilt der Plan als erfüllt, wenn:

- `npm test` grün ist,
- `find app/Belege -name "*.pdf" | wc -l` und `find app/Belege -name "*.txt" | wc -l` beide `84` liefern,
- `ls app/data/inbox/standardized/*.txt | wc -l` genau `2` liefert,
- `npm run belege:text` keinen Eintrag `"OCR ausstehend"` und `fehler: []` zeigt,
- ein zweiter `npm run belege:text:schreiben` nichts mehr erzeugt oder löscht.

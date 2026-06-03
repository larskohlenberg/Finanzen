# M4 Nachvollziehbare Prognose + Regelzahlungs-View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Cashflow-Prognose vollständig nachvollziehbar machen — eine Liste aller Regelzahlungen (Eingangsdaten), eine aufklappbare Prognose-Tabelle (Herleitung) und ein Filter für Granularität (Monat/Quartal/Jahr) und Zukunfts-Horizont (Bis-Datum).

**Architecture:** Reine, getestete Mathematik in `app/cashflow.mjs` (kein DOM, in Node testbar); Darstellung über String-Rendering in `app/main.js`; Texte in `app/i18n.js`. Vorgehen je Funktion: failing test → minimale Implementierung → grün → commit. UI wird im Browser verifiziert.

**Tech Stack:** Vanilla ES-Module, `node:test` + `assert/strict`, kein Build-Schritt. Beträge als Integer-Cents.

**Spec:** `docs/superpowers/specs/2026-06-03-m4-prognose-nachvollziehbarkeit-design.md`

---

## File Structure

- **Modify** `app/cashflow.mjs` — neue pure Funktionen `periodenSchluessel` und `computeCashflowPrognoseDetail`. Bestehende Funktionen bleiben unverändert.
- **Modify** `tests/m4-cashflow.test.mjs` — neue Tests für die beiden Funktionen.
- **Modify** `app/i18n.js` — neue Keys (`nav.regelzahlungen`, `regelzahlungen.*`, `rhythmus.*`, Erweiterungen `cashflow.*`) in DE und EN.
- **Modify** `app/main.js` — neuer Nav-Punkt + Routing, `renderRegelzahlungen()`, `formatRhythmus()`, Filter-State, aufklappbare Prognose-Tabelle, Event-Handler.
- **Modify** `app/styles.css` — wenige Regeln für Aufklapp-Zeilen und Filter-Leiste.

---

## Task 1: `periodenSchluessel` (Granularitäts-Schlüssel)

**Files:**
- Modify: `app/cashflow.mjs` (neue Export-Funktion, nach `defaultHorizonEnd`)
- Test: `tests/m4-cashflow.test.mjs`

- [ ] **Step 1: Failing test schreiben**

In `tests/m4-cashflow.test.mjs` den Import erweitern und Tests anhängen:

```js
// Import-Zeile oben ergänzen um periodenSchluessel:
import { addInterval, occurrences, computeCashflowIst, computeCashflowPrognose, computeCashflowPrognoseDetail, periodenSchluessel, defaultHorizonEnd, localTodayIso } from "../app/cashflow.mjs";
```

```js
test("periodenSchluessel: Monat liefert den Monat unverändert", () => {
  assert.equal(periodenSchluessel("2026-08", "monat"), "2026-08");
});

test("periodenSchluessel: feste Kalenderquartale", () => {
  assert.equal(periodenSchluessel("2026-01", "quartal"), "2026-Q1");
  assert.equal(periodenSchluessel("2026-03", "quartal"), "2026-Q1");
  assert.equal(periodenSchluessel("2026-04", "quartal"), "2026-Q2");
  assert.equal(periodenSchluessel("2026-07", "quartal"), "2026-Q3");
  assert.equal(periodenSchluessel("2026-10", "quartal"), "2026-Q4");
  assert.equal(periodenSchluessel("2026-12", "quartal"), "2026-Q4");
});

test("periodenSchluessel: Jahr liefert das Jahr", () => {
  assert.equal(periodenSchluessel("2026-08", "jahr"), "2026");
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `node --test tests/m4-cashflow.test.mjs`
Expected: FAIL — `periodenSchluessel is not a function` / `is not exported`.

- [ ] **Step 3: Minimale Implementierung**

In `app/cashflow.mjs` direkt nach `defaultHorizonEnd` (vor `computeCashflowPrognose`) einfügen:

```js
export function periodenSchluessel(monat, granularitaet) {
  const [jahr, mm] = monat.split("-");
  if (granularitaet === "jahr") return jahr;
  if (granularitaet === "quartal") {
    const quartal = Math.floor((Number(mm) - 1) / 3) + 1;
    return `${jahr}-Q${quartal}`;
  }
  return monat;
}
```

- [ ] **Step 4: Test ausführen, grün bestätigen**

Run: `node --test tests/m4-cashflow.test.mjs`
Expected: PASS für die drei neuen Tests (bestehende bleiben grün).

- [ ] **Step 5: Commit**

```bash
git add app/cashflow.mjs tests/m4-cashflow.test.mjs
git commit -m "feat(m4): periodenSchluessel für Monat/Quartal/Jahr"
```

---

## Task 2: `computeCashflowPrognoseDetail` (hierarchische Prognose mit Einzelposten)

**Files:**
- Modify: `app/cashflow.mjs` (neue Export-Funktion, nach `computeCashflowPrognose`)
- Test: `tests/m4-cashflow.test.mjs`

- [ ] **Step 1: Failing tests schreiben**

In `tests/m4-cashflow.test.mjs` anhängen. (Der Import wurde in Task 1 bereits um `computeCashflowPrognoseDetail` erweitert.)

```js
const detailRegeln = [
  { regelzahlung_id: "RZ-001", bezeichnung: "Gehalt", betrag: "3500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-30", status: "bestaetigt" },
  { regelzahlung_id: "RZ-002", bezeichnung: "Miete", betrag: "-1200.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt" },
  { regelzahlung_id: "RZ-003", bezeichnung: "Vorschlag", betrag: "-30.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "vorgeschlagen" },
];

test("computeCashflowPrognoseDetail: Monat behält Einzelposten je Monat", () => {
  const res = computeCashflowPrognoseDetail(detailRegeln, { today: "2026-06-15", horizonEnd: "2026-07-31", granularitaet: "monat" });
  // Fällig nach heute bis Horizont: Gehalt 2026-06-30, 2026-07-30; Miete 2026-07-01
  const juli = res.perioden.find((p) => p.periode === "2026-07");
  assert.ok(juli, "Juli-Periode vorhanden");
  assert.equal(juli.monate.length, 1);
  const juliMonat = juli.monate[0];
  assert.equal(juliMonat.monat, "2026-07");
  const bezeichnungen = juliMonat.posten.map((p) => p.bezeichnung).sort();
  assert.deepEqual(bezeichnungen, ["Gehalt", "Miete"]);
  assert.equal(juliMonat.netto_cents, 350000 + -120000);
});

test("computeCashflowPrognoseDetail: Summen-Konsistenz Posten=Monat=Periode=Gesamt", () => {
  const res = computeCashflowPrognoseDetail(detailRegeln, { today: "2026-06-15", horizonEnd: "2026-09-30", granularitaet: "quartal" });
  let gesamtAusPosten = 0;
  for (const periode of res.perioden) {
    let periodeSumme = 0;
    for (const monat of periode.monate) {
      const monatAusPosten = monat.posten.reduce((s, p) => s + p.betrag_cents, 0);
      assert.equal(monat.netto_cents, monatAusPosten, `Monat ${monat.monat}`);
      periodeSumme += monat.netto_cents;
    }
    assert.equal(periode.netto_cents, periodeSumme, `Periode ${periode.periode}`);
    gesamtAusPosten += periode.netto_cents;
  }
  assert.equal(res.gesamt_netto_cents, gesamtAusPosten);
});

test("computeCashflowPrognoseDetail: Vorschläge ausgeschlossen, Qualität gezählt", () => {
  const res = computeCashflowPrognoseDetail(detailRegeln, { today: "2026-06-15", horizonEnd: "2026-07-31", granularitaet: "monat" });
  assert.equal(res.qualitaet.bestaetigte_regelzahlungen, 2);
  assert.equal(res.qualitaet.vorschlaege_nicht_enthalten, 1);
  for (const periode of res.perioden) {
    for (const monat of periode.monate) {
      assert.ok(!monat.posten.some((p) => p.bezeichnung === "Vorschlag"));
    }
  }
});

test("computeCashflowPrognoseDetail: Bis-Datum begrenzt Fälligkeiten", () => {
  const res = computeCashflowPrognoseDetail(detailRegeln, { today: "2026-06-15", horizonEnd: "2026-06-30", granularitaet: "monat" });
  const alleDaten = res.perioden.flatMap((p) => p.monate.flatMap((m) => m.posten.map((x) => x.datum)));
  assert.ok(alleDaten.every((d) => d <= "2026-06-30"));
  assert.equal(res.horizont_ende, "2026-06-30");
});

test("computeCashflowPrognoseDetail: ist_laufend markiert heutiges Quartal und heutigen Monat", () => {
  const res = computeCashflowPrognoseDetail(detailRegeln, { today: "2026-06-15", horizonEnd: "2026-09-30", granularitaet: "quartal" });
  const q2 = res.perioden.find((p) => p.periode === "2026-Q2");
  const q3 = res.perioden.find((p) => p.periode === "2026-Q3");
  assert.equal(q2?.ist_laufend, true, "Q2 enthält heute");
  assert.equal(q3?.ist_laufend, false, "Q3 ist Zukunft");
  const juni = q2.monate.find((m) => m.monat === "2026-06");
  assert.equal(juni?.ist_laufend, true);
});

test("computeCashflowPrognoseDetail: Granularität monat hat genau einen Monat je Periode", () => {
  const res = computeCashflowPrognoseDetail(detailRegeln, { today: "2026-06-15", horizonEnd: "2026-12-31", granularitaet: "monat" });
  for (const periode of res.perioden) {
    assert.equal(periode.monate.length, 1);
    assert.equal(periode.periode, periode.monate[0].monat);
  }
});
```

- [ ] **Step 2: Tests ausführen, Fehlschlag bestätigen**

Run: `node --test tests/m4-cashflow.test.mjs`
Expected: FAIL — `computeCashflowPrognoseDetail is not a function`.

- [ ] **Step 3: Implementierung**

In `app/cashflow.mjs` direkt nach `computeCashflowPrognose` einfügen:

```js
export function computeCashflowPrognoseDetail(regelzahlungen, { today, horizonEnd, granularitaet = "monat" }) {
  const ende = horizonEnd ?? defaultHorizonEnd(regelzahlungen, today);
  const heuteMonat = monatVon(today);
  const heutePeriode = periodenSchluessel(heuteMonat, granularitaet);

  const monateMap = new Map(); // monat -> { posten: [], netto_cents }
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
      if (!monateMap.has(monat)) monateMap.set(monat, { posten: [], netto_cents: 0 });
      const eintrag = monateMap.get(monat);
      eintrag.posten.push({ datum, bezeichnung: rz.bezeichnung, regelzahlung_id: rz.regelzahlung_id, betrag_cents: betrag });
      eintrag.netto_cents += betrag;
    }
  }

  const periodenMap = new Map(); // periodenkey -> Map(monat -> eintrag)
  for (const [monat, eintrag] of monateMap) {
    const key = periodenSchluessel(monat, granularitaet);
    if (!periodenMap.has(key)) periodenMap.set(key, new Map());
    periodenMap.get(key).set(monat, eintrag);
  }

  const perioden = [...periodenMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([periode, monMap]) => {
      const monate = [...monMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([monat, eintrag]) => ({
          monat,
          netto_cents: eintrag.netto_cents,
          ist_laufend: monat === heuteMonat,
          posten: [...eintrag.posten].sort((x, y) => x.datum.localeCompare(y.datum)),
        }));
      return {
        periode,
        netto_cents: monate.reduce((s, m) => s + m.netto_cents, 0),
        ist_laufend: periode === heutePeriode,
        monate,
      };
    });

  return {
    perioden,
    gesamt_netto_cents: perioden.reduce((s, p) => s + p.netto_cents, 0),
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
Expected: PASS für alle neuen Tests; bestehende Tests bleiben grün.

- [ ] **Step 5: Vollständige Test-Suite laufen lassen**

Run: `node --test`
Expected: alle Tests grün.

- [ ] **Step 6: Commit**

```bash
git add app/cashflow.mjs tests/m4-cashflow.test.mjs
git commit -m "feat(m4): computeCashflowPrognoseDetail mit Einzelposten und ist_laufend"
```

---

## Task 3: i18n-Keys (DE + EN)

**Files:**
- Modify: `app/i18n.js`

Keine Tests (reine Datenstrings); Validierung erfolgt im Browser in Task 6.

- [ ] **Step 1: DE — Nav-Label ergänzen**

In `app/i18n.js`, im DE-Block `nav: { … }` (nach `cashflow: "Cashflow",`) ergänzen:

```js
      regelzahlungen: "Regelzahlungen",
```

- [ ] **Step 2: DE — `cashflow`-Block erweitern**

Im DE-`cashflow`-Block, vor der schließenden `},` (nach `empty: …`) ergänzen:

```js
      period: "Zeitraum",
      forecastUntil: "Prognose bis",
      running: "laufend",
      runningNote: "Nur noch erwartete Fälligkeiten — bereits Gebuchtes siehe Ist.",
      gran: { monat: "Monat", quartal: "Quartal", jahr: "Jahr" },
```

- [ ] **Step 3: DE — neue Blöcke `regelzahlungen` und `rhythmus`**

In `app/i18n.js` im DE-Block direkt nach dem `cashflow: { … },`-Block einfügen:

```js
    regelzahlungen: {
      title: "Regelzahlungen",
      lead: "Wiederkehrende Zahlungen, die in die Cashflow-Prognose einfließen.",
      bezeichnung: "Bezeichnung",
      rhythmus: "Rhythmus",
      anker: "Erste Fälligkeit",
      aktivBis: "Gültig bis",
      empty: "Keine Regelzahlungen erfasst.",
    },
    rhythmus: {
      tag: { eins: "täglich", mehr: "alle {n} Tage" },
      woche: { eins: "wöchentlich", mehr: "alle {n} Wochen" },
      monat: { eins: "monatlich", mehr: "alle {n} Monate" },
      jahr: { eins: "jährlich", mehr: "alle {n} Jahre" },
    },
```

- [ ] **Step 4: EN — Nav-Label ergänzen**

Im EN-Block `nav: { … }` (nach `cashflow: "Cash flow",`) ergänzen:

```js
      regelzahlungen: "Recurring payments",
```

- [ ] **Step 5: EN — `cashflow`-Block erweitern**

Im EN-`cashflow`-Block, vor der schließenden `},` (nach `empty: …`) ergänzen:

```js
      period: "Period",
      forecastUntil: "Forecast until",
      running: "current",
      runningNote: "Only payments still expected — already booked items appear in Actuals.",
      gran: { monat: "Month", quartal: "Quarter", jahr: "Year" },
```

- [ ] **Step 6: EN — neue Blöcke `regelzahlungen` und `rhythmus`**

Im EN-Block direkt nach dem `cashflow: { … },`-Block einfügen:

```js
    regelzahlungen: {
      title: "Recurring payments",
      lead: "Recurring payments that feed the cash flow forecast.",
      bezeichnung: "Name",
      rhythmus: "Frequency",
      anker: "First due date",
      aktivBis: "Valid until",
      empty: "No recurring payments recorded.",
    },
    rhythmus: {
      tag: { eins: "daily", mehr: "every {n} days" },
      woche: { eins: "weekly", mehr: "every {n} weeks" },
      monat: { eins: "monthly", mehr: "every {n} months" },
      jahr: { eins: "yearly", mehr: "every {n} years" },
    },
```

- [ ] **Step 7: Syntax prüfen**

Run: `node --check app/i18n.js && echo "syntax ok"`
Expected: `syntax ok` (`node --check` prüft nur die Syntax; die Datei setzt `window.FINANCE_I18N`, daher kein Ausführen).

- [ ] **Step 8: Commit**

```bash
git add app/i18n.js
git commit -m "feat(m4): i18n-Keys für Regelzahlungen, Granularität und Prognose-Filter"
```

---

## Task 4: Regelzahlungs-View (Nav-Punkt + Tabelle)

**Files:**
- Modify: `app/main.js`

- [ ] **Step 1: Import erweitern**

In `app/main.js` Zeile 1 ersetzen:

```js
import { computeCashflowIst, computeCashflowPrognose, localTodayIso } from "./cashflow.mjs";
```

durch:

```js
import { computeCashflowIst, computeCashflowPrognoseDetail, defaultHorizonEnd, toCents, localTodayIso } from "./cashflow.mjs";
```

(`computeCashflowPrognose` wird in `main.js` nicht mehr gebraucht — bleibt in `cashflow.mjs` exportiert für die Tests.)

- [ ] **Step 2: Nav-Eintrag ergänzen**

In `navItems` (ca. Zeile 12-19) nach der `cashflow`-Zeile einfügen:

```js
  ["regelzahlungen", "nav.regelzahlungen", "↻"],
```

- [ ] **Step 3: Routing ergänzen**

In `renderView()` (ca. Zeile 196) nach der `cashflow`-Zeile einfügen:

```js
  if (state.view === "regelzahlungen") return renderRegelzahlungen();
```

- [ ] **Step 4: `formatRhythmus` und `renderRegelzahlungen` hinzufügen**

In `app/main.js` direkt vor `function renderMasterdata()` (ca. Zeile 585) einfügen:

```js
function formatRhythmus(einheit, intervall) {
  const key = intervall === 1 ? "eins" : "mehr";
  return t(`rhythmus.${einheit}.${key}`).replace("{n}", String(intervall));
}

function renderRegelzahlungen() {
  const rows = data.regelzahlungen.map((rz) => `
    <tr>
      <td>${escapeHtml(rz.bezeichnung)}</td>
      <td class="amount">${escapeHtml(formatMoney(toCents(rz.betrag)))}</td>
      <td>${escapeHtml(formatRhythmus(rz.rhythmus_einheit, rz.rhythmus_intervall))}</td>
      <td>${escapeHtml(formatDate(rz.anker_datum))}</td>
      <td>${rz.aktiv_bis ? escapeHtml(formatDate(rz.aktiv_bis)) : `<span class="chip neutral">${escapeHtml(t("cashflow.qualityOpenEnded"))}</span>`}</td>
      <td>${statusChip(rz.status)}</td>
    </tr>
  `).join("");
  return `
    ${renderPageHead(t("regelzahlungen.title"), t("regelzahlungen.lead"))}
    <section class="panel panel-pad" style="margin-top: 16px;">
      ${data.regelzahlungen.length ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(t("regelzahlungen.bezeichnung"))}</th>
              <th class="amount">${escapeHtml(t("cashflow.net"))}</th>
              <th>${escapeHtml(t("regelzahlungen.rhythmus"))}</th>
              <th>${escapeHtml(t("regelzahlungen.anker"))}</th>
              <th>${escapeHtml(t("regelzahlungen.aktivBis"))}</th>
              <th>${escapeHtml(t("labels.status"))}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : `<p class="muted">${escapeHtml(t("regelzahlungen.empty"))}</p>`}
    </section>
  `;
}
```

- [ ] **Step 5: Im Browser verifizieren (Server muss laufen)**

Falls noch kein Server läuft: `python3 -m http.server 8000 --directory app` (Hintergrund) und `http://localhost:8000` öffnen.
Prüfen: Nav-Punkt „Regelzahlungen" erscheint; Klick zeigt die Tabelle mit Bezeichnung, Betrag, Rhythmus (z. B. „monatlich"), erste Fälligkeit, Gültig bis (Datum oder „unbefristet"-Chip) und Status-Chip. Demo-Daten in `app/review-data.js` enthalten RZ-001..003.

- [ ] **Step 6: Commit**

```bash
git add app/main.js
git commit -m "feat(m4): Regelzahlungs-View mit Nav-Punkt und Übersichtstabelle"
```

---

## Task 5: Prognose-Filter + aufklappbare Detail-Tabelle

**Files:**
- Modify: `app/main.js`
- Modify: `app/styles.css`

- [ ] **Step 1: Filter-State ergänzen**

Im `state`-Objekt (ca. Zeile 21-36), nach `masterSection: "konten",` einfügen:

```js
  cashflow: {
    granularitaet: "monat",
    bisDatum: defaultHorizonEnd(data.regelzahlungen, localTodayIso()),
  },
  cashflowExpanded: new Set(),
```

- [ ] **Step 2: `renderCashflow` auf Detail umstellen**

Die bestehende Funktion `renderCashflow()` (ca. Zeile 544-583) vollständig ersetzen durch:

```js
function renderCashflow() {
  const today = heuteIso();
  const ist = computeCashflowIst(data.transaktionen, { today });
  const prognose = computeCashflowPrognoseDetail(data.regelzahlungen, {
    today,
    horizonEnd: state.cashflow.bisDatum,
    granularitaet: state.cashflow.granularitaet,
  });
  const istChipClass = ist.qualitaet.offene_kategorie_anzahl > 0 ? "review" : "success";
  const istChipIcon = ist.qualitaet.offene_kategorie_anzahl > 0 ? "?" : "✓";
  const vorschlaegeChip = prognose.qualitaet.vorschlaege_nicht_enthalten > 0
    ? `<span class="chip review">? ${escapeHtml(String(prognose.qualitaet.vorschlaege_nicht_enthalten))} ${escapeHtml(t("cashflow.qualityProposalsExcluded"))}</span>`
    : "";
  const unbefristetChip = prognose.qualitaet.unbefristete_regelzahlungen > 0
    ? `<span class="chip neutral">• ${escapeHtml(String(prognose.qualitaet.unbefristete_regelzahlungen))} ${escapeHtml(t("cashflow.qualityOpenEnded"))}</span>`
    : "";
  const granButtons = ["monat", "quartal", "jahr"]
    .map((g) => `<button class="chip ${state.cashflow.granularitaet === g ? "success" : "neutral"} linkish" data-cashflow-gran="${g}">${escapeHtml(t(`cashflow.gran.${g}`))}</button>`)
    .join("");
  return `
    ${renderPageHead(t("cashflow.title"), t("cashflow.lead"))}
    <div class="tile-grid">
      <div class="tile tile-static">
        <strong>${escapeHtml(t("cashflow.ist"))}</strong>
        <div class="count">${escapeHtml(formatMoney(ist.gesamt_netto_cents))}</div>
        <span class="chip ${istChipClass}">${istChipIcon} ${escapeHtml(String(ist.qualitaet.offene_kategorie_anzahl))} ${escapeHtml(t("cashflow.qualityOpenCategories"))}</span>
      </div>
      <div class="tile tile-static">
        <strong>${escapeHtml(t("cashflow.prognose"))}</strong>
        <div class="count">${escapeHtml(formatMoney(prognose.gesamt_netto_cents))}</div>
        <span class="chip neutral">• ${escapeHtml(String(prognose.qualitaet.bestaetigte_regelzahlungen))} ${escapeHtml(t("cashflow.qualityConfirmed"))}</span>
        ${vorschlaegeChip}
        ${unbefristetChip}
        <span class="chip neutral">• ${escapeHtml(t("cashflow.horizonTo"))} ${escapeHtml(prognose.horizont_ende)}</span>
      </div>
    </div>
    <p class="page-lead" style="margin-top: 12px;">${escapeHtml(t("cashflow.incompleteNote"))}</p>
    <section class="panel panel-pad" style="margin-top: 16px;">
      <h2 class="section-title">${escapeHtml(t("cashflow.ist"))} · ${escapeHtml(t("cashflow.monthlyTable"))}</h2>
      ${ist.monate.length ? renderMonatsTabelle(ist.monate) : `<p class="muted">${escapeHtml(t("cashflow.empty"))}</p>`}
    </section>
    <section class="panel panel-pad" style="margin-top: 16px;">
      <h2 class="section-title">${escapeHtml(t("cashflow.prognose"))} · ${escapeHtml(t("cashflow.monthlyTable"))}</h2>
      <div class="cashflow-filter">
        <span>${granButtons}</span>
        <label class="cashflow-bis">${escapeHtml(t("cashflow.forecastUntil"))}
          <input type="date" data-control="cashflow-bis" value="${escapeHtml(state.cashflow.bisDatum)}" />
        </label>
      </div>
      ${renderPrognoseDetail(prognose)}
    </section>
  `;
}
```

- [ ] **Step 3: Detail-Render-Helfer hinzufügen**

Direkt nach `renderCashflow()` (also vor `function renderRegelzahlungen()` aus Task 4) einfügen:

```js
function formatMonat(monat) {
  return new Intl.DateTimeFormat(state.lang === "de" ? "de-DE" : "en-US", { month: "long", year: "numeric" }).format(new Date(`${monat}-01T00:00:00`));
}

function formatPeriode(periode) {
  if (periode.includes("-Q")) {
    const [jahr, q] = periode.split("-");
    return `${q} ${jahr}`;
  }
  if (/^\d{4}$/.test(periode)) return periode;
  return formatMonat(periode);
}

function laufendMarkup(istLaufend) {
  if (!istLaufend) return "";
  return `<span class="chip neutral">${escapeHtml(t("cashflow.running"))}</span><div class="running-note muted">${escapeHtml(t("cashflow.runningNote"))}</div>`;
}

function renderPostenRows(posten) {
  return posten.map((p) => `
    <tr class="row-posten">
      <td class="posten-cell">${escapeHtml(formatDate(p.datum))} · ${escapeHtml(p.bezeichnung)}</td>
      <td class="amount">${escapeHtml(formatMoney(p.betrag_cents))}</td>
    </tr>
  `).join("");
}

function renderMonatRows(monat, nested) {
  const expanded = state.cashflowExpanded.has(monat.monat);
  const monthRow = `
    <tr class="row-month ${nested ? "nested" : ""}">
      <td>
        <button class="row-toggle" data-cashflow-toggle="${escapeHtml(monat.monat)}">
          <span class="toggle-icon">${expanded ? "▾" : "▸"}</span>${escapeHtml(formatMonat(monat.monat))}
        </button>
        ${laufendMarkup(monat.ist_laufend)}
      </td>
      <td class="amount">${escapeHtml(formatMoney(monat.netto_cents))}</td>
    </tr>
  `;
  return monthRow + (expanded ? renderPostenRows(monat.posten) : "");
}

function renderPrognoseDetail(prognose) {
  if (!prognose.perioden.length) return `<p class="muted">${escapeHtml(t("cashflow.empty"))}</p>`;
  const gran = state.cashflow.granularitaet;
  const body = prognose.perioden.map((periode) => {
    if (gran === "monat") {
      // genau ein Monat je Periode — Monatszeile direkt als oberste Ebene
      return periode.monate.map((monat) => renderMonatRows(monat, false)).join("");
    }
    const expanded = state.cashflowExpanded.has(periode.periode);
    const periodRow = `
      <tr class="row-period">
        <td>
          <button class="row-toggle" data-cashflow-toggle="${escapeHtml(periode.periode)}">
            <span class="toggle-icon">${expanded ? "▾" : "▸"}</span>${escapeHtml(formatPeriode(periode.periode))}
          </button>
          ${laufendMarkup(periode.ist_laufend)}
        </td>
        <td class="amount">${escapeHtml(formatMoney(periode.netto_cents))}</td>
      </tr>
    `;
    const monatsZeilen = expanded ? periode.monate.map((monat) => renderMonatRows(monat, true)).join("") : "";
    return periodRow + monatsZeilen;
  }).join("");
  return `
    <div class="table-wrap">
      <table class="cashflow-detail">
        <thead>
          <tr>
            <th>${escapeHtml(t("cashflow.period"))}</th>
            <th class="amount">${escapeHtml(t("cashflow.net"))}</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}
```

- [ ] **Step 4: Click-Handler für Granularität und Aufklappen**

In `app/main.js` im `app.addEventListener("click", …)` (ca. Zeile 746), direkt nach dem `navButton`-Block (nach dessen `return;` und schließender `}`) einfügen:

```js
  const cashflowToggle = event.target.closest("[data-cashflow-toggle]");
  if (cashflowToggle) {
    const key = cashflowToggle.dataset.cashflowToggle;
    if (state.cashflowExpanded.has(key)) state.cashflowExpanded.delete(key);
    else state.cashflowExpanded.add(key);
    render();
    return;
  }

  const cashflowGran = event.target.closest("[data-cashflow-gran]");
  if (cashflowGran) {
    state.cashflow.granularitaet = cashflowGran.dataset.cashflowGran;
    state.cashflowExpanded.clear();
    render();
    return;
  }
```

- [ ] **Step 5: Change-Handler für Bis-Datum**

Im `app.addEventListener("change", …)` (ca. Zeile 774), direkt nach dem `theme`-Block (vor dem `data-filter`-Block) einfügen:

```js
  if (control?.dataset.control === "cashflow-bis") {
    state.cashflow.bisDatum = control.value || defaultHorizonEnd(data.regelzahlungen, heuteIso());
    state.cashflowExpanded.clear();
    render();
    return;
  }
```

- [ ] **Step 6: CSS ergänzen**

Am Ende von `app/styles.css` anhängen:

```css
.cashflow-filter {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.cashflow-filter .cashflow-bis {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
}
.cashflow-filter input[type="date"] {
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
}
.cashflow-detail .row-toggle {
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  color: inherit;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.cashflow-detail .toggle-icon {
  display: inline-block;
  width: 1em;
  color: var(--muted);
}
.cashflow-detail .row-month.nested td:first-child {
  padding-left: 26px;
}
.cashflow-detail .row-posten td {
  padding-left: 44px;
  color: var(--muted);
  font-size: 0.92em;
}
.cashflow-detail .running-note {
  font-size: 0.82em;
  margin-top: 3px;
}
```

- [ ] **Step 7: Im Browser verifizieren**

Server läuft (sonst wie Task 4 starten). Auf der Cashflow-Seite prüfen:
- Granularitäts-Buttons Monat/Quartal/Jahr schalten um (aktiver Button hervorgehoben).
- „Prognose bis"-Datumsfeld ändert den Horizont; spätere Monate verschwinden/erscheinen.
- Bei Quartal/Jahr: Periodenzeile aufklappbar → Monate; Monat aufklappbar → Einzelposten (Datum · Bezeichnung, Betrag).
- Beim Aufklappen bleibt die Summenzeile oberhalb der Detailzeilen sichtbar.
- Laufendes Quartal/laufender Monat tragen „laufend"-Chip + Hinweistext.
- Ist-Tabelle unverändert.
- Sprache auf EN umschalten: alle neuen Texte übersetzt.

- [ ] **Step 8: Volle Test-Suite (Regression)**

Run: `node --test`
Expected: alle Tests grün (UI-Änderungen berühren die pure Mathematik nicht).

- [ ] **Step 9: Commit**

```bash
git add app/main.js app/styles.css
git commit -m "feat(m4): Prognose-Filter (Granularität/Bis-Datum) und aufklappbare Detail-Tabelle"
```

---

## Task 6: Abschluss-Verifikation & Doku

**Files:**
- Modify: `CONTEXT.md` (kurzer Hinweis auf die neue View, falls dort der M4-Stand dokumentiert ist)

- [ ] **Step 1: End-to-End im Browser**

Alle Akzeptanzpunkte der Spec durchgehen (Regelzahlungs-Liste sichtbar, Prognose-Herleitung aufklappbar, Filter wirkt, laufender Zeitraum markiert, Summe sichtbar, Ist unverändert, DE+EN).

- [ ] **Step 2: CONTEXT.md aktualisieren (nur falls dort der Feature-Stand gepflegt wird)**

Den M4-Abschnitt in `CONTEXT.md` um einen Satz ergänzen, dass Prognose nun nachvollziehbar ist (Regelzahlungs-View + aufklappbare Prognose mit Granularitäts-/Horizont-Filter). Konkreten Wortlaut an den bestehenden Stil anpassen.

- [ ] **Step 3: Commit**

```bash
git add CONTEXT.md
git commit -m "docs(m4): Prognose-Nachvollziehbarkeit im Kontext vermerkt"
```

---

## Self-Review-Ergebnis

- **Spec-Abdeckung:** Regelzahlungs-Liste (Task 4), aufklappbare Prognose Periode→Monate→Posten (Task 5), Filter Granularität+Bis-Datum (Task 5), fixe Kalenderquartale (Task 1), `ist_laufend`/laufend-Markierung (Task 2+5), Summe-über-Inhalt (Task 5 Step 3 Render-Reihenfolge + Step 7 Check), Ist unverändert (renderCashflow behält `computeCashflowIst`/`renderMonatsTabelle`), i18n DE+EN (Task 3), Tests (Task 1+2). Abgrenzung „kein Anlegen/Bearbeiten" eingehalten (View nur Anzeige).
- **Typ-Konsistenz:** Rückgabe-Felder (`perioden`, `periode`, `monate`, `monat`, `posten`, `betrag_cents`, `bezeichnung`, `regelzahlung_id`, `ist_laufend`, `netto_cents`, `gesamt_netto_cents`, `horizont_ende`, `qualitaet.*`) werden in Tests (Task 2) und Renderern (Task 5) identisch verwendet. `granularitaet`-Werte `"monat"|"quartal"|"jahr"` konsistent in State, Buttons, Funktion.
- **Platzhalter:** keine — jeder Code-Step zeigt vollständigen Code; einziger frei zu formulierender Punkt ist der CONTEXT.md-Satz (Task 6), bewusst dem bestehenden Doku-Stil überlassen.

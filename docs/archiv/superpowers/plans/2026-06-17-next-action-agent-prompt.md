# Next Action Agent Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Arbeitsstatus berechnet genau einen hoechstpriorisierten Agentenauftrag und kopiert dafuer einen betriebsfaehigen Prompt mit App-Skill-Verweisen.

**Architecture:** Die Next-Action-Ableitung wird als reines App-Modul gebaut, damit UI und Tests dieselbe Logik nutzen. Gemeinsame Agentenregeln wandern in `app/docs/agent-context.md`; App-Skills bleiben workflow-spezifisch und duerfen nicht mehr auf Root-Doku oder ADRs verweisen. Die UI nutzt die bestehende Chip-/Button-Sprache, kopiert per Clipboard-API und zeigt bei Fehlern einen kopierbaren Fallback.

**Tech Stack:** ES-Module ohne Build-Pipeline, `node --test`, bestehende Browser-App unter `app/`, Markdown-Betriebsdoku unter `app/docs/`.

---

## File Structure

- Create `app/next-action.mjs`: Reine Ableitung, Statuszusammenfassung und Prompt-Erzeugung.
- Create `tests/next-action.test.mjs`: Unit-Tests fuer Prioritaet, Prompt-Inhalte und Root-Verweis-Freiheit.
- Create `app/docs/agent-context.md`: Gemeinsame betriebliche Agentenregeln im deploybaren App-Raum.
- Modify `app/docs/skills/import-agent.md`: Root-Doku-Verweise entfernen, gemeinsame Regeln auf `docs/agent-context.md` verweisen, import-spezifische Regeln self-contained halten.
- Modify `app/docs/skills/kategorisierungsregel-pflege.md`: Root-Doku-Verweise entfernen, Nach-Kategorisierungsregeln direkt im Skill halten.
- Modify `app/docs/skills/kategorisierung-review.md`: Root-Doku-Verweise entfernen, Status-/Herkunftsregeln direkt im Skill halten.
- Modify `app/docs/skills/regelzahlung-agent.md`: Root-Doku-Verweise entfernen, Regelzahlungsregeln direkt im Skill halten.
- Modify `app/docs/skills/stammdaten-erfassung-agent.md`: Root-Doku-Verweise entfernen, Anker-/Reconciliation-/Nettovermoegen-Regeln direkt im Skill halten.
- Create `tests/agent-docs.test.mjs`: Guard-Test fuer verbotene Betriebsverweise in App-Agentendoku.
- Modify `docs/runde2/Meilensteine_Runde2.md`: Definition of Done fuer M6-M9 zur Pflege von `agent-context`, Skills und Next-Action-Mapping.
- Modify `app/runtime.mjs`: UI-State fuer Copy-Feedback und Prompt-Fallback.
- Modify `app/main.js`: Next-Action-Button rendert den berechneten Auftrag, kopiert Prompt, zeigt Fallback.
- Modify `app/views/uebersicht.mjs`: Rechte Next-Action-Kachel nutzt dieselbe Prompt-Aktion statt Kategorie-Navigation.
- Modify `app/i18n.js`: Texte fuer Prompt-Kopie, Fallback und erledigten Zustand.
- Modify `app/icons.js`: `copy`-Icon fuer die neue Aktion.
- Modify `app/styles.css`: Fallback-Panel/Textarea und stabile Button-Darstellung.
- Modify `tests/ui-layout-contract.test.mjs`: Bestehenden redundanten Next-Action-Navigationstest ersetzen.

---

### Task 1: Reine Next-Action-Ableitung und Prompt-Erzeugung

**Files:**
- Create: `app/next-action.mjs`
- Create: `tests/next-action.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/next-action.test.mjs` with this content:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNextAgentAction, buildStatusSummary, forbiddenPromptPatterns } from "../app/next-action.mjs";

function baseData(overrides = {}) {
  return {
    validation: { valid: true, errors: [] },
    importfehler: [],
    transaktionen: [],
    regelzahlungen: [],
    konten: [],
    immobilien: [],
    darlehen: [],
    vermoegenswerte: [],
    zeitwerte: [],
    ...overrides,
  };
}

test("status summary counts all currently modelled work sources", () => {
  const data = baseData({
    validation: { valid: false, errors: ["kaputt"] },
    importfehler: [{ reason: "parse" }, { reason: "konto" }],
    transaktionen: [
      { kategorisierung_status: "offen" },
      { kategorisierung_status: "offen" },
      { kategorisierung_status: "vorgeschlagen" },
      { kategorisierung_status: "bestaetigt" },
    ],
    regelzahlungen: [{ status: "vorgeschlagen" }, { status: "bestaetigt" }],
  });

  assert.deepEqual(buildStatusSummary(data, { vermoegenChecks: [{ art: "anker-fehlt" }] }), {
    validationErrors: 1,
    importErrors: 2,
    openCategories: 2,
    suggestedCategories: 1,
    suggestedRegularPayments: 1,
    wealthChecks: 1,
  });
});

test("next action priority returns validation before every other work item", () => {
  const action = buildNextAgentAction(baseData({
    validation: { valid: false, errors: ["kaputt"] },
    importfehler: [{ reason: "parse" }],
    transaktionen: [{ kategorisierung_status: "offen" }],
    regelzahlungen: [{ status: "vorgeschlagen" }],
  }), { vermoegenChecks: [{ art: "anker-fehlt" }] });

  assert.equal(action.type, "validation-errors");
  assert.equal(action.count, 1);
  assert.equal(action.skillPath, "");
  assert.match(action.prompt, /app\/tools\/validator\.mjs/);
});

test("next action priority orders all supported action types", () => {
  const cases = [
    {
      data: baseData({ importfehler: [{ reason: "parse" }], transaktionen: [{ kategorisierung_status: "offen" }] }),
      expected: ["import-errors", "app/docs/skills/import-agent.md"],
    },
    {
      data: baseData({ transaktionen: [{ kategorisierung_status: "offen" }, { kategorisierung_status: "vorgeschlagen" }] }),
      expected: ["open-categories", "app/docs/skills/kategorisierungsregel-pflege.md"],
    },
    {
      data: baseData({ transaktionen: [{ kategorisierung_status: "vorgeschlagen" }] }),
      expected: ["suggested-categories", "app/docs/skills/kategorisierung-review.md"],
    },
    {
      data: baseData({ regelzahlungen: [{ status: "vorgeschlagen" }] }),
      expected: ["suggested-regular-payments", "app/docs/skills/regelzahlung-agent.md"],
    },
    {
      data: baseData({ konten: [{ konto_id: "KTO-1", name: "Giro", kontotyp: "giro", status: "aktiv" }] }),
      options: { vermoegenChecks: [{ art: "anker-fehlt", entitaet: "konto", entitaet_id: "KTO-1" }] },
      expected: ["wealth-checks", "app/docs/skills/stammdaten-erfassung-agent.md"],
    },
  ];

  for (const { data, options, expected } of cases) {
    const action = buildNextAgentAction(data, options);
    assert.equal(action.type, expected[0]);
    assert.equal(action.skillPath, expected[1]);
  }
});

test("next action returns done state when no work is pending", () => {
  const action = buildNextAgentAction(baseData(), { vermoegenChecks: [] });

  assert.equal(action.type, "none");
  assert.equal(action.count, 0);
  assert.equal(action.prompt, "");
});

test("open category prompt injects app context and exact app skill only", () => {
  const action = buildNextAgentAction(baseData({
    transaktionen: [
      { kategorisierung_status: "offen" },
      { kategorisierung_status: "offen" },
    ],
  }), { vermoegenChecks: [] });

  assert.equal(action.type, "open-categories");
  assert.match(action.prompt, /app\/docs\/agent-context\.md/);
  assert.match(action.prompt, /app\/docs\/skills\/kategorisierungsregel-pflege\.md/);
  assert.match(action.prompt, /2 offene Kategorien/);
  assert.doesNotMatch(action.prompt, /app\/docs\/skills\/kategorisierung-review\.md/);
  for (const pattern of forbiddenPromptPatterns) {
    assert.doesNotMatch(action.prompt, pattern);
  }
});

test("loan-without-rate check prompt also names regelzahlung skill", () => {
  const action = buildNextAgentAction(baseData(), {
    vermoegenChecks: [{ art: "darlehen-ohne-regelzahlung", entitaet: "darlehen", entitaet_id: "DAR-1" }],
  });

  assert.equal(action.type, "wealth-checks");
  assert.match(action.prompt, /app\/docs\/skills\/stammdaten-erfassung-agent\.md/);
  assert.match(action.prompt, /app\/docs\/skills\/regelzahlung-agent\.md/);
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run:

```bash
node --test tests/next-action.test.mjs
```

Expected: FAIL with an import error similar to `Cannot find module ... app/next-action.mjs`.

- [ ] **Step 3: Implement the pure module**

Create `app/next-action.mjs` with this content:

```js
import { computeVermoegenChecks } from "./vermoegen.mjs";
import { localTodayIso } from "./liquiditaet.mjs";

export const forbiddenPromptPatterns = [
  /CONTEXT\.md/,
  /docs\/adr/,
  /docs\/superpowers/,
  /Repo-Root/i,
  /Projektroot/i,
];

const SKILLS = {
  importErrors: "app/docs/skills/import-agent.md",
  openCategories: "app/docs/skills/kategorisierungsregel-pflege.md",
  suggestedCategories: "app/docs/skills/kategorisierung-review.md",
  suggestedRegularPayments: "app/docs/skills/regelzahlung-agent.md",
  wealthChecks: "app/docs/skills/stammdaten-erfassung-agent.md",
  regularPayments: "app/docs/skills/regelzahlung-agent.md",
};

function countBy(items, predicate) {
  return (items ?? []).filter(predicate).length;
}

function wealthChecksFor(data, options = {}) {
  if (Array.isArray(options.vermoegenChecks)) return options.vermoegenChecks;
  return computeVermoegenChecks(data, options.today || localTodayIso());
}

export function buildStatusSummary(data, options = {}) {
  const checks = wealthChecksFor(data, options);
  return {
    validationErrors: data.validation?.valid === false ? (data.validation?.errors?.length ?? 0) : 0,
    importErrors: data.importfehler?.length ?? 0,
    openCategories: countBy(data.transaktionen, (tx) => tx.kategorisierung_status === "offen"),
    suggestedCategories: countBy(data.transaktionen, (tx) => tx.kategorisierung_status === "vorgeschlagen"),
    suggestedRegularPayments: countBy(data.regelzahlungen, (rz) => rz.status === "vorgeschlagen"),
    wealthChecks: checks.length,
  };
}

function summaryLines(summary) {
  return [
    `- Validierungsfehler: ${summary.validationErrors}`,
    `- Importfehler: ${summary.importErrors}`,
    `- Offene Kategorien: ${summary.openCategories}`,
    `- Vorgeschlagene Kategorien: ${summary.suggestedCategories}`,
    `- Vorgeschlagene Regelzahlungen: ${summary.suggestedRegularPayments}`,
    `- Vermoegens-/Liquiditaetschecks: ${summary.wealthChecks}`,
  ].join("\n");
}

function basePrompt({ title, count, summary, skillPath, extraSkillPaths = [], instructions }) {
  const skillLines = [skillPath, ...extraSkillPaths]
    .filter(Boolean)
    .map((path) => `- ${path}`)
    .join("\n");
  const skillBlock = skillLines ? `\n\nBetriebsanweisung(en):\n${skillLines}` : "";
  return [
    "Bitte bearbeite die naechste Aktion aus der Finanzmodell-App.",
    "",
    "Lies zuerst `app/docs/agent-context.md`.",
    skillBlock.trim(),
    "",
    "Statuszusammenfassung:",
    summaryLines(summary),
    "",
    `Oberster Auftrag: ${title} (${count}).`,
    "",
    instructions,
    "",
    "Arbeite nur im App-Raum (`app/`). Analysiere zuerst read-only, frage vor fachlichen Schreibentscheidungen nach meiner Bestaetigung, nutze die vorgesehenen Tools und Validatoren, und fasse das Ergebnis am Ende mit Zaehlern zusammen.",
  ].filter(Boolean).join("\n");
}

function action(type, count, label, skillPath, summary, instructions, extraSkillPaths = []) {
  const prompt = basePrompt({ title: label, count, summary, skillPath, extraSkillPaths, instructions });
  return { type, count, label, skillPath, prompt };
}

export function buildNextAgentAction(data, options = {}) {
  const summary = buildStatusSummary(data, options);
  const checks = wealthChecksFor(data, options);

  if (summary.validationErrors > 0) {
    return action(
      "validation-errors",
      summary.validationErrors,
      "Validierungsfehler klaeren",
      "",
      summary,
      "Pruefe `app/data/master/` mit `app/tools/validator.mjs`, lies die betroffenen `app/schemas/*`, erklaere die Fehlerursache und schlage die kleinste valide Korrektur vor.",
    );
  }

  if (summary.importErrors > 0) {
    return action(
      "import-errors",
      summary.importErrors,
      "Importfehler klaeren",
      SKILLS.importErrors,
      summary,
      "Sichte die Fehler unter `app/data/inbox/error/`, klaere Ursache und Konto-/Formatfragen, und fuehre den Importprozess nach Bestaetigung erneut gemaess Skill aus.",
    );
  }

  if (summary.openCategories > 0) {
    return action(
      "open-categories",
      summary.openCategories,
      "Offene Kategorien verregeln",
      SKILLS.openCategories,
      summary,
      "Analysiere `app/data/master/transaktionen.jsonl` fuer `kategorisierung_status = offen`, bilde Buckets nach Hebel, schlage Regeln vor, schreibe keine Regel ohne Bestaetigung und starte danach die Nach-Kategorisierung.",
    );
  }

  if (summary.suggestedCategories > 0) {
    return action(
      "suggested-categories",
      summary.suggestedCategories,
      "Vorgeschlagene Kategorien reviewen",
      SKILLS.suggestedCategories,
      summary,
      "Bilde Buckets fuer `kategorisierung_status = vorgeschlagen`, zeige Stichproben und fuehre Bestaetigung, Korrektur oder Ablehnung erst nach meiner Entscheidung aus.",
    );
  }

  if (summary.suggestedRegularPayments > 0) {
    return action(
      "suggested-regular-payments",
      summary.suggestedRegularPayments,
      "Regelzahlungsvorschlaege reviewen",
      SKILLS.suggestedRegularPayments,
      summary,
      "Pruefe `app/data/master/regelzahlungen.json` auf `status = vorgeschlagen`, stelle die Vorschlaege zur Entscheidung vor und schreibe nur bestaetigte Entscheidungen.",
    );
  }

  if (summary.wealthChecks > 0) {
    const extra = checks.some((check) => check.art === "darlehen-ohne-regelzahlung") ? [SKILLS.regularPayments] : [];
    return action(
      "wealth-checks",
      summary.wealthChecks,
      "Vermoegens-/Liquiditaetschecks klaeren",
      SKILLS.wealthChecks,
      summary,
      "Pruefe die sichtbaren Vermoegens- und Liquiditaetschecks, erfasse fehlende belegte Werte oder klaere Reconciliation-Abweichungen mit Belegen und Validatorlauf.",
      extra,
    );
  }

  return {
    type: "none",
    count: 0,
    label: "Keine offene Agentenaktion",
    skillPath: "",
    prompt: "",
  };
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run:

```bash
node --test tests/next-action.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run the full unit suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/next-action.mjs tests/next-action.test.mjs
git commit -m "feat: berechne naechsten Agentenauftrag"
```

---

### Task 2: Betriebskontext im App-Raum und Skill-Bereinigung

**Files:**
- Create: `app/docs/agent-context.md`
- Modify: `app/docs/skills/import-agent.md`
- Modify: `app/docs/skills/kategorisierungsregel-pflege.md`
- Modify: `app/docs/skills/kategorisierung-review.md`
- Modify: `app/docs/skills/regelzahlung-agent.md`
- Modify: `app/docs/skills/stammdaten-erfassung-agent.md`
- Modify: `docs/runde2/Meilensteine_Runde2.md`

- [ ] **Step 1: Create the central app agent context**

Create `app/docs/agent-context.md` with this content:

```md
# Agent Context

Gemeinsame Betriebsgrundlage fuer Agentenarbeit im deploybaren App-Raum.

## App-Raum

Der fuehrende Betriebsraum ist `app/`. Alle produktiven Pfade in Agenten-Skills
sind app-relativ:

- `data/master/...` fuer Masterdaten.
- `data/inbox/...` fuer Import-Eingang, Zwischenstaende, verarbeitete Dateien und Fehler.
- `schemas/...` fuer Datenvertraege.
- `tools/...` fuer deterministische Betriebstools.
- `Belege/...` fuer abgelegte Quellen und Rohdokumente.
- `docs/skills/...` fuer workflow-spezifische Betriebsanweisungen.

Die App liest Daten, validiert und zeigt Arbeitsstaende. Sie schreibt keine
Masterdaten. Schreibende Aenderungen laufen ueber Agenten und Betriebstools.

## Arbeitsprinzipien

- Agenten schreiben nur gegen Schemas und nach Validierung.
- Tools rechnen deterministisch; Agenten rufen Tools auf und interpretieren deren
  Bericht.
- Keine stille finale Fachentscheidung: unsichere Fakten bleiben offen oder werden
  dem Nutzer als Vorschlag vorgelegt.
- Nutzerentscheidungen und Agentenvorschlaege bleiben getrennt.
- Nach jedem schreibenden Lauf wird der Validator ausgefuehrt.
- Jeder schreibende Lauf wird in `data/master/agent_log.jsonl` mit Zaehlern,
  betroffenen IDs und kurzer Notiz protokolliert.

## Statuslogik

Statuswerte sind entitaetsspezifisch. Fuer Transaktionen gilt:

- `offen`: keine eindeutige Kategorie aus dem Regelwerk; kein `kategorie_id`.
- `vorgeschlagen`: ein Tool oder Agentenprozess hat einen Vorschlag erzeugt; der
  Nutzer muss bestaetigen, korrigieren oder ablehnen.
- `bestaetigt`: die Kategorie ist fachlich bestaetigt.
- `abgelehnt`: ein Vorschlag wurde bewusst verworfen und bleibt unangetastet.

Fuer Regelzahlungen gilt analog:

- `vorgeschlagen`: wartet auf Nutzerentscheidung und wirkt nicht auf die Prognose.
- `bestaetigt`: wirkt auf die Liquiditaetsprognose.
- `abgelehnt`: bewusst verworfen.

## Kategorisierung und Herkunft

Eine Transaktion kann eine Kategorie aus zwei Herkuenften haben:

- `kategorie_herkunft = regel`: Kategorie stammt aus dem deterministischen
  Regelwerk.
- `kategorie_herkunft = manuell`: Kategorie stammt aus einer ausdruecklichen
  Nutzerentscheidung im Agentendialog.

Nach-Kategorisierung bewertet offene Transaktionen und regelbasierte Eintraege neu.
Manuelle Kategorien und abgelehnte Vorschlaege bleiben unangetastet. Widerspricht ein
neuer Regelstand einer bestaetigten regelbasierten Kategorie, wird die Transaktion
als Wiedervorlage sichtbar gemacht statt still ueberschrieben.

Nach-Kategorisierung laeuft ueber `tools/recategorize.mjs`. Reimport ist kein Mittel
zur Nach-Kategorisierung, weil bekannte Buchungen per Dedupe uebersprungen werden.

## Validierung und Tools

Validierung ist deterministischer Code. Agenten fuehren Validierung aus, statt
Strukturregeln frei zu interpretieren.

Wichtige Tools:

- `tools/validator.mjs`: Masterdaten pruefen.
- `tools/import.mjs`: normalisierte Buchungen importieren.
- `tools/categorizer.mjs`: Kategorisierungsregeln anwenden.
- `tools/recategorize.mjs`: Bestand nach Regelaenderungen neu bewerten.
- `tools/transfer-matcher.mjs`: interne Transfers paaren.

## Zeitwerte, Anker und Reconciliation

Zeitveraenderliche, beleg- oder schaetzbasierte Werte leben in
`data/master/zeitwerte.jsonl`. Beispiele sind Kontostand, Depotwert, Marktwert und
Restschuld.

Konto-Salden und Darlehen-Restschulden brauchen belegte Ankerpunkte, wenn die
Historie nicht vollstaendig garantiert ist. Laufende Werte werden aus Anker plus
Bewegungen oder Tilgung berechnet. Aufeinanderfolgende belegte Staende werden
reconciled; Abweichungen werden als Checks sichtbar und nicht still korrigiert.

## Regelzahlungen und Prognose

Regelzahlungen beschreiben wiederkehrende erwartete Zahlungen. Nur bestaetigte
Regelzahlungen wirken auf die Liquiditaetsprognose. Einmaleffekte und hypothetische
Szenarien werden nicht als bestaetigte Regelzahlungen modelliert.

Bekannte Stufenaenderungen werden als zwei Regelzahlungen modelliert: die alte mit
`aktiv_bis`, die neue mit eigenem `anker_datum`.

## Belege

Belege werden sprechend benannt und unter `Belege/` abgelegt. Datenfelder wie
`rohquelle` und `quelle_hinweis` zeigen auf den finalen App-relativen Belegpfad.
```

- [ ] **Step 2: Remove root references from import-agent skill**

In `app/docs/skills/import-agent.md`, replace the section from `Es gibt zwei Wurzeln` through the end of `## Kontext, den du kennen musst` with:

```md
Alle Pfade in diesem Skill sind app-relativ: `data/...`, `Belege/...`,
`schemas/...`, `tools/...` und `docs/...` liegen unter dem App-Raum.

## Wann diesen Skill nutzen

Nutze ihn, wenn der Nutzer

- eine neue Bankexport-Datei (CSV, PDF, Screenshot, copy-paste-Tabelle) zum Importieren bereitstellt,
- bittet, `data/inbox/` zu verarbeiten,
- einen Importfehler aus `data/inbox/error/` klaeren moechte,
- offene Transaktionen aus einem frueheren Lauf nachziehen will.

Nicht nutzen fuer:
- Pflege von Stammdaten (Personen, Konten, Kategorien) — das ist Aufgabe des Stammdaten-Erfassungs-Agenten.
- Aenderung von Kategorisierungsregeln — eigener Pflegeprozess (Skill kategorisierungsregel-pflege); danach Nach-Kategorisierung ueber den Bestand laufen lassen, nicht Reimport.
- Manuelle Korrekturen an bereits importierten Transaktionen — direkte Datei-Edits mit Validator-Lauf.

## Kontext, den du kennen musst

Vor jedem Import lesen:

1. `docs/agent-context.md` — gemeinsame Betriebsregeln fuer App-Raum, Validierung, Kategorisierung, Dedupe, Belege und Agentenprotokoll.
2. `schemas/` — Schemas fuer Transaktion, Transfer, ggf. Importformat.
3. `data/master/konten.json` — fuer die Zuordnung Rohdatei → Konto via `kontoreferenz`.
4. `data/master/kategorisierungsregeln.json` — Input fuer den Categorizer.
5. `tools/import.mjs`, `tools/validator.mjs`, `tools/dedupe.mjs`, `tools/categorizer.mjs`, `tools/transfer-matcher.mjs`.
```

Then remove remaining parenthetical ADR/CONTEXT references from this file by replacing them with the operational rule already present in the surrounding sentence. Concrete replacements:

```text
(siehe ADR 0017) -> (Nach-Kategorisierung ueber `tools/recategorize.mjs`)
(ADR 0007, Praezisierung 2026-06-09) -> (zweistufiger Dedupe-Hash aus `docs/agent-context.md`)
(ADR 0007) -> (zweistufiger Dedupe-Hash aus `docs/agent-context.md`)
Felder siehe `CONTEXT.md` -> Felder siehe `docs/agent-context.md`
```

- [ ] **Step 3: Remove root references from kategorisierungsregel-pflege skill**

In `app/docs/skills/kategorisierungsregel-pflege.md`, replace the intro/context section from `Es gibt zwei Wurzeln` through `## Ablauf` with:

```md
Alle Pfade in diesem Skill sind app-relativ: `data/...`, `schemas/...`,
`tools/...` und `docs/...` liegen unter dem App-Raum.

## Wann diesen Skill nutzen

Nutze ihn, wenn der Nutzer

- den **Offen-Stapel** abarbeiten will („verregele meine offenen Buchungen", „warum ist das alles offen?"),
- eine konkrete Regel anlegen oder anpassen moechte („alles von MusterladenA ist Lebensmittel"),
- nach einem Regel-Tuning den **Bestand** nachziehen will.

Nicht nutzen fuer:
- Neue Belege einspielen → **import-agent** (der macht die Erst-Kategorisierung).
- Vorschlaege bestaetigen/ablehnen → **kategorisierung-review** (dieser Skill *endet* bei `vorgeschlagen`).
- Stammdaten (Personen, Konten, Kategorien) → **stammdaten-erfassung-agent**.

## Kontext, den du kennen musst

1. `docs/agent-context.md` — gemeinsame Regeln fuer App-Raum, Kategorisierung, Herkunft, Nach-Kategorisierung und Validierung.
2. `schemas/kategorisierungsregeln.schema.json` — verbindliche Struktur einer Regel.
3. `data/master/kategorisierungsregeln.json` — der Regelbestand.
4. `data/master/kategorien.json` — gueltige `kategorie_id` (Ziel jeder Regel).
5. `tools/categorizer.mjs` (Matching) und `tools/recategorize.mjs` (Nach-Kategorisierung).

## Zentrale Regeln

- Der Agent legt nie still eine Regel an und raet nie eine Kategorie.
- Nach-Kategorisierung bewertet `offen` plus Eintraege mit `kategorie_herkunft = regel`.
- `manuell` und `abgelehnt` bleiben unangetastet.
- Widerspruch gegen eine bestaetigte Regel-Kategorie wird Wiedervorlage, nicht stilles Ueberschreiben.
- Reimport ist keine Nach-Kategorisierung; bekannte Buchungen werden per Dedupe uebersprungen.

## Ablauf
```

Then replace remaining `ADR ...` or `CONTEXT` mentions with the same operational wording from `## Zentrale Regeln`.

- [ ] **Step 4: Remove root references from kategorisierung-review skill**

In `app/docs/skills/kategorisierung-review.md`, replace the paragraph that starts with `Alle Pfade` and the `## Kontext, den du kennen musst` section with:

```md
Alle Pfade in diesem Skill sind app-relativ: `data/...`, `schemas/...`,
`tools/...` und `docs/...` liegen unter dem App-Raum.

## Kontext, den du kennen musst

- `docs/agent-context.md` — gemeinsame Regeln fuer Status, Herkunft, Kategorisierung, Validierung und Agentenprotokoll.
- `schemas/transaktionen.schema.json` und `tools/validator.mjs`.
- `data/master/transaktionen.jsonl`, `data/master/kategorien.json`, `data/master/agent_log.jsonl`.

## Zentrale Regeln

- Review bestaetigt, korrigiert oder lehnt bestehende `vorgeschlagen`-Eintraege ab.
- Bulk-Bestaetigung einer Regel-Kategorie setzt `kategorisierung_status = bestaetigt` und belaesst `kategorie_herkunft = regel`.
- Einzelkorrektur auf eine andere Zielkategorie setzt `kategorisierung_status = bestaetigt` und `kategorie_herkunft = manuell`.
- Ablehnung entfernt `kategorie_id` und `kategorie_herkunft` und setzt `kategorisierung_status = abgelehnt`.
- Keine Korrektur-Kategorie raten; die Zielkategorie nennt der Nutzer.
```

Remove remaining `ADR` and `CONTEXT.md` mentions from the file.

- [ ] **Step 5: Remove root references from regelzahlung-agent skill**

In `app/docs/skills/regelzahlung-agent.md`, replace the `## Kontext, den du kennen musst` section with:

```md
## Kontext, den du kennen musst

- `docs/agent-context.md` — gemeinsame Regeln fuer App-Raum, Status, Validierung, Regelzahlungen und Prognosegrenzen.
- `data/master/regelzahlungen.json`.
- `data/master/transaktionen.jsonl`.
- `schemas/regelzahlungen.schema.json`.
- `tools/validator.mjs`.
```

Concrete replacements in the remaining file:

```text
(ADR 0006) -> (App schreibt keine Masterdaten)
(Agent-Urteil, ADR 0010) -> (Agent-Urteil)
```

Keep the existing rules about no Einmaleffekte, no Szenarien, Stufenaenderung and Validator before writes.

- [ ] **Step 6: Remove root references from stammdaten-erfassung-agent skill**

In `app/docs/skills/stammdaten-erfassung-agent.md`, replace the `## Kontext, den du kennen musst` section with:

```md
## Kontext, den du kennen musst

- `docs/agent-context.md` — gemeinsame Regeln fuer App-Raum, Validierung, Zeitwerte, belegte Anker, Reconciliation, Regelzahlungen und Agentenprotokoll.
- Das jeweilige `schemas/*.schema.json`.
- `tools/validator.mjs`.
- `vermoegen.mjs` fuer Nettovermoegen- und Check-Berechnung.
```

Concrete replacements in the remaining file:

```text
(ADR 0013) -> (belegter Anker und Reconciliation)
(ADR 0006) -> (App schreibt keine Masterdaten; Regelzahlungen laufen ueber Agenten-Dialog)
(ADR 0014) -> (Nettovermoegen ist Haushaltssicht)
```

Keep the existing model rules about Sonnet/Opus, Wert-fuer-Wert-Bestaetigung, Quellenbindung, Brueche, Decimal-Strings and no planned Sondertilgungen.

- [ ] **Step 7: Add future milestone Definition of Done**

In `docs/runde2/Meilensteine_Runde2.md`, insert this block immediately before `## M6 - Szenarien und Arbeitsende-Fragen`:

```md
## Betriebliches Agenten-DoD ab M6

Jeder Meilenstein ab M6, der neue Datenzustaende, Checks, Vorschlaege oder
Agentenprozesse einfuehrt, muss zusaetzlich pruefen:

- Muss `app/docs/agent-context.md` erweitert werden?
- Muss ein vorhandener Skill angepasst oder ein neuer Skill unter `app/docs/skills/`
  angelegt werden?
- Muss das Next-Action-Mapping erweitert oder die Prioritaet angepasst werden?
- Gibt es neue Schemas oder Tools, die der betroffene Skill referenzieren muss?
- Bleiben alle App-Skills frei von Verweisen auf Root-Doku, ADRs und
  Entwicklungsplaene?

Diese Pruefung ist Teil des Exit-Kriteriums, weil die deploybare App im Betrieb nur
den App-Raum voraussetzen darf.
```

- [ ] **Step 8: Run a manual forbidden-reference scan**

Run:

```bash
rg -n "CONTEXT\.md|docs/adr|docs/superpowers|Repo-Root|Projektroot" app/docs/agent-context.md app/docs/skills
```

Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add app/docs/agent-context.md app/docs/skills/import-agent.md app/docs/skills/kategorisierungsregel-pflege.md app/docs/skills/kategorisierung-review.md app/docs/skills/regelzahlung-agent.md app/docs/skills/stammdaten-erfassung-agent.md docs/runde2/Meilensteine_Runde2.md
git commit -m "docs: mache Agenten-Skills betriebssicher"
```

---

### Task 3: Guard-Test fuer App-Agentendoku

**Files:**
- Create: `tests/agent-docs.test.mjs`

- [ ] **Step 1: Write the failing guard test**

Create `tests/agent-docs.test.mjs` with this content:

```js
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const docsDir = join(repoRoot, "app", "docs");
const skillsDir = join(docsDir, "skills");

const forbidden = [
  /CONTEXT\.md/,
  /docs\/adr/,
  /docs\/superpowers/,
  /Repo-Root/i,
  /Projektroot/i,
];

function readMarkdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return readMarkdownFiles(full);
    if (!entry.name.endsWith(".md")) return [];
    return [full];
  });
}

test("app agent docs do not depend on root-only development documentation", () => {
  const files = [
    join(docsDir, "agent-context.md"),
    ...readMarkdownFiles(skillsDir),
  ];

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(text, pattern, `${file} contains forbidden reference ${pattern}`);
    }
  }
});

test("every app skill points to the app agent context", () => {
  for (const file of readMarkdownFiles(skillsDir)) {
    const text = readFileSync(file, "utf8");
    assert.match(text, /docs\/agent-context\.md/, `${file} must reference docs/agent-context.md`);
  }
});
```

- [ ] **Step 2: Run the guard test**

Run:

```bash
node --test tests/agent-docs.test.mjs
```

Expected: PASS after Task 2. If it fails, remove the named forbidden reference from the reported app doc and rerun.

- [ ] **Step 3: Run the full unit suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/agent-docs.test.mjs
git commit -m "test: sichere App-Agentendoku gegen Root-Verweise"
```

---

### Task 4: Clipboard-UI fuer Next Action

**Files:**
- Modify: `app/runtime.mjs`
- Modify: `app/main.js`
- Modify: `app/views/uebersicht.mjs`
- Modify: `app/i18n.js`
- Modify: `app/icons.js`
- Modify: `app/styles.css`
- Modify: `tests/ui-layout-contract.test.mjs`

- [ ] **Step 1: Update UI contract tests first**

In `tests/ui-layout-contract.test.mjs`, replace the test named
`next action shows the live open-category count, not a hardcoded number` with:

```js
test("next action copies an agent prompt instead of duplicating open-category navigation", () => {
  assert.match(main, /from "\.\/next-action\.mjs"/);
  assert.match(main, /buildNextAgentAction\(data\)/);
  assert.match(main, /data-action="copy-next-agent-prompt"/);
  assert.match(main, /copyNextAgentPrompt\(\)/);
  assert.doesNotMatch(main, /action === "filter-open-category" \|\| action === "next-action"/);
  assert.match(main, /renderPromptFallback\(\)/);
  assert.match(i18n, /copyAgentPrompt:\s*"Agenten-Prompt kopieren"/);
  assert.match(i18n, /agentPromptCopied:\s*"Prompt kopiert"/);
});

test("open-category chip remains the navigation entry for open transactions", () => {
  assert.match(main, /data-action="filter-open-category"/);
  assert.match(main, /openCategoryTransactions\(\)\.length[^\n]*chrome\.categoryOpen/);
});
```

- [ ] **Step 2: Run the UI contract test to verify it fails**

Run:

```bash
node --test tests/ui-layout-contract.test.mjs
```

Expected: FAIL because `app/main.js` does not yet import `next-action.mjs` and the button still uses `data-action="next-action"`.

- [ ] **Step 3: Add runtime state**

In `app/runtime.mjs`, add these properties to the exported `state` object after `moreMenuOpen: false,`:

```js
  nextActionCopied: false,
  nextActionPromptFallback: "",
```

- [ ] **Step 4: Add copy icon**

In `app/icons.js`, add this entry to the `icons` object after `clear`:

```js
  copy: [
    '<rect width="14" height="14" x="8" y="8" rx="2"/>',
    '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  ],
```

- [ ] **Step 5: Add i18n copy/fallback strings**

In `app/i18n.js`, under `de.chrome`, add:

```js
      copyAgentPrompt: "Agenten-Prompt kopieren",
      agentPromptCopied: "Prompt kopiert",
      noAgentAction: "Keine Agentenaktion offen",
      agentPromptFallbackTitle: "Agenten-Prompt",
      agentPromptFallbackLead: "Zwischenablage nicht verfügbar. Prompt markieren und in die Agentensession übernehmen.",
```

Under `en.chrome`, add:

```js
      copyAgentPrompt: "Copy agent prompt",
      agentPromptCopied: "Prompt copied",
      noAgentAction: "No agent action open",
      agentPromptFallbackTitle: "Agent prompt",
      agentPromptFallbackLead: "Clipboard unavailable. Select the prompt and move it into the agent session.",
```

- [ ] **Step 6: Wire main.js to next-action**

In `app/main.js`, add this import after the existing imports:

```js
import { buildNextAgentAction } from "./next-action.mjs";
```

In `render()`, insert `${renderPromptFallback()}` after `${renderValidationBanner()}`:

```js
      ${renderValidationBanner()}
      ${renderPromptFallback()}
      ${renderView()}
```

Replace the last button in `renderTopbar()`:

```js
        <button class="chip neutral linkish" data-action="next-action">${escapeHtml(t("chrome.nextAction"))}: ${openCategoryTransactions().length} ${escapeHtml(t("overview.nextActionText"))}</button>
```

with:

```js
        ${renderNextActionButton()}
```

Add these functions immediately after `renderTopbar()`:

```js
function renderNextActionButton() {
  const nextAction = buildNextAgentAction(data);
  const disabled = nextAction.type === "none" ? " disabled" : "";
  const label = state.nextActionCopied ? t("chrome.agentPromptCopied") : t("chrome.copyAgentPrompt");
  const detail = nextAction.type === "none" ? t("chrome.noAgentAction") : nextAction.label;
  return `
    <button class="chip neutral linkish next-action-copy" data-action="copy-next-agent-prompt"${disabled} title="${escapeHtml(detail)}">
      ${iconSvg("copy")}${escapeHtml(label)} · ${escapeHtml(detail)}
    </button>
  `;
}

function renderPromptFallback() {
  if (!state.nextActionPromptFallback) return "";
  return `
    <section class="prompt-fallback panel panel-pad" aria-labelledby="prompt-fallback-title">
      <h2 class="section-title" id="prompt-fallback-title">${escapeHtml(t("chrome.agentPromptFallbackTitle"))}</h2>
      <p class="page-lead">${escapeHtml(t("chrome.agentPromptFallbackLead"))}</p>
      <textarea readonly rows="10">${escapeHtml(state.nextActionPromptFallback)}</textarea>
      <button class="linkish" data-action="close-prompt-fallback">${escapeHtml(t("chrome.closeDetails"))}</button>
    </section>
  `;
}
```

In the app click listener, replace:

```js
    handleAction(action);
```

with:

```js
    void handleAction(action);
```

Change the function declaration:

```js
function handleAction(element) {
```

to:

```js
async function handleAction(element) {
```

At the top of `handleAction`, after `const action = element.dataset.action;`, add:

```js
  if (action === "copy-next-agent-prompt") {
    await copyNextAgentPrompt();
    return;
  }
  if (action === "close-prompt-fallback") {
    state.nextActionPromptFallback = "";
    render();
    return;
  }
```

Remove `|| action === "next-action"` from the existing filter block so it starts:

```js
  if (action === "filter-open-category") {
```

Add this function immediately before `handleAction(element)`:

```js
async function copyNextAgentPrompt() {
  const nextAction = buildNextAgentAction(data);
  if (!nextAction.prompt) return;
  try {
    await navigator.clipboard.writeText(nextAction.prompt);
    state.nextActionCopied = true;
    state.nextActionPromptFallback = "";
    render();
    window.setTimeout(() => {
      state.nextActionCopied = false;
      render();
    }, 1800);
  } catch {
    state.nextActionCopied = false;
    state.nextActionPromptFallback = nextAction.prompt;
    render();
  }
}
```

- [ ] **Step 7: Update overview next-action panel**

In `app/views/uebersicht.mjs`, add:

```js
import { buildNextAgentAction } from "../next-action.mjs";
```

Inside `renderOverview()`, before the `return`, add:

```js
  const nextAction = buildNextAgentAction(data);
```

Replace the next-action section:

```js
        <section class="panel panel-pad next-action">
          <h2 class="section-title">${escapeHtml(t("chrome.nextAction"))}</h2>
          <button class="linkish" data-action="filter-open-category">${openCategoryTransactions().length} ${escapeHtml(t("overview.nextActionText"))}</button>
          <p class="page-lead">${escapeHtml(t("checks.categoryOpen.detail"))}</p>
        </section>
```

with:

```js
        <section class="panel panel-pad next-action">
          <h2 class="section-title">${escapeHtml(t("chrome.nextAction"))}</h2>
          <button class="linkish" data-action="copy-next-agent-prompt" ${nextAction.type === "none" ? "disabled" : ""}>${escapeHtml(nextAction.type === "none" ? t("chrome.noAgentAction") : nextAction.label)}</button>
          <p class="page-lead">${escapeHtml(t("chrome.copyAgentPrompt"))}</p>
        </section>
```

Keep the existing `openCategoryTransactions` import because the overview still uses it through the account/check area only if it is referenced. If the import becomes unused after this replacement, remove it from the import list.

- [ ] **Step 8: Add fallback CSS**

In `app/styles.css`, add this block near the existing panel/form styles:

```css
.prompt-fallback {
  margin: 0 0 18px;
}

.prompt-fallback textarea {
  width: 100%;
  min-height: 220px;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  background: var(--panel);
  color: var(--text);
  font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.next-action-copy {
  max-width: min(520px, 100%);
}
```

- [ ] **Step 9: Run targeted tests**

Run:

```bash
node --test tests/next-action.test.mjs tests/ui-layout-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 10: Run full tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add app/runtime.mjs app/main.js app/views/uebersicht.mjs app/i18n.js app/icons.js app/styles.css tests/ui-layout-contract.test.mjs
git commit -m "feat: kopiere Next-Action-Agentenprompt"
```

---

### Task 5: Browser-Verifikation und Abschluss

**Files:**
- No planned source edits unless verification reveals a defect.

- [ ] **Step 1: Run all deterministic checks**

Run:

```bash
npm test
npm run validate:fixtures
npm run validate:master
```

Expected: all commands PASS.

- [ ] **Step 2: Start local app server**

Run:

```bash
python3 serve_app.py
```

Expected: server prints a localhost URL, typically `http://localhost:8765`. Keep the session running until browser verification is complete.

- [ ] **Step 3: Open the app in the browser**

Use the Browser plugin or the Playwright skill to open:

```text
http://localhost:8765
```

Expected:

- Work status shows validation status, reload action, open-category navigation chip and one Next-Action copy button.
- The Next-Action copy button text starts with `Agenten-Prompt kopieren`.
- The open-category chip still navigates to the filtered transaction list.

- [ ] **Step 4: Verify clipboard success path**

In the browser, click `Agenten-Prompt kopieren`.

Expected:

- Button text changes briefly to `Prompt kopiert`.
- Clipboard content contains `app/docs/agent-context.md`.
- Clipboard content contains exactly one top-priority workflow instruction.
- Clipboard content does not contain `CONTEXT.md`, `docs/adr`, `docs/superpowers`, `Repo-Root` or `Projektroot`.

- [ ] **Step 5: Verify fallback path**

In the browser console, temporarily disable clipboard writing:

```js
navigator.clipboard.writeText = async () => { throw new Error("forced clipboard failure"); };
```

Click `Agenten-Prompt kopieren`.

Expected:

- A fallback panel titled `Agenten-Prompt` appears.
- The textarea contains the full prompt.
- `Details schließen` closes the fallback panel.

- [ ] **Step 6: Stop local app server**

Stop the server session with `Ctrl-C`.

Expected: server exits cleanly.

- [ ] **Step 7: Final git status**

Run:

```bash
git status --short
```

Expected: no unstaged or uncommitted changes except files intentionally left for user review.

- [ ] **Step 8: Commit verification fixes if any**

If browser verification required edits, commit them:

```bash
git add <changed-files>
git commit -m "fix: stabilisiere Next-Action-Prompt-UI"
```

If no edits were required, do not create an empty commit.

---

## Self-Review

**Spec coverage:** The plan covers the pure top-1 action derivation, prompt generation, App-only prompt references, skill injection, central `app/docs/agent-context.md`, skill cleanup, M6-M9 future guardrails, forbidden-reference guard test, Clipboard success/fallback UI, and verification.

**Placeholder scan:** The plan contains no placeholder markers, no unresolved options, and no steps that ask an implementer to invent missing behavior.

**Type consistency:** The plan consistently uses `buildNextAgentAction(data, options)`, `buildStatusSummary(data, options)`, `type`, `count`, `label`, `skillPath`, and `prompt` across tests, implementation and UI wiring.

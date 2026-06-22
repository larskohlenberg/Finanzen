import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNextAgentAction, buildNextAgentActions, buildStatusSummary, forbiddenPromptPatterns } from "../app/next-action.mjs";

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
  assert.equal(action.skillPath, "docs/skills/validierung-agent.md");
  assert.match(action.prompt, /tools\/validator\.mjs/);
  assert.match(action.prompt, /docs\/skills\/validierung-agent\.md/);
});

test("validation action does not inspect malformed lower-priority collections", () => {
  let action;

  assert.doesNotThrow(() => {
    action = buildNextAgentAction(baseData({
      validation: { valid: false, errors: ["kaputt"] },
      transaktionen: {},
      regelzahlungen: {},
      zeitwerte: {},
    }));
  });

  assert.equal(action.type, "validation-errors");
  assert.equal(action.count, 1);
});

test("validation action does not inspect malformed lower-priority rows", () => {
  let action;

  assert.doesNotThrow(() => {
    action = buildNextAgentAction(baseData({
      validation: { valid: false, errors: ["kaputt"] },
      transaktionen: [null],
      regelzahlungen: [null],
    }));
  });

  assert.equal(action.type, "validation-errors");
  assert.equal(action.count, 1);
});

test("next action priority orders all supported action types", () => {
  const cases = [
    {
      data: baseData({ importfehler: [{ reason: "parse" }], transaktionen: [{ kategorisierung_status: "offen" }] }),
      expected: ["import-errors", "docs/skills/import-agent.md"],
    },
    {
      data: baseData({ transaktionen: [{ kategorisierung_status: "offen" }, { kategorisierung_status: "vorgeschlagen" }] }),
      expected: ["suggested-categories", "docs/skills/kategorisierung-review.md"],
    },
    {
      data: baseData({ transaktionen: [{ kategorisierung_status: "vorgeschlagen" }] }),
      expected: ["suggested-categories", "docs/skills/kategorisierung-review.md"],
    },
    {
      data: baseData({ regelzahlungen: [{ status: "vorgeschlagen" }] }),
      expected: ["suggested-regular-payments", "docs/skills/regelzahlung-agent.md"],
    },
    {
      data: baseData({ konten: [{ konto_id: "KTO-1", name: "Giro", kontotyp: "giro", status: "aktiv" }] }),
      options: { vermoegenChecks: [{ art: "anker-fehlt", entitaet: "konto", entitaet_id: "KTO-1" }] },
      expected: ["wealth-checks", "docs/skills/stammdaten-erfassung-agent.md"],
    },
  ];

  for (const { data, options, expected } of cases) {
    const action = buildNextAgentAction(data, options);
    assert.equal(action.type, expected[0]);
    assert.equal(action.skillPath, expected[1]);
  }
});

test("next action candidates include every available prompt in priority order", () => {
  const actions = buildNextAgentActions(baseData({
    transaktionen: [
      { kategorisierung_status: "offen" },
      { kategorisierung_status: "vorgeschlagen" },
    ],
    regelzahlungen: [{ status: "vorgeschlagen" }],
  }), {
    vermoegenChecks: [{ art: "anker-fehlt", entitaet: "konto", entitaet_id: "KTO-1" }],
  });

  assert.deepEqual(actions.map((action) => action.type), [
    "suggested-categories",
    "suggested-regular-payments",
    "open-categories",
    "wealth-checks",
  ]);
  assert.ok(actions.every((action) => action.prompt.includes(action.skillPath)));
});

test("suggested category review outranks open category rule work", () => {
  const action = buildNextAgentAction(baseData({
    transaktionen: [
      { kategorisierung_status: "offen" },
      { kategorisierung_status: "vorgeschlagen" },
    ],
  }), { vermoegenChecks: [] });

  assert.equal(action.type, "suggested-categories");
  assert.match(action.prompt, /docs\/skills\/kategorisierung-review\.md/);
});

test("prompts use app-relative documentation paths for Hermes agents", () => {
  const action = buildNextAgentAction(baseData({
    transaktionen: [{ kategorisierung_status: "vorgeschlagen" }],
  }), { vermoegenChecks: [] });

  assert.match(action.prompt, /docs\/agent-context\.md/);
  assert.match(action.prompt, /docs\/skills\/kategorisierung-review\.md/);
  assert.doesNotMatch(action.prompt, /app\/docs\/agent-context\.md/);
  assert.doesNotMatch(action.prompt, /app\/docs\/skills\/kategorisierung-review\.md/);
  assert.doesNotMatch(action.prompt, /app\/(?:data|schemas|tools)\//);
});

test("all action prompts omit forbidden root documentation patterns", () => {
  const cases = [
    baseData({ validation: { valid: false, errors: ["kaputt"] } }),
    baseData({ importfehler: [{ reason: "parse" }] }),
    baseData({ transaktionen: [{ kategorisierung_status: "offen" }] }),
    baseData({ transaktionen: [{ kategorisierung_status: "vorgeschlagen" }] }),
    baseData({ regelzahlungen: [{ status: "vorgeschlagen" }] }),
    baseData(),
  ];
  const options = [
    { vermoegenChecks: [] },
    { vermoegenChecks: [] },
    { vermoegenChecks: [] },
    { vermoegenChecks: [] },
    { vermoegenChecks: [] },
    { vermoegenChecks: [{ art: "anker-fehlt", entitaet: "konto", entitaet_id: "KTO-1" }] },
  ];

  for (const [index, data] of cases.entries()) {
    const action = buildNextAgentAction(data, options[index]);

    assert.notEqual(action.prompt, "");
    assert.doesNotMatch(action.prompt, /app\/(?:docs|data|schemas|tools)\//);
    for (const pattern of forbiddenPromptPatterns) {
      assert.doesNotMatch(action.prompt, pattern);
    }
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
  assert.match(action.prompt, /docs\/agent-context\.md/);
  assert.match(action.prompt, /docs\/skills\/kategorisierungsregel-pflege\.md/);
  assert.match(action.prompt, /2 offene Kategorien/);
  assert.doesNotMatch(action.prompt, /docs\/skills\/kategorisierung-review\.md/);
  for (const pattern of forbiddenPromptPatterns) {
    assert.doesNotMatch(action.prompt, pattern);
  }
});

test("loan-without-rate check prompt also names regelzahlung skill", () => {
  const action = buildNextAgentAction(baseData(), {
    vermoegenChecks: [{ art: "darlehen-ohne-regelzahlung", entitaet: "darlehen", entitaet_id: "DAR-1" }],
  });

  assert.equal(action.type, "wealth-checks");
  assert.match(action.prompt, /docs\/skills\/stammdaten-erfassung-agent\.md/);
  assert.match(action.prompt, /docs\/skills\/regelzahlung-agent\.md/);
});

test("ein Szenario-Entwurf erzeugt keine Next-Action (Pull, nicht Push)", () => {
  const data = baseData({
    szenarien: [{ szenario_id: "SZN-001", name: "Test", status: "entwurf", stand: "2026-06-01", reichweite_bis: "2026-12-31", erstellt_am: "2026-06-01", annahmen: [] }],
  });
  assert.deepEqual(buildNextAgentActions(data, { vermoegenChecks: [] }), []);
  assert.equal(buildNextAgentAction(data, { vermoegenChecks: [] }).type, "none");
});

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

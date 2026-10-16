# Next Action Prompt Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a compact prompt menu so the recommended Next Action remains one click, while all other currently available Agent prompts can also be copied.

**Architecture:** Extend `app/next-action.mjs` from top-1 derivation to a reusable ordered candidate list, then keep `buildNextAgentAction()` as a compatibility wrapper returning the first candidate. Update `app/main.js` to render a split prompt control and copy prompts by `type`; tests lock priority, prompt content, and UI contract.

**Tech Stack:** Browser ESM, Node `node:test`, static HTML/CSS, existing clipboard fallback state in `app/runtime.mjs`.

---

### Task 1: Next-Action Candidate Model

**Files:**
- Modify: `app/next-action.mjs`
- Modify: `tests/next-action.test.mjs`

- [ ] **Step 1: Write failing tests**

Add tests that assert:

```js
test("suggested category review outranks open category rule work", () => {
  const action = buildNextAgentAction(baseData({
    transaktionen: [
      { kategorisierung_status: "offen" },
      { kategorisierung_status: "vorgeschlagen" },
    ],
  }), { vermoegenChecks: [] });

  assert.equal(action.type, "suggested-categories");
  assert.match(action.prompt, /app\/docs\/skills\/kategorisierung-review\.md/);
});

test("next action candidates include every available prompt in priority order", () => {
  const actions = buildNextAgentActions(baseData({
    transaktionen: [
      { kategorisierung_status: "offen" },
      { kategorisierung_status: "vorgeschlagen" },
    ],
    regelzahlungen: [{ status: "vorgeschlagen" }],
  }), { vermoegenChecks: [{ art: "anker-fehlt", entitaet: "konto", entitaet_id: "KTO-1" }] });

  assert.deepEqual(actions.map((action) => action.type), [
    "suggested-categories",
    "suggested-regular-payments",
    "open-categories",
    "wealth-checks",
  ]);
  assert.ok(actions.every((action) => action.prompt.includes(action.skillPath)));
});
```

- [ ] **Step 2: Verify red**

Run:

```bash
node --test tests/next-action.test.mjs
```

Expected: fail because `buildNextAgentActions` is not exported and/or current priority still returns `open-categories`.

- [ ] **Step 3: Implement candidate list**

Export `buildNextAgentActions(data, options = {})`, append candidates in the new priority order, and keep `buildNextAgentAction()` returning the first candidate or done state.

- [ ] **Step 4: Verify green**

Run:

```bash
node --test tests/next-action.test.mjs
```

Expected: all tests in the file pass.

### Task 2: Prompt Menu UI Contract

**Files:**
- Modify: `app/main.js`
- Modify: `app/runtime.mjs`
- Modify: `app/styles.css`
- Modify: `tests/ui-layout-contract.test.mjs`

- [ ] **Step 1: Write failing UI contract tests**

Assert that `main.js` imports `buildNextAgentActions`, renders menu controls with `data-action="toggle-next-action-menu"` and `data-next-action-type`, and has a copy handler that selects prompts by type.

- [ ] **Step 2: Verify red**

Run:

```bash
node --test tests/ui-layout-contract.test.mjs
```

Expected: fail because the menu controls do not exist yet.

- [ ] **Step 3: Implement UI state and rendering**

Add `state.nextActionMenuOpen`, render a compact split control when multiple candidates exist, and render menu entries for all candidates.

- [ ] **Step 4: Implement copy by type**

Change `copyNextAgentPrompt()` to accept an optional action type. The main button copies the first candidate. Menu entries copy the selected candidate. Clipboard success/fallback stays shared.

- [ ] **Step 5: Verify green**

Run:

```bash
node --test tests/ui-layout-contract.test.mjs tests/next-action.test.mjs
```

Expected: all selected tests pass.

### Task 3: Full Verification

**Files:**
- No additional planned files.

- [ ] **Step 1: Run full tests**

```bash
npm test
```

Expected: 0 failures.

- [ ] **Step 2: Run validators**

```bash
npm run validate:fixtures
npm run validate:master
```

Expected: both pass.

- [ ] **Step 3: Run app-doc guard scan**

```bash
rg -n "CONTEXT\.md|docs/adr|docs/superpowers|Repo-Root|Projektroot" app/docs/agent-context.md app/docs/skills
```

Expected: no matches.

# Agent-first Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Agent-first import contract and a small deterministic writer/verifier that can apply a structured import proposal to the V1 workbook safely.

**Architecture:** The agent remains responsible for reading the source file, understanding its structure, and producing a structured proposal. `importWriterVerifier.mjs` validates that proposal against the workbook's existing V1 tables, appends rows only to known tables, exports a new workbook, and returns a verification report. The writer does not parse bank formats and does not make final category, transfer, or finance decisions.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, `@oai/artifact-tool`, existing `Finanzmodell_V1_Startmappe.xlsx`.

---

### Task 1: Import Protocol Documentation

**Files:**
- Create: `workbook-build/agentImportProtocol.md`
- Create: `workbook-build/agentImportPrompt.md`

- [x] **Step 1: Write protocol doc**

Create `workbook-build/agentImportProtocol.md` with:

```markdown
# Agent Import Protocol

The import agent reads a source file and the current workbook, then returns one JSON-compatible proposal object.

Required top-level fields:
- `sourceRow`
- `importRun`
- `rawTransactions`
- `modelTransactions`
- `warnings`
- `checks`
- `questions`

The writer accepts only these target tables:
- `90_Quellen`
- `10_Importlaeufe`
- `10_Umsaetze_Roh`
- `11_Umsaetze_Modell`
- `60_Warnungen_Aktuell`
- `99_Checks`

The proposal must not contain final financial metrics, activated transfer rules, activated recurring-payment rules, or new workbook columns.
```

- [x] **Step 2: Write agent prompt template**

Create `workbook-build/agentImportPrompt.md` instructing the import agent to inspect workbook tables first, parse the file second, then output the protocol object. It must explicitly say uncertainty becomes `KAT013`, warnings, checks, or `questions`.

### Task 2: Failing Tests For Writer/Verifier

**Files:**
- Create: `workbook-build/tests/importWriterVerifier.test.mjs`
- Create: `workbook-build/src/importWriterVerifier.mjs`

- [x] **Step 1: Write failing tests**

The test imports:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyImportProposal, validateImportProposal } from "../src/importWriterVerifier.mjs";
```

It defines a valid proposal with one source row, one import run, two raw transactions, two model transactions, one warning, and one check.

Expected behaviors:
- `validateImportProposal(validProposal).valid === true`
- invalid top-level sections fail validation
- new/unknown target fields fail validation
- `applyImportProposal` exports a workbook and returns a report with appended row counts
- the exported workbook contains the new `Import_ID`, `Rohumsatz_ID`, `Transaktion_ID`, `Quelle_ID`, and `Check_ID`

- [x] **Step 2: Run tests and verify RED**

Run:

```bash
/Users/larskohlenberg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test workbook-build/tests/importWriterVerifier.test.mjs
```

Expected: fail because `../src/importWriterVerifier.mjs` does not exist or does not export the functions.

### Task 3: Minimal Writer/Verifier

**Files:**
- Create: `workbook-build/src/importWriterVerifier.mjs`

- [x] **Step 1: Implement proposal schema constants**

Export:

```js
export const allowedSections = [
  "sourceRow",
  "importRun",
  "rawTransactions",
  "modelTransactions",
  "warnings",
  "checks",
  "questions",
];
```

Also define allowed column names for the six accepted target tables exactly as used in the V1 workbook.

- [x] **Step 2: Implement `validateImportProposal(proposal)`**

Return:

```js
{
  valid: boolean,
  errors: string[],
  warnings: string[]
}
```

Validation rules:
- all required top-level sections exist
- no unknown top-level section exists
- each object uses only allowed fields for its target table
- required IDs are present
- model transactions may use `KAT013`; this is not an error
- `questions` must be an array

- [x] **Step 3: Implement `applyImportProposal(options)`**

Signature:

```js
export async function applyImportProposal({
  workbookPath,
  outputPath,
  proposal,
})
```

Behavior:
- load workbook with `SpreadsheetFile.importXlsx`
- validate proposal first
- append rows to existing worksheet tables by writing below current non-empty region
- preserve current workbook content
- recalculate workbook
- export to `outputPath`
- return appended counts and validation report

- [x] **Step 4: Run tests and verify GREEN**

Run the same `node --test` command.

Expected: all tests pass.

### Task 4: Final Verification

**Files:**
- Modify: `workbook-build/verify_finanzmodell_v1.mjs` only if needed

- [x] **Step 1: Run focused writer tests**

Run:

```bash
/Users/larskohlenberg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test workbook-build/tests/importWriterVerifier.test.mjs
```

Expected: pass.

- [x] **Step 2: Run existing workbook verifier**

Run:

```bash
/Users/larskohlenberg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node workbook-build/verify_finanzmodell_v1.mjs
```

Expected: 20 checks with `status: "ok"`.

- [x] **Step 3: Inspect generated import-output workbook**

Reimport the test output workbook and inspect relevant ranges:

```bash
/Users/larskohlenberg/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node -e "import('@oai/artifact-tool').then(async ({FileBlob, SpreadsheetFile}) => { const input = await FileBlob.load('/tmp/.../agent_import_output.xlsx'); const wb = await SpreadsheetFile.importXlsx(input); console.log((await wb.inspect({kind:'match', searchTerm:'IMP-20260601-001|RAW-IMP-20260601-001-000001|TXN-RAW-IMP-20260601-001-000001|CHK-IMPORT-AGENT-001', options:{useRegex:true,maxResults:20}})).ndjson); })"
```

Expected: matches for all imported IDs.

### Task 5: Documentation Update

**Files:**
- Modify: `Finanzmodell_Entscheidungsprotokoll.md` if implementation discovers a new decision
- Modify: `sparring/finanzmodell-excel-spezifikation/FINAL_ARTIFACT/Finanzmodell_Entscheidungsprotokoll.md` if implementation discovers a new decision

- [x] **Step 1: Only update decisions if behavior changes**

No update is needed if implementation follows the existing Agent-first Hybrid decision exactly.

### Task 6: Limited Real-CSV Durchstich

**Files:**
- Create: `workbook-build/src/agentCsvProposalDraft.mjs`
- Create: `workbook-build/tests/agentCsvProposalDraft.test.mjs`
- Create: `workbook-build/src/limitedAgentDraftImportRunner.mjs`
- Create: `workbook-build/tests/limitedAgentDraftImportRunner.test.mjs`
- Create: `workbook-build/run_limited_agent_draft_import.mjs`

- [x] **Step 1: Build a bounded draft harness**

The draft harness is a technical thin slice, not the final import intelligence. It simulates a structured agent proposal for a small CSV subset, leaves categories open as `KAT013`, marks transfer candidates as uncertain, and writes only through `importWriterVerifier.mjs`.

- [x] **Step 2: Run the first real 10-row workbook copy**

Generated:

```text
outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_AgentDraft_10Rows.xlsx
```

Result:
- validation valid
- 1 source row
- 1 import run
- 10 raw transactions
- 10 model transactions
- 1 warning
- 1 check
- 2 open questions
- ID evidence found
- 0 formula-error matches

### Task 7: Full Real-CSV Draft Copy

**Files:**
- Modify: `workbook-build/src/importWriterVerifier.mjs`
- Modify: `workbook-build/tests/importWorkbookContext.test.mjs`
- Create: `workbook-build/run_full_agent_draft_import.mjs`

- [x] **Step 1: Remove the small-table scan limit for import context**

The first large-import regression test failed because the workbook context only scanned fixed small table windows. The shared import table layouts now scan to row 10000, so later agent runs can still see IDs written beyond the first 500 rows.

- [x] **Step 2: Generate the full CSV draft workbook copy**

Generated:

```text
outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_AgentDraft_Full.xlsx
```

Result:
- validation valid
- 1 source row
- 1 import run
- 2578 raw transactions
- 2578 model transactions
- 1 warning
- 1 check
- 2 open questions
- last raw and model transaction IDs found in workbook context
- 0 formula-error matches

### Task 8: Analysis Draft Suggestions

**Files:**
- Create: `workbook-build/src/analysisSuggestionWriterVerifier.mjs`
- Create: `workbook-build/src/agentAnalysisProposalDraft.mjs`
- Create: `workbook-build/tests/analysisSuggestionWriterVerifier.test.mjs`
- Create: `workbook-build/tests/agentAnalysisProposalDraft.test.mjs`
- Create: `workbook-build/run_full_agent_analysis_draft.mjs`

- [x] **Step 1: Add a narrow suggestion writer**

The analysis writer is separate from the import writer. It writes only append-only suggestions to:
- `12_Regelzahlung_Vorschlaege`
- `73_Agent_Vorschlaege`

It does not write final categories, transfer rules, regular payments, cashflow, liquidity, or dashboard metrics.

- [x] **Step 2: Generate analysis suggestions from the full import draft**

Generated:

```text
outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_AgentDraft_Full_Analysis.xlsx
```

Result:
- 2578 rows analyzed
- 50 recurring-payment suggestions in `12_Regelzahlung_Vorschlaege`
- 86 mirrored/decision suggestions in `73_Agent_Vorschlaege`
- 11 transfer-rule candidates
- 25 category-mapping candidates
- expected suggestion IDs and suggestion types found
- 0 formula-error matches

### Task 9: Proposal Review Workbook

**Files:**
- Create: `workbook-build/src/proposalReviewWorkbook.mjs`
- Create: `workbook-build/tests/proposalReviewWorkbook.test.mjs`
- Create: `workbook-build/build_proposal_review_workbook.mjs`

- [x] **Step 1: Create a separate review artifact**

The review workbook is intentionally separate from the finance model. It does not update model tables and does not accept or reject suggestions. It provides an editable decision column and a compact summary for the user.

Generated:

```text
outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Vorschlagsreview.xlsx
```

Result:
- 86 analysis-run suggestions included
- 50 recurring-payment suggestions
- 11 transfer suggestions
- 25 category-mapping suggestions
- editable decision column present
- raw suggestion sheets included for traceability
- 0 formula-error matches

### Task 10: Review Decision Plan

**Files:**
- Modify: `workbook-build/src/proposalReviewWorkbook.mjs`
- Create: `workbook-build/src/reviewDecisionPlan.mjs`
- Create: `workbook-build/tests/reviewDecisionPlan.test.mjs`
- Create: `workbook-build/build_review_decision_plan.mjs`

- [x] **Step 1: Add implementation input columns to the review workbook**

`Review_Liste` now contains target fields for later implementation decisions:
- `Ziel_Kategorie_ID`
- `Ziel_Person_ID`
- `Ziel_Konto_ID`
- `Ziel_Transfer_Typ`
- `Entscheidung_Notiz`

- [x] **Step 2: Build a no-mutation implementation plan**

Generated:

```text
outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Review_Entscheidungsplan.xlsx
```

Result:
- review decisions can be read and validated
- accepted regular-payment decisions can be converted into proposed `12_Regelzahlungen` rows
- transfer and category decisions are not directly implemented yet
- current real review file has 0 accepted decisions, so the generated plan is intentionally no-op
- 0 formula-error matches

### Task 11: Decision Plan Preflight

**Files:**
- Modify: `workbook-build/src/reviewDecisionPlan.mjs`
- Modify: `workbook-build/tests/reviewDecisionPlan.test.mjs`
- Create: `workbook-build/preflight_review_decision_plan.mjs`

- [x] **Step 1: Add preflight before any finance workbook write**

The preflight reads the generated decision plan and the finance workbook, then checks:
- planned regular-payment row count
- existing `REG` IDs in the finance workbook
- duplicate planned IDs
- missing required regular-payment fields
- whether safe row insertion is required because `12_Regelzahlungen` shares a sheet with `12_Regelzahlung_Vorschlaege`

- [x] **Step 2: Run preflight on the current real review plan**

Current result:
- valid
- 0 planned regular payments
- existing finance rule ID: `REG001`
- 0 duplicate rule IDs
- no row insertion required because no decisions are accepted yet

### Task 12: Apply Review Decision Plan To Finance Copy

**Files:**
- Modify: `workbook-build/src/reviewDecisionPlan.mjs`
- Modify: `workbook-build/tests/reviewDecisionPlan.test.mjs`
- Create: `workbook-build/apply_review_decision_plan_to_finance_copy.mjs`

- [x] **Step 1: Add copy-only apply path**

Accepted regular payments can now be written to a separate finance workbook copy after a valid preflight. The writer:
- rejects duplicate `REG` IDs
- rejects missing required fields
- writes only planned regular payments
- does not implement transfers or category mappings
- does not write to the original start workbook
- refuses writes that would require unsafe overwriting of the adjacent `12_Regelzahlung_Vorschlaege` table

- [x] **Step 2: Run apply on the current real no-op decision plan**

Generated:

```text
outputs/finanzmodell-v1-startmappe/Finanzmodell_V1_Applied_Review_NoOp.xlsx
```

Current result:
- valid
- 0 regular payments applied
- no `REG1001` in the output copy
- 0 formula-error matches

### Task 13: Regular-Payment Apply Capacity Guard

**Files:**
- Modify: `workbook-build/src/reviewDecisionPlan.mjs`
- Modify: `workbook-build/tests/reviewDecisionPlan.test.mjs`

- [x] **Step 1: Count safe blank-row capacity before writing**

The preflight now reports:
- append row
- last safe row before `12_Regelzahlung_Vorschlaege`
- available blank rows
- whether the planned write is possible without row insertion
- whether row insertion is required

- [x] **Step 2: Block over-capacity writes**

Current V1 structure has 2 safe blank rows under `12_Regelzahlungen` before the adjacent `12_Regelzahlung_Vorschlaege` table begins. Therefore:
- 0 accepted regular payments = no-op
- 1 or 2 accepted regular payments = safe copy-write possible
- 3+ accepted regular payments = blocked until safe row insertion or workbook layout expansion is implemented

Verification:
- accepted 1-row plan is writable
- accepted 3-row plan is blocked with capacity error
- duplicate `REG` IDs are still blocked
- real no-op copy contains no `REG1001`
- 0 formula-error matches

### Task 14: Explicit Layout Expansion For Regular-Payment Apply

**Files:**
- Modify: `workbook-build/src/reviewDecisionPlan.mjs`
- Modify: `workbook-build/tests/reviewDecisionPlan.test.mjs`

- [x] **Step 1: Keep default apply conservative**

Default apply still blocks when accepted regular payments exceed the current blank-row capacity under `12_Regelzahlungen`.

- [x] **Step 2: Add explicit copy-only layout expansion**

`applyReviewDecisionPlanToFinanceCopy({ allowLayoutExpansion: true })` can now expand the `12_Regelzahlungen` area in a workbook copy by shifting the adjacent `12_Regelzahlung_Vorschlaege` block down before writing. This keeps the operation explicit and prevents silent overwrites.

Verification:
- 3 accepted regular payments are blocked without layout expansion
- 3 accepted regular payments are applied with explicit layout expansion
- shifted suggestion block remains findable
- real no-op apply still writes 0 regular payments
- real no-op copy contains no `REG1001`
- 0 formula-error matches

### Task 15: Accepted Category And Transfer Decisions As Plan Sheets

**Files:**
- Modify: `workbook-build/src/reviewDecisionPlan.mjs`
- Modify: `workbook-build/tests/reviewDecisionPlan.test.mjs`

- [x] **Step 1: Treat accepted category mappings and transfer rules as supported plan outputs**

Accepted `Kategorie_Mapping` and `neue_Transferregel` review decisions are no longer treated as unsupported. The decision plan now validates their required target fields and writes them to separate plan-only sheets:
- `Angenommene_Kategorie_Mappings`
- `Angenommene_Transferregeln`

- [x] **Step 2: Keep finance workbook writes deliberately narrower**

The copy-only apply path still writes only accepted regular-payment rows. Category mappings and transfer rules remain plan artifacts with `nicht_in_modell_geschrieben` markers until their target-model write semantics are explicitly designed and reviewed.

Verification:
- accepted category mapping creates a plan row with target category/person context
- accepted transfer rule creates a plan row with target transfer/account context
- these accepted types are not counted as blocked decisions
- no direct finance workbook write was added for these types

### Task 16: Review Workbook Dropdowns From Model Stammdaten

**Files:**
- Modify: `workbook-build/src/proposalReviewWorkbook.mjs`
- Modify: `workbook-build/tests/proposalReviewWorkbook.test.mjs`

- [x] **Step 1: Add helper list sheet**

The proposal review workbook now includes `Review_Listen` with controlled values for:
- decision status
- category IDs from `02_Kategorien`
- person IDs from `01_Personen`
- account IDs from `03_Konten`
- transfer decision types

- [x] **Step 2: Apply dropdown validation to editable review fields**

`Review_Liste` now exports XLSX data validations for:
- `Entscheidung`
- `Ziel_Kategorie_ID`
- `Ziel_Person_ID`
- `Ziel_Konto_ID`
- `Ziel_Transfer_Typ`

This keeps manual review editable while reducing typo risk before the agent/writer consumes accepted decisions.

### Task 17: Review Workbook Completeness Checks

**Files:**
- Modify: `workbook-build/src/proposalReviewWorkbook.mjs`
- Modify: `workbook-build/tests/proposalReviewWorkbook.test.mjs`

- [x] **Step 1: Add visible check columns**

`Review_Liste` now includes two formula-driven columns after the editable/input columns:
- `Check_Status`
- `Pflichtfeld_Hinweis`

- [x] **Step 2: Mirror decision-plan validation rules for manual review**

The formulas mark accepted rows as incomplete when required target fields are missing:
- accepted `neue_Regelzahlung`: requires `Ziel_Kategorie_ID` and `Ziel_Person_ID`
- accepted `Kategorie_Mapping`: requires `Ziel_Kategorie_ID`
- accepted `neue_Transferregel`: requires `Ziel_Transfer_Typ`

This gives immediate workbook-side feedback before an agent or writer builds the formal decision plan.

### Task 18: Review Summary Progress Metrics

**Files:**
- Modify: `workbook-build/src/proposalReviewWorkbook.mjs`
- Modify: `workbook-build/tests/proposalReviewWorkbook.test.mjs`

- [x] **Step 1: Add live progress block to Summary**

The proposal review workbook summary now includes a `Review-Fortschritt` block with formula-driven counts for:
- open decisions
- accepted decisions
- rejected decisions
- merged decisions
- deferred decisions
- incomplete accepted decisions

- [x] **Step 2: Link progress metrics to Review_Liste**

The progress formulas read directly from `Review_Liste`, including the workbook-side `Check_Status` column. This makes the first sheet useful as a work queue while the user manually reviews proposals.

### Task 19: Machine-Readable Review Status

**Files:**
- Modify: `workbook-build/src/reviewDecisionPlan.mjs`
- Modify: `workbook-build/tests/reviewDecisionPlan.test.mjs`
- Create: `workbook-build/summarize_review_workbook.mjs`

- [x] **Step 1: Add status reporter for Review_Liste**

`summarizeReviewWorkbook` now reads all proposal rows from `Review_Liste`, including open rows, and returns:
- total decisions
- open, accepted, rejected, merged, and deferred counts
- accepted counts by supported implementation type
- incomplete accepted decisions with missing target fields
- validation result and `readyForDecisionPlan`

- [x] **Step 2: Add CLI status script**

`workbook-build/summarize_review_workbook.mjs` prints the current review status as JSON. Current real review status:
- 86 total decisions
- 86 open
- 0 accepted
- 0 incomplete accepted
- validation ok

### Task 20: Review Status Embedded In Decision Plan

**Files:**
- Modify: `workbook-build/src/reviewDecisionPlan.mjs`
- Modify: `workbook-build/tests/reviewDecisionPlan.test.mjs`

- [x] **Step 1: Add `Review_Status` sheet to decision plans**

Every generated decision plan now carries a status snapshot from the source review workbook:
- source workbook path
- total/open/accepted/rejected/merged/deferred counts
- accepted counts by supported implementation type
- incomplete accepted count
- validation result
- `readyForDecisionPlan`

- [x] **Step 2: Include review status in builder report**

`buildReviewDecisionPlan` returns the same status snapshot alongside validation and output counts. This keeps CLI output, generated workbook, and tests aligned.

### Task 21: Apply Audit Sheet In Finance Copy

**Files:**
- Modify: `workbook-build/src/reviewDecisionPlan.mjs`
- Modify: `workbook-build/tests/reviewDecisionPlan.test.mjs`

- [x] **Step 1: Add copy-local apply audit sheet**

`applyReviewDecisionPlanToFinanceCopy` now writes `99_Review_Apply_Audit` into the generated finance workbook copy. The sheet records:
- source finance workbook path
- decision plan path
- output path
- validation status and warning count
- planned and applied regular-payment counts
- layout-expansion permission and actual expanded rows
- append row and blank-row capacity from preflight

- [x] **Step 2: Keep original workbook untouched**

The audit sheet is written only into the output copy. The original start workbook remains unchanged and continues to verify with the existing 23-sheet structure.

### Task 22: First Task-3 Financial Metrics

**Files:**
- Create: `workbook-build/src/formulas.mjs`
- Create: `workbook-build/tests/formulas.test.mjs`
- Modify: `workbook-build/build_finanzmodell_v1.mjs`
- Modify: `workbook-build/verify_finanzmodell_v1.mjs`

- [x] **Step 1: Add testable financial formula functions**

The first formula module now calculates:
- `Liquiditaet_heute` from liquid-relevant active account balances
- `Freie Liquiditaet nach Reserve` from liquidity minus the active safety-reserve assumption
- `Cashflow_Monat_ist` from non-transfer model transactions for the selected month

- [x] **Step 2: Surface first calculated values in the start workbook**

The start workbook now shows the first Task-3 values:
- Liquiditaet heute: `4250`
- Freie Liquiditaet nach Reserve: `1250`
- Cashflow Monat gesamt / Ist-Einstieg: `1038.68`

### Task 23: Task-3 Runway And Expected Cashflow

**Files:**
- Modify: `workbook-build/src/formulas.mjs`
- Modify: `workbook-build/tests/formulas.test.mjs`
- Modify: `workbook-build/build_finanzmodell_v1.mjs`
- Modify: `workbook-build/verify_finanzmodell_v1.mjs`

- [x] **Step 1: Extend formula module for forecast inputs**

The formula module now also calculates:
- `Cashflow_Monat_erwartet` from monthly regular-payment rows plus variable expense assumptions
- `Anteil Sonstiges / zu pruefen` from non-transfer expense rows assigned to `KAT013`
- `Reichweite` from free liquidity divided by expected monthly burn
- a first three-month scenario timeline from starting liquidity and expected net cashflow

- [x] **Step 2: Surface runway values in the workbook**

The start workbook now shows:
- expected monthly cashflow: `-2100`
- uncategorized expense share: `5.13%`
- runway in the standard scenario: `0.6` months
- timeline cumulative liquidity: `2150`, `50`, `-2050`

The forecast remains `teilberechnet` because the current model still uses a placeholder assumption for variable expenses and unconfirmed regular-payment candidates.

### Task 24: Forecast Quality Checks

**Files:**
- Modify: `workbook-build/build_finanzmodell_v1.mjs`
- Modify: `workbook-build/verify_finanzmodell_v1.mjs`

- [x] **Step 1: Add explicit prognosis risk checks**

The start workbook now records two additional open checks:
- `CHK015`: expected cashflow and runway use an unconfirmed regular-payment candidate (`REG001`)
- `CHK016`: the three-month standard scenario falls below zero liquidity in `MON202607`

- [x] **Step 2: Surface prognosis risks in warnings and dashboard**

The warning views now include those prognosis risks, and the dashboard open-check count increased from `5` to `7` with warning count `6`.

### Task 25: Verified Workbook Copy

**Files:**
- Create: `workbook-build/src/buildVerificationWorkbook.mjs`
- Create: `workbook-build/tests/buildVerificationWorkbook.test.mjs`
- Create: `workbook-build/write_verified_finanzmodell_v1.mjs`
- Modify: `workbook-build/build_finanzmodell_v1.mjs`
- Modify: `workbook-build/verify_finanzmodell_v1.mjs`

- [x] **Step 1: Make build verification reusable**

`verify_finanzmodell_v1.mjs` now exports `verifyFinanceWorkbook`, so the same verification checks can be used by scripts without duplicating verifier logic.

- [x] **Step 2: Write a verified copy after passed verification**

`write_verified_finanzmodell_v1.mjs` runs the workbook verifier first and only then writes `Finanzmodell_V1_Verifiziert.xlsx`.

The verified copy:
- sets `Kontrollstatus` to `bestanden`
- marks `CHK-BLD-01` as `erledigt`
- moves model status from red to yellow because only fachliche warnings remain open
- writes `99_Build_Verification_Audit`
- keeps the original start workbook unchanged as raw generated start state

### Task 26: Review Apply On Verified Workbook

**Files:**
- Create: `workbook-build/apply_review_decision_plan_to_verified_finance_copy.mjs`
- Modify: `workbook-build/tests/reviewDecisionPlan.test.mjs`

- [x] **Step 1: Add verified-base apply path**

The Review-Apply pipeline can now use `Finanzmodell_V1_Verifiziert.xlsx` as its finance base and write `Finanzmodell_V1_Verifiziert_Applied_Review_NoOp.xlsx`.

- [x] **Step 2: Preserve both audit trails**

The verified no-op apply copy keeps `99_Build_Verification_Audit`, adds `99_Review_Apply_Audit`, preserves `Kontrollstatus = bestanden`, and does not write `REG1001` while all review decisions remain open.

### Task 27: Release Pipeline Manifest

**Files:**
- Create: `workbook-build/src/releasePipeline.mjs`
- Create: `workbook-build/tests/releasePipeline.test.mjs`
- Create: `workbook-build/run_release_pipeline.mjs`

- [x] **Step 1: Add one-command release pipeline**

`run_release_pipeline.mjs` executes the current release build in dependency order:
1. start workbook
2. proposal review workbook
3. review decision plan
4. verified workbook
5. start-workbook review no-op apply
6. verified-workbook review no-op apply
7. final start workbook verifier

- [x] **Step 2: Write release manifest**

The pipeline writes `Finanzmodell_V1_Pipeline_Manifest.json` with:
- step status, exit code, duration, and output previews
- required workbook artifacts
- file sizes and SHA-256 hashes
- handoff marker `verified_apply_noop`

The current pipeline run completed with `status = ok`.

---

## Self-Review

Spec coverage:
- Agent-first role split is covered by protocol, prompt, writer, and verifier tasks.
- Writer safety is covered by field validation, append-only writes, and export verification.
- No final finance metrics or transfer/rule activation are implemented.

Placeholder scan:
- No `TBD` or undefined implementation placeholders remain.

Type consistency:
- `sourceRow`, `importRun`, `rawTransactions`, `modelTransactions`, `warnings`, `checks`, and `questions` are used consistently across docs, tests, and implementation plan.

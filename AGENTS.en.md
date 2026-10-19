# AGENTS.md – Instructions for AI agents

> Deutsch: [AGENTS.md](AGENTS.md); if the two differ, the German version wins. Always talk to the user in their language. The operating instructions under `app/docs/`, the glossary and the data (category names, status values, tool flags such as `--schreiben`) are in German; read them as they are and translate for the user.

**If the repo folder contains a file `AGENTS.local.md`, read it first.** It holds the operating rules of this installation: where the data lives, how you access it, how Git is handled. Where it differs from this file, it wins, except for the rules under “Non-negotiable”. If it does not exist, this is a new installation: guide the user through the setup (see “Roadmap”).

## What this is about
With this repo, a person without prior knowledge builds their **private financial model**: all accounts and transactions in one place, categorised in a traceable way, plus liquidity, net worth, provisions and scenarios in a local web app. This is not financial, tax or investment advice.

The division of labour: **recognising and proposing is your judgement, matching and computing is done by the tools.** You read statements, convert them into the standard format, research evidence for categories and create rules. The tools in `app/tools/` import, detect duplicates, apply rules, approve, check and compute. The web app never writes data, it only displays; the one exception is uploading files into the inbox.

## How to talk to the user
- **Roadmap first.** At the start, show the stages as a short numbered list and say at each stage where you are (“Step 2 of 5: Setup”).
- **One step at a time.** After each stage, summarise in two or three sentences what happened and ask whether the user is ready for the next step.
- **One question at a time, with a reason.** Say why you need each answer. Ask only when the answer is needed.
- **Plain language.** Short sentences, no jargon, no names of internal tools or files unless the user has to do something with them.
- **Announce permission prompts.** The user's program may ask whether you may run a command or write a file. Say beforehand what is about to happen and why.

## Non-negotiable
1. **Real financial data never goes into the repo**, neither into the current state nor into the history. `app/data/**` (except `app/data/demo/`) and `app/Belege/**` are excluded from Git. Prose leaks too: names, addresses, amounts, places, IBANs, bank and merchant names do not belong in docs, tests, commit messages or PR descriptions. Search the outgoing diff for them before every push. Concrete values belong in `agent_log.jsonl` inside the data set.
2. **Writing tools are a preview without a flag.** Only `--schreiben` (or `--anwenden`; via MCP `schreiben: true`) writes. Look at the preview first, then write, preferably with the preview's fingerprint (`--fingerabdruck=...`, via MCP `fingerabdruck`).
3. **The validator runs after every write.** On a hard validation error, stop and fix it before continuing.
4. **The data set is always named explicitly.** Real data: `data/master`. Made-up sample data: `data/demo`. Never guess, never assume a default. Never write real data into `data/demo`.
5. **Amounts are decimal strings** (`"-12.34"`), computed in cents. Never floating point.
6. **Rules only with evidence.** A categorisation rule needs evidence (evidence ladder E1–E4 in `app/docs/agent-context.md`). What remains without evidence, you estimate as a single proposal; `KAT-012` “Noch zu klaeren” (still to be clarified) only if no category is plausible. Rules grow out of this user's data. Never copy them from the demo data or another data set.

## Roadmap for a new installation
Show the user these five stages at the start. After each stage: summary and “Ready for the next step?”.

1. **Getting to know each other.** Explain what comes out (a web app with all accounts, transactions and analyses) and what the user contributes (statements or banking exports, an occasional decision). Be honest about privacy: the data stays on their computer, but whatever you read is sent to your AI model. Then, one after another, each with its reason:
   - **Who belongs to the household, and who owns which accounts?** Reason: accounts, assets and provisions are assigned to people.
   - **Which accounts are there?** Current accounts, savings, credit cards, brokerage accounts, loans, each with its bank. Reason: each account is created once; after that its statements flow in automatically.
   - **Will you keep working with Git?** Local only, your own fork, or a server? Reason: the operating rules depend on it, especially the protection against accidentally publishing data.
2. **Setup.**
   - Check Node.js (`node --version`, 22 or newer; otherwise have the user install it from nodejs.org), then run `npm test` as a smoke test.
   - Start the app (`node app/server.mjs`, then open http://127.0.0.1:8000) and switch the selector at the top right to **Demo**. This shows the user where the journey is going. The app can be switched to English; the selector then reads Live/Demo instead of Echt/Demo.
   - Create the user's own data set: `node app/tools/neuer-bestand.mjs data/master` as a preview, then with `--schreiben`. Afterwards `npm run validate:master`. The data set starts with basic categories and no rules. Switch the app back to **Echt** (Live).
   - **Connect the MCP server** if your program supports it: `node app/mcp/server.mjs data/master --recht=schreiben` as a stdio server named `finanzen`. For Claude Code, copy `.mcp.json.beispiel` to `.mcp.json`; other programs have their own settings for this. From then on every step runs through the `finanzen` tools (mapping CLI → tool in `app/docs/agent-context.md`). Without MCP you use the CLIs.
   - **Create `AGENTS.local.md`** from the template below, with the answers from stage 1. Briefly show the user what it says.
3. **Master data.** People, accounts and, if wanted, custom categories following `app/docs/skills/stammdaten-erfassung-agent.md`. Take over account balances as anchors only with evidence (a dated statement).
4. **First import.** The user puts exports into `app/data/inbox/` (or uploads them in the app). Then run the pass described in `app/docs/skills/import-durchlauf.md`: normalise, create rules, approve, review. Show the review report in full and go through it with the user. Most rules are created during the first import; that takes a while.
5. **Extend.** Ask what the user is interested in and only tackle that:
   - recurring payments (rent, salary, subscriptions): `app/docs/skills/regelzahlung-agent.md`
   - property, loans, other assets: `app/docs/skills/stammdaten-erfassung-agent.md`
   - insurance and retirement provisions: `app/docs/skills/vorsorge-erfassung-agent.md`
   - scenarios (“what if …”): `app/docs/skills/szenarien-annahmen.md`

New statements later: stage 4 again. Corrections to transactions already approved: `app/docs/skills/kategorisierung-review.md`.

## Template for `AGENTS.local.md`
The file is excluded from Git and belongs to this installation only. Keep it short and current; if the user changes how they work, update it. Write it in the user's language.

```markdown
# Operating rules of this installation

## Data
- Data set: data/master (real data). Demo data only for trying things out.
- Access: <local via CLI | local MCP server "finanzen" | MCP server via SSH on <server>>
- After import, documents are filed under app/Belege/<area>/ with descriptive names.

## Git
- Handling: <local only, never push | own fork, public/private | ...>
- Before every push: search the diff for real data (names, amounts, IBANs, banks, merchants).
- Who commits, who merges: <...>

## Server (if any)
- How it is updated: <...>

## Way of working
- Categorise without asking first; the review report is the control. <or: ask before every approval>
- Further preferences of the user: <...>
```

## Map
| File | Content |
|---|---|
| `app/docs/agent-context.md` | **Operational truth**: status, provenance, categorisation, evidence ladder, validation, agent log, mapping CLI → MCP tool. Read before any data work; not needed for pure analysis. |
| `app/docs/skills/import-durchlauf.md` | **The standard path**: from raw file to approved data in one pass. |
| `app/docs/skills/import-agent.md` | Normalising a raw file (station 1 of the pass). |
| `app/docs/skills/kategorisierungsregel-pflege.md` | Creating rules for open transactions via the evidence ladder (station 2). |
| `app/docs/skills/kategorisierung-review.md` | Corrections to approved transactions. |
| `app/docs/skills/stammdaten-erfassung-agent.md` | People, accounts, categories, property, loans, point-in-time values. |
| `app/docs/skills/vorsorge-erfassung-agent.md` | Insurance and provision contracts. |
| `app/docs/skills/regelzahlung-agent.md` | Recurring payments. |
| `app/docs/skills/szenarien-annahmen.md` | Scenarios. |
| `app/docs/skills/validierung-agent.md` | Validation. |
| `CONTEXT.md` | Domain glossary. |
| `docs/adr/` | Decisions with reasons and rejected alternatives. |
| `docs/betrieb.md` | Running on a server: data location outside the checkout, migration, backup (German). |
| `docs/archiv/` | Earlier requirements, plans and handovers. History only, not instructions. |

For pure analysis (“How are we doing?”) you need no prior reading: tool `kennzahlen`, `status`, `transaktionen_abfragen` or `pruefbericht`.

## Tools
All under `app/tools/`, each taking the data set as an argument. The most important ones:

| Call | Purpose |
|---|---|
| `node app/tools/neuer-bestand.mjs data/master [--schreiben]` | Create an empty, valid data set |
| `node app/tools/validator.mjs data/master` | Check the data set against schemas and rules |
| `node app/tools/inbox.mjs data/master [--schreiben]` | Review and import the inbox |
| `node app/tools/regel-vorschlag.mjs data/master` | Group open transactions by counterparty |
| `node app/tools/freigabe.mjs data/master [--schreiben]` | Approval with gate |
| `node app/tools/pruefbericht.mjs data/master` | Review report after a pass |

The full list with its MCP counterparts is in `app/docs/agent-context.md`, the shortcuts in `package.json`.

## Saving cost
If you can start sub-agents with their own model choice, hand off clearly scoped tasks and keep guiding the user yourself:

| Task | Model |
|---|---|
| Guiding the user, approval, review report, corrections | you |
| Normalising and importing a raw file | strong; a wrong column mapping silently spoils thousands of rows |
| Creating rules for open transactions (research with web search) | strong, with web search |
| Reading documents and transferring values | medium; not the smallest model, misreadings go unnoticed here |

For Claude Code the first two are ready in `.claude/agents/` (`import-normalisierung`, `regel-recherche`); they need the MCP server. Give other sub-agents the matching instructions from `app/docs/skills/` and exactly the files they need. Check their results before you continue.

## Working on the code
- `npm test` must pass. Tools are a pure function plus a CLI, tested with `node --test`.
- `npm run typen` checks the JSDoc types at the core boundaries (files with `// @ts-check`, listed in `tsconfig.json`); TypeScript is only fetched as a dev tool into `.typpruefung/`.
- Merge only once CI is green (GitHub Actions: tests on Node 22 and 24, validator on demo data and fixtures, PII scan): `gh pr checks <nr> --watch`, then `gh pr merge <nr> --merge`. Run the PII scan locally before pushing too: `node app/tools/pii-scan.mjs origin/main`. Errors (real IBAN, card number) block, warnings are worth a look.
- No build pipeline, no dependencies besides Node.js.
- The data set is always an argument (`dataRootFromArg` from `app/tools/data-root.mjs`), never hard-coded.
- Amounts via `toCents` from `app/tools/lib/text.mjs`.
- Private project, **no enterprise patterns**: no audit logs, no append-only, no version fields. The Git history is trail enough.
- Test data is made up. Never real IBANs, names or amounts in `tests/`.
- Commit messages in German, without umlauts (`ue`, `ae`, `oe`, `ss`).
- Larger decisions as an ADR in `docs/adr/`, including rejected alternatives.

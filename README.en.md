# Finanzen

**Build a private financial model with your AI agent**: import bank statements, categorise transactions in a traceable way, and see liquidity, net worth, retirement provisions and scenarios in a local web app.

[Deutsche Version](README.md)

## How to start
Open an AI agent that can read files and run commands (e.g. Claude Code, Codex, Gemini CLI) and write:

```
Download https://github.com/larskohlenberg/Finanzen, read AGENTS.md and guide me through it.
```

The agent first shows you the app with made-up sample data, then creates your own empty data set and walks you step by step through accounts, the first import and the analysis. It works best with a strong model.

The app can be switched between German and English. The agent instructions and the domain glossary are written in German; your agent reads them and talks to you in your language.

## What you get
- a web app in your browser with overview, transactions, liquidity, recurring payments, net worth, provisions, scenarios, documents and checks
- all transactions of your accounts in one place, without duplicates, each with a category and the reason it has that category
- categorisation rules that grow out of your own transactions and documents and keep learning with every import
- a review report after every import: what was approved automatically, what is still open, where account balances do not add up

## What you need
- a computer with macOS, Windows or Linux and [Node.js](https://nodejs.org) 22 or newer; nothing else to install
- statements or banking exports (CSV or PDF) of your accounts. There are deliberately no bank-specific parsers; the agent does the conversion
- optional for scanned documents: `pdftotext` (Poppler) and `tesseract`

## How it works
1. You put exports and documents into the inbox, either as files in a folder or via “Upload” in the app.
2. The agent converts each file into one standard format and imports it. The system detects duplicates by itself.
3. For open transactions the agent looks for evidence (invoice, contract, the merchant's website) and creates rules, e.g. “counterparty X → groceries”.
4. An approval gate decides what goes through without asking. You see the rest in the review report.
5. The app computes everything else: balances, liquidity forecast, net worth, provisions, scenarios.

Data is stored as plain JSON files validated against schemas. Every writing tool only shows a preview unless explicitly told to write, and the validator runs after every write.

## Privacy
- Your data lives in `app/data/master/` and `app/Belege/` on your computer. Both folders are excluded from Git.
- Whatever the agent reads to understand transactions and documents is sent to your agent's AI model.
- If you work with your own fork: before every push, check that no real data is in the diff, including docs, tests and commit messages.

## Running on your own server
The app can also run permanently on your own server, behind a reverse proxy with authentication; agents then access the data through an MCP server over SSH. See [app/README.md](app/README.md) and [ADR 0028](docs/adr/0028-betrieb-auf-eigener-vm.md) (both in German).

## For developers
No build pipeline. The app itself needs only Node.js; the only development dependency is Playwright for the browser tests (it uses the installed Chrome).

```bash
npm install
npm test
node app/server.mjs
```

Domain terms are in [CONTEXT.md](CONTEXT.md), decisions including rejected alternatives in [docs/adr/](docs/adr/), the operating instructions for agents in [app/docs/](app/docs/).

## Disclaimer
No financial, tax or investment advice. Categories, forecasts and scenarios are computational models based on your input; check the results yourself.

## License
MIT – see [LICENSE](LICENSE). You may use, modify and redistribute everything as long as the copyright notice is kept.

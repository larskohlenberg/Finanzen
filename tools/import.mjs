// tools/import.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateImportEntry } from "./import-format.mjs";
import { computeDedupeHash } from "./dedupe.mjs";
import { categorize } from "./categorizer.mjs";
import { matchTransfers } from "./transfer-matcher.mjs";
import { nextTransaktionId } from "./ids.mjs";

export function runImport({ entries, konten, kategorien, kategorisierungsregeln, transaktionen, transfers }) {
  const kontenIds = new Set(konten.map((k) => k.konto_id));
  const kategorienIds = new Set(kategorien.map((k) => k.kategorie_id));
  const working = [...transaktionen];
  const existingIds = new Set(working.map((tx) => tx.transaktion_id));
  const existingHashes = new Set(working.map((tx) => tx.dedupe_hash));

  const result = { written: [], skipped_dedupe: [], errors: [], transfers_matched: [] };

  entries.forEach((entry, index) => {
    const row = index + 1;

    const formatErrors = validateImportEntry(entry, kontenIds);
    if (formatErrors.length > 0) {
      result.errors.push({ row, reason: "format", detail: formatErrors.join("; "), raw: entry });
      return;
    }

    const dedupe_hash = computeDedupeHash(entry);
    if (existingHashes.has(dedupe_hash)) {
      result.skipped_dedupe.push({ row, dedupe_hash });
      return;
    }

    const verdict = categorize(entry, kategorisierungsregeln);
    if (verdict.kategorie_id && !kategorienIds.has(verdict.kategorie_id)) {
      result.errors.push({ row, reason: "kategorie_unbekannt", detail: `${verdict.kategorie_id} nicht in kategorien`, raw: entry });
      return;
    }

    const transaktion_id = nextTransaktionId(entry.buchungsdatum, existingIds);
    existingIds.add(transaktion_id);
    existingHashes.add(dedupe_hash);

    const transaktion = {
      transaktion_id,
      dedupe_hash,
      rohquelle: entry.rohquelle,
      konto_id: entry.konto_id,
      buchungsdatum: entry.buchungsdatum,
      betrag: entry.betrag,
      gegenpartei: entry.gegenpartei,
      verwendungszweck: entry.verwendungszweck,
      kategorisierung_status: verdict.status,
      ist_transfer: false,
    };
    if (verdict.kategorie_id) transaktion.kategorie_id = verdict.kategorie_id;
    if (Object.hasOwn(entry, "bank_referenz") && entry.bank_referenz) transaktion.bank_referenz = entry.bank_referenz;

    working.push(transaktion);
    result.written.push({ transaktion_id, kategorisierung_status: verdict.status });
  });

  const transferOutcome = matchTransfers(working, transfers);
  result.transfers_matched = transferOutcome.matched;

  return { result, transaktionen: working, transfers: transferOutcome.transfers };
}

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}
async function readJsonl(url) {
  const text = await readFile(url, "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Aufruf: node tools/import.mjs <pfad-zur-standardisierten.jsonl>");
    process.exitCode = 1;
    return;
  }
  const masterRoot = new URL("../data/master/", import.meta.url);
  const [konten, kategorien, transaktionen, transfers, kategorisierungsregeln] = await Promise.all([
    readJson(new URL("konten.json", masterRoot)),
    readJson(new URL("kategorien.json", masterRoot)),
    readJsonl(new URL("transaktionen.jsonl", masterRoot)),
    readJson(new URL("transfers.json", masterRoot)),
    readJson(new URL("kategorisierungsregeln.json", masterRoot)),
  ]);
  const entries = await readJsonl(new URL(inputPath.replace(/^\.?\//, ""), `file://${process.cwd()}/`));

  const out = runImport({ entries, konten, kategorien, kategorisierungsregeln, transaktionen, transfers });

  await writeFile(new URL("transaktionen.jsonl", masterRoot), out.transaktionen.map((tx) => JSON.stringify(tx)).join("\n") + "\n");
  await writeFile(new URL("transfers.json", masterRoot), JSON.stringify(out.transfers, null, 2) + "\n");

  console.log(JSON.stringify(out.result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

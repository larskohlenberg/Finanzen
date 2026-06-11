// app/tools/import.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { validateImportEntry } from "./import-format.mjs";
import { computeDedupeHash, disambiguateHash } from "./dedupe.mjs";
import { categorize } from "./categorizer.mjs";
import { matchTransfers } from "./transfer-matcher.mjs";
import { nextTransaktionId } from "./ids.mjs";

const optionalTransactionFields = [
  "wertstellungsdatum",
  "transaktionstyp",
  "kundenreferenz",
  "empfaenger",
  "empfaenger_iban",
  "mandatsreferenz",
  "glaeubiger_id",
];

export function runImport({ entries, konten, kategorien, kategorisierungsregeln, transaktionen, transfers }) {
  const kontenIds = new Set(konten.map((k) => k.konto_id));
  const kategorienIds = new Set(kategorien.map((k) => k.kategorie_id));
  const working = [...transaktionen];
  const existingIds = new Set(working.map((tx) => tx.transaktion_id));
  // Dedupe prueft gegen den BESTAND (Re-Import-Schutz), nicht innerhalb desselben
  // Auszugs — ein amtlicher Auszug enthaelt reale Buchungen, keine Importdubletten.
  const masterHashes = new Set(working.map((tx) => tx.dedupe_hash));
  // In diesem Lauf vergebene Hashes — zur Disambiguierung identischer Auszugszeilen.
  const runHashes = new Set();

  // bank_referenz taugt nur als Dedupe-Schluessel, wenn sie im Lauf dateiweit
  // EINDEUTIG ist. Manche Banken (MusterbankA) vergeben dieselbe Referenz auf verschiedenen
  // Buchungen — diese als Schluessel zu nutzen wuerde reale Buchungen verschmelzen.
  const refCount = new Map();
  for (const e of entries) {
    const ref = String(e?.bank_referenz ?? "").trim();
    if (ref) refCount.set(ref, (refCount.get(ref) ?? 0) + 1);
  }

  const result = { written: [], skipped_dedupe: [], disambiguated: [], errors: [], transfers_matched: [] };

  entries.forEach((entry, index) => {
    const row = index + 1;

    const formatErrors = validateImportEntry(entry, kontenIds);
    if (formatErrors.length > 0) {
      result.errors.push({ row, reason: "format", detail: formatErrors.join("; "), raw: entry });
      return;
    }

    const ref = String(entry.bank_referenz ?? "").trim();
    const refEindeutig = ref !== "" && refCount.get(ref) === 1;
    // Nicht-eindeutige Referenz fuer die Hash-Bildung ignorieren -> Freitext-Hash.
    const basisHash = computeDedupeHash(refEindeutig ? entry : { ...entry, bank_referenz: undefined });

    if (masterHashes.has(basisHash)) {
      result.skipped_dedupe.push({ row, dedupe_hash: basisHash });
      return;
    }

    const verdict = categorize(entry, kategorisierungsregeln);
    if (verdict.kategorie_id && !kategorienIds.has(verdict.kategorie_id)) {
      result.errors.push({ row, reason: "kategorie_unbekannt", detail: `${verdict.kategorie_id} nicht in kategorien`, raw: entry });
      return;
    }

    // Identische Quellzeile im selben Auszug: nicht verwerfen, sondern Hash
    // disambiguieren (beide Buchungen sind Fakten, Validator verlangt eindeutige Hashes).
    let dedupe_hash = basisHash;
    if (runHashes.has(dedupe_hash)) {
      let n = 2;
      while (runHashes.has(disambiguateHash(basisHash, n))) n++;
      dedupe_hash = disambiguateHash(basisHash, n);
      result.disambiguated.push({ row, basis: basisHash, dedupe_hash });
    }

    const transaktion_id = nextTransaktionId(entry.buchungsdatum, existingIds);
    existingIds.add(transaktion_id);
    runHashes.add(dedupe_hash);

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
    if (verdict.kategorie_id) {
      transaktion.kategorie_id = verdict.kategorie_id;
      // Erst-Kategorisierung leitet die Kategorie aus dem Regelwerk ab (ADR 0017):
      // herkunfts-bewusst, damit die Nach-Kategorisierung nur Regel-Treffer neu bewertet.
      transaktion.kategorie_herkunft = "regel";
    }
    for (const field of optionalTransactionFields) {
      if (Object.hasOwn(entry, field)) transaktion[field] = entry[field];
    }
    // Nur eine dateiweit eindeutige Referenz speichern — sonst waere sie ein
    // irrefuehrender Dedupe-Key beim Re-Import.
    if (refEindeutig) transaktion.bank_referenz = entry.bank_referenz;

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
    console.error("Aufruf: node app/tools/import.mjs <pfad-zur-standardisierten.jsonl>");
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
  const entries = await readJsonl(pathToFileURL(resolve(process.cwd(), inputPath)));

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

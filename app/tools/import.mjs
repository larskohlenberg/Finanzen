// app/tools/import.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { validateImportEntry } from "./import-format.mjs";
import { gleicheMitBestandAb, vorkommenHash } from "./dedupe.mjs";
import { categorize } from "./categorizer.mjs";
import { matchTransfers } from "./transfer-matcher.mjs";
import { nextTransaktionId } from "./ids.mjs";
import { pflichtDatenroot } from "./data-root.mjs";
import { loadMasterData, validateMasterData } from "./validator.mjs";

const optionalTransactionFields = [
  "wertstellungsdatum",
  "transaktionstyp",
  "kundenreferenz",
  "empfaenger",
  "empfaenger_iban",
  "mandatsreferenz",
  "glaeubiger_id",
  "regelzahlung_id",
];

export function runImport({ entries, konten, kategorien, kategorisierungsregeln, transaktionen, transfers, regelzahlungen = [] }) {
  const kontenIds = new Set(konten.map((k) => k.konto_id));
  const kategorienIds = new Set(kategorien.map((k) => k.kategorie_id));
  const regelzahlungIds = new Set(regelzahlungen.map((rz) => rz.regelzahlung_id));
  const working = [...transaktionen];
  const existingIds = new Set(working.map((tx) => tx.transaktion_id));
  const masterHashes = new Set(working.map((tx) => tx.dedupe_hash));
  // In diesem Lauf vergebene Hashes.
  const runHashes = new Set();

  const result = { written: [], skipped_dedupe: [], disambiguated: [], errors: [], transfers_matched: [], pruefen: [], referenz_unzuverlaessig: [] };

  const gueltig = [];
  entries.forEach((entry, index) => {
    const row = index + 1;
    const formatErrors = validateImportEntry(entry, kontenIds, regelzahlungIds);
    if (formatErrors.length > 0) {
      result.errors.push({ row, reason: "format", detail: formatErrors.join("; "), raw: entry });
      return;
    }
    gueltig.push({ row, entry });
  });

  // Dubletten als Multimenge gegen den BESTAND (ADR 0034): je Konto und
  // Inhalt so viele neue Buchungen, wie die Datei mehr hat als der Bestand.
  // Zwei gleiche Zeilen eines Auszugs sind zwei Tatsachen, keine Dublette.
  const abgleich = gleicheMitBestandAb(gueltig, transaktionen);
  result.pruefen = abgleich.pruefen;
  result.referenz_unzuverlaessig = abgleich.referenz_unzuverlaessig;

  for (const { row, entry } of gueltig) {
    const urteil = abgleich.entscheidung.get(row);
    if (urteil.vorhanden) {
      result.skipped_dedupe.push({ row, dedupe_hash: urteil.vorhanden.dedupe_hash, transaktion_id: urteil.vorhanden.transaktion_id, grund: urteil.grund });
      continue;
    }

    const verdict = categorize(entry, kategorisierungsregeln);
    if (verdict.kategorie_id && !kategorienIds.has(verdict.kategorie_id)) {
      result.errors.push({ row, reason: "kategorie_unbekannt", detail: `${verdict.kategorie_id} nicht in kategorien`, raw: entry });
      continue;
    }

    // Schluessel: das erste freie Vorkommen des Inhalts. Frei heisst: weder im
    // Bestand (auch Alt-Hashes mit Luecken) noch in diesem Lauf vergeben.
    let n = 1;
    while (masterHashes.has(vorkommenHash(urteil.inhalt, n)) || runHashes.has(vorkommenHash(urteil.inhalt, n))) n++;
    const dedupe_hash = vorkommenHash(urteil.inhalt, n);
    if (n > 1) result.disambiguated.push({ row, basis: urteil.inhalt, dedupe_hash });

    const transaktion_id = nextTransaktionId(existingIds);
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
    // Regel-Provenance: alle treffenden Regeln merken (auch bei Konflikt ohne
    // Kategorie), damit Wirkung und Konflikte ohne Live-Re-Derivation sichtbar sind.
    if (verdict.matched_regeln.length) {
      transaktion.matched_regeln = verdict.matched_regeln;
    }
    for (const field of optionalTransactionFields) {
      if (Object.hasOwn(entry, field)) transaktion[field] = entry[field];
    }
    // Die Referenz wird immer gespeichert: Sie ist kein Schluessel fuer sich,
    // aber der Beleg, an dem der naechste Lauf ihre Verlaesslichkeit je Konto
    // misst (ADR 0034).
    if (String(entry.bank_referenz ?? "").trim()) transaktion.bank_referenz = entry.bank_referenz;

    working.push(transaktion);
    result.written.push({ transaktion_id, kategorisierung_status: verdict.status });
  }

  const transferOutcome = matchTransfers(working, transfers, konten);
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
  const argv = process.argv.slice(2);
  const schreiben = argv.includes("--schreiben");
  const [inputPath, rootArg] = argv.filter((a) => !a.startsWith("--"));
  if (!inputPath) {
    console.error("Aufruf: node app/tools/import.mjs <pfad-zur-standardisierten.jsonl> <datenroot> [--schreiben]");
    process.exitCode = 1;
    return;
  }
  const masterRoot = pflichtDatenroot(rootArg);
  const [konten, kategorien, transaktionen, transfers, kategorisierungsregeln, regelzahlungen] = await Promise.all([
    readJson(new URL("konten.json", masterRoot)),
    readJson(new URL("kategorien.json", masterRoot)),
    readJsonl(new URL("transaktionen.jsonl", masterRoot)),
    readJson(new URL("transfers.json", masterRoot)),
    readJson(new URL("kategorisierungsregeln.json", masterRoot)),
    readJson(new URL("regelzahlungen.json", masterRoot)),
  ]);
  const entries = await readJsonl(pathToFileURL(resolve(process.cwd(), inputPath)));

  const out = runImport({ entries, konten, kategorien, kategorisierungsregeln, transaktionen, transfers, regelzahlungen });
  console.log(JSON.stringify({ modus: schreiben ? "geschrieben" : "vorschau", ...out.result }, null, 2));
  if (!schreiben) {
    console.log("\nVorschau — nichts geschrieben. Mit --schreiben anwenden.");
    return;
  }

  // Erst den neuen Bestand pruefen: bringt der Import neue Validatorfehler,
  // wird nichts geschrieben.
  const bestand = await loadMasterData(masterRoot);
  const bekannt = new Set(validateMasterData(bestand).errors);
  const neu = validateMasterData({ ...bestand, transaktionen: out.transaktionen, transfers: out.transfers }).errors.filter((f) => !bekannt.has(f));
  if (neu.length) {
    console.error("Validierung des neuen Bestands fehlgeschlagen — nichts geschrieben:");
    for (const error of neu) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  await writeFile(new URL("transaktionen.jsonl", masterRoot), out.transaktionen.map((tx) => JSON.stringify(tx)).join("\n") + "\n");
  await writeFile(new URL("transfers.json", masterRoot), JSON.stringify(out.transfers, null, 2) + "\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

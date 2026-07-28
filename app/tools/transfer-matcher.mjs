// app/tools/transfer-matcher.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { toCents, centsToDecimal, dayDiff, normalizeLoose } from "./lib/text.mjs";
import { nextTransferId } from "./ids.mjs";
import { loadMasterData, validateMasterData } from "./validator.mjs";
import { dataRootFromArg } from "./data-root.mjs";

// IBANs werden nur zum Vergleich vereinheitlicht (Gross, ohne Whitespace);
// gespeichert bleibt immer die Originalform.
function normalizeIban(value) {
  return String(value ?? "").replace(/\s+/g, "").toUpperCase();
}

// Zweiter Weg zum Auto-Match neben identischem Verwendungszweck: eine Seite
// traegt die Kontoreferenz des Gegenkontos als empfaenger_iban. Das ist ein
// strukturelles Signal und damit staerker als Freitext-Gleichheit — noetig,
// weil zwei Banken denselben Uebertrag unterschiedlich betexten und das
// Textkriterium dann systematisch nie greifen kann.
function ibanGekoppelt(a, b, kontoVonIban) {
  const aZeigtAufB = kontoVonIban.get(normalizeIban(a.empfaenger_iban)) === b.konto_id;
  const bZeigtAufA = kontoVonIban.get(normalizeIban(b.empfaenger_iban)) === a.konto_id;
  return aZeigtAufB || bZeigtAufA;
}

export function matchTransfers(transaktionen, existingTransfers, konten = []) {
  // Ohne Konten-Liste bleibt es beim reinen Textkriterium (Rueckwaertskompatibilitaet).
  const kontoVonIban = new Map(
    konten.filter((k) => k.kontoreferenz).map((k) => [normalizeIban(k.kontoreferenz), k.konto_id]),
  );

  const transfers = [...existingTransfers];
  const usedTransferIds = new Set(existingTransfers.map((transfer) => transfer.transfer_id));
  const matched = [];

  const open = transaktionen
    .filter((t) => !t.transfer_id && t.ist_transfer !== true)
    .sort((a, b) => a.buchungsdatum.localeCompare(b.buchungsdatum) || a.transaktion_id.localeCompare(b.transaktion_id));

  const consumed = new Set();
  for (let i = 0; i < open.length; i++) {
    const a = open[i];
    if (consumed.has(a.transaktion_id)) continue;
    for (let j = i + 1; j < open.length; j++) {
      const b = open[j];
      if (consumed.has(b.transaktion_id)) continue;
      const centsA = toCents(a.betrag);
      if (centsA === 0) continue;
      if (centsA + toCents(b.betrag) !== 0) continue;
      if (a.konto_id === b.konto_id) continue;
      if (Math.abs(dayDiff(a.buchungsdatum, b.buchungsdatum)) > 3) continue;
      const zweckGleich = normalizeLoose(a.verwendungszweck) === normalizeLoose(b.verwendungszweck);
      if (!zweckGleich && !ibanGekoppelt(a, b, kontoVonIban)) continue;

      const abgang = centsA < 0 ? a : b;
      const zugang = centsA < 0 ? b : a;
      const transferId = nextTransferId(usedTransferIds);
      usedTransferIds.add(transferId);

      transfers.push({
        transfer_id: transferId,
        betrag: centsToDecimal(Math.abs(toCents(abgang.betrag))),
        typ: "intern",
        abgang_transaktion_id: abgang.transaktion_id,
        zugang_transaktion_id: zugang.transaktion_id,
      });
      abgang.ist_transfer = true;
      abgang.transfer_id = transferId;
      zugang.ist_transfer = true;
      zugang.transfer_id = transferId;
      matched.push({ transfer_id: transferId, from: abgang.transaktion_id, to: zugang.transaktion_id });
      consumed.add(a.transaktion_id);
      consumed.add(b.transaktion_id);
      break;
    }
  }

  return { transaktionen, transfers, matched };
}

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}
async function readJsonl(url) {
  const text = await readFile(url, "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
}

// Lauf ueber den BESTAND. import.mjs paart nur die Buchungen eines Importlaufs;
// nach einem neu angelegten Konto oder einer Korrektur muss der Bestand
// nachgezogen werden. Vorschau ist Default wie bei confirm.mjs und inbox.mjs.
async function main() {
  const argv = process.argv.slice(2);
  const schreiben = argv.includes("--schreiben");
  const masterRoot = dataRootFromArg(argv.find((a) => !a.startsWith("--")), new URL("../data/master/", import.meta.url), new URL("../", import.meta.url));

  const [transaktionen, transfers, konten] = await Promise.all([
    readJsonl(new URL("transaktionen.jsonl", masterRoot)),
    readJson(new URL("transfers.json", masterRoot)),
    readJson(new URL("konten.json", masterRoot)),
  ]);

  const out = matchTransfers(transaktionen, transfers, konten);
  const volumen = out.matched.reduce((sum, m) => sum + toCents(out.transfers.find((t) => t.transfer_id === m.transfer_id).betrag), 0);
  console.log(JSON.stringify({ modus: schreiben ? "geschrieben" : "vorschau", neue_paare: out.matched.length, volumen: centsToDecimal(volumen), transfers_gesamt: out.transfers.length }, null, 2));

  if (!schreiben) {
    console.log("\nVorschau — nichts geschrieben. Mit --schreiben anwenden.");
    return;
  }

  await writeFile(new URL("transaktionen.jsonl", masterRoot), out.transaktionen.map((tx) => JSON.stringify(tx)).join("\n") + "\n");
  await writeFile(new URL("transfers.json", masterRoot), JSON.stringify(out.transfers, null, 2) + "\n");

  const validation = validateMasterData(await loadMasterData(masterRoot));
  if (!validation.valid) {
    console.error("Validierung nach Transfer-Lauf fehlgeschlagen:");
    for (const error of validation.errors.slice(0, 20)) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

// app/tools/migrate-ids-uuid.mjs
// Einmal-Migration: sprechende IDs (TXN-YYYYMMDD-NNNNNN / TRF-YYYYMMDD-NNN) ->
// opake UUIDs (TXN-<uuid> / TRF-<uuid>). Referenzen (transfers <-> transaktionen,
// transaktion.transfer_id) werden konsistent umgeschrieben. Idempotent: nur IDs
// im ALTEN Format werden ersetzt, bereits migrierte bleiben unangetastet.
// agent_log.jsonl wird bewusst NICHT angefasst (historische Alt-IDs, informativ).
//
// Aufruf: node app/tools/migrate-ids-uuid.mjs [pfad-zum-master-dir]
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const ALT_TXN = /^TXN-\d{8}-\d{6}$/;
const ALT_TRF = /^TRF-\d{8}-\d{3}$/;

function remapper(prefix, altMuster) {
  const map = new Map();
  return (id) => {
    if (typeof id !== "string" || !altMuster.test(id)) return id; // schon opak / leer
    if (!map.has(id)) map.set(id, `${prefix}${randomUUID()}`);
    return map.get(id);
  };
}

async function readJsonl(url) {
  const text = await readFile(url, "utf8");
  return text.split(/\r?\n/).filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
}

export async function migrate(masterDir) {
  const txnUrl = new URL("transaktionen.jsonl", masterDir);
  const trfUrl = new URL("transfers.json", masterDir);

  const transaktionen = await readJsonl(txnUrl);
  const transfers = JSON.parse(await readFile(trfUrl, "utf8"));

  const mapTxn = remapper("TXN-", ALT_TXN);
  const mapTrf = remapper("TRF-", ALT_TRF);

  // Erst alle neuen TXN-/TRF-IDs vergeben (Maps fuellen), dann Referenzen ziehen.
  for (const tx of transaktionen) tx.transaktion_id = mapTxn(tx.transaktion_id);
  for (const tr of transfers) tr.transfer_id = mapTrf(tr.transfer_id);

  let refUpdates = 0;
  for (const tx of transaktionen) {
    if (tx.transfer_id) { const neu = mapTrf(tx.transfer_id); if (neu !== tx.transfer_id) refUpdates++; tx.transfer_id = neu; }
  }
  for (const tr of transfers) {
    for (const feld of ["abgang_transaktion_id", "zugang_transaktion_id"]) {
      if (tr[feld]) { const neu = mapTxn(tr[feld]); if (neu !== tr[feld]) refUpdates++; tr[feld] = neu; }
    }
  }

  // Backup vor dem Schreiben (lokal, im gitignorierten Datenraum).
  await copyFile(txnUrl, new URL("transaktionen.jsonl.pre-uuid.bak", masterDir)).catch(() => {});
  await copyFile(trfUrl, new URL("transfers.json.pre-uuid.bak", masterDir)).catch(() => {});

  await writeFile(txnUrl, transaktionen.map((tx) => JSON.stringify(tx)).join("\n") + "\n");
  await writeFile(trfUrl, JSON.stringify(transfers, null, 2) + "\n");

  return { transaktionen: transaktionen.length, transfers: transfers.length, refUpdates };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ? new URL(`${process.argv[2].replace(/\/?$/, "/")}`, `file://${process.cwd()}/`) : new URL("../data/master/", import.meta.url);
  migrate(dir)
    .then((r) => console.log(`Migriert: ${r.transaktionen} Transaktionen, ${r.transfers} Transfers, ${r.refUpdates} Referenz-Updates`))
    .catch((e) => { console.error(e); process.exitCode = 1; });
}

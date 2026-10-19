// app/tools/transfer-extern.mjs
//
// Externer Transfer (CONTEXT.md): nur eine Seite ist eine Buchung im Modell,
// z. B. Bargeld, das an eine Person ausserhalb des Modells geht. Setzt an der
// Buchung ist_transfer + transfer_id und legt den Transfer mit gegenseite_typ
// und Pflicht-Begruendung an — statt Hand-Edits an transfers.json und
// transaktionen.jsonl (Review 1B.3). Interne Transfers paart `transfers`
// (transfer-matcher.mjs). `entfernen` nimmt einen externen Transfer zurueck.
import { fileURLToPath } from "node:url";
import { nextTransferId } from "./ids.mjs";
import { pflichtDatenroot } from "./data-root.mjs";
import { beginneLauf } from "./lib/fingerabdruck.mjs";
import { meldeNachSchreiben, validatorBefunde } from "./lib/validator-befund.mjs";
import { argWert, liesJsonl, liesJsonListe, protokolliere, schreibeJsonl } from "./lib/bestand-datei.mjs";
import { ersetzeDatei } from "./lib/datei.mjs";

export const GEGENSEITEN = Object.freeze(["bar", "extern_familie", "extern_sonstiges"]);

export function transferExtern({ transaktionen, transfers, transaktionId, gegenseite, begruendung, entfernen = false, neueId }) {
  const tx = transaktionen.find((t) => t.transaktion_id === transaktionId);
  if (!tx) throw new Error(`${transaktionId} existiert nicht`);

  if (entfernen) {
    const transfer = transfers.find((t) => t.transfer_id === tx.transfer_id);
    if (!transfer) throw new Error(`${transaktionId} gehoert zu keinem Transfer`);
    if (transfer.typ !== "extern") throw new Error(`${transfer.transfer_id} ist ein interner Transfer — die Paarung loest transfers bzw. der Nutzer`);
    return {
      transaktionen: transaktionen.map((t) => {
        if (t !== tx) return t;
        const { transfer_id, ...rest } = t;
        return { ...rest, ist_transfer: false };
      }),
      transfers: transfers.filter((t) => t !== transfer),
      transfer_id: transfer.transfer_id,
    };
  }

  if (tx.transfer_id || tx.ist_transfer === true) throw new Error(`${transaktionId} ist schon Teil eines Transfers (${tx.transfer_id ?? "ohne transfer_id"})`);
  if (!GEGENSEITEN.includes(gegenseite)) throw new Error(`gegenseite: erlaubt sind ${GEGENSEITEN.join(", ")}`);
  if (typeof begruendung !== "string" || !begruendung.trim()) throw new Error("begruendung ist Pflicht");
  const transfer_id = neueId(new Set(transfers.map((t) => t.transfer_id)));
  const abgang = tx.betrag.startsWith("-");
  const transfer = {
    transfer_id,
    betrag: abgang ? tx.betrag.slice(1) : tx.betrag,
    typ: "extern",
    [abgang ? "abgang_transaktion_id" : "zugang_transaktion_id"]: tx.transaktion_id,
    gegenseite_typ: gegenseite,
    begruendung: begruendung.trim(),
  };
  return {
    transaktionen: transaktionen.map((t) => (t === tx ? { ...t, ist_transfer: true, transfer_id } : t)),
    transfers: [...transfers, transfer],
    transfer_id,
  };
}

const USAGE = `Aufruf: node app/tools/transfer-extern.mjs DATENROOT --transaktion=TXN-... (--gegenseite=<${GEGENSEITEN.join("|")}> --begruendung=<text> | --entfernen) [--schreiben]`;

async function main() {
  const argv = process.argv.slice(2);
  const transaktionId = argWert(argv, "transaktion");
  const entfernen = argv.includes("--entfernen");
  if (!transaktionId || (!entfernen && !argWert(argv, "gegenseite"))) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const schreiben = argv.includes("--schreiben");
  const root = pflichtDatenroot(argv.find((a) => !a.startsWith("--")));
  await beginneLauf(fileURLToPath(root), schreiben);

  const out = transferExtern({
    transaktionen: await liesJsonl(new URL("transaktionen.jsonl", root)),
    transfers: await liesJsonListe(new URL("transfers.json", root), []),
    transaktionId,
    gegenseite: argWert(argv, "gegenseite"),
    begruendung: argWert(argv, "begruendung"),
    entfernen,
    neueId: nextTransferId,
  });
  console.log(JSON.stringify({ modus: schreiben ? "geschrieben" : "vorschau", aktion: entfernen ? "entfernt" : "angelegt", transfer_id: out.transfer_id, transaktion_id: transaktionId }, null, 2));
  if (!schreiben) {
    console.log("\nVorschau — nichts geschrieben. Mit --schreiben anwenden.");
    return;
  }
  const vorher = await validatorBefunde(root);
  await schreibeJsonl(new URL("transaktionen.jsonl", root), out.transaktionen);
  // transfers.json schreiben die anderen Werkzeuge eingerueckt; so bleibt es.
  await ersetzeDatei(new URL("transfers.json", root), JSON.stringify(out.transfers, null, 2) + "\n");
  await protokolliere(root, {
    zeitpunkt: new Date().toISOString(),
    anlass: "transfer-extern",
    ids: [transaktionId, out.transfer_id],
    aktion: entfernen ? "entfernt" : "angelegt",
    notiz: argWert(argv, "notiz") ?? `transfer-extern: ${entfernen ? "entfernt" : "angelegt"}`,
  });
  await meldeNachSchreiben(root, vorher, "Validierung nach transfer-extern fehlgeschlagen");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

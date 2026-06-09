// app/tools/transfer-matcher.mjs
import { toCents, centsToDecimal, dayDiff, normalizeLoose } from "./lib/text.mjs";
import { nextTransferId } from "./ids.mjs";

export function matchTransfers(transaktionen, existingTransfers) {
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
      if (normalizeLoose(a.verwendungszweck) !== normalizeLoose(b.verwendungszweck)) continue;

      const abgang = centsA < 0 ? a : b;
      const zugang = centsA < 0 ? b : a;
      const transferId = nextTransferId(abgang.buchungsdatum, usedTransferIds);
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

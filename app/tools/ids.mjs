// app/tools/ids.mjs
// Opake Identifier (UUID v4): unique, aber ohne Information ueber die Buchung.
// Bewusst KEIN Datum/keine laufende Nummer im Identifier (kein Info-Leak, auch
// nicht in URLs). Das Praefix bleibt nur als Typ-Kennung. Erzeugung gegen den
// bekannten Bestand auf Kollision geprueft (bei v4 praktisch nie noetig).
import { randomUUID } from "node:crypto";

function uniqueId(prefix, existingIds) {
  let id;
  do {
    id = `${prefix}${randomUUID()}`;
  } while (existingIds.has(id));
  return id;
}

export function nextTransaktionId(existingIds) {
  return uniqueId("TXN-", existingIds);
}

export function nextTransferId(existingIds) {
  return uniqueId("TRF-", existingIds);
}

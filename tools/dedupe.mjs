// tools/dedupe.mjs
import { createHash } from "node:crypto";
import { normalizeWhitespace } from "./lib/text.mjs";

// Separator: NUL-Byte (siehe Plan/ADR 0007). Zur Laufzeit via fromCharCode
// erzeugt, damit der Quelltext reiner Text bleibt (kein binaeres NUL in der Datei).
const SEP = String.fromCharCode(0);

export function computeDedupeHash(entry) {
  const ref = String(entry.bank_referenz ?? "").trim();
  const parts = ref
    ? [entry.konto_id, ref]
    : [
        entry.konto_id,
        entry.buchungsdatum,
        entry.betrag,
        normalizeWhitespace(entry.gegenpartei),
        normalizeWhitespace(entry.verwendungszweck),
      ];
  return createHash("sha256").update(parts.join(SEP)).digest("hex");
}

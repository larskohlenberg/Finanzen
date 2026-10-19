// app/tools/dedupe.mjs
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

// Zwei in allen Quellfeldern identische, aber real verschiedene Buchungen eines
// Auszugs (z. B. referenzlose Ruecklaeufer) ergeben denselben computeDedupeHash.
// Der Validator verlangt jedoch eindeutige dedupe_hashes. Fuer das n-te Vorkommen
// (n >= 2) wird der Basis-Hash deterministisch zu einem weiterhin 64-stelligen
// Hash disambiguiert. Buchungsinhalte bleiben unveraendert.
export function disambiguateHash(baseHash, occurrence) {
  return createHash("sha256").update(`${baseHash}${SEP}${occurrence}`).digest("hex");
}

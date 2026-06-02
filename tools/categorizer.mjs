// tools/categorizer.mjs
import { normalizeLoose, toCents } from "./lib/text.mjs";

function matchesRule(buchung, regel) {
  const gegenpartei = normalizeLoose(buchung.gegenpartei);
  const verwendungszweck = normalizeLoose(buchung.verwendungszweck);

  if (regel.gegenpartei_pattern) {
    if (!gegenpartei.includes(normalizeLoose(regel.gegenpartei_pattern))) return false;
  }
  if (regel.verwendungszweck_pattern) {
    if (!verwendungszweck.includes(normalizeLoose(regel.verwendungszweck_pattern))) return false;
  }
  if (!regel.gegenpartei_pattern && !regel.verwendungszweck_pattern) return false;
  if (regel.konto_id && regel.konto_id !== buchung.konto_id) return false;
  if (regel.vorzeichen === "einnahme" && toCents(buchung.betrag) <= 0) return false;
  if (regel.vorzeichen === "ausgabe" && toCents(buchung.betrag) >= 0) return false;
  return true;
}

export function categorize(buchung, regeln) {
  const matched = regeln.filter((regel) => regel.status === "aktiv" && matchesRule(buchung, regel));
  const matchedIds = matched.map((regel) => regel.regel_id);
  const distinctKategorien = [...new Set(matched.map((regel) => regel.kategorie_id))];

  if (distinctKategorien.length === 0) {
    return { kategorie_id: null, status: "offen", conflict: false, matched_regeln: [] };
  }
  if (distinctKategorien.length === 1) {
    return { kategorie_id: distinctKategorien[0], status: "vorgeschlagen", conflict: false, matched_regeln: matchedIds };
  }
  return { kategorie_id: null, status: "offen", conflict: true, matched_regeln: matchedIds };
}

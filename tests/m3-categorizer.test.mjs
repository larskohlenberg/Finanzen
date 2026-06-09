// tests/m3-categorizer.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { categorize } from "../app/tools/categorizer.mjs";

const regeln = [
  { regel_id: "REG-001", gegenpartei_pattern: "edeka", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-06-01" },
  { regel_id: "REG-002", gegenpartei_pattern: "volkswagenbank", vorzeichen: "einnahme", kategorie_id: "KAT-001", status: "aktiv", erstellt_am: "2026-06-01" },
  { regel_id: "REG-003", gegenpartei_pattern: "amazon", kategorie_id: "KAT-007", status: "aktiv", erstellt_am: "2026-06-01" },
  { regel_id: "REG-004", verwendungszweck_pattern: "strom", kategorie_id: "KAT-002", status: "aktiv", erstellt_am: "2026-06-01" },
  { regel_id: "REG-005", gegenpartei_pattern: "alt", kategorie_id: "KAT-099", status: "inaktiv", erstellt_am: "2026-06-01" },
];

test("eindeutiger Treffer ergibt vorgeschlagen", () => {
  const r = categorize({ gegenpartei: "EDEKA Mitte", verwendungszweck: "Einkauf", betrag: "-50.00", konto_id: "KTO-001" }, regeln);
  assert.deepEqual(r, { kategorie_id: "KAT-003", status: "vorgeschlagen", conflict: false, matched_regeln: ["REG-001"] });
});

test("kein Treffer ergibt offen", () => {
  const r = categorize({ gegenpartei: "Unbekannt", verwendungszweck: "x", betrag: "-1.00", konto_id: "KTO-001" }, regeln);
  assert.deepEqual(r, { kategorie_id: null, status: "offen", conflict: false, matched_regeln: [] });
});

test("vorzeichen disambiguiert Einnahme vs Ausgabe", () => {
  const einnahme = categorize({ gegenpartei: "Volkswagenbank Demo", verwendungszweck: "Zinsen", betrag: "2.15", konto_id: "KTO-004" }, regeln);
  assert.equal(einnahme.kategorie_id, "KAT-001");
  const ausgabe = categorize({ gegenpartei: "Volkswagenbank Demo", verwendungszweck: "Ruecklastschrift", betrag: "-2.15", konto_id: "KTO-004" }, regeln);
  assert.equal(ausgabe.status, "offen");
});

test("Konflikt zweier Kategorien ergibt offen", () => {
  const r = categorize({ gegenpartei: "Amazon EU", verwendungszweck: "Strom-Guthaben", betrag: "-30.00", konto_id: "KTO-001" }, regeln);
  assert.equal(r.status, "offen");
  assert.equal(r.conflict, true);
  assert.deepEqual(r.matched_regeln.sort(), ["REG-003", "REG-004"]);
});

test("inaktive Regeln werden ignoriert", () => {
  const r = categorize({ gegenpartei: "ALT GmbH", verwendungszweck: "x", betrag: "-1.00", konto_id: "KTO-001" }, regeln);
  assert.equal(r.status, "offen");
});

test("konto_id-Filter grenzt Regel ein", () => {
  const kontoRegeln = [{ regel_id: "REG-010", gegenpartei_pattern: "zins", konto_id: "KTO-004", kategorie_id: "KAT-001", status: "aktiv", erstellt_am: "2026-06-01" }];
  assert.equal(categorize({ gegenpartei: "Zins AG", verwendungszweck: "x", betrag: "1.00", konto_id: "KTO-004" }, kontoRegeln).status, "vorgeschlagen");
  assert.equal(categorize({ gegenpartei: "Zins AG", verwendungszweck: "x", betrag: "1.00", konto_id: "KTO-001" }, kontoRegeln).status, "offen");
});

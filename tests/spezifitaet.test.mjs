// tests/spezifitaet.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { referenzmenge, streuung, istSpezifisch } from "../app/tools/lib/spezifitaet.mjs";

let n = 0;
function tx(props) {
  n += 1;
  return {
    transaktion_id: `TXN-${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`,
    konto_id: "KTO-001", buchungsdatum: "2026-05-20", betrag: "-10.00",
    gegenpartei: "", verwendungszweck: "", ist_transfer: false, ...props,
  };
}

// "ortstoken" streut ueber drei Kategorien, "testladen" nur ueber eine.
const referenz = [
  tx({ gegenpartei: "Testladen Ortstoken", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", bestaetigt_durch: "mensch" }),
  tx({ gegenpartei: "Baumarkt Ortstoken", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-005", bestaetigt_durch: "mensch" }),
  tx({ gegenpartei: "Apotheke Ortstoken", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-007", bestaetigt_durch: "mensch" }),
];

test("referenzmenge nimmt nur menschlich Entschiedenes", () => {
  const alle = [...referenz,
    tx({ gegenpartei: "Auto Ortstoken", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-009", bestaetigt_durch: "auto" }),
    tx({ gegenpartei: "Offen Ortstoken", kategorisierung_status: "offen" })];
  assert.equal(referenzmenge(alle).length, 3);
});

test("manuelle Korrekturen zaehlen zur Referenzmenge", () => {
  const alle = [tx({ gegenpartei: "X", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "manuell", bestaetigt_durch: "mensch" })];
  assert.equal(referenzmenge(alle).length, 1);
});

test("streuung zaehlt verschiedene Kategorien", () => {
  assert.equal(streuung("ortstoken", referenz), 3);
  assert.equal(streuung("testladen", referenz), 1);
});

test("Muster nur aus einem breit streuenden Token faellt durch", () => {
  assert.equal(istSpezifisch({ gegenpartei_pattern: "Ortstoken" }, referenz), false);
});

test("spezifisches Muster besteht", () => {
  assert.equal(istSpezifisch({ gegenpartei_pattern: "Testladen" }, referenz), true);
});

test("ODER-Alternation: ein generischer Zweig macht das Feld unspezifisch", () => {
  assert.equal(istSpezifisch({ gegenpartei_pattern: "Testladen|Ortstoken" }, referenz), false);
});

test("UND ueber Felder: ein spezifisches Feld genuegt", () => {
  assert.equal(istSpezifisch({ gegenpartei_pattern: "Ortstoken", verwendungszweck_pattern: "Testladen" }, referenz), true);
});

test("Regel ohne Muster ist nie spezifisch", () => {
  assert.equal(istSpezifisch({}, referenz), false);
});

test("leere Referenzmenge laesst durch (Cold-Start ist ein Veto, kein Beweis)", () => {
  assert.equal(istSpezifisch({ gegenpartei_pattern: "Ortstoken" }, []), true);
});

test("Streuung sieht auch den Verwendungszweck", () => {
  const ref = [
    tx({ verwendungszweck: "Sammelposten A", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", bestaetigt_durch: "mensch" }),
    tx({ verwendungszweck: "Sammelposten B", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-005", bestaetigt_durch: "mensch" }),
    tx({ verwendungszweck: "Sammelposten C", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-007", bestaetigt_durch: "mensch" }),
  ];
  assert.equal(streuung("sammelposten", ref), 3);
});

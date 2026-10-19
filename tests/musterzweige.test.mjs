// tests/musterzweige.test.mjs
//
// Ein leerer Zweig in einem Regelmuster ("A|B|") ist ein Tippfehler, der jede
// Buchung trifft: includes("") ist immer wahr. Matcher, Gate, Probelauf und
// Validator muessen dasselbe Muster gleich zerlegen und den leeren Zweig gleich
// behandeln.
import assert from "node:assert/strict";
import { test } from "node:test";
import { categorize } from "../app/tools/categorizer.mjs";
import { istSpezifisch } from "../app/tools/lib/spezifitaet.mjs";
import { musterzweige } from "../app/tools/lib/text.mjs";
import { probelauf } from "../app/tools/regel-probelauf.mjs";
import { validateMasterData } from "../app/tools/validate-core.mjs";

const LEERE_ZWEIGE = ["Testladen|Beispielmarkt|", "|Testladen", "Testladen||Beispielmarkt", "Testladen|   "];

const fremd = { gegenpartei: "Ganz Anderer Haendler", verwendungszweck: "Rechnung 4711", betrag: "-12.34", konto_id: "KTO-001" };

function regel(extra) {
  return { regel_id: "REG-001", kategorie_id: "KAT-001", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "Testregel", ...extra };
}

function bestand(regeln) {
  return {
    kategorien: [{ kategorie_id: "KAT-001", name: "Testkategorie", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" }],
    transaktionen: [],
    kategorisierungsregeln: regeln,
  };
}

test("musterzweige: Pipe trennt, Zweige lose normalisiert, leere Zweige bleiben sichtbar", () => {
  assert.deepEqual(musterzweige("Testladen | Beispiel  Markt"), ["testladen", "beispiel markt"]);
  assert.deepEqual(musterzweige("Testladen|"), ["testladen", ""]);
  assert.deepEqual(musterzweige("|  |"), ["", "", ""]);
  assert.deepEqual(musterzweige("Testladen"), ["testladen"]);
});

test("Matcher: ein leerer Zweig trifft keine fremde Buchung", () => {
  for (const muster of LEERE_ZWEIGE) {
    for (const feld of ["gegenpartei_pattern", "verwendungszweck_pattern"]) {
      const r = categorize(fremd, [regel({ [feld]: muster })]);
      assert.equal(r.status, "offen", `${feld} = ${JSON.stringify(muster)}`);
      assert.deepEqual(r.matched_regeln, [], `${feld} = ${JSON.stringify(muster)}`);
    }
  }
});

test("Matcher: die nicht leeren Zweige treffen weiter", () => {
  const r = categorize({ ...fremd, gegenpartei: "Testladen Mitte" }, [regel({ gegenpartei_pattern: "Testladen|Beispielmarkt|" })]);
  assert.equal(r.status, "vorgeschlagen");
  assert.deepEqual(r.matched_regeln, ["REG-001"]);
});

test("Matcher: ein Muster nur aus Leerraum trifft nichts", () => {
  const r = categorize(fremd, [regel({ gegenpartei_pattern: "   " })]);
  assert.equal(r.status, "offen");
});

test("Validator lehnt leere und Leerraum-Zweige ab, auch bei inaktiven Regeln", () => {
  for (const muster of [...LEERE_ZWEIGE, "   "]) {
    for (const feld of ["gegenpartei_pattern", "verwendungszweck_pattern"]) {
      for (const status of ["aktiv", "inaktiv"]) {
        const result = validateMasterData(bestand([regel({ [feld]: muster, status })]));
        const fall = `${feld} = ${JSON.stringify(muster)}, ${status}`;
        assert.equal(result.valid, false, fall);
        assert.match(result.errors.join("\n"), new RegExp(`REG-001\\.${feld}: leerer Musterzweig`), fall);
      }
    }
  }
});

test("Validator laesst ordentliche Alternation durch", () => {
  const result = validateMasterData(bestand([regel({ gegenpartei_pattern: "Testladen|Beispielmarkt", verwendungszweck_pattern: "Einkauf" })]));
  assert.deepEqual(result.errors.filter((e) => /Musterzweig/.test(e)), []);
});

test("Gate: ein Feld mit leerem Zweig ist nie spezifisch", () => {
  // Auch bei leerer Referenzmenge, die sonst jedes Muster durchliesse.
  for (const muster of LEERE_ZWEIGE) {
    assert.equal(istSpezifisch({ gegenpartei_pattern: muster }, []), false, JSON.stringify(muster));
  }
});

test("Probelauf: leerer Zweig ist ein Strukturfehler und blockiert", () => {
  for (const muster of LEERE_ZWEIGE) {
    const out = probelauf({
      transaktionen: [{ transaktion_id: "TXN-1", buchungsdatum: "2026-01-01", kategorisierung_status: "offen", ...fremd }],
      bestandsRegeln: [],
      kandidaten: [regel({ regel_id: "REG-900", verwendungszweck_pattern: muster })],
    });
    assert.ok(out.struktur_fehler.some((f) => /REG-900: verwendungszweck_pattern hat einen leeren Musterzweig/.test(f)), JSON.stringify(muster));
    assert.equal(out.treffer, 0, JSON.stringify(muster));
    assert.equal(out.blockiert, true, JSON.stringify(muster));
  }
});

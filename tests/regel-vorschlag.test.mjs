// tests/regel-vorschlag.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { regelVorschlaege } from "../app/tools/regel-vorschlag.mjs";

let txCounter = 0;
function tx(props) {
  txCounter += 1;
  return {
    transaktion_id: `TXN-${String(txCounter).padStart(6, "0")}`,
    dedupe_hash: `h${txCounter}`,
    rohquelle: "data/inbox/x.csv",
    konto_id: "KTO-001",
    buchungsdatum: "2026-05-20",
    betrag: "-10.00",
    gegenpartei: "",
    verwendungszweck: "",
    ist_transfer: false,
    kategorisierung_status: "offen",
    ...props,
  };
}

test("buendelt offene Buchungen derselben Gegenpartei zu einem Regelkandidaten", () => {
  const out = regelVorschlaege({
    transaktionen: [tx({ gegenpartei: "MusterladenA Mitte" }), tx({ gegenpartei: "  musterladena   mitte " }), tx({ gegenpartei: "MusterladenB" })],
  });
  const musterladena = out.vorschlaege.find((v) => v.gegenpartei_pattern === "musterladena mitte");
  assert.equal(musterladena.treffer, 2);
  assert.equal(out.offen_gesamt, 3);
});

test("sortiert nach Abdeckung, damit der groesste Hebel oben steht", () => {
  const out = regelVorschlaege({
    transaktionen: [tx({ gegenpartei: "KLEIN" }), tx({ gegenpartei: "KLEIN" }), tx({ gegenpartei: "GROSS" }), tx({ gegenpartei: "GROSS" }), tx({ gegenpartei: "GROSS" })],
  });
  assert.deepEqual(out.vorschlaege.map((v) => v.treffer), [3, 2]);
});

test("Cluster unter mindestTreffer landen als Einzelfaelle, nicht als Regelkandidat", () => {
  const out = regelVorschlaege({ transaktionen: [tx({ gegenpartei: "EINMALIG" }), tx({ gegenpartei: "OFT" }), tx({ gegenpartei: "OFT" })] });
  assert.deepEqual(out.vorschlaege.map((v) => v.gegenpartei_pattern), ["oft"]);
  assert.equal(out.einzelfaelle, 1);
});

test("betrachtet nur offene Buchungen — entschiedene sind kein Arbeitsvorrat", () => {
  const out = regelVorschlaege({
    transaktionen: [
      tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003" }),
      tx({ gegenpartei: "MusterladenA", kategorisierung_status: "abgelehnt" }),
      tx({ gegenpartei: "MusterladenA", kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003" }),
      tx({ gegenpartei: "MusterladenA" }),
      tx({ gegenpartei: "MusterladenA" }),
    ],
  });
  // Fuenf MusterladenA-Zeilen, aber nur die zwei offenen sind Arbeitsvorrat.
  assert.equal(out.offen_gesamt, 2);
  assert.equal(out.vorschlaege[0].treffer, 2);
});

test("raet nie eine Kategorie — der Kandidat traegt Muster und Abdeckung, nicht die Fachentscheidung", () => {
  const out = regelVorschlaege({ transaktionen: [tx({ gegenpartei: "MusterladenA" }), tx({ gegenpartei: "MusterladenA" })] });
  assert.equal(Object.hasOwn(out.vorschlaege[0], "kategorie_id"), false);
});

test("markiert einen Cluster als Regelkonflikt, wenn schon Regeln gegriffen haben", () => {
  // offen + nicht leeres matched_regeln heisst: mehrere Regeln, verschiedene
  // Kategorien. Das braucht Regel-Reparatur, keine zusaetzliche Regel.
  const out = regelVorschlaege({
    transaktionen: [
      tx({ gegenpartei: "DM", matched_regeln: ["REG-001", "REG-002"] }),
      tx({ gegenpartei: "DM", matched_regeln: ["REG-001", "REG-002"] }),
    ],
  });
  assert.equal(out.vorschlaege[0].konflikt, true);
  assert.deepEqual(out.vorschlaege[0].matched_regeln, ["REG-001", "REG-002"]);
});

test("liefert Beispiele mit Verwendungszweck, damit die Kategorie beurteilbar ist", () => {
  const out = regelVorschlaege({
    transaktionen: [
      tx({ gegenpartei: "MusterladenA", verwendungszweck: "Einkauf 12.05.", betrag: "-23.10" }),
      tx({ gegenpartei: "MusterladenA", verwendungszweck: "Einkauf 19.05.", betrag: "-11.90" }),
    ],
  });
  const v = out.vorschlaege[0];
  assert.equal(v.beispiele.length, 2);
  assert.equal(v.beispiele[0].verwendungszweck, "Einkauf 12.05.");
  assert.equal(v.summe, "-35.00");
});

test("begrenzt die Beispiele, damit ein 30er-Cluster den Bericht nicht flutet", () => {
  const viele = Array.from({ length: 30 }, (_, i) => tx({ gegenpartei: "OFT", verwendungszweck: `Nr ${i}` }));
  const out = regelVorschlaege({ transaktionen: viele });
  assert.equal(out.vorschlaege[0].treffer, 30);
  assert.equal(out.vorschlaege[0].beispiele.length, 3);
});

test("zaehlt, wie viel Arbeitsvorrat die Kandidaten zusammen abdecken", () => {
  const out = regelVorschlaege({
    transaktionen: [tx({ gegenpartei: "A" }), tx({ gegenpartei: "A" }), tx({ gegenpartei: "B" }), tx({ gegenpartei: "B" }), tx({ gegenpartei: "C" })],
  });
  assert.equal(out.offen_gesamt, 5);
  assert.equal(out.abgedeckt, 4);
  assert.equal(out.einzelfaelle, 1);
});

test("Buchungen ohne Gegenpartei werden nicht zu einem Sammel-Muster verschmolzen", () => {
  // Ein leeres Muster wuerde als Substring auf JEDE Buchung passen — das waere
  // die gefaehrlichste denkbare Regel.
  const out = regelVorschlaege({ transaktionen: [tx({ gegenpartei: "" }), tx({ gegenpartei: "   " })] });
  assert.deepEqual(out.vorschlaege, []);
  assert.equal(out.ohne_gegenpartei, 2);
});

// tests/regel-probelauf.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { probelauf } from "../app/tools/regel-probelauf.mjs";

const bestand = [
  { regel_id: "REG-001", gegenpartei_pattern: "musterladena", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "x" },
  { regel_id: "REG-002", gegenpartei_pattern: "restaurant", kategorie_id: "KAT-017", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "x" },
];

const tx = (over) => ({
  transaktion_id: "TXN-1",
  konto_id: "KTO-001",
  buchungsdatum: "2026-01-01",
  betrag: "-10.00",
  gegenpartei: "Irgendwer",
  verwendungszweck: "",
  kategorisierung_status: "offen",
  ...over,
});

test("offene Buchung, die eine neue Regel trifft, zaehlt als Treffer", () => {
  const out = probelauf({
    transaktionen: [tx({ gegenpartei: "Peter Pane Braunschweig" })],
    bestandsRegeln: bestand,
    kandidaten: [{ regel_id: "REG-900", gegenpartei_pattern: "peter pane", kategorie_id: "KAT-017", status: "aktiv", erstellt_am: "2026-08-12", kommentar: "x" }],
  });
  assert.equal(out.treffer, 1);
  assert.equal(out.neue_konflikte.length, 0);
  assert.equal(out.wiedervorlagen.length, 0);
  assert.equal(out.blockiert, false);
  assert.equal(out.pro_regel["REG-900"].treffer, 1);
});

test("Kandidat, der mit einer Bestandsregel kollidiert, blockiert als neuer Konflikt", () => {
  const out = probelauf({
    transaktionen: [tx({ gegenpartei: "Autostadt Restaurant", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-017", kategorie_herkunft: "regel", matched_regeln: ["REG-002"] })],
    bestandsRegeln: bestand,
    kandidaten: [{ regel_id: "REG-900", gegenpartei_pattern: "autostadt", kategorie_id: "KAT-007", status: "aktiv", erstellt_am: "2026-08-12", kommentar: "x" }],
  });
  assert.equal(out.neue_konflikte.length, 1);
  assert.deepEqual(out.neue_konflikte[0].regeln.sort(), ["REG-002", "REG-900"]);
  assert.equal(out.blockiert, true);
});

test("Kandidat, der einer bestaetigten Regel-Kategorie widerspricht, blockiert als Wiedervorlage", () => {
  const out = probelauf({
    transaktionen: [tx({ gegenpartei: "MusterladenA Mitte", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"] })],
    bestandsRegeln: [bestand[0]],
    // Deaktiviert die alte Regel und setzt eine andere Kategorie: eindeutiger
    // Treffer, aber Widerspruch zur bestaetigten Kategorie.
    kandidaten: [
      { regel_id: "REG-001", gegenpartei_pattern: "musterladena", kategorie_id: "KAT-003", status: "inaktiv", erstellt_am: "2026-06-01", kommentar: "x" },
      { regel_id: "REG-900", gegenpartei_pattern: "musterladena", kategorie_id: "KAT-015", status: "aktiv", erstellt_am: "2026-08-12", kommentar: "x" },
    ],
  });
  assert.equal(out.wiedervorlagen.length, 1);
  assert.equal(out.wiedervorlagen[0].ist_kategorie, "KAT-003");
  assert.equal(out.wiedervorlagen[0].neu_kategorie, "KAT-015");
  assert.equal(out.blockiert, true);
});

test("manuelle und abgelehnte Buchungen loesen nie eine Wiedervorlage aus", () => {
  const out = probelauf({
    transaktionen: [
      tx({ transaktion_id: "TXN-M", gegenpartei: "MusterladenA Mitte", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-007", kategorie_herkunft: "manuell" }),
      tx({ transaktion_id: "TXN-A", gegenpartei: "MusterladenA Nord", kategorisierung_status: "abgelehnt" }),
    ],
    bestandsRegeln: [],
    kandidaten: [{ regel_id: "REG-900", gegenpartei_pattern: "musterladena", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-08-12", kommentar: "x" }],
  });
  assert.equal(out.wiedervorlagen.length, 0);
  assert.equal(out.blockiert, false);
});

test("bestaetigte Buchung mit gleicher Kategorie ist keine Wiedervorlage", () => {
  const out = probelauf({
    transaktionen: [tx({ gegenpartei: "MusterladenA Mitte", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"] })],
    bestandsRegeln: [],
    kandidaten: [{ regel_id: "REG-900", gegenpartei_pattern: "musterladena", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-08-12", kommentar: "x" }],
  });
  assert.equal(out.wiedervorlagen.length, 0);
  assert.equal(out.blockiert, false);
});

test("ein Kandidat ohne jeden Treffer wird als wirkungslos gemeldet, blockiert aber nicht", () => {
  const out = probelauf({
    transaktionen: [tx({ gegenpartei: "Irgendwer" })],
    bestandsRegeln: bestand,
    kandidaten: [{ regel_id: "REG-900", gegenpartei_pattern: "gibtesnicht", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-08-12", kommentar: "x" }],
  });
  assert.deepEqual(out.ohne_treffer, ["REG-900"]);
  assert.equal(out.blockiert, false);
});

test("Kandidat mit bereits vergebener regel_id blockiert", () => {
  const out = probelauf({
    transaktionen: [tx({})],
    bestandsRegeln: bestand,
    kandidaten: [{ regel_id: "REG-001", gegenpartei_pattern: "neu", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-08-12", kommentar: "x" }],
  });
  assert.ok(out.struktur_fehler.some((f) => /REG-001/.test(f)));
  assert.equal(out.blockiert, true);
});

test("Kandidat ohne Kommentar oder mit unbekannter Kategorie blockiert", () => {
  const out = probelauf({
    transaktionen: [tx({})],
    bestandsRegeln: [],
    kandidaten: [{ regel_id: "REG-900", gegenpartei_pattern: "x", kategorie_id: "KAT-999", status: "aktiv", erstellt_am: "2026-08-12" }],
    kategorieIds: ["KAT-003"],
  });
  assert.equal(out.blockiert, true);
  assert.ok(out.struktur_fehler.length >= 2);
});

test("eine Aenderung an einer Bestandsregel ersetzt sie, statt sie zu doppeln", () => {
  const out = probelauf({
    transaktionen: [tx({ gegenpartei: "MusterladenA Mitte" })],
    bestandsRegeln: bestand,
    // Gleiche ID wie im Bestand + ausdrueckliche Aenderungsabsicht.
    kandidaten: [{ regel_id: "REG-001", gegenpartei_pattern: "musterladena", kategorie_id: "KAT-015", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "geschaerft" }],
    aenderung: true,
  });
  assert.equal(out.struktur_fehler.length, 0);
  assert.equal(out.pro_regel["REG-001"].kategorie_id, "KAT-015");
  assert.equal(out.treffer, 1);
});

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

test("unspezifisches Muster blockiert den Probelauf", () => {
  const mensch = (g, k) => ({
    transaktion_id: `TXN-${g}`, konto_id: "KTO-001", buchungsdatum: "2026-05-20", betrag: "-10.00",
    gegenpartei: g, verwendungszweck: "", ist_transfer: false,
    kategorisierung_status: "bestaetigt", kategorie_id: k, bestaetigt_durch: "mensch",
  });
  const bestand = [mensch("Testladen Ortstoken", "KAT-003"), mensch("Baumarkt Ortstoken", "KAT-005"), mensch("Apotheke Ortstoken", "KAT-007")];
  const out = probelauf({
    transaktionen: bestand, bestandsRegeln: [],
    kandidaten: [{ regel_id: "REG-900", gegenpartei_pattern: "Ortstoken", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-08-31", kommentar: "zu breit", belegstufe: "E3" }],
  });
  assert.equal(out.unspezifisch.length, 1);
  assert.equal(out.unspezifisch[0].regel_id, "REG-900");
  assert.equal(out.blockiert, true);
});

// --- belegstufe ist ein Schemafeld, kein Fremdkoerper ---------------------

test("belegstufe ist ein erlaubtes Feld und blockiert nicht", () => {
  const out = probelauf({
    transaktionen: [tx({ gegenpartei: "Musterrestaurant Mitte" })],
    bestandsRegeln: [],
    kandidaten: [{ regel_id: "REG-900", gegenpartei_pattern: "musterrestaurant", kategorie_id: "KAT-017", status: "aktiv", erstellt_am: "2026-08-31", kommentar: "x", belegstufe: "E2" }],
  });
  assert.deepEqual(out.struktur_fehler, []);
  assert.equal(out.blockiert, false);
});

test("belegstufe ausserhalb von E1 bis E4 blockiert", () => {
  const out = probelauf({
    transaktionen: [tx({})],
    bestandsRegeln: [],
    kandidaten: [{ regel_id: "REG-900", gegenpartei_pattern: "x", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-08-31", kommentar: "x", belegstufe: "E6" }],
  });
  assert.ok(out.struktur_fehler.some((f) => /belegstufe muss E1 bis E4 sein/.test(f)));
  assert.equal(out.blockiert, true);
});

// --- Trefferzaehler und Trefferverlust ------------------------------------

const bestaetigt = (over) => tx({ kategorisierung_status: "bestaetigt", kategorie_herkunft: "regel", bestaetigt_durch: "auto", ...over });

test("Treffer zaehlen ueber den Gesamtbestand, nicht nur ueber den Offen-Stapel", () => {
  // Der Fall vom 2026-08-31: Offen-Stapel bei 0, die Regel traegt trotzdem
  // Buchungen. Das Tool meldete "ohne aktuellen Treffer" und 0 Wirkung.
  const out = probelauf({
    transaktionen: [
      bestaetigt({ transaktion_id: "TXN-1", gegenpartei: "MusterladenA Mitte", kategorie_id: "KAT-003", matched_regeln: ["REG-001"] }),
      bestaetigt({ transaktion_id: "TXN-2", gegenpartei: "MusterladenA Nord", kategorie_id: "KAT-003", matched_regeln: ["REG-001"] }),
    ],
    bestandsRegeln: [],
    kandidaten: [{ regel_id: "REG-900", gegenpartei_pattern: "musterladena", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-08-31", kommentar: "x", belegstufe: "E2" }],
  });
  assert.equal(out.pro_regel["REG-900"].treffer, 2);
  assert.equal(out.treffer, 2);
  assert.deepEqual(out.ohne_treffer, []);
  assert.equal(out.blockiert, false);
});

test("Einengung, die bestaetigte Buchungen aus der Regel fallen laesst, blockiert", () => {
  // REG-251 am 2026-08-31: Muster ohne Kontobezug griff nach einem Import auf
  // ein Konto ueber, fuer das der Beleg nicht galt. Die Einengung nimmt der
  // falsch getroffenen Buchung ihre Kategorie — sie faellt auf offen zurueck.
  const out = probelauf({
    transaktionen: [
      bestaetigt({ transaktion_id: "TXN-RICHTIG", konto_id: "KTO-001", gegenpartei: "Mustermieter", kategorie_id: "KAT-005", matched_regeln: ["REG-251"] }),
      bestaetigt({ transaktion_id: "TXN-UEBERGRIFF", konto_id: "KTO-009", gegenpartei: "Mustermieter", kategorie_id: "KAT-005", matched_regeln: ["REG-251"] }),
    ],
    bestandsRegeln: [{ regel_id: "REG-251", gegenpartei_pattern: "mustermieter", kategorie_id: "KAT-005", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "x", belegstufe: "E1" }],
    kandidaten: [{ regel_id: "REG-251", gegenpartei_pattern: "mustermieter", konto_id: "KTO-001", kategorie_id: "KAT-005", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "auf das belegte Konto eingeengt", belegstufe: "E1" }],
    aenderung: true,
  });
  assert.equal(out.verlorene_bestaetigte.length, 1);
  assert.equal(out.verlorene_bestaetigte[0].transaktion_id, "TXN-UEBERGRIFF");
  assert.equal(out.verlorene_bestaetigte[0].ist_kategorie, "KAT-005");
  assert.equal(out.verlorene_bestaetigte[0].neu_kategorie, null);
  assert.deepEqual(out.verlorene_bestaetigte[0].regeln, ["REG-251"]);
  assert.equal(out.pro_regel["REG-251"].verliert_bestaetigt, 1);
  assert.equal(out.pro_regel["REG-251"].treffer, 1);
  assert.equal(out.blockiert, true);
});

test("Einengung ohne Kategorieverlust ist kein Trefferverlust", () => {
  // Eine zweite Regel deckt die Buchung mit derselben Kategorie weiter ab —
  // fachlich aendert sich nichts, also darf das Tool nicht blockieren.
  const out = probelauf({
    transaktionen: [
      bestaetigt({ transaktion_id: "TXN-UEBERGRIFF", konto_id: "KTO-009", gegenpartei: "Mustermieter", kategorie_id: "KAT-005", matched_regeln: ["REG-251", "REG-300"] }),
    ],
    bestandsRegeln: [
      { regel_id: "REG-251", gegenpartei_pattern: "mustermieter", kategorie_id: "KAT-005", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "x", belegstufe: "E1" },
      { regel_id: "REG-300", gegenpartei_pattern: "mustermieter", konto_id: "KTO-009", kategorie_id: "KAT-005", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "x", belegstufe: "E1" },
    ],
    kandidaten: [{ regel_id: "REG-251", gegenpartei_pattern: "mustermieter", konto_id: "KTO-001", kategorie_id: "KAT-005", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "eingeengt", belegstufe: "E1" }],
    aenderung: true,
  });
  assert.deepEqual(out.verlorene_bestaetigte, []);
  assert.equal(out.blockiert, false);
});

test("eine Einengung, die nur offene Buchungen fallen laesst, blockiert nicht", () => {
  const out = probelauf({
    transaktionen: [tx({ transaktion_id: "TXN-OFFEN", konto_id: "KTO-009", gegenpartei: "Mustermieter" })],
    bestandsRegeln: [{ regel_id: "REG-251", gegenpartei_pattern: "mustermieter", kategorie_id: "KAT-005", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "x", belegstufe: "E1" }],
    kandidaten: [{ regel_id: "REG-251", gegenpartei_pattern: "mustermieter", konto_id: "KTO-001", kategorie_id: "KAT-005", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "eingeengt", belegstufe: "E1" }],
    aenderung: true,
  });
  assert.deepEqual(out.verlorene_bestaetigte, []);
  assert.equal(out.blockiert, false);
});

test("manuelle und abgelehnte Buchungen sind kein Trefferverlust", () => {
  const out = probelauf({
    transaktionen: [
      bestaetigt({ transaktion_id: "TXN-M", konto_id: "KTO-009", gegenpartei: "Mustermieter", kategorie_id: "KAT-005", kategorie_herkunft: "manuell" }),
      tx({ transaktion_id: "TXN-A", konto_id: "KTO-009", gegenpartei: "Mustermieter", kategorisierung_status: "abgelehnt" }),
    ],
    bestandsRegeln: [{ regel_id: "REG-251", gegenpartei_pattern: "mustermieter", kategorie_id: "KAT-005", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "x", belegstufe: "E1" }],
    kandidaten: [{ regel_id: "REG-251", gegenpartei_pattern: "mustermieter", konto_id: "KTO-001", kategorie_id: "KAT-005", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "eingeengt", belegstufe: "E1" }],
    aenderung: true,
  });
  assert.deepEqual(out.verlorene_bestaetigte, []);
  assert.equal(out.blockiert, false);
});

test("eine stillgelegte Regel, die bestaetigte Buchungen traegt, blockiert", () => {
  // Stilllegen ist die radikalste Einengung: alle Treffer fallen weg.
  const out = probelauf({
    transaktionen: [bestaetigt({ transaktion_id: "TXN-1", gegenpartei: "Mustermieter", kategorie_id: "KAT-005", matched_regeln: ["REG-251"] })],
    bestandsRegeln: [{ regel_id: "REG-251", gegenpartei_pattern: "mustermieter", kategorie_id: "KAT-005", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "x", belegstufe: "E1" }],
    kandidaten: [{ regel_id: "REG-251", gegenpartei_pattern: "mustermieter", kategorie_id: "KAT-005", status: "inaktiv", erstellt_am: "2026-06-01", kommentar: "stillgelegt", belegstufe: "E1" }],
    aenderung: true,
  });
  assert.equal(out.verlorene_bestaetigte.length, 1);
  assert.equal(out.pro_regel["REG-251"].verliert_bestaetigt, 1);
  assert.equal(out.blockiert, true);
});

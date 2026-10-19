// tests/menschliche-entscheidung.test.mjs
//
// Eine menschliche Bestaetigung (bestaetigt_durch = mensch) ist fuer jeden
// Regellauf tabu, auch mit Herkunft regel. Frueher machte recategorize sie bei
// einer Regelaenderung zum Vorschlag, und das Gate gab sie danach als auto mit
// der neuen Kategorie frei: die Entscheidung war still weg. Das Gate selbst
// vertraute gespeicherten matched_regeln, statt frisch gegen den aktuellen
// Regelstand zu kategorisieren.
import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmTransactions } from "../app/tools/confirm.mjs";
import { freigabe } from "../app/tools/freigabe.mjs";
import { pruefbericht, renderBericht } from "../app/tools/pruefbericht.mjs";
import { recategorize } from "../app/tools/recategorize.mjs";
import { probelauf } from "../app/tools/regel-probelauf.mjs";

let n = 0;
function tx(props) {
  n += 1;
  return {
    transaktion_id: `TXN-${String(n).padStart(8, "0")}-2222-4222-8222-222222222222`,
    dedupe_hash: `h${n}`, rohquelle: "data/inbox/x.csv", konto_id: "KTO-001",
    buchungsdatum: "2026-05-20", betrag: "-10.00", gegenpartei: "Testladen Mitte",
    verwendungszweck: "", ist_transfer: false, ...props,
  };
}
function regel(props) {
  return { regel_id: "REG-001", gegenpartei_pattern: "testladen", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-06-01", kommentar: "Testregel", belegstufe: "E2", ...props };
}
const mensch = (props) => tx({ kategorisierung_status: "bestaetigt", bestaetigt_durch: "mensch", kategorie_herkunft: "regel", kategorie_id: "KAT-003", matched_regeln: ["REG-001"], ...props });
const auto = (props) => mensch({ bestaetigt_durch: "auto", ...props });

// --- Nach-Kategorisierung -------------------------------------------------

test("recategorize: menschliche Bestaetigung mit Herkunft regel bleibt bei widersprechender Regel unveraendert", () => {
  const t = mensch();
  const out = recategorize({ transaktionen: [t], regeln: [regel({ kategorie_id: "KAT-005" })] });
  assert.deepEqual(out.transaktionen[0], t);
  assert.equal(out.report.wiedervorlage, 0);
  assert.equal(out.report.uebersprungen, 1);
  assert.equal(out.report.widerspruch, 1);
});

test("recategorize: historischer Regelbezug einer menschlichen Bestaetigung bleibt, auch wenn die Regel nicht mehr trifft", () => {
  const t = mensch();
  const out = recategorize({ transaktionen: [t], regeln: [regel({ konto_id: "KTO-009" })] });
  assert.deepEqual(out.transaktionen[0], t);
  assert.equal(out.report.widerspruch, 0);
});

test("recategorize: eine Auto-Freigabe wird weiter neu bewertet", () => {
  const out = recategorize({ transaktionen: [auto()], regeln: [regel({ kategorie_id: "KAT-005" })] });
  assert.equal(out.transaktionen[0].kategorisierung_status, "vorgeschlagen");
  assert.equal(out.transaktionen[0].kategorie_id, "KAT-005");
  assert.equal(out.report.wiedervorlage, 1);
  assert.equal(out.report.widerspruch, 0);
});

test("Ende zu Ende: bestaetigen, Regel aendern, nachkategorisieren, freigeben laesst die menschliche Entscheidung stehen", () => {
  const regeln = [regel()];
  const bestaetigt = confirmTransactions({
    transaktionen: [tx({ kategorisierung_status: "offen" })], regeln,
    filter: { gegenpartei: "testladen" }, entscheidung: { aktion: "kategorie", kategorie_id: "KAT-003" },
  }).transaktionen;
  assert.equal(bestaetigt[0].kategorie_herkunft, "regel");
  assert.equal(bestaetigt[0].bestaetigt_durch, "mensch");

  const geaendert = [regel({ kategorie_id: "KAT-005" })];
  const nach = recategorize({ transaktionen: bestaetigt, regeln: geaendert }).transaktionen;
  const frei = freigabe({ transaktionen: nach, regeln: geaendert }).transaktionen;
  assert.deepEqual(frei, bestaetigt);

  const bericht = pruefbericht({ transaktionen: frei, regeln: geaendert, log: [] });
  assert.equal(bericht.widersprueche.length, 1);
  assert.equal(bericht.widersprueche[0].transaktion_id, bestaetigt[0].transaktion_id);
});

// --- Pruefbericht ---------------------------------------------------------

test("Pruefbericht listet menschliche Entscheidungen, denen das Regelwerk heute eine andere Kategorie gibt", () => {
  const widerspruch = mensch();
  const transaktionen = [
    widerspruch,
    mensch({ kategorie_id: "KAT-005" }), // gleiche Kategorie wie die Regel heute
    mensch({ gegenpartei: "Ganz Anderer Haendler" }), // kein Treffer: kein Widerspruch
    auto(), // Auto-Freigabe: das ist Sache der Nach-Kategorisierung
    mensch({ kategorie_herkunft: "manuell", matched_regeln: undefined }), // bewusste Uebersteuerung
    mensch({ kategorie_herkunft: "agent", matched_regeln: undefined }), // menschlich bestaetigte Schaetzung
  ];
  const b = pruefbericht({ transaktionen, regeln: [regel({ kategorie_id: "KAT-005" })], log: [] });
  assert.deepEqual(b.widersprueche.map((w) => w.transaktion_id), [widerspruch.transaktion_id, transaktionen[5].transaktion_id]);
  assert.equal(b.widersprueche[0].ist_kategorie, "KAT-003");
  assert.equal(b.widersprueche[0].regel_kategorie, "KAT-005");
  assert.deepEqual(b.widersprueche[0].regeln, ["REG-001"]);

  const text = renderBericht(b);
  assert.match(text, /MENSCHLICHE ENTSCHEIDUNGEN IM WIDERSPRUCH ZUM REGELWERK \(2\)/);
  assert.match(text, /KAT-003 -> KAT-005/);
});

// --- Probelauf ------------------------------------------------------------

test("Probelauf: Widerspruch zu einer menschlichen Entscheidung ist keine Wiedervorlage, blockiert aber", () => {
  const t = mensch();
  const out = probelauf({
    transaktionen: [t],
    bestandsRegeln: [regel()],
    kandidaten: [regel({ kategorie_id: "KAT-005" })],
    aenderung: true,
  });
  assert.deepEqual(out.wiedervorlagen, []);
  assert.equal(out.widersprueche.length, 1);
  assert.equal(out.widersprueche[0].transaktion_id, t.transaktion_id);
  assert.equal(out.widersprueche[0].neu_kategorie, "KAT-005");
  assert.equal(out.blockiert, true);
});

test("Probelauf: eine Einengung nimmt einer menschlichen Entscheidung nichts weg", () => {
  const out = probelauf({
    transaktionen: [mensch({ konto_id: "KTO-009" })],
    bestandsRegeln: [regel()],
    kandidaten: [regel({ konto_id: "KTO-001" })],
    aenderung: true,
  });
  assert.deepEqual(out.verlorene_bestaetigte, []);
  assert.deepEqual(out.widersprueche, []);
  assert.equal(out.blockiert, false);
});

// --- Gate: frisch gegen den aktuellen Regelstand --------------------------

const vorschlag = (props) => tx({ kategorisierung_status: "vorgeschlagen", kategorie_herkunft: "regel", kategorie_id: "KAT-003", matched_regeln: ["REG-001"], ...props });

test("Gate haelt zurueck, wenn der gespeicherte Vorschlag nicht mehr dem aktuellen Regelstand entspricht", () => {
  const faelle = [
    ["Kategorie geaendert", [regel({ kategorie_id: "KAT-005" })]],
    ["Muster geaendert", [regel({ gegenpartei_pattern: "beispielmarkt" })]],
    ["Konto eingeengt", [regel({ konto_id: "KTO-009" })]],
    ["Vorzeichen eingeengt", [regel({ vorzeichen: "einnahme" })]],
    ["neue Regel mit anderer Kategorie (Konflikt)", [regel(), regel({ regel_id: "REG-002", kategorie_id: "KAT-005" })]],
    ["neue Regel mit gleicher Kategorie", [regel(), regel({ regel_id: "REG-002", gegenpartei_pattern: "mitte" })]],
  ];
  for (const [fall, regeln] of faelle) {
    const v = vorschlag();
    const out = freigabe({ transaktionen: [v], regeln });
    assert.deepEqual(out.transaktionen[0], v, fall);
    assert.equal(out.report.freigegeben, 0, fall);
    assert.equal(out.report.zurueckgehalten, 1, fall);
    assert.deepEqual(out.report.gate_durchfall, [{ regel_id: "REG-001", grund: "abweichung" }], fall);
  }
});

test("Gate gibt frei, wenn der frische Lauf den gespeicherten Vorschlag bestaetigt", () => {
  const out = freigabe({ transaktionen: [vorschlag()], regeln: [regel(), regel({ regel_id: "REG-002", gegenpartei_pattern: "beispielmarkt", kategorie_id: "KAT-005" })] });
  assert.equal(out.report.freigegeben, 1);
  assert.equal(out.transaktionen[0].bestaetigt_durch, "auto");
});

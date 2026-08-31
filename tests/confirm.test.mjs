// tests/confirm.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmTransactions } from "../app/tools/confirm.mjs";

const regeln = [
  { regel_id: "REG-001", gegenpartei_pattern: "musterladena", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-06-01" },
  { regel_id: "REG-002", gegenpartei_pattern: "musterladenb", kategorie_id: "KAT-005", status: "aktiv", erstellt_am: "2026-06-01" },
];

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
    ...props,
  };
}

test("bestaetigen macht aus einem Vorschlag eine Entscheidung und behaelt die Herkunft", () => {
  const t = tx({ gegenpartei: "MusterladenA Mitte", kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"] });
  const out = confirmTransactions({ transaktionen: [t], regeln, filter: { status: "vorgeschlagen" }, entscheidung: { aktion: "bestaetigen" } });
  const r = out.transaktionen[0];
  assert.equal(r.kategorisierung_status, "bestaetigt");
  assert.equal(r.kategorie_id, "KAT-003");
  assert.equal(r.kategorie_herkunft, "regel");
  assert.deepEqual(r.matched_regeln, ["REG-001"]);
  assert.equal(out.report.geaendert, 1);
});

test("bestaetigen ohne Kategorie ist ein Fehler, kein stiller Schreibvorgang", () => {
  const t = tx({ gegenpartei: "Unbekannt", kategorisierung_status: "offen" });
  const out = confirmTransactions({ transaktionen: [t], regeln, filter: { status: "offen" }, entscheidung: { aktion: "bestaetigen" } });
  assert.deepEqual(out.transaktionen[0], t);
  assert.equal(out.report.geaendert, 0);
  assert.equal(out.report.fehler.length, 1);
  assert.match(out.report.fehler[0].grund, /Kategorie/);
});

test("ablehnen laesst die Buchung ohne Kategorie zurueck", () => {
  // Ein abgelehnter Vorschlag traegt keine Kategorie mehr — sonst stuende eine
  // Kategorie am Datensatz, die fachlich nicht gilt. matched_regeln ist bei
  // abgelehnt ohnehin vom Validator verboten.
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"] });
  const out = confirmTransactions({ transaktionen: [t], regeln, filter: { status: "vorgeschlagen" }, entscheidung: { aktion: "ablehnen" } });
  const r = out.transaktionen[0];
  assert.equal(r.kategorisierung_status, "abgelehnt");
  assert.equal(Object.hasOwn(r, "matched_regeln"), false);
  assert.equal(Object.hasOwn(r, "kategorie_id"), false);
  assert.equal(Object.hasOwn(r, "kategorie_herkunft"), false);
});

test("kategorie setzen abweichend von jeder Regel macht die Herkunft manuell", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"] });
  const out = confirmTransactions({ transaktionen: [t], regeln, filter: { status: "vorgeschlagen" }, entscheidung: { aktion: "kategorie", kategorie_id: "KAT-009" } });
  const r = out.transaktionen[0];
  assert.equal(r.kategorisierung_status, "bestaetigt");
  assert.equal(r.kategorie_id, "KAT-009");
  assert.equal(r.kategorie_herkunft, "manuell");
  assert.equal(Object.hasOwn(r, "matched_regeln"), false);
});

test("kategorie setzen auf genau die Regel-Kategorie bleibt Herkunft regel", () => {
  // agent-context: Regel und manuell schliessen sich aus. Sonst zaehlte die
  // Buchung nie zur Regel und die Regel erschiene faelschlich als "greift nie".
  const t = tx({ gegenpartei: "MusterladenA Sued", kategorisierung_status: "offen" });
  const out = confirmTransactions({ transaktionen: [t], regeln, filter: { status: "offen" }, entscheidung: { aktion: "kategorie", kategorie_id: "KAT-003" } });
  const r = out.transaktionen[0];
  assert.equal(r.kategorie_herkunft, "regel");
  assert.deepEqual(r.matched_regeln, ["REG-001"]);
});

test("entschiedene Buchungen bleiben unangetastet, solange nicht ausdruecklich freigegeben", () => {
  const bestaetigt = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "manuell" });
  const abgelehnt = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "abgelehnt" });
  const out = confirmTransactions({ transaktionen: [bestaetigt, abgelehnt], regeln, filter: { gegenpartei: "musterladena" }, entscheidung: { aktion: "kategorie", kategorie_id: "KAT-005" } });
  assert.deepEqual(out.transaktionen, [bestaetigt, abgelehnt]);
  assert.equal(out.report.uebersprungen, 2);
  assert.equal(out.report.geaendert, 0);
});

test("auch_entschiedene erlaubt dem Menschen die Korrektur einer bestaetigten Buchung", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"] });
  const out = confirmTransactions({ transaktionen: [t], regeln, filter: { gegenpartei: "musterladena", auch_entschiedene: true }, entscheidung: { aktion: "kategorie", kategorie_id: "KAT-009" } });
  const r = out.transaktionen[0];
  assert.equal(r.kategorie_id, "KAT-009");
  assert.equal(r.kategorie_herkunft, "manuell");
  assert.equal(out.report.geaendert, 1);
});

test("zweiter identischer Lauf aendert nichts (idempotent)", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"] });
  const args = { regeln, filter: { status: "vorgeschlagen" }, entscheidung: { aktion: "bestaetigen" } };
  const erst = confirmTransactions({ transaktionen: [t], ...args });
  assert.equal(erst.report.geaendert, 1, "erster Lauf muss wirken, sonst prueft der zweite nichts");
  const zweit = confirmTransactions({ transaktionen: erst.transaktionen, ...args });
  assert.deepEqual(zweit.transaktionen, erst.transaktionen);
  assert.equal(zweit.report.geaendert, 0);
});

test("gegenpartei-filter trifft lose normalisiert und laesst andere Buchungen in Ruhe", () => {
  const treffer = tx({ gegenpartei: "  MusterladenA   Mitte ", kategorisierung_status: "offen" });
  const daneben = tx({ gegenpartei: "MusterladenB", kategorisierung_status: "offen" });
  const out = confirmTransactions({ transaktionen: [treffer, daneben], regeln, filter: { gegenpartei: "musterladena mitte" }, entscheidung: { aktion: "kategorie", kategorie_id: "KAT-003" } });
  assert.equal(out.transaktionen[0].kategorisierung_status, "bestaetigt");
  assert.deepEqual(out.transaktionen[1], daneben);
  assert.equal(out.report.betroffen, 1);
});

test("zeitraum-filter grenzt inklusiv auf von/bis ein", () => {
  const drin = tx({ gegenpartei: "MusterladenA", buchungsdatum: "2026-05-20", kategorisierung_status: "offen" });
  const davor = tx({ gegenpartei: "MusterladenA", buchungsdatum: "2026-05-19", kategorisierung_status: "offen" });
  const out = confirmTransactions({ transaktionen: [drin, davor], regeln, filter: { von: "2026-05-20", bis: "2026-05-31" }, entscheidung: { aktion: "kategorie", kategorie_id: "KAT-003" } });
  assert.equal(out.report.betroffen, 1);
  assert.deepEqual(out.transaktionen[1], davor);
});

test("regel_id-filter trifft ueber matched_regeln", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"] });
  const andere = tx({ gegenpartei: "MusterladenB", kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-005", kategorie_herkunft: "regel", matched_regeln: ["REG-002"] });
  const out = confirmTransactions({ transaktionen: [t, andere], regeln, filter: { regel_id: "REG-001" }, entscheidung: { aktion: "bestaetigen" } });
  assert.equal(out.report.geaendert, 1);
  assert.equal(out.transaktionen[0].kategorisierung_status, "bestaetigt");
  assert.deepEqual(out.transaktionen[1], andere);
});

test("ein Filter ohne jedes Kriterium wird abgelehnt statt auf alles zu wirken", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "offen" });
  assert.throws(
    () => confirmTransactions({ transaktionen: [t], regeln, filter: {}, entscheidung: { aktion: "bestaetigen" } }),
    /Filter/,
  );
});

test("ids-filter waehlt einzelne Buchungen punktgenau", () => {
  const a = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "offen" });
  const b = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "offen" });
  const out = confirmTransactions({ transaktionen: [a, b], regeln, filter: { ids: [b.transaktion_id] }, entscheidung: { aktion: "kategorie", kategorie_id: "KAT-003" } });
  assert.deepEqual(out.transaktionen[0], a);
  assert.equal(out.transaktionen[1].kategorisierung_status, "bestaetigt");
});

test("bestaetigen setzt bestaetigt_durch mensch", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"] });
  const out = confirmTransactions({ transaktionen: [t], regeln, filter: { regel_id: "REG-001" }, entscheidung: { aktion: "bestaetigen" } });
  assert.equal(out.transaktionen[0].bestaetigt_durch, "mensch");
});

test("Einzelkorrektur setzt bestaetigt_durch mensch", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"] });
  const out = confirmTransactions({ transaktionen: [t], regeln, filter: { ids: [t.transaktion_id] }, entscheidung: { aktion: "kategorie", kategorie_id: "KAT-007" } });
  assert.equal(out.transaktionen[0].bestaetigt_durch, "mensch");
  assert.equal(out.transaktionen[0].kategorie_herkunft, "manuell");
});

test("ablehnen setzt kein bestaetigt_durch", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"] });
  const out = confirmTransactions({ transaktionen: [t], regeln, filter: { regel_id: "REG-001" }, entscheidung: { aktion: "ablehnen" } });
  assert.equal(Object.hasOwn(out.transaktionen[0], "bestaetigt_durch"), false);
});

test("ablehnen entfernt ein vorhandenes bestaetigt_durch", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"], bestaetigt_durch: "auto" });
  const out = confirmTransactions({ transaktionen: [t], regeln, filter: { regel_id: "REG-001", auch_entschiedene: true }, entscheidung: { aktion: "ablehnen" } });
  assert.equal(Object.hasOwn(out.transaktionen[0], "bestaetigt_durch"), false);
});

test("Korrektur einer Auto-Freigabe wird als Lernsignal vermerkt", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"], bestaetigt_durch: "auto" });
  const out = confirmTransactions({
    transaktionen: [t], regeln,
    filter: { ids: [t.transaktion_id], auch_entschiedene: true },
    entscheidung: { aktion: "kategorie", kategorie_id: "KAT-007" },
  });
  assert.equal(out.report.korrekturen.length, 1);
  assert.equal(out.report.korrekturen[0].regel_id, "REG-001");
  assert.equal(out.report.korrekturen[0].von_kategorie, "KAT-003");
  assert.equal(out.report.korrekturen[0].nach_kategorie, "KAT-007");
});

test("Korrektur einer menschlichen Bestaetigung zaehlt nicht als Lernsignal", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"], bestaetigt_durch: "mensch" });
  const out = confirmTransactions({
    transaktionen: [t], regeln,
    filter: { ids: [t.transaktion_id], auch_entschiedene: true },
    entscheidung: { aktion: "kategorie", kategorie_id: "KAT-007" },
  });
  assert.equal(out.report.korrekturen.length, 0);
});

test("Ablehnen einer Auto-Freigabe ist ebenfalls ein Lernsignal", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"], bestaetigt_durch: "auto" });
  const out = confirmTransactions({
    transaktionen: [t], regeln,
    filter: { ids: [t.transaktion_id], auch_entschiedene: true },
    entscheidung: { aktion: "ablehnen" },
  });
  assert.equal(out.report.korrekturen.length, 1);
  assert.equal(out.report.korrekturen[0].nach_kategorie, null);
});

test("Bestaetigen einer Auto-Freigabe ist keine Korrektur", () => {
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"], bestaetigt_durch: "auto" });
  const out = confirmTransactions({
    transaktionen: [t], regeln,
    filter: { ids: [t.transaktion_id], auch_entschiedene: true },
    entscheidung: { aktion: "bestaetigen" },
  });
  assert.equal(out.report.korrekturen.length, 0);
});

test("Korrektur traegt die Belegstufe der Regel mit", () => {
  const mitStufe = [{ ...regeln[0], belegstufe: "E4" }, regeln[1]];
  const t = tx({ gegenpartei: "MusterladenA", kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"], bestaetigt_durch: "auto" });
  const out = confirmTransactions({
    transaktionen: [t], regeln: mitStufe,
    filter: { ids: [t.transaktion_id], auch_entschiedene: true },
    entscheidung: { aktion: "kategorie", kategorie_id: "KAT-007" },
  });
  assert.equal(out.report.korrekturen[0].belegstufe, "E4");
});

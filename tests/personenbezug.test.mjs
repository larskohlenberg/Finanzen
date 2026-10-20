import assert from "node:assert/strict";
import { test } from "node:test";
import { personenbezug } from "../app/tools/personenbezug.mjs";
import { validateMasterData } from "../app/tools/validator.mjs";

const personen = [{ person_id: "PER-001" }, { person_id: "PER-003" }, { person_id: "PER-004" }];
const tx = (id, over = {}) => ({
  transaktion_id: id,
  konto_id: "KTO-001",
  buchungsdatum: "2026-01-01",
  betrag: "-10.00",
  gegenpartei: "Musterverein",
  verwendungszweck: "Beitrag",
  kategorisierung_status: "bestaetigt",
  ist_transfer: false,
  ...over,
});
const regel = (id, over = {}) => ({ regel_id: id, kategorie_id: "KAT-001", status: "aktiv", gegenpartei_pattern: "musterverein", ...over });

test("Regel mit Person setzt die Person, Herkunft regel", () => {
  const out = personenbezug({ transaktionen: [tx("T1")], personen, regeln: [regel("REG-001", { fuer_person_id: "PER-003" })] });
  assert.equal(out.transaktionen[0].fuer_person_id, "PER-003");
  assert.equal(out.transaktionen[0].fuer_person_herkunft, "regel");
  assert.equal(out.report.gesetzt, 1);
  assert.deepEqual(out.report.je_person, { "PER-003": 1 });
});

test("Regel ohne Person, inaktive Regel und fremdes Muster setzen nichts", () => {
  const out = personenbezug({
    transaktionen: [tx("T1"), tx("T2", { gegenpartei: "Anderer" })],
    personen,
    regeln: [regel("REG-001"), regel("REG-002", { status: "inaktiv", fuer_person_id: "PER-003" }), regel("REG-003", { gegenpartei_pattern: "kiosk", fuer_person_id: "PER-004" })],
  });
  assert.equal(out.report.unveraendert, 2);
  assert.ok(out.transaktionen.every((t) => !t.fuer_person_id));
});

test("Regelzahlung geht der Regel vor", () => {
  const out = personenbezug({
    transaktionen: [tx("T1", { regelzahlung_id: "RZ-001" })],
    personen,
    regeln: [regel("REG-001", { fuer_person_id: "PER-003" })],
    regelzahlungen: [{ regelzahlung_id: "RZ-001", fuer_person_id: "PER-004" }],
  });
  assert.equal(out.transaktionen[0].fuer_person_id, "PER-004");
  assert.equal(out.transaktionen[0].fuer_person_herkunft, "regelzahlung");
});

test("zwei Regeln mit verschiedenen Personen: keine Person, Konflikt gemeldet", () => {
  const out = personenbezug({
    transaktionen: [tx("T1", { fuer_person_id: "PER-003", fuer_person_herkunft: "regel" })],
    personen,
    regeln: [regel("REG-001", { fuer_person_id: "PER-003" }), regel("REG-002", { verwendungszweck_pattern: "beitrag", gegenpartei_pattern: undefined, fuer_person_id: "PER-004" })],
  });
  assert.equal(out.transaktionen[0].fuer_person_id, undefined);
  assert.equal(out.report.entfernt, 1);
  assert.deepEqual(out.report.konflikte, [{ transaktion_id: "T1", regeln: ["REG-001", "REG-002"] }]);
});

test("abgeleitete Person faellt weg, wenn die Regel sie nicht mehr traegt", () => {
  const out = personenbezug({ transaktionen: [tx("T1", { fuer_person_id: "PER-003", fuer_person_herkunft: "regel" })], personen, regeln: [regel("REG-001")] });
  assert.equal(out.transaktionen[0].fuer_person_id, undefined);
  assert.equal(out.transaktionen[0].fuer_person_herkunft, undefined);
});

test("Handentscheidung schlaegt die Ableitung und bleibt bei spaeteren Laeufen", () => {
  const regeln = [regel("REG-001", { fuer_person_id: "PER-003" })];
  const hand = personenbezug({ transaktionen: [tx("T1"), tx("T2")], personen, regeln, ids: ["T1"], personId: "PER-004" });
  assert.equal(hand.report.hand, 1);
  assert.equal(hand.transaktionen[0].fuer_person_id, "PER-004");
  assert.equal(hand.transaktionen[0].fuer_person_herkunft, "manuell");
  assert.equal(hand.transaktionen[1].fuer_person_id, "PER-003");
  const spaeter = personenbezug({ transaktionen: hand.transaktionen, personen, regeln });
  assert.equal(spaeter.transaktionen[0].fuer_person_id, "PER-004");
  assert.equal(spaeter.report.unveraendert, 2);
});

test("entfernen heisst bewusst keine Person; automatisch gibt an die Ableitung zurueck", () => {
  const regeln = [regel("REG-001", { fuer_person_id: "PER-003" })];
  const weg = personenbezug({ transaktionen: [tx("T1")], personen, regeln, ids: ["T1"], entfernen: true });
  assert.deepEqual([weg.transaktionen[0].fuer_person_id, weg.transaktionen[0].fuer_person_herkunft], [undefined, "manuell"]);
  const zurueck = personenbezug({ transaktionen: weg.transaktionen, personen, regeln, ids: ["T1"], automatisch: true });
  assert.deepEqual([zurueck.transaktionen[0].fuer_person_id, zurueck.transaktionen[0].fuer_person_herkunft], ["PER-003", "regel"]);
});

test("unbekannte IDs blockieren, unbekannte Person und unklare Aktion werfen", () => {
  const out = personenbezug({ transaktionen: [tx("T1")], personen, ids: ["T9"], personId: "PER-003" });
  assert.equal(out.blockiert, true);
  assert.deepEqual(out.report.nicht_gefunden, ["T9"]);
  assert.throws(() => personenbezug({ transaktionen: [tx("T1")], personen, ids: ["T1"], personId: "PER-099" }), /PER-099 existiert nicht/);
  assert.throws(() => personenbezug({ transaktionen: [tx("T1")], personen, ids: ["T1"] }), /genau eine Aktion/);
  assert.throws(() => personenbezug({ transaktionen: [tx("T1")], personen, personId: "PER-003" }), /brauchen ids/);
});

test("Validator prueft Personenverweise und die Herkunft", () => {
  const basis = {
    personen: [{ person_id: "PER-001", name: "A", status: "aktiv" }],
    konten: [{ konto_id: "KTO-001", name: "Giro", typ: "giro", inhaber_person_ids: ["PER-001"], status: "aktiv" }],
    kategorien: [{ kategorie_id: "KAT-001", name: "X", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" }],
    transfers: [],
  };
  const befunde = (transaktion, extra = {}) => validateMasterData({ ...basis, transaktionen: [{ ...tx("TXN-00000000-0000-4000-8000-000000000001"), dedupe_hash: "h", rohquelle: "x", kategorie_id: "KAT-001", kategorie_herkunft: "manuell", bestaetigt_durch: "mensch", ...transaktion }], ...extra }).befunde
    .filter((b) => String(b.feld ?? b.meldung).includes("fuer_person"));
  assert.equal(befunde({ fuer_person_id: "PER-001", fuer_person_herkunft: "regel" }).length, 0);
  assert.equal(befunde({ fuer_person_herkunft: "manuell" }).length, 0);
  assert.ok(befunde({ fuer_person_id: "PER-009", fuer_person_herkunft: "manuell" }).some((b) => /PER-009 existiert nicht/.test(b.meldung)));
  assert.ok(befunde({ fuer_person_id: "PER-001" }).some((b) => /Pflicht bei fuer_person_id/.test(b.meldung)));
  assert.ok(befunde({ fuer_person_herkunft: "regel" }).some((b) => /ohne fuer_person_id/.test(b.meldung)));
  const regelBefunde = validateMasterData({ ...basis, transaktionen: [], kategorisierungsregeln: [{ ...regel("REG-001", { fuer_person_id: "PER-009" }), erstellt_am: "2026-01-01", kommentar: "k" }] }).befunde;
  assert.ok(regelBefunde.some((b) => /PER-009 existiert nicht/.test(b.meldung)));
});

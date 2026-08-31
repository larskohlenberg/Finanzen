// tests/validator-bestaetigt-durch.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { validateMasterData } from "../app/tools/validate-core.mjs";

function basis(extra = {}) {
  return {
    personen: [{ person_id: "PER-001", name: "Testperson", status: "aktiv" }],
    konten: [{ konto_id: "KTO-001", name: "Testkonto", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    kategorien: [{ kategorie_id: "KAT-003", name: "Testkategorie", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" }],
    transaktionen: [],
    transfers: [],
    ...extra,
  };
}

function tx(props) {
  return {
    transaktion_id: "TXN-11111111-1111-4111-8111-111111111111",
    dedupe_hash: "h1",
    rohquelle: "data/inbox/x.csv",
    konto_id: "KTO-001",
    buchungsdatum: "2026-05-20",
    betrag: "-10.00",
    gegenpartei: "Testladen",
    verwendungszweck: "",
    ist_transfer: false,
    ...props,
  };
}

test("bestaetigt ohne bestaetigt_durch ist ungueltig", () => {
  const data = basis({ transaktionen: [tx({ kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "manuell" })] });
  const out = validateMasterData(data);
  assert.equal(out.valid, false);
  assert.ok(out.errors.some((e) => e.includes("bestaetigt_durch")));
});

test("bestaetigt_durch ohne bestaetigt ist ungueltig", () => {
  const data = basis({ transaktionen: [tx({ kategorisierung_status: "offen", bestaetigt_durch: "auto" })] });
  const out = validateMasterData(data);
  assert.equal(out.valid, false);
  assert.ok(out.errors.some((e) => e.includes("bestaetigt_durch")));
});

test("bestaetigt mit bestaetigt_durch ist gueltig", () => {
  const data = basis({ transaktionen: [tx({ kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "manuell", bestaetigt_durch: "mensch" })] });
  const out = validateMasterData(data);
  assert.equal(out.valid, true, out.errors.join("; "));
});

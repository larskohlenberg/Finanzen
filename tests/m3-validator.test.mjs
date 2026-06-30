import { test } from "node:test";
import assert from "node:assert/strict";
import { validateMasterData } from "../app/tools/validate-core.mjs";

const TRF = "TRF-11111111-1111-4111-8111-111111111111";
const TXN_ABGANG = "TXN-11111111-1111-4111-8111-111111111111";
const TXN_ZUGANG = "TXN-22222222-2222-4222-8222-222222222222";
const TXN_EXTERN = "TXN-33333333-3333-4333-8333-333333333333";
const TXN_FEHLT = "TXN-44444444-4444-4444-8444-444444444444";

function basis(extra = {}) {
  return {
    personen: [{ person_id: "PER-001", name: "Person A", status: "aktiv" }],
    konten: [
      { konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" },
      { konto_id: "KTO-002", name: "Tagesgeld", kontotyp: "tagesgeld", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" },
    ],
    kategorien: [{ kategorie_id: "KAT-001", name: "Sparen", typ: "neutral", lebenshaltung_relevant: false, status: "aktiv" }],
    transaktionen: [],
    transfers: [],
    ...extra,
  };
}

function tx(id, konto_id, betrag, extra = {}) {
  return {
    transaktion_id: id,
    dedupe_hash: `hash-${id}`,
    rohquelle: "tests/transfer.csv",
    konto_id,
    buchungsdatum: "2026-06-01",
    betrag,
    gegenpartei: "Umbuchung",
    verwendungszweck: "Transfer",
    kategorisierung_status: "offen",
    ist_transfer: true,
    transfer_id: TRF,
    ...extra,
  };
}

function internerTransfer(extra = {}) {
  return { transfer_id: TRF, betrag: "100.00", typ: "intern", abgang_transaktion_id: TXN_ABGANG, zugang_transaktion_id: TXN_ZUGANG, ...extra };
}

function externerTransfer(extra = {}) {
  return { transfer_id: TRF, betrag: "100.00", typ: "extern", abgang_transaktion_id: TXN_EXTERN, gegenseite_typ: "extern_sonstiges", begruendung: "Barabhebung", ...extra };
}

test("Validator lehnt inkonsistente Transfer-Referenzen ab", () => {
  const faelle = [
    {
      name: "interne Referenz ohne ist_transfer",
      data: basis({
        transaktionen: [tx(TXN_ABGANG, "KTO-001", "-100.00", { ist_transfer: false }), tx(TXN_ZUGANG, "KTO-002", "100.00")],
        transfers: [internerTransfer()],
      }),
      erwartet: /ist_transfer/,
    },
    {
      name: "interne Referenz ohne Rueckverweis",
      data: basis({
        transaktionen: [tx(TXN_ABGANG, "KTO-001", "-100.00", { transfer_id: "TRF-22222222-2222-4222-8222-222222222222" }), tx(TXN_ZUGANG, "KTO-002", "100.00")],
        transfers: [internerTransfer()],
      }),
      erwartet: /transfer_id.*Rueckverweis/,
    },
    {
      name: "interner Transfer auf demselben Konto",
      data: basis({
        transaktionen: [tx(TXN_ABGANG, "KTO-001", "-100.00"), tx(TXN_ZUGANG, "KTO-001", "100.00")],
        transfers: [internerTransfer()],
      }),
      erwartet: /unterschiedliche Konten/,
    },
    {
      name: "interner Transfer referenziert dieselbe Transaktion zweimal",
      data: basis({
        transaktionen: [tx(TXN_ABGANG, "KTO-001", "-100.00")],
        transfers: [internerTransfer({ zugang_transaktion_id: TXN_ABGANG })],
      }),
      erwartet: /unterschiedliche Transaktionen/,
    },
    {
      name: "externe Referenz existiert nicht",
      data: basis({
        transaktionen: [],
        transfers: [externerTransfer({ abgang_transaktion_id: TXN_FEHLT })],
      }),
      erwartet: /referenzierte Transaktion.*existiert nicht/,
    },
    {
      name: "externe Referenz ohne ist_transfer",
      data: basis({
        transaktionen: [tx(TXN_EXTERN, "KTO-001", "-100.00", { ist_transfer: false })],
        transfers: [externerTransfer()],
      }),
      erwartet: /ist_transfer/,
    },
    {
      name: "externe Referenz ohne Rueckverweis",
      data: basis({
        transaktionen: [tx(TXN_EXTERN, "KTO-001", "-100.00", { transfer_id: "TRF-22222222-2222-4222-8222-222222222222" })],
        transfers: [externerTransfer()],
      }),
      erwartet: /transfer_id.*Rueckverweis/,
    },
  ];

  for (const fall of faelle) {
    const result = validateMasterData(fall.data);
    assert.equal(result.valid, false, fall.name);
    assert.match(result.errors.join("\n"), fall.erwartet, fall.name);
  }
});

test("Validator lehnt aktive Kategorisierungsregel ohne Pattern ab", () => {
  const result = validateMasterData(basis({
    kategorisierungsregeln: [{
      regel_id: "REG-001",
      kategorie_id: "KAT-001",
      status: "aktiv",
      erstellt_am: "2026-06-16",
      kommentar: "Ohne Pattern kann die aktive Regel nie matchen",
    }],
  }));

  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /aktive Regel.*pattern/i);
});

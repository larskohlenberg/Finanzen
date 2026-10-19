// tests/validator-zustandstabelle.test.mjs
// 1B.1: Zustandstabelle der Kategorisierung, Herkunftsvertrag, stabile
// Fehlercodes mit Objekt/Feld, ID-Muster mit drei oder mehr Ziffern.
import assert from "node:assert/strict";
import { test } from "node:test";
import { KATEGORISIERUNG_ZUSTAENDE, neueBefunde, validateMasterData } from "../app/tools/validate-core.mjs";

const TXN_A = "TXN-11111111-1111-4111-8111-111111111111";
const TXN_B = "TXN-22222222-2222-4222-8222-222222222222";

function basis(extra = {}) {
  return {
    personen: [{ person_id: "PER-001", name: "Testperson", status: "aktiv" }],
    konten: [{ konto_id: "KTO-001", name: "Testkonto", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    kategorien: [
      { kategorie_id: "KAT-003", name: "Testkategorie", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" },
      { kategorie_id: "KAT-004", name: "Andere", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" },
    ],
    kategorisierungsregeln: [{ regel_id: "REG-001", gegenpartei_pattern: "Testladen", kategorie_id: "KAT-003", status: "aktiv", erstellt_am: "2026-01-01", kommentar: "Test" }],
    transaktionen: [],
    transfers: [],
    ...extra,
  };
}

function tx(props, id = TXN_A) {
  return {
    transaktion_id: id,
    dedupe_hash: `h-${id}`,
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

// Erwartete legale Kombinationen (Status, Herkunft, bestaetigt_durch, Regelbezug, Kategorie).
const LEGAL = new Set([
  "offen - - - -",
  "offen - - mr -",
  "vorgeschlagen regel - mr kat",
  "vorgeschlagen agent - - kat",
  "bestaetigt regel auto mr kat",
  "bestaetigt regel auto - kat",
  "bestaetigt regel mensch mr kat",
  "bestaetigt regel mensch - kat",
  "bestaetigt agent auto - kat",
  "bestaetigt agent mensch - kat",
  "bestaetigt manuell mensch - kat",
  "abgelehnt - - - -",
]);

test("Zustandstabelle: genau die legalen Kombinationen sind gueltig", () => {
  const abweichungen = [];
  for (const status of ["offen", "vorgeschlagen", "bestaetigt", "abgelehnt"]) {
    for (const herkunft of ["-", "regel", "agent", "manuell"]) {
      for (const durch of ["-", "auto", "mensch"]) {
        for (const mr of ["-", "mr"]) {
          for (const kat of ["-", "kat"]) {
            const props = { kategorisierung_status: status };
            if (herkunft !== "-") props.kategorie_herkunft = herkunft;
            if (durch !== "-") props.bestaetigt_durch = durch;
            if (mr === "mr") props.matched_regeln = ["REG-001"];
            if (kat === "kat") props.kategorie_id = "KAT-003";
            const schluessel = [status, herkunft, durch, mr, kat].join(" ");
            const out = validateMasterData(basis({ transaktionen: [tx(props)] }));
            if (out.valid !== LEGAL.has(schluessel)) abweichungen.push(`${schluessel}: valid=${out.valid} ${out.errors.join(" | ")}`);
          }
        }
      }
    }
  }
  assert.deepEqual(abweichungen, []);
});

test("Zustandstabelle ist exportiert und deckt sich mit der Erwartung", () => {
  const ausTabelle = new Set();
  for (const z of KATEGORISIERUNG_ZUSTAENDE) {
    for (const durch of z.bestaetigt_durch) {
      for (const mr of z.matched_regeln) {
        ausTabelle.add([z.status, z.herkunft ?? "-", durch ?? "-", mr ? "mr" : "-", z.kategorie ? "kat" : "-"].join(" "));
      }
    }
  }
  assert.deepEqual([...ausTabelle].sort(), [...LEGAL].sort());
});

test("Zustandsfehler nennt Code, Objekt und Feld", () => {
  const out = validateMasterData(basis({ transaktionen: [tx({ kategorisierung_status: "vorgeschlagen", kategorie_id: "KAT-003" })] }));
  assert.equal(out.valid, false);
  const befund = out.befunde.find((b) => b.code === "kategorisierung-zustand");
  assert.ok(befund, JSON.stringify(out.befunde));
  assert.equal(befund.sammlung, "transaktionen");
  assert.equal(befund.objekt, TXN_A);
  assert.equal(befund.feld, "kategorie_herkunft");
  assert.equal(befund.stufe, "fehler");
  assert.ok(out.errors.includes(befund.meldung));
});

test("manuell zusammen mit auto ist ungueltig", () => {
  const out = validateMasterData(basis({ transaktionen: [tx({ kategorisierung_status: "bestaetigt", kategorie_id: "KAT-003", kategorie_herkunft: "manuell", bestaetigt_durch: "auto" })] }));
  assert.equal(out.valid, false);
  assert.ok(out.befunde.some((b) => b.code === "kategorisierung-zustand" && b.feld === "bestaetigt_durch"));
});

test("leere matched_regeln sind ungueltig", () => {
  const out = validateMasterData(basis({ transaktionen: [tx({ kategorisierung_status: "offen", matched_regeln: [] })] }));
  assert.equal(out.valid, false);
  assert.ok(out.befunde.some((b) => b.feld === "matched_regeln"));
});

test("Herkunftsvertrag: historische Regelentscheidung muss nicht der heutigen Regelkategorie gleichen", () => {
  // REG-001 liefert heute KAT-003; die Buchung wurde damals mit KAT-004 entschieden.
  const out = validateMasterData(basis({ transaktionen: [tx({ kategorisierung_status: "bestaetigt", kategorie_id: "KAT-004", kategorie_herkunft: "regel", bestaetigt_durch: "mensch", matched_regeln: ["REG-001"] })] }));
  assert.equal(out.valid, true, out.errors.join("; "));
});

test("jeder Befund hat Code, Sammlung und Meldung", () => {
  const data = basis({
    konten: [{ konto_id: "KTO-1", name: "", kontotyp: "x", inhaber_person_ids: ["PER-999"], liquiditaetsrelevant: "ja", status: "aktiv", extra: 1 }],
    transaktionen: [tx({ kategorisierung_status: "offen", konto_id: "KTO-999" })],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-998", feld: "marktwert", wert: "1.00", standdatum: "2026-01-01", qualitaet: "belegt" }],
  });
  const out = validateMasterData(data);
  assert.equal(out.errors.length, out.befunde.length);
  for (const b of out.befunde) {
    assert.match(b.code, /^[a-z][a-z0-9-]*$/, JSON.stringify(b));
    assert.equal(typeof b.sammlung, "string", JSON.stringify(b));
    assert.equal(typeof b.meldung, "string");
  }
  const zw = out.befunde.find((b) => b.sammlung === "zeitwerte" && b.code === "verweis");
  assert.equal(zw.objekt, "konto:KTO-998:marktwert:2026-01-01");
});

test("neueBefunde: Einfuegen davor macht einen alten Strukturfehler nicht neu", () => {
  const kaputt = tx({ kategorisierung_status: "offen", unbekannt: 1 }, TXN_A);
  const vorher = validateMasterData(basis({ transaktionen: [kaputt] })).befunde;
  const nachher = validateMasterData(basis({ transaktionen: [tx({ kategorisierung_status: "offen" }, TXN_B), kaputt] })).befunde;
  assert.notDeepEqual(vorher.map((b) => b.meldung), nachher.map((b) => b.meldung));
  assert.deepEqual(neueBefunde(vorher, nachher), []);
});

test("neueBefunde: zweiter gleichartiger Fehler an einem anderen Objekt ist neu", () => {
  const vorher = validateMasterData(basis({ transaktionen: [tx({ kategorisierung_status: "offen", unbekannt: 1 }, TXN_A)] })).befunde;
  const nachher = validateMasterData(basis({ transaktionen: [tx({ kategorisierung_status: "offen", unbekannt: 1 }, TXN_A), tx({ kategorisierung_status: "offen", unbekannt: 1 }, TXN_B)] })).befunde;
  const neu = neueBefunde(vorher, nachher);
  assert.equal(neu.length, 1);
  assert.equal(neu[0].objekt, TXN_B);
});

test("numerische ID-Klassen erlauben mehr als drei Ziffern, aber nicht weniger", () => {
  const data = basis();
  data.konten[0].konto_id = "KTO-1000";
  data.transaktionen = [tx({ kategorisierung_status: "offen", konto_id: "KTO-1000" })];
  data.kategorisierungsregeln[0].regel_id = "REG-1001";
  assert.equal(validateMasterData(data).valid, true, validateMasterData(data).errors.join("; "));
  data.konten[0].konto_id = "KTO-12";
  data.transaktionen[0].konto_id = "KTO-12";
  assert.equal(validateMasterData(data).valid, false);
});

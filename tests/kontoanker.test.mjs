// tests/kontoanker.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { ankerpaare, trefferkonten, kontoanker, stufeVerliehen, ungedeckteKonten } from "../app/tools/lib/kontoanker.mjs";

let n = 0;
function tx(props) {
  n += 1;
  return {
    transaktion_id: `TXN-${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`,
    konto_id: "KTO-001", buchungsdatum: "2026-05-20", betrag: "-10.00",
    gegenpartei: "Testladen", verwendungszweck: "", ist_transfer: false, ...props,
  };
}
// Der realistische Anker: menschlich bestaetigt, regelbasiert, mit Provenance.
const anker = (props) => tx({
  kategorisierung_status: "bestaetigt", bestaetigt_durch: "mensch",
  kategorie_herkunft: "regel", kategorie_id: "KAT-003", matched_regeln: ["REG-001"], ...props,
});
const treffer = (props) => tx({
  kategorisierung_status: "vorgeschlagen", kategorie_herkunft: "regel",
  kategorie_id: "KAT-003", matched_regeln: ["REG-001"], ...props,
});
const regel = (props) => ({ regel_id: "REG-001", kategorie_id: "KAT-003", status: "aktiv", belegstufe: "E2", ...props });

test("nur menschliche Entscheidungen bilden Anker", () => {
  const paare = ankerpaare([
    anker({ konto_id: "KTO-001" }),
    tx({ konto_id: "KTO-002", kategorisierung_status: "bestaetigt", bestaetigt_durch: "auto", kategorie_id: "KAT-003" }),
    tx({ konto_id: "KTO-003", kategorisierung_status: "bestaetigt", kategorie_herkunft: "manuell", kategorie_id: "KAT-003" }),
  ]);
  assert.ok(paare.has("KAT-003|KTO-001"));
  assert.ok(paare.has("KAT-003|KTO-003"), "manuell zaehlt wie mensch");
  assert.ok(!paare.has("KAT-003|KTO-002"), "eine Auto-Freigabe belegt nichts");
});

test("trefferkonten zaehlt je Regel und Konto aus matched_regeln", () => {
  const t = trefferkonten([
    treffer({ konto_id: "KTO-001" }), treffer({ konto_id: "KTO-002" }), treffer({ konto_id: "KTO-002" }),
    tx({ konto_id: "KTO-009" }),
  ]);
  assert.deepEqual([...t.get("REG-001")], [["KTO-001", 1], ["KTO-002", 2]]);
});

test("Belegstufe auf einem anderen getroffenen Konto ist verliehen", () => {
  const a = kontoanker([anker({ konto_id: "KTO-001" }), treffer({ konto_id: "KTO-006" })]);
  assert.equal(stufeVerliehen(regel(), "KTO-006", a), true);
});

test("auf dem eigenen Ankerkonto ist die Stufe verdient", () => {
  const a = kontoanker([anker({ konto_id: "KTO-001" }), treffer({ konto_id: "KTO-006" })]);
  assert.equal(stufeVerliehen(regel(), "KTO-001", a), false);
});

test("eine Regel ganz ohne menschlichen Anker erschliesst Neuland, verleiht nichts", () => {
  // E3/E4 ruhen auf Beleg oder Recherche und sind kontounabhaengig. Wuerde das
  // Gate hier greifen, waere fuer jedes neue Konto der Bucket-Dialog zurueck.
  const a = kontoanker([treffer({ konto_id: "KTO-006" }), treffer({ konto_id: "KTO-009" })]);
  assert.equal(stufeVerliehen(regel({ belegstufe: "E3" }), "KTO-006", a), false);
});

test("eine Auto-Freigabe auf dem Zielkonto macht die Stufe nicht verdient", () => {
  const a = kontoanker([
    anker({ konto_id: "KTO-001" }),
    tx({ konto_id: "KTO-006", kategorisierung_status: "bestaetigt", bestaetigt_durch: "auto", kategorie_id: "KAT-003", kategorie_herkunft: "regel", matched_regeln: ["REG-001"] }),
  ]);
  assert.equal(stufeVerliehen(regel(), "KTO-006", a), true);
});

test("ein Anker fremder Kategorie auf demselben Konto traegt nicht", () => {
  const a = kontoanker([
    anker({ konto_id: "KTO-001" }),
    anker({ konto_id: "KTO-006", kategorie_id: "KAT-005", matched_regeln: ["REG-777"] }),
    treffer({ konto_id: "KTO-006" }),
  ]);
  assert.equal(stufeVerliehen(regel(), "KTO-006", a), true);
});

test("ungedeckteKonten trennt verliehen von Neuland", () => {
  const a = kontoanker([
    anker({ konto_id: "KTO-001" }),
    treffer({ konto_id: "KTO-006" }), treffer({ konto_id: "KTO-006" }),
    treffer({ konto_id: "KTO-009", kategorie_id: "KAT-007", matched_regeln: ["REG-002"] }),
  ]);
  const offen = ungedeckteKonten([regel(), regel({ regel_id: "REG-002", kategorie_id: "KAT-007", belegstufe: "E3" })], a);
  assert.equal(offen.length, 2);
  assert.deepEqual(
    offen.map((e) => [e.regel_id, e.konto_id, e.anzahl, e.verliehen]),
    [["REG-001", "KTO-006", 2, true], ["REG-002", "KTO-009", 1, false]],
  );
  assert.deepEqual(offen[0].gedeckt, ["KTO-001"]);
});

test("inaktive Regeln stehen nicht in der Liste — sie geben nichts frei", () => {
  const a = kontoanker([anker({ konto_id: "KTO-001" }), treffer({ konto_id: "KTO-006" })]);
  assert.deepEqual(ungedeckteKonten([regel({ status: "inaktiv" })], a), []);
});

test("leerer Bestand liefert leere Listen statt Fehler", () => {
  const a = kontoanker([]);
  assert.deepEqual(ungedeckteKonten([], a), []);
  assert.equal(stufeVerliehen(regel(), "KTO-001", a), false);
});

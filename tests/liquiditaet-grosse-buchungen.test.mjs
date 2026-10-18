import { test } from "node:test";
import assert from "node:assert/strict";
import { grosseBuchungen, liquiditaetVerlauf } from "../app/liquiditaet.mjs";

const konto = (konto_id, extra = {}) => ({ konto_id, name: konto_id, kontotyp: "giro", status: "aktiv", liquiditaetsrelevant: true, ...extra });
const tx = (id, konto_id, buchungsdatum, betrag, extra = {}) => ({ transaktion_id: id, konto_id, buchungsdatum, betrag, gegenpartei: "", verwendungszweck: "", ...extra });

function daten() {
  return {
    personen: [{ person_id: "PER-001", name: "Erika Muster" }],
    kategorien: [{ kategorie_id: "KAT-100", name: "Geldanlage" }],
    konten: [konto("KTO-001"), konto("KTO-002", { kontotyp: "tagesgeld" }), konto("KTO-009", { kontotyp: "depot", liquiditaetsrelevant: false })],
    transfers: [
      { transfer_id: "TRF-1", abgang_transaktion_id: "T-U1", zugang_transaktion_id: "T-U2" },
      { transfer_id: "TRF-2", abgang_transaktion_id: "T-D1", zugang_transaktion_id: "T-D2" },
    ],
    transaktionen: [
      // Umbuchung Giro -> Tagesgeld: hebt sich auf.
      tx("T-U1", "KTO-001", "2026-09-02", "-12000.00", { transfer_id: "TRF-1" }),
      tx("T-U2", "KTO-002", "2026-09-02", "12000.00", { transfer_id: "TRF-1" }),
      // Umbuchung ins Depot: verlaesst die Liquiditaet.
      tx("T-D1", "KTO-001", "2026-08-10", "-6000.00", { transfer_id: "TRF-2" }),
      tx("T-D2", "KTO-009", "2026-08-10", "6000.00", { transfer_id: "TRF-2" }),
      // Rechnung eines Haendlers.
      tx("T-R", "KTO-001", "2026-09-15", "-11199.70", { gegenpartei: "Gartenbau Beispiel GmbH" }),
      // Festgeld-Anlage an sich selbst, nur mit Bemerkung.
      tx("T-F", "KTO-002", "2026-09-03", "-20000.00", { gegenpartei: "Erika Muster", bemerkung: "Festgeld Beispielbank, Anlage 3 Monate" }),
      // Gehalt in drei Monaten: wiederkehrend.
      tx("T-G1", "KTO-001", "2026-07-28", "7800.00", { gegenpartei: "Arbeitgeber AG" }),
      tx("T-G2", "KTO-001", "2026-08-27", "7900.00", { gegenpartei: "Arbeitgeber AG" }),
      tx("T-G3", "KTO-001", "2026-09-28", "8100.00", { gegenpartei: "Arbeitgeber AG" }),
      // Miete als Regelzahlung, klein und unter der Schwelle.
      tx("T-M", "KTO-001", "2026-09-01", "-4500.00", { gegenpartei: "Vermieter", regelzahlung_id: "RZ-001" }),
      tx("T-K", "KTO-001", "2026-09-20", "-3999.99", { gegenpartei: "Moebelhaus" }),
    ],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "30000.00", standdatum: "2026-01-01", qualitaet: "belegt" }],
  };
}

test("Grosse Buchungen: ohne interne Umbuchung, Gehalt, Regelzahlung und unter der Schwelle", () => {
  const g = grosseBuchungen(daten(), "2026-07-01", "2026-09-30");
  assert.deepEqual(g.map((b) => b.transaktion_id), ["T-D1", "T-F", "T-R"]);
});

test("Beschriftung: Gegenpartei, bei eigener Person Bemerkung oder Zweck", () => {
  const g = grosseBuchungen(daten(), "2026-07-01", "2026-09-30");
  assert.equal(g.find((b) => b.transaktion_id === "T-R").label, "Gartenbau Beispiel GmbH");
  assert.equal(g.find((b) => b.transaktion_id === "T-F").label, "Festgeld Beispielbank");
  assert.equal(g.find((b) => b.transaktion_id === "T-F").betrag_cents, -2000000);
});

test("Liquiditaetsverlauf haengt die grossen Buchungen an ihren Monat", () => {
  const v = liquiditaetVerlauf(daten(), "2026-10-05");
  assert.deepEqual(v.find((p) => p.monat === "2026-09").grosse.map((b) => b.transaktion_id), ["T-F", "T-R"]);
  assert.deepEqual(v.find((p) => p.monat === "2026-08").grosse.map((b) => b.transaktion_id), ["T-D1"]);
  assert.deepEqual(v.find((p) => p.monat === "2026-10").grosse, []);
});

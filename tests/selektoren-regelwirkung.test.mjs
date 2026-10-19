// Regelwirkung: Treffer je Regel und Buchungen einer Regel (GET /api/v1/regelwirkung).
import assert from "node:assert/strict";
import test from "node:test";
import { regelWirkungAntwort } from "../app/transaktionen-abfrage.mjs";

const daten = {
  transaktionen: [
    { transaktion_id: "TXN-1", buchungsdatum: "2026-01-02", gegenpartei: "Musterladen", matched_regeln: ["REG-001"] },
    { transaktion_id: "TXN-2", buchungsdatum: "2026-01-03", gegenpartei: "Musterladen", matched_regeln: ["REG-001", "REG-002"] },
    { transaktion_id: "TXN-3", buchungsdatum: "2026-01-04", gegenpartei: "Beispielbank" },
  ],
};

test("regelWirkungAntwort zaehlt Treffer pro Regel", () => {
  const w = regelWirkungAntwort(daten);
  assert.deepEqual(w.anzahl, { "REG-001": 2, "REG-002": 1 });
  assert.equal(w.regel, null);
});

test("regelWirkungAntwort liefert fuer eine Regel Anzahl, Beispiele und nur die noetigen Felder", () => {
  const { regel } = regelWirkungAntwort(daten, { regel: "REG-001", zeilen: 1 });
  assert.equal(regel.anzahl, 2);
  assert.deepEqual(regel.beispiele, ["Musterladen"]);
  assert.deepEqual(regel.zeilen, [{ transaktion_id: "TXN-1", buchungsdatum: "2026-01-02", gegenpartei: "Musterladen" }]);
});

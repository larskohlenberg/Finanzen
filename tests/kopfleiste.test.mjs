// Kopfleiste (app/kopfleiste.mjs): Transfer-Pruefung und Zaehler, erfundene Daten.
import assert from "node:assert/strict";
import test from "node:test";
import { kopfleisteModell, transferPruefung } from "../app/kopfleiste.mjs";

const tx = (id, transfer) => ({ transaktion_id: id, ist_transfer: true, transfer_id: transfer, buchungsdatum: "2026-01-02", betrag: "-1.00", kategorisierung_status: "offen" });

test("transferPruefung: vollstaendig nur mit beiden Buchungen, markiert und verknuepft", () => {
  const daten = {
    transaktionen: [tx("A", "TR-1"), tx("B", "TR-1"), tx("C", "TR-2")],
    transfers: [
      { transfer_id: "TR-1", betrag: "1.00", abgang_transaktion_id: "A", zugang_transaktion_id: "B" },
      { transfer_id: "TR-2", betrag: "1.00", abgang_transaktion_id: "C", zugang_transaktion_id: "FEHLT" },
    ],
  };
  assert.deepEqual(transferPruefung(daten).map((t) => [t.transfer_id, t.ok]), [["TR-1", true], ["TR-2", false]]);
});

test("kopfleisteModell: offene Kategorien, Checks mit unvollstaendigem Transfer, Aktionen", () => {
  const daten = {
    metadata: { dataMode: "demo" }, validation: { valid: true, errors: [] }, checks: [], importfehler: [],
    personen: [], konten: [], kategorien: [], regelzahlungen: [], immobilien: [], darlehen: [], vermoegenswerte: [], vorsorge: [], zeitwerte: [],
    kategorisierungsregeln: [], szenarien: [], fristen: [],
    transaktionen: [tx("A", "TR-1")],
    transfers: [{ transfer_id: "TR-1", betrag: "1.00", abgang_transaktion_id: "A", zugang_transaktion_id: "FEHLT" }],
  };
  const m = kopfleisteModell(daten, "2026-10-19");
  assert.equal(m.offene_kategorien, 1);
  assert.equal(m.offene_checks, 1);
  assert.ok(m.aktionen.length >= 1);
});

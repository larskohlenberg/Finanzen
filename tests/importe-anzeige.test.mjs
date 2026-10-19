import assert from "node:assert/strict";
import test from "node:test";
import { inboxMitStatus, auftragSchritte, dateiname } from "../app/importe-anzeige.mjs";

test("Inbox-Dateien bekommen ihren Stand aus dem Importbericht", () => {
  const dateien = [{ name: "a.csv", groesse: 10 }, { name: "b.pdf", groesse: 20 }];
  const importe = { wartend: [{ datei: "a.csv", status: "uebernommen-archiv-ausstehend", auftrag_id: "IMP-001" }, { datei: "b.pdf", status: "hochgeladen" }] };
  assert.deepEqual(inboxMitStatus(dateien, importe).map((d) => [d.name, d.stand, d.auftrag_id]), [["a.csv", "uebernommen-archiv-ausstehend", "IMP-001"], ["b.pdf", "hochgeladen", null]]);
  assert.deepEqual(inboxMitStatus(dateien, null).map((d) => d.stand), ["hochgeladen", "hochgeladen"], "ohne Bericht: hochgeladen");
});

test("Schritte eines Auftrags: hochgeladen, gelesen, uebernommen/teilweise/abgewiesen, archiviert", () => {
  const teilweise = { status: "teilweise", zeilen: { gelesen: 10, uebernommen: 7, dubletten: 2, abgewiesen: 1 }, archiv: "data/inbox/processed/x.csv" };
  assert.deepEqual(auftragSchritte(teilweise), [
    { schritt: "hochgeladen", erledigt: true },
    { schritt: "gelesen", erledigt: true, zahl: 10 },
    { schritt: "teilweise", erledigt: true, zahl: 7 },
    { schritt: "abgeschlossen", erledigt: true },
  ]);
  const abgewiesen = { status: "abgewiesen", zeilen: { gelesen: 0, uebernommen: 0, dubletten: 0, abgewiesen: 0 }, grund: "kein Profil" };
  assert.deepEqual(auftragSchritte(abgewiesen).map((s) => [s.schritt, s.erledigt]), [["hochgeladen", true], ["gelesen", false], ["abgewiesen", true], ["abgeschlossen", false]]);
});

test("Dateiname aus Pfad", () => {
  assert.equal(dateiname("data/inbox/processed/2026-10 Konto.csv"), "2026-10 Konto.csv");
  assert.equal(dateiname(""), "");
});

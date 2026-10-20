// Liquiditaetsverlauf: Rueckrechnung aus einem spaeteren Kontostand ist belegt
// (Anker und Buchungen); unvollstaendig ist nur ein Monat, in den noch nicht
// alle Konten hinein importiert sind.
import assert from "node:assert/strict";
import test from "node:test";
import { liquiditaetVerlauf } from "../app/liquiditaet.mjs";

const giro = (id) => ({ konto_id: id, name: id, kontotyp: "giro", liquiditaetsrelevant: true, status: "aktiv", inhaber_person_ids: [] });

test("zurueckgerechnete Monate sind vollstaendig, Monate nach dem letzten Import unvollstaendig", () => {
  const data = {
    konten: [giro("KTO-1")],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-1", feld: "kontostand", wert: "1000.00", standdatum: "2026-03-31", qualitaet: "belegt" }],
    transaktionen: [{ transaktion_id: "T1", konto_id: "KTO-1", buchungsdatum: "2026-02-10", betrag: "-100.00" }],
  };
  const verlauf = liquiditaetVerlauf(data, "2026-05-15", 4);
  assert.deepEqual(verlauf.map((p) => [p.monat, p.unvollstaendig]), [["2026-02", false], ["2026-03", false], ["2026-04", true], ["2026-05", true]]);
});

test("ein Konto mit spaeterem Import reicht nicht: unvollstaendig, solange eines fehlt", () => {
  const data = {
    konten: [giro("KTO-1"), giro("KTO-2")],
    zeitwerte: [],
    transaktionen: [
      { transaktion_id: "T1", konto_id: "KTO-1", buchungsdatum: "2026-05-15", betrag: "10.00" },
      { transaktion_id: "T2", konto_id: "KTO-2", buchungsdatum: "2026-04-20", betrag: "10.00" },
    ],
  };
  assert.deepEqual(liquiditaetVerlauf(data, "2026-05-15", 2).map((p) => p.unvollstaendig), [true, true]);
  data.transaktionen.push({ transaktion_id: "T3", konto_id: "KTO-2", buchungsdatum: "2026-05-15", betrag: "1.00" });
  assert.deepEqual(liquiditaetVerlauf(data, "2026-05-15", 2).map((p) => p.unvollstaendig), [false, false]);
});

test("Konto ganz ohne Stand macht den Verlauf nicht unvollstaendig", () => {
  const data = { konten: [giro("KTO-2")], zeitwerte: [], transaktionen: [] };
  assert.ok(liquiditaetVerlauf(data, "2026-05-15", 3).every((p) => p.unvollstaendig === false));
});

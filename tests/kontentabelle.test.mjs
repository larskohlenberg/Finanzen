// Kontentabelle der Uebersicht: Wert und Belegstatus kommen aus derselben
// Rechnung wie das Nettovermoegen (kontoWert), nicht aus festen Texten.
import assert from "node:assert/strict";
import test from "node:test";
import { kontoZeile } from "../app/uebersicht-rechnung.mjs";

const konto = (id, kontotyp, extra = {}) => ({ konto_id: id, name: id, kontotyp, kontoreferenz: "DE00TEST", inhaber_person_ids: [], liquiditaetsrelevant: true, status: "aktiv", ...extra });
const zw = (id, feld, standdatum, wert, qualitaet = "belegt") => ({ entitaet: "konto", entitaet_id: id, feld, standdatum, wert, qualitaet });
const tx = (id, buchungsdatum, betrag) => ({ konto_id: id, buchungsdatum, betrag });

test("Depot mit belegtem Depotwert: Wert, Qualitaet und Belegdatum", () => {
  const data = { transaktionen: [], zeitwerte: [zw("KTO-D", "depotwert", "2026-08-14", "12000.00"), zw("KTO-D", "depotwert", "2026-09-15", "4321.09")] };
  const z = kontoZeile(data, konto("KTO-D", "depot"), "2026-10-12");
  assert.deepEqual({ ...z }, { wert_cents: 432109, qualitaet: "belegt", belegdatum: "2026-09-15", basis: "depotwert", letzteBuchung: "" });
});

test("Girokonto: Stand gilt bis zur letzten eingerechneten Buchung, nicht nur bis zum Anker", () => {
  const data = {
    transaktionen: [tx("KTO-G", "2026-05-20", "-4000.00"), tx("KTO-G", "2026-06-08", "-10.00"), tx("KTO-G", "2026-06-10", "-50.00"), tx("KTO-G", "2026-11-01", "-1.00")],
    zeitwerte: [zw("KTO-G", "kontostand", "2026-06-08", "1200.00")],
  };
  const z = kontoZeile(data, konto("KTO-G", "giro"), "2026-10-12");
  assert.equal(z.wert_cents, 115000);
  assert.equal(z.qualitaet, "belegt");
  // Importierte Buchungen sind selbst belegt: der Stand reicht bis zur letzten
  // Buchung bis heute (2026-06-10); die kuenftige vom 2026-11-01 zaehlt nicht.
  assert.equal(z.belegdatum, "2026-06-10");
  assert.equal(z.letzteBuchung, "2026-11-01");
});

test("Geschaetzter Anker bleibt geschaetzt", () => {
  const data = { transaktionen: [], zeitwerte: [zw("KTO-G", "kontostand", "2026-06-30", "100.00", "geschaetzt")] };
  assert.equal(kontoZeile(data, konto("KTO-G", "giro"), "2026-10-12").qualitaet, "geschaetzt");
});

test("Ohne Zeitwert: kein Wert, Basis nennt den fehlenden Beleg", () => {
  const data = { transaktionen: [tx("KTO-G", "2026-07-30", "250.00")], zeitwerte: [] };
  const giro = kontoZeile(data, konto("KTO-G", "giro"), "2026-10-12");
  assert.equal(giro.wert_cents, null);
  assert.equal(giro.qualitaet, null);
  assert.equal(giro.basis, "anker-fehlt");
  assert.equal(giro.letzteBuchung, "2026-07-30");
  assert.equal(kontoZeile(data, konto("KTO-D", "depot"), "2026-10-12").basis, "depotwert-fehlt");
});

test("Ohne Buchungen nach dem Anker bleibt das Ankerdatum der Stand", () => {
  const data = { transaktionen: [tx("KTO-G", "2026-06-01", "-5.00")], zeitwerte: [zw("KTO-G", "kontostand", "2026-06-08", "100.00")] };
  assert.equal(kontoZeile(data, konto("KTO-G", "giro"), "2026-10-12").belegdatum, "2026-06-08");
});

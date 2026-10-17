import { test } from "node:test";
import assert from "node:assert/strict";
import { computeNettovermoegen, nettovermoegenAm, nettovermoegenVerlauf, restschuldJahre } from "../app/vermoegen.mjs";
import { liquiditaetVerlauf } from "../app/liquiditaet.mjs";

const HEUTE = "2026-10-17";
const zw = (entitaet, id, feld, wert, standdatum) => ({ entitaet, entitaet_id: id, feld, wert, standdatum, qualitaet: "belegt" });
const tx = (konto_id, buchungsdatum, betrag) => ({ transaktion_id: `TXN-${buchungsdatum}-${betrag}`, konto_id, buchungsdatum, betrag });

function daten() {
  return {
    konten: [
      { konto_id: "KTO-001", name: "Giro", kontotyp: "giro", status: "aktiv", liquiditaetsrelevant: true },
      { konto_id: "KTO-002", name: "Depot", kontotyp: "depot", status: "aktiv", liquiditaetsrelevant: false },
    ],
    immobilien: [{ immobilie_id: "IMM-001", bezeichnung: "Wohnung", status: "aktiv", anschaffungsdatum: "2025-03-01", anschaffungskosten: "200000.00", eigentumsanteile: [{ person_id: "PER-001", zaehler: 1, nenner: 1 }] }],
    vermoegenswerte: [],
    vorsorge: [],
    darlehen: [{ darlehen_id: "DAR-001", bezeichnung: "Kredit", status: "aktiv", anfangsbetrag: "12000.00", anfangsdatum: "2025-03-01", zinssatz: "0", sollrate: "1000.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, zinsbindung_bis: "2026-12-31" }],
    transaktionen: [
      tx("KTO-001", "2025-01-10", "500.00"),
      tx("KTO-001", "2026-09-15", "-200.00"),
      tx("KTO-001", "2026-10-05", "100.00"),
    ],
    zeitwerte: [
      zw("konto", "KTO-001", "kontostand", "1000.00", "2026-10-01"),
      zw("konto", "KTO-002", "depotwert", "3000.00", "2026-06-30"),
      zw("immobilie", "IMM-001", "marktwert", "250000.00", "2026-01-01"),
      zw("darlehen", "DAR-001", "restschuld", "5000.00", "2026-01-01"),
    ],
  };
}

test("Nettovermoegen am Stichtag heute gleich dem Stand der Vermoegensseite", () => {
  const d = daten();
  const heute = computeNettovermoegen(d, HEUTE);
  const am = nettovermoegenAm(d, HEUTE);
  assert.equal(am.aktiva_cents, heute.aktiva_cents);
  assert.equal(am.passiva_cents, heute.passiva_cents);
  assert.equal(am.netto_cents, heute.netto_cents);
});

test("Konto rueckwaerts vom Anker, vor der ersten Buchung gab es es nicht", () => {
  const d = { ...daten(), immobilien: [], darlehen: [], konten: [daten().konten[0]] };
  // Anker 1000 am 1.10.; die Buchung vom 15.9. steckt darin, also Ende August 1200.
  assert.equal(nettovermoegenAm(d, "2026-08-31").aktiva_cents, 120000);
  assert.equal(nettovermoegenAm(d, "2026-10-17").aktiva_cents, 110000);
  assert.equal(nettovermoegenAm(d, "2024-12-31").aktiva_cents, 0, "vor der ersten Buchung");
});

test("Immobilie ab Anschaffung mit Anschaffungskosten, Darlehen ab Anfangsbetrag", () => {
  const d = daten();
  assert.equal(nettovermoegenAm(d, "2025-02-28").passiva_cents, 0, "vor dem Anfangsdatum");
  // Juli 2025: Immobilie zu Anschaffungskosten, Depot mit aeltestem Wert, Giro
  // rueckwaerts gerechnet; Darlehen 12000 minus vier Raten (April bis Juli).
  const juli = nettovermoegenAm(d, "2025-07-31");
  assert.equal(juli.passiva_cents, 800000);
  assert.equal(juli.aktiva_cents, 20000000 + 300000 + 120000);
});

test("Verlauf je Monatsende ab der ersten Buchung, zuletzt heute", () => {
  const v = nettovermoegenVerlauf(daten(), HEUTE);
  assert.equal(v[0].monat, "2025-01");
  assert.equal(v[0].datum, "2025-01-31");
  assert.equal(v.at(-1).datum, HEUTE);
  assert.equal(v.length, 22);
  assert.deepEqual(nettovermoegenVerlauf({ konten: [], transaktionen: [], zeitwerte: [] }, HEUTE), []);
});

test("Restschuld je Jahresende bis zur Tilgung, mit Zinsbindung und Tilgungsende", () => {
  const r = restschuldJahre(daten(), HEUTE);
  assert.deepEqual(r.jahre, [2026]);
  assert.equal(r.rest[0], 0, "5000 ab Januar mit 1000 je Monat: im Juni getilgt");
  assert.deepEqual(r.ereignisse.map((e) => e.typ), ["frei", "zinsbindung"]);
  assert.equal(r.frei_ab, "2026-06-01");
  assert.equal(restschuldJahre({ darlehen: [], zeitwerte: [] }, HEUTE), null);
});

test("Liquiditaet je Monatsende der letzten zwoelf Monate", () => {
  const v = liquiditaetVerlauf(daten(), HEUTE);
  assert.equal(v.length, 12);
  assert.equal(v[0].monat, "2025-11");
  assert.equal(v.at(-2).saldo_cents, 100000, "Ende September gleich dem Anker vom 1.10.");
  assert.equal(v.at(-1).saldo_cents, 110000);
});

// Gemeinsamer Bewertungsstand je Stichtag (Review Welle 2, 2.1): eine Rechnung
// fuer Nettovermoegen, Verlauf, Liquiditaet, Kontentabelle und Szenario-Start.
import { test } from "node:test";
import assert from "node:assert/strict";
import { stand } from "../app/bewertung.mjs";
import { computeNettovermoegen, nettovermoegenAm, nettovermoegenVerlauf } from "../app/vermoegen.mjs";
import { computeLiquiditaetIst } from "../app/liquiditaet.mjs";
import { kontenGruppen, kontoStandDatum } from "../app/uebersicht-rechnung.mjs";

const zw = (entitaet, id, feld, wert, standdatum, qualitaet = "belegt") => ({ entitaet, entitaet_id: id, feld, wert, standdatum, qualitaet });
const tx = (konto_id, buchungsdatum, betrag) => ({ transaktion_id: `TXN-${konto_id}-${buchungsdatum}-${betrag}`, konto_id, buchungsdatum, betrag });
const anteil = [{ person_id: "PER-001", zaehler: 1, nenner: 1 }];

function daten() {
  return {
    konten: [
      { konto_id: "KTO-001", name: "Giro", kontotyp: "giro", status: "aktiv", liquiditaetsrelevant: true },
      { konto_id: "KTO-002", name: "Tagesgeld", kontotyp: "tagesgeld", status: "aktiv", liquiditaetsrelevant: true },
      { konto_id: "KTO-003", name: "Depot", kontotyp: "depot", status: "aktiv", liquiditaetsrelevant: false },
      { konto_id: "KTO-004", name: "Altkonto", kontotyp: "giro", status: "geschlossen", aktiv_bis: "2025-06-30", liquiditaetsrelevant: true },
      { konto_id: "KTO-005", name: "Kasse", kontotyp: "bar", status: "aktiv", liquiditaetsrelevant: false },
    ],
    immobilien: [{ immobilie_id: "IMM-001", bezeichnung: "Wohnung", status: "aktiv", anschaffungsdatum: "2025-03-01", anschaffungskosten: "200000.00", eigentumsanteile: anteil }],
    vermoegenswerte: [{ vermoegenswert_id: "VMW-001", typ: "edelmetall", bezeichnung: "Gold", status: "aktiv", eigentumsanteile: anteil }],
    vorsorge: [
      { vorsorge_id: "VS-001", name: "LV laufend", art: "lebensversicherung", kapitalbildend: true, status: "aktiv", person_id: "PER-001" },
      { vorsorge_id: "VS-002", name: "LV gekuendigt", art: "lebensversicherung", kapitalbildend: true, status: "gekuendigt", aktiv_bis: "2026-03-31", person_id: "PER-001" },
      { vorsorge_id: "VS-003", name: "LV beendet ohne Datum", art: "lebensversicherung", kapitalbildend: true, status: "beendet", person_id: "PER-001" },
    ],
    darlehen: [{ darlehen_id: "DAR-001", bezeichnung: "Kredit", status: "aktiv", anfangsbetrag: "12000.00", anfangsdatum: "2025-03-01", zinssatz: "0", sollrate: "1000.00", rhythmus_einheit: "monat", rhythmus_intervall: 1 }],
    transaktionen: [
      tx("KTO-001", "2025-01-10", "500.00"),
      tx("KTO-001", "2026-09-15", "-200.00"),
      tx("KTO-001", "2026-10-05", "100.00"),
      tx("KTO-002", "2026-02-01", "50.00"),
      tx("KTO-004", "2025-02-01", "10.00"),
    ],
    zeitwerte: [
      zw("konto", "KTO-001", "kontostand", "1000.00", "2026-10-01"),
      zw("konto", "KTO-002", "kontostand", "300.00", "2026-01-01"),
      zw("konto", "KTO-004", "kontostand", "80.00", "2025-01-01"),
      zw("konto", "KTO-003", "depotwert", "3000.00", "2026-06-30"),
      zw("immobilie", "IMM-001", "marktwert", "250000.00", "2026-01-01"),
      zw("vermoegenswert", "VMW-001", "marktwert", "700.00", "2026-05-01", "geschaetzt"),
      zw("vorsorge", "VS-001", "rueckkaufswert", "4000.00", "2025-12-31"),
      zw("vorsorge", "VS-001", "erwartete_kapitalleistung", "99999.00", "2025-12-31"),
      zw("vorsorge", "VS-002", "rueckkaufswert", "1500.00", "2025-12-31"),
      zw("vorsorge", "VS-003", "rueckkaufswert", "2500.00", "2025-12-31"),
      zw("darlehen", "DAR-001", "restschuld", "5000.00", "2026-01-01"),
    ],
  };
}

const pos = (s, klasse, id) => s.positionen.find((p) => p.klasse === klasse && p.id === id);

test("stand: jede Position traegt Wert, Datum, Lebenszyklus, Herkunft, Qualitaet und Methode", () => {
  const s = stand(daten(), "2026-10-17");
  const giro = pos(s, "konto", "KTO-001");
  assert.equal(giro.wert_cents, 110000);
  assert.equal(giro.methode, "anker+buchungen");
  assert.equal(giro.standdatum, "2026-10-05");
  assert.equal(giro.lebenszyklus, "aktiv");
  assert.deepEqual(giro.herkunft, { feld: "kontostand", standdatum: "2026-10-01", wert: "1000.00" });
  assert.equal(giro.qualitaet, "belegt");
  assert.equal(giro.unbekannt, false);
  assert.equal(pos(s, "vermoegenswert", "VMW-001").qualitaet, "geschaetzt");
  assert.equal(pos(s, "konto", "KTO-005"), undefined, "Bargeld ist keine Position");
});

test("stand: Rueckrechnung eines Kontos aus einem spaeteren Anker ist ausdruecklich gekennzeichnet", () => {
  // Stichtag vor dem einzigen Anker: Anker minus Buchungen dazwischen.
  const s = stand(daten(), "2026-08-31");
  const giro = pos(s, "konto", "KTO-001");
  assert.equal(giro.wert_cents, 120000);
  assert.equal(giro.methode, "anker-rueckwaerts");
  assert.equal(giro.standdatum, "2026-08-31");
  assert.equal(giro.herkunft.standdatum, "2026-10-01");
});

test("stand: Marktwerte werden nicht aus spaeteren Werten zurueckgerechnet, sie sind unbekannt", () => {
  const s = stand(daten(), "2026-03-31");
  const depot = pos(s, "konto", "KTO-003");
  assert.equal(depot.unbekannt, true);
  assert.equal(depot.wert_cents, 0);
  assert.equal(depot.basis, "depotwert-fehlt");
  assert.equal(pos(s, "vermoegenswert", "VMW-001").unbekannt, true);
  assert.ok(s.unbekannt >= 2);
});

test("stand: Lebenszyklus – geschlossene, gekuendigte und noch nicht begonnene Positionen", () => {
  const frueh = stand(daten(), "2025-02-28");
  assert.equal(pos(frueh, "konto", "KTO-004").wert_cents, 9000, "bis aktiv_bis dabei");
  assert.equal(pos(frueh, "immobilie", "IMM-001"), undefined, "vor der Anschaffung");
  assert.equal(pos(frueh, "darlehen", "DAR-001"), undefined, "vor dem Anfangsdatum");
  assert.ok(frueh.ausserhalb.some((a) => a.id === "IMM-001" && a.lebenszyklus === "noch-nicht"));

  const spaet = stand(daten(), "2026-10-17");
  assert.equal(pos(spaet, "konto", "KTO-004"), undefined, "nach aktiv_bis geschlossen");
  assert.ok(spaet.ausserhalb.some((a) => a.id === "KTO-004" && a.lebenszyklus === "beendet"));
});

test("stand: Rueckkaufswert gekuendigter Vertraege zaehlt bis aktiv_bis, beendete ohne Datum gar nicht", () => {
  const vorher = stand(daten(), "2026-03-31");
  assert.equal(pos(vorher, "vorsorge", "VS-002").wert_cents, 150000);
  const nachher = stand(daten(), "2026-04-01");
  assert.equal(pos(nachher, "vorsorge", "VS-002"), undefined);
  assert.equal(pos(nachher, "vorsorge", "VS-003"), undefined);
  assert.equal(pos(vorher, "vorsorge", "VS-003"), undefined);
});

test("stand: Rueckkaufswert und erwartete Leistung bleiben verschiedene Groessen", () => {
  const vs = pos(stand(daten(), "2026-10-17"), "vorsorge", "VS-001");
  assert.equal(vs.wert_cents, 400000);
  assert.equal(vs.herkunft.feld, "rueckkaufswert");
});

test("stand: Immobilie vor dem ersten Marktwert zu Anschaffungskosten, Darlehen ab Anfangsbetrag, beides geschaetzt", () => {
  const s = stand(daten(), "2025-07-31");
  const imm = pos(s, "immobilie", "IMM-001");
  assert.equal(imm.wert_cents, 20000000);
  assert.equal(imm.methode, "anschaffungskosten");
  assert.equal(imm.qualitaet, "geschaetzt");
  const dar = pos(s, "darlehen", "DAR-001");
  assert.equal(dar.wert_cents, -800000);
  assert.equal(dar.methode, "anfangsbetrag+tilgung");
  assert.equal(dar.qualitaet, "geschaetzt");
});

test("Invariante: Nettovermoegen(d) = Verlauf(d) fuer jeden Monat", () => {
  const d = daten();
  for (const p of nettovermoegenVerlauf(d, "2026-10-17")) {
    const n = computeNettovermoegen(d, p.datum);
    assert.equal(p.netto_cents, n.netto_cents, p.datum);
    assert.equal(p.unbekannt, n.unbekannt, p.datum);
    assert.equal(nettovermoegenAm(d, p.datum).netto_cents, n.netto_cents, p.datum);
  }
});

test("Invariante: Liquiditaet heute = verfuegbares Geld der Kontentabelle", () => {
  const d = daten();
  for (const heute of ["2025-02-28", "2026-08-31", "2026-10-17"]) {
    assert.equal(computeLiquiditaetIst(d, { today: heute }).saldo_cents, kontenGruppen(d, heute).konten.summe_cents, heute);
  }
});

test("Kontentabelle: Standdatum beachtet den Stichtag", () => {
  const d = daten();
  assert.equal(kontoStandDatum(d, d.konten[0], "2026-09-30"), "2026-09-30");
  assert.equal(kontoStandDatum(d, d.konten[0], "2026-10-17"), "2026-10-05");
  assert.equal(kontoStandDatum(d, d.konten[2], "2026-03-31"), "");
});

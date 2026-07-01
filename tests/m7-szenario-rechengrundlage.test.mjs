// Tests für den erweiterten Szenario-Engine-Vertrag (Rechengrundlage):
// basisRegelzahlungen, darlehen (Tilgungsende), sachwertwirkungen, Monats-
// Granularität des Horizonts und die Verlagerung der Guardrails aus den
// Szenario-Warnungen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rechneSzenario, computeSzenario, guardrailWarnungen } from "../app/szenarien.mjs";

function baseData(over = {}) {
  return {
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", inhaber_person_ids: ["PER-001"], liquiditaetsrelevant: true, status: "aktiv" }],
    transaktionen: [],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-06-22", qualitaet: "belegt" }],
    darlehen: [], immobilien: [], vermoegenswerte: [], regelzahlungen: [],
    ...over,
  };
}
const sz = (annahmen = [], reichweite_bis = "2027-12-31") => ({ szenario_id: "SZN-001", name: "T", status: "entwurf", stand: "2026-06-22", reichweite_bis, erstellt_am: "2026-06-22", annahmen });

test("basisRegelzahlungen: liefert angesetzte RZ inkl. aktiv_bis und kategorie", () => {
  const data = baseData({ regelzahlungen: [
    { regelzahlung_id: "RZ-001", bezeichnung: "Miete", betrag: "-500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-22", aktiv_bis: "2027-06-30", kategorie_id: "KAT-001", status: "bestaetigt", qualitaet: "belegt", erstellt_am: "2026-06-01" },
    { regelzahlung_id: "RZ-002", bezeichnung: "Vorschlag", betrag: "-50.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-22", status: "vorgeschlagen", qualitaet: "geschaetzt", erstellt_am: "2026-06-01" },
  ] });
  const r = rechneSzenario(data, sz([]), "2026-06-22");
  assert.equal(r.basisRegelzahlungen.length, 1, "nur bestätigte, wirksame RZ");
  assert.equal(r.basisRegelzahlungen[0].regelzahlung_id, "RZ-001");
  assert.equal(r.basisRegelzahlungen[0].aktiv_bis, "2027-06-30");
  assert.equal(r.basisRegelzahlungen[0].kategorie_id, "KAT-001");
});

test("Horizont wirkt auf Monatsgranularität: letzter Punkt = Monat von reichweite_bis (Tag egal)", () => {
  const r = rechneSzenario(baseData(), sz([], "2028-12-15"), "2026-06-22");
  assert.equal(r.punkte[r.punkte.length - 1].monat, "2028-12");
});

test("darlehen: Sondertilgung tilgt im Szenario früher als in der Basis", () => {
  const data = baseData({
    zeitwerte: [
      { entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "1000.00", standdatum: "2026-06-22", qualitaet: "belegt" },
      { entitaet: "darlehen", entitaet_id: "DAR-001", feld: "restschuld", wert: "10000.00", standdatum: "2026-06-22", qualitaet: "belegt" },
    ],
    darlehen: [{ darlehen_id: "DAR-001", bezeichnung: "Rest", status: "aktiv", anfangsbetrag: "10000.00", anfangsdatum: "2026-06-22", zinssatz: "0.00", sollrate: "1000.00", rhythmus_einheit: "monat", rhythmus_intervall: 1 }],
  });
  const annahme = { annahme_id: "A1", art: "einmalzahlung", qualitaet: "belegt", datum: "2026-07-15", betrag: "-10000.00", gegenbuchung: { ziel_typ: "darlehen", ziel_id: "DAR-001" } };
  const c = computeSzenario(data, sz([annahme], "2027-12-31"), "2026-06-22");
  const szD = c.szenario.darlehen.find((d) => d.darlehen_id === "DAR-001");
  const baD = c.basis.darlehen.find((d) => d.darlehen_id === "DAR-001");
  assert.ok(szD.abbezahlt_am, "Szenario tilgt im Horizont ab");
  assert.ok(baD.abbezahlt_am, "Basis tilgt im Horizont ab");
  assert.ok(szD.abbezahlt_am < baD.abbezahlt_am, `Szenario (${szD.abbezahlt_am}) früher als Basis (${baD.abbezahlt_am})`);
});

test("sachwertwirkungen: Aufbau behält Objekt-Identität und Wert", () => {
  const data = baseData();
  const annahme = { annahme_id: "A1", art: "einmalzahlung", qualitaet: "geschaetzt", datum: "2026-09-01", betrag: "0.00", gegenbuchung: { ziel_typ: "vermoegenswert", neue_position: { bezeichnung: "Erbe Gold", wert: "50000.00" } } };
  const r = rechneSzenario(data, sz([annahme], "2027-01-31"), "2026-06-22");
  assert.equal(r.sachwertwirkungen.length, 1);
  assert.equal(r.sachwertwirkungen[0].art, "aufbau");
  assert.equal(r.sachwertwirkungen[0].bezeichnung, "Erbe Gold");
  assert.equal(r.sachwertwirkungen[0].wert_cents, 5000000);
});

test("Guardrails stecken NICHT mehr in Szenario-Warnungen, aber in guardrailWarnungen", () => {
  const data = baseData({
    transaktionen: [
      { transaktion_id: "T1", konto_id: "KTO-001", betrag: "-600.00", buchungsdatum: "2026-03-10", kategorie_id: "KAT-001" },
      { transaktion_id: "T2", konto_id: "KTO-001", betrag: "-600.00", buchungsdatum: "2026-04-10", kategorie_id: "KAT-001" },
      { transaktion_id: "T3", konto_id: "KTO-001", betrag: "-600.00", buchungsdatum: "2026-05-10", kategorie_id: "KAT-001" },
    ],
    regelzahlungen: [
      { regelzahlung_id: "RZ-001", bezeichnung: "Lebensmittel", betrag: "-100.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-07-01", kategorie_id: "KAT-001", status: "bestaetigt", qualitaet: "geschaetzt", erstellt_am: "2026-06-01" },
    ],
  });
  const r = rechneSzenario(data, sz([]), "2026-06-22");
  assert.ok(!r.warnungen.some((w) => w.code === "cash-realismus"), "keine Guardrails in Szenario-Warnungen");
  const g = guardrailWarnungen(data, "2026-06-22");
  const cr = g.find((w) => w.code === "cash-realismus");
  assert.ok(cr, "Guardrail feuert über guardrailWarnungen");
  assert.equal(cr.kategorie_id, "KAT-001", "strukturiertes Feld für lesbare Anzeige");
  assert.equal(typeof cr.plan_cents, "number");
  assert.equal(typeof cr.ist_cents, "number");
});

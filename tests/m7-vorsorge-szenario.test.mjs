import { test } from "node:test";
import assert from "node:assert/strict";
import { rechneSzenario, expandVorsorgeLeistungen } from "../app/szenarien.mjs";

const TODAY = "2026-06-28";

function baseData(extra = {}) {
  return {
    konten: [{ konto_id: "KTO-001", name: "Giro", kontotyp: "giro", status: "aktiv", liquiditaetsrelevant: true }],
    immobilien: [],
    vermoegenswerte: [],
    darlehen: [],
    regelzahlungen: [],
    transaktionen: [],
    zeitwerte: [{ entitaet: "konto", entitaet_id: "KTO-001", feld: "kontostand", wert: "5000.00", standdatum: "2026-06-01", qualitaet: "belegt" }],
    vorsorge: [],
    ...extra,
  };
}

test("kapitalbildende Vorsorge erhoeht das Netto im Szenario (eingefroren)", () => {
  const data = baseData({
    vorsorge: [{ vorsorge_id: "VS-003", art: "riester", name: "Riester", person_id: "PER-001", status: "aktiv", kapitalbildend: true }],
  });
  data.zeitwerte.push({ entitaet: "vorsorge", entitaet_id: "VS-003", feld: "rueckkaufswert", wert: "9100.00", standdatum: "2026-01-01", qualitaet: "belegt" });
  const szn = { szenario_id: "SZN-001", name: "Basis", status: "entwurf", stand: TODAY, reichweite_bis: "2028-12-31", erstellt_am: TODAY, annahmen: [] };
  const r = rechneSzenario(data, szn, TODAY);
  // erster Monatspunkt enthaelt den eingefrorenen Rueckkaufswert in sachwerte_cents
  assert.equal(r.punkte[0].sachwerte_cents, 910000);
});

test("Kapitalauszahlung (gegenbuchung vorsorge) baut Rueckkaufswert ab, Cash steigt", () => {
  const data = baseData({
    vorsorge: [{ vorsorge_id: "VS-003", art: "lebensversicherung", name: "LV", person_id: "PER-001", status: "aktiv", kapitalbildend: true }],
  });
  data.zeitwerte.push({ entitaet: "vorsorge", entitaet_id: "VS-003", feld: "rueckkaufswert", wert: "9100.00", standdatum: "2026-01-01", qualitaet: "belegt" });
  const szn = { szenario_id: "SZN-002", name: "Kapital", status: "entwurf", stand: TODAY, reichweite_bis: "2028-12-31", erstellt_am: TODAY,
    annahmen: [{ annahme_id: "A1", art: "einmalzahlung", datum: "2027-01-15", betrag: "9100.00", qualitaet: "belegt", gegenbuchung: { ziel_typ: "vorsorge", ziel_id: "VS-003" } }] };
  const r = rechneSzenario(data, szn, TODAY);
  const letzter = r.punkte[r.punkte.length - 1];
  // Umschichtung: Aktivum (sachwerte) weg, Cash entsprechend hoeher -> netto ~ unveraendert
  assert.equal(letzter.sachwerte_cents, 0);
  assert.equal(letzter.liquide_cents, 500000 + 910000); // Startsaldo 5000 + 9100 Kapital
});

test("vorsorge-leistung rente erzeugt lebenslanges Einkommen", () => {
  const data = baseData({
    vorsorge: [{ vorsorge_id: "VS-001", art: "gesetzliche-rente", name: "GRV Lena", person_id: "PER-001", status: "geplant", kapitalbildend: false, geprueft_am: "2026-01-01" }],
  });
  data.zeitwerte.push({ entitaet: "vorsorge", entitaet_id: "VS-001", feld: "erwartete_rente", wert: "1480.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" });
  const szn = { szenario_id: "SZN-003", name: "Ruhestand", status: "entwurf", stand: TODAY, reichweite_bis: "2027-06-30", erstellt_am: TODAY,
    annahmen: [{ annahme_id: "A1", art: "vorsorge-leistung", vorsorge_id: "VS-001", arm: "rente", ab: "2026-07-01" }] };
  const r = rechneSzenario(data, szn, TODAY);
  // 12 Monate Rente bis Juni 2027 -> Liquiditaet steigt deutlich gegenueber Startsaldo
  const letzter = r.punkte[r.punkte.length - 1];
  assert.ok(letzter.liquide_cents > 500000 + 11 * 148000);
});

test("vorsorge-leistung kapital bei kapitalbildender LV: Zufluss + Rueckkaufswert-Abbau", () => {
  const data = baseData({
    vorsorge: [{ vorsorge_id: "VS-004", art: "rentenversicherung", name: "Privat-RV", person_id: "PER-002", status: "aktiv", kapitalbildend: true, kapitalwahl: "kapital", geprueft_am: "2026-01-01" }],
  });
  data.zeitwerte.push({ entitaet: "vorsorge", entitaet_id: "VS-004", feld: "rueckkaufswert", wert: "23400.00", standdatum: "2026-01-01", qualitaet: "belegt" });
  data.zeitwerte.push({ entitaet: "vorsorge", entitaet_id: "VS-004", feld: "erwartete_kapitalleistung", wert: "31000.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" });
  const szn = { szenario_id: "SZN-004", name: "Kapital", status: "entwurf", stand: TODAY, reichweite_bis: "2028-12-31", erstellt_am: TODAY,
    annahmen: [{ annahme_id: "A1", art: "vorsorge-leistung", vorsorge_id: "VS-004", arm: "kapital", ab: "2027-01-15" }] };
  const r = rechneSzenario(data, szn, TODAY);
  const letzter = r.punkte[r.punkte.length - 1];
  assert.equal(letzter.sachwerte_cents, 0);                 // Rueckkaufswert abgebaut
  assert.equal(letzter.liquide_cents, 500000 + 3100000);    // Kapitalleistung zugeflossen
});

test("ungepruefte Anwartschaft zieht Szenario-Qualitaet auf offen", () => {
  const data = baseData({
    vorsorge: [{ vorsorge_id: "VS-006", art: "betriebsrente", name: "bAV", person_id: "PER-001", status: "geplant", kapitalbildend: false }],
  });
  data.zeitwerte.push({ entitaet: "vorsorge", entitaet_id: "VS-006", feld: "erwartete_rente", wert: "240.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" });
  const szn = { szenario_id: "SZN-005", name: "bAV", status: "entwurf", stand: TODAY, reichweite_bis: "2027-06-30", erstellt_am: TODAY,
    annahmen: [{ annahme_id: "A1", art: "vorsorge-leistung", vorsorge_id: "VS-006", arm: "rente", ab: "2026-07-01" }] };
  const r = rechneSzenario(data, szn, TODAY);
  assert.equal(r.qualitaet, "offen");
});

// --- expandVorsorgeLeistungen: direkte Unit-Tests der bislang nur indirekt gedeckten Zweige ---

test("expand: arm kapital bei !kapitalbildend -> einmalzahlung OHNE gegenbuchung", () => {
  const data = baseData({
    vorsorge: [{ vorsorge_id: "VS-005", art: "lebensversicherung", name: "Risiko-LV", person_id: "PER-002", status: "aktiv", kapitalbildend: false, geprueft_am: "2026-01-01" }],
  });
  data.zeitwerte.push({ entitaet: "vorsorge", entitaet_id: "VS-005", feld: "erwartete_kapitalleistung", wert: "200000.00", standdatum: "2026-01-01", qualitaet: "belegt" });
  const szn = { annahmen: [{ annahme_id: "A1", art: "vorsorge-leistung", vorsorge_id: "VS-005", arm: "kapital", ab: "2028-03-15" }] };
  const { szenario, warnungen } = expandVorsorgeLeistungen(data, szn, TODAY);
  assert.equal(warnungen.length, 0);
  assert.equal(szenario.annahmen.length, 1); // kein ~abbau, da nicht kapitalbildend
  const a = szenario.annahmen[0];
  assert.equal(a.art, "einmalzahlung");
  assert.equal(a.betrag, "200000.00");
  assert.equal(a.gegenbuchung, undefined); // kein Rueckkaufswert-Abbau ohne Bilanz-Bein
});

test("expand: arm rente reicht explizites bis durch", () => {
  const data = baseData({
    vorsorge: [{ vorsorge_id: "VS-006", art: "betriebsrente", name: "bAV Lena", person_id: "PER-001", status: "geplant", kapitalbildend: false, geprueft_am: "2026-01-01" }],
  });
  data.zeitwerte.push({ entitaet: "vorsorge", entitaet_id: "VS-006", feld: "erwartete_rente", wert: "240.00", standdatum: "2026-01-01", qualitaet: "geschaetzt" });
  const szn = { annahmen: [{ annahme_id: "A1", art: "vorsorge-leistung", vorsorge_id: "VS-006", arm: "rente", ab: "2028-04-01", bis: "2035-07-31" }] };
  const { szenario } = expandVorsorgeLeistungen(data, szn, TODAY);
  assert.equal(szenario.annahmen.length, 1); // nicht kapitalbildend -> kein ~abbau
  const a = szenario.annahmen[0];
  assert.equal(a.art, "regelzahlung-neu");
  assert.equal(a.ab, "2028-04-01");
  assert.equal(a.bis, "2035-07-31");
});

test("expand: unbekannte vorsorge_id erzeugt warnung vorsorge-unbekannt und keine annahme", () => {
  const data = baseData({ vorsorge: [] });
  const szn = { annahmen: [{ annahme_id: "A1", art: "vorsorge-leistung", vorsorge_id: "VS-999", arm: "rente", ab: "2028-04-01" }] };
  const { szenario, warnungen } = expandVorsorgeLeistungen(data, szn, TODAY);
  assert.equal(szenario.annahmen.length, 0);
  assert.ok(warnungen.some((w) => w.code === "vorsorge-unbekannt"));
});

test("expand: fehlender zeitwert erzeugt warnung vorsorge-leistung-ohne-wert und keine annahme", () => {
  const data = baseData({
    vorsorge: [{ vorsorge_id: "VS-006", art: "betriebsrente", name: "bAV", person_id: "PER-001", status: "geplant", kapitalbildend: false, geprueft_am: "2026-01-01" }],
  });
  // kein erwartete_rente-Zeitwert fuer VS-006 angehaengt
  const szn = { annahmen: [{ annahme_id: "A1", art: "vorsorge-leistung", vorsorge_id: "VS-006", arm: "rente", ab: "2028-04-01" }] };
  const { szenario, warnungen } = expandVorsorgeLeistungen(data, szn, TODAY);
  assert.equal(szenario.annahmen.length, 0);
  assert.ok(warnungen.some((w) => w.code === "vorsorge-leistung-ohne-wert"));
});

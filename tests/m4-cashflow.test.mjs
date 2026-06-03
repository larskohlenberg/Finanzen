import { test } from "node:test";
import assert from "node:assert/strict";
import { addInterval, occurrences, computeCashflowIst, computeCashflowPrognose, computeCashflowPrognoseDetail, periodenSchluessel, defaultHorizonEnd, localTodayIso } from "../app/cashflow.mjs";

test("addInterval addiert Tage", () => {
  assert.equal(addInterval("2026-01-30", "tag", 5), "2026-02-04");
});

test("addInterval addiert Wochen", () => {
  assert.equal(addInterval("2026-01-01", "woche", 2), "2026-01-15");
});

test("addInterval addiert Monate mit Monatsende-Clamping", () => {
  assert.equal(addInterval("2026-01-31", "monat", 1), "2026-02-28");
  assert.equal(addInterval("2026-01-31", "monat", 3), "2026-04-30");
});

test("addInterval addiert Jahre und clampt Schaltjahr", () => {
  assert.equal(addInterval("2024-02-29", "jahr", 1), "2025-02-28");
});

test("occurrences liefert nur Fälligkeiten nach heute bis Horizont", () => {
  const rz = { anker_datum: "2026-01-01", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  const result = occurrences(rz, "2026-03-15", "2026-06-30");
  assert.deepEqual(result, ["2026-04-01", "2026-05-01", "2026-06-01"]);
});

test("occurrences behalten den Ankertag nach Monatsende-Clamping bei", () => {
  const rz = { anker_datum: "2026-01-31", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  const result = occurrences(rz, "2026-01-01", "2026-05-31");
  assert.deepEqual(result, ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
});

test("occurrences zaehlen gedriftete Termine nicht vor aktiv_bis hinein", () => {
  const rz = { anker_datum: "2026-01-31", aktiv_bis: "2026-03-30", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  const result = occurrences(rz, "2026-01-01", "2026-12-31");
  assert.deepEqual(result, ["2026-01-31", "2026-02-28"]);
});

test("occurrences behalten den Schalttag-Anker fuer spaetere Schaltjahre bei", () => {
  const rz = { anker_datum: "2024-02-29", rhythmus_einheit: "jahr", rhythmus_intervall: 1 };
  const result = occurrences(rz, "2024-01-01", "2028-12-31");
  assert.deepEqual(result, ["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
});

test("occurrences stoppt an aktiv_bis (24-Monate-Vertrag)", () => {
  const rz = { anker_datum: "2025-07-01", aktiv_bis: "2027-07-01", rhythmus_einheit: "monat", rhythmus_intervall: 1 };
  const result = occurrences(rz, "2027-04-15", "2030-12-31");
  assert.deepEqual(result, ["2027-05-01", "2027-06-01", "2027-07-01"]);
});

test("localTodayIso formatiert das lokale Datum ohne UTC-Verschiebung", () => {
  assert.equal(localTodayIso(new Date(2026, 5, 3, 0, 30)), "2026-06-03");
});

test("computeCashflowIst summiert je Monat, ohne Transfers, bis heute", () => {
  const tx = [
    { buchungsdatum: "2026-04-01", betrag: "3500.00", ist_transfer: false, kategorisierung_status: "bestaetigt" },
    { buchungsdatum: "2026-04-10", betrag: "-1200.00", ist_transfer: false, kategorisierung_status: "bestaetigt" },
    { buchungsdatum: "2026-04-12", betrag: "-500.00", ist_transfer: true, kategorisierung_status: "bestaetigt" },
    { buchungsdatum: "2026-05-02", betrag: "-80.00", ist_transfer: false, kategorisierung_status: "offen" },
    { buchungsdatum: "2026-07-01", betrag: "-50.00", ist_transfer: false, kategorisierung_status: "bestaetigt" },
  ];
  const result = computeCashflowIst(tx, { today: "2026-05-31" });
  assert.deepEqual(result.monate, [
    { monat: "2026-04", netto_cents: 230000 },
    { monat: "2026-05", netto_cents: -8000 },
  ]);
  assert.equal(result.gesamt_netto_cents, 222000);
  assert.equal(result.qualitaet.gesamt_anzahl, 3);
  assert.equal(result.qualitaet.offene_kategorie_anzahl, 1);
});

function rz(extra = {}) {
  return { regelzahlung_id: "RZ-001", betrag: "-1200.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt", ...extra };
}

test("defaultHorizonEnd nimmt das spaeteste aktiv_bis, mindestens Fallback", () => {
  const liste = [rz({ aktiv_bis: "2030-01-01" }), rz({ regelzahlung_id: "RZ-002", aktiv_bis: "2028-01-01" })];
  assert.equal(defaultHorizonEnd(liste, "2026-06-01", 12), "2030-01-01");
});

test("defaultHorizonEnd faellt auf today+Fallback zurueck, wenn alle unbefristet", () => {
  const liste = [rz()];
  assert.equal(defaultHorizonEnd(liste, "2026-06-01", 12), "2027-06-01");
});

test("computeCashflowPrognose projiziert nur bestaetigte ab nach heute", () => {
  const liste = [
    rz({ betrag: "3500.00", anker_datum: "2026-01-30", kategorie_id: "KAT-001" }),
    rz({ regelzahlung_id: "RZ-009", status: "vorgeschlagen", betrag: "-99.00" }),
  ];
  const result = computeCashflowPrognose(liste, { today: "2026-06-15", horizonEnd: "2026-08-31" });
  assert.deepEqual(result.monate, [
    { monat: "2026-06", netto_cents: 350000 },
    { monat: "2026-07", netto_cents: 350000 },
    { monat: "2026-08", netto_cents: 350000 },
  ]);
  assert.equal(result.qualitaet.bestaetigte_regelzahlungen, 1);
  assert.equal(result.qualitaet.vorschlaege_nicht_enthalten, 1);
  assert.equal(result.qualitaet.einmaleffekte_enthalten, false);
  assert.equal(result.horizont_ende, "2026-08-31");
});

test("Stufenaenderung: zwei aufeinanderfolgende Regelzahlungen ohne Ueberlappung", () => {
  const liste = [
    rz({ regelzahlung_id: "RZ-A", betrag: "3500.00", anker_datum: "2026-01-01", aktiv_bis: "2026-07-31" }),
    rz({ regelzahlung_id: "RZ-B", betrag: "1750.00", anker_datum: "2026-08-01" }),
  ];
  const result = computeCashflowPrognose(liste, { today: "2026-06-15", horizonEnd: "2026-09-30" });
  assert.deepEqual(result.monate, [
    { monat: "2026-07", netto_cents: 350000 },
    { monat: "2026-08", netto_cents: 175000 },
    { monat: "2026-09", netto_cents: 175000 },
  ]);
});

test("periodenSchluessel: Monat liefert den Monat unverändert", () => {
  assert.equal(periodenSchluessel("2026-08", "monat"), "2026-08");
});

test("periodenSchluessel: feste Kalenderquartale", () => {
  assert.equal(periodenSchluessel("2026-01", "quartal"), "2026-Q1");
  assert.equal(periodenSchluessel("2026-03", "quartal"), "2026-Q1");
  assert.equal(periodenSchluessel("2026-04", "quartal"), "2026-Q2");
  assert.equal(periodenSchluessel("2026-07", "quartal"), "2026-Q3");
  assert.equal(periodenSchluessel("2026-10", "quartal"), "2026-Q4");
  assert.equal(periodenSchluessel("2026-12", "quartal"), "2026-Q4");
});

test("periodenSchluessel: Jahr liefert das Jahr", () => {
  assert.equal(periodenSchluessel("2026-08", "jahr"), "2026");
});

const detailRegeln = [
  { regelzahlung_id: "RZ-001", bezeichnung: "Gehalt", betrag: "3500.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-30", status: "bestaetigt" },
  { regelzahlung_id: "RZ-002", bezeichnung: "Miete", betrag: "-1200.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "bestaetigt" },
  { regelzahlung_id: "RZ-003", bezeichnung: "Vorschlag", betrag: "-30.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2026-01-01", status: "vorgeschlagen" },
];

test("computeCashflowPrognoseDetail: Monat behält Einzelposten je Monat", () => {
  const res = computeCashflowPrognoseDetail(detailRegeln, { today: "2026-06-15", horizonEnd: "2026-07-31", granularitaet: "monat" });
  const juli = res.perioden.find((p) => p.periode === "2026-07");
  assert.ok(juli, "Juli-Periode vorhanden");
  assert.equal(juli.monate.length, 1);
  const juliMonat = juli.monate[0];
  assert.equal(juliMonat.monat, "2026-07");
  const bezeichnungen = juliMonat.posten.map((p) => p.bezeichnung).sort();
  assert.deepEqual(bezeichnungen, ["Gehalt", "Miete"]);
  assert.equal(juliMonat.netto_cents, 350000 + -120000);
});

test("computeCashflowPrognoseDetail: Summen-Konsistenz Posten=Monat=Periode=Gesamt", () => {
  const res = computeCashflowPrognoseDetail(detailRegeln, { today: "2026-06-15", horizonEnd: "2026-09-30", granularitaet: "quartal" });
  let gesamtAusPosten = 0;
  for (const periode of res.perioden) {
    let periodeSumme = 0;
    for (const monat of periode.monate) {
      const monatAusPosten = monat.posten.reduce((s, p) => s + p.betrag_cents, 0);
      assert.equal(monat.netto_cents, monatAusPosten, `Monat ${monat.monat}`);
      periodeSumme += monat.netto_cents;
    }
    assert.equal(periode.netto_cents, periodeSumme, `Periode ${periode.periode}`);
    gesamtAusPosten += periode.netto_cents;
  }
  assert.equal(res.gesamt_netto_cents, gesamtAusPosten);
});

test("computeCashflowPrognoseDetail: Vorschläge ausgeschlossen, Qualität gezählt", () => {
  const res = computeCashflowPrognoseDetail(detailRegeln, { today: "2026-06-15", horizonEnd: "2026-07-31", granularitaet: "monat" });
  assert.equal(res.qualitaet.bestaetigte_regelzahlungen, 2);
  assert.equal(res.qualitaet.vorschlaege_nicht_enthalten, 1);
  for (const periode of res.perioden) {
    for (const monat of periode.monate) {
      assert.ok(!monat.posten.some((p) => p.bezeichnung === "Vorschlag"));
    }
  }
});

test("computeCashflowPrognoseDetail: Bis-Datum begrenzt Fälligkeiten", () => {
  const res = computeCashflowPrognoseDetail(detailRegeln, { today: "2026-06-15", horizonEnd: "2026-06-30", granularitaet: "monat" });
  const alleDaten = res.perioden.flatMap((p) => p.monate.flatMap((m) => m.posten.map((x) => x.datum)));
  assert.ok(alleDaten.every((d) => d <= "2026-06-30"));
  assert.equal(res.horizont_ende, "2026-06-30");
});

test("computeCashflowPrognoseDetail: ist_laufend markiert heutiges Quartal und heutigen Monat", () => {
  const res = computeCashflowPrognoseDetail(detailRegeln, { today: "2026-06-15", horizonEnd: "2026-09-30", granularitaet: "quartal" });
  const q2 = res.perioden.find((p) => p.periode === "2026-Q2");
  const q3 = res.perioden.find((p) => p.periode === "2026-Q3");
  assert.equal(q2?.ist_laufend, true, "Q2 enthält heute");
  assert.equal(q3?.ist_laufend, false, "Q3 ist Zukunft");
  const juni = q2.monate.find((m) => m.monat === "2026-06");
  assert.equal(juni?.ist_laufend, true);
});

test("computeCashflowPrognoseDetail: Granularität monat hat genau einen Monat je Periode", () => {
  const res = computeCashflowPrognoseDetail(detailRegeln, { today: "2026-06-15", horizonEnd: "2026-12-31", granularitaet: "monat" });
  for (const periode of res.perioden) {
    assert.equal(periode.monate.length, 1);
    assert.equal(periode.periode, periode.monate[0].monat);
  }
});

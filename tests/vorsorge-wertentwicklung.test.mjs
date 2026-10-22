import assert from "node:assert/strict";
import test from "node:test";
import { wertEntwicklung } from "../app/vorsorge-rechnung.mjs";
import { wertVerlauf } from "../app/charts.mjs";

const zw = (feld, wert, standdatum) => ({ entitaet: "vorsorge", entitaet_id: "VS-001", feld, wert, standdatum, qualitaet: "belegt" });
const tx = (datum, betrag = "-100.00") => ({ transaktion_id: `TXN-${datum}`, regelzahlung_id: "RZ-001", buchungsdatum: datum, betrag });

function daten({ zeitwerte = [], transaktionen = [] } = {}) {
  return {
    vorsorge: [{ vorsorge_id: "VS-001", art: "lebensversicherung", name: "LV", status: "aktiv", kapitalbildend: true }],
    regelzahlungen: [{ regelzahlung_id: "RZ-001", vorsorge_id: "VS-001", betrag: "-100.00", rhythmus_einheit: "monat", rhythmus_intervall: 1, anker_datum: "2024-01-01" }],
    zeitwerte,
    transaktionen,
  };
}

test("ohne Wertstand keine Wertentwicklung", () => {
  assert.equal(wertEntwicklung(daten({ transaktionen: [tx("2025-01-01")] }), "VS-001"), null);
});

test("Beitragssumme laut Mitteilung plus spaetere Buchungen ergibt das Eingezahlte je Stichtag", () => {
  const ergebnis = wertEntwicklung(daten({
    zeitwerte: [
      zw("rueckkaufswert", "1000.00", "2024-12-31"),
      zw("beitragssumme", "1200.00", "2024-12-31"),
      zw("rueckkaufswert", "2300.00", "2025-12-31"),
    ],
    transaktionen: [tx("2024-12-01"), tx("2025-03-01"), tx("2025-12-31"), tx("2026-01-01")],
  }), "VS-001");
  assert.equal(ergebnis.feld, "rueckkaufswert");
  assert.deepEqual(ergebnis.punkte, [
    { datum: "2024-12-31", wert_cents: 100000, eingezahlt_cents: 120000, vollstaendig: true },
    { datum: "2025-12-31", wert_cents: 230000, eingezahlt_cents: 140000, vollstaendig: true },
  ], "Buchung vor der Mitteilung steckt schon in der Summe, die nach dem Stichtag zaehlt nicht");
  assert.deepEqual(ergebnis.ertrag, { von: "2024-12-31", bis: "2025-12-31", zuwachs_cents: 130000, beitraege_cents: 20000, ertrag_cents: 110000 });
});

test("ohne Beitragssumme nur gebuchte Beitraege, Ertrag nur bei Buchungen vor dem ersten Stichtag", () => {
  const ohneDeckung = wertEntwicklung(daten({
    zeitwerte: [zw("rueckkaufswert", "1000.00", "2024-12-31"), zw("rueckkaufswert", "1100.00", "2025-12-31")],
    transaktionen: [tx("2025-06-01")],
  }), "VS-001");
  assert.equal(ohneDeckung.letzter.vollstaendig, false);
  assert.equal(ohneDeckung.letzter.eingezahlt_cents, 10000);
  assert.equal(ohneDeckung.ertrag, null, "Buchungen beginnen erst nach dem ersten Stichtag");

  const gedeckt = wertEntwicklung(daten({
    zeitwerte: [zw("rueckkaufswert", "1000.00", "2024-12-31"), zw("rueckkaufswert", "1100.00", "2025-12-31")],
    transaktionen: [tx("2024-12-01"), tx("2025-06-01")],
  }), "VS-001");
  assert.equal(gedeckt.ertrag.ertrag_cents, 0, "Zuwachs 100 minus Beitraege 100");
});

test("Vertragswert zaehlt, wenn er oefter belegt ist als der Rueckkaufswert", () => {
  const ergebnis = wertEntwicklung(daten({
    zeitwerte: [zw("rueckkaufswert", "900.00", "2025-12-31"), zw("vertragswert", "1000.00", "2024-12-31"), zw("vertragswert", "1200.00", "2025-12-31")],
  }), "VS-001");
  assert.equal(ergebnis.feld, "vertragswert");
  assert.deepEqual(ergebnis.punkte.map((p) => p.wert_cents), [100000, 120000]);
});

test("Wertverlauf: zwei Linien, Punkte je Stichtag, Jahresbeschriftung, Hover-Daten", () => {
  const svg = wertVerlauf({
    punkte: [
      { datum: "2024-12-31", wert_cents: 100000, eingezahlt_cents: 120000 },
      { datum: "2025-06-30", wert_cents: 160000, eingezahlt_cents: 130000 },
      { datum: "2025-12-31", wert_cents: 230000, eingezahlt_cents: 140000 },
    ],
    formatWert: (c) => `${c / 100} €`,
    labels: { wert: "Rückkaufswert", eingezahlt: "Eingezahlt" },
  });
  assert.match(svg, /class="wert-linie"/);
  assert.match(svg, /class="wert-eingezahlt"/);
  assert.equal((svg.match(/class="wert-punkt"/g) ?? []).length, 3);
  assert.equal((svg.match(/>2025</g) ?? []).length, 1, "ein Label je Jahr");
  assert.match(svg, /data-spalten="[^"]*Eingezahlt[^"]*1400 €/);
  assert.equal(wertVerlauf({ punkte: [{ datum: "2025-12-31", wert_cents: 1 }] }), "");
});

test("vor der ersten Beitragssumme wird rueckwaerts gerechnet, wenn die Buchungen den Zeitraum abdecken", () => {
  const zeitwerte = [
    zw("rueckkaufswert", "1000.00", "2024-12-31"),
    zw("rueckkaufswert", "1300.00", "2025-12-31"),
    zw("beitragssumme", "1500.00", "2025-06-30"),
  ];
  const ergebnis = wertEntwicklung(daten({ zeitwerte, transaktionen: [tx("2024-12-01"), tx("2025-03-01"), tx("2025-06-30"), tx("2025-09-01")] }), "VS-001");
  assert.deepEqual(ergebnis.punkte.map((p) => [p.eingezahlt_cents, p.vollstaendig]), [[130000, true], [160000, true]], "1.500 minus zwei Buchungen bis 30.6., danach plus eine");
  assert.equal(ergebnis.ertrag.ertrag_cents, 0, "Zuwachs 300 minus Beitraege 300");

  const ohneDeckung = wertEntwicklung(daten({ zeitwerte, transaktionen: [tx("2025-03-01")] }), "VS-001");
  assert.equal(ohneDeckung.punkte[0].vollstaendig, false, "Buchungen beginnen erst nach dem Stichtag");
  assert.equal(ohneDeckung.ertrag, null);
});

test("monatlicher Vertrag: Buchungen ab dem Folgemonat decken das Jahr nach dem Stichtag ab", () => {
  const zeitwerte = [zw("rueckkaufswert", "1000.00", "2023-12-31"), zw("rueckkaufswert", "2300.00", "2024-12-31")];
  const monate = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  const ergebnis = wertEntwicklung(daten({ zeitwerte, transaktionen: monate.map((m) => tx(`2024-${m}-02`)) }), "VS-001");
  assert.deepEqual(ergebnis.ertrag, { von: "2023-12-31", bis: "2024-12-31", zuwachs_cents: 130000, beitraege_cents: 120000, ertrag_cents: 10000 });

  const spaeterStart = wertEntwicklung(daten({ zeitwerte, transaktionen: monate.slice(1).map((m) => tx(`2024-${m}-02`)) }), "VS-001");
  assert.equal(spaeterStart.ertrag, null, "Januar fehlt: Buchungen beginnen erst im Februar");
});

test("ohne Beitragssumme: Ertrag je Zeitraum und Wert ohne Ertrag, so weit die Buchungen reichen", () => {
  const zeitwerte = [
    zw("rueckkaufswert", "800.00", "2022-12-31"),
    zw("rueckkaufswert", "1000.00", "2023-12-31"),
    zw("rueckkaufswert", "2300.00", "2024-12-31"),
    zw("rueckkaufswert", "3500.00", "2025-12-31"),
  ];
  const monate = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  const transaktionen = ["2024", "2025"].flatMap((j) => monate.map((m) => tx(`${j}-${m}-02`)));
  const ergebnis = wertEntwicklung(daten({ zeitwerte, transaktionen }), "VS-001");
  assert.deepEqual(ergebnis.zeitraeume.map((z) => [z.von, z.ertrag_cents]), [["2023-12-31", 10000], ["2024-12-31", 0]], "2022 bis 2023 ohne Buchungen");
  assert.deepEqual(ergebnis.ohne_ertrag, [
    { datum: "2023-12-31", cents: 100000 },
    { datum: "2024-12-31", cents: 220000 },
    { datum: "2025-12-31", cents: 340000 },
  ]);
  assert.equal(ergebnis.ertrag.ertrag_cents, 0);
});

test("nur Sparanteil: Lastschriften mit BU-Anteil zaehlen nicht, Eingezahltes nur zum Stichtag der Summe", () => {
  const data = daten({
    zeitwerte: [
      zw("vertragswert", "1000.00", "2024-12-31"),
      zw("beitragssumme", "1100.00", "2024-12-31"),
      zw("vertragswert", "1500.00", "2025-12-31"),
      zw("beitragssumme", "1700.00", "2025-12-31"),
      zw("vertragswert", "1600.00", "2026-03-31"),
    ],
    transaktionen: [tx("2024-12-01"), tx("2025-06-01"), tx("2026-01-01")],
  });
  data.vorsorge[0].beitragssumme_umfang = "sparanteil";
  const ergebnis = wertEntwicklung(data, "VS-001");
  assert.deepEqual(ergebnis.punkte.map((p) => [p.eingezahlt_cents, p.vollstaendig]), [[110000, true], [170000, true], [0, false]],
    "nach der letzten Summe keine Fortschreibung mit der vollen Lastschrift");
  assert.deepEqual(ergebnis.zeitraeume.map((z) => [z.von, z.ertrag_cents]), [["2024-12-31", -10000]], "Zuwachs 500 minus Sparbeitraege 600");
  assert.equal(ergebnis.ertrag, null);
  assert.deepEqual(ergebnis.ohne_ertrag, []);
});

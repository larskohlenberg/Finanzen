import assert from "node:assert/strict";
import test from "node:test";
import { mittelVergleich, monatsMittel, monatsTrend, trendVergleich, vorjahresMittel } from "../app/uebersicht-rechnung.mjs";

const kategorien = [
  { kategorie_id: "KAT-001", name: "Gehalt", typ: "einnahme" },
  { kategorie_id: "KAT-003", name: "Wohnen", typ: "ausgabe" },
  { kategorie_id: "KAT-004", name: "Lebensmittel", typ: "ausgabe" },
  { kategorie_id: "KAT-007", name: "Versicherungen", typ: "ausgabe" },
];
const tx = (buchungsdatum, betrag, kategorie_id) => ({ buchungsdatum, betrag, kategorie_id, ist_transfer: false });
const monat = (jahr, m) => `${jahr}-${String(m).padStart(2, "0")}`;

// 2024 und 2025 je Monat: Gehalt 3000 (ab 2025 3300), Miete 1200, Lebensmittel
// 400 (ab Juli 2025 500), dazu jeden Januar eine Jahresversicherung ueber 1200.
function bestand() {
  const transaktionen = [];
  for (const jahr of [2024, 2025]) {
    for (let m = 1; m <= 12; m++) {
      const ym = monat(jahr, m);
      transaktionen.push(tx(`${ym}-01`, jahr === 2025 ? "3300.00" : "3000.00", "KAT-001"));
      transaktionen.push(tx(`${ym}-03`, "-1200.00", "KAT-003"));
      transaktionen.push(tx(`${ym}-10`, jahr === 2025 && m >= 7 ? "-500.00" : "-400.00", "KAT-004"));
      if (m === 1) transaktionen.push(tx(`${ym}-15`, "-1200.00", "KAT-007"));
    }
  }
  return { transaktionen, kategorien };
}

test("trendVergleich: Pfeil erst ab 5 Prozent und 20 Euro, sonst seitwaerts", () => {
  assert.deepEqual(trendVergleich(330000, 300000), { aktuell_cents: 330000, vorher_cents: 300000, aenderung_cents: 30000, anteil: 0.1, richtung: "hoch" });
  assert.equal(trendVergleich(300000, 310000).richtung, "seitwaerts"); // -3 %
  assert.equal(trendVergleich(3000, 1500).richtung, "seitwaerts"); // +100 %, aber nur 15 Euro
  assert.equal(trendVergleich(100000, 150000).richtung, "runter");
  // Neu dazugekommen: kein Anteil, Richtung nach dem Betrag
  assert.deepEqual(trendVergleich(5000, 0), { aktuell_cents: 5000, vorher_cents: 0, aenderung_cents: 5000, anteil: null, richtung: "hoch" });
});

test("monatsTrend: gleitendes Mittel je Monat, letzter Punkt gleich der Kachel", () => {
  const data = bestand();
  const r = monatsTrend(data, "2026-01-20", { punkte: 24 });
  // Volle Zwoelf-Monats-Fenster gibt es ab Dezember 2024.
  assert.equal(r.monate[0], "2024-12");
  assert.equal(r.monate.at(-1), "2025-12");
  assert.equal(r.monate.length, 13);
  const kachel = monatsMittel(data, "2026-01-20");
  assert.equal(r.einnahmen.mittel_cents.at(-1), kachel.einnahmen.mittel_cents);
  assert.equal(r.ausgaben.mittel_cents.at(-1), kachel.ausgaben.mittel_cents);
  // Die Jahresversicherung steckt in jedem Fenster genau einmal: (1200+400)*12+1200 / 12
  assert.equal(r.ausgaben.mittel_cents[0], 170000);
  // Monatswerte wie gebucht, im Januar mit der Versicherung
  assert.equal(r.ausgaben.monat_cents[1], 280000);
  assert.equal(r.ausgaben.monat_cents.at(-1), 170000);
  assert.equal(r.einnahmen.mittel_cents[6], 315000); // Juni 2025: 6 x 3000 + 6 x 3300
  assert.equal(r.sparquote.length, 13);
});

test("monatsTrend: Vergleich der letzten zwoelf Monate mit den zwoelf davor, je Kategorie", () => {
  const r = monatsTrend(bestand(), "2026-01-20");
  assert.equal(r.vergleich.einnahmen.summe.richtung, "hoch");
  assert.equal(r.vergleich.einnahmen.summe.aenderung_cents, 30000);
  assert.equal(r.vergleich.ausgaben.kategorien["KAT-004"].richtung, "hoch"); // 450 statt 400
  assert.equal(r.vergleich.ausgaben.kategorien["KAT-004"].anteil, 0.125);
  assert.equal(r.vergleich.ausgaben.kategorien["KAT-003"].richtung, "seitwaerts");
  assert.equal(r.vergleich.ausgaben.summe.richtung, "seitwaerts"); // +50 von 1700 = 2,9 %
  // Sparquote in Prozentpunkten: 2025 (3300-1750)/3300, 2024 (3000-1700)/3000
  assert.equal(r.vergleich.sparquote.aenderung_pp, 3.6);
  // Kategorie-Reihen fuer die Minikurven
  const lebensmittel = r.kategorien.ausgaben.find((k) => k.kategorie_id === "KAT-004");
  assert.equal(lebensmittel.mittel_cents.length, r.monate.length);
  assert.equal(lebensmittel.mittel_cents.at(-1), 45000);
});

test("monatsTrend: ohne zwoelf Vormonate kein Vergleich, kurze Historie keine Punkte", () => {
  const data = bestand();
  data.transaktionen = data.transaktionen.filter((t) => t.buchungsdatum >= "2025-01-01");
  const r = monatsTrend(data, "2026-01-20");
  assert.deepEqual(r.monate, ["2025-12"]);
  assert.equal(r.vergleich, null);
  assert.equal(monatsTrend({ transaktionen: [], kategorien }, "2026-01-20").monate.length, 0);
});

test("vorjahresMittel und mittelVergleich: das Fenster zwoelf Monate frueher", () => {
  const data = bestand();
  const jetzt = monatsMittel(data, "2026-01-20");
  const vorher = vorjahresMittel(data, jetzt);
  assert.equal(vorher.monate.at(-1), "2024-12");
  assert.equal(vorher.anzahl_monate, 12);
  const v = mittelVergleich(jetzt, vorher);
  assert.equal(v.einnahmen.summe.vorher_cents, 300000);
  // Stichtag und beide Zeitraeume fuer die Anzeige
  assert.deepEqual(v.zeitraum, { von: "2025-01-01", bis: "2025-12-31", vorher_von: "2024-01-01", vorher_bis: "2024-12-31" });
  assert.equal(mittelVergleich(jetzt, null), null);
});

test("miniKurve: Linie ueber die Werte, flache Reihe in der Mitte, zu kurze Reihe leer", async () => {
  const { miniKurve } = await import("../app/charts.mjs");
  const svg = miniKurve([100, 200, 300], { klasse: "trend-ausgaben", ariaLabel: "Lebensmittel" });
  assert.match(svg, /^<svg class="mini-kurve trend-ausgaben"/);
  assert.match(svg, /points="1\.0,[\d.]+ 40\.0,[\d.]+ 79\.0,[\d.]+"/);
  // Konstante Reihe: waagerecht auf halber Hoehe statt Division durch null.
  assert.match(miniKurve([500, 500]), /points="1\.0,10\.0 79\.0,10\.0"/);
  assert.equal(miniKurve([500]), "");
  assert.equal(miniKurve([1, null, 3]), "");
});

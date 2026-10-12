// Saldo-Diagramm (Liquiditaet): zeitproportionale X-Achse mit Monatsmarken,
// gerundete Y-Achse mit Gitter, Stufenlinie und Hover-Daten.
import assert from "node:assert/strict";
import test from "node:test";
import { achsenTicks, punktBeiX, saldoDiagramm, xMarken } from "../app/charts.mjs";
import { saldoJeTag } from "../app/liquiditaet.mjs";

const attr = (svg, name) => JSON.parse(svg.match(new RegExp(`${name}="([^"]*)"`))[1].replaceAll("&quot;", '"').replaceAll("&amp;", "&"));

test("achsenTicks: runde Schritte aus 1/2/2,5/5 x 10^n, Bereich umschliesst die Daten", () => {
  assert.deepEqual(achsenTicks(0, 1816600), { min: 0, max: 2000000, ticks: [0, 500000, 1000000, 1500000, 2000000] });
  assert.deepEqual(achsenTicks(-250000, 120000), { min: -300000, max: 200000, ticks: [-300000, -200000, -100000, 0, 100000, 200000] });
  const flach = achsenTicks(0, 0);
  assert.ok(flach.max > flach.min);
});

test("saldoDiagramm: X zeitproportional, Stufenlinie, Hover-Daten mit Datum und Wertebereich", () => {
  const svg = saldoDiagramm(
    [{ datum: "2026-10-01", wert: 100000 }, { datum: "2026-10-02", wert: 50000 }, { datum: "2026-10-31", wert: 80000 }],
    { formatAchse: (c) => `${c / 100} E` },
  );
  const punkte = attr(svg, "data-punkte");
  const plot = attr(svg, "data-plot");
  assert.deepEqual(punkte.map((p) => p.datum), ["2026-10-01", "2026-10-02", "2026-10-31"]);
  // 1 von 30 Tagen: der zweite Punkt liegt nahe am ersten, nicht in der Mitte.
  assert.ok(punkte[1].x - punkte[0].x < (punkte[2].x - punkte[0].x) / 10);
  assert.equal(plot.stufe, true);
  assert.equal(plot.min, 0);
  assert.equal(plot.max, 100000);
  // Stufen: horizontal zum naechsten Datum, dann vertikal auf den neuen Saldo.
  assert.match(svg, /<path d="M [\d.]+,[\d.]+ H [\d.]+ V [\d.]+ H [\d.]+ V [\d.]+" class="diagramm-linie"/);
  // Y-Achse: beschriftete Ticks mit Gitterlinien.
  for (const label of ["0 E", "500 E", "1000 E"]) assert.match(svg, new RegExp(`>${label}</text>`));
  assert.ok((svg.match(/class="diagramm-gitter"/g) ?? []).length >= 3);
});

test("saldoDiagramm: Monatsmarken auf der X-Achse, Jahr beim ersten Label und im Januar", () => {
  const svg = saldoDiagramm(
    [{ datum: "2026-10-12", wert: 100 }, { datum: "2027-02-20", wert: 200 }],
    { formatTick: (iso, art) => `${iso.slice(0, 7)}:${art}` },
  );
  const labels = [...svg.matchAll(/class="diagramm-achse-label x">([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(labels, ["2026-11:monatJahr", "2026-12:monat", "2027-01:monatJahr", "2027-02:monat"]);
});

test("xMarken: kurzer Zeitraum in Wochen, langer Horizont nur in Jahren und ausgeduennt", () => {
  assert.deepEqual(xMarken("2026-10-01", "2026-10-12", 8), [{ iso: "2026-10-01", art: "tag" }, { iso: "2026-10-08", art: "tag" }]);
  const lang = xMarken("2026-10-12", "2042-07-31", 8);
  assert.ok(lang.length <= 8);
  assert.ok(lang.every((m) => m.art === "jahr" && m.iso.endsWith("-01-01")));
  assert.deepEqual(lang.map((m) => m.iso.slice(0, 4)), ["2028", "2030", "2032", "2034", "2036", "2038", "2040", "2042"]);
  const quartale = xMarken("2026-10-12", "2029-12-31", 8);
  assert.ok(quartale.length <= 8 && quartale.every((m) => /-(01|07)-01$/.test(m.iso)));
});

test("saldoDiagramm: unter zwei Punkten nichts", () => {
  assert.equal(saldoDiagramm([{ datum: "2026-10-01", wert: 1 }]), "");
});

test("punktBeiX: Stufen nehmen den letzten Punkt links vom Zeiger, sonst den naechsten", () => {
  const punkte = [{ x: 10 }, { x: 50 }, { x: 100 }];
  assert.equal(punktBeiX(punkte, 49, true), punkte[0]);
  assert.equal(punktBeiX(punkte, 51, true), punkte[1]);
  assert.equal(punktBeiX(punkte, 5, true), punkte[0]);
  assert.equal(punktBeiX(punkte, 49, false), punkte[1]);
});

test("saldoJeTag: je Datum der Saldo am Tagesende, Reihenfolge bleibt", () => {
  const verlauf = [
    { datum: "2026-10-01", saldo_cents: 100 },
    { datum: "2026-10-15", saldo_cents: 90 },
    { datum: "2026-10-15", saldo_cents: 70 },
    { datum: "2026-10-20", saldo_cents: 75 },
  ];
  assert.deepEqual(saldoJeTag(verlauf), [
    { datum: "2026-10-01", wert: 100 },
    { datum: "2026-10-15", wert: 70 },
    { datum: "2026-10-20", wert: 75 },
  ]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { zeitstrahlDiagramm, stapelDiagramm } from "../app/charts.mjs";

const spalten = ["2026", "2027", "2028", "2029"].map((label) => ({ label }));

test("zeitstrahlDiagramm: Linien je Serie, Nulllinie, Zone unter Null, Hover-Zeilen je Serie", () => {
  const svg = zeitstrahlDiagramm({
    spalten,
    serien: [{ klasse: "szenario", label: "Szenario", werte: [100, 50, -20, -80] }, { klasse: "vergleich", label: "Basis", werte: [100, 80, 60, 40] }],
    formatWert: (c) => `${c} ct`,
  });
  assert.equal((svg.match(/class="zeitstrahl-linie /g) ?? []).length, 2);
  assert.match(svg, /class="zone-negativ"/);
  assert.match(svg, /class="zeitstrahl-null"/);
  const spaltenDaten = JSON.parse(svg.match(/data-spalten="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  assert.equal(spaltenDaten.length, 4);
  assert.deepEqual(spaltenDaten[2].zeilen.map((z) => z.wert), ["-20 ct", "60 ct"]);
});

test("zeitstrahlDiagramm: Phasenbaender und Ereignismarker", () => {
  const svg = zeitstrahlDiagramm({
    spalten,
    serien: [{ klasse: "szenario", label: "S", werte: [1, 2, 3, 4] }],
    phasen: [{ name: "Arbeit", von: 0, bis: 2 }, { name: "Rente", von: 2, bis: 4 }],
    ereignisse: [{ pos: 2.5, label: "Hausverkauf" }],
  });
  assert.equal((svg.match(/class="phase-band /g) ?? []).length, 2);
  assert.match(svg, />Arbeit</);
  assert.match(svg, /class="ereignis-marker"/);
  assert.match(svg, />Hausverkauf</);
  assert.doesNotMatch(svg, /zone-negativ/);
});

test("zeitstrahlDiagramm: zu wenig Spalten oder unpassende Serien ergeben leeren String", () => {
  assert.equal(zeitstrahlDiagramm({ spalten: spalten.slice(0, 1), serien: [{ klasse: "s", label: "s", werte: [1] }] }), "");
  assert.equal(zeitstrahlDiagramm({ spalten, serien: [{ klasse: "s", label: "s", werte: [1, 2] }] }), "");
});

test("stapelDiagramm: Teile gestapelt, Restschuld nach unten, Netto-Linie", () => {
  const svg = stapelDiagramm({
    spalten: spalten.slice(0, 2),
    teile: [{ klasse: "liquide", label: "Liquide", werte: [100, 200] }, { klasse: "restschuld", label: "Restschuld", werte: [-50, -40] }],
    netto: { label: "Netto", werte: [50, 160] },
  });
  assert.equal((svg.match(/class="stapel liquide"/g) ?? []).length, 2);
  assert.equal((svg.match(/class="stapel restschuld"/g) ?? []).length, 2);
  assert.match(svg, /class="balken-saldo"/);
});

test("zeitstrahlDiagramm: null-Werte unterbrechen die Linie und erscheinen im Hover als Strich", () => {
  const svg = zeitstrahlDiagramm({ spalten, serien: [{ klasse: "serie-0", label: "A", werte: [1, null, 3, 4] }] });
  assert.equal((svg.match(/class="zeitstrahl-linie /g) ?? []).length, 2);
  assert.match(svg, /&quot;wert&quot;:&quot;—&quot;/);
});

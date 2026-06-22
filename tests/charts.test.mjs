import { test } from "node:test";
import assert from "node:assert/strict";
import { linienDiagramm } from "../app/charts.mjs";

test("linienDiagramm liefert nichts unter zwei Punkten", () => {
  assert.equal(linienDiagramm([]), "");
  assert.equal(linienDiagramm([{ wert: 100 }]), "");
  assert.equal(linienDiagramm(null), "");
});

test("linienDiagramm erzeugt ein SVG mit einem Polyline-Punkt je Datenpunkt", () => {
  const svg = linienDiagramm([{ wert: 100 }, { wert: 200 }, { wert: 50 }]);
  assert.match(svg, /^<svg/);
  const points = svg.match(/<polyline points="([^"]+)"/)[1].trim().split(/\s+/);
  assert.equal(points.length, 3);
});

test("linienDiagramm zeichnet die Nulllinie nur bei Vorzeichenwechsel", () => {
  // Rein positive Serie: keine Nulllinie.
  assert.doesNotMatch(linienDiagramm([{ wert: 100 }, { wert: 300 }]), /diagramm-nulllinie/);
  // Serie kreuzt 0: Nulllinie vorhanden, Tiefpunkt als negativ markiert.
  const svg = linienDiagramm([{ wert: 500 }, { wert: -200 }]);
  assert.match(svg, /diagramm-nulllinie/);
  assert.match(svg, /diagramm-tiefpunkt negativ/);
});

test("linienDiagramm beschriftet ersten, letzten und Tiefpunkt ueber formatWert", () => {
  const svg = linienDiagramm(
    [{ wert: 1000 }, { wert: -50 }, { wert: 400 }],
    { formatWert: (n) => `${(n / 100).toFixed(2)} €`, ariaLabel: "Test" },
  );
  assert.match(svg, /aria-label="Test"/);
  assert.match(svg, /10\.00 €/);   // erster
  assert.match(svg, /4\.00 €/);    // letzter
  assert.match(svg, /-0\.50 €/);   // Tiefpunkt
});

test("linienDiagramm dupliziert Endwert nicht als Tiefpunkt-Label", () => {
  const svg = linienDiagramm(
    [{ wert: 788786 }, { wert: 274577 }, { wert: 161353 }, { wert: 140559 }],
    { formatWert: (n) => `${(n / 100).toFixed(2)} €` },
  );
  assert.equal(svg.match(/1405\.59 €/g)?.length, 1);
});

test("linienDiagramm escaped Sonderzeichen in Labels", () => {
  const svg = linienDiagramm([{ wert: 1 }, { wert: 2 }], { ariaLabel: '<x>&"' });
  assert.match(svg, /aria-label="&lt;x&gt;&amp;&quot;"/);
  assert.doesNotMatch(svg, /aria-label="<x>/);
});

test("linienDiagramm zeichnet eine gestrichelte Vergleichslinie, wenn vergleich gegeben ist", () => {
  const svg = linienDiagramm([{ wert: 100 }, { wert: 200 }], { vergleich: [{ wert: 50 }, { wert: 150 }] });
  assert.match(svg, /diagramm-linie-vergleich/);
  const vergleichPoints = svg.match(/<polyline points="([^"]+)" class="diagramm-linie-vergleich"/)[1].trim().split(/\s+/);
  assert.equal(vergleichPoints.length, 2);
});

test("linienDiagramm ignoriert vergleich mit abweichender Länge", () => {
  const svg = linienDiagramm([{ wert: 100 }, { wert: 200 }], { vergleich: [{ wert: 50 }] });
  assert.doesNotMatch(svg, /diagramm-linie-vergleich/);
});

test("linienDiagramm ohne vergleich verhält sich wie zuvor (kein vergleich-Element)", () => {
  const svg = linienDiagramm([{ wert: 100 }, { wert: 200 }, { wert: 50 }]);
  assert.doesNotMatch(svg, /diagramm-linie-vergleich/);
});

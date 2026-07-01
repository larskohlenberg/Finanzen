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

test("linienDiagramm bleibt ohne monat/formatMonat im Alt-Modus (keine Achsen/Hover-Daten)", () => {
  const svg = linienDiagramm([{ wert: 100 }, { wert: 200 }, { wert: 50 }]);
  assert.doesNotMatch(svg, /data-punkte/);
  assert.doesNotMatch(svg, /diagramm-achse-label/);
  assert.doesNotMatch(svg, /diagramm-legende/);
});

// Zeit-Modus: eine monat-behaftete Serie mit vergleich.
const zeitPunkte = [
  { wert: 5000, monat: "2026-01" },
  { wert: 3000, monat: "2026-02" },
  { wert: -1000, monat: "2026-03" },
  { wert: 800, monat: "2026-04" },
  { wert: 2500, monat: "2026-05" },
  { wert: 4200, monat: "2026-06" },
  { wert: 6000, monat: "2026-07" },
];
const zeitBasis = zeitPunkte.map((p) => ({ wert: p.wert + 500 }));
const zeitOpts = {
  vergleich: zeitBasis,
  formatWert: (c) => `${(c / 100).toFixed(2)} €`,
  formatMonat: (m) => m,
  ariaLabel: "Liquidität",
};

test("linienDiagramm (Zeit-Modus) labelt ersten, letzten und Quartalsanfänge auf der X-Achse", () => {
  const svg = linienDiagramm(zeitPunkte, zeitOpts);
  const achsenLabels = [...svg.matchAll(/class="diagramm-achse-label"[^>]*>([^<]*)</g)].map((m) => m[1]);
  // Erster und letzter Monat immer vorhanden.
  assert.ok(achsenLabels.includes("2026-01"), "erster Monat fehlt");
  assert.ok(achsenLabels.includes("2026-07"), "letzter Monat fehlt");
  // Quartalsanfang -04 als zusätzliche Quartalsmarke — kompaktes Format "Q2 26"
  // (Endpunkte bleiben im formatMonat-Format, Zwischenmarken werden kompakt).
  assert.ok(achsenLabels.includes("Q2 26"), "kompakte Quartalsmarke Q2 26 fehlt");
});

test("linienDiagramm (Zeit-Modus) labelt Y-Achse mit max, min und 0", () => {
  const svg = linienDiagramm(zeitPunkte, zeitOpts);
  const achsenLabels = [...svg.matchAll(/class="diagramm-achse-label"[^>]*>([^<]*)</g)].map((m) => m[1]);
  // Basis liegt bei 6500 (max), Serie kreuzt 0 → min -1000.
  assert.ok(achsenLabels.includes("65.00 €"), "max-Label fehlt");
  assert.ok(achsenLabels.includes("-10.00 €"), "min-Label fehlt");
  assert.ok(achsenLabels.includes("0.00 €"), "Null-Label fehlt");
  assert.match(svg, /diagramm-nulllinie/);
});

test("linienDiagramm (Zeit-Modus) zeichnet Legende mit Szenario- und Basis-Label", () => {
  const svg = linienDiagramm(zeitPunkte, { ...zeitOpts, szenarioLabel: "Plan A", basisLabel: "Ist" });
  assert.match(svg, /diagramm-legende/);
  assert.match(svg, />Plan A</);
  assert.match(svg, />Ist</);
});

test("linienDiagramm (Zeit-Modus) verwendet Default-Legendenlabels ohne Optionen", () => {
  const svg = linienDiagramm(zeitPunkte, { ...zeitOpts, szenarioLabel: undefined, basisLabel: undefined });
  assert.match(svg, />Szenario</);
  assert.match(svg, />Basis</);
});

test("linienDiagramm (Zeit-Modus) bettet data-punkte und data-plot korrekt ein", () => {
  const svg = linienDiagramm(zeitPunkte, zeitOpts);
  const punkteAttr = svg.match(/data-punkte="([^"]*)"/)[1];
  const plotAttr = svg.match(/data-plot="([^"]*)"/)[1];
  // esc() ersetzt " durch &quot; im Attributwert — rückübersetzen zum Parsen.
  const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const dataPunkte = JSON.parse(unesc(punkteAttr));
  const dataPlot = JSON.parse(unesc(plotAttr));

  assert.equal(dataPunkte.length, zeitPunkte.length);
  assert.deepEqual(dataPunkte[0], { i: 0, x: dataPunkte[0].x, monat: "2026-01", wert: 5000, basis: 5500 });
  // basis stammt aus vergleich am selben Index.
  assert.equal(dataPunkte[2].basis, zeitBasis[2].wert);
  assert.equal(dataPunkte[6].monat, "2026-07");
  // x-Werte gerundet und aufsteigend innerhalb der Plotgrenzen.
  assert.ok(dataPunkte.every((p) => Number.isInteger(p.x)));
  assert.equal(dataPunkte[0].x, dataPlot.left);
  assert.equal(dataPunkte[dataPunkte.length - 1].x, dataPlot.right);

  // Plotgrenzen: ganzzahlig, links<rechts, oben<unten.
  for (const k of ["left", "right", "top", "bottom"]) assert.ok(Number.isInteger(dataPlot[k]));
  assert.ok(dataPlot.left < dataPlot.right);
  assert.ok(dataPlot.top < dataPlot.bottom);
});

test("linienDiagramm (Zeit-Modus) setzt basis=null ohne vergleich", () => {
  const svg = linienDiagramm(zeitPunkte, { formatMonat: (m) => m, formatWert: (c) => String(c) });
  const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  const dataPunkte = JSON.parse(unesc(svg.match(/data-punkte="([^"]*)"/)[1]));
  assert.ok(dataPunkte.every((p) => p.basis === null));
  assert.doesNotMatch(svg, /diagramm-legende/);
});

test("linienDiagramm (Zeit-Modus) escaped JSON-Attribute HTML-sicher", () => {
  // Sicherstellen, dass keine rohen Anführungszeichen das Attribut brechen.
  const svg = linienDiagramm(zeitPunkte, zeitOpts);
  const attrRegion = svg.slice(0, svg.indexOf(">") + 1);
  assert.match(attrRegion, /data-punkte="[^"]*&quot;[^"]*"/);
});

test("linienDiagramm (Zeit-Modus) entfernt die alten Start-/Endwert-Eck-Labels", () => {
  const svg = linienDiagramm(zeitPunkte, zeitOpts);
  // Im Alt-Modus säßen zwei diagramm-label-Texte oben in den Ecken (y ~ padTop-4).
  // Im Zeit-Modus gibt es keine solchen Eck-Labels mehr; der Endwert 60.00 € taucht
  // nicht als oberes Label auf (max ist 65.00 € aus der Basis).
  assert.doesNotMatch(svg, /y="18\.00" class="diagramm-label"/);
});

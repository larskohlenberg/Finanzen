// app/charts.mjs
// Reine SVG-Liniendiagramm-Komponente: keine Library, kein DOM. Theming ueber
// CSS-Variablen (Light/Dark). Eingabe sind Punkte mit numerischem `wert`; die
// Beschriftung formatiert der Aufrufer (formatWert). Getestet ueber die erzeugte
// Geometrie. Beantwortet "wann kippt es?" — daher immer mit Nulllinie im Blick.

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// punkte: [{ wert: number, label?: string }]
export function linienDiagramm(punkte, options = {}) {
  const {
    width = 640,
    height = 180,
    padLeft = 10,
    padRight = 10,
    padTop = 14,
    padBottom = 24,
    formatWert = (n) => String(n),
    ariaLabel = "",
  } = options;

  // Unter zwei Punkten gibt es keine Linie — der Aufrufer zeigt Tabelle/Leerhinweis.
  if (!Array.isArray(punkte) || punkte.length < 2) return "";

  const werte = punkte.map((p) => p.wert);
  // Nulllinie immer in den Wertebereich aufnehmen: so ist der Abstand zur 0
  // (und ein Vorzeichenwechsel) sichtbar — der eigentliche Zweck der Kurve.
  let minW = Math.min(0, ...werte);
  let maxW = Math.max(0, ...werte);
  if (minW === maxW) maxW = minW + 1; // flache Serie: keine Division durch 0

  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const baseY = padTop + innerH;
  const x = (i) => padLeft + (i / (punkte.length - 1)) * innerW;
  const y = (w) => padTop + (1 - (w - minW) / (maxW - minW)) * innerH;

  const linePoints = punkte.map((p, i) => `${x(i).toFixed(2)},${y(p.wert).toFixed(2)}`).join(" ");
  const areaPath =
    `M ${x(0).toFixed(2)},${baseY.toFixed(2)} ` +
    punkte.map((p, i) => `L ${x(i).toFixed(2)},${y(p.wert).toFixed(2)}`).join(" ") +
    ` L ${x(punkte.length - 1).toFixed(2)},${baseY.toFixed(2)} Z`;

  // Nulllinie nur zeichnen, wenn 0 echt im Wertebereich liegt (Serie kreuzt sie).
  const kreuztNull = Math.min(...werte) < 0 && Math.max(...werte) > 0;
  const nulllinie = kreuztNull
    ? `<line x1="${padLeft}" y1="${y(0).toFixed(2)}" x2="${(padLeft + innerW).toFixed(2)}" y2="${y(0).toFixed(2)}" class="diagramm-nulllinie" />`
    : "";

  // Tiefpunkt markieren — "wann kippt es" sitzt hier.
  const minWert = Math.min(...werte);
  const minIndex = werte.indexOf(minWert);
  const tiefpunkt = `<circle cx="${x(minIndex).toFixed(2)}" cy="${y(minWert).toFixed(2)}" r="3" class="diagramm-tiefpunkt ${minWert < 0 ? "negativ" : ""}" />`;

  const erster = punkte[0].wert;
  const letzter = punkte[punkte.length - 1].wert;
  const labelLinks = `<text x="${padLeft}" y="${(padTop - 4).toFixed(2)}" class="diagramm-label">${esc(formatWert(erster))}</text>`;
  const labelRechts = `<text x="${(padLeft + innerW).toFixed(2)}" y="${(padTop - 4).toFixed(2)}" text-anchor="end" class="diagramm-label">${esc(formatWert(letzter))}</text>`;
  const labelTief = `<text x="${x(minIndex).toFixed(2)}" y="${(baseY + 16).toFixed(2)}" text-anchor="middle" class="diagramm-label ${minWert < 0 ? "negativ" : ""}">${esc(formatWert(minWert))}</text>`;

  return `<svg class="linien-diagramm" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(ariaLabel)}">
    <path d="${areaPath}" class="diagramm-flaeche" />
    ${nulllinie}
    <polyline points="${linePoints}" class="diagramm-linie" fill="none" vector-effect="non-scaling-stroke" />
    ${tiefpunkt}
    ${labelLinks}${labelRechts}${labelTief}
  </svg>`;
}

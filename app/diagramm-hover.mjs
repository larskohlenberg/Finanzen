// app/diagramm-hover.mjs
// Delegierter Hover fuer die SVG-Liniendiagramme (charts.mjs, Zeit-Modus).
// charts.mjs bleibt reine Geometrie und bettet data-punkte / data-plot am
// Wurzel-<svg> ein; hier lebt ausschliesslich das DOM-Verhalten (ADR 0022).
// Der Overlay liegt in document.body, weil render() den #app-Inhalt komplett
// ersetzt und dort platzierte Knoten sonst weggewischt wuerden.
import { formatMoney, formatMonth } from "./komponenten.mjs";

let overlay = null;

function ensureOverlay() {
  if (overlay && document.body.contains(overlay)) return overlay;
  overlay = document.createElement("div");
  overlay.className = "diagramm-hover";
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="diagramm-hover-linie"></div>' +
    '<div class="diagramm-hover-punkt szenario" hidden></div>' +
    '<div class="diagramm-hover-punkt basis" hidden></div>' +
    '<div class="diagramm-hover-box"></div>';
  document.body.appendChild(overlay);
  return overlay;
}

function hide() {
  if (overlay) overlay.hidden = true;
}

// Wertebereich exakt wie charts.mjs: 0 immer einschliessen, Szenario- und
// Basis-Serie beruecksichtigen. So sitzen die Snap-Punkte auf den Linien.
function grenzen(punkte) {
  let min = 0;
  let max = 0;
  for (const p of punkte) {
    if (p.wert < min) min = p.wert;
    if (p.wert > max) max = p.wert;
    if (p.basis != null) {
      if (p.basis < min) min = p.basis;
      if (p.basis > max) max = p.basis;
    }
  }
  if (min === max) max = min + 1;
  return { min, max };
}

export function bindDiagrammHover(root) {
  root.addEventListener("pointermove", (event) => {
    const svg = event.target.closest?.("svg.linien-diagramm");
    if (!svg || !svg.dataset.punkte || !svg.dataset.plot) {
      hide();
      return;
    }
    let punkte;
    let plot;
    try {
      punkte = JSON.parse(svg.dataset.punkte);
      plot = JSON.parse(svg.dataset.plot);
    } catch {
      hide();
      return;
    }
    if (!Array.isArray(punkte) || punkte.length === 0) {
      hide();
      return;
    }

    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      hide();
      return;
    }
    const vbW = svg.viewBox.baseVal.width || rect.width;
    const vbH = svg.viewBox.baseVal.height || rect.height;
    const sx = rect.width / vbW;
    const sy = rect.height / vbH;

    const vbX = (event.clientX - rect.left) / sx; // in viewBox-Koordinaten
    if (vbX < plot.left - 6 || vbX > plot.right + 6) {
      hide();
      return;
    }

    let nah = punkte[0];
    for (const p of punkte) {
      if (Math.abs(p.x - vbX) < Math.abs(nah.x - vbX)) nah = p;
    }

    const { min, max } = grenzen(punkte);
    const yVon = (wert) => plot.top + (1 - (wert - min) / (max - min)) * (plot.bottom - plot.top);

    const el = ensureOverlay();
    el.hidden = false;

    const clientX = rect.left + nah.x * sx + window.scrollX;
    const topPx = rect.top + plot.top * sy + window.scrollY;
    const hoehePx = (plot.bottom - plot.top) * sy;

    const linie = el.querySelector(".diagramm-hover-linie");
    linie.style.left = `${clientX}px`;
    linie.style.top = `${topPx}px`;
    linie.style.height = `${hoehePx}px`;

    const punktS = el.querySelector(".diagramm-hover-punkt.szenario");
    punktS.style.left = `${clientX}px`;
    punktS.style.top = `${rect.top + yVon(nah.wert) * sy + window.scrollY}px`;
    punktS.hidden = false;

    const punktB = el.querySelector(".diagramm-hover-punkt.basis");
    if (nah.basis != null) {
      punktB.style.left = `${clientX}px`;
      punktB.style.top = `${rect.top + yVon(nah.basis) * sy + window.scrollY}px`;
      punktB.hidden = false;
    } else {
      punktB.hidden = true;
    }

    const box = el.querySelector(".diagramm-hover-box");
    const zeilen = [];
    if (nah.monat) zeilen.push(`<div class="diagramm-hover-monat">${formatMonth(nah.monat)}</div>`);
    zeilen.push(`<div><span class="diagramm-hover-swatch szenario"></span>${formatMoney(nah.wert)}</div>`);
    if (nah.basis != null) {
      zeilen.push(`<div><span class="diagramm-hover-swatch basis"></span>${formatMoney(nah.basis)}</div>`);
    }
    box.innerHTML = zeilen.join("");
    box.style.left = `${clientX}px`;
    box.style.top = `${topPx}px`;
  });

  root.addEventListener("pointerleave", hide);
}

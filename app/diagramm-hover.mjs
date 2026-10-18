// app/diagramm-hover.mjs
// Delegierter Hover fuer die SVG-Liniendiagramme (charts.mjs, Zeit-Modus).
// charts.mjs bleibt reine Geometrie und bettet data-punkte / data-plot am
// Wurzel-<svg> ein; hier lebt ausschliesslich das DOM-Verhalten (ADR 0022).
// Der Overlay liegt in document.body, weil render() den #app-Inhalt komplett
// ersetzt und dort platzierte Knoten sonst weggewischt wuerden.
import { punktBeiX } from "./charts.mjs";
import { formatDate, formatMoney, formatMonth } from "./komponenten.mjs";

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
  for (const li of document.querySelectorAll(".termine-liste li.aktiv")) li.classList.remove("aktiv");
  donutZuruecksetzen();
}

// Donuts (charts.mjs donutDiagramm): das Segment unter dem Zeiger rueckt entlang
// seiner Mittelachse heraus (data-dx/dy, Uebergang per CSS), die Box zeigt
// Bezeichnung, Betrag und Anteil, und in der Liste derselben Kachel wird die
// Zeile mit derselben Farbe hervorgehoben. Gesetzt wird ueber CSSOM, das die
// CSP der App erlaubt (anders als style-Attribute im Markup).
let donutAktiv = null;

function donutZuruecksetzen() {
  if (!donutAktiv) return;
  donutAktiv.classList.remove("aktiv");
  donutAktiv.style.transform = "";
  for (const li of document.querySelectorAll(".vorsorge-kopf-liste li.aktiv")) li.classList.remove("aktiv");
  donutAktiv = null;
}

function zeigeDonut(segment, event) {
  if (donutAktiv !== segment) {
    donutZuruecksetzen();
    donutAktiv = segment;
    segment.classList.add("aktiv");
    segment.style.transform = `translate(${Number(segment.dataset.dx) || 0}px, ${Number(segment.dataset.dy) || 0}px)`;
    const farben = [...segment.classList].filter((k) => k !== "donut-segment" && k !== "aktiv");
    const kachel = segment.closest("section");
    if (kachel && farben.length) {
      for (const li of kachel.querySelectorAll(".vorsorge-kopf-liste li")) {
        const punkt = li.querySelector(".farbpunkt");
        if (punkt && farben.every((k) => punkt.classList.contains(k))) li.classList.add("aktiv");
      }
    }
  }
  const el = ensureOverlay();
  el.hidden = false;
  el.querySelector(".diagramm-hover-linie").style.height = "0";
  for (const punkt of el.querySelectorAll(".diagramm-hover-punkt")) punkt.hidden = true;
  const box = el.querySelector(".diagramm-hover-box");
  box.classList.add("seitlich");
  box.innerHTML = `<div>${escapeHtml(segment.dataset.titel)}</div>`;
  box.style.left = `${event.clientX + window.scrollX}px`;
  box.style.top = `${event.clientY + window.scrollY}px`;
}

// Wertebereich exakt wie charts.mjs: liefert das Diagramm ihn mit (gerundete
// Achse, saldoDiagramm), gilt der; sonst 0 einschliessen, Szenario- und
// Basis-Serie beruecksichtigen. So sitzen die Snap-Punkte auf den Linien.
function grenzen(punkte, plot) {
  if (typeof plot.min === "number" && typeof plot.max === "number" && plot.max > plot.min) return { min: plot.min, max: plot.max };
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

// Saeulen- und Verlaufsdiagramme der Vermoegensseite (charts.mjs, data-spalten):
// je Spalte ein fertiger Titel und formatierte Zeilen; der Zeiger rastet auf die
// naechste Spalte ein.
function zeigeSpalte(svg, event) {
  let spalten;
  let plot;
  try {
    spalten = JSON.parse(svg.dataset.spalten);
    plot = JSON.parse(svg.dataset.plot);
  } catch {
    hide();
    return;
  }
  const rect = svg.getBoundingClientRect();
  if (!Array.isArray(spalten) || !spalten.length || !rect.width) {
    hide();
    return;
  }
  // viewBox mit "meet": gleichmaessig skaliert und zentriert, falls das SVG breiter ist als sein Inhalt.
  const vb = svg.viewBox.baseVal;
  const skala = Math.min(rect.width / vb.width, rect.height / vb.height);
  const versatzX = (rect.width - vb.width * skala) / 2;
  const versatzY = (rect.height - vb.height * skala) / 2;
  const vbX = (event.clientX - rect.left - versatzX) / skala;
  if (vbX < plot.left - 6 || vbX > plot.right + 6) {
    hide();
    return;
  }
  let nah = spalten[0];
  for (const s of spalten) if (Math.abs(s.x - vbX) < Math.abs(nah.x - vbX)) nah = s;

  const el = ensureOverlay();
  el.hidden = false;
  const clientX = rect.left + versatzX + nah.x * skala + window.scrollX;
  const topPx = rect.top + versatzY + plot.top * skala + window.scrollY;
  const linie = el.querySelector(".diagramm-hover-linie");
  linie.style.left = `${clientX}px`;
  linie.style.top = `${topPx}px`;
  linie.style.height = `${(plot.bottom - plot.top) * skala}px`;
  for (const punkt of el.querySelectorAll(".diagramm-hover-punkt")) punkt.hidden = true;

  const box = el.querySelector(".diagramm-hover-box");
  box.innerHTML = `<div class="diagramm-hover-monat">${escapeHtml(nah.titel)}</div>`
    + nah.zeilen.map((z) => `<div class="diagramm-hover-zeile"><span class="diagramm-hover-swatch ${escapeHtml(z.klasse)}"></span><span>${escapeHtml(z.label)}</span><strong>${escapeHtml(z.wert)}</strong></div>`).join("");
  box.style.left = `${clientX}px`;
  box.style.top = `${topPx}px`;
}

// Terminleiste der Uebersicht (charts.mjs, data-termine): die Linie folgt dem
// Zeiger frei, die Box zeigt das Datum unter dem Zeiger und die Termine in der
// Naehe. Die Listen darunter markieren dieselben Termine und scrollen mit.
const TERMIN_NAEHE = 16; // viewBox-Einheiten, gut fuenf Tage

const isoPlusTage = (iso, tage) => new Date(Date.parse(`${iso}T00:00:00Z`) + Math.round(tage) * 86400000).toISOString().slice(0, 10);
const tageZwischen = (von, bis) => (Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / 86400000;

function zeigeTermine(svg, event) {
  let termine;
  let plot;
  try {
    termine = JSON.parse(svg.dataset.termine);
    plot = JSON.parse(svg.dataset.plot);
  } catch {
    hide();
    return;
  }
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  if (!Array.isArray(termine) || !rect.width || !vb.width) {
    hide();
    return;
  }
  const skala = Math.min(rect.width / vb.width, rect.height / vb.height);
  const versatzX = (rect.width - vb.width * skala) / 2;
  const versatzY = (rect.height - vb.height * skala) / 2;
  const vbX = (event.clientX - rect.left - versatzX) / skala;
  if (vbX < plot.left - 6 || vbX > plot.right + 6) {
    hide();
    return;
  }
  const fadenX = Math.min(plot.right, Math.max(plot.left, vbX));
  const tageProEinheit = tageZwischen(plot.von, plot.bis) / (plot.right - plot.left);
  const datum = isoPlusTage(plot.von, (fadenX - plot.left) * tageProEinheit);
  const nah = termine.filter((t) => Math.abs(t.x - fadenX) <= TERMIN_NAEHE);

  const el = ensureOverlay();
  el.hidden = false;
  const clientX = rect.left + versatzX + fadenX * skala + window.scrollX;
  const topPx = rect.top + versatzY + plot.top * skala + window.scrollY;
  const linie = el.querySelector(".diagramm-hover-linie");
  linie.style.left = `${clientX}px`;
  linie.style.top = `${topPx}px`;
  linie.style.height = `${(plot.bottom - plot.top) * skala}px`;
  for (const punkt of el.querySelectorAll(".diagramm-hover-punkt")) punkt.hidden = true;

  const box = el.querySelector(".diagramm-hover-box");
  box.innerHTML = `<div class="diagramm-hover-monat">${escapeHtml(formatDate(datum))}</div>`
    + nah.map((t) => `<div class="diagramm-hover-termin"><span class="diagramm-hover-swatch ${escapeHtml(t.klasse)}"></span><span class="muted">${escapeHtml(formatDate(t.datum))}</span><span>${escapeHtml(t.label)}</span></div>`).join("");
  box.style.left = `${clientX}px`;
  box.style.top = `${topPx}px`;

  // Listen: Termine im Fenster markieren, den ersten ab dem Fenster nach oben scrollen.
  // Ueberfaellige Fristen sitzen am linken Rand, zaehlen also als `von`.
  const fensterVon = isoPlusTage(datum, -TERMIN_NAEHE * tageProEinheit);
  const fensterBis = isoPlusTage(datum, TERMIN_NAEHE * tageProEinheit);
  const kachel = svg.closest("section") ?? document;
  for (const liste of kachel.querySelectorAll(".termine-liste")) {
    let ziel = null;
    for (const li of liste.children) {
      const d = li.dataset.datum < plot.von ? plot.von : li.dataset.datum;
      li.classList.toggle("aktiv", d >= fensterVon && d <= fensterBis);
      if (!ziel && d >= fensterVon) ziel = li;
    }
    ziel ??= liste.lastElementChild;
    if (ziel && liste.dataset.hoverZiel !== ziel.dataset.datum) {
      liste.dataset.hoverZiel = ziel.dataset.datum;
      liste.scrollTo({ top: ziel.offsetTop, behavior: "smooth" });
    }
  }
}

// Terminlisten zeigen hoechstens sechs Eintraege, der Rest scrollt. Die Hoehe
// wird gemessen, weil Eintraege je nach Breite ein- oder zweizeilig sind.
const TERMIN_ZEILEN = 6;

export function termineListenBegrenzen(root) {
  for (const liste of root.querySelectorAll(".termine-liste")) {
    const letzte = liste.children[TERMIN_ZEILEN - 1];
    liste.style.maxHeight = liste.children.length > TERMIN_ZEILEN ? `${letzte.offsetTop + letzte.offsetHeight}px` : "";
  }
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function bindDiagrammHover(root) {
  root.addEventListener("pointermove", (event) => {
    const segment = event.target.closest?.(".donut-segment[data-titel]");
    // Beim Donut steht die Box links neben dem Zeiger (zeigeDonut), sonst verdeckt
    // sie den Ring; alle anderen Diagramme zeigen sie wieder darueber.
    if (!segment) overlay?.querySelector(".diagramm-hover-box")?.classList.remove("seitlich");
    if (segment) {
      zeigeDonut(segment, event);
      return;
    }
    const terminSvg = event.target.closest?.("svg[data-termine]");
    if (terminSvg) {
      zeigeTermine(terminSvg, event);
      return;
    }
    const spaltenSvg = event.target.closest?.("svg[data-spalten]");
    if (spaltenSvg) {
      zeigeSpalte(spaltenSvg, event);
      return;
    }
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

    const nah = punktBeiX(punkte, vbX, plot.stufe === true);
    const { min, max } = grenzen(punkte, plot);
    const yVon = (wert) => plot.top + (1 - (wert - min) / (max - min)) * (plot.bottom - plot.top);

    const el = ensureOverlay();
    el.hidden = false;

    // Stufen: Fadenkreuz folgt dem Zeiger (der Saldo gilt bis zum naechsten Punkt), sonst Snap auf den Punkt.
    const fadenX = plot.stufe === true ? Math.min(plot.right, Math.max(plot.left, vbX)) : nah.x;
    const clientX = rect.left + fadenX * sx + window.scrollX;
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
    if (nah.datum) zeilen.push(`<div class="diagramm-hover-monat">${formatDate(nah.datum)}</div>`);
    else if (nah.monat) zeilen.push(`<div class="diagramm-hover-monat">${formatMonth(nah.monat)}</div>`);
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

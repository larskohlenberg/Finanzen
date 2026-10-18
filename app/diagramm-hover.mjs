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
  anteilZuruecksetzen();
}

// Anteile (Donut aus charts.mjs donutDiagramm, gestapelter Balken aus
// vermoegen-teile.mjs balkenSvg): Unter dem Zeiger hebt sich der Abschnitt ab,
// die uebrigen treten zurueck, die Box zeigt Bezeichnung und Betrag, und in
// derselben Kachel wird die zugehoerige Legendenzeile hervorgehoben. Umgekehrt
// hebt eine Legendenzeile ihren Abschnitt hervor. Der Donut-Abschnitt rueckt
// entlang seiner Mittelachse heraus (data-dx/dy), der Balken streckt sich (CSS).
// Gesetzt wird ueber CSSOM, das die CSP der App erlaubt (anders als style-Attribute).
const ANTEIL = ".donut-segment[data-titel], .balken-segment[data-titel]";
const LEGENDE = "li, .vermoegen-legende > span";
const FARB_NEBEN = new Set(["donut-segment", "balken-segment", "aktiv", "farbpunkt"]);
let anteilAktiv = null;

const farbKlassen = (el) => [...el.classList].filter((k) => !FARB_NEBEN.has(k));

// Welche Legendenzeilen gehoeren zu einem Abschnitt? Die Farbe entscheidet;
// teilen sich mehrere Zeilen die Farbe (etwa Immobilien), zusaetzlich der Name.
// kandidaten: [{ farben, name }], Rueckgabe: Indizes.
export function passendeLegende(farben, label, kandidaten) {
  if (!farben.length) return [];
  const gleich = kandidaten.map((k, i) => (farben.every((f) => k.farben.includes(f)) ? i : -1)).filter((i) => i >= 0);
  if (gleich.length < 2) return gleich;
  const name = gleich.filter((i) => kandidaten[i].name === label || kandidaten[i].name.startsWith(`${label} `));
  return name.length ? name : gleich;
}

function legendenKandidaten(kachel) {
  return [...kachel.querySelectorAll(LEGENDE)]
    .map((zeile) => ({ zeile, punkt: [...zeile.children].find((c) => c.tagName === "I") ?? zeile.querySelector(":scope > details > summary > i") }))
    .filter((k) => k.punkt)
    .map(({ zeile, punkt }) => {
      const name = zeile.querySelector(":scope > .linkish, :scope > details > summary > span, :scope > span:not(.amount)")?.textContent ?? zeile.textContent;
      return { zeile, farben: [...punkt.classList], name: name.trim() };
    });
}

function anteilZuruecksetzen() {
  if (!anteilAktiv) return;
  anteilAktiv.classList.remove("aktiv");
  anteilAktiv.style.transform = "";
  anteilAktiv.ownerSVGElement?.classList.remove("hat-aktiv");
  for (const el of document.querySelectorAll(".legende-aktiv")) el.classList.remove("legende-aktiv");
  anteilAktiv = null;
}

function anteilHervorheben(segment) {
  if (anteilAktiv === segment) return;
  anteilZuruecksetzen();
  anteilAktiv = segment;
  segment.classList.add("aktiv");
  segment.ownerSVGElement?.classList.add("hat-aktiv");
  if (segment.classList.contains("donut-segment")) {
    segment.style.transform = `translate(${Number(segment.dataset.dx) || 0}px, ${Number(segment.dataset.dy) || 0}px)`;
  }
  const kachel = segment.closest("section");
  if (!kachel) return;
  const kandidaten = legendenKandidaten(kachel);
  for (const i of passendeLegende(farbKlassen(segment), segment.dataset.label ?? "", kandidaten)) kandidaten[i].zeile.classList.add("legende-aktiv");
}

function zeigeAnteil(segment, event) {
  anteilHervorheben(segment);
  const el = ensureOverlay();
  el.hidden = false;
  el.querySelector(".diagramm-hover-linie").style.height = "0";
  for (const punkt of el.querySelectorAll(".diagramm-hover-punkt")) punkt.hidden = true;
  const box = el.querySelector(".diagramm-hover-box");
  // Donut: Box links neben dem Zeiger, sonst verdeckt sie den Ring. Balken: Box
  // mittig ueber dem Zeiger, sonst verdeckt sie den Balken.
  box.classList.toggle("seitlich", segment.classList.contains("donut-segment"));
  box.innerHTML = `<div>${escapeHtml(segment.dataset.titel)}</div>`;
  box.style.left = `${event.clientX + window.scrollX}px`;
  box.style.top = `${event.clientY + window.scrollY}px`;
  boxEinpassen(box);
}

// Zeiger auf einer Legendenzeile: zugehoerigen Abschnitt in derselben Kachel
// hervorheben (ohne Box, die Zeile nennt Name und Betrag schon). true = gefunden.
function legendeHervorheben(zeile) {
  const kachel = zeile.closest("section");
  const segmente = kachel ? [...kachel.querySelectorAll(ANTEIL)] : [];
  if (!segmente.length) return false;
  const kandidaten = legendenKandidaten(kachel);
  if (!kandidaten.some((k) => k.zeile === zeile)) return false;
  const treffer = segmente.find((s) => passendeLegende(farbKlassen(s), s.dataset.label ?? "", kandidaten).some((i) => kandidaten[i].zeile === zeile));
  if (!treffer) return false;
  anteilHervorheben(treffer);
  if (overlay) overlay.hidden = true;
  return true;
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
  boxEinpassen(box);
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
  boxEinpassen(box);

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

// Versatz in px, damit ein Element mit diesen Kanten im Fenster bleibt
// (Abstand `rand` zum Rand); 0, wenn es schon passt. Passt es gar nicht,
// gewinnt die linke Kante.
export function einpassVersatz(links, rechts, fensterBreite, rand = 8) {
  if (links < rand) return rand - links;
  if (rechts > fensterBreite - rand) return Math.max(rand - links, fensterBreite - rand - rechts);
  return 0;
}

// Hover-Box nach dem Positionieren ins Fenster ruecken, sonst waechst die
// Seite am rechten Rand und bekommt einen horizontalen Scrollbalken.
function boxEinpassen(box) {
  const r = box.getBoundingClientRect();
  const dx = einpassVersatz(r.left, r.right, document.documentElement.clientWidth);
  if (dx) box.style.left = `${parseFloat(box.style.left) + dx}px`;
}

// Erklaertexte (komponenten.mjs infoTipp) nach dem Oeffnen ins Fenster ruecken.
function infoTippEinpassen(event) {
  const text = event.target.closest?.(".info-tipp")?.querySelector(".info-tipp-text");
  if (!text) return;
  text.style.left = "";
  requestAnimationFrame(() => {
    const r = text.getBoundingClientRect();
    if (!r.width) return;
    const dx = einpassVersatz(r.left, r.right, document.documentElement.clientWidth);
    if (dx) text.style.left = `${parseFloat(getComputedStyle(text).left) + dx}px`;
  });
}

export function bindDiagrammHover(root) {
  root.addEventListener("pointerover", infoTippEinpassen);
  root.addEventListener("focusin", infoTippEinpassen);
  root.addEventListener("pointermove", (event) => {
    const segment = event.target.closest?.(ANTEIL);
    // Beim Donut steht die Box neben dem Zeiger (zeigeAnteil); alle anderen
    // Diagramme zeigen sie darueber.
    if (!segment) overlay?.querySelector(".diagramm-hover-box")?.classList.remove("seitlich");
    if (segment) {
      zeigeAnteil(segment, event);
      return;
    }
    const legende = event.target.closest?.(LEGENDE);
    if (legende && legendeHervorheben(legende)) return;
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
    boxEinpassen(box);
  });

  root.addEventListener("pointerleave", hide);
}

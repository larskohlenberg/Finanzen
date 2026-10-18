// app/charts.mjs
// Reine SVG-Liniendiagramm-Komponente: keine Library, kein DOM. Theming ueber
// CSS-Variablen (Light/Dark). Eingabe sind Punkte mit numerischem `wert`; die
// Beschriftung formatiert der Aufrufer (formatWert). Getestet ueber die erzeugte
// Geometrie. Beantwortet "wann kippt es?" — daher immer mit Nulllinie im Blick.

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// punkte: [{ wert: number, label?: string, monat?: "YYYY-MM" }]
// vergleich (optional): zweite Serie gleicher Länge — gestrichelt (Basis vs. Szenario).
//
// Zeit-Modus: sobald die Punkte ein `monat` tragen ODER `formatMonat` gesetzt ist,
// werden echte Achsen (X = Zeit, Y = Wert), eine Legende (bei vergleich) und
// Hover-Daten (data-punkte / data-plot am Wurzel-<svg>) gezeichnet. Ohne diese
// Inputs bleibt das alte, kompakte Verhalten erhalten (Rückwärtskompatibilität).
export function linienDiagramm(punkte, options = {}) {
  // Unter zwei Punkten gibt es keine Linie — der Aufrufer zeigt Tabelle/Leerhinweis.
  if (!Array.isArray(punkte) || punkte.length < 2) return "";

  const hatMonat = punkte.some((p) => typeof p?.monat === "string" && p.monat);
  const zeitModus = hatMonat || typeof options.formatMonat === "function";

  const {
    width = 640,
    height = zeitModus ? 240 : 180,
    padLeft = zeitModus ? 14 : 10,
    padRight = 10,
    padTop = zeitModus ? 34 : 14,
    padBottom = zeitModus ? 44 : 24,
    formatWert = (n) => String(n),
    formatMonat = (m) => String(m ?? ""),
    ariaLabel = "",
    vergleich = null,
    szenarioLabel = "Szenario",
    basisLabel = "Basis",
  } = options;

  const vergleichWerte = Array.isArray(vergleich) && vergleich.length === punkte.length ? vergleich.map((p) => p.wert) : null;
  const werte = punkte.map((p) => p.wert);
  // Nulllinie immer in den Wertebereich aufnehmen: so ist der Abstand zur 0
  // (und ein Vorzeichenwechsel) sichtbar — der eigentliche Zweck der Kurve.
  let minW = Math.min(0, ...werte, ...(vergleichWerte ?? []));
  let maxW = Math.max(0, ...werte, ...(vergleichWerte ?? []));
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

  // Nulllinie: im Zeit-Modus schon zeichnen, sobald 0 im Wertebereich liegt (nicht
  // erst beim Kreuzen) — die 0 ist die entscheidende Referenz. Im Alt-Modus bleibt
  // es beim reinen Vorzeichenwechsel, damit rein positive Serien unverändert bleiben.
  const nullImBereich = minW <= 0 && maxW >= 0;
  const kreuztNull = Math.min(...werte) < 0 && Math.max(...werte) > 0;
  const nullSichtbar = zeitModus ? nullImBereich : kreuztNull;
  const nulllinie = nullSichtbar
    ? `<line x1="${padLeft}" y1="${y(0).toFixed(2)}" x2="${(padLeft + innerW).toFixed(2)}" y2="${y(0).toFixed(2)}" class="diagramm-nulllinie" />`
    : "";

  // Tiefpunkt markieren — "wann kippt es" sitzt hier.
  const minWert = Math.min(...werte);
  const minIndex = werte.indexOf(minWert);
  const tiefpunkt = `<circle cx="${x(minIndex).toFixed(2)}" cy="${y(minWert).toFixed(2)}" r="3" class="diagramm-tiefpunkt ${minWert < 0 ? "negativ" : ""}" />`;

  const vergleichLinie = vergleichWerte
    ? `<polyline points="${vergleichWerte.map((w, i) => `${x(i).toFixed(2)},${y(w).toFixed(2)}`).join(" ")}" class="diagramm-linie-vergleich" fill="none" vector-effect="non-scaling-stroke" />`
    : "";

  // --- Zeit-Modus: echte Achsen, Legende, Hover-Daten -----------------------
  if (zeitModus) {
    const monatVon = (i) => (typeof punkte[i]?.monat === "string" ? punkte[i].monat : null);

    // X-Achse: Grundlinie + Tick-Labels. Erster und letzter Punkt immer, dazu
    // Quartalsanfänge (-01/-04/-07/-10). Überlappung vermeiden: Tick nur setzen,
    // wenn genug Pixel-Abstand zum zuletzt gesetzten Label bleibt.
    const xAchsenLinie = `<line x1="${padLeft}" y1="${baseY.toFixed(2)}" x2="${(padLeft + innerW).toFixed(2)}" y2="${baseY.toFixed(2)}" class="diagramm-achse" />`;

    const letzterI = punkte.length - 1;
    const kandidaten = new Set([0, letzterI]);
    for (let i = 0; i < punkte.length; i++) {
      const m = monatVon(i);
      if (m && /-(01|04|07|10)$/.test(m)) kandidaten.add(i);
    }
    // Nach X-Position sortieren, damit Überlappungsprüfung von links nach rechts läuft.
    const sortiert = [...kandidaten].sort((a, b) => a - b);
    // Achsen-/Legendenschrift in USER-UNITS (font-size-Attribut, kein CSS-px): sie
    // skaliert mit dem SVG, damit die Abstandsrechnung breitenunabhaengig stimmt.
    const achseFont = 13;
    const charBreite = achseFont * 0.62; // grobe Zeichenbreite in User-Units
    // Freihaltung aus der tatsaechlichen Labelbreite: Endpunkte tragen den vollen
    // Monatsnamen ("Dezember 2048") und ragen ins Diagramm, Quartalsmarken sind kompakt.
    const minAbstand = 6 * charBreite;
    const startAbstand = (formatMonat(monatVon(0)) || "").length * charBreite + 8;
    const endAbstand = (formatMonat(monatVon(letzterI)) || "").length * charBreite + 8;
    const pflicht = new Set([0, letzterI]);
    const gesetzt = [0, letzterI];
    for (const i of sortiert) {
      if (pflicht.has(i)) continue;
      const px = x(i);
      const zuNahStart = px - x(0) < startAbstand;
      const zuNahEnde = x(letzterI) - px < endAbstand;
      const zuNahMitte = gesetzt.some((gi) => !pflicht.has(gi) && Math.abs(x(gi) - px) < minAbstand);
      if (!zuNahStart && !zuNahEnde && !zuNahMitte) gesetzt.push(i);
    }
    gesetzt.sort((a, b) => a - b);
    // Endpunkte lesbar (formatMonat), Quartals-Zwischenmarken kompakt ("Q3 27"),
    // sonst ueberlappen volle Monatsnamen ueber lange Horizonte zu Brei.
    const quartalKurz = (m) => {
      if (!m) return "";
      const [y, mm] = m.split("-");
      return `Q${Math.ceil(Number(mm) / 3)} ${y.slice(2)}`;
    };
    const xLabels = gesetzt
      .map((i) => {
        const anchor = i === 0 ? "start" : i === letzterI ? "end" : "middle";
        const label = i === 0 || i === letzterI ? formatMonat(monatVon(i)) : quartalKurz(monatVon(i));
        return `<text x="${x(i).toFixed(2)}" y="${(baseY + 16).toFixed(2)}" text-anchor="${anchor}" font-size="${achseFont}" class="diagramm-achse-label">${esc(label)}</text>`;
      })
      .join("");

    // Y-Achse: max oben, min unten, 0 dort wo sie liegt. Labels linksbündig INNERHALB
    // der Plotflaeche, knapp an der jeweiligen Linie — so ragt eine breite Zahl
    // ("594.493,00 €") nie ueber den linken Rahmen (SVG skaliert, Schrift ist px-fix).
    const yLabelX = (padLeft + 4).toFixed(2);
    const yTicks = [
      { w: maxW, cls: "diagramm-achse-label" },
      { w: minW, cls: "diagramm-achse-label" },
    ];
    if (nullImBereich && minW !== 0 && maxW !== 0) yTicks.push({ w: 0, cls: "diagramm-achse-label" });
    const yLabels = yTicks
      .map(({ w, cls }) => {
        const yy = y(w);
        const dy = w === maxW ? 13 : -6; // max: unter die Oberkante; min/0: ueber die Linie
        return `<text x="${yLabelX}" y="${(yy + dy).toFixed(2)}" text-anchor="start" font-size="${achseFont}" class="${cls}">${esc(formatWert(w))}</text>`;
      })
      .join("");

    // Tiefpunkt-Label: Monat + Wert, unterhalb der X-Achse mittig (aber nicht an den Rändern doppeln).
    const tiefMonat = monatVon(minIndex);
    const tiefText = tiefMonat != null ? `${formatMonat(tiefMonat)}: ${formatWert(minWert)}` : formatWert(minWert);
    const labelTief = minIndex > 0 && minIndex < letzterI
      ? `<text x="${x(minIndex).toFixed(2)}" y="${(baseY + 30).toFixed(2)}" text-anchor="middle" class="diagramm-label ${minWert < 0 ? "negativ" : ""}">${esc(tiefText)}</text>`
      : "";

    // Legende nur bei vergleich: durchgezogen = Szenario, gestrichelt = Basis.
    const legende = vergleichWerte
      ? (() => {
          const ly = (12).toFixed(2); // eigenes Oberband, klar ueber dem Y-Maxwert
          const x1 = (padLeft).toFixed(2);
          const x2 = (padLeft + 130).toFixed(2);
          return `<g class="diagramm-legende">` +
            `<line x1="${x1}" y1="${ly}" x2="${(padLeft + 16).toFixed(2)}" y2="${ly}" class="diagramm-linie" vector-effect="non-scaling-stroke" />` +
            `<text x="${(padLeft + 20).toFixed(2)}" y="${(Number(ly) + 4).toFixed(2)}" font-size="${achseFont}" class="diagramm-achse-label">${esc(szenarioLabel)}</text>` +
            `<line x1="${x2}" y1="${ly}" x2="${(padLeft + 146).toFixed(2)}" y2="${ly}" class="diagramm-linie-vergleich" vector-effect="non-scaling-stroke" />` +
            `<text x="${(padLeft + 150).toFixed(2)}" y="${(Number(ly) + 4).toFixed(2)}" font-size="${achseFont}" class="diagramm-achse-label">${esc(basisLabel)}</text>` +
            `</g>`;
        })()
      : "";

    // Hover-Daten für separaten delegierten Handler (nur Daten, kein Verhalten).
    const dataPunkte = punkte.map((p, i) => ({
      i,
      x: Math.round(x(i)),
      monat: monatVon(i),
      wert: p.wert,
      basis: vergleichWerte ? vergleichWerte[i] : null,
    }));
    const dataPlot = {
      left: Math.round(padLeft),
      right: Math.round(padLeft + innerW),
      top: Math.round(padTop),
      bottom: Math.round(baseY),
    };
    // JSON in doppelt-quotierten Attributen; esc() macht " -> &quot; und & -> &amp;
    // (konsistent mit den übrigen Attributen dieser Komponente).
    const hoverAttrs = `data-punkte="${esc(JSON.stringify(dataPunkte))}" data-plot="${esc(JSON.stringify(dataPlot))}"`;

    return `<svg class="linien-diagramm linien-diagramm-zeit" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(ariaLabel)}" ${hoverAttrs}>
    <path d="${areaPath}" class="diagramm-flaeche" />
    ${nulllinie}
    ${vergleichLinie}
    <polyline points="${linePoints}" class="diagramm-linie" fill="none" vector-effect="non-scaling-stroke" />
    ${tiefpunkt}
    ${xAchsenLinie}
    ${xLabels}
    ${yLabels}
    ${labelTief}
    ${legende}
  </svg>`;
  }

  // --- Alt-Modus: kompakt, mit Start-/Endwert-Labels in den Ecken ------------
  const erster = punkte[0].wert;
  const letzter = punkte[punkte.length - 1].wert;
  const labelLinks = `<text x="${padLeft}" y="${(padTop - 4).toFixed(2)}" class="diagramm-label">${esc(formatWert(erster))}</text>`;
  const labelRechts = `<text x="${(padLeft + innerW).toFixed(2)}" y="${(padTop - 4).toFixed(2)}" text-anchor="end" class="diagramm-label">${esc(formatWert(letzter))}</text>`;
  const labelTief = minIndex > 0 && minIndex < punkte.length - 1
    ? `<text x="${x(minIndex).toFixed(2)}" y="${(baseY + 16).toFixed(2)}" text-anchor="middle" class="diagramm-label ${minWert < 0 ? "negativ" : ""}">${esc(formatWert(minWert))}</text>`
    : "";

  return `<svg class="linien-diagramm" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(ariaLabel)}">
    <path d="${areaPath}" class="diagramm-flaeche" />
    ${nulllinie}
    ${vergleichLinie}
    <polyline points="${linePoints}" class="diagramm-linie" fill="none" vector-effect="non-scaling-stroke" />
    ${tiefpunkt}
    ${labelLinks}${labelRechts}${labelTief}
  </svg>`;
}

// --- Balken fuer die Vermoegensseite -------------------------------------------
// Gemeinsam: feste viewBox, Theming ueber CSS-Klassen, Werte in Cent. Y-Achse
// mit gerundeten Ticks, Gitter und Achsentitel; der linke Rand richtet sich
// nach der breitesten Beschriftung, damit nichts aus dem Bild ragt. Hover-Daten
// (data-spalten / data-plot) liest diagramm-hover.mjs: je Spalte ein Titel und
// fertig formatierte Zeilen.

const BREITE = 960;
const SCHRIFT = 13;
const runde = (n) => n.toFixed(2);

function achsenText(x, y, text, anchor = "middle") {
  return `<text x="${runde(x)}" y="${runde(y)}" text-anchor="${anchor}" font-size="${SCHRIFT}" class="diagramm-achse-label">${esc(text)}</text>`;
}

// Linker Rand aus der laengsten Y-Beschriftung, plus Platz fuer den gedrehten Achsentitel.
function linkerRand(texte, mitTitel) {
  return Math.ceil(Math.max(...texte.map((s) => s.length)) * SCHRIFT * 0.6) + 12 + (mitTitel ? 20 : 0);
}

function yAchse({ ticks, y, links, rechts, titel, oben, unten }) {
  const teile = ticks.map((w) => `<line x1="${links}" x2="${BREITE - rechts}" y1="${runde(y(w))}" y2="${runde(y(w))}" class="${w === 0 ? "diagramm-achse" : "diagramm-gitter"}" />`);
  if (titel) {
    const mitte = (oben + unten) / 2;
    teile.push(`<text x="14" y="${runde(mitte)}" transform="rotate(-90 14 ${runde(mitte)})" text-anchor="middle" font-size="${SCHRIFT}" class="diagramm-achse-titel">${esc(titel)}</text>`);
  }
  return teile;
}

function hoverAttrs(spalten, plot) {
  return `data-spalten="${esc(JSON.stringify(spalten))}" data-plot="${esc(JSON.stringify(plot))}"`;
}

// Ein- und Ausgaben je Monat: Einnahmen nach oben, Ausgaben nach unten, der
// Saldo als Linie mit Punkten. Leer (alle 0) -> "".
export function monatsBalken({ monate, einnahmen, ausgaben, saldo, formatWert = String, formatAchse = formatWert, formatMonat = String, formatTitel = formatMonat, labels = {}, achsenTitel = "", ariaLabel = "" }) {
  if (!monate?.length || ![...einnahmen, ...ausgaben].some((w) => w)) return "";
  const hoehe = 300;
  const rechts = 10;
  const oben = 12;
  const unten = 28;
  const max = Math.max(...einnahmen, ...saldo, 1);
  const min = Math.min(...ausgaben.map((w) => -w), ...saldo, -1);
  const achse = achsenTicks(min, max, 6);
  const yTexte = achse.ticks.map((w) => formatAchse(w));
  const links = linkerRand(yTexte, Boolean(achsenTitel));
  const y = (w) => oben + ((achse.max - w) / (achse.max - achse.min)) * (hoehe - oben - unten);
  const spalte = (BREITE - links - rechts) / monate.length;
  const mx = (i) => links + spalte * i + spalte / 2;
  const breite = Math.max(4, spalte * 0.62);
  const teile = [
    ...yAchse({ ticks: achse.ticks, y, links, rechts, titel: achsenTitel, oben, unten: hoehe - unten }),
    ...achse.ticks.map((w, i) => achsenText(links - 8, y(w) + 4, yTexte[i], "end")),
  ];
  monate.forEach((monat, i) => {
    const x = mx(i) - breite / 2;
    if (einnahmen[i]) teile.push(`<rect x="${runde(x)}" y="${runde(y(einnahmen[i]))}" width="${runde(breite)}" height="${runde(y(0) - y(einnahmen[i]))}" class="balken-einnahme" />`);
    if (ausgaben[i]) teile.push(`<rect x="${runde(x)}" y="${runde(y(0))}" width="${runde(breite)}" height="${runde(y(-ausgaben[i]) - y(0))}" class="balken-ausgabe" />`);
    if (monate.length <= 12 || i % 2 === 0) teile.push(achsenText(mx(i), hoehe - 8, formatMonat(monat)));
  });
  teile.push(`<polyline points="${saldo.map((w, i) => `${runde(mx(i))},${runde(y(w))}`).join(" ")}" class="balken-saldo" fill="none" />`);
  saldo.forEach((w, i) => teile.push(`<circle cx="${runde(mx(i))}" cy="${runde(y(w))}" r="3" class="balken-saldo-punkt" />`));
  const spalten = monate.map((monat, i) => ({
    x: Math.round(mx(i)),
    titel: formatTitel(monat),
    zeilen: [
      { klasse: "einnahme", label: labels.einnahmen ?? "Einnahmen", wert: formatWert(einnahmen[i]) },
      { klasse: "ausgabe", label: labels.ausgaben ?? "Ausgaben", wert: formatWert(-ausgaben[i]) },
      { klasse: "saldo", label: labels.saldo ?? "Saldo", wert: formatWert(saldo[i]) },
    ],
  }));
  const plot = { left: links, right: BREITE - rechts, top: oben, bottom: hoehe - unten };
  return `<svg class="balken-diagramm" viewBox="0 0 ${BREITE} ${hoehe}" role="img" aria-label="${esc(ariaLabel)}" ${hoverAttrs(spalten, plot)}>${teile.join("")}</svg>`;
}

// Zins und Tilgung je Jahr als gestapelte Saeulen; Planjahre heller.
export function jahresBalken({ jahre, formatWert = String, formatAchse = formatWert, labels = {}, achsenTitel = "", ariaLabel = "" }) {
  if (!jahre?.length) return "";
  const hoehe = 240;
  const rechts = 10;
  const oben = 10;
  const unten = 26;
  const max = Math.max(...jahre.map((j) => j.zins_cents + Math.max(0, j.tilgung_cents)), 1);
  const achse = achsenTicks(0, max, 4);
  const yTexte = achse.ticks.map((w) => formatAchse(w));
  const links = linkerRand(yTexte, Boolean(achsenTitel));
  const y = (w) => oben + ((achse.max - w) / (achse.max - achse.min)) * (hoehe - oben - unten);
  const spalte = (BREITE - links - rechts) / jahre.length;
  const breite = Math.max(3, spalte * 0.66);
  const schritt = Math.ceil(jahre.length / 16);
  const teile = [
    ...yAchse({ ticks: achse.ticks, y, links, rechts, titel: achsenTitel, oben, unten: hoehe - unten }),
    ...achse.ticks.map((w, i) => achsenText(links - 8, y(w) + 4, yTexte[i], "end")),
  ];
  jahre.forEach((j, i) => {
    const x = links + spalte * i + (spalte - breite) / 2;
    const tilgung = Math.max(0, j.tilgung_cents);
    const plan = j.ist ? "" : " plan";
    teile.push(`<rect x="${runde(x)}" y="${runde(y(tilgung))}" width="${runde(breite)}" height="${runde(y(0) - y(tilgung))}" class="balken-tilgung${plan}" />`);
    teile.push(`<rect x="${runde(x)}" y="${runde(y(tilgung + j.zins_cents))}" width="${runde(breite)}" height="${runde(y(tilgung) - y(tilgung + j.zins_cents))}" class="balken-zins${plan}" />`);
    if (i % schritt === 0) teile.push(achsenText(links + spalte * i + spalte / 2, hoehe - 8, String(j.jahr)));
  });
  const spalten = jahre.map((j, i) => ({
    x: Math.round(links + spalte * i + spalte / 2),
    titel: j.ist ? String(j.jahr) : `${j.jahr} (${labels.plan ?? "Plan"})`,
    zeilen: [
      { klasse: "tilgung", label: labels.tilgung ?? "Tilgung", wert: formatWert(Math.max(0, j.tilgung_cents)) },
      { klasse: "zins", label: labels.zins ?? "Zins", wert: formatWert(j.zins_cents) },
      { klasse: "summe", label: labels.summe ?? "Summe", wert: formatWert(Math.max(0, j.tilgung_cents) + j.zins_cents) },
    ],
  }));
  const plot = { left: links, right: BREITE - rechts, top: oben, bottom: hoehe - unten };
  return `<svg class="balken-diagramm" viewBox="0 0 ${BREITE} ${hoehe}" role="img" aria-label="${esc(ariaLabel)}" ${hoverAttrs(spalten, plot)}>${teile.join("")}</svg>`;
}

// Donut fuer Anteile am Ganzen (hoechstens sechs Teile). teile: [{ wert, klasse, label }].
// Zwischen den Segmenten bleibt ein schmaler Spalt in Flaechenfarbe; jedes Segment traegt
// einen Tooltip (title). Die Beschriftung steht daneben in der Liste des Aufrufers.
export function donutDiagramm({ teile, formatWert = String, ariaLabel = "" }) {
  const gueltig = (teile ?? []).filter((tl) => tl.wert > 0);
  const summe = gueltig.reduce((a, tl) => a + tl.wert, 0);
  if (!summe) return "";
  const r = 46;
  const innen = 29;
  const punkt = (winkel, radius) => [50 + radius * Math.sin(winkel), 50 - radius * Math.cos(winkel)].map((v) => runde(v));
  const prozent = (w) => `${Math.round((w / summe) * 100)} %`;
  let start = 0;
  // Hover (diagramm-hover.mjs): data-titel fuer die Box, data-dx/dy schieben das
  // Segment entlang seiner Mittelachse heraus. Kein <title>, sonst doppelter Tooltip.
  const segmente = gueltig.map((tl) => {
    const text = esc(`${tl.label}: ${formatWert(tl.wert)} (${prozent(tl.wert)})`);
    const hover = `data-titel="${text}" data-label="${esc(tl.label)}" aria-label="${text}"`;
    if (gueltig.length === 1) {
      return `<g class="donut-segment ${esc(tl.klasse)}" ${hover} data-dx="0" data-dy="0"><circle cx="50" cy="50" r="${runde((r + innen) / 2)}" fill="none" stroke-width="${r - innen}" class="donut-voll"></circle></g>`;
    }
    const winkel = (tl.wert / summe) * Math.PI * 2;
    const ende = start + winkel;
    const gross = winkel > Math.PI ? 1 : 0;
    const [ax, ay] = punkt(start, r);
    const [bx, by] = punkt(ende, r);
    const [cx, cy] = punkt(ende, innen);
    const [dx, dy] = punkt(start, innen);
    const mitte = start + winkel / 2;
    start = ende;
    const raus = `data-dx="${runde(6 * Math.sin(mitte))}" data-dy="${runde(-6 * Math.cos(mitte))}"`;
    return `<path d="M${ax},${ay} A${r},${r} 0 ${gross} 1 ${bx},${by} L${cx},${cy} A${innen},${innen} 0 ${gross} 0 ${dx},${dy} Z" class="donut-segment ${esc(tl.klasse)}" ${hover} ${raus}></path>`;
  });
  return `<svg class="donut-diagramm" viewBox="0 0 100 100" role="img" aria-label="${esc(ariaLabel)}">${segmente.join("")}</svg>`;
}

const tageSeit1970 = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86400000;

// Terminleiste der Uebersicht: von heute bis `bis`, je Spur eine Linie mit Markern
// (Raute oder Kreis), darunter die Monatsanfaenge. Termine vor `von` (ueberfaellig)
// sitzen am linken Rand. spuren: [{ label, form: "raute"|"kreis", marker: [{ datum, label, klasse? }] }].
export function terminLeiste({ von, bis, spuren, formatMonat = (iso) => iso.slice(5, 7), ariaLabel = "" }) {
  const sichtbar = (spuren ?? []).filter((s) => s.marker?.length);
  if (!sichtbar.length || !(bis > von)) return "";
  // Breiter viewBox, damit Schrift und Marker auf ueblichen Breiten etwa in
  // Originalgroesse erscheinen und nicht ueber die Tabellentexte wachsen.
  const breite = 1280;
  const links = 84;
  const rechts = breite - 12;
  const spurHoehe = 18;
  const oben = 6;
  const unten = oben + sichtbar.length * spurHoehe;
  const start = tageSeit1970(von);
  const spanne = tageSeit1970(bis) - start;
  const x = (iso) => links + (Math.min(Math.max(tageSeit1970(iso) - start, 0), spanne) / spanne) * (rechts - links);
  const teile = [];
  const termine = [];
  // Monatsanfaenge nach `von` als feine Gitterlinien mit Kurzlabel.
  let [jahr, monat] = von.split("-").map(Number);
  for (;;) {
    monat += 1;
    if (monat > 12) { monat = 1; jahr += 1; }
    const iso = `${jahr}-${String(monat).padStart(2, "0")}-01`;
    if (iso > bis) break;
    const mx = runde(x(iso));
    teile.push(`<line x1="${mx}" x2="${mx}" y1="${oben}" y2="${unten}" class="terminleiste-gitter" />`);
    teile.push(`<text x="${mx}" y="${unten + 13}" text-anchor="middle" class="terminleiste-text">${esc(formatMonat(iso))}</text>`);
  }
  sichtbar.forEach((spur, i) => {
    const y = oben + i * spurHoehe + spurHoehe / 2;
    teile.push(`<text x="0" y="${y + 4}" class="terminleiste-text terminleiste-spur">${esc(spur.label)}</text>`);
    teile.push(`<line x1="${links}" x2="${rechts}" y1="${y}" y2="${y}" class="terminleiste-linie" />`);
    const form = spur.form === "raute" ? "raute" : "kreis";
    for (const m of spur.marker) {
      const mx = x(m.datum);
      const klasse = `terminleiste-marker ${form} ${esc(m.klasse ?? "")}`.trim();
      teile.push(form === "raute"
        ? `<path d="M${runde(mx)},${y - 5} L${runde(mx + 5)},${y} L${runde(mx)},${y + 5} L${runde(mx - 5)},${y} Z" class="${klasse}" />`
        : `<circle cx="${runde(mx)}" cy="${y}" r="4" class="${klasse}" />`);
      termine.push({ x: Math.round(mx), datum: m.datum, label: m.label, klasse: `${form} ${m.klasse ?? ""}`.trim() });
    }
  });
  teile.push(`<line x1="${links}" x2="${links}" y1="${oben - 3}" y2="${unten}" class="terminleiste-heute" />`);
  // Hover (diagramm-hover.mjs): Linie folgt dem Zeiger, die Box zeigt Datum und Termine in der Naehe.
  const plot = { left: links, right: rechts, top: oben - 3, bottom: unten, von, bis };
  return `<svg class="terminleiste" viewBox="0 0 ${breite} ${unten + 17}" role="img" aria-label="${esc(ariaLabel)}" data-termine="${esc(JSON.stringify(termine))}" data-plot="${esc(JSON.stringify(plot))}">${teile.join("")}</svg>`;
}

// Restschuld ueber die Zeit: Ist (bis heute) durchgezogen, Plan gestrichelt,
// Marker fuer heute und das Zinsbindungsende, belegte Staende als Kreise.
// punkte: [{ datum, wert_cents, tilgung_cents?, zins_cents? }] aufsteigend.
export function restschuldVerlauf({ punkte, heute, zinsbindungBis = null, belegte = [], formatWert = String, formatAchse = formatWert, formatDatum = String, labels = {}, achsenTitel = "", ariaLabel = "" }) {
  if (!punkte || punkte.length < 2) return "";
  const hoehe = 300;
  const rechts = 12;
  const oben = 30;
  const unten = 28;
  const t0 = tageSeit1970(punkte[0].datum);
  const t1 = Math.max(tageSeit1970(punkte.at(-1).datum), t0 + 1);
  const achse = achsenTicks(0, Math.max(...punkte.map((p) => p.wert_cents), ...belegte.map((b) => b.wert_cents), 1), 5);
  const yTexte = achse.ticks.map((w) => formatAchse(w));
  const links = linkerRand(yTexte, Boolean(achsenTitel));
  const x = (iso) => links + ((tageSeit1970(iso) - t0) / (t1 - t0)) * (BREITE - links - rechts);
  const y = (w) => oben + ((achse.max - w) / (achse.max - achse.min)) * (hoehe - oben - unten);
  const linie = (liste, klasse) => (liste.length > 1 ? `<polyline points="${liste.map((p) => `${runde(x(p.datum))},${runde(y(p.wert_cents))}`).join(" ")}" class="${klasse}" fill="none" />` : "");
  const ist = punkte.filter((p) => p.datum <= heute);
  const plan = punkte.filter((p) => p.datum >= (ist.at(-1)?.datum ?? punkte[0].datum));
  const teile = [
    ...yAchse({ ticks: achse.ticks, y, links, rechts, titel: achsenTitel, oben, unten: hoehe - unten }),
    ...achse.ticks.map((w, i) => achsenText(links - 8, y(w) + 4, yTexte[i], "end")),
  ];
  const jahrA = Number(punkte[0].datum.slice(0, 4));
  const jahrB = Number(punkte.at(-1).datum.slice(0, 4));
  const schritt = Math.max(1, Math.ceil((jahrB - jahrA) / 12));
  for (let jahr = jahrA + 1; jahr <= jahrB; jahr += schritt) teile.push(achsenText(x(`${jahr}-01-01`), hoehe - 8, String(jahr)));
  teile.push(linie(plan, "restschuld-plan"), linie(ist, "restschuld-ist"));
  const marker = (iso, klasse, text, zeile) => {
    if (!iso || iso < punkte[0].datum || iso > punkte.at(-1).datum) return "";
    return `<line x1="${runde(x(iso))}" x2="${runde(x(iso))}" y1="${oben}" y2="${hoehe - unten}" class="${klasse}" />${achsenText(x(iso) + 4, 12 + zeile * 14, text, "start")}`;
  };
  teile.push(marker(heute, "marker-heute", labels.heute ?? "heute", 0));
  teile.push(marker(zinsbindungBis, "marker-zinsbindung", labels.zinsbindung ?? "Zinsbindung", 1));
  for (const b of belegte) {
    if (b.datum < punkte[0].datum || b.datum > punkte.at(-1).datum) continue;
    teile.push(`<circle cx="${runde(x(b.datum))}" cy="${runde(y(b.wert_cents))}" r="4" class="restschuld-beleg" />`);
  }
  const spalten = punkte.map((p) => {
    const zeilen = [{ klasse: p.datum <= heute ? "restschuld" : "restschuld-plan", label: p.datum <= heute ? (labels.restschuld ?? "Restschuld") : (labels.restschuldPlan ?? "Restschuld (Plan)"), wert: formatWert(p.wert_cents) }];
    if (p.tilgung_cents != null) zeilen.push({ klasse: "tilgung", label: labels.tilgung ?? "Tilgung", wert: formatWert(p.tilgung_cents) });
    if (p.zins_cents != null) zeilen.push({ klasse: "zins", label: labels.zins ?? "Zins", wert: formatWert(p.zins_cents) });
    const beleg = belegte.find((b) => b.datum === p.datum);
    if (beleg) zeilen.push({ klasse: "beleg", label: labels.beleg ?? "Belegt", wert: formatWert(beleg.wert_cents) });
    return { x: Math.round(x(p.datum)), titel: formatDatum(p.datum), zeilen };
  });
  const plot = { left: links, right: BREITE - rechts, top: oben, bottom: hoehe - unten };
  return `<svg class="balken-diagramm" viewBox="0 0 ${BREITE} ${hoehe}" role="img" aria-label="${esc(ariaLabel)}" ${hoverAttrs(spalten, plot)}>${teile.join("")}</svg>`;
}

// Wertentwicklung eines Vorsorgevertrags: Wertstaende als Linie mit Punkten,
// eingezahlte Beitraege gestrichelt, beide zeitproportional. Flach gehalten,
// damit die Kachel nicht hoch wird. punkte: [{ datum, wert_cents, eingezahlt_cents?, ertrag_cents? }];
// eingezahlt_cents ist die gestrichelte Vergleichslinie, ertrag_cents steht nur im Hover.
export function wertVerlauf({ punkte, formatWert = String, formatAchse = formatWert, formatDatum = String, labels = {}, ariaLabel = "" }) {
  if (!punkte || punkte.length < 2) return "";
  const hoehe = 200;
  const rechts = 12;
  const oben = 10;
  const unten = 26;
  const t0 = tageSeit1970(punkte[0].datum);
  const t1 = Math.max(tageSeit1970(punkte.at(-1).datum), t0 + 1);
  const mitBeitrag = punkte.filter((p) => p.eingezahlt_cents != null);
  // Achse auf den Datenbereich gezoomt, nicht ab 0: es geht um den Abstand der
  // beiden Linien, und der verschwindet sonst in der Grundlinie.
  const alle = [...punkte.map((p) => p.wert_cents), ...mitBeitrag.map((p) => p.eingezahlt_cents)];
  const achse = achsenTicks(Math.min(...alle), Math.max(...alle), 3);
  const yTexte = achse.ticks.map((w) => formatAchse(w));
  const links = linkerRand(yTexte, false);
  // Endpunkte um ein paar Pixel eingerueckt, damit die Punkte nicht am Rand kleben.
  const x = (iso) => links + 8 + ((tageSeit1970(iso) - t0) / (t1 - t0)) * (BREITE - links - rechts - 16);
  const y = (w) => oben + ((achse.max - w) / (achse.max - achse.min)) * (hoehe - oben - unten);
  const linie = (liste, wert, klasse) => (liste.length > 1 ? `<polyline points="${liste.map((p) => `${runde(x(p.datum))},${runde(y(wert(p)))}`).join(" ")}" class="${klasse}" fill="none" />` : "");
  const teile = [
    ...yAchse({ ticks: achse.ticks, y, links, rechts, titel: "", oben, unten: hoehe - unten }),
    ...achse.ticks.map((w, i) => achsenText(links - 8, y(w) + 4, yTexte[i], "end")),
    // Je Jahr eine Beschriftung, am ersten Stichtag des Jahres.
    ...punkte.filter((p, i) => i === 0 || p.datum.slice(0, 4) !== punkte[i - 1].datum.slice(0, 4)).map((p) => achsenText(x(p.datum), hoehe - 8, p.datum.slice(0, 4))),
    linie(mitBeitrag, (p) => p.eingezahlt_cents, "wert-eingezahlt"),
    linie(punkte, (p) => p.wert_cents, "wert-linie"),
    ...punkte.map((p) => `<circle cx="${runde(x(p.datum))}" cy="${runde(y(p.wert_cents))}" r="4" class="wert-punkt" />`),
  ];
  const spalten = punkte.map((p) => {
    const zeilen = [{ klasse: "wert", label: labels.wert ?? "Wert", wert: formatWert(p.wert_cents) }];
    if (p.eingezahlt_cents != null) zeilen.push({ klasse: "eingezahlt", label: labels.eingezahlt ?? "Eingezahlt", wert: formatWert(p.eingezahlt_cents) });
    if (p.ertrag_cents != null) zeilen.push({ klasse: "summe", label: labels.ertrag ?? "Ertrag", wert: `${p.ertrag_cents > 0 ? "+" : ""}${formatWert(p.ertrag_cents)}` });
    return { x: Math.round(x(p.datum)), titel: formatDatum(p.datum), zeilen };
  });
  const plot = { left: links, right: BREITE - rechts, top: oben, bottom: hoehe - unten };
  return `<svg class="balken-diagramm" viewBox="0 0 ${BREITE} ${hoehe}" role="img" aria-label="${esc(ariaLabel)}" ${hoverAttrs(spalten, plot)}>${teile.join("")}</svg>`;
}

// --- Saldo-Diagramm (Liquiditaet) ------------------------------------------
// Fuer Saldo-Verlaeufe mit Datum: X zeitproportional mit Monatsmarken, Y mit
// gerundeten Ticks und dezentem Gitter, Linie in Stufen (ein Kontostand springt
// zum Buchungstag, er gleitet nicht). Hover-Daten wie im Zeit-Modus, dazu der
// Wertebereich der Achse und stufe:true fuer diagramm-hover.mjs.

// Gerundete Achsenteilung: Schritt aus {1, 2, 2,5, 5} x 10^n, Bereich umschliesst min..max.
export function achsenTicks(min, max, ziel = 4) {
  if (min === max) max = min + 1;
  const roh = (max - min) / ziel;
  const mag = 10 ** Math.floor(Math.log10(roh));
  const schritt = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= roh - 1e-9);
  const von = Math.floor(min / schritt + 1e-9) * schritt;
  const bis = Math.ceil(max / schritt - 1e-9) * schritt;
  const ticks = [];
  for (let k = 0; von + k * schritt <= bis + schritt / 2; k++) ticks.push(Math.round(von + k * schritt));
  return { min: Math.round(von), max: Math.round(bis), ticks };
}

// Punkt unter dem Zeiger: bei Stufen der letzte Punkt links davon (dessen Saldo
// gilt bis zum naechsten), sonst der naechstgelegene.
export function punktBeiX(punkte, vbX, stufe = false) {
  if (stufe) {
    let treffer = punkte[0];
    for (const p of punkte) if (p.x <= vbX) treffer = p;
    return treffer;
  }
  let nah = punkte[0];
  for (const p of punkte) if (Math.abs(p.x - vbX) < Math.abs(nah.x - vbX)) nah = p;
  return nah;
}

function tagNr(iso) {
  const [j, m, t] = String(iso).split("-").map(Number);
  return Date.UTC(j, m - 1, t) / 86400000;
}

function monatsanfaengeZwischen(vonIso, bisIso) {
  const [j, m] = vonIso.split("-").map(Number);
  const liste = [];
  let jahr = j;
  let monat = m + 1;
  for (;;) {
    if (monat > 12) { monat = 1; jahr += 1; }
    const iso = `${jahr}-${String(monat).padStart(2, "0")}-01`;
    if (iso > bisIso) break;
    liste.push(iso);
    monat += 1;
  }
  return liste;
}

function isoPlusTage(iso, tage) {
  const d = new Date((tagNr(iso) + tage) * 86400000);
  return d.toISOString().slice(0, 10);
}

// Marken der X-Achse: [{ iso, art }] mit art = "tag" | "monat" | "monatJahr" | "jahr".
export function xMarken(vonIso, bisIso, maxLabels) {
  const spanne = tagNr(bisIso) - tagNr(vonIso);
  if (spanne <= 62) {
    const schritt = [7, 14].find((k) => Math.floor(spanne / k) + 1 <= maxLabels) ?? 14;
    const marken = [];
    for (let k = 0; k <= spanne; k += schritt) marken.push({ iso: isoPlusTage(vonIso, k), art: "tag" });
    return marken;
  }
  const anfaenge = monatsanfaengeZwischen(vonIso, bisIso);
  const monatsIntervall = [1, 2, 3, 6].find((k) => Math.ceil(anfaenge.length / k) <= maxLabels);
  if (monatsIntervall) {
    return anfaenge
      .filter((iso) => (Number(iso.slice(5, 7)) - 1) % monatsIntervall === 0)
      .map((iso, i) => ({ iso, art: i === 0 || iso.slice(5, 7) === "01" ? "monatJahr" : "monat" }));
  }
  const jahre = anfaenge.filter((iso) => iso.slice(5, 7) === "01");
  const jahresIntervall = [1, 2, 5, 10, 20].find((k) => Math.ceil(jahre.length / k) <= maxLabels) ?? 20;
  return jahre
    .filter((iso) => Number(iso.slice(0, 4)) % jahresIntervall === 0)
    .map((iso) => ({ iso, art: "jahr" }));
}

// punkte: [{ datum: "YYYY-MM-DD", wert: number }] aufsteigend nach Datum.
export function saldoDiagramm(punkte, options = {}) {
  if (!Array.isArray(punkte) || punkte.length < 2) return "";
  const {
    width = 640,
    height = 260,
    formatWert = (n) => String(n),
    formatAchse = formatWert,
    formatTick = (iso) => iso,
    ariaLabel = "",
  } = options;

  const achseFont = 13;
  const charBreite = achseFont * 0.62;
  const werte = punkte.map((p) => p.wert);
  // Nulllinie immer im Bereich: der Abstand zur 0 ist die Kernfrage der Kurve.
  const { min, max, ticks } = achsenTicks(Math.min(0, ...werte), Math.max(0, ...werte));
  const yTexte = ticks.map((w) => formatAchse(w));
  const padLeft = Math.ceil(Math.max(...yTexte.map((s) => s.length)) * charBreite) + 12;
  const padRight = 14;
  const padTop = 12;
  const padBottom = 30;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const baseY = padTop + innerH;

  const t0 = tagNr(punkte[0].datum);
  const tEnde = tagNr(punkte.at(-1).datum);
  const t1 = tEnde > t0 ? tEnde : t0 + 1;
  const x = (iso) => padLeft + ((tagNr(iso) - t0) / (t1 - t0)) * innerW;
  const y = (w) => padTop + (1 - (w - min) / (max - min)) * innerH;
  const f = (n) => n.toFixed(2);

  // Stufenlinie: vom Punkt waagrecht bis zum naechsten Datum, dann senkrecht.
  let linie = `M ${f(x(punkte[0].datum))},${f(y(punkte[0].wert))}`;
  for (let i = 1; i < punkte.length; i++) linie += ` H ${f(x(punkte[i].datum))} V ${f(y(punkte[i].wert))}`;
  const flaeche = `${linie} V ${f(baseY)} H ${f(x(punkte[0].datum))} Z`;

  const gitter = ticks
    .map((w) => `<line x1="${padLeft}" y1="${f(y(w))}" x2="${f(padLeft + innerW)}" y2="${f(y(w))}" class="${w === 0 && min < 0 ? "diagramm-nulllinie" : "diagramm-gitter"}" />`)
    .join("");
  const yLabels = ticks
    .map((w, i) => `<text x="${padLeft - 8}" y="${f(y(w) + 4)}" text-anchor="end" font-size="${achseFont}" class="diagramm-achse-label y">${esc(yTexte[i])}</text>`)
    .join("");

  // X-Achse nach Zeitraum gestaffelt: bis ~2 Monate Wochenmarken (Tag), sonst
  // Monatsanfaenge (jeder 1./2./3./6.), bei langen Horizonten nur Jahre (jedes
  // 1./2./5./10.). Die Anzahl richtet sich nach der Breite.
  const labelBreite = 9 * charBreite + 14;
  const maxLabels = Math.max(2, Math.floor(innerW / labelBreite));
  const marken = xMarken(punkte[0].datum, punkte.at(-1).datum, maxLabels);
  const xLabels = marken
    .map(({ iso, art }) => {
      const px = x(iso);
      const anchor = px - padLeft < labelBreite / 2 ? "start" : padLeft + innerW - px < labelBreite / 2 ? "end" : "middle";
      return `<line x1="${f(px)}" y1="${f(baseY)}" x2="${f(px)}" y2="${f(baseY + 4)}" class="diagramm-achse" />` +
        `<text x="${f(px)}" y="${f(baseY + 19)}" text-anchor="${anchor}" font-size="${achseFont}" class="diagramm-achse-label x">${esc(formatTick(iso, art))}</text>`;
    })
    .join("");

  const minWert = Math.min(...werte);
  const tief = punkte[werte.indexOf(minWert)];
  const tiefpunkt = `<circle cx="${f(x(tief.datum))}" cy="${f(y(minWert))}" r="3" class="diagramm-tiefpunkt ${minWert < 0 ? "negativ" : ""}" />`;

  const dataPunkte = punkte.map((p, i) => ({ i, x: Math.round(x(p.datum)), datum: p.datum, wert: p.wert, basis: null }));
  const dataPlot = { left: Math.round(padLeft), right: Math.round(padLeft + innerW), top: Math.round(padTop), bottom: Math.round(baseY), min, max, stufe: true };
  const hoverAttrs = `data-punkte="${esc(JSON.stringify(dataPunkte))}" data-plot="${esc(JSON.stringify(dataPlot))}"`;

  return `<svg class="linien-diagramm linien-diagramm-zeit saldo-diagramm" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(ariaLabel)}" ${hoverAttrs}>
    ${gitter}
    <path d="${flaeche}" class="diagramm-flaeche" />
    <path d="${linie}" class="diagramm-linie" fill="none" vector-effect="non-scaling-stroke" />
    ${tiefpunkt}
    <line x1="${padLeft}" y1="${f(baseY)}" x2="${f(padLeft + innerW)}" y2="${f(baseY)}" class="diagramm-achse" />
    ${yLabels}
    ${xLabels}
  </svg>`;
}

// --- Zeitstrahl (Szenarien) -------------------------------------------------
// Spalten auf einem gleichmaessigen Raster (Jahre oder Monate), darueber optional
// Phasenbaender und Ereignismarker auf derselben X-Achse. Mehrere Linien (Szenario,
// Vergleich, Vergleichsreihen), gerundete Y-Ticks mit Gitter, betonte Nulllinie und
// eine rot getoente Zone unter Null. Hover ueber data-spalten wie die Balken.
// spalten: [{ label, titel }] · serien: [{ klasse, label, werte: [cents|null] }]
// (null = keine Angabe, die Linie setzt dort aus). Phasen und Ereignisse liegen in
// Spaltenkoordinaten: Spalte i reicht von i bis i+1, Bruchteile sind erlaubt.
// phasen: [{ name, von, bis }] (bis exklusiv) · ereignisse: [{ pos, label }]
export function zeitstrahlDiagramm({ spalten, serien, phasen = [], ereignisse = [], formatWert = String, formatAchse = formatWert, ariaLabel = "", breite = BREITE, plotHoehe = 250, labelSchritt = null }) {
  const n = spalten?.length ?? 0;
  const gueltig = (serien ?? []).filter((s) => s.werte?.length === n);
  if (n < 2 || !gueltig.length) return "";
  const rechts = 12;
  const bandHoehe = phasen.length ? 22 : 0;
  const ereignisZeilen = ereignisse.length ? 2 : 0;
  const oben = 8 + bandHoehe + ereignisZeilen * 15 + (bandHoehe || ereignisZeilen ? 6 : 0);
  const unten = 28;
  const hoehe = oben + plotHoehe + unten;
  const alle = gueltig.flatMap((s) => s.werte).filter((w) => w != null);
  if (!alle.length) return "";
  const achse = achsenTicks(Math.min(0, ...alle), Math.max(0, ...alle), 5);
  const yTexte = achse.ticks.map((w) => formatAchse(w));
  const links = linkerRand(yTexte, false);
  const breiteInnen = breite - links - rechts;
  const spalte = breiteInnen / n;
  const mx = (i) => links + spalte * i + spalte / 2;
  const y = (w) => oben + ((achse.max - w) / (achse.max - achse.min)) * (hoehe - oben - unten);
  const teile = [];

  if (achse.min < 0) teile.push(`<rect x="${links}" y="${runde(y(0))}" width="${runde(breiteInnen)}" height="${runde(y(achse.min) - y(0))}" class="zone-negativ" />`);
  for (const w of achse.ticks) {
    teile.push(`<line x1="${links}" x2="${breite - rechts}" y1="${runde(y(w))}" y2="${runde(y(w))}" class="${w === 0 ? "zeitstrahl-null" : "diagramm-gitter"}" />`);
  }
  achse.ticks.forEach((w, i) => teile.push(achsenText(links - 8, y(w) + 4, yTexte[i], "end")));

  phasen.forEach((ph, k) => {
    const x0 = links + spalte * ph.von;
    const b = spalte * (ph.bis - ph.von);
    teile.push(`<rect x="${runde(x0)}" y="8" width="${runde(b)}" height="${bandHoehe - 4}" class="phase-band phase-${k % 4}" />`);
    if (b > String(ph.name).length * SCHRIFT * 0.6 + 8) {
      teile.push(`<text x="${runde(x0 + b / 2)}" y="${runde(8 + bandHoehe / 2 + 2)}" text-anchor="middle" font-size="${SCHRIFT - 1}" class="phase-label">${esc(ph.name)}</text>`);
    }
  });

  // Ereignisse: Marker durch die Plotflaeche, Beschriftung in der ersten von zwei
  // Zeilen, in der sie nichts ueberdeckt. Passt sie in keine, bleibt nur die Linie
  // (Details dann im Hover), statt dass sich Texte ueberlagern.
  const belegt = [[], []];
  for (const e of ereignisse) {
    const px = links + spalte * e.pos;
    const textBreite = String(e.label).length * (SCHRIFT - 2) * 0.6 + 4;
    const anchor = px - links < textBreite / 2 ? "start" : breite - rechts - px < textBreite / 2 ? "end" : "middle";
    const x0 = anchor === "start" ? px : anchor === "end" ? px - textBreite : px - textBreite / 2;
    const frei = (zeile) => belegt[zeile].every(([a0, a1]) => x0 + textBreite + 6 <= a0 || x0 >= a1 + 6);
    const zeile = frei(0) ? 0 : frei(1) ? 1 : -1;
    if (zeile < 0) {
      teile.push(`<line x1="${runde(px)}" x2="${runde(px)}" y1="${runde(oben)}" y2="${runde(hoehe - unten)}" class="ereignis-marker" />`);
      continue;
    }
    belegt[zeile].push([x0, x0 + textBreite]);
    const tyZeile = 8 + bandHoehe + 12 + zeile * 15;
    teile.push(`<line x1="${runde(px)}" x2="${runde(px)}" y1="${runde(tyZeile + 3)}" y2="${runde(hoehe - unten)}" class="ereignis-marker" />`);
    teile.push(`<text x="${runde(px)}" y="${runde(tyZeile)}" text-anchor="${anchor}" font-size="${SCHRIFT - 2}" class="ereignis-label">${esc(e.label)}</text>`);
  }

  // Jede schritt-te Spalte beschriftet; die letzte nur, wenn sie Abstand zur
  // vorigen Beschriftung hat (schmale Diagramme). labelSchritt 1: jede Spalte,
  // leere Labels bleiben leer (z. B. nur Januar mit Jahreszahl).
  const schritt = labelSchritt ?? Math.max(1, Math.ceil(n / 14));
  const rest = (n - 1) % schritt;
  const letzteFrei = rest >= schritt / 2 && rest * spalte >= String(spalten[n - 1].label).length * SCHRIFT * 0.6 + 6;
  spalten.forEach((s, i) => {
    if (i % schritt === 0 || i === n - 1 && letzteFrei) teile.push(achsenText(mx(i), hoehe - 8, s.label));
  });
  teile.push(`<line x1="${links}" x2="${breite - rechts}" y1="${hoehe - unten}" y2="${hoehe - unten}" class="diagramm-achse" />`);

  for (const s of [...gueltig].reverse()) {
    // Zusammenhaengende Abschnitte ohne null je als eigene Linie.
    let abschnitt = [];
    const abschnitte = [];
    s.werte.forEach((w, i) => {
      if (w == null) { if (abschnitt.length) abschnitte.push(abschnitt); abschnitt = []; return; }
      abschnitt.push(`${runde(mx(i))},${runde(y(w))}`);
    });
    if (abschnitt.length) abschnitte.push(abschnitt);
    for (const a of abschnitte) teile.push(`<polyline points="${a.join(" ")}" class="zeitstrahl-linie ${esc(s.klasse)}" fill="none" />`);
    if (n <= 40) s.werte.forEach((w, i) => { if (w != null) teile.push(`<circle cx="${runde(mx(i))}" cy="${runde(y(w))}" r="2.6" class="zeitstrahl-punkt ${esc(s.klasse)}" />`); });
  }

  const hover = spalten.map((s, i) => ({
    x: Math.round(mx(i)),
    titel: s.titel ?? s.label,
    // spalten[i].zusatz: weitere fertige Hover-Zeilen, z. B. grosse Buchungen des Monats.
    zeilen: [
      ...gueltig.map((serie) => ({ klasse: serie.klasse, label: serie.label, wert: serie.werte[i] == null ? "—" : formatWert(serie.werte[i]) })),
      ...(s.zusatz ?? []),
    ],
  }));
  const plot = { left: links, right: breite - rechts, top: oben, bottom: hoehe - unten };
  return `<svg class="balken-diagramm zeitstrahl-diagramm" viewBox="0 0 ${breite} ${hoehe}" role="img" aria-label="${esc(ariaLabel)}" ${hoverAttrs(hover, plot)}>${teile.join("")}</svg>`;
}

// Gestapelte Saeulen mit Netto-Linie (Nettovermoegen-Zusammensetzung): positive
// Teile nach oben, negative (Restschuld) nach unten, die Summe als Linie.
// teile: [{ klasse, label, werte: [cents] }] · netto: { label, werte }
export function stapelDiagramm({ spalten, teile, netto, formatWert = String, formatAchse = formatWert, ariaLabel = "" }) {
  const n = spalten?.length ?? 0;
  if (!n || !teile?.length) return "";
  const hoehe = 280;
  const rechts = 12;
  const oben = 10;
  const unten = 28;
  const plus = spalten.map((_, i) => teile.reduce((s, t) => s + Math.max(0, t.werte[i]), 0));
  const minus = spalten.map((_, i) => teile.reduce((s, t) => s + Math.min(0, t.werte[i]), 0));
  const achse = achsenTicks(Math.min(0, ...minus, ...netto.werte), Math.max(1, ...plus, ...netto.werte), 5);
  const yTexte = achse.ticks.map((w) => formatAchse(w));
  const links = linkerRand(yTexte, false);
  const spalte = (BREITE - links - rechts) / n;
  const breite = Math.max(3, spalte * 0.62);
  const mx = (i) => links + spalte * i + spalte / 2;
  const y = (w) => oben + ((achse.max - w) / (achse.max - achse.min)) * (hoehe - oben - unten);
  const svg = [
    ...yAchse({ ticks: achse.ticks, y, links, rechts, titel: "", oben, unten: hoehe - unten }),
    ...achse.ticks.map((w, i) => achsenText(links - 8, y(w) + 4, yTexte[i], "end")),
  ];
  const schritt = Math.max(1, Math.ceil(n / 14));
  spalten.forEach((s, i) => {
    let auf = 0;
    let ab = 0;
    for (const t of teile) {
      const w = t.werte[i];
      if (!w) continue;
      const von = w > 0 ? auf : ab;
      const bis = von + w;
      if (w > 0) auf = bis; else ab = bis;
      svg.push(`<rect x="${runde(mx(i) - breite / 2)}" y="${runde(y(Math.max(von, bis)))}" width="${runde(breite)}" height="${runde(Math.abs(y(von) - y(bis)))}" class="stapel ${esc(t.klasse)}" />`);
    }
    if (i % schritt === 0) svg.push(achsenText(mx(i), hoehe - 8, s.label));
  });
  svg.push(`<polyline points="${netto.werte.map((w, i) => `${runde(mx(i))},${runde(y(w))}`).join(" ")}" class="balken-saldo" fill="none" />`);
  netto.werte.forEach((w, i) => svg.push(`<circle cx="${runde(mx(i))}" cy="${runde(y(w))}" r="3" class="balken-saldo-punkt" />`));
  const hover = spalten.map((s, i) => ({
    x: Math.round(mx(i)),
    titel: s.titel ?? s.label,
    zeilen: [
      ...teile.map((t) => ({ klasse: t.klasse, label: t.label, wert: formatWert(t.werte[i]) })),
      { klasse: "saldo", label: netto.label, wert: formatWert(netto.werte[i]) },
    ],
  }));
  const plot = { left: links, right: BREITE - rechts, top: oben, bottom: hoehe - unten };
  return `<svg class="balken-diagramm" viewBox="0 0 ${BREITE} ${hoehe}" role="img" aria-label="${esc(ariaLabel)}" ${hoverAttrs(hover, plot)}>${svg.join("")}</svg>`;
}

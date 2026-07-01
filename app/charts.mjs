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

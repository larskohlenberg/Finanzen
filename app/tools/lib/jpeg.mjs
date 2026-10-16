// app/tools/lib/jpeg.mjs
// Kleiner Baseline-JPEG-Leser ohne Abhaengigkeiten: genug fuer Logos, die der
// Logodienst als JPEG durchreicht (ADR 0030). Unterstuetzt Huffman-Baseline
// (SOF0/SOF1, 8 Bit) mit Graustufen oder YCbCr, beliebiger Unterabtastung,
// Restart-Markern und mehreren Scans. Progressive, arithmetische und
// CMYK-JPEGs werden abgelehnt. Ergebnis wie dekodierePng: { breite, hoehe, rgba }.

// Logos werden auf 128 px verkleinert; groessere Kanten oder viele Scans
// deuten auf eine kaputte oder boesartige Datei und werden abgelehnt.
const MAX_KANTE = 1024;
const MAX_SCANS = 8;

// Zickzack-Position -> Rasterposition im 8x8-Block.
const ZICKZACK = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];

// COS[x * 8 + u] = C(u) / 2 * cos((2x + 1) u pi / 16), C(0) = 1/sqrt(2).
const COS = new Float64Array(64);
for (let x = 0; x < 8; x += 1) {
  for (let u = 0; u < 8; u += 1) COS[x * 8 + u] = ((u === 0 ? Math.SQRT1_2 : 1) / 2) * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
}

export function istJpeg(bytes) {
  return Buffer.isBuffer(bytes) && bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

// DHT-Tabelle -> kanonischer Decoder (mincode/maxcode/valptr je Codelaenge).
function huffmanTabelle(anzahlen, werte) {
  const mincode = new Int32Array(17);
  const maxcode = new Int32Array(17).fill(-1);
  const valptr = new Int32Array(17);
  let code = 0;
  let k = 0;
  for (let laenge = 1; laenge <= 16; laenge += 1) {
    valptr[laenge] = k;
    mincode[laenge] = code;
    code += anzahlen[laenge - 1];
    k += anzahlen[laenge - 1];
    if (anzahlen[laenge - 1]) maxcode[laenge] = code - 1;
    code <<= 1;
  }
  return { mincode, maxcode, valptr, werte };
}

function scanLesen(bytes, start, frame, scan, restartIntervall) {
  let pos = start;
  let puffer = 0;
  let bits = 0;

  const bit = () => {
    if (bits === 0) {
      // 0xFF in den Daten ist als FF00 maskiert; jeder andere Marker hier
      // heisst, die Daten enden vor dem letzten Block.
      if (pos >= bytes.length || (bytes[pos] === 0xff && bytes[pos + 1] !== 0x00)) throw new Error("JPEG-Bilddaten unvollstaendig");
      puffer = bytes[pos];
      pos += bytes[pos] === 0xff ? 2 : 1;
      bits = 8;
    }
    bits -= 1;
    return (puffer >> bits) & 1;
  };
  const empfange = (n) => {
    let v = 0;
    for (let i = 0; i < n; i += 1) v = (v << 1) | bit();
    return v;
  };
  const erweitere = (v, n) => (v < 1 << (n - 1) ? v - (1 << n) + 1 : v);
  const dekodiere = (tabelle) => {
    let code = 0;
    for (let laenge = 1; laenge <= 16; laenge += 1) {
      code = (code << 1) | bit();
      if (code <= tabelle.maxcode[laenge]) return tabelle.werte[tabelle.valptr[laenge] + code - tabelle.mincode[laenge]];
    }
    throw new Error("JPEG: ungueltiger Huffman-Code");
  };

  const block = (komp, zeile, spalte) => {
    const koeff = komp.koeff;
    const basis = (zeile * komp.blockBreite + spalte) * 64;
    const q = komp.quant;
    const t = dekodiere(komp.dc);
    komp.pred += t ? erweitere(empfange(t), t) : 0;
    koeff[basis] = komp.pred * q[0];
    for (let k = 1; k < 64; ) {
      const rs = dekodiere(komp.ac);
      const s = rs & 15;
      const r = rs >> 4;
      if (s === 0) {
        if (r !== 15) break;
        k += 16;
        continue;
      }
      k += r;
      if (k > 63) throw new Error("JPEG: Koeffizient ausserhalb des Blocks");
      koeff[basis + ZICKZACK[k]] = erweitere(empfange(s), s) * q[k];
      k += 1;
    }
  };

  const einzeln = scan.length === 1;
  const mcuBreite = einzeln ? Math.ceil(scan[0].breite / 8) : frame.mcuBreite;
  const mcuHoehe = einzeln ? Math.ceil(scan[0].hoehe / 8) : frame.mcuHoehe;
  const gesamt = mcuBreite * mcuHoehe;
  for (const k of scan) k.pred = 0;

  for (let mcu = 0; mcu < gesamt; mcu += 1) {
    if (restartIntervall && mcu > 0 && mcu % restartIntervall === 0) {
      // Bitpuffer verwerfen, RSTn-Marker suchen, DC-Vorhersage zuruecksetzen.
      bits = 0;
      while (pos + 1 < bytes.length && !(bytes[pos] === 0xff && bytes[pos + 1] >= 0xd0 && bytes[pos + 1] <= 0xd7)) pos += 1;
      pos += 2;
      for (const k of scan) k.pred = 0;
    }
    const my = Math.floor(mcu / mcuBreite);
    const mx = mcu % mcuBreite;
    if (einzeln) block(scan[0], my, mx);
    else {
      for (const k of scan) {
        for (let v = 0; v < k.v; v += 1) {
          for (let h = 0; h < k.h; h += 1) block(k, my * k.v + v, mx * k.h + h);
        }
      }
    }
  }
  // Ende der Entropiedaten: naechsten Marker (kein RSTn, kein Fuellbyte) suchen.
  while (pos + 1 < bytes.length && !(bytes[pos] === 0xff && bytes[pos + 1] !== 0x00 && !(bytes[pos + 1] >= 0xd0 && bytes[pos + 1] <= 0xd7))) pos += 1;
  return pos;
}

// Inverse DCT eines Blocks in die Abtastebene der Komponente.
function idct(komp) {
  const ebeneBreite = komp.blockBreite * 8;
  const ebene = new Uint8ClampedArray(ebeneBreite * komp.blockHoehe * 8);
  const zwischen = new Float64Array(64);
  for (let by = 0; by < komp.blockHoehe; by += 1) {
    for (let bx = 0; bx < komp.blockBreite; bx += 1) {
      const basis = (by * komp.blockBreite + bx) * 64;
      for (let y = 0; y < 8; y += 1) {
        for (let u = 0; u < 8; u += 1) {
          let summe = 0;
          for (let v = 0; v < 8; v += 1) summe += COS[y * 8 + v] * komp.koeff[basis + v * 8 + u];
          zwischen[y * 8 + u] = summe;
        }
      }
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          let summe = 0;
          for (let u = 0; u < 8; u += 1) summe += COS[x * 8 + u] * zwischen[y * 8 + u];
          ebene[(by * 8 + y) * ebeneBreite + bx * 8 + x] = Math.round(summe + 128);
        }
      }
    }
  }
  return { ebene, ebeneBreite };
}

// JPEG -> { breite, hoehe, rgba } (rgba: Uint8Array, 4 Byte je Pixel, deckend).
export function dekodiereJpeg(bytes) {
  if (!istJpeg(bytes)) throw new Error("kein JPEG");
  const quant = [];
  const dc = [];
  const ac = [];
  let frame = null;
  let restartIntervall = 0;
  let adobeTransform = null;
  let scans = 0;
  let pos = 2;

  for (;;) {
    while (pos < bytes.length && bytes[pos] !== 0xff) pos += 1;
    while (pos < bytes.length && bytes[pos] === 0xff) pos += 1;
    if (pos >= bytes.length) break;
    const marker = bytes[pos];
    pos += 1;
    if (marker === 0xd9) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (pos + 2 > bytes.length) throw new Error("JPEG abgeschnitten");
    const laenge = bytes.readUInt16BE(pos);
    const daten = bytes.subarray(pos + 2, pos + laenge);
    if (laenge < 2 || daten.length !== laenge - 2) throw new Error("JPEG abgeschnitten");
    pos += laenge;

    if (marker === 0xdb) {
      for (let i = 0; i < daten.length; ) {
        const praezision = daten[i] >> 4;
        const id = daten[i] & 15;
        const tabelle = new Int32Array(64);
        for (let k = 0; k < 64; k += 1) tabelle[k] = praezision ? daten.readUInt16BE(i + 1 + k * 2) : daten[i + 1 + k];
        quant[id] = tabelle;
        i += 1 + 64 * (praezision ? 2 : 1);
      }
    } else if (marker === 0xc4) {
      for (let i = 0; i < daten.length; ) {
        const klasse = daten[i] >> 4;
        const id = daten[i] & 15;
        const anzahlen = daten.subarray(i + 1, i + 17);
        const summe = anzahlen.reduce((s, n) => s + n, 0);
        (klasse ? ac : dc)[id] = huffmanTabelle(anzahlen, daten.subarray(i + 17, i + 17 + summe));
        i += 17 + summe;
      }
    } else if (marker === 0xdd) {
      restartIntervall = daten.readUInt16BE(0);
    } else if (marker === 0xee && daten.toString("latin1", 0, 5) === "Adobe" && daten.length >= 12) {
      adobeTransform = daten[11];
    } else if (marker === 0xc0 || marker === 0xc1) {
      if (frame) throw new Error("JPEG mit mehreren Bildkoepfen, nicht unterstuetzt");
      if (daten[0] !== 8) throw new Error("JPEG mit mehr als 8 Bit, nicht unterstuetzt");
      const hoehe = daten.readUInt16BE(1);
      const breite = daten.readUInt16BE(3);
      const anzahl = daten[5];
      if (breite < 1 || hoehe < 1 || breite > MAX_KANTE || hoehe > MAX_KANTE) throw new Error("JPEG-Groesse unzulaessig");
      if (anzahl !== 1 && anzahl !== 3) throw new Error("JPEG mit CMYK oder unbekannten Farbkanaelen, nicht unterstuetzt");
      const komponenten = [];
      for (let i = 0; i < anzahl; i += 1) {
        const h = daten[7 + i * 3] >> 4;
        const v = daten[7 + i * 3] & 15;
        if (h < 1 || h > 4 || v < 1 || v > 4) throw new Error("JPEG: ungueltige Abtastfaktoren");
        komponenten.push({ id: daten[6 + i * 3], h, v, tq: daten[8 + i * 3] });
      }
      const hMax = Math.max(...komponenten.map((k) => k.h));
      const vMax = Math.max(...komponenten.map((k) => k.v));
      const mcuBreite = Math.ceil(breite / (8 * hMax));
      const mcuHoehe = Math.ceil(hoehe / (8 * vMax));
      for (const k of komponenten) {
        k.breite = Math.ceil((breite * k.h) / hMax);
        k.hoehe = Math.ceil((hoehe * k.v) / vMax);
        k.blockBreite = mcuBreite * k.h;
        k.blockHoehe = mcuHoehe * k.v;
        k.koeff = new Int32Array(k.blockBreite * k.blockHoehe * 64);
      }
      frame = { breite, hoehe, komponenten, hMax, vMax, mcuBreite, mcuHoehe };
    } else if (marker >= 0xc2 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      throw new Error(marker === 0xc2 ? "JPEG progressiv, nicht unterstuetzt" : "JPEG-Variante nicht unterstuetzt");
    } else if (marker === 0xda) {
      if (!frame) throw new Error("JPEG: Scan vor dem Bildkopf");
      if (scans >= MAX_SCANS) throw new Error("JPEG mit zu vielen Scans");
      const scan = [];
      for (let i = 0; i < daten[0]; i += 1) {
        const komp = frame.komponenten.find((k) => k.id === daten[1 + i * 2]);
        if (!komp) throw new Error("JPEG: Scan nennt unbekannte Komponente");
        komp.dc = dc[daten[2 + i * 2] >> 4];
        komp.ac = ac[daten[2 + i * 2] & 15];
        komp.quant = quant[komp.tq];
        if (!komp.dc || !komp.ac || !komp.quant) throw new Error("JPEG: Huffman- oder Quantisierungstabelle fehlt");
        scan.push(komp);
      }
      pos = scanLesen(bytes, pos, frame, scan, restartIntervall);
      scans += 1;
    }
  }
  if (!frame) throw new Error("JPEG ohne Bildkopf");
  if (!scans) throw new Error("JPEG ohne Bilddaten");

  const { breite, hoehe, komponenten, hMax, vMax } = frame;
  const ebenen = komponenten.map((k) => ({ ...idct(k), breite: k.breite, hoehe: k.hoehe, sx: k.h / hMax, sy: k.v / vMax }));
  // Unterabgetastete Komponenten bilinear mit Pixelmitte strecken (wie die
  // "fancy upsampling" von libjpeg), volle Aufloesung direkt lesen.
  const probe = (e, x, y) => {
    if (e.sx === 1 && e.sy === 1) return e.ebene[y * e.ebeneBreite + x];
    const fx = Math.min(Math.max((x + 0.5) * e.sx - 0.5, 0), e.breite - 1);
    const fy = Math.min(Math.max((y + 0.5) * e.sy - 0.5, 0), e.hoehe - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, e.breite - 1);
    const y1 = Math.min(y0 + 1, e.hoehe - 1);
    const wx = fx - x0;
    const wy = fy - y0;
    const at = (px, py) => e.ebene[py * e.ebeneBreite + px];
    return (at(x0, y0) * (1 - wx) + at(x1, y0) * wx) * (1 - wy) + (at(x0, y1) * (1 - wx) + at(x1, y1) * wx) * wy;
  };
  // Farbumrechnung: YCbCr nach JFIF, ausser Adobe-Kennung 0 (dann schon RGB).
  const ycbcr = komponenten.length === 3 && adobeTransform !== 0;
  const rgba = new Uint8Array(breite * hoehe * 4);
  for (let y = 0; y < hoehe; y += 1) {
    for (let x = 0; x < breite; x += 1) {
      const o = (y * breite + x) * 4;
      if (komponenten.length === 1) {
        rgba[o] = rgba[o + 1] = rgba[o + 2] = klemme(probe(ebenen[0], x, y));
      } else {
        const a = probe(ebenen[0], x, y);
        const b = probe(ebenen[1], x, y);
        const c = probe(ebenen[2], x, y);
        if (ycbcr) {
          rgba[o] = klemme(a + 1.402 * (c - 128));
          rgba[o + 1] = klemme(a - 0.344136 * (b - 128) - 0.714136 * (c - 128));
          rgba[o + 2] = klemme(a + 1.772 * (b - 128));
        } else {
          rgba[o] = klemme(a);
          rgba[o + 1] = klemme(b);
          rgba[o + 2] = klemme(c);
        }
      }
      rgba[o + 3] = 255;
    }
  }
  return { breite, hoehe, rgba };
}

const klemme = (wert) => Math.max(0, Math.min(255, Math.round(wert)));

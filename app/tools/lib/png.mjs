// app/tools/lib/png.mjs
// Kleiner PNG-Lese- und Schreibweg ohne Abhaengigkeiten: genug, um ein Logo
// vom Logodienst zu pruefen, zu verkleinern und als RGBA-PNG abzulegen.
// Unterstuetzt nicht-interlaced PNG mit 1/2/4/8/16 Bit (Graustufen, RGB,
// Palette, jeweils mit Alpha bzw. tRNS). Alles andere wird abgelehnt.
import { crc32, deflateSync, inflateSync } from "node:zlib";

const SIGNATUR = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_KANTE = 4096;

export function istPng(bytes) {
  return Buffer.isBuffer(bytes) && bytes.length > SIGNATUR.length && bytes.subarray(0, 8).equals(SIGNATUR);
}

function chunks(bytes) {
  const liste = [];
  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const laenge = bytes.readUInt32BE(pos);
    const typ = bytes.toString("latin1", pos + 4, pos + 8);
    const daten = bytes.subarray(pos + 8, pos + 8 + laenge);
    if (daten.length !== laenge) throw new Error("PNG abgeschnitten");
    liste.push({ typ, daten });
    pos += 12 + laenge;
    if (typ === "IEND") break;
  }
  return liste;
}

const KANAELE = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// PNG -> { breite, hoehe, rgba } (rgba: Uint8Array, 4 Byte je Pixel).
export function dekodierePng(bytes) {
  if (!istPng(bytes)) throw new Error("kein PNG");
  const teile = chunks(bytes);
  const ihdr = teile.find((c) => c.typ === "IHDR")?.daten;
  if (!ihdr || ihdr.length < 13) throw new Error("PNG ohne IHDR");
  const breite = ihdr.readUInt32BE(0);
  const hoehe = ihdr.readUInt32BE(4);
  const tiefe = ihdr[8];
  const farbtyp = ihdr[9];
  if (ihdr[12] !== 0) throw new Error("PNG interlaced, nicht unterstuetzt");
  if (!KANAELE[farbtyp] || ![1, 2, 4, 8, 16].includes(tiefe)) throw new Error("PNG-Format nicht unterstuetzt");
  if (breite < 1 || hoehe < 1 || breite > MAX_KANTE || hoehe > MAX_KANTE) throw new Error("PNG-Groesse unzulaessig");

  const kanaele = KANAELE[farbtyp];
  const bitsJePixel = kanaele * tiefe;
  const zeilenBytes = Math.ceil((breite * bitsJePixel) / 8);
  const bpp = Math.max(1, bitsJePixel >> 3);
  const roh = inflateSync(Buffer.concat(teile.filter((c) => c.typ === "IDAT").map((c) => c.daten)));
  if (roh.length < hoehe * (zeilenBytes + 1)) throw new Error("PNG-Bilddaten unvollstaendig");

  const zeilen = Buffer.alloc(hoehe * zeilenBytes);
  for (let y = 0; y < hoehe; y += 1) {
    const filter = roh[y * (zeilenBytes + 1)];
    const ein = roh.subarray(y * (zeilenBytes + 1) + 1, (y + 1) * (zeilenBytes + 1));
    const aus = zeilen.subarray(y * zeilenBytes, (y + 1) * zeilenBytes);
    const vorher = y > 0 ? zeilen.subarray((y - 1) * zeilenBytes, y * zeilenBytes) : null;
    for (let i = 0; i < zeilenBytes; i += 1) {
      const a = i >= bpp ? aus[i - bpp] : 0;
      const b = vorher ? vorher[i] : 0;
      const c = vorher && i >= bpp ? vorher[i - bpp] : 0;
      let wert;
      if (filter === 0) wert = ein[i];
      else if (filter === 1) wert = ein[i] + a;
      else if (filter === 2) wert = ein[i] + b;
      else if (filter === 3) wert = ein[i] + ((a + b) >> 1);
      else if (filter === 4) wert = ein[i] + paeth(a, b, c);
      else throw new Error("PNG-Filter unbekannt");
      aus[i] = wert & 0xff;
    }
  }

  const palette = teile.find((c) => c.typ === "PLTE")?.daten;
  const trns = teile.find((c) => c.typ === "tRNS")?.daten;
  if (farbtyp === 3 && !palette) throw new Error("PNG-Palette fehlt");
  const maxWert = (1 << tiefe) - 1;
  // Kanalwert k (0-basiert) eines Pixels x in Zeile z, auf 8 Bit skaliert.
  const probe = (z, x, k) => {
    const index = x * kanaele + k;
    if (tiefe === 8) return z[index];
    if (tiefe === 16) return z[index * 2];
    const bit = index * tiefe;
    const wert = (z[bit >> 3] >> (8 - tiefe - (bit & 7))) & maxWert;
    return farbtyp === 3 ? wert : Math.round((wert * 255) / maxWert);
  };
  const rohWert = (z, x, k) => {
    const index = x * kanaele + k;
    if (tiefe === 16) return z.readUInt16BE(index * 2);
    if (tiefe === 8) return z[index];
    const bit = index * tiefe;
    return (z[bit >> 3] >> (8 - tiefe - (bit & 7))) & maxWert;
  };

  const rgba = new Uint8Array(breite * hoehe * 4);
  for (let y = 0; y < hoehe; y += 1) {
    const z = zeilen.subarray(y * zeilenBytes, (y + 1) * zeilenBytes);
    for (let x = 0; x < breite; x += 1) {
      const o = (y * breite + x) * 4;
      if (farbtyp === 3) {
        const p = probe(z, x, 0);
        rgba[o] = palette[p * 3] ?? 0;
        rgba[o + 1] = palette[p * 3 + 1] ?? 0;
        rgba[o + 2] = palette[p * 3 + 2] ?? 0;
        rgba[o + 3] = trns && p < trns.length ? trns[p] : 255;
      } else if (farbtyp === 0 || farbtyp === 4) {
        const g = probe(z, x, 0);
        rgba[o] = g;
        rgba[o + 1] = g;
        rgba[o + 2] = g;
        const transparent = farbtyp === 0 && trns && trns.length >= 2 && rohWert(z, x, 0) === trns.readUInt16BE(0);
        rgba[o + 3] = farbtyp === 4 ? probe(z, x, 1) : transparent ? 0 : 255;
      } else {
        rgba[o] = probe(z, x, 0);
        rgba[o + 1] = probe(z, x, 1);
        rgba[o + 2] = probe(z, x, 2);
        const transparent = farbtyp === 2 && trns && trns.length >= 6
          && rohWert(z, x, 0) === trns.readUInt16BE(0) && rohWert(z, x, 1) === trns.readUInt16BE(2) && rohWert(z, x, 2) === trns.readUInt16BE(4);
        rgba[o + 3] = farbtyp === 6 ? probe(z, x, 3) : transparent ? 0 : 255;
      }
    }
  }
  return { breite, hoehe, rgba };
}

function chunk(typ, daten) {
  const kopf = Buffer.alloc(8);
  kopf.writeUInt32BE(daten.length, 0);
  kopf.write(typ, 4, "latin1");
  const pruef = Buffer.alloc(4);
  pruef.writeUInt32BE(crc32(Buffer.concat([kopf.subarray(4), daten])) >>> 0, 0);
  return Buffer.concat([kopf, daten, pruef]);
}

// { breite, hoehe, rgba } -> PNG (RGBA, 8 Bit, Filter "Sub" je Zeile).
export function kodierePng({ breite, hoehe, rgba }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breite, 0);
  ihdr.writeUInt32BE(hoehe, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const zeile = breite * 4;
  const roh = Buffer.alloc(hoehe * (zeile + 1));
  for (let y = 0; y < hoehe; y += 1) {
    const start = y * (zeile + 1);
    roh[start] = 1;
    for (let i = 0; i < zeile; i += 1) {
      const wert = rgba[y * zeile + i];
      const links = i >= 4 ? rgba[y * zeile + i - 4] : 0;
      roh[start + 1 + i] = (wert - links) & 0xff;
    }
  }
  return Buffer.concat([SIGNATUR, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(roh, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// Flaechenmittel auf hoechstens max x max, Seitenverhaeltnis bleibt. Farben
// werden mit Alpha gewichtet, damit transparente Raender nicht abfaerben.
// Kleinere Bilder bleiben, wie sie sind (kein Hochskalieren).
export function verkleinere(bild, max) {
  const { breite, hoehe, rgba } = bild;
  if (breite <= max && hoehe <= max) return bild;
  const faktor = Math.max(breite, hoehe) / max;
  const nb = Math.max(1, Math.round(breite / faktor));
  const nh = Math.max(1, Math.round(hoehe / faktor));
  const aus = new Uint8Array(nb * nh * 4);
  for (let y = 0; y < nh; y += 1) {
    const y0 = (y * hoehe) / nh;
    const y1 = ((y + 1) * hoehe) / nh;
    for (let x = 0; x < nb; x += 1) {
      const x0 = (x * breite) / nb;
      const x1 = ((x + 1) * breite) / nb;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let flaeche = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy += 1) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx += 1) {
          const w = wy * (Math.min(x1, sx + 1) - Math.max(x0, sx));
          const o = (sy * breite + sx) * 4;
          const alpha = rgba[o + 3] * w;
          r += rgba[o] * alpha;
          g += rgba[o + 1] * alpha;
          b += rgba[o + 2] * alpha;
          a += alpha;
          flaeche += w;
        }
      }
      const o = (y * nb + x) * 4;
      if (a > 0) {
        aus[o] = Math.round(r / a);
        aus[o + 1] = Math.round(g / a);
        aus[o + 2] = Math.round(b / a);
      }
      aus[o + 3] = Math.round(a / flaeche);
    }
  }
  return { breite: nb, hoehe: nh, rgba: aus };
}

// prototyp/e1/rundweg.mjs
// Vergleich zweier Datenordner fuer den Rundweg JSON -> DB -> JSON und die
// Migration: je Datei byte-gleich, feldgleich (gleiche Datensaetze, gleiche
// Reihenfolge, gleiche Schluessel in gleicher Reihenfolge, gleiche Werte) oder
// abweichend. Dazu Zahlen, deren Schreibweise ein JSON-Rundweg nicht erhaelt
// (1.50, 1e3, ganze Zahlen ueber 2^53) – die gingen auch heute schon bei
// jedem Werkzeuglauf verloren, sollen aber sichtbar sein.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

function parse(name, text) {
  if (name.endsWith(".jsonl")) return text.split(/\r?\n/).filter((z) => z.trim()).map((z) => JSON.parse(z));
  if (name.endsWith(".json")) return JSON.parse(text);
  return null;
}

// Zahl-Literale ausserhalb von Strings, deren Text sich beim Rundweg aendert.
export function verlustbehafteteZahlen(text) {
  const funde = [];
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"') {
      for (i += 1; i < text.length && text[i] !== '"'; i += 1) if (text[i] === "\\") i += 1;
    } else if (c === "-" || (c >= "0" && c <= "9")) {
      const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 40));
      if (m) {
        if (JSON.stringify(JSON.parse(m[0])) !== m[0]) funde.push(m[0]);
        i += m[0].length - 1;
      }
    }
  }
  return funde;
}

export async function vergleicheOrdner(a, b) {
  const liste = async (o) => (await readdir(o, { withFileTypes: true })).filter((e) => e.isFile() && !e.name.startsWith(".") && e.name !== "MANIFEST.json").map((e) => e.name).sort();
  const [la, lb] = [await liste(a), await liste(b)];
  const ergebnis = { byte: [], feld: [], abweichung: [], zahlen: {} };
  for (const name of new Set([...la, ...lb])) {
    if (!la.includes(name) || !lb.includes(name)) {
      ergebnis.abweichung.push(`${name}: nur in ${la.includes(name) ? "A" : "B"}`);
      continue;
    }
    const [x, y] = [await readFile(path.join(a, name)), await readFile(path.join(b, name))];
    if (x.equals(y)) {
      ergebnis.byte.push(name);
      continue;
    }
    const [px, py] = [parse(name, x.toString("utf8")), parse(name, y.toString("utf8"))];
    // JSON.stringify vergleicht Werte UND Schluesselreihenfolge UND fehlende
    // optionale Felder (undefined faellt weg, null bleibt).
    if (px !== null && JSON.stringify(px) === JSON.stringify(py)) {
      ergebnis.feld.push(name);
      const z = verlustbehafteteZahlen(x.toString("utf8"));
      if (z.length) ergebnis.zahlen[name] = z;
    } else ergebnis.abweichung.push(`${name}: Inhalt verschieden`);
  }
  return ergebnis;
}

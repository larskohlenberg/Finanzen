// app/tools/lib/ocr.mjs
//
// Gemeinsame Texterkennung fuer den Inbox-Vorlauf (inbox.mjs) und den
// Textzwilling unter Belege/ (belege-text.mjs). Beide muessen fuer dieselbe
// Datei denselben Text liefern — das Aufraeumen von standardized/ paart
// Vorlauf und Zwilling ueber den Inhalts-Hash.
//
// - PDF mit Textlayer: rohes `pdftotext -layout`, ohne Kopfzeile.
// - PDF ohne Textlayer: Seiten mit `pdftoppm -r 300 -png` rastern, jede Seite
//   per `tesseract - -l deu+eng` erkennen.
// - Bild (png/jpg/jpeg): direkt per tesseract.
// OCR-Text bekommt die Kopfzeile `# Per OCR (tesseract) erkannt, <Datum>.`
// Liefert OCR weniger als MIN_OCR_ZEICHEN Zeichen (ohne Leerraum) oder fehlt
// tesseract, ist das Ergebnis "ohne-text": dann liest der Agent selbst.
import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const OCR_KOPF = "# Per OCR (tesseract) erkannt";
export const MIN_OCR_ZEICHEN = 20;
export const BILD_ENDUNGEN = Object.freeze(["png", "jpg", "jpeg"]);

const SPRACHEN = "deu+eng";

export function istBild(pfad) {
  const m = /\.([^./\\]+)$/.exec(String(pfad));
  return Boolean(m) && BILD_ENDUNGEN.includes(m[1].toLowerCase());
}

export function ocrKopfzeile(datum) {
  return `${OCR_KOPF}, ${datum}.\n`;
}

// Text nach der OCR-Kopfzeile, oder null, wenn inhalt kein OCR-Text ist.
export function ocrRumpf(inhalt) {
  if (!String(inhalt).startsWith(OCR_KOPF)) return null;
  const umbruch = inhalt.indexOf("\n");
  return umbruch < 0 ? "" : inhalt.slice(umbruch + 1);
}

export function zeichenOhneLeerraum(text) {
  return String(text).replace(/\s/g, "").length;
}

export function heuteLokal(jetzt = new Date()) {
  const zwei = (n) => String(n).padStart(2, "0");
  return `${jetzt.getFullYear()}-${zwei(jetzt.getMonth() + 1)}-${zwei(jetzt.getDate())}`;
}

function lauf(befehl, args) {
  return new Promise((resolve, reject) => {
    execFile(befehl, args, { maxBuffer: 64 * 1024 * 1024, timeout: 300000, encoding: "utf8" }, (fehler, stdout) => {
      if (fehler) reject(fehler); else resolve(stdout);
    });
  });
}

// `pdftotext … -` liefert exakt dieselben Bytes wie die Dateiausgabe
// (siehe tests/belege-text.test.mjs).
export function pdftotext(pdfPfad) {
  return lauf("pdftotext", ["-layout", pdfPfad, "-"]);
}

export function tesseractBild(bildPfad) {
  return lauf("tesseract", [bildPfad, "-", "-l", SPRACHEN]);
}

export async function tesseractPdf(pdfPfad) {
  const ordner = await mkdtemp(path.join(tmpdir(), "finanzen-ocr-"));
  try {
    await lauf("pdftoppm", ["-r", "300", "-png", pdfPfad, path.join(ordner, "seite")]);
    // pdftoppm nummeriert mit fester Stellenzahl: Namenssortierung = Seitenfolge.
    const seiten = (await readdir(ordner)).filter((n) => n.endsWith(".png")).sort();
    let text = "";
    for (const seite of seiten) text += await tesseractBild(path.join(ordner, seite));
    return text;
  } finally {
    await rm(ordner, { recursive: true, force: true });
  }
}

const seitenZahl = (text) => (text.match(/\f/g) ?? []).length;

// Ergebnis: { art: "text"|"ocr", inhalt } oder
// { art: "ohne-text", rohtext, seiten, grund, ocrFehlt? }.
// pdftotext-Fehler werfen (der Aufrufer meldet sie wie bisher).
export async function erkenneText(pfad, {
  extrahiere = pdftotext,
  ocrBild = tesseractBild,
  ocrPdf = tesseractPdf,
  heute = heuteLokal(),
} = {}) {
  const bild = istBild(pfad);
  let rohtext = "";
  if (!bild) {
    rohtext = await extrahiere(pfad);
    if (zeichenOhneLeerraum(rohtext) > 0) return { art: "text", inhalt: rohtext };
  }
  const ohneText = (grund, extra = {}) => ({ art: "ohne-text", rohtext, seiten: bild ? 1 : seitenZahl(rohtext), grund, ...extra });
  let erkannt;
  try {
    erkannt = await (bild ? ocrBild(pfad) : ocrPdf(pfad));
  } catch (fehler) {
    if (fehler.code === "ENOENT") return ohneText(`OCR nicht verfuegbar (${fehler.message})`, { ocrFehlt: true });
    return ohneText(`OCR fehlgeschlagen: ${String(fehler.message).split("\n")[0]}`);
  }
  if (zeichenOhneLeerraum(erkannt) < MIN_OCR_ZEICHEN) return ohneText("OCR lieferte zu wenig Text");
  return { art: "ocr", inhalt: ocrKopfzeile(heute) + erkannt };
}

// tests/ocr.test.mjs
// Gemeinsame Texterkennung fuer Inbox-Vorlauf und Belege-Zwilling. Die
// externen Programme (pdftotext, tesseract) sind injiziert.
import assert from "node:assert/strict";
import { test } from "node:test";
import { OCR_KOPF, MIN_OCR_ZEICHEN, erkenneText, istBild, ocrKopfzeile, ocrRumpf } from "../app/tools/lib/ocr.mjs";

const fehlt = async () => { throw Object.assign(new Error("spawn tesseract ENOENT"), { code: "ENOENT" }); };
const nie = async () => { throw new Error("darf nicht laufen"); };
const OCR_TEXT = "Quittung Musterladen\nSumme 12,50 EUR\n\f";

test("istBild: png, jpg, jpeg case-insensitiv; heic und pdf nicht", () => {
  for (const p of ["a.png", "b.JPG", "c.jpeg"]) assert.equal(istBild(p), true, p);
  for (const p of ["a.pdf", "b.heic", "c.txt", "png"]) assert.equal(istBild(p), false, p);
});

test("Kopfzeile ist die vereinbarte und nicht die Marker-Kopfzeile", () => {
  assert.equal(ocrKopfzeile("2026-10-11"), "# Per OCR (tesseract) erkannt, 2026-10-11.\n");
  assert.ok(!OCR_KOPF.startsWith("# Kein Textlayer"));
  assert.equal(MIN_OCR_ZEICHEN, 20);
});

test("PDF mit Textlayer: rohes pdftotext ohne Kopfzeile, kein OCR", async () => {
  const r = await erkenneText("/x/a.pdf", { extrahiere: async () => "Text\n\f", ocrPdf: nie, ocrBild: nie });
  assert.deepEqual(r, { art: "text", inhalt: "Text\n\f" });
});

test("PDF ohne Textlayer: OCR mit Kopfzeile", async () => {
  const r = await erkenneText("/x/scan.pdf", { extrahiere: async () => "\f\f", ocrPdf: async () => OCR_TEXT, ocrBild: nie, heute: "2026-10-11" });
  assert.deepEqual(r, { art: "ocr", inhalt: `# Per OCR (tesseract) erkannt, 2026-10-11.\n${OCR_TEXT}` });
  assert.equal(ocrRumpf(r.inhalt), OCR_TEXT);
  assert.equal(ocrRumpf("normaler Text\n"), null);
});

test("Bild: direkt OCR, pdftotext laeuft nicht", async () => {
  const r = await erkenneText("/x/foto.JPG", { extrahiere: nie, ocrBild: async () => OCR_TEXT, ocrPdf: nie, heute: "2026-10-11" });
  assert.equal(r.art, "ocr");
});

test("OCR mit zu wenig Text bleibt ohne Text", async () => {
  const r = await erkenneText("/x/scan.pdf", { extrahiere: async () => "\f\f", ocrPdf: async () => " ab \n cd\f", ocrBild: nie });
  assert.deepEqual(r, { art: "ohne-text", rohtext: "\f\f", seiten: 2, grund: "OCR lieferte zu wenig Text" });
});

test("tesseract fehlt: ohne Text, Grund benannt, nicht geworfen", async () => {
  const r = await erkenneText("/x/scan.pdf", { extrahiere: async () => "\f", ocrPdf: fehlt, ocrBild: nie });
  assert.equal(r.art, "ohne-text");
  assert.equal(r.rohtext, "\f");
  assert.equal(r.ocrFehlt, true);
  assert.match(r.grund, /nicht verfuegbar/);
  const bild = await erkenneText("/x/foto.png", { extrahiere: nie, ocrBild: fehlt, ocrPdf: nie });
  assert.deepEqual({ art: bild.art, rohtext: bild.rohtext, seiten: bild.seiten }, { art: "ohne-text", rohtext: "", seiten: 1 });
});

test("OCR-Fehler (kaputte Datei) wird als Grund gemeldet", async () => {
  const r = await erkenneText("/x/foto.png", { extrahiere: nie, ocrBild: async () => { throw new Error("Image file cannot be read"); }, ocrPdf: nie });
  assert.equal(r.art, "ohne-text");
  assert.match(r.grund, /OCR fehlgeschlagen: Image file cannot be read/);
});

test("PDF mit teilweisem Textlayer: nur leere Seiten per OCR, Textseiten roh, mit Kopfzeile", async () => {
  const angefragt = [];
  const ocrPdf = async (_pfad, seiten) => { angefragt.push(seiten); return "Seite eins erkannt per OCR\fSeite drei erkannt per OCR\f"; };
  const r = await erkenneText("/x/sammel.pdf", { extrahiere: async () => "\fTextlayer Seite zwei\n\f \n\f", ocrPdf, ocrBild: nie, heute: "2026-10-16" });
  assert.deepEqual(angefragt, [[1, 3]]);
  assert.equal(r.art, "ocr");
  assert.equal(r.inhalt, "# Per OCR (tesseract) erkannt, 2026-10-16.\nSeite eins erkannt per OCR\fTextlayer Seite zwei\n\fSeite drei erkannt per OCR\f");
});

test("PDF mit Textlayer und leerer Seite: bringt OCR nichts oder fehlt es, bleibt rohes pdftotext", async () => {
  const roh = "Kontoauszug Seite eins\n\f\f";
  const leer = await erkenneText("/x/a.pdf", { extrahiere: async () => roh, ocrPdf: async () => " \f", ocrBild: nie });
  assert.deepEqual(leer, { art: "text", inhalt: roh });
  const ohne = await erkenneText("/x/a.pdf", { extrahiere: async () => roh, ocrPdf: fehlt, ocrBild: nie });
  assert.deepEqual(ohne, { art: "text", inhalt: roh });
});

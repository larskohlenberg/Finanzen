// tests/belege-text-ocr.test.mjs
// OCR im Textzwilling: Bilder und PDFs ohne Textlayer, Nachholen alter
// Marker, Uebernahme des OCR-Vorlaufs aus standardized/ (Hash-Abgleich).
// OCR und pdftotext sind injiziert; Tempverzeichnisse, keine Echtdaten.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { planZwillinge, markerText, MARKER_KOPF, main } from "../app/tools/belege-text.mjs";
import { erzeugeTextvorlauf } from "../app/tools/inbox.mjs";

const OCR_TEXT = "Quittung Musterladen Testhausen\nSumme 12,50 EUR\n\f";
const fehlt = async () => { throw Object.assign(new Error("spawn tesseract ENOENT"), { code: "ENOENT" }); };

async function mitWurzel(lauf) {
  const wurzel = await mkdtemp(join(tmpdir(), "belege-text-ocr-"));
  const url = pathToFileURL(`${wurzel}/`);
  const roots = { belegeRoot: new URL("Belege/", url), stagingRoot: new URL("standardized/", url), processedRoot: new URL("processed/", url) };
  await mkdir(fileURLToPath(roots.belegeRoot), { recursive: true });
  await mkdir(fileURLToPath(roots.stagingRoot), { recursive: true });
  const log = console.log;
  console.log = () => {};
  try {
    await lauf({ wurzel, ...roots, belege: (rel) => join(wurzel, "Belege", rel) });
  } finally {
    console.log = log;
    await rm(wurzel, { recursive: true, force: true });
  }
}

test("planZwillinge: Bilder bekommen einen Zwilling, Marker kommen zum Nachholen", () => {
  const plan = planZwillinge({
    belege: [
      { pfad: "Belege/2026/Sonstiges/quittung.JPG" },
      { pfad: "Belege/2026/Sonstiges/foto.png" },
      { pfad: "Belege/2026/Sonstiges/foto.txt", kopf: "# Per OCR (tesseract) erkannt, 2026-10-11." },
      { pfad: "Belege/2026/Sonstiges/scan.pdf" },
      { pfad: "Belege/2026/Sonstiges/scan.txt", kopf: `${MARKER_KOPF} — Bildscan, 2 Seiten. Inhalt nur im PDF.` },
      { pfad: "Belege/2026/Sonstiges/alt.heic" },
    ],
  });
  assert.deepEqual(plan.erzeugen, [{ bild: "Belege/2026/Sonstiges/quittung.JPG", ziel: "Belege/2026/Sonstiges/quittung.txt" }]);
  assert.deepEqual(plan.ocrNachholen, [{ pdf: "Belege/2026/Sonstiges/scan.pdf", ziel: "Belege/2026/Sonstiges/scan.txt" }]);
  assert.deepEqual(plan.offen, [{ ort: "Belege/2026/Sonstiges/scan.txt", grund: "OCR ausstehend" }], "OCR-Zwilling ist erledigt, kein Zwilling ohne Beleg");
});

test("markerText fuer Bilder traegt dieselbe Marker-Kopfzeile", () => {
  assert.ok(markerText(1, { bild: true }).startsWith(MARKER_KOPF));
  assert.equal(markerText(2), "# Kein Textlayer — Bildscan, 2 Seiten. Inhalt nur im PDF.\n");
});

test("main: Bild und Scan-PDF bekommen OCR-Zwilling mit Kopfzeile, Text-PDF bleibt ohne", async () => {
  await mitWurzel(async ({ belegeRoot, stagingRoot, processedRoot, belege }) => {
    await writeFile(belege("foto.png"), "png");
    await writeFile(belege("scan.pdf"), "scan");
    await writeFile(belege("text.pdf"), "text");
    const erkennung = {
      extrahiere: async (p) => (p.endsWith("text.pdf") ? "Normaler Text\n\f" : "\f\f"),
      ocrBild: async () => OCR_TEXT,
      ocrPdf: async () => OCR_TEXT,
      heute: "2026-10-11",
    };
    const vorschau = await main({ belegeRoot, stagingRoot, processedRoot, erkennung });
    assert.deepEqual(vorschau.erzeugt.map((e) => [e.ort, e.art]), [
      ["Belege/foto.txt", "ocr"], ["Belege/scan.txt", "ocr"], ["Belege/text.txt", "text"],
    ]);
    assert.deepEqual(await readdir(fileURLToPath(belegeRoot)), ["foto.png", "scan.pdf", "text.pdf"], "Vorschau schreibt nichts");

    const bericht = await main({ belegeRoot, stagingRoot, processedRoot, erkennung, schreiben: true });
    assert.equal(bericht.belege, 3);
    assert.equal(await readFile(belege("foto.txt"), "utf8"), `# Per OCR (tesseract) erkannt, 2026-10-11.\n${OCR_TEXT}`);
    assert.equal(await readFile(belege("text.txt"), "utf8"), "Normaler Text\n\f");
    assert.deepEqual(bericht.offen, []);
  });
});

test("main: OCR ohne Ergebnis oder ohne tesseract -> Marker wie bisher, Hinweis im Bericht", async () => {
  await mitWurzel(async ({ belegeRoot, stagingRoot, processedRoot, belege }) => {
    await writeFile(belege("scan.pdf"), "scan");
    await writeFile(belege("foto.jpg"), "jpg");
    const bericht = await main({ belegeRoot, stagingRoot, processedRoot, schreiben: true, erkennung: { extrahiere: async () => "\f\f", ocrBild: fehlt, ocrPdf: fehlt } });
    assert.equal(await readFile(belege("scan.txt"), "utf8"), markerText(2));
    assert.ok((await readFile(belege("foto.txt"), "utf8")).startsWith(MARKER_KOPF));
    assert.deepEqual(bericht.offen.map((o) => [o.ort, o.grund]), [["Belege/foto.txt", "OCR ausstehend"], ["Belege/scan.txt", "OCR ausstehend"]]);
    assert.match(bericht.ocr, /nicht verfuegbar/);
  });
});

test("main: vorhandener Marker wird per OCR nachgeholt und ersetzt; Gelesen-Zwilling bleibt", async () => {
  await mitWurzel(async ({ belegeRoot, stagingRoot, processedRoot, belege }) => {
    await writeFile(belege("scan.pdf"), "scan");
    await writeFile(belege("scan.txt"), markerText(2));
    await writeFile(belege("gelesen.pdf"), "scan");
    await writeFile(belege("gelesen.txt"), "# Vom Agenten aus dem Bildscan gelesen, 2026-08-11.\nText\n");
    const erkennung = { extrahiere: async () => "\f\f", ocrPdf: async () => OCR_TEXT, ocrBild: fehlt, heute: "2026-10-11" };

    const vorschau = await main({ belegeRoot, stagingRoot, processedRoot, erkennung });
    assert.deepEqual(vorschau.erzeugt, [{ ort: "Belege/scan.txt", art: "ocr", ersetzt: "marker" }]);
    assert.deepEqual(vorschau.offen, [], "der nachgeholte Marker ist nicht mehr offen");
    assert.equal(await readFile(belege("scan.txt"), "utf8"), markerText(2), "Vorschau ersetzt nichts");

    await main({ belegeRoot, stagingRoot, processedRoot, erkennung, schreiben: true });
    assert.equal(await readFile(belege("scan.txt"), "utf8"), `# Per OCR (tesseract) erkannt, 2026-10-11.\n${OCR_TEXT}`);
    assert.match(await readFile(belege("gelesen.txt"), "utf8"), /Vom Agenten/);
  });
});

test("Inbox-Vorlauf und spaeterer Zwilling sind byte-identisch, standardized/ wird geraeumt", async () => {
  await mitWurzel(async ({ wurzel, belegeRoot, stagingRoot, processedRoot, belege }) => {
    // Schritt 1, Tag 1: inbox.mjs erzeugt den OCR-Vorlauf fuer ein Foto.
    const inbox = join(wurzel, "inbox");
    await mkdir(inbox);
    await writeFile(join(inbox, "IMG_0001.jpg"), "jpg");
    const vorlauf = await erzeugeTextvorlauf(join(inbox, "IMG_0001.jpg"), { ocrBild: async () => OCR_TEXT, heute: "2026-10-10" });
    assert.equal(vorlauf.art, "ocr");
    await writeFile(new URL("IMG_0001.txt", stagingRoot), vorlauf.inhalt);

    // Agent legt das Foto sprechend benannt ab; belege-text laeuft an Tag 2.
    await writeFile(belege("Quittung_Musterladen.jpg"), "jpg");
    const bericht = await main({ belegeRoot, stagingRoot, processedRoot, schreiben: true, erkennung: { ocrBild: async () => OCR_TEXT, heute: "2026-10-11" } });

    assert.equal(await readFile(belege("Quittung_Musterladen.txt"), "utf8"), vorlauf.inhalt, "Zwilling uebernimmt den Vorlauf samt Datum");
    assert.deepEqual(bericht.geloescht.map((g) => g.name), ["IMG_0001.txt"]);
    assert.deepEqual(await readdir(fileURLToPath(stagingRoot)), []);
  });
});

test("Inbox-Vorlauf: Text-PDF unveraendert, Scan ohne OCR wie bisher roh, Bild ohne OCR ohne Vorlauf", async () => {
  const text = await erzeugeTextvorlauf("/x/a.pdf", { extrahiere: async () => "Text\n\f" });
  assert.deepEqual(text, { art: "text", inhalt: "Text\n\f" });
  const scan = await erzeugeTextvorlauf("/x/s.pdf", { extrahiere: async () => "\f\f", ocrPdf: fehlt });
  assert.equal(scan.art, "ohne-text");
  assert.equal(scan.inhalt, "\f\f", "wie bisher: roher pdftotext-Vorlauf, den belege-text als leer raeumt");
  const bild = await erzeugeTextvorlauf("/x/f.png", { ocrBild: fehlt });
  assert.equal(bild.art, "ohne-text");
  assert.equal(bild.inhalt, null);
});

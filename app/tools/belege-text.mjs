// app/tools/belege-text.mjs
//
// Textzwilling der Belege: Jedes PDF und Bild (png/jpg/jpeg) unter `Belege/`
// hat eine gleichnamige `.txt` daneben. Der Zwilling ist rohes
// `pdftotext -layout`-Ergebnis und deshalb jederzeit aus dem Beleg
// wiederherstellbar — er wird neu erzeugt, nicht verschoben. Bilder und PDFs
// ohne Textlayer gehen durch OCR (lib/ocr.mjs, dieselbe Erkennung wie der
// Inbox-Vorlauf); deren Zwilling traegt die OCR-Kopfzeile. Bringt OCR nichts,
// bleibt der Marker "Kein Textlayer" und der Fall "OCR ausstehend". Alte
// Marker werden bei jedem Lauf per OCR nachgeholt.
//
// `data/inbox/standardized/` wird ueber den Inhalts-Hash aufgeraeumt, nicht
// ueber den Dateinamen: Der Agent benennt Belege beim Ablegen um, Namen
// driften also systematisch auseinander. Inhalte tun das nicht.

import { readFile, writeFile, readdir, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { erkenneText, istBild, ocrRumpf, OCR_KOPF } from "./lib/ocr.mjs";
import { bestandOrte } from "./lib/bestand-orte.mjs";
import { pflichtDatenroot } from "./data-root.mjs";

const execFileAsync = promisify(execFile);

export const MARKER_KOPF = "# Kein Textlayer";
export const GELESEN_KOPF = "# Vom Agenten aus dem Bildscan gelesen";

const nfc = (wert) => wert.normalize("NFC");
const nachPfad = (a, b) => a.pfad.localeCompare(b.pfad);
const istPdf = (pfad) => /\.pdf$/i.test(pfad);
const istTxt = (pfad) => /\.txt$/i.test(pfad);
const istQuelle = (pfad) => istPdf(pfad) || istBild(pfad);
const zielFuer = (pfad) => pfad.replace(/\.(pdf|png|jpe?g)$/i, ".txt");
// Auftrag: { pdf, ziel } fuer PDFs, { bild, ziel } fuer Bilder.
const auftragFuer = (quelle) => ({ [istPdf(quelle) ? "pdf" : "bild"]: quelle, ziel: zielFuer(quelle) });
export const quelleVon = (auftrag) => auftrag.pdf ?? auftrag.bild;

export function planZwillinge({ belege }) {
  // Originalpfade (z.B. von macOS readdir in NFD-Form) behalten wir wie gegeben.
  // Nur fuer Vergleiche normalisieren wir temporaer (Typ-Pruefung, Map-Keys, Set).
  const dateien = [...belege].sort(nachPfad);
  const quellen = dateien.filter((datei) => istQuelle(nfc(datei.pfad)));
  const zwillinge = dateien.filter((datei) => istTxt(nfc(datei.pfad)));
  const zwillingNachPfad = new Map(zwillinge.map((zwilling) => [nfc(zwilling.pfad), zwilling]));
  const erwarteteZwillinge = new Set(quellen.map((quelle) => zielFuer(nfc(quelle.pfad))));

  const erzeugen = [];
  const ocrNachholen = [];
  const offen = [];
  const vergeben = new Set();

  for (const quelle of quellen) {
    const zielNorm = zielFuer(nfc(quelle.pfad));
    // a.pdf und a.jpg teilten sich a.txt: der erste gewinnt, der zweite wird gemeldet.
    if (vergeben.has(zielNorm)) {
      offen.push({ ort: quelle.pfad, grund: "Zwilling mehrdeutig (gleicher Basisname)" });
      continue;
    }
    vergeben.add(zielNorm);
    const vorhanden = zwillingNachPfad.get(zielNorm);
    if (!vorhanden) {
      erzeugen.push(auftragFuer(quelle.pfad));
      continue;
    }
    // Der Marker bleibt so lange stehen, bis OCR oder der Agent den Scan
    // gelesen hat. Ihn bei jedem Lauf zu melden macht daraus eine Restliste,
    // die nicht veralten kann, weil sie aus dem Dateisystem hergeleitet wird.
    if ((vorhanden.kopf ?? "").startsWith(MARKER_KOPF)) {
      offen.push({ ort: vorhanden.pfad, grund: "OCR ausstehend" });
      ocrNachholen.push({ ...auftragFuer(quelle.pfad), ziel: vorhanden.pfad });
    }
  }

  for (const zwilling of zwillinge) {
    if (!erwarteteZwillinge.has(nfc(zwilling.pfad))) {
      offen.push({ ort: zwilling.pfad, grund: "Zwilling ohne Beleg" });
    }
  }

  offen.sort((a, b) => a.ort.localeCompare(b.ort));
  return { erzeugen, ocrNachholen, offen };
}

export function planAufraeumen({ zwillinge, staging }) {
  // Gepaart wird ueber den Inhalts-Hash, nicht ueber den Dateinamen: Der Agent
  // benennt Belege beim Ablegen sprechend um, Namen driften also systematisch
  // auseinander — Inhalte tun das nicht. Bei mehreren Zwillingen mit gleichem
  // Hash gewinnt der pfad-kleinste, damit der Lauf reproduzierbar bleibt.
  const pfadNachHash = new Map();
  for (const zwilling of [...zwillinge].sort(nachPfad)) {
    if (zwilling.hash && !pfadNachHash.has(zwilling.hash)) {
      pfadNachHash.set(zwilling.hash, zwilling.pfad);
    }
  }

  const loeschen = [];
  const offen = [];

  // Verarbeite Textvorlaeufe in sortierter Reihenfolge fuer Stabilität.
  for (const vorlauf of [...staging].sort((a, b) => a.name.localeCompare(b.name))) {
    // Ein leerer Textvorlauf (nur Form-Feeds oder Leerraum) traegt keine Information
    // und wird immer geraeumt — auch wenn ein Hash-Treffer existiert. Dies verhindert,
    // dass vermeintlich offene Punkte ewig liegen bleiben.
    if (vorlauf.zeichen === 0) {
      loeschen.push({ name: vorlauf.name, grund: "leerer Textvorlauf" });
      continue;
    }

    // Pruefe auf Hash-Treffer mit einem existierenden Beleg.
    const treffer = pfadNachHash.get(vorlauf.hash);
    if (treffer) {
      loeschen.push({ name: vorlauf.name, grund: `Hash-Treffer: ${treffer}` });
      continue;
    }

    // Kein Treffer: Der Beleg wurde noch nicht abgelegt.
    offen.push({ ort: vorlauf.name, grund: "Beleg noch nicht abgelegt" });
  }

  return { loeschen, offen };
}

export function planProcessed({ belege, processed }) {
  // Wie planAufraeumen, aber eine Ebene frueher: `processed/` haelt die
  // Rohdatei, nicht ihren Textvorlauf. Verglichen wird darum PDF gegen PDF.
  const pfadNachHash = new Map();
  for (const beleg of [...belege].sort(nachPfad)) {
    // Ein `.txt` scheidet als Nachweis aus: es ist der abgeleitete Zwilling,
    // jederzeit neu erzeugbar, und belegt nicht, dass das Original je im
    // Archiv ankam. Alles andere zaehlt — CSVs bekommen bewusst keinen
    // Zwilling und muessen sich selbst belegen koennen.
    if (beleg.hash && !istTxt(beleg.pfad) && !pfadNachHash.has(beleg.hash)) {
      pfadNachHash.set(beleg.hash, beleg.pfad);
    }
  }

  const loeschen = [];
  const offen = [];

  for (const datei of [...processed].sort((a, b) => a.name.localeCompare(b.name))) {
    const treffer = pfadNachHash.get(datei.hash);
    if (treffer) {
      loeschen.push({ name: datei.name, grund: `Hash-Treffer: ${treffer}` });
      continue;
    }
    offen.push({ ort: datei.name, grund: "Beleg noch nicht abgelegt" });
  }

  return { loeschen, offen };
}

export function istLeer(text) {
  return text.replace(/\s/g, "").length === 0;
}

export function seitenZahl(text) {
  return (text.match(/\f/g) ?? []).length;
}

export function markerText(seiten, { bild = false } = {}) {
  if (bild) return `${MARKER_KOPF} — Bild. Inhalt nur in der Bilddatei.\n`;
  return `${MARKER_KOPF} — Bildscan, ${seiten} Seiten. Inhalt nur im PDF.\n`;
}

// Wurzeln fuer den normalen CLI-Lauf, aus den Orten des Bestands
// (lib/bestand-orte.mjs). Ein Bestand ohne Belegablage (z. B. data/demo) hat
// belegeRoot null. Tests injizieren stattdessen Tempverzeichnisse ueber die
// main()-Parameter, damit main() nie das echte Belege-Archiv anfassen kann.
const ordnerUrl = (pfad) => pathToFileURL(`${pfad}/`);
export function standardWurzeln(datenroot, appRoot = new URL("../", import.meta.url)) {
  const orte = bestandOrte(fileURLToPath(appRoot), fileURLToPath(datenroot));
  return {
    belegeRoot: orte.belege ? ordnerUrl(orte.belege) : null,
    stagingRoot: ordnerUrl(`${orte.inbox}/standardized`),
    processedRoot: ordnerUrl(`${orte.inbox}/processed`),
  };
}

const hashVon = (inhalt) => createHash("sha256").update(inhalt).digest("hex");
const ersteZeile = (text) => text.split("\n", 1)[0];
const urlUnterBelege = (pfad, belegeRoot) => new URL(pfad.split("/").slice(1).map(encodeURIComponent).join("/"), belegeRoot);

async function dateienUnter(ordner, praefix) {
  const eintraege = await readdir(ordner, { withFileTypes: true });
  const gefunden = [];
  for (const eintrag of eintraege.sort((a, b) => a.name.localeCompare(b.name))) {
    if (eintrag.name.startsWith(".")) continue;
    const pfad = `${praefix}${eintrag.name}`;
    if (eintrag.isDirectory()) {
      gefunden.push(...(await dateienUnter(new URL(`${encodeURIComponent(eintrag.name)}/`, ordner), `${pfad}/`)));
      continue;
    }
    // Nur regulaere Dateien. readdir meldet einen Symlink nicht als
    // Verzeichnis, er kaeme also als vermeintliche Datei durch — und ein
    // readFile darauf bricht mit EISDIR den gesamten Lauf ab. Ein einzelner
    // ungewoehnlicher Verzeichniseintrag darf das Werkzeug nicht lahmlegen.
    if (!eintrag.isFile()) continue;
    gefunden.push(pfad);
  }
  return gefunden;
}

async function ladeBelege(belegeRoot) {
  if (!belegeRoot) return [];
  let pfade;
  try {
    pfade = await dateienUnter(belegeRoot, "Belege/");
  } catch {
    return [];
  }
  return Promise.all(pfade.map(async (pfad) => {
    const inhalt = await readFile(urlUnterBelege(pfad, belegeRoot));
    // Der Kopf interessiert nur beim Zwilling (Bildscan-Marker). Der Hash
    // dagegen bei jeder Datei: er ist der Nachweis, an dem `processed/`
    // aufgeraeumt wird.
    if (!istTxt(pfad)) return { pfad, hash: hashVon(inhalt) };
    return { pfad, hash: hashVon(inhalt), kopf: ersteZeile(inhalt.toString("utf8")) };
  }));
}

async function ladeStaging(stagingRoot) {
  let namen;
  try {
    namen = (await readdir(stagingRoot)).filter((name) => istTxt(name) && !name.startsWith("."));
  } catch {
    return [];
  }
  return Promise.all(namen.sort().map(async (name) => {
    const inhalt = await readFile(new URL(encodeURIComponent(name), stagingRoot));
    const text = inhalt.toString("utf8");
    return { name, hash: hashVon(inhalt), zeichen: text.replace(/\s/g, "").length, ...(text.startsWith(OCR_KOPF) ? { text } : {}) };
  }));
}

async function ladeProcessed(processedRoot) {
  let namen;
  try {
    namen = (await readdir(processedRoot)).filter((name) => !name.startsWith("."));
  } catch {
    return [];
  }
  return Promise.all(namen.sort().map(async (name) => {
    const inhalt = await readFile(new URL(encodeURIComponent(name), processedRoot));
    return { name, hash: hashVon(inhalt) };
  }));
}

// `pdftotext … -` schreibt nach stdout und liefert dabei exakt dieselben Bytes
// wie die Dateiausgabe. Deshalb kein Temp-File — und der Hash bleibt mit den
// vorhandenen Textvorlaeufen vergleichbar. Siehe tests/belege-text.test.mjs,
// das genau diese Behauptung gegen echtes pdftotext verifiziert.
export async function extrahiere(pdfUrl) {
  return pfadExtrahieren(fileURLToPath(pdfUrl));
}

async function pfadExtrahieren(pdfPfad) {
  const { stdout } = await execFileAsync("pdftotext", ["-layout", pdfPfad, "-"], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: "utf8",
  });
  return stdout;
}

// Nach dem ersten "tesseract fehlt" nicht fuer jeden Beleg erneut versuchen.
const keinOcr = async () => {
  throw Object.assign(new Error("OCR nicht verfuegbar"), { code: "ENOENT" });
};

export async function main({
  belegeRoot,
  stagingRoot,
  processedRoot,
  schreiben = process.argv.slice(2).includes("--schreiben"),
  // Injizierbar fuer Tests: { extrahiere, ocrBild, ocrPdf, heute } (lib/ocr.mjs).
  erkennung = {},
} = {}) {
  const belege = await ladeBelege(belegeRoot);
  const { erzeugen, ocrNachholen, offen: offeneBelege } = planZwillinge({ belege });
  const staging = await ladeStaging(stagingRoot);

  const bericht = {
    modus: schreiben ? "geschrieben" : "vorschau",
    belege: belege.filter((datei) => istQuelle(datei.pfad)).length,
    erzeugt: [],
    geloescht: [],
    offen: [],
    fehler: [],
  };

  // OCR-Text eines Belegs, der schon als Vorlauf in standardized/ liegt,
  // wird samt Kopfzeile (Datum!) uebernommen: nur so bleibt der Zwilling
  // byte-identisch zum Vorlauf und das Aufraeumen findet ihn.
  const ocrVorlaeufe = staging.filter((v) => v.text);
  const uebernimmVorlauf = (inhalt) => {
    const rumpf = ocrRumpf(inhalt);
    return ocrVorlaeufe.find((v) => ocrRumpf(v.text) === rumpf)?.text ?? inhalt;
  };
  let ocrFehlt = false;
  const erkenne = async (auftrag) => {
    if (ocrFehlt) erkennung = { ...erkennung, ocrBild: keinOcr, ocrPdf: keinOcr };
    const ergebnis = await erkenneText(fileURLToPath(urlUnterBelege(quelleVon(auftrag), belegeRoot)), { extrahiere: pfadExtrahieren, ...erkennung });
    if (ergebnis.ocrFehlt && !ocrFehlt) {
      ocrFehlt = true;
      bericht.ocr = ergebnis.grund;
    }
    return ergebnis;
  };

  // Die neu erzeugten Zwillinge fliessen in die zweite Phase ein, auch in der
  // Vorschau. Sonst zeigte der Vorschaulauf jeden Textvorlauf als offen an und
  // waere fuer die Migration wertlos.
  const neueZwillinge = [];
  const ersetzt = new Set();

  for (const auftrag of erzeugen) {
    let ergebnis;
    try {
      ergebnis = await erkenne(auftrag);
    } catch (error) {
      bericht.fehler.push({ ort: quelleVon(auftrag), grund: error.message });
      continue;
    }
    let inhalt;
    let art;
    if (ergebnis.art === "ohne-text") {
      inhalt = markerText(ergebnis.seiten, { bild: Boolean(auftrag.bild) });
      art = "marker";
    } else {
      inhalt = ergebnis.art === "ocr" ? uebernimmVorlauf(ergebnis.inhalt) : ergebnis.inhalt;
      art = ergebnis.art;
    }
    if (schreiben) await writeFile(urlUnterBelege(auftrag.ziel, belegeRoot), inhalt);
    neueZwillinge.push({ pfad: auftrag.ziel, hash: hashVon(Buffer.from(inhalt, "utf8")) });
    bericht.erzeugt.push({ ort: auftrag.ziel, art, ...(art === "marker" && !ergebnis.ocrFehlt ? { ocr: ergebnis.grund } : {}) });
    if (art === "marker") bericht.offen.push({ ort: auftrag.ziel, grund: "OCR ausstehend" });
  }

  // Alte Marker nachholen: jetzt verfuegbares OCR ersetzt sie. Klappt es
  // nicht, bleibt der Marker unveraendert und der Fall offen.
  for (const auftrag of ocrNachholen) {
    if (ocrFehlt) break;
    let ergebnis;
    try {
      ergebnis = await erkenne(auftrag);
    } catch (error) {
      bericht.fehler.push({ ort: quelleVon(auftrag), grund: error.message });
      continue;
    }
    if (ergebnis.art === "ohne-text") continue;
    const inhalt = ergebnis.art === "ocr" ? uebernimmVorlauf(ergebnis.inhalt) : ergebnis.inhalt;
    if (schreiben) await writeFile(urlUnterBelege(auftrag.ziel, belegeRoot), inhalt);
    ersetzt.add(auftrag.ziel);
    neueZwillinge.push({ pfad: auftrag.ziel, hash: hashVon(Buffer.from(inhalt, "utf8")) });
    bericht.erzeugt.push({ ort: auftrag.ziel, art: ergebnis.art, ersetzt: "marker" });
  }

  const zwillinge = [...belege.filter((datei) => istTxt(datei.pfad) && !ersetzt.has(datei.pfad)), ...neueZwillinge];
  const { loeschen, offen: offenesStaging } = planAufraeumen({ zwillinge, staging });

  for (const auftrag of loeschen) {
    if (schreiben) await rm(new URL(encodeURIComponent(auftrag.name), stagingRoot), { force: true });
    bericht.geloescht.push(auftrag);
  }

  // `processed/` haelt die Rohdatei selbst. Sie darf erst weichen, wenn ihr
  // Inhalt nachweislich unter `Belege/` liegt — der Beleg ist das Archiv, der
  // Eingang nur die Durchgangsstation. `error/` wird nie angefasst: dort
  // stehen Faelle, die noch eine Entscheidung brauchen.
  const rohdateien = await ladeProcessed(processedRoot);
  const { loeschen: rohLoeschen, offen: offeneRohdateien } = planProcessed({ belege, processed: rohdateien });

  for (const auftrag of rohLoeschen) {
    if (schreiben) await rm(new URL(encodeURIComponent(auftrag.name), processedRoot), { force: true });
    bericht.geloescht.push(auftrag);
  }

  bericht.offen.push(...offeneBelege.filter((o) => !ersetzt.has(o.ort)), ...offenesStaging, ...offeneRohdateien);
  console.log(JSON.stringify(bericht, null, 2));

  if (!schreiben) console.log("\nVorschau — nichts erzeugt, nichts geloescht. Mit --schreiben anwenden.");
  return bericht;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(() => {
    const datenroot = pflichtDatenroot(process.argv.slice(2).find((a) => !a.startsWith("--")));
    return main(standardWurzeln(datenroot));
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

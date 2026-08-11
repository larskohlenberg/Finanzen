// app/tools/belege-text.mjs
//
// Textzwilling der Belege: Jedes PDF unter `Belege/` hat eine gleichnamige
// `.txt` daneben. Der Zwilling ist rohes `pdftotext -layout`-Ergebnis und
// deshalb jederzeit aus dem Beleg wiederherstellbar — er wird neu erzeugt,
// nicht verschoben.
//
// `data/inbox/standardized/` wird ueber den Inhalts-Hash aufgeraeumt, nicht
// ueber den Dateinamen: Der Agent benennt Belege beim Ablegen um, Namen
// driften also systematisch auseinander. Inhalte tun das nicht.

import { readFile, writeFile, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

const execFileAsync = promisify(execFile);

export const MARKER_KOPF = "# Kein Textlayer";
export const GELESEN_KOPF = "# Vom Agenten aus dem Bildscan gelesen";

const nfc = (wert) => wert.normalize("NFC");
const nachPfad = (a, b) => a.pfad.localeCompare(b.pfad);
const istPdf = (pfad) => /\.pdf$/i.test(pfad);
const istTxt = (pfad) => /\.txt$/i.test(pfad);
const zielFuer = (pfad) => pfad.replace(/\.pdf$/i, ".txt");

export function planZwillinge({ belege }) {
  // Originalpfade (z.B. von macOS readdir in NFD-Form) behalten wir wie gegeben.
  // Nur fuer Vergleiche normalisieren wir temporaer (Typ-Pruefung, Map-Keys, Set).
  const dateien = [...belege].sort(nachPfad);
  const pdfs = dateien.filter((datei) => istPdf(nfc(datei.pfad)));
  const zwillinge = dateien.filter((datei) => istTxt(nfc(datei.pfad)));
  const zwillingNachPfad = new Map(zwillinge.map((zwilling) => [nfc(zwilling.pfad), zwilling]));
  const erwarteteZwillinge = new Set(pdfs.map((pdf) => zielFuer(nfc(pdf.pfad))));

  const erzeugen = [];
  const offen = [];

  for (const pdf of pdfs) {
    const zielNorm = zielFuer(nfc(pdf.pfad));
    const vorhanden = zwillingNachPfad.get(zielNorm);
    if (!vorhanden) {
      erzeugen.push({ pdf: pdf.pfad, ziel: zielFuer(pdf.pfad) });
      continue;
    }
    // Der Marker bleibt so lange stehen, bis der Agent den Scan gelesen hat.
    // Ihn bei jedem Lauf zu melden macht daraus eine Restliste, die nicht
    // veralten kann, weil sie aus dem Dateisystem hergeleitet wird.
    if ((vorhanden.kopf ?? "").startsWith(MARKER_KOPF)) {
      offen.push({ ort: vorhanden.pfad, grund: "OCR ausstehend" });
    }
  }

  for (const zwilling of zwillinge) {
    if (!erwarteteZwillinge.has(nfc(zwilling.pfad))) {
      offen.push({ ort: zwilling.pfad, grund: "Zwilling ohne Beleg" });
    }
  }

  offen.sort((a, b) => a.ort.localeCompare(b.ort));
  return { erzeugen, offen };
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

export function istLeer(text) {
  return text.replace(/\s/g, "").length === 0;
}

export function seitenZahl(text) {
  return (text.match(/\f/g) ?? []).length;
}

export function markerText(seiten) {
  return `${MARKER_KOPF} — Bildscan, ${seiten} Seiten. Inhalt nur im PDF.\n`;
}

// Default-Wurzeln fuer den normalen CLI-Lauf. Tests injizieren stattdessen
// Tempverzeichnisse ueber die main()-Parameter, damit main() nie das echte
// Belege-Archiv anfassen kann.
const BELEGE_STANDARD = new URL("../Belege/", import.meta.url);
const STAGING_STANDARD = new URL("../data/inbox/standardized/", import.meta.url);

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
    gefunden.push(pfad);
  }
  return gefunden;
}

async function ladeBelege(belegeRoot) {
  let pfade;
  try {
    pfade = await dateienUnter(belegeRoot, "Belege/");
  } catch {
    return [];
  }
  return Promise.all(pfade.map(async (pfad) => {
    if (!istTxt(pfad)) return { pfad };
    const inhalt = await readFile(urlUnterBelege(pfad, belegeRoot));
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
    return { name, hash: hashVon(inhalt), zeichen: inhalt.toString("utf8").replace(/\s/g, "").length };
  }));
}

// `pdftotext … -` schreibt nach stdout und liefert dabei exakt dieselben Bytes
// wie die Dateiausgabe. Deshalb kein Temp-File — und der Hash bleibt mit den
// vorhandenen Textvorlaeufen vergleichbar. Siehe tests/belege-text.test.mjs,
// das genau diese Behauptung gegen echtes pdftotext verifiziert.
export async function extrahiere(pdfUrl) {
  const { stdout } = await execFileAsync("pdftotext", ["-layout", fileURLToPath(pdfUrl), "-"], {
    maxBuffer: 64 * 1024 * 1024,
    encoding: "utf8",
  });
  return stdout;
}

export async function main({
  belegeRoot = BELEGE_STANDARD,
  stagingRoot = STAGING_STANDARD,
  schreiben = process.argv.slice(2).includes("--schreiben"),
} = {}) {
  const belege = await ladeBelege(belegeRoot);
  const { erzeugen, offen: offeneBelege } = planZwillinge({ belege });

  const bericht = {
    modus: schreiben ? "geschrieben" : "vorschau",
    belege: belege.filter((datei) => istPdf(datei.pfad)).length,
    erzeugt: [],
    geloescht: [],
    offen: [],
    fehler: [],
  };

  // Die neu erzeugten Zwillinge fliessen in die zweite Phase ein, auch in der
  // Vorschau. Sonst zeigte der Vorschaulauf jeden Textvorlauf als offen an und
  // waere fuer die Migration wertlos.
  const neueZwillinge = [];

  for (const auftrag of erzeugen) {
    let text;
    try {
      text = await extrahiere(urlUnterBelege(auftrag.pdf, belegeRoot));
    } catch (error) {
      bericht.fehler.push({ ort: auftrag.pdf, grund: error.message });
      continue;
    }
    const bildscan = istLeer(text);
    const inhalt = bildscan ? markerText(seitenZahl(text)) : text;
    if (schreiben) await writeFile(urlUnterBelege(auftrag.ziel, belegeRoot), inhalt);
    neueZwillinge.push({ pfad: auftrag.ziel, hash: hashVon(Buffer.from(inhalt, "utf8")) });
    bericht.erzeugt.push({ ort: auftrag.ziel, art: bildscan ? "marker" : "text" });
    if (bildscan) bericht.offen.push({ ort: auftrag.ziel, grund: "OCR ausstehend" });
  }

  const zwillinge = [...belege.filter((datei) => istTxt(datei.pfad)), ...neueZwillinge];
  const { loeschen, offen: offenesStaging } = planAufraeumen({ zwillinge, staging: await ladeStaging(stagingRoot) });

  for (const auftrag of loeschen) {
    if (schreiben) await rm(new URL(encodeURIComponent(auftrag.name), stagingRoot), { force: true });
    bericht.geloescht.push(auftrag);
  }

  bericht.offen.push(...offeneBelege, ...offenesStaging);
  console.log(JSON.stringify(bericht, null, 2));

  if (!schreiben) console.log("\nVorschau — nichts erzeugt, nichts geloescht. Mit --schreiben anwenden.");
  return bericht;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

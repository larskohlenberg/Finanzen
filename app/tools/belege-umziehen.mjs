// app/tools/belege-umziehen.mjs
//
// Belege innerhalb von `Belege/` umziehen und alle Verweise mitnehmen.
// Eingabe ist ein Umzugsplan (JSON-Liste aus { von, nach }, Pfade relativ zum
// App-Raum). Welcher Beleg wohin gehoert, entscheidet der Agent; das Tool prueft
// den Plan, verschiebt Datei und Textzwilling und ersetzt jeden Pfad in den
// Stamm- und Bewegungsdaten (rohquelle, quelle_hinweis, auch Freitext).
// Ein Eintrag mit `kopie: true` legt stattdessen eine Kopie an (Beleg zu
// mehreren Objekten); Quelle und Verweise bleiben, Kopien laufen vor den
// Verschiebungen und lesen die Quelle daher an ihrem alten Platz.
// agent_log.jsonl bleibt unveraendert: das Protokoll haelt fest, was damals war.
//
// Vorschau ist Default, --schreiben wendet an. Ein schon erledigter Umzug
// (Quelle weg, Ziel da) zaehlt als erledigt, damit ein abgebrochener Lauf
// einfach wiederholt werden kann.
//
//   node tools/belege-umziehen.mjs <datenroot> <plan.json> [--schreiben]

import { constants, copyFile, link, lstat, mkdir, readFile, readdir, realpath, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataRootFromArg } from "./data-root.mjs";
import { beginneLauf } from "./lib/fingerabdruck.mjs";
import { belegPfadeAusText } from "../belege.mjs";
import { ersetzeDatei } from "./lib/datei.mjs";

const BELEGE_STANDARD = new URL("../Belege/", import.meta.url);
const PROTOKOLL = "agent_log.jsonl";

const nfc = (wert) => String(wert).normalize("NFC");
const endung = (pfad) => path.posix.extname(pfad).toLowerCase();
const mitZwilling = (pfad) => /\.(pdf|png|jpe?g)$/i.test(pfad);
const zwillingVon = (pfad) => pfad.replace(/\.(pdf|png|jpe?g)$/i, ".txt");

function normiere(pfad) {
  const sauber = path.posix.normalize(nfc(pfad));
  return sauber.startsWith("Belege/") && !sauber.split("/").includes("..") ? sauber : null;
}

// Plan pruefen und um die Textzwillinge ergaenzen. Quellen von Kopien gelten
// im Zustand vor dem Plan. Bei einem Fehler wird
// nichts verschoben: ein halber Umzug ist schlimmer als keiner.
export function planUmzug({ umzuege, vorhandene }) {
  const bestand = new Set(vorhandene.map(nfc));
  const fehler = [];
  const verschiebungen = [];
  const kopien = [];
  const erledigt = [];
  const ersetzungen = new Map();
  const ziele = new Map();

  const nimm = (von, nach, eintrag) => {
    if (ziele.has(nach)) {
      fehler.push({ ...eintrag, grund: `Ziel ${nach} kommt im Plan mehrfach vor` });
      return;
    }
    ziele.set(nach, von);
    if (eintrag.kopie === true) {
      if (bestand.has(nach)) erledigt.push({ von, nach });
      else if (bestand.has(von)) kopien.push({ von, nach });
      else fehler.push({ ...eintrag, grund: `${von} existiert nicht` });
      return;
    }
    if (ersetzungen.has(von)) {
      fehler.push({ ...eintrag, grund: `${von} wird im Plan mehrfach verschoben` });
      return;
    }
    ersetzungen.set(von, nach);
    if (bestand.has(von) && bestand.has(nach)) fehler.push({ ...eintrag, grund: `${nach} existiert bereits` });
    else if (bestand.has(von)) verschiebungen.push({ von, nach });
    else if (bestand.has(nach)) erledigt.push({ von, nach });
    else fehler.push({ ...eintrag, grund: `${von} existiert nicht` });
  };

  for (const eintrag of umzuege ?? []) {
    const von = normiere(eintrag?.von ?? "");
    const nach = normiere(eintrag?.nach ?? "");
    if (!von || !nach) {
      fehler.push({ ...eintrag, grund: "von und nach muessen unter Belege/ liegen" });
      continue;
    }
    if (endung(von) !== endung(nach)) {
      fehler.push({ ...eintrag, grund: `Endung muss gleich bleiben (${endung(von) || "keine"})` });
      continue;
    }
    const vorher = fehler.length;
    nimm(von, nach, eintrag);
    if (fehler.length > vorher || !mitZwilling(von)) continue;
    const zwilling = zwillingVon(von);
    if (bestand.has(zwilling) || bestand.has(zwillingVon(nach))) nimm(zwilling, zwillingVon(nach), eintrag);
  }

  if (fehler.length) return { fehler, verschiebungen: [], kopien: [], erledigt: [], ersetzungen: new Map() };
  return { fehler, verschiebungen, kopien, erledigt, ersetzungen };
}

function regexEscape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Jeden Pfad nur als ganzen Pfad ersetzen: "a.pdf" trifft nicht "a.pdfx".
// Laengere Pfade zuerst, damit kein kuerzerer in einen laengeren greift. Der
// Text selbst bleibt unnormalisiert; gesucht wird in NFC- und NFD-Form.
export function ersetzeVerweise(text, ersetzungen) {
  const paare = [...ersetzungen]
    .flatMap(([von, nach]) => [...new Set([nfc(von), nfc(von).normalize("NFD")])].map((form) => [form, nfc(nach)]))
    .sort((a, b) => b[0].length - a[0].length);
  let neu = text;
  let anzahl = 0;
  for (const [von, nach] of paare) {
    if (!neu.includes(von)) continue;
    neu = neu.replace(new RegExp(`${regexEscape(von)}(?![\\p{L}\\p{N}_\\-/]|\\.[\\p{L}\\p{N}])`, "gu"), () => {
      anzahl += 1;
      return nach;
    });
  }
  return { text: neu, anzahl };
}

async function dateienUnter(ordnerUrl, praefix = "Belege") {
  const ergebnis = [];
  let eintraege;
  try {
    eintraege = await readdir(ordnerUrl, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return ergebnis;
    throw error;
  }
  for (const eintrag of eintraege) {
    const relativ = `${praefix}/${eintrag.name}`;
    if (eintrag.isDirectory()) ergebnis.push(...await dateienUnter(new URL(`${encodeURIComponent(eintrag.name)}/`, ordnerUrl), relativ));
    else if (eintrag.isFile()) ergebnis.push(relativ);
  }
  return ergebnis;
}

const absolutUnter = (belegeRoot, relativ) => path.join(fileURLToPath(belegeRoot), ...relativ.split("/").slice(1));

async function datenDateien(datenRoot) {
  const namen = (await readdir(datenRoot)).filter((name) => /\.(json|jsonl)$/.test(name) && name !== PROTOKOLL).sort();
  return Promise.all(namen.map(async (name) => ({ name, text: await readFile(new URL(name, datenRoot), "utf8") })));
}

async function echterPfad(absolut) {
  // Fuer noch nicht existierende Ziele: naechsten existierenden Vorfahren aufloesen.
  const rest = [];
  let kopf = absolut;
  for (;;) {
    try {
      return path.join(await realpath(kopf), ...rest);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const eltern = path.dirname(kopf);
      if (eltern === kopf) return absolut;
      rest.unshift(path.basename(kopf));
      kopf = eltern;
    }
  }
}

// Quelle: echte Datei, kein Symlink, innerhalb von Belege/. Ziel: frei und
// auch nach Aufloesen aller Symlinks innerhalb von Belege/.
async function pruefeDateisystem(belegeRoot, verschiebungen) {
  const wurzel = await realpath(fileURLToPath(belegeRoot));
  const innen = (p) => p === wurzel || p.startsWith(`${wurzel}${path.sep}`);
  const sperren = [];
  for (const { von, nach } of verschiebungen) {
    const quelle = absolutUnter(belegeRoot, von);
    const ziel = absolutUnter(belegeRoot, nach);
    const info = await lstat(quelle).catch(() => null);
    if (!info?.isFile()) sperren.push({ von, nach, grund: `${von} ist keine regulaere Datei` });
    else if (!innen(await echterPfad(quelle))) sperren.push({ von, nach, grund: `${von} fuehrt aus Belege/ heraus` });
    if (await lstat(ziel).catch(() => null)) sperren.push({ von, nach, grund: `${nach} existiert bereits` });
    else if (!innen(await echterPfad(ziel))) sperren.push({ von, nach, grund: `${nach} fuehrt aus Belege/ heraus` });
  }
  return sperren;
}

// Leere Ordner, die der Umzug hinterlassen hat, entfernen (bis hinauf zu Belege/).
async function raeumeLeereOrdner(belegeRoot, verschiebungen) {
  const wurzel = fileURLToPath(belegeRoot).replace(/[/\\]$/, "");
  const ordner = [...new Set(verschiebungen.map((v) => path.dirname(absolutUnter(belegeRoot, v.von))))].sort((a, b) => b.length - a.length);
  for (let kandidat of ordner) {
    while (kandidat.startsWith(`${wurzel}${path.sep}`)) {
      try {
        await rmdir(kandidat);
      } catch {
        break;
      }
      kandidat = path.dirname(kandidat);
    }
  }
}

export async function main({
  datenRoot = dataRootFromArg(process.argv[2]),
  planDatei = process.argv[3],
  belegeRoot = BELEGE_STANDARD,
  schreiben = process.argv.slice(2).includes("--schreiben"),
} = {}) {
  if (!datenRoot || !planDatei) throw new Error("Aufruf: node tools/belege-umziehen.mjs <datenroot> <plan.json> [--schreiben]");
  const umzuege = JSON.parse(await readFile(planDatei, "utf8"));
  if (!Array.isArray(umzuege)) throw new Error("Der Plan muss eine JSON-Liste aus { von, nach } sein");

  const vorhandene = await dateienUnter(belegeRoot);
  const plan = planUmzug({ umzuege, vorhandene });
  const bericht = {
    modus: schreiben ? "geschrieben" : "vorschau",
    umzuege: umzuege.length,
    verschoben: plan.verschiebungen,
    kopiert: plan.kopien,
    erledigt: plan.erledigt.length,
    verweise: {},
    verwaist: [],
    fehler: plan.fehler,
  };
  if (plan.fehler.length) {
    console.log(JSON.stringify(bericht, null, 2));
    console.log("\nPlan fehlerhaft — nichts verschoben, nichts umgeschrieben.");
    return bericht;
  }

  // Vor dem ersten Schreiben auf dem Dateisystem nachpruefen: Die Liste oben
  // kennt keine Symlinks, und ein Ziel kann seither entstanden sein.
  const sperren = await pruefeDateisystem(belegeRoot, [...plan.kopien, ...plan.verschiebungen]);
  if (sperren.length) {
    bericht.verschoben = [];
    bericht.kopiert = [];
    bericht.fehler = sperren;
    console.log(JSON.stringify(bericht, null, 2));
    console.log("\nPlan fehlerhaft — nichts verschoben, nichts umgeschrieben.");
    return bericht;
  }

  if (schreiben) {
    for (const { von, nach } of plan.kopien) {
      const ziel = absolutUnter(belegeRoot, nach);
      await mkdir(path.dirname(ziel), { recursive: true });
      await copyFile(absolutUnter(belegeRoot, von), ziel, constants.COPYFILE_EXCL);
    }
    for (const { von, nach } of plan.verschiebungen) {
      const ziel = absolutUnter(belegeRoot, nach);
      await mkdir(path.dirname(ziel), { recursive: true });
      // link statt rename: link bricht mit EEXIST ab, rename wuerde still ueberschreiben.
      await link(absolutUnter(belegeRoot, von), ziel);
      await unlink(absolutUnter(belegeRoot, von));
    }
    await raeumeLeereOrdner(belegeRoot, plan.verschiebungen);
  }

  const nachher = new Set(vorhandene.map(nfc));
  for (const { nach } of plan.kopien) nachher.add(nach);
  for (const { von, nach } of plan.verschiebungen) {
    nachher.delete(von);
    nachher.add(nach);
  }
  const verwaist = new Set();
  for (const datei of await datenDateien(datenRoot)) {
    const { text, anzahl } = ersetzeVerweise(datei.text, plan.ersetzungen);
    if (anzahl) {
      bericht.verweise[datei.name] = anzahl;
      if (schreiben) await ersetzeDatei(new URL(datei.name, datenRoot), text);
    }
    for (const pfad of belegPfadeAusText(text)) if (!nachher.has(nfc(pfad))) verwaist.add(pfad);
  }
  bericht.verwaist = [...verwaist].sort();

  console.log(JSON.stringify(bericht, null, 2));
  if (!schreiben) console.log("\nVorschau — nichts verschoben, nichts umgeschrieben. Mit --schreiben anwenden.");
  return bericht;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sperre = process.argv[2] && !process.argv[2].startsWith("--")
    ? beginneLauf(fileURLToPath(dataRootFromArg(process.argv[2])), process.argv.includes("--schreiben"), undefined, { aussenWirkung: true })
    : Promise.resolve();
  sperre.then(() => main()).then((bericht) => {
    if (bericht.fehler.length) process.exitCode = 2;
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

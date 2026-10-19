// app/tools/lib/fingerabdruck.mjs
// Fingerabdruck eines Datenbestands (Review 0B.2): Die Vorschau nennt den
// Stand, den sie gelesen hat; ein Schreiblauf mit diesem Fingerabdruck prueft
// unter der Schreibsperre, ob der Bestand noch derselbe ist. Sonst wird
// abgewiesen, statt gegen einen ungeprueften Stand zu schreiben.
// Gehasht werden Pfad und Inhalt aller Dateien unter dem Datenroot, ohne
// Punktdateien (Schreibsperre, Rueckspiel-Zwischenstaende).
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { sperreFuerProzess } from "./schreibsperre.mjs";

export const FINGERABDRUCK_EXITCODE = 4;

async function dateien(ordner, praefix = "") {
  const eintraege = await readdir(ordner, { withFileTypes: true });
  const liste = [];
  for (const e of eintraege) {
    if (e.name.startsWith(".")) continue;
    const rel = `${praefix}${e.name.normalize("NFC")}`;
    if (e.isDirectory()) liste.push(...(await dateien(path.join(ordner, e.name), `${rel}/`)));
    else if (e.isFile()) liste.push({ rel, pfad: path.join(ordner, e.name) });
  }
  return liste;
}

export async function bestandFingerabdruck(datenroot) {
  const gesamt = createHash("sha256");
  const liste = (await dateien(datenroot)).sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  for (const { rel, pfad } of liste) {
    gesamt.update(`${rel}\0${createHash("sha256").update(await readFile(pfad)).digest("hex")}\n`);
  }
  return gesamt.digest("hex").slice(0, 16);
}

export function veraltetMeldung(datenroot, erwartet, aktuell) {
  return `Bestand ${path.basename(datenroot)} hat sich seit der Vorschau geaendert (Fingerabdruck ${erwartet}, jetzt ${aktuell}). Nichts geschrieben; Vorschau neu ansehen und mit dem neuen Fingerabdruck schreiben.`;
}

export const fingerabdruckArg = (argv) => argv.find((a) => a.startsWith("--fingerabdruck="))?.slice("--fingerabdruck=".length);

// Fuer schreibende CLIs, vor dem ersten Lesen. Schreiblauf: Sperre nehmen und,
// wenn --fingerabdruck=... angegeben ist, den Stand pruefen (veraltet ->
// Meldung, Exitcode 4). Vorschau: den Fingerabdruck des gelesenen Stands nennen
// (auf stderr, damit eine reine JSON-Ausgabe auf stdout lesbar bleibt).
export async function beginneLauf(datenroot, schreiben, argv = process.argv.slice(2)) {
  if (!schreiben) {
    console.error(`Fingerabdruck: ${await bestandFingerabdruck(datenroot)} (zum Schreiben mit --fingerabdruck=... nur gegen diesen Stand)`);
    return;
  }
  await sperreFuerProzess(datenroot);
  const erwartet = fingerabdruckArg(argv);
  if (!erwartet) return;
  const aktuell = await bestandFingerabdruck(datenroot);
  if (aktuell !== erwartet) {
    console.error(veraltetMeldung(datenroot, erwartet, aktuell));
    process.exit(FINGERABDRUCK_EXITCODE);
  }
}

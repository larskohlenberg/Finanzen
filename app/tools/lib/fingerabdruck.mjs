// app/tools/lib/fingerabdruck.mjs
// Fingerabdruck eines Datenbestands (Review 0B.2): Die Vorschau nennt den
// Stand, den sie gelesen hat; ein Schreiblauf mit diesem Fingerabdruck prueft
// unter der Schreibsperre, ob der Bestand noch derselbe ist. Sonst wird
// abgewiesen, statt gegen einen ungeprueften Stand zu schreiben.
// Bei einem Bestand mit Generationen (ADR 0035) ist der Fingerabdruck die
// Generations-Id ("G000042"): Generationen sind unveraenderlich. Bei einem
// einfachen Ordner werden Pfad und Inhalt aller Dateien gehasht, ohne
// Punktdateien (Schreibsperre, Entwuerfe, Temp-Dateien).
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { aktuelleId, bestandsArt, findeBasis, ORDNER } from "./generationen.mjs";
import { imEntwurfsLauf, schreibeImEntwurf, VERALTET_EXITCODE } from "./schreiblauf.mjs";

export const FINGERABDRUCK_EXITCODE = VERALTET_EXITCODE;

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
  const basis = await findeBasis(datenroot);
  if ((await bestandsArt(basis)) !== ORDNER) return `G${await aktuelleId(basis)}`;
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

// Fuer schreibende CLIs, vor dem ersten Lesen.
// - Vorschau: den Fingerabdruck des gelesenen Stands nennen (auf stderr, damit
//   eine reine JSON-Ausgabe auf stdout lesbar bleibt).
// - Schreiblauf: Die CLI startet sich in einem Entwurf neu (lib/schreiblauf.mjs)
//   und endet danach mit dessen Exitcode; beginneLauf kehrt dann nicht zurueck.
//   Mit --fingerabdruck=... wird nur gegen diesen Stand geschrieben (sonst
//   Exitcode 4), eine belegte Sperre gibt Exitcode 3.
// - Im Entwurf (vom Elternprozess oder vom MCP-Server angelegt): direkt
//   schreiben; Sperre und Fingerabdruck hat der Elternprozess geprueft.
// optionen: okCodes, aussenWirkung (siehe schreibeImEntwurf).
export async function beginneLauf(datenroot, schreiben, argv = process.argv.slice(2), optionen = {}) {
  if (!schreiben) {
    console.error(`Fingerabdruck: ${await bestandFingerabdruck(datenroot)} (zum Schreiben mit --fingerabdruck=... nur gegen diesen Stand)`);
    return;
  }
  if (imEntwurfsLauf(datenroot)) return;
  const code = await schreibeImEntwurf(datenroot, argv, { ...optionen, erwartet: fingerabdruckArg(argv), fingerabdruck: bestandFingerabdruck });
  process.exit(code);
}

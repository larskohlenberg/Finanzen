// app/tools/lib/lesestand.mjs
// Lesen aus einem Datenbestand ueber eine Lease (ADR 0035): der Leser sieht
// genau eine Generation, auch wenn waehrenddessen geschrieben wird. Im
// Rueckfallmodus (einfacher Ordner, heute data/master und data/demo) liest er
// den Ordner direkt, wie bisher.
//
// Der Datenroot, den Werkzeuge und Server bekommen (data/master), ist nicht
// immer die Basis des Bestands: nach der Migration (E1 Schritt 5) ist er ein
// Symlink auf <basis>/aktuell. bestandsBasis loest das auf; Lese- und
// Schreibpfad nutzen dieselbe Aufloesung.
import { lstat, readlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ORDNER, ZEIGER, aktuelleId, bestandsArt, mitLeser } from "./generationen.mjs";

const alsPfad = (datenroot) => path.resolve(datenroot instanceof URL ? fileURLToPath(datenroot) : String(datenroot));

export async function bestandsBasis(datenroot) {
  const pfad = alsPfad(datenroot);
  const info = await lstat(pfad).catch(() => null);
  if (info?.isSymbolicLink()) {
    const ziel = path.resolve(path.dirname(pfad), await readlink(pfad));
    if (path.basename(ziel) === ZEIGER) return path.dirname(ziel);
  }
  return pfad;
}

// fn(leser) mit leser = { id, ordner, lies, dateien } aus generationen.mjs plus
// url (file-URL des Ordners mit Schlusstrenner, fuer loadMasterData & Co.).
// id ist die Generations-Id oder ORDNER.
export async function mitLesestand(datenroot, fn) {
  return mitLeser(await bestandsBasis(datenroot), (leser) => fn({ ...leser, url: pathToFileURL(`${leser.ordner}${path.sep}`) }));
}

// Generations-Id des aktuellen Stands oder ORDNER (einfacher Ordner).
export async function lesestandId(datenroot) {
  return aktuelleId(await bestandsBasis(datenroot));
}

export async function istGenerationsBestand(datenroot) {
  return (await bestandsArt(await bestandsBasis(datenroot))) !== ORDNER;
}

export { ORDNER };

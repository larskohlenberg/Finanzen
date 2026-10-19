// Atomares Dateischreiben fuer den Datenbestand: erst eine Temp-Datei im
// selben Ordner schreiben und auf die Platte zwingen, dann per rename an die
// Stelle der alten setzen und den Ordner synchronisieren. Wer mitten im
// Schreiben abbricht (Absturz, SIGKILL, Stromausfall), hinterlaesst die alte
// oder die neue Datei, nie eine abgeschnittene. Liegen bleibt hoechstens eine
// versteckte Temp-Datei (".<name>.<pid>-<zufall>.tmp").
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, link, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Neue Dateien bekommen 0640 (unabhaengig von der umask; die Daten sollen
// nicht fuer alle lesbar werden), bestehende behalten ihren Modus.
const NEU_MODUS = 0o640;

// Marke im Wurzelordner eines Generationen-Entwurfs (lib/generationen.mjs).
// Dort sind unveraenderte Dateien schreibgeschuetzte Hardlinks auf die
// veroeffentlichte Generation: Sie werden per rename ersetzt, nie in place.
export const ENTWURF_MARKE = ".entwurf";

async function liegtImEntwurf(pfad) {
  let ordner = path.dirname(pfad);
  for (;;) {
    if (await stat(path.join(ordner, ENTWURF_MARKE)).then(() => true, () => false)) return true;
    const hoeher = path.dirname(ordner);
    if (hoeher === ordner) return false;
    ordner = hoeher;
  }
}

function alsPfad(ziel) {
  return ziel instanceof URL ? fileURLToPath(ziel) : String(ziel);
}

export function tempPfad(ziel) {
  const pfad = alsPfad(ziel);
  return path.join(path.dirname(pfad), `.${path.basename(pfad)}.${process.pid}-${randomUUID().slice(0, 8)}.tmp`);
}

export async function synchronisiereOrdner(ordner) {
  const handle = await open(alsPfad(ordner), "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

// Schreibt inhalt in eine neue Datei (Fehler, falls sie schon da ist) und
// zwingt sie auf die Platte. Baustein fuer ersetzeDatei und mehrstufige
// Schreiber wie transaktion-immobilie.
export async function schreibeNeuSynchron(ziel, inhalt, modus = NEU_MODUS) {
  const handle = await open(alsPfad(ziel), "wx", modus);
  try {
    await handle.writeFile(inhalt);
    await handle.chmod(modus);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

// Modus der bisherigen Datei (null, wenn es sie nicht gibt). Eine
// schreibgeschuetzte Datei bleibt geschuetzt: rename wuerde den Schutz sonst
// still umgehen, weil es nur das Schreibrecht am Ordner braucht. Ausnahme ist
// ein Entwurf: dort ist der Schreibschutz der Hardlinks gewollt, und die neue
// Datei wird bei der Veroeffentlichung selbst schreibgeschuetzt.
async function bisherigerModus(pfad) {
  let modus;
  try {
    modus = (await stat(pfad)).mode & 0o7777;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  try {
    await access(pfad, constants.W_OK);
  } catch (error) {
    if (error.code === "EACCES" && (await liegtImEntwurf(pfad))) return NEU_MODUS;
    throw error;
  }
  return modus;
}

async function entferneLeise(pfad) {
  await unlink(pfad).catch(() => {});
}

// Ersetzt (oder legt an) ziel mit inhalt, atomar. ziel: Pfad oder file-URL.
export async function ersetzeDatei(ziel, inhalt, { modus } = {}) {
  const pfad = alsPfad(ziel);
  const ordner = path.dirname(pfad);
  await mkdir(ordner, { recursive: true });
  const m = modus ?? (await bisherigerModus(pfad)) ?? NEU_MODUS;
  const temp = tempPfad(pfad);
  try {
    await schreibeNeuSynchron(temp, inhalt, m);
    await rename(temp, pfad);
  } catch (error) {
    await entferneLeise(temp);
    throw error;
  }
  await synchronisiereOrdner(ordner);
}

// Wie ersetzeDatei, aber nur, wenn ziel noch nicht existiert (sonst EEXIST).
// link() setzt die fertige Datei atomar und exklusiv an ihren Platz.
export async function legeDateiAn(ziel, inhalt, { modus = NEU_MODUS } = {}) {
  const pfad = alsPfad(ziel);
  const ordner = path.dirname(pfad);
  await mkdir(ordner, { recursive: true });
  const temp = tempPfad(pfad);
  try {
    await schreibeNeuSynchron(temp, inhalt, modus);
    await link(temp, pfad);
  } finally {
    await entferneLeise(temp);
  }
  await synchronisiereOrdner(ordner);
}

// Haengt text an ziel an (z.B. eine Zeile ans agent_log.jsonl): lesen, eine
// fehlende Schlusszeile ergaenzen, alles atomar neu schreiben. Langsamer als
// appendFile, aber ein Abbruch laesst keine halbe Zeile zurueck.
export async function haengeAn(ziel, text) {
  let bisher = "";
  try {
    bisher = await readFile(alsPfad(ziel), "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const trenner = bisher && !bisher.endsWith("\n") ? "\n" : "";
  await ersetzeDatei(ziel, `${bisher}${trenner}${text}`);
}

// @ts-check
// app/tools/lib/schreibsperre.mjs
// Prozessuebergreifende Schreibsperre je Datenbestand: eine Datei
// <datenroot>/.schreibsperre, angelegt mit open(..., "wx") und mit PID, Rechner,
// Zeit und Kennung. Wer schreibt, haelt sie ueber den ganzen Zyklus Lesen ->
// Aendern -> Pruefen -> Commit; eine zweite Sitzung bekommt eine klare
// Abweisung statt still zu ueberschreiben.
//
// Verwaist ist eine Sperre, deren Prozess auf diesem Rechner nicht mehr lebt
// oder die aelter als VERWAIST_NACH_MS ist; sie wird uebernommen.
//
// Ein Kindprozess (MCP startet die CLIs) erbt die Sperre ueber die Umgebung
// FINANZEN_SPERRE=<kennung>: stimmt sie mit der Sperrdatei ueberein, nimmt die
// CLI keine eigene Sperre.
import { randomBytes } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { open, readFile, stat, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";

export const SPERRDATEI = ".schreibsperre";
export const UMGEBUNG = "FINANZEN_SPERRE";
export const VERWAIST_NACH_MS = 30 * 60 * 1000;
const WARTEN_MS = 3000;
const TAKT_MS = 100;

export class SperreBelegt extends Error {
  constructor(datenroot, halter) {
    const seit = halter?.zeit ? new Date(halter.zeit).toISOString().slice(0, 19).replace("T", " ") : "unbekannt";
    super(`Bestand ${path.basename(datenroot)} ist gesperrt: ein anderer Schreibvorgang laeuft (${halter?.wer ?? "unbekannt"}, PID ${halter?.pid ?? "?"} auf ${halter?.rechner ?? "?"}, seit ${seit} UTC). Nichts geschrieben; spaeter erneut versuchen.`);
    this.name = "SperreBelegt";
    this.halter = halter;
  }
}

const sperrPfad = (datenroot) => path.join(datenroot, SPERRDATEI);

async function leseHalter(datei) {
  try {
    return JSON.parse(await readFile(datei, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    if (!(error instanceof SyntaxError)) throw error;
    // Gerade erst angelegt (noch leer) oder kaputt: nur ueber das Dateialter.
    const info = await stat(datei).catch(() => null);
    return info ? { kaputt: true, mtime: info.mtimeMs } : null;
  }
}

function lebt(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

export function istVerwaist(halter, jetzt = Date.now()) {
  if (!halter) return true;
  if (halter.kaputt) return jetzt - halter.mtime > 5000;
  // Auf diesem Rechner entscheidet allein, ob der Prozess lebt: ein langer
  // CLI-Lauf behaelt seine Sperre. Das Alter gilt nur fuer fremde Rechner.
  if (halter.rechner === hostname() && Number.isInteger(halter.pid)) return !lebt(halter.pid);
  const zeit = Date.parse(halter.zeit ?? "");
  return !Number.isFinite(zeit) || jetzt - zeit > VERWAIST_NACH_MS;
}

async function versuche(datei, inhalt) {
  try {
    const handle = await open(datei, "wx", 0o640);
    try {
      await handle.writeFile(inhalt);
    } finally {
      await handle.close();
    }
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
}

// Eine verwaiste Sperre raeumt immer nur einer: wer die Uebernahmedatei
// (open "wx") bekommt, prueft unter ihr erneut, ob noch dieselbe verwaiste
// Sperre liegt, und loescht nur dann. So verschwindet nie eine frisch
// genommene Sperre. Eine liegengebliebene Uebernahmedatei gilt nach
// UEBERNAHME_MS als verwaist.
const UEBERNAHME_MS = 10 * 1000;
async function raeumeVerwaiste(datei, halter) {
  const uebernahme = `${datei}.uebernahme`;
  if (!(await versuche(uebernahme, `${process.pid}\n`))) {
    const alter = Date.now() - ((await stat(uebernahme).catch(() => null))?.mtimeMs ?? Date.now());
    if (alter > UEBERNAHME_MS) await unlink(uebernahme).catch(() => {});
    return false;
  }
  try {
    // true nur bei Fortschritt (Sperre weg oder inzwischen eine andere); kann
    // die verwaiste Sperre nicht geloescht werden (z. B. fremder Eigentuemer),
    // false: dann greift die Wartezeit und es kommt eine Abweisung.
    const jetzt = await leseHalter(datei);
    if (JSON.stringify(jetzt) !== JSON.stringify(halter)) return true;
    try {
      await unlink(datei);
      return true;
    } catch (error) {
      return error.code === "ENOENT";
    }
  } finally {
    await unlink(uebernahme).catch(() => {});
  }
}

// Nimmt die Sperre; liefert { kennung, freigeben }. Wirft SperreBelegt, wenn
// sie nach kurzer Wartezeit noch gehalten wird. pid: wessen Lebenszeit die
// Sperre gilt (Default dieser Prozess; das Deploy-Skript traegt seine eigene
// ein, damit die Sperre ueber den kurzen Hilfsprozess hinaus gilt).
export async function nimmSperre(datenroot, { wer = path.basename(process.argv[1] ?? "node"), wartenMs = WARTEN_MS, pid = process.pid } = {}) {
  const datei = sperrPfad(datenroot);
  const kennung = randomBytes(12).toString("hex");
  const inhalt = `${JSON.stringify({ pid, rechner: hostname(), zeit: new Date().toISOString(), wer, kennung })}\n`;
  const bis = Date.now() + wartenMs;
  for (;;) {
    if (await versuche(datei, inhalt)) break;
    const halter = await leseHalter(datei);
    // Raeumen scheitert (z. B. Ordner nicht beschreibbar): wie belegt behandeln.
    if (istVerwaist(halter) && (await raeumeVerwaiste(datei, halter).catch(() => false))) continue;
    if (Date.now() >= bis) throw new SperreBelegt(datenroot, halter);
    await new Promise((r) => setTimeout(r, TAKT_MS));
  }
  let frei = false;
  return {
    kennung,
    async freigeben() {
      if (frei) return;
      frei = true;
      // Nur die eigene Sperre loeschen (sie koennte als verwaist uebernommen sein).
      if ((await leseHalter(datei))?.kennung === kennung) await unlink(datei).catch(() => {});
    },
    freigebenSync() {
      if (frei) return;
      frei = true;
      try {
        if (JSON.parse(readFileSync(datei, "utf8")).kennung === kennung) unlinkSync(datei);
      } catch {
        // schon weg oder fremd
      }
    },
  };
}

// Gibt eine Sperre anhand ihrer Kennung frei (fuer einen anderen Prozess als
// den, der sie genommen hat). Eine fremde Sperre bleibt liegen.
export async function gibSperreFrei(datenroot, kennung) {
  const datei = sperrPfad(datenroot);
  if (!kennung || (await leseHalter(datei))?.kennung !== kennung) return false;
  await unlink(datei).catch(() => {});
  return true;
}

// Haelt der Elternprozess die Sperre (MCP -> CLI), ist sie schon da.
export async function geerbteSperre(datenroot) {
  const kennung = process.env[UMGEBUNG];
  return Boolean(kennung) && (await leseHalter(sperrPfad(datenroot)))?.kennung === kennung;
}

export async function mitSperre(datenroot, fn, optionen) {
  if (await geerbteSperre(datenroot)) return fn(null);
  const sperre = await nimmSperre(datenroot, optionen);
  try {
    return await fn(sperre);
  } finally {
    await sperre.freigeben();
  }
}

// Fuer CLIs: Sperre bis Prozessende halten. Belegt -> Meldung, Exitcode 3,
// Abbruch. Aufruf vor dem ersten Lesen des Schreiblaufs.
export async function sperreFuerProzess(datenroot) {
  if (await geerbteSperre(datenroot)) return;
  try {
    const sperre = await nimmSperre(datenroot);
    process.on("exit", () => sperre.freigebenSync());
    /** @type {[NodeJS.Signals, number][]} */
    const signale = [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]];
    for (const [signal, code] of signale) {
      process.once(signal, () => { sperre.freigebenSync(); process.exit(code); });
    }
  } catch (error) {
    if (!(error instanceof SperreBelegt)) throw error;
    console.error(error.message);
    process.exit(3);
  }
}

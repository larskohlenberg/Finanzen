// prototyp/e1/generationen.mjs
// Prototyp E1, Variante A: Dateigenerationen.
//
// Aufbau eines Bestands <basis>/:
//   generationen/000001/ ...   veroeffentlichte Generationen (unveraenderlich)
//   generationen/.neu-*        Entwurf eines laufenden Schreibers (unvollstaendig)
//   aktuell -> generationen/000042   Zeiger (Symlink, atomar per rename ersetzt)
//   .schreibsperre             Sperre aus app/tools/lib/schreibsperre.mjs
//
// Garantien:
// - Veroeffentlichte Generationen werden nie veraendert: Dateien sind 0444,
//   ein Schreiber legt jede geaenderte Datei als neue Datei (neuer Inode) im
//   Entwurf an und ersetzt dort den Hardlink per rename. Unveraenderte Dateien
//   sind Hardlinks auf die Vorgaenger-Generation.
// - Veroeffentlichung absturzfest: Dateien fsync, MANIFEST.json fsync,
//   Entwurf -> generationen/<id> (rename, fsync Ordner), dann Zeiger (rename,
//   fsync Ordner). Vor dem Zeigerwechsel ist nichts sichtbar.
// - Leser holen einmal die Generations-ID und lesen alles aus ihr. Ein Leser
//   meldet sich mit einer Lease-Datei .leser-* in der Generation an; das
//   Aufraeumen loescht keine Generation mit lebender Lease (Marker-Protokoll
//   in raeumeGeneration).
// - Unvollstaendige Entwuerfe und nie veroeffentlichte Generationen raeumt der
//   naechste Schreiber unter der Sperre weg (wiederanlauf).
import { createHash, randomBytes } from "node:crypto";
import { link, lstat, mkdir, open, readdir, readFile, readlink, rename, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { istVerwaist, mitSperre } from "../../app/tools/lib/schreibsperre.mjs";

export const ZEIGER = "aktuell";
export const GENERATIONEN = "generationen";
export const MANIFEST = "MANIFEST.json";
const MARKER = ".geloescht";
const LEASE = ".leser-";
export const BEHALTEN = 10;

const istId = (name) => /^\d{6}$/.test(name);
export const idText = (n) => String(n).padStart(6, "0");
const genOrdner = (basis, id) => path.join(basis, GENERATIONEN, id);

// Fuer die Kill-Tests: E1_HALT=<schritt> beendet den Prozess hart an genau
// dieser Stelle (SIGKILL, kein Aufraeumen, keine finally-Bloecke).
export function halt(schritt) {
  if (process.env.E1_HALT === schritt) process.kill(process.pid, "SIGKILL");
}

async function fsyncPfad(pfad) {
  const handle = await open(pfad, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function existiert(pfad) {
  return Boolean(await lstat(pfad).catch(() => null));
}

async function schreibeNeu(datei, inhalt) {
  const handle = await open(datei, "wx", 0o444);
  try {
    await handle.writeFile(inhalt);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function aktuelleId(basis) {
  return path.basename(await readlink(path.join(basis, ZEIGER)));
}

export async function veroeffentlichteIds(basis) {
  return (await readdir(path.join(basis, GENERATIONEN))).filter(istId).sort();
}

async function dateiListe(ordner, praefix = "") {
  const liste = [];
  for (const e of await readdir(ordner, { withFileTypes: true })) {
    if (e.name.startsWith(".") || (!praefix && e.name === MANIFEST)) continue;
    const rel = `${praefix}${e.name}`;
    if (e.isDirectory()) liste.push(...(await dateiListe(path.join(ordner, e.name), `${rel}/`)));
    else if (e.isFile()) liste.push(rel);
  }
  return liste.sort();
}

async function zeigeAuf(basis, id) {
  const temp = path.join(basis, `${ZEIGER}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`);
  await symlink(path.join(GENERATIONEN, id), temp);
  halt("zeiger-temp");
  await rename(temp, path.join(basis, ZEIGER));
  await fsyncPfad(basis);
}

// Legt einen Bestand aus einem vorhandenen Datenordner an (Migration und Demo).
export async function einrichten(basis, quellOrdner) {
  await mkdir(path.join(basis, GENERATIONEN), { recursive: true });
  if (await existiert(path.join(basis, ZEIGER))) throw new Error(`${basis} ist schon eingerichtet`);
  const id = idText(1);
  const entwurf = path.join(basis, GENERATIONEN, `.neu-einrichten-${process.pid}`);
  await mkdir(entwurf);
  const manifest = {};
  for (const rel of await dateiListe(quellOrdner)) {
    const inhalt = await readFile(path.join(quellOrdner, rel));
    await mkdir(path.dirname(path.join(entwurf, rel)), { recursive: true });
    await schreibeNeu(path.join(entwurf, rel), inhalt);
    manifest[rel] = { bytes: inhalt.length, sha256: createHash("sha256").update(inhalt).digest("hex") };
  }
  await schreibeNeu(path.join(entwurf, MANIFEST), `${JSON.stringify({ id, dateien: manifest }, null, 2)}\n`);
  await fsyncPfad(entwurf);
  await rename(entwurf, genOrdner(basis, id));
  await fsyncPfad(path.join(basis, GENERATIONEN));
  await zeigeAuf(basis, id);
  return id;
}

// ---------------------------------------------------------------- Leser

function leaseInhalt() {
  return `${JSON.stringify({ pid: process.pid, rechner: hostname(), zeit: new Date().toISOString() })}\n`;
}

// Oeffnet einen Lesevorgang auf der aktuellen Generation. Liefert
// { id, ordner, lies(rel), schliessen() }.
export async function oeffneLeser(basis) {
  for (let versuch = 0; versuch < 50; versuch += 1) {
    const id = await aktuelleId(basis);
    const ordner = genOrdner(basis, id);
    const lease = path.join(ordner, `${LEASE}${process.pid}-${randomBytes(6).toString("hex")}`);
    try {
      await writeFile(lease, leaseInhalt(), { flag: "wx" });
    } catch (error) {
      if (error.code === "ENOENT") continue; // Generation gerade weggeraeumt
      throw error;
    }
    // Erst nach der Anmeldung pruefen: Marker da oder Ordner weg -> neu.
    if ((await existiert(path.join(ordner, MARKER))) || !(await existiert(path.join(ordner, MANIFEST)))) {
      await unlink(lease).catch(() => {});
      continue;
    }
    let offen = true;
    return {
      id,
      ordner,
      lies: (rel) => readFile(path.join(ordner, rel), "utf8"),
      async schliessen() {
        if (!offen) return;
        offen = false;
        await unlink(lease).catch(() => {});
      },
    };
  }
  throw new Error(`${basis}: keine stabile Generation gefunden`);
}

export async function mitLeser(basis, fn) {
  const leser = await oeffneLeser(basis);
  try {
    return await fn(leser);
  } finally {
    await leser.schliessen();
  }
}

// ---------------------------------------------------------------- Aufraeumen

async function lebendeLeases(ordner) {
  const lebend = [];
  for (const name of await readdir(ordner).catch(() => [])) {
    if (!name.startsWith(LEASE)) continue;
    const halter = await readFile(path.join(ordner, name), "utf8").then(JSON.parse).catch(() => null);
    // Halb geschriebene Lease: als lebend werten (konservativ).
    if (!halter || !istVerwaist(halter)) lebend.push(name);
    else await unlink(path.join(ordner, name)).catch(() => {});
  }
  return lebend;
}

// Marker-Protokoll: Marker anlegen, DANN Leases zaehlen. Ein Leser legt seine
// Lease an und prueft DANACH den Marker. Damit sieht mindestens eine Seite die
// andere: entweder der Raeumer die Lease (er bricht ab) oder der Leser den
// Marker bzw. den verschwundenen Ordner (er versucht es neu).
async function raeumeGeneration(basis, id) {
  const ordner = genOrdner(basis, id);
  const marker = path.join(ordner, MARKER);
  await writeFile(marker, `${process.pid}\n`, { flag: "w" });
  if ((await lebendeLeases(ordner)).length) {
    await unlink(marker).catch(() => {});
    return false;
  }
  const weg = path.join(basis, GENERATIONEN, `.weg-${id}-${process.pid}`);
  await rename(ordner, weg);
  halt("gc-umbenannt");
  await rm(weg, { recursive: true, force: true });
  return true;
}

// Nur unter der Schreibsperre aufrufen.
export async function wiederanlauf(basis) {
  const befund = { entwuerfe: 0, unveroeffentlicht: 0, zeigerReste: 0 };
  const aktuell = await aktuelleId(basis);
  const gen = path.join(basis, GENERATIONEN);
  for (const name of await readdir(gen)) {
    if (name.startsWith(".neu-") || name.startsWith(".weg-")) {
      await rm(path.join(gen, name), { recursive: true, force: true });
      befund.entwuerfe += 1;
    } else if (istId(name) && name > aktuell) {
      // Umbenannt, aber der Zeiger wurde nie umgestellt: nie veroeffentlicht.
      await rm(path.join(gen, name), { recursive: true, force: true });
      befund.unveroeffentlicht += 1;
    } else if (istId(name)) {
      // Abgebrochenes Aufraeumen: Marker ohne Loeschung zuruecknehmen.
      await unlink(path.join(gen, name, MARKER)).catch(() => {});
    }
  }
  for (const name of await readdir(basis)) {
    if (name.startsWith(`${ZEIGER}.tmp-`)) {
      await unlink(path.join(basis, name)).catch(() => {});
      befund.zeigerReste += 1;
    }
  }
  return befund;
}

async function aufraeumen(basis, behalten) {
  const ids = await veroeffentlichteIds(basis);
  const aktuell = await aktuelleId(basis);
  const alt = ids.filter((id) => id < aktuell);
  const kandidaten = alt.slice(0, Math.max(0, alt.length - behalten));
  let geloescht = 0;
  for (const id of kandidaten) if (await raeumeGeneration(basis, id)) geloescht += 1;
  return geloescht;
}

// ---------------------------------------------------------------- Schreiber

async function legeEntwurfAn(basis, quelleId) {
  const entwurf = path.join(basis, GENERATIONEN, `.neu-${process.pid}-${randomBytes(4).toString("hex")}`);
  const quelle = genOrdner(basis, quelleId);
  await mkdir(entwurf);
  for (const rel of await dateiListe(quelle)) {
    await mkdir(path.dirname(path.join(entwurf, rel)), { recursive: true });
    await link(path.join(quelle, rel), path.join(entwurf, rel));
  }
  return entwurf;
}

// fn(tx) aendert den Entwurf ueber tx.lies/tx.schreibe/tx.loesche. Wirft fn
// oder lehnt pruefe(entwurfOrdner) ab (liefert Fehlerliste), wird nichts
// veroeffentlicht. Liefert { id, vorher, geaendert, verworfen?, fehler? }.
export async function mitSchreiber(basis, fn, { pruefe, behalten = BEHALTEN, vonGeneration, wer = "e1-generationen", wartenMs } = {}) {
  return mitSperre(basis, async () => {
    const wieder = await wiederanlauf(basis);
    const vorher = await aktuelleId(basis);
    const entwurf = await legeEntwurfAn(basis, vonGeneration ?? vorher);
    halt("entwurf-angelegt");
    const geaendert = new Set();
    const tx = {
      vorher,
      ordner: entwurf,
      lies: (rel) => readFile(path.join(entwurf, rel), "utf8"),
      async schreibe(rel, inhalt) {
        const ziel = path.join(entwurf, rel);
        const temp = path.join(path.dirname(ziel), `.tmp-${path.basename(rel)}-${randomBytes(4).toString("hex")}`);
        await mkdir(path.dirname(ziel), { recursive: true });
        await schreibeNeu(temp, inhalt);
        // Ersetzt nur den Verzeichniseintrag im Entwurf (bisher ein Hardlink);
        // die Datei der Vorgaenger-Generation bleibt unberuehrt.
        await rename(temp, ziel);
        geaendert.add(rel);
        halt("datei-geschrieben");
      },
      async loesche(rel) {
        await unlink(path.join(entwurf, rel));
        geaendert.add(rel);
      },
    };
    try {
      await fn(tx);
      if (pruefe) {
        const fehler = await pruefe(entwurf);
        if (fehler?.length) {
          await rm(entwurf, { recursive: true, force: true });
          return { id: vorher, vorher, verworfen: true, fehler, geaendert: [...geaendert] };
        }
      }
    } catch (error) {
      await rm(entwurf, { recursive: true, force: true });
      throw error;
    }
    if (!geaendert.size && !vonGeneration) {
      await rm(entwurf, { recursive: true, force: true });
      return { id: vorher, vorher, geaendert: [] };
    }
    const id = idText(Math.max(Number(vorher), ...(await veroeffentlichteIds(basis)).map(Number)) + 1);
    await schreibeManifest(basis, entwurf, vonGeneration ?? vorher, id, geaendert);
    halt("manifest");
    await fsyncPfad(entwurf);
    await rename(entwurf, genOrdner(basis, id));
    await fsyncPfad(path.join(basis, GENERATIONEN));
    halt("generation-umbenannt");
    await zeigeAuf(basis, id);
    halt("zeiger-umgestellt");
    const geloescht = await aufraeumen(basis, behalten);
    return { id, vorher, geaendert: [...geaendert], geloescht, wiederanlauf: wieder };
  }, { wer, ...(wartenMs ? { wartenMs } : {}) });
}

// Unveraenderte Dateien erben den Eintrag der Quelle (gleicher Inode), nur
// Geaendertes wird neu gehasht.
async function schreibeManifest(basis, entwurf, quelleId, id, geaendert) {
  const alt = JSON.parse(await readFile(path.join(genOrdner(basis, quelleId), MANIFEST), "utf8")).dateien;
  const dateien = {};
  for (const rel of await dateiListe(entwurf)) {
    if (!geaendert.has(rel) && alt[rel]) {
      dateien[rel] = alt[rel];
      continue;
    }
    const inhalt = await readFile(path.join(entwurf, rel));
    dateien[rel] = { bytes: inhalt.length, sha256: createHash("sha256").update(inhalt).digest("hex") };
  }
  await schreibeNeu(path.join(entwurf, MANIFEST), `${JSON.stringify({ id, quelle: quelleId, dateien }, null, 2)}\n`);
}

// Undo: neue Generation mit dem Inhalt einer frueheren (Historie bleibt linear).
export async function rueckgaengig(basis, { schritte = 1, ...optionen } = {}) {
  const ids = await veroeffentlichteIds(basis);
  const aktuell = await aktuelleId(basis);
  const ziel = ids[ids.indexOf(aktuell) - schritte];
  if (!ziel) throw new Error(`keine Generation ${schritte} Schritt(e) vor ${aktuell}`);
  return mitSchreiber(basis, async () => {}, { ...optionen, vonGeneration: ziel });
}

// Prueft eine Generation gegen ihr Manifest (Restore-Probe, Tests).
export async function pruefeGeneration(basis, id) {
  const ordner = genOrdner(basis, id);
  const { dateien } = JSON.parse(await readFile(path.join(ordner, MANIFEST), "utf8"));
  const fehler = [];
  for (const rel of await dateiListe(ordner)) if (!dateien[rel]) fehler.push(`${id}: ${rel} fehlt im Manifest`);
  for (const [rel, soll] of Object.entries(dateien)) {
    const inhalt = await readFile(path.join(ordner, rel)).catch(() => null);
    if (!inhalt) fehler.push(`${id}: ${rel} fehlt`);
    else if (createHash("sha256").update(inhalt).digest("hex") !== soll.sha256) fehler.push(`${id}: ${rel} weicht vom Manifest ab`);
    else if (((await stat(path.join(ordner, rel))).mode & 0o222) !== 0) fehler.push(`${id}: ${rel} ist beschreibbar`);
  }
  return fehler;
}

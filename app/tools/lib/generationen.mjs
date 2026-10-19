// app/tools/lib/generationen.mjs
// Dateigenerationen je Datenbestand (ADR 0035): ein Schreibvorgang wird ganz
// oder gar nicht sichtbar, Leser sehen immer einen vollstaendigen Stand.
//
// Aufbau eines eingerichteten Bestands <basis>/:
//   generationen/000041/        veroeffentlicht, Dateien 0444, MANIFEST.json
//   generationen/000042/        unveraenderte Dateien = Hardlinks auf 000041
//   generationen/.neu-*         Entwurf eines laufenden Schreibers
//   aktuell -> generationen/000042   Zeiger (Symlink, atomar per rename ersetzt)
//   .schreibsperre              Sperre aus schreibsperre.mjs, im Basisordner
//
// Rueckfallmodus: Ein einfacher Datenordner ohne Zeiger ist "eine Generation
// ohne Historie" (Id ORDNER). Leser lesen ihn direkt; Schreiber arbeiten auf
// einer Kopie im Ordner (.entwurf-*), pruefen sie und ersetzen danach jede
// geaenderte Datei einzeln per rename. Das schuetzt vor abgeschnittenen
// Dateien und vor ungeprueften Staenden, ist ueber mehrere Dateien aber nicht
// atomar (wie bisher). Demo und Testfixtures bleiben so einfache Ordner.
//
// Garantien im Generationsmodus:
// - Veroeffentlichte Generationen werden nie veraendert. Dateien sind 0444;
//   eine Aenderung im Entwurf ist immer eine neue Datei (neuer Inode), die den
//   Hardlink per rename ersetzt. Ein In-place-Schreiben scheitert mit EACCES.
//   Fuer root gilt 0444 nicht: Darum vergleicht jede Veroeffentlichung die
//   uebernommenen Hardlinks mit dem Manifest der Quelle und bricht laut ab,
//   wenn eine veroeffentlichte Datei veraendert wurde.
// - Veroeffentlichung absturzfest: Dateien und Ordner fsync, MANIFEST.json
//   fsync, Entwurf -> generationen/<id> (rename, fsync), dann Zeiger (rename,
//   fsync). Vor dem Zeigerwechsel ist nichts sichtbar; was ein Absturz
//   zuruecklaesst, raeumt der naechste Schreiber unter der Sperre weg.
// - Leser binden sich per Lease (.leser-* in der Generation) an eine Id. Das
//   Aufraeumen loescht keine Generation mit lebender Lease (Marker-Protokoll
//   in raeumeGeneration) und behaelt ausserdem die letzten `behalten`.
// - Leser ohne Schreibrecht (Webdienst unter ProtectSystem=strict: EROFS,
//   sonst EACCES/EPERM) lesen ohne Lease, aber mit Frist: Sie duerfen hoechstens
//   LESER_FRIST_MS lang lesen, danach weist lies() ab. Das Aufraeumen loescht
//   eine Generation erst, wenn sie seit ABGELOEST_FRIST_MS (laenger als die
//   Lesefrist) nicht mehr aktuell ist; "abgeloest seit" ist der Zeitstempel
//   des Manifests ihrer Nachfolgerin (Ids steigen streng, auch bei Undo). Ein
//   Leser ohne Lease sah seine Generation beim Oeffnen als aktuelle, also wird
//   sie fruehestens ABGELOEST_FRIST_MS nach dem Oeffnen geloescht.
// - Das Manifest traegt die Formatversion des Bestands (FORMAT). Code, der ein
//   anderes Format nicht kennt, liest und schreibt es nicht.
import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { chmod, copyFile, link, lstat, mkdir, open, readdir, readFile, readlink, realpath, rename, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";
import { ENTWURF_MARKE } from "./datei.mjs";
import { istVerwaist, mitSperre, UMGEBUNG } from "./schreibsperre.mjs";

export const ZEIGER = "aktuell";
export const GENERATIONEN = "generationen";
export const MANIFEST = "MANIFEST.json";
export const FORMAT = 1;
export const BEHALTEN = 10;
export const ORDNER = "ordner";
const MARKER = ".geloescht";
const LEASE = ".leser-";
const ENTWURF_ORDNER = ".entwurf-";
// Eine Lease ohne lesbaren Inhalt (Leser starb zwischen Anlegen und Schreiben)
// gilt nach dieser Zeit als verwaist.
const LEASE_KAPUTT_MS = 60 * 1000;
// Lesefrist ohne Lease und Schonfrist abgeloester Generationen (siehe oben).
// Der Abstand deckt die Zeit zwischen Manifest und Zeigerwechsel ab.
export const LESER_FRIST_MS = 10 * 60 * 1000;
export const ABGELOEST_FRIST_MS = LESER_FRIST_MS + 5 * 60 * 1000;
const OHNE_SCHREIBRECHT = new Set(["EROFS", "EACCES", "EPERM"]);

export class FormatUnbekannt extends Error {
  constructor(basis, format) {
    super(`Bestand ${path.basename(basis)} hat Formatversion ${format ?? "unbekannt"}, dieser Code kennt Format ${FORMAT}. Nichts gelesen oder geschrieben; Code aktualisieren oder Migration ausfuehren.`);
    this.name = "FormatUnbekannt";
    this.format = format;
  }
}

export class StandVeraltet extends Error {
  constructor(basis, erwartet, aktuell) {
    super(`Bestand ${path.basename(basis)} hat sich seit der Vorschau geaendert (Stand ${erwartet}, jetzt ${aktuell}). Nichts geschrieben; Vorschau neu erstellen.`);
    this.name = "StandVeraltet";
    this.erwartet = erwartet;
    this.aktuell = aktuell;
  }
}

const istId = (name) => /^\d{6,}$/.test(name);
const nachZahl = (a, b) => Number(a) - Number(b);
export const idText = (n) => String(n).padStart(6, "0");
export const generationsOrdner = (basis, id) => path.join(basis, GENERATIONEN, id);
const ohneHalt = () => {};
const sha256 = (inhalt) => createHash("sha256").update(inhalt).digest("hex");
const zufall = () => randomBytes(4).toString("hex");

async function existiert(pfad) {
  return Boolean(await lstat(pfad).catch(() => null));
}

async function fsyncPfad(pfad) {
  const handle = await open(pfad, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
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

// Relativer Pfad innerhalb eines Bestands; versteckte Namen (Sperre, Leases,
// Entwuerfe) und das Manifest sind reserviert.
function relPfad(rel) {
  const norm = path.posix.normalize(String(rel).replaceAll("\\", "/"));
  const teile = norm.split("/");
  if (path.posix.isAbsolute(norm) || teile.some((t) => !t || t === ".." || t.startsWith(".")) || norm === MANIFEST) {
    throw new Error(`ungueltiger Pfad im Bestand: ${rel}`);
  }
  return norm;
}

// Alle Datendateien eines Ordners, relativ, sortiert. Versteckte Eintraege und
// das Manifest gehoeren nicht zum Bestand.
async function dateiListe(ordner, praefix = "") {
  const liste = [];
  for (const e of await readdir(ordner, { withFileTypes: true })) {
    if (e.name.startsWith(".") || (!praefix && e.name === MANIFEST)) continue;
    const rel = `${praefix}${e.name}`;
    if (e.isDirectory()) liste.push(...(await dateiListe(path.join(ordner, e.name), `${rel}/`)));
    else liste.push(rel);
  }
  return liste.sort();
}

async function unterordner(ordner, praefix = "") {
  const liste = [];
  for (const e of await readdir(ordner, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const rel = `${praefix}${e.name}`;
    liste.push(rel, ...(await unterordner(path.join(ordner, e.name), `${rel}/`)));
  }
  return liste;
}

// ---------------------------------------------------------------- Stand

// "generationen" oder ORDNER (Rueckfallmodus). Ein Generationsordner ohne
// Zeiger ist ein abgebrochenes Einrichten: einrichten erneut aufrufen.
export async function bestandsArt(basis) {
  const zeiger = await lstat(path.join(basis, ZEIGER)).catch(() => null);
  if (zeiger?.isSymbolicLink()) return "generationen";
  if (!(await stat(basis).catch(() => null))?.isDirectory()) throw new Error(`Datenbestand ${basis} fehlt`);
  if (await existiert(path.join(basis, GENERATIONEN))) throw new Error(`${basis}: Einrichten der Generationen nicht abgeschlossen (kein Zeiger ${ZEIGER}); einrichten erneut aufrufen`);
  // Eine veroeffentlichte Generation ist nie selbst ein Bestand (z. B. wenn ein
  // Schreiber den Pfad aufgeloest hat, bevor data/master umgestellt wurde).
  if (await existiert(path.join(basis, MANIFEST))) throw new Error(`${basis} ist eine Generation, nicht der Bestand; ueber den Basisordner schreiben`);
  return ORDNER;
}

// Basisordner zu einem Datenroot: der Basisordner selbst, eine Generation
// (auch ueber einen Symlink wie data/master -> <basis>/aktuell) oder ein
// einfacher Ordner (dann er selbst).
export async function findeBasis(datenroot) {
  const pfad = path.resolve(datenroot);
  if ((await lstat(path.join(pfad, ZEIGER)).catch(() => null))?.isSymbolicLink()) return pfad;
  // Symlink auf <basis>/aktuell: die Basis so, wie der Link sie nennt.
  if ((await lstat(pfad).catch(() => null))?.isSymbolicLink()) {
    const ziel = path.resolve(path.dirname(pfad), await readlink(pfad));
    if (path.basename(ziel) === ZEIGER && (await lstat(ziel).catch(() => null))?.isSymbolicLink()) return path.dirname(ziel);
  }
  const echt = await realpath(pfad).catch(() => pfad);
  const oben = path.dirname(path.dirname(echt));
  if (istId(path.basename(echt)) && path.basename(path.dirname(echt)) === GENERATIONEN && (await lstat(path.join(oben, ZEIGER)).catch(() => null))?.isSymbolicLink()) return oben;
  return pfad;
}

// Id der aktuellen Generation; im Rueckfallmodus ORDNER.
export async function aktuelleId(basis) {
  if ((await bestandsArt(basis)) === ORDNER) return ORDNER;
  const id = path.basename(await readlink(path.join(basis, ZEIGER)));
  if (!istId(id)) throw new Error(`${basis}: Zeiger ${ZEIGER} zeigt auf ${id}, keine Generation`);
  return id;
}

export async function veroeffentlichteIds(basis) {
  return (await readdir(path.join(basis, GENERATIONEN))).filter(istId).sort(nachZahl);
}

async function liesManifest(basis, ordner) {
  const manifest = JSON.parse(await readFile(path.join(ordner, MANIFEST), "utf8"));
  if (manifest.format !== FORMAT) throw new FormatUnbekannt(basis, manifest.format);
  return manifest;
}

async function zeigeAuf(basis, id, halt) {
  const temp = path.join(basis, `${ZEIGER}.tmp-${process.pid}-${zufall()}`);
  await symlink(path.join(GENERATIONEN, id), temp);
  halt("zeiger-temp");
  await rename(temp, path.join(basis, ZEIGER));
  await fsyncPfad(basis);
}

const manifestText = ({ id, quelle, dateien }) => `${JSON.stringify({ format: FORMAT, id, quelle, zeit: new Date().toISOString(), dateien }, null, 2)}\n`;

// Legt aus einem einfachen Datenordner einen Bestand mit Generation 000001 an
// (Migration, Tests). basis darf noch nicht eingerichtet sein; ein
// abgebrochenes Einrichten wird verworfen und neu begonnen.
export async function einrichten(basis, quellOrdner, { halt = ohneHalt, wer = "einrichten", wartenMs } = {}) {
  if (path.resolve(basis) === path.resolve(quellOrdner)) throw new Error("einrichten: Quelle und Ziel muessen verschiedene Ordner sein");
  await mkdir(basis, { recursive: true });
  return mitSperre(basis, async () => {
    if (await existiert(path.join(basis, ZEIGER))) throw new Error(`${basis} ist schon eingerichtet`);
    const gen = path.join(basis, GENERATIONEN);
    // Ohne Zeiger ist nichts veroeffentlicht: alles darin ist Rest.
    await rm(gen, { recursive: true, force: true });
    await mkdir(gen);
    const id = idText(1);
    const entwurf = path.join(gen, `.neu-einrichten-${process.pid}-${zufall()}`);
    await mkdir(entwurf);
    const dateien = {};
    for (const rel of await dateiListe(quellOrdner)) {
      const quelle = path.join(quellOrdner, rel);
      if (!(await lstat(quelle)).isFile()) throw new Error(`einrichten: ${rel} ist keine normale Datei`);
      const inhalt = await readFile(quelle);
      await mkdir(path.dirname(path.join(entwurf, rel)), { recursive: true });
      await schreibeNeu(path.join(entwurf, rel), inhalt);
      dateien[rel] = { bytes: inhalt.length, sha256: sha256(inhalt) };
    }
    for (const rel of await unterordner(entwurf)) await fsyncPfad(path.join(entwurf, rel));
    await schreibeNeu(path.join(entwurf, MANIFEST), manifestText({ id, quelle: null, dateien }));
    await fsyncPfad(entwurf);
    halt("einrichten-entwurf");
    await rename(entwurf, generationsOrdner(basis, id));
    await fsyncPfad(gen);
    await zeigeAuf(basis, id, halt);
    return id;
  }, { wer, ...(wartenMs ? { wartenMs } : {}) });
}

// ---------------------------------------------------------------- Leser

const leaseInhalt = () => `${JSON.stringify({ pid: process.pid, rechner: hostname(), zeit: new Date().toISOString() })}\n`;

function leserAuf(id, ordner, schliessen = async () => {}, bis = Infinity) {
  // Nur Leser ohne Lease haben eine Frist; danach koennte das Aufraeumen ihre
  // Generation schon wegnehmen, also lieber laut abweisen.
  const inFrist = () => {
    if (Date.now() > bis) throw new Error(`Lesevorgang ohne Lease auf Generation ${id} hat seine Frist ueberschritten; neu oeffnen`);
  };
  return {
    id,
    ordner,
    lease: bis === Infinity,
    lies: async (rel, kodierung = "utf8") => {
      inFrist();
      return readFile(path.join(ordner, relPfad(rel)), kodierung ?? undefined);
    },
    dateien: async () => {
      inFrist();
      return dateiListe(ordner);
    },
    schliessen,
  };
}

// Oeffnet einen Lesevorgang auf der aktuellen Generation. Liefert
// { id, ordner, lease, lies(rel, kodierung), dateien(), schliessen() }. Mit
// Lease bleibt die Generation bis schliessen() erhalten; ohne Schreibrecht
// (oder mit lease: false) liest der Leser ohne Lease hoechstens fristMs lang
// (Default LESER_FRIST_MS, siehe Kopf). Im Rueckfallmodus liest der Leser den
// Ordner direkt (ohne Schnappschuss-Garantie).
export async function oeffneLeser(basis, { lease: mitLease = true, fristMs = LESER_FRIST_MS } = {}) {
  if ((await bestandsArt(basis)) === ORDNER) return leserAuf(ORDNER, basis);
  if (!(fristMs >= 0 && fristMs <= LESER_FRIST_MS)) throw new Error(`fristMs muss zwischen 0 und ${LESER_FRIST_MS} liegen: ${fristMs}`);
  for (let versuch = 0; versuch < 50; versuch += 1) {
    const beginn = Date.now();
    const id = await aktuelleId(basis);
    const ordner = generationsOrdner(basis, id);
    let lease = mitLease ? path.join(ordner, `${LEASE}${process.pid}-${randomBytes(6).toString("hex")}`) : null;
    if (lease) {
      try {
        await writeFile(lease, leaseInhalt(), { flag: "wx" });
      } catch (error) {
        if (error.code === "ENOENT") continue; // Generation gerade weggeraeumt
        if (!OHNE_SCHREIBRECHT.has(error.code)) throw error;
        lease = null; // kein Schreibrecht: Lesen mit Frist
      }
    }
    const abmelden = async () => {
      if (lease) await unlink(lease).catch(() => {});
    };
    // Erst nach der Anmeldung pruefen: Marker da oder Ordner weg -> neu.
    if ((await existiert(path.join(ordner, MARKER))) || !(await existiert(path.join(ordner, MANIFEST)))) {
      await abmelden();
      continue;
    }
    try {
      await liesManifest(basis, ordner);
    } catch (error) {
      await abmelden();
      throw error;
    }
    if (!lease) return leserAuf(id, ordner, async () => {}, beginn + fristMs);
    let offen = true;
    return leserAuf(id, ordner, async () => {
      if (!offen) return;
      offen = false;
      await abmelden();
    });
  }
  throw new Error(`${basis}: keine stabile Generation gefunden`);
}

export async function mitLeser(basis, fn, optionen) {
  const leser = await oeffneLeser(basis, optionen);
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
    const datei = path.join(ordner, name);
    let verwaist;
    try {
      verwaist = istVerwaist(JSON.parse(await readFile(datei, "utf8")));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      // Halb geschrieben: erst nach einer Weile als verwaist werten.
      const info = await stat(datei).catch(() => null);
      verwaist = !info || Date.now() - info.mtimeMs > LEASE_KAPUTT_MS;
    }
    if (verwaist) await unlink(datei).catch(() => {});
    else lebend.push(name);
  }
  return lebend;
}

// Marker-Protokoll: Marker anlegen, DANN Leases zaehlen. Ein Leser legt seine
// Lease an und prueft DANACH den Marker. Damit sieht mindestens eine Seite die
// andere: entweder der Raeumer die Lease (er bricht ab) oder der Leser den
// Marker bzw. den verschwundenen Ordner (er versucht es neu).
async function raeumeGeneration(basis, id, halt) {
  const ordner = generationsOrdner(basis, id);
  const marker = path.join(ordner, MARKER);
  await writeFile(marker, `${process.pid}\n`);
  if ((await lebendeLeases(ordner)).length) {
    await unlink(marker).catch(() => {});
    return false;
  }
  const weg = path.join(basis, GENERATIONEN, `.weg-${id}-${process.pid}-${zufall()}`);
  await rename(ordner, weg);
  halt("gc-umbenannt");
  await rm(weg, { recursive: true, force: true });
  return true;
}

// Seit wann eine Generation nicht mehr aktuell ist: Manifest-Zeit ihrer
// Nachfolgerin (geschrieben kurz vor deren Zeigerwechsel).
async function abgeloestSeit(basis, nachfolgerin) {
  return (await stat(path.join(generationsOrdner(basis, nachfolgerin), MANIFEST))).mtimeMs;
}

async function aufraeumen(basis, behalten, halt, fristMs) {
  const aktuell = Number(await aktuelleId(basis));
  const ids = await veroeffentlichteIds(basis);
  const alt = ids.filter((id) => Number(id) < aktuell);
  const kandidaten = alt.slice(0, Math.max(0, alt.length - behalten));
  const geloescht = [];
  for (const id of kandidaten) {
    // Aufsteigend: ist diese noch in der Schonfrist, sind es alle spaeteren auch.
    if (Date.now() - (await abgeloestSeit(basis, ids[ids.indexOf(id) + 1])) < fristMs) break;
    if (await raeumeGeneration(basis, id, halt)) geloescht.push(id);
  }
  return geloescht;
}

// Temp-Dateien abgebrochener Schreiber im einfachen Ordner (versteckt, Endung
// .tmp, z. B. aus ersetzeDatei). Unter der Sperre schreibt niemand sonst, also
// ist jede davon ein Rest. Sicherungen ("-backup") bleiben liegen: Sie koennen
// nach einem gescheiterten Zurueckspielen die einzige Kopie sein.
async function raeumeTempReste(ordner) {
  let anzahl = 0;
  for (const e of await readdir(ordner, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith(".")) anzahl += await raeumeTempReste(path.join(ordner, e.name));
    else if (e.isFile() && e.name.startsWith(".") && /\.tmp$|^\.tmp-/.test(e.name) && !e.name.includes("-backup")) {
      await unlink(path.join(ordner, e.name)).catch(() => {});
      anzahl += 1;
    }
  }
  return anzahl;
}

// Raeumt Reste abgebrochener Schreibvorgaenge weg. Nur unter der Sperre.
export async function wiederanlauf(basis) {
  const befund = { entwuerfe: 0, unveroeffentlicht: 0, zeigerReste: 0 };
  if ((await bestandsArt(basis)) === ORDNER) {
    for (const name of await readdir(basis)) {
      if (!name.startsWith(ENTWURF_ORDNER)) continue;
      await rm(path.join(basis, name), { recursive: true, force: true });
      befund.entwuerfe += 1;
    }
    befund.tempReste = await raeumeTempReste(basis);
    return befund;
  }
  const aktuell = Number(await aktuelleId(basis));
  const gen = path.join(basis, GENERATIONEN);
  for (const name of await readdir(gen)) {
    if (name.startsWith(".neu-") || name.startsWith(".weg-")) {
      await rm(path.join(gen, name), { recursive: true, force: true });
      befund.entwuerfe += 1;
    } else if (istId(name) && Number(name) > aktuell) {
      // Umbenannt, aber der Zeiger wurde nie umgestellt: nie veroeffentlicht.
      await rm(path.join(gen, name), { recursive: true, force: true });
      befund.unveroeffentlicht += 1;
    } else if (istId(name)) {
      // Abgebrochenes Aufraeumen: Marker ohne Loeschung zuruecknehmen.
      await unlink(path.join(gen, name, MARKER)).catch(() => {});
    }
  }
  for (const name of await readdir(basis)) {
    if (!name.startsWith(`${ZEIGER}.tmp-`)) continue;
    await unlink(path.join(basis, name)).catch(() => {});
    befund.zeigerReste += 1;
  }
  return befund;
}

// ---------------------------------------------------------------- Schreiber

function transaktion(entwurf, vorher, kennung, halt) {
  return {
    vorher,
    ordner: entwurf,
    // Kennung der gehaltenen Sperre; Kindprozesse erben sie ueber UMGEBUNG.
    sperre: kennung,
    lies: (rel, kodierung = "utf8") => readFile(path.join(entwurf, relPfad(rel)), kodierung ?? undefined),
    // Immer eine neue Datei (neuer Inode), nie in place.
    async schreibe(rel, inhalt) {
      const ziel = path.join(entwurf, relPfad(rel));
      const temp = path.join(path.dirname(ziel), `.tmp-${path.basename(ziel)}-${zufall()}`);
      await mkdir(path.dirname(ziel), { recursive: true });
      await schreibeNeu(temp, inhalt);
      await rename(temp, ziel);
      halt("datei-geschrieben");
    },
    async loesche(rel) {
      await unlink(path.join(entwurf, relPfad(rel)));
    },
  };
}

// Vergleicht den Entwurf mit seiner Quelle. Im Generationsmodus heisst
// "unveraendert": gleicher Inode wie in der Quelle, und dessen Inhalt passt
// noch zum Manifest. Im Rueckfallmodus (ohne Manifest) entscheidet der Inhalt.
async function sichteEntwurf(entwurf, quelle, quellManifest, ausgangsliste = null) {
  const dateien = {};
  const neu = [];
  const ersetzt = [];
  for (const rel of await dateiListe(entwurf)) {
    const info = await lstat(path.join(entwurf, rel));
    if (!info.isFile()) throw new Error(`Entwurf: ${rel} ist keine normale Datei (Symlink oder Sonderdatei)`);
    const alt = await lstat(path.join(quelle, rel)).catch(() => null);
    const inhalt = await readFile(path.join(entwurf, rel));
    dateien[rel] = { bytes: inhalt.length, sha256: sha256(inhalt) };
    if (quellManifest && alt?.ino === info.ino && alt.dev === info.dev) {
      if (quellManifest.dateien[rel]?.sha256 !== dateien[rel].sha256) {
        throw new Error(`Generation ${quellManifest.id}: ${rel} wurde nach der Veroeffentlichung veraendert. Nichts veroeffentlicht; Generation pruefen.`);
      }
      continue;
    }
    ersetzt.push(rel);
    // Neue Datei mit dem alten Inhalt zaehlt nicht als Aenderung.
    const altHash = quellManifest ? quellManifest.dateien[rel]?.sha256 : alt?.isFile() && sha256(await readFile(path.join(quelle, rel)));
    if (!alt || altHash !== dateien[rel].sha256) neu.push(rel);
  }
  // Rueckfallmodus: nur loeschen, was beim Anlegen des Entwurfs schon da war;
  // was seither daneben hinzukam (z. B. ein Upload in die Inbox), bleibt.
  const geloescht = (ausgangsliste ?? (await dateiListe(quelle))).filter((rel) => !dateien[rel]);
  return { dateien, neu, ersetzt, geloescht, geaendert: [...neu, ...geloescht].sort() };
}

async function pruefeEntwurf(entwurf, pruefe) {
  if (!pruefe) return null;
  const fehler = await pruefe(entwurf);
  return fehler?.length ? fehler : null;
}

// fn(tx) aendert den Entwurf ueber tx.lies/tx.schreibe/tx.loesche oder direkt
// in tx.ordner (dann nur per neuer Datei + rename; In-place scheitert an 0444).
// Wirft fn, lehnt pruefe(entwurfOrdner) ab (liefert eine nicht leere
// Fehlerliste) oder passt `erwartet` nicht zur aktuellen Id, wird nichts
// veroeffentlicht. Liefert { id, vorher, geaendert, geloescht, verworfen?,
// fehler?, aufgeraeumt, warnung?, wiederanlauf }. warnung: die Generation ist
// veroeffentlicht, nur das Aufraeumen alter Generationen scheiterte.
//
// Optionen: pruefe, behalten (Default BEHALTEN), fristMs (Schonfrist
// abgeloester Generationen, Default ABGELOEST_FRIST_MS), erwartet (Id aus der
// Vorschau), gesperrt (Aufrufer haelt die Sperre auf basis schon), wer,
// wartenMs, halt (Testhaken), vonGeneration (nur fuer rueckgaengig).
export async function mitSchreiber(basis, fn, optionen = {}) {
  const { gesperrt = false, wer = "generationen", wartenMs } = optionen;
  const lauf = async (sperre) => {
    const kennung = sperre?.kennung ?? process.env[UMGEBUNG] ?? null;
    // Unter der Sperre neu aufloesen: wurde der Bestand inzwischen umgestellt
    // (Ordner -> Generationen), gilt diese Sperre nicht mehr.
    if ((await findeBasis(basis)) !== path.resolve(basis)) throw new Error(`${basis} wurde umgestellt; Schreibvorgang erneut starten`);
    return (await bestandsArt(basis)) === ORDNER ? schreibeOrdner(basis, fn, optionen, kennung) : schreibeGeneration(basis, fn, optionen, kennung);
  };
  if (gesperrt) return lauf(null);
  return mitSperre(basis, lauf, { wer, ...(wartenMs ? { wartenMs } : {}) });
}

async function schreibeGeneration(basis, fn, { pruefe, behalten = BEHALTEN, fristMs = ABGELOEST_FRIST_MS, erwartet, vonGeneration, halt = ohneHalt }, kennung) {
  if (!Number.isInteger(behalten) || behalten < 0) throw new Error(`behalten muss eine ganze Zahl >= 0 sein: ${behalten}`);
  if (!Number.isInteger(fristMs) || fristMs < 0) throw new Error(`fristMs muss eine ganze Zahl >= 0 sein: ${fristMs}`);
  // Format zuerst: Code, der das Format nicht kennt, raeumt auch nichts weg.
  const vorher = await aktuelleId(basis);
  const bisher = await liesManifest(basis, generationsOrdner(basis, vorher));
  if (erwartet !== undefined && erwartet !== vorher) throw new StandVeraltet(basis, erwartet, vorher);
  const wieder = await wiederanlauf(basis);
  const quelleId = vonGeneration ?? vorher;
  const quelle = generationsOrdner(basis, quelleId);
  const quellManifest = vonGeneration ? await liesManifest(basis, quelle) : bisher;

  const entwurf = path.join(basis, GENERATIONEN, `.neu-${process.pid}-${zufall()}`);
  await mkdir(entwurf);
  // Marke fuer ersetzeDatei: die schreibgeschuetzten Hardlinks hier duerfen
  // per rename ersetzt werden. Der Rueckfallmodus braucht sie nicht (Kopien
  // mit dem Modus des Originals; Schreibschutz gilt dort weiter).
  await writeFile(path.join(entwurf, ENTWURF_MARKE), "");
  const verwerfen = () => rm(entwurf, { recursive: true, force: true });
  let sicht;
  try {
    for (const rel of await dateiListe(quelle)) {
      await mkdir(path.dirname(path.join(entwurf, rel)), { recursive: true });
      await link(path.join(quelle, rel), path.join(entwurf, rel));
    }
    halt("entwurf-angelegt");
    await fn(transaktion(entwurf, vorher, kennung, halt));
    const fehler = await pruefeEntwurf(entwurf, pruefe);
    sicht = await sichteEntwurf(entwurf, quelle, quellManifest);
    if (fehler) {
      await verwerfen();
      return { id: vorher, vorher, verworfen: true, fehler, geaendert: sicht.geaendert, geloescht: sicht.geloescht, aufgeraeumt: [], wiederanlauf: wieder };
    }
    if (!sicht.geaendert.length && !vonGeneration) {
      await verwerfen();
      return { id: vorher, vorher, geaendert: [], geloescht: [], aufgeraeumt: [], wiederanlauf: wieder };
    }
    // Direkt in tx.ordner geschriebene Dateien sind evtl. weder 0444 noch fsync.
    for (const rel of sicht.ersetzt) {
      await chmod(path.join(entwurf, rel), 0o444);
      await fsyncPfad(path.join(entwurf, rel));
    }
    // Undo: die Aenderung zaehlt gegenueber dem bisher aktuellen Stand.
    if (vonGeneration) {
      const alle = new Set([...Object.keys(bisher.dateien), ...Object.keys(sicht.dateien)]);
      sicht.geaendert = [...alle].filter((rel) => bisher.dateien[rel]?.sha256 !== sicht.dateien[rel]?.sha256).sort();
      sicht.geloescht = Object.keys(bisher.dateien).filter((rel) => !sicht.dateien[rel]).sort();
    }
    for (const rel of await unterordner(entwurf)) await fsyncPfad(path.join(entwurf, rel));
  } catch (error) {
    await verwerfen();
    throw error;
  }
  const id = idText(Math.max(Number(vorher), ...(await veroeffentlichteIds(basis)).map(Number)) + 1);
  const ziel = generationsOrdner(basis, id);
  try {
    await schreibeNeu(path.join(entwurf, MANIFEST), manifestText({ id, quelle: quelleId, dateien: sicht.dateien }));
    halt("manifest");
    await fsyncPfad(entwurf);
    await rename(entwurf, ziel);
    await fsyncPfad(path.join(basis, GENERATIONEN));
    halt("generation-umbenannt");
    await zeigeAuf(basis, id, halt);
  } catch (error) {
    // Vor dem Zeigerwechsel ist nichts sichtbar: Entwurf bzw. Generation weg.
    await verwerfen();
    if ((await aktuelleId(basis).catch(() => null)) !== id) await rm(ziel, { recursive: true, force: true });
    throw error;
  }
  halt("zeiger-umgestellt");
  const ergebnis = { id, vorher, geaendert: sicht.geaendert, geloescht: sicht.geloescht, aufgeraeumt: [], wiederanlauf: wieder };
  // Die neue Generation ist veroeffentlicht: ein Fehler beim Aufraeumen ist nur
  // ein Hinweis, der naechste Schreiber versucht es erneut.
  try {
    ergebnis.aufgeraeumt = await aufraeumen(basis, behalten, halt, fristMs);
  } catch (error) {
    ergebnis.warnung = `Aufraeumen alter Generationen gescheitert: ${error.message}`;
  }
  return ergebnis;
}

// Rueckfallmodus: Kopie als Entwurf (keine Hardlinks, die Dateien im Ordner
// sind beschreibbar), pruefen, dann Datei fuer Datei per rename ersetzen.
async function schreibeOrdner(basis, fn, { pruefe, erwartet, vonGeneration, halt = ohneHalt }, kennung) {
  if (vonGeneration) throw new Error(`${basis} ist ein einfacher Ordner ohne Generationen`);
  if (erwartet !== undefined && erwartet !== ORDNER) throw new StandVeraltet(basis, erwartet, ORDNER);
  const wieder = await wiederanlauf(basis);
  const entwurf = path.join(basis, `${ENTWURF_ORDNER}${process.pid}-${zufall()}`);
  await mkdir(entwurf);
  try {
    const ausgang = await dateiListe(basis);
    for (const rel of ausgang) {
      await mkdir(path.dirname(path.join(entwurf, rel)), { recursive: true });
      await copyFile(path.join(basis, rel), path.join(entwurf, rel), constants.COPYFILE_FICLONE);
    }
    halt("entwurf-angelegt");
    await fn(transaktion(entwurf, ORDNER, kennung, halt));
    const fehler = await pruefeEntwurf(entwurf, pruefe);
    const sicht = await sichteEntwurf(entwurf, basis, null, ausgang);
    const ergebnis = { id: ORDNER, vorher: ORDNER, geaendert: sicht.geaendert, geloescht: sicht.geloescht, aufgeraeumt: [], wiederanlauf: wieder };
    if (fehler) return { ...ergebnis, verworfen: true, fehler };
    for (const rel of sicht.neu) {
      // Dateien im einfachen Ordner bleiben beschreibbar (Modus wie bisher).
      const modus = (await stat(path.join(basis, rel)).catch(() => null))?.mode ?? 0o644;
      await chmod(path.join(entwurf, rel), modus & 0o777);
      await fsyncPfad(path.join(entwurf, rel));
      await mkdir(path.dirname(path.join(basis, rel)), { recursive: true });
      await rename(path.join(entwurf, rel), path.join(basis, rel));
      halt("ordner-datei-ersetzt");
    }
    for (const rel of sicht.geloescht) await unlink(path.join(basis, rel)).catch((error) => { if (error.code !== "ENOENT") throw error; });
    for (const ordner of new Set(sicht.geaendert.map((rel) => path.dirname(rel)))) await fsyncPfad(path.join(basis, ordner));
    return ergebnis;
  } finally {
    await rm(entwurf, { recursive: true, force: true });
  }
}

// Undo: neue Generation mit dem Inhalt einer frueheren (Historie bleibt linear).
// Das Ziel wird erst unter der Sperre bestimmt, damit kein dazwischen
// veroeffentlichter Stand still ueberschrieben wird.
export async function rueckgaengig(basis, { schritte = 1, gesperrt = false, wer = "rueckgaengig", wartenMs, ...optionen } = {}) {
  const lauf = async (sperre) => {
    if ((await bestandsArt(basis)) === ORDNER) throw new Error(`${basis} ist ein einfacher Ordner ohne Generationen`);
    const ids = await veroeffentlichteIds(basis);
    const ziel = schritte >= 1 ? ids[ids.indexOf(await aktuelleId(basis)) - schritte] : undefined;
    if (!ziel) throw new Error(`keine Generation ${schritte} Schritt(e) vor der aktuellen`);
    const kennung = sperre?.kennung ?? process.env[UMGEBUNG] ?? null;
    return schreibeGeneration(basis, async () => {}, { ...optionen, vonGeneration: ziel }, kennung);
  };
  if (gesperrt) return lauf(null);
  return mitSperre(basis, lauf, { wer, ...(wartenMs ? { wartenMs } : {}) });
}

// Prueft eine Generation gegen ihr Manifest: Formatversion, Dateiliste,
// Groesse und SHA-256, Schreibschutz. Liefert eine Fehlerliste (Restore-Probe).
export async function pruefeGeneration(basis, id) {
  const ordner = generationsOrdner(basis, id);
  let manifest;
  try {
    manifest = await liesManifest(basis, ordner);
  } catch (error) {
    return [`${id}: Manifest unbrauchbar (${error.message})`];
  }
  const fehler = [];
  if (manifest.id !== id) fehler.push(`${id}: Manifest nennt Id ${manifest.id}`);
  for (const rel of await dateiListe(ordner)) if (!manifest.dateien[rel]) fehler.push(`${id}: ${rel} fehlt im Manifest`);
  for (const [rel, soll] of Object.entries(manifest.dateien)) {
    const inhalt = await readFile(path.join(ordner, rel)).catch(() => null);
    if (!inhalt) fehler.push(`${id}: ${rel} fehlt`);
    else if (inhalt.length !== soll.bytes || sha256(inhalt) !== soll.sha256) fehler.push(`${id}: ${rel} weicht vom Manifest ab`);
    if (inhalt && ((await stat(path.join(ordner, rel))).mode & 0o222) !== 0) fehler.push(`${id}: ${rel} ist beschreibbar`);
  }
  return fehler;
}

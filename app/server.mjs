// app/server.mjs
//
// App-Server: liefert die Browser-App statisch aus (ohne Cache, damit ES-Module
// nach einer Code-Aenderung nie stale geladen werden) und nimmt Rohdateien fuer die Inbox
// entgegen. Er schreibt ausschliesslich in das Inbox-Verzeichnis — die
// Verarbeitung bleibt dem Import-Durchlauf (inbox.mjs + Agent) vorbehalten.
//
//   node app/server.mjs [--host 127.0.0.1] [--port 8000] [--proxy-ip <ip>]
//                       [--origin <url>[,<url>]] [--inbox <pfad>] [--belege <pfad>]
//
// Statisch kommt nur, was der Browser braucht (statikErlaubt): App-Shell, der
// Modulgraph ab index.html (browserModule), die Datendateien des Loaders,
// Logos (nur PNG), Dokumente unter /Belege/ aus dem Belege-Verzeichnis (ohne
// ausfuehrbare Typen) und wartende Uploads unter /data/inbox/ aus dem Inbox-
// Verzeichnis (nur dessen oberste Ebene, nur Upload-Endungen). Server- und
// MCP-Quellen, Doku, Agentenprotokoll, Papierkorb und Inbox-Unterordner
// (processed/, error/ ...) bleiben 404.
// GET /api/belege listet (nur lesend) alle Dateien unter Belege/ fuer die
// Dokumente-Ansicht.
// GET /api/export/{dokumente|daten|komplett}[?quelle=demo] liefert ein Backup
// als ZIP (app/export.mjs), gebaut beim Herunterladen, ohne Datei auf der Platte.
//
// Jede Anfrage braucht eine erlaubte Host-Kopfzeile (Schutz gegen DNS-
// Rebinding): lokal Loopback mit Port, mit --origin der Host der Origin.
// Mit --proxy-ip laeuft er im Betriebsmodus hinter einem Reverse-Proxy: jede
// Anfrage, die nicht von dieser IP kommt oder keine Remote-User-Kopfzeile
// traegt, bekommt 403. Konkrete IPs/Domains kommen nur per Argument.
//
// Nur node:-Module. Reine Funktionen sind exportiert und getestet
// (tests/app-server*.test.mjs); der CLI-Einstieg laeuft nur bei Direktaufruf.
import http from "node:http";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { chmod, open, link, mkdir, mkdtemp, lstat, readdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { dirname, extname, join, posix, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { EXPORT_ARTEN, exportDateiname, exportEintraege, pruefeZipGrenzen, zipTeile } from "./export.mjs";
import { DATEN_DATEIEN } from "./data-loader.mjs";
import { ERLAUBTE_ENDUNGEN, MAX_UPLOAD_BYTES, endungErlaubt, istHeic } from "./upload-regeln.mjs";

const MAX_NAME_LAENGE = 200;
const API_INBOX = "/api/inbox";
const API_BELEGE = "/api/belege";
const API_EXPORT = "/api/export";
const OCR_KOPF = "# Kein Textlayer";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

const BASIS_KOPFZEILEN = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  // Die App kommt ohne Inline-Skripte, Inline-Styles und fremde Quellen aus.
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};

// Rasterbilder (Belegfotos) im eigenen Tab: der Browser baut dafuer ein
// Bild-Dokument mit eigenen Inline-Styles (Zentrieren, Zoomen), die die
// App-CSP blockiert. Rasterbilder fuehren keinen Code aus; fuer sie gilt
// eine engere CSP ohne Skripte, nur mit Inline-Styles. SVG bleibt bei der
// App-CSP, weil es Skripte enthalten kann.
const RASTERBILD_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const RASTERBILDER = new Set([".png", ".jpg", ".jpeg", ".heic", ".heif"]);

// --- Reine Funktionen ------------------------------------------------------

// Rohes Pfadsegment aus der URL -> sicherer Dateiname fuer die Inbox.
// Abgelehnt statt "repariert": Pfadtrenner, Steuerzeichen, fuehrende Punkte
// (versteckte Dateien, ".", ".."), kaputte Kodierung, ueberlange Namen.
export function bereinigeDateiname(roh) {
  const ungueltig = { ok: false, status: 400, grund: "dateiname-ungueltig" };
  let name;
  try {
    name = decodeURIComponent(String(roh));
  } catch {
    return ungueltig;
  }
  name = name.normalize("NFC").trim();
  // eslint-disable-next-line no-control-regex
  if (!name || /[\u0000-\u001f\u007f/\\]/.test(name) || name.startsWith(".")) return ungueltig;
  if (name.length > MAX_NAME_LAENGE) return ungueltig;
  if (!endungErlaubt(name)) return { ok: false, status: 415, grund: "endung-nicht-erlaubt" };
  return { ok: true, name };
}

// Versuch 1 = Originalname, ab 2 mit Suffix vor der Endung: auszug-2.csv.
export function kandidatenName(name, versuch) {
  if (versuch <= 1) return name;
  const punkt = name.lastIndexOf(".");
  return `${name.slice(0, punkt)}-${versuch}${name.slice(punkt)}`;
}

// HEIC/HEIF-Upload -> Name der abgelegten JPEG-Datei.
export function jpegNameFuer(name) {
  const punkt = name.lastIndexOf(".");
  return `${punkt > 0 ? name.slice(0, punkt) : name}.jpg`;
}

// Standard-Konverter: heif-convert (Debian: libheif-examples) bestimmt das
// Ausgabeformat ueber die Endung von aus. Fehlt das Programm, kommt ENOENT.
// Nebenbilder (Tiefe, Hilfsbilder, Sequenzen) schreibt es nur auf Wunsch;
// der Aufrufer laesst ohnehin in ein eigenes Temp-Verzeichnis schreiben.
export const HEIC_TIMEOUT_MS = 60000;
export function heifConvert(ein, aus) {
  return new Promise((resolve, reject) => {
    execFile("heif-convert", ["--quiet", "-q", "90", ein, aus], { timeout: HEIC_TIMEOUT_MS, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 }, (fehler) => (fehler ? reject(fehler) : resolve()));
  });
}

// Hauptbild aus dem Konverter-Verzeichnis: die verlangte Ausgabe, sonst das
// erste JPEG (mehrbildrige Dateien nummerieren ihre Ausgaben).
export async function hauptbildIn(ordner, wunschName) {
  const namen = (await readdir(ordner)).filter((n) => /\.jpe?g$/i.test(n)).sort();
  const name = namen.includes(wunschName) ? wunschName : namen[0];
  return name ? join(ordner, name) : null;
}

export function normalisiereIp(adresse) {
  const text = String(adresse ?? "");
  return text.toLowerCase().startsWith("::ffff:") && isIP(text.slice(7)) === 4 ? text.slice(7) : text;
}

export function pruefeZugang({ proxyIp, remoteAddress, remoteUser }) {
  if (!proxyIp) return true;
  if (normalisiereIp(remoteAddress) !== proxyIp) return false;
  return typeof remoteUser === "string" && remoteUser.trim().length > 0;
}

export function erlaubteOrigins({ origins, port }) {
  return origins ?? [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
}

// Erlaubte Host-Kopfzeilen (Schutz gegen DNS-Rebinding): lokal nur Loopback
// mit Port, mit --origin nur der Host der Origin — mit und ohne Default-Port.
export function erlaubteHosts({ origins, port }) {
  if (!origins) return [`127.0.0.1:${port}`, `localhost:${port}`];
  return origins.flatMap((origin) => {
    const url = new URL(origin);
    if (url.port) return [url.host];
    return [url.host, `${url.hostname}:${url.protocol === "https:" ? 443 : 80}`];
  });
}

function originAusUrl(wert) {
  try {
    const url = new URL(wert);
    if ((url.protocol === "http:" || url.protocol === "https:") && url.origin !== "null") return url.origin;
  } catch { /* unten gemeldet */ }
  throw new Error(`--origin: ungueltige URL "${wert}"`);
}

export function parseArgs(argv, { appDir }) {
  const opt = { host: "127.0.0.1", port: 8000, proxyIp: null, origins: null, inbox: join(appDir, "data", "inbox"), belege: join(appDir, "Belege") };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const gleich = arg.indexOf("=");
    const schalter = gleich > 0 ? arg.slice(0, gleich) : arg;
    const wert = () => {
      if (gleich > 0) return arg.slice(gleich + 1);
      const naechster = argv[i + 1];
      if (naechster === undefined || naechster.startsWith("--")) throw new Error(`${schalter}: Wert fehlt`);
      i += 1;
      return naechster;
    };
    if (schalter === "--host") opt.host = wert();
    else if (schalter === "--port") {
      const roh = wert();
      const port = Number(roh);
      if (!/^\d+$/.test(roh) || port > 65535) throw new Error(`--port: ungueltig "${roh}"`);
      opt.port = port;
    } else if (schalter === "--proxy-ip") {
      const ip = normalisiereIp(wert());
      if (!isIP(ip)) throw new Error(`--proxy-ip: keine IP-Adresse "${ip}"`);
      opt.proxyIp = ip;
    } else if (schalter === "--origin") {
      opt.origins = wert().split(",").map((o) => o.trim()).filter(Boolean).map(originAusUrl);
      if (opt.origins.length === 0) throw new Error("--origin: leer");
    } else if (schalter === "--inbox") opt.inbox = resolve(wert());
    else if (schalter === "--belege") opt.belege = resolve(wert());
    else throw new Error(`Unbekannte Option ${arg}`);
  }
  return opt;
}

// Was der Browser aus app/ bekommt; alles andere ist 404.
// - App-Shell: SHELL plus die Module aus browserModule (Modulgraph ab index.html)
// - data/<bestand>/: nur die Dateien des Loaders (DATEN_DATEIEN) und die Logos
//   in data/<bestand>/logos/, dort nur PNG, wie es tools/logos.mjs ablegt
// - Belege/: Dokumente, aber nichts, was der Browser ausfuehren koennte
// - data/inbox/: nur wartende Uploads (oberste Ebene, Upload-Endungen), fuer
//   die Links der Hochladen-Seite
const SHELL = new Set(["index.html", "styles.css", "version.json", "sitzung.json"]);
const BESTAENDE = new Set(["master", "demo"]);
const AUSFUEHRBAR = new Set([".html", ".htm", ".xhtml", ".xht", ".shtml", ".svg", ".svgz", ".xml", ".xsl", ".xslt", ".js", ".mjs", ".cjs", ".wasm"]);

export function statikErlaubt(segmente, { module = new Set() } = {}) {
  const endung = extname(segmente.at(-1) ?? "").toLowerCase();
  if (segmente[0] === "Belege") return segmente.length > 1 && !AUSFUEHRBAR.has(endung);
  if (segmente[0] === "data") {
    const [, bestand, datei, ...rest] = segmente;
    if (bestand === "inbox") return rest.length === 0 && endungErlaubt(datei ?? "");
    if (!BESTAENDE.has(bestand)) return false;
    if (rest.length === 0) return DATEN_DATEIEN.includes(datei);
    return datei === "logos" && rest.length === 1 && endung === ".png";
  }
  const pfad = segmente.join("/");
  return SHELL.has(pfad) || module.has(pfad);
}

// Relative Importe eines Moduls: statisch (import/export ... from), als
// Seiteneffekt (import "./x") und dynamisch (import("./x")).
const IMPORT_MUSTER = /\b(?:import|export)\s[^"'`;]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|\bimport\s*["']([^"']+)["']/g;
const SKRIPT_MUSTER = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;

// Modulgraph der Browser-App ab den Skripten der index.html, als Pfade relativ
// zu appDir ("views/belege.mjs"). Nur Dateien innerhalb von appDir.
export async function browserModule(appDir) {
  const module = new Set();
  const offen = [];
  const merke = (von, spezifikator) => {
    if (!spezifikator.startsWith("./") && !spezifikator.startsWith("../")) return;
    const pfad = posix.normalize(posix.join(posix.dirname(von), spezifikator.split(/[?#]/)[0]));
    if (pfad.startsWith("../") || module.has(pfad)) return;
    module.add(pfad);
    offen.push(pfad);
  };
  const index = await readFile(join(appDir, "index.html"), "utf8");
  for (const treffer of index.matchAll(SKRIPT_MUSTER)) merke("index.html", treffer[1]);
  while (offen.length) {
    const pfad = offen.pop();
    let quelle;
    try {
      quelle = await readFile(join(appDir, ...pfad.split("/")), "utf8");
    } catch {
      module.delete(pfad);
      continue;
    }
    for (const treffer of quelle.matchAll(IMPORT_MUSTER)) merke(pfad, treffer[1] ?? treffer[2] ?? treffer[3]);
  }
  return module;
}

// --- HTTP ------------------------------------------------------------------

function sendeJson(res, status, objekt, extra = {}) {
  const body = JSON.stringify(objekt);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body), ...extra });
  res.end(body);
}

function abgelehnt(res, status, grund, extra) {
  sendeJson(res, status, { status: "abgelehnt", grund }, extra);
}

function nichtGefunden(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Nicht gefunden\n");
}

function innerhalb(wurzel, pfad) {
  return pfad === wurzel || pfad.startsWith(wurzel + sep);
}

async function liefereStatik(req, res, { appWurzel, belegeWurzel, inboxWurzel, module }) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
    res.end("Methode nicht erlaubt\n");
    return;
  }
  const rohPfad = req.url.split("?")[0].split("#")[0];
  let pfad;
  try {
    pfad = decodeURIComponent(rohPfad);
  } catch {
    nichtGefunden(res);
    return;
  }
  if (!pfad.startsWith("/") || /[\u0000\\]/.test(pfad)) return nichtGefunden(res);
  if (pfad === "/") pfad = "/index.html";
  // Kein Listing, keine versteckten Dateien, kein "..".
  const segmente = pfad.slice(1).split("/");
  if (segmente.some((s) => s === "" || s.startsWith("."))) return nichtGefunden(res);

  if (!statikErlaubt(segmente, { module })) return nichtGefunden(res);

  // Dokumente und Uploads kommen aus den Verzeichnissen des Servers, alles andere aus app/.
  const [wurzel, teile] = segmente[0] === "Belege" ? [belegeWurzel, segmente.slice(1)]
    : segmente[0] === "data" && segmente[1] === "inbox" ? [inboxWurzel, segmente.slice(2)]
      : [appWurzel, segmente];
  if (!wurzel) return nichtGefunden(res);
  const ziel = join(wurzel, ...teile);
  if (!innerhalb(wurzel, ziel)) return nichtGefunden(res);
  let echt;
  let info;
  try {
    echt = await realpath(ziel);
    info = await stat(echt);
  } catch {
    return nichtGefunden(res);
  }
  // Symlinks, die aus ihrer Wurzel hinauszeigen, werden nicht ausgeliefert.
  if (!innerhalb(wurzel, echt) || !info.isFile()) return nichtGefunden(res);

  const endung = extname(echt).toLowerCase();
  // Auch nicht ueber einen Symlink mit harmlosem Namen (a.pdf -> a.html).
  if (AUSFUEHRBAR.has(endung) && (segmente[0] === "Belege" || segmente[0] === "data")) return nichtGefunden(res);
  res.writeHead(200, {
    "Content-Type": MIME[endung] ?? "application/octet-stream",
    "Content-Length": info.size,
    ...(RASTERBILDER.has(endung) ? { "Content-Security-Policy": RASTERBILD_CSP } : {}),
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(echt).on("error", () => res.destroy()).pipe(res);
}

async function listeInbox(inboxDir) {
  let eintraege;
  try {
    eintraege = await readdir(inboxDir, { withFileTypes: true });
  } catch (fehler) {
    if (fehler.code === "ENOENT") return [];
    throw fehler;
  }
  const dateien = await Promise.all(
    eintraege
      .filter((e) => e.isFile() && !e.name.startsWith("."))
      .map(async (e) => {
        const info = await stat(join(inboxDir, e.name));
        return { name: e.name.normalize("NFC"), groesse: info.size, geaendert: info.mtime.toISOString() };
      }),
  );
  return dateien.sort((a, b) => (a.geaendert < b.geaendert ? 1 : a.geaendert > b.geaendert ? -1 : a.name.localeCompare(b.name)));
}

// Textzwilling ohne Textebene erkennen: nur die ersten Bytes lesen.
async function beginntMitOcrKopf(pfad) {
  const datei = await open(pfad, "r");
  try {
    const puffer = Buffer.alloc(OCR_KOPF.length);
    const { bytesRead } = await datei.read(puffer, 0, puffer.length, 0);
    return puffer.subarray(0, bytesRead).toString("utf8") === OCR_KOPF;
  } finally {
    await datei.close();
  }
}

// Alle Dateien unter wurzel rekursiv, Pfade mit praefix ("Belege/..."), nach
// Pfad sortiert. Dotfiles/Dot-Ordner fehlen; Symlinks werden weder gelistet
// noch verfolgt (Dirent.isFile/isDirectory sind fuer Links false). Fehlt die
// Wurzel, ist die Liste leer.
export async function listeBelege(wurzel, praefix = "Belege") {
  const ergebnis = [];
  async function lauf(ordner, rel) {
    let eintraege;
    try {
      eintraege = await readdir(ordner, { withFileTypes: true });
    } catch (fehler) {
      if (fehler.code === "ENOENT" && rel === praefix) return;
      throw fehler;
    }
    const unterordner = [];
    await Promise.all(eintraege.map(async (e) => {
      if (e.name.startsWith(".")) return;
      const voll = join(ordner, e.name);
      const pfad = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        unterordner.push([voll, pfad]);
        return;
      }
      if (!e.isFile()) return;
      const info = await lstat(voll);
      const typ = extname(e.name).slice(1).toLowerCase();
      const eintrag = { pfad, groesse: info.size, geaendert: info.mtime.toISOString(), typ };
      if (typ === "txt" && (await beginntMitOcrKopf(voll))) eintrag.ocrAusstehend = true;
      ergebnis.push(eintrag);
    }));
    for (const [voll, pfad] of unterordner) await lauf(voll, pfad);
  }
  await lauf(wurzel, praefix);
  return ergebnis.sort((a, b) => (a.pfad < b.pfad ? -1 : a.pfad > b.pfad ? 1 : 0));
}

async function sha256Datei(pfad) {
  const hash = createHash("sha256");
  for await (const teil of createReadStream(pfad)) hash.update(teil);
  return hash.digest("hex");
}

class ZuGross extends Error {}

class Umwandlung extends Error {
  constructor(status, grund, ursache) {
    super(`${grund}: ${ursache?.message ?? ""}`);
    this.status = status;
    this.grund = grund;
  }
}

// FileHandle.write darf weniger Bytes schreiben als verlangt (z. B. bei
// knappem Speicher): so lange nachschreiben, bis der ganze Puffer drin ist.
export async function schreibeVoll(datei, puffer) {
  let offset = 0;
  while (offset < puffer.length) {
    const { bytesWritten } = await datei.write(puffer, offset, puffer.length - offset);
    if (!(bytesWritten > 0)) throw new Error("Schreiben ohne Fortschritt");
    offset += bytesWritten;
  }
}

// Legt temp unter ziel ab, ohne je zu ueberschreiben: link() scheitert atomar
// mit EEXIST, wenn ziel schon existiert (auch wenn es gerade erst ein anderer
// Prozess angelegt hat). temp bleibt liegen; der Aufrufer raeumt es weg.
export async function legeAbOhneUeberschreiben(temp, ziel) {
  try {
    await link(temp, ziel);
    return true;
  } catch (fehler) {
    if (fehler.code === "EEXIST") return false;
    throw fehler;
  }
}

export function createAppServer({ appDir, inboxDir, belegeDir = join(appDir, "Belege"), datenDirs = { live: join(appDir, "data", "master"), demo: join(appDir, "data", "demo") }, proxyIp = null, origins = null, maxBytes = MAX_UPLOAD_BYTES, heicKonverter = heifConvert, log = console.log }) {
  let appWurzel = null;
  let belegeWurzel = null;
  let inboxWurzel = null;
  let module = null;
  // Uploads nacheinander abschliessen: Namenswahl ohne Wettlauf untereinander.
  let kette = Promise.resolve();
  const exklusiv = (fn) => {
    const lauf = kette.then(fn);
    kette = lauf.catch(() => {});
    return lauf;
  };

  function protokolliere(name, groesse, ergebnis) {
    log(`${new Date().toISOString()} upload name=${JSON.stringify(String(name))} groesse=${groesse} ergebnis=${ergebnis}`);
  }

  async function nimmUpload(req, res, rohName) {
    const origin = req.headers.origin;
    const port = server.address()?.port;
    if (req.headers["x-finanzen-upload"] !== "1") {
      protokolliere(rohName, 0, "abgelehnt:kopfzeile-fehlt");
      return abgelehnt(res, 403, "kopfzeile-fehlt");
    }
    if (!origin || !erlaubteOrigins({ origins, port }).includes(origin)) {
      protokolliere(rohName, 0, "abgelehnt:origin-abgelehnt");
      return abgelehnt(res, 403, "origin-abgelehnt");
    }
    const geprueft = rohName.includes("/") ? { ok: false, status: 400, grund: "dateiname-ungueltig" } : bereinigeDateiname(rohName);
    if (!geprueft.ok) {
      protokolliere(rohName, 0, `abgelehnt:${geprueft.grund}`);
      return abgelehnt(res, geprueft.status, geprueft.grund);
    }
    const name = geprueft.name;
    const angekuendigt = Number(req.headers["content-length"]);
    if (Number.isFinite(angekuendigt) && angekuendigt > maxBytes) {
      protokolliere(name, angekuendigt, "abgelehnt:zu-gross");
      return abgelehnt(res, 413, "zu-gross", { Connection: "close" });
    }

    await mkdir(inboxDir, { recursive: true });
    // Dotfile: inbox.mjs ignoriert alles mit fuehrendem Punkt, ebenso GET /api/inbox.
    const temp = join(inboxDir, `.upload-${randomBytes(8).toString("hex")}.part`);
    // HEIC/HEIF: Umwandlung in ein eigenes, frisch angelegtes Dot-Verzeichnis
    // (mkdtemp: eindeutig auch bei parallelen Uploads), das am Ende samt aller
    // Nebendateien des Konverters entfernt wird.
    const heic = istHeic(name);
    let heicOrdner = null;
    const zielName = heic ? jpegNameFuer(name) : name;
    let ablage = temp;
    let groesse = 0;
    // Antwort erst nach dem Aufraeumen der Temp-Datei senden.
    let antworte = null;
    try {
      const hash = createHash("sha256");
      const datei = await open(temp, "wx", 0o640);
      try {
        for await (const teil of req) {
          groesse += teil.length;
          if (groesse > maxBytes) throw new ZuGross();
          hash.update(teil);
          await schreibeVoll(datei, teil);
        }
        await datei.sync();
      } finally {
        await datei.close();
      }
      let inhaltHash = hash.digest("hex");

      if (heic) {
        heicOrdner = await mkdtemp(join(inboxDir, ".heic-"));
        try {
          await heicKonverter(temp, join(heicOrdner, "bild.jpg"));
        } catch (fehler) {
          throw fehler.code === "ENOENT"
            ? new Umwandlung(415, "heic-konverter-fehlt", fehler)
            : new Umwandlung(422, "heic-unlesbar", fehler);
        }
        const jpeg = await hauptbildIn(heicOrdner, "bild.jpg");
        const info = jpeg ? await lstat(jpeg) : null;
        if (!info?.isFile() || info.size === 0) throw new Umwandlung(422, "heic-unlesbar", new Error("keine JPEG-Ausgabe"));
        if (info.size > maxBytes) throw new Umwandlung(413, "zu-gross", new Error(`JPEG ${info.size} Bytes`));
        // Gleiche Rechte wie ein direkter Upload, unabhaengig von der umask des Konverters.
        await chmod(jpeg, 0o640);
        ablage = jpeg;
        groesse = info.size;
        inhaltHash = await sha256Datei(jpeg);
      }

      const ergebnis = await exklusiv(async () => {
        for (let versuch = 1; versuch < 1000; versuch += 1) {
          const kandidat = kandidatenName(zielName, versuch);
          const ziel = join(inboxDir, kandidat);
          if (await legeAbOhneUeberschreiben(ablage, ziel)) {
            return { code: 201, status: "hochgeladen", name: kandidat };
          }
          const vorhanden = await lstat(ziel).catch(() => null);
          if (vorhanden?.isFile() && vorhanden.size === groesse && (await sha256Datei(ziel)) === inhaltHash) {
            return { code: 200, status: "vorhanden", name: kandidat };
          }
        }
        throw new Error("kein freier Dateiname");
      });
      protokolliere(ergebnis.name, groesse, heic ? `${ergebnis.status}:umgewandelt-aus=${JSON.stringify(name)}` : ergebnis.status);
      const antwort = { status: ergebnis.status, name: ergebnis.name, ...(heic ? { umgewandelt_aus: name } : {}) };
      antworte = () => sendeJson(res, ergebnis.code, antwort);
    } catch (fehler) {
      if (fehler instanceof Umwandlung) {
        protokolliere(name, groesse, `abgelehnt:${fehler.grund} (${fehler.message})`);
        antworte = () => abgelehnt(res, fehler.status, fehler.grund);
      } else if (fehler instanceof ZuGross) {
        protokolliere(name, groesse, "abgelehnt:zu-gross");
        antworte = () => abgelehnt(res, 413, "zu-gross", { Connection: "close" });
      } else if (req.destroyed || req.aborted || fehler.code === "ECONNRESET" || fehler.code === "ERR_STREAM_PREMATURE_CLOSE") {
        protokolliere(name, groesse, "abgebrochen");
        res.destroy();
      } else {
        protokolliere(name, groesse, `fehler:${fehler.message}`);
        antworte = () => abgelehnt(res, 500, "serverfehler");
      }
    } finally {
      await rm(temp, { force: true });
      if (heicOrdner) await rm(heicOrdner, { recursive: true, force: true });
    }
    antworte?.();
  }

  async function liefereExport(req, res, art) {
    if (req.method !== "GET") return abgelehnt(res, 405, "methode", { Allow: "GET" });
    if (!EXPORT_ARTEN.includes(art)) return abgelehnt(res, 404, "nicht-gefunden");
    const quelle = new URLSearchParams(req.url.split("?")[1] ?? "").get("quelle") === "demo" ? "demo" : "live";
    const eintraege = await exportEintraege(art, { datenDir: datenDirs[quelle], belegeDir });
    let groesse;
    try {
      groesse = pruefeZipGrenzen(eintraege);
    } catch (fehler) {
      log(`${new Date().toISOString()} export art=${art} ergebnis=abgelehnt:${fehler.message}`);
      return abgelehnt(res, 413, "zu-gross");
    }
    const name = exportDateiname(art);
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Length": groesse,
      "Content-Disposition": `attachment; filename="${name}"`,
    });
    try {
      await pipeline(Readable.from(zipTeile(eintraege)), res);
      log(`${new Date().toISOString()} export art=${art} quelle=${quelle} dateien=${eintraege.length} groesse=${groesse}`);
    } catch (fehler) {
      log(`${new Date().toISOString()} export art=${art} ergebnis=abgebrochen:${fehler.message}`);
      res.destroy();
    }
  }

  async function behandle(req, res) {
    for (const [k, v] of Object.entries(BASIS_KOPFZEILEN)) res.setHeader(k, v);
    const host = String(req.headers.host ?? "").toLowerCase();
    const hostOk = erlaubteHosts({ origins, port: server.address()?.port }).includes(host);
    if (!hostOk || !pruefeZugang({ proxyIp, remoteAddress: req.socket.remoteAddress, remoteUser: req.headers["remote-user"] })) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Zugriff verweigert\n");
      return;
    }
    appWurzel ??= await realpath(appDir);
    belegeWurzel ??= await realpath(belegeDir).catch(() => null);
    inboxWurzel ??= await realpath(inboxDir).catch(() => null);
    // Einmal je Serverstart: ein Deploy startet den Dienst neu.
    module ??= await browserModule(appWurzel);
    const rohPfad = req.url.split("?")[0];

    if (rohPfad === API_INBOX) {
      if (req.method !== "GET") return abgelehnt(res, 405, "methode", { Allow: "GET" });
      return sendeJson(res, 200, { dateien: await listeInbox(inboxDir) });
    }
    if (rohPfad === API_BELEGE) {
      if (req.method !== "GET") return abgelehnt(res, 405, "methode", { Allow: "GET" });
      return sendeJson(res, 200, { dateien: await listeBelege(belegeDir) });
    }
    if (rohPfad.startsWith(`${API_EXPORT}/`)) return liefereExport(req, res, rohPfad.slice(API_EXPORT.length + 1));
    if (rohPfad.startsWith(`${API_INBOX}/`)) {
      if (req.method !== "PUT") return abgelehnt(res, 405, "methode", { Allow: "PUT" });
      return nimmUpload(req, res, rohPfad.slice(API_INBOX.length + 1));
    }
    if (rohPfad === "/api" || rohPfad.startsWith("/api/")) return abgelehnt(res, 404, "nicht-gefunden");
    return liefereStatik(req, res, { appWurzel, belegeWurzel, inboxWurzel, module });
  }

  const server = http.createServer((req, res) => {
    behandle(req, res).catch((fehler) => {
      log(`${new Date().toISOString()} fehler ${fehler.message}`);
      if (!res.headersSent) abgelehnt(res, 500, "serverfehler");
      else res.destroy();
    });
  });
  return server;
}

// --- CLI -------------------------------------------------------------------

function main() {
  const appDir = dirname(fileURLToPath(import.meta.url));
  let opt;
  try {
    opt = parseArgs(process.argv.slice(2), { appDir });
  } catch (fehler) {
    console.error(fehler.message);
    console.error("Aufruf: node app/server.mjs [--host <adresse>] [--port <zahl>] [--proxy-ip <ip>] [--origin <url>[,<url>]] [--inbox <pfad>] [--belege <pfad>]");
    process.exit(2);
  }
  const server = createAppServer({ appDir, inboxDir: opt.inbox, belegeDir: opt.belege, proxyIp: opt.proxyIp, origins: opt.origins });
  server.on("error", (fehler) => {
    if (fehler.code === "EADDRINUSE") console.error(`Port ${opt.port} auf ${opt.host} ist bereits belegt — anderen Port mit --port waehlen.`);
    else if (fehler.code === "EACCES") console.error(`Keine Berechtigung fuer ${opt.host}:${opt.port}.`);
    else console.error(`Server-Start fehlgeschlagen: ${fehler.message}`);
    process.exit(1);
  });
  server.listen(opt.port, opt.host, () => {
    const { port } = server.address();
    console.log(`App-Server fuer ${appDir}`);
    console.log(`Inbox: ${opt.inbox} (Endungen: ${ERLAUBTE_ENDUNGEN.join(", ")})`);
    console.log(opt.proxyIp ? `Betriebsmodus: nur Anfragen von ${opt.proxyIp} mit Remote-User` : "Lokaler Modus (ohne Proxy-Pruefung)");
    console.log(`Erlaubte Origins: ${erlaubteOrigins({ origins: opt.origins, port }).join(", ")}`);
    console.log(`Erlaubte Hosts: ${erlaubteHosts({ origins: opt.origins, port }).join(", ")}`);
    console.log(`Offen: http://${opt.host.includes(":") ? `[${opt.host}]` : opt.host}:${port}`);
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

#!/usr/bin/env node
// app/tools/sicherung-pruefen.mjs
// Prueft eine Sicherung (Export "komplett", app/export.mjs) und packt sie auf
// Wunsch als Datenort aus (Review D.1, Restore-Probe). Rein lesend, ausser
// --auspacken schreibt in einen neuen, leeren Ordner.
//
//   node app/tools/sicherung-pruefen.mjs <sicherung.zip> [--json]
//   node app/tools/sicherung-pruefen.mjs <sicherung.zip> --auspacken=<leerer Ordner>
//
// Geprueft: jede Datei gegen ihre CRC, SICHERUNG.json nennt genau die Dateien
// der ZIP mit ihren Groessen. Ausgepackt wird im Aufbau eines Datenorts (ADR
// 0036): Daten/ -> master/ (einfacher Ordner ohne Generationen), Belege/,
// Inbox/ -> inbox/, Importprofile/ -> import-profile/; abgeleitete Dateien
// (buchungen.csv) entfallen. Danach z. B.:
//   FINANZEN_DATEN=<Ordner> node app/tools/validator.mjs data/master
import { mkdir, open, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";
import { SICHERUNG_BEREICHE, SICHERUNG_MANIFEST } from "../export.mjs";
import { legeDateiAn } from "./lib/datei.mjs";

const ENDE = 22;

// Eintraege einer stored-ZIP ohne Kommentar (so schreibt sie export.mjs).
async function liesZip(datei) {
  const fh = await open(datei, "r");
  let groesseDatei = 0;
  const lies = async (pos, laenge) => {
    if (pos < 0 || pos + laenge > groesseDatei) throw new Error("ZIP ist abgeschnitten oder beschaedigt");
    const puffer = Buffer.alloc(laenge);
    const { bytesRead } = await fh.read(puffer, 0, laenge, pos);
    if (bytesRead !== laenge) throw new Error("ZIP ist abgeschnitten");
    return puffer;
  };
  try {
    const { size } = await fh.stat();
    groesseDatei = size;
    if (size < ENDE) throw new Error("keine ZIP-Datei");
    const ende = await lies(size - ENDE, ENDE);
    if (ende.readUInt32LE(0) !== 0x06054b50) throw new Error("keine ZIP-Datei (Endesatz fehlt)");
    const anzahl = ende.readUInt16LE(10);
    const verzeichnis = await lies(ende.readUInt32LE(16), ende.readUInt32LE(12));
    const eintraege = [];
    let pos = 0;
    for (let i = 0; i < anzahl; i += 1) {
      if (verzeichnis.readUInt32LE(pos) !== 0x02014b50) throw new Error("zentrales Verzeichnis kaputt");
      const methode = verzeichnis.readUInt16LE(pos + 10);
      const crc = verzeichnis.readUInt32LE(pos + 16);
      const groesse = verzeichnis.readUInt32LE(pos + 24);
      const nameLaenge = verzeichnis.readUInt16LE(pos + 28);
      const zusatz = verzeichnis.readUInt16LE(pos + 30) + verzeichnis.readUInt16LE(pos + 32);
      const offset = verzeichnis.readUInt32LE(pos + 42);
      const name = verzeichnis.subarray(pos + 46, pos + 46 + nameLaenge).toString("utf8");
      if (methode !== 0) throw new Error(`${name}: komprimierter Eintrag, keine Sicherung dieser App`);
      const kopf = await lies(offset, 30);
      if (kopf.readUInt32LE(0) !== 0x04034b50) throw new Error(`${name}: lokaler Kopf fehlt`);
      const start = offset + 30 + kopf.readUInt16LE(26) + kopf.readUInt16LE(28);
      eintraege.push({ name, crc, groesse, inhalt: () => lies(start, groesse) });
      pos += 46 + nameLaenge + zusatz;
    }
    return { eintraege, schliessen: () => fh.close() };
  } catch (fehler) {
    await fh.close();
    throw fehler;
  }
}

export async function pruefeSicherung(datei, { auspacken } = {}) {
  const { eintraege, schliessen } = await liesZip(datei);
  try {
    const fehler = [];
    let manifest = null;
    const namen = new Set();
    for (const e of eintraege) {
      if (namen.has(e.name)) fehler.push(`${e.name}: doppelt in der ZIP`);
      namen.add(e.name);
      const inhalt = await e.inhalt();
      if (crc32(inhalt) !== e.crc) fehler.push(`${e.name}: CRC stimmt nicht (Datei beschaedigt)`);
      else if (e.name === SICHERUNG_MANIFEST) manifest = JSON.parse(inhalt.toString("utf8"));
    }
    if (!manifest) fehler.push(`${SICHERUNG_MANIFEST} fehlt oder ist beschaedigt`);
    else {
      const inZip = new Map(eintraege.filter((e) => e.name !== SICHERUNG_MANIFEST).map((e) => [e.name, e.groesse]));
      const gelistet = new Map((manifest.dateien ?? []).filter((d) => d.name !== SICHERUNG_MANIFEST).map((d) => [d.name, d.groesse]));
      for (const [name, groesse] of gelistet) {
        if (!inZip.has(name)) fehler.push(`${name}: im Manifest, fehlt in der ZIP`);
        else if (inZip.get(name) !== groesse) fehler.push(`${name}: Groesse ${inZip.get(name)} statt ${groesse}`);
      }
      for (const name of inZip.keys()) if (!gelistet.has(name)) fehler.push(`${name}: in der ZIP, fehlt im Manifest`);
      // Schon beim Pruefen melden, was sich nicht auspacken liesse.
      for (const name of inZip.keys()) {
        try { zielPfad("/", name, manifest.abgeleitet ?? []); } catch (f) { fehler.push(f.message); }
      }
    }
    if (fehler.length === 0 && auspacken) await packeAus(eintraege, manifest, auspacken);
    return { ok: fehler.length === 0, fehler, manifest, dateien: eintraege.length };
  } finally {
    await schliessen();
  }
}

// Name in der ZIP -> Pfad unter ziel, oder null (abgeleitet/Manifest). Nur
// bekannte Bereiche, keine leeren, versteckten oder ".."-Segmente.
function zielPfad(ziel, name, abgeleitet) {
  if (name === SICHERUNG_MANIFEST || abgeleitet.includes(name)) return null;
  const teile = name.split("/");
  const ort = SICHERUNG_BEREICHE[teile[0]];
  const rest = teile.slice(1);
  if (!ort || rest.length === 0 || rest.some((t) => t === "" || t === "." || t === ".." || t.startsWith(".") || t.includes("\\") || t.includes("\0"))) {
    throw new Error(`ungueltiger Name in der Sicherung: ${name}`);
  }
  return path.join(ziel, ort, ...rest);
}

async function packeAus(eintraege, manifest, ziel) {
  const vorhanden = await readdir(ziel).catch((fehler) => (fehler.code === "ENOENT" ? [] : Promise.reject(fehler)));
  if (vorhanden.length) throw new Error(`Ziel ${ziel} ist nicht leer; nichts ausgepackt`);
  const abgeleitet = manifest.abgeleitet ?? [];
  const plan = eintraege.map((e) => [e, zielPfad(ziel, e.name, abgeleitet)]).filter(([, p]) => p);
  for (const ort of Object.values(SICHERUNG_BEREICHE)) await mkdir(path.join(ziel, ort), { recursive: true });
  for (const [e, pfad] of plan) {
    await legeDateiAn(pfad, await e.inhalt());
  }
}

async function main(argv) {
  const datei = argv.find((a) => !a.startsWith("--"));
  const json = argv.includes("--json");
  const auspacken = argv.find((a) => a.startsWith("--auspacken="))?.slice("--auspacken=".length);
  if (!datei) {
    console.error("Aufruf: node app/tools/sicherung-pruefen.mjs <sicherung.zip> [--json] [--auspacken=<leerer Ordner>]");
    process.exit(2);
  }
  const bericht = await pruefeSicherung(datei, { auspacken: auspacken ? path.resolve(auspacken) : undefined });
  if (json) console.log(JSON.stringify(bericht, null, 2));
  else {
    const m = bericht.manifest;
    if (m) {
      console.log(`Sicherung vom ${m.erstellt}, Stand ${m.stand ?? "?"}, Code ${m.code?.kurz ?? "?"}, Pruefung beim Export: ${m.pruefung?.gueltig ? "gueltig" : `${m.pruefung?.fehler_anzahl ?? "?"} Fehler`}`);
      for (const [bereich, b] of Object.entries(m.bereiche ?? {})) console.log(`  ${bereich}: ${b.dateien} Dateien, ${b.bytes} Bytes`);
    }
    for (const f of bericht.fehler) console.error(`- ${f}`);
    console.log(bericht.ok ? `ok: ${bericht.dateien} Eintraege geprueft${auspacken ? `, ausgepackt nach ${path.resolve(auspacken)}` : ""}` : `FEHLER: ${bericht.fehler.length}`);
  }
  if (!bericht.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((fehler) => {
    console.error(fehler.message);
    process.exit(1);
  });
}

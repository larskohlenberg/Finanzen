#!/usr/bin/env node
// app/tools/generationen-einrichten.mjs
// Stellt einen Bestand aus einem einfachen Ordner auf Generationen um (ADR
// 0035, E1 Schritt 5). Ohne --schreiben nur Vorschau.
//
//   node app/tools/generationen-einrichten.mjs data/master [--schreiben]
//
// Ablauf mit --schreiben, alles unter der Schreibsperre des Bestands:
//   1. <datenroot>.gen/ mit Generation 000001 anlegen (Byte-Kopie, Manifest).
//   2. Pruefen: gleiche Dateiliste, jede Datei byte-gleich, Manifest heil,
//      Validator mit denselben Befunden wie vorher, Lesetest ohne Lease (so
//      liest der Webdienst, der ausser der Inbox nichts schreiben darf). Sonst Abbruch; der
//      Bestand bleibt, wie er war, <datenroot>.gen/ wird wieder entfernt.
//   3. Umstellen: der bisherige Ordner wird unveraendert zu
//      <datenroot>.ordner-<Zeitpunkt> (die Sicherung), <datenroot> wird ein
//      Symlink auf <datenroot>.gen/aktuell. Alle Werkzeuge nutzen weiter
//      denselben Pfad.
//   4. Nachpruefung ueber den neuen Pfad (Fingerabdruck G000001, Validator,
//      Lesetest ohne Lease).
//
// Rueckweg (aktueller Stand wieder als einfacher Ordner; im Ordner data/):
//   cp -RL master master.zurueck && rm -f master.zurueck/MANIFEST.json master.zurueck/.leser-* && chmod -R u+w master.zurueck && rm master && mv master.zurueck master
// Ohne Schreibvorgaenge seit der Umstellung geht auch: rm master && mv master.ordner-<Zeitpunkt> master
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, rename, rm, symlink, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pflichtDatenroot } from "./data-root.mjs";
import { synchronisiereOrdner } from "./lib/datei.mjs";
import { bestandFingerabdruck } from "./lib/fingerabdruck.mjs";
import { bestandsArt, einrichten, generationsOrdner, MANIFEST, ORDNER, pruefeGeneration } from "./lib/generationen.mjs";
import { mitLesestand } from "./lib/lesestand.mjs";
import { SperreBelegt, nimmSperre } from "./lib/schreibsperre.mjs";
import { validatorFehler } from "./lib/schreiblauf.mjs";

async function dateien(ordner, praefix = "") {
  const liste = [];
  for (const e of await readdir(ordner, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const rel = `${praefix}${e.name}`;
    if (e.isDirectory()) liste.push(...(await dateien(path.join(ordner, e.name), `${rel}/`)));
    else liste.push({ rel, datei: e.isFile() });
  }
  return liste;
}

const zeitpunkt = () => new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");

export async function plane(datenroot) {
  const info = await lstat(datenroot).catch(() => null);
  if (!info) throw new Error(`${datenroot} fehlt`);
  if (info.isSymbolicLink()) throw new Error(`${datenroot} ist schon ein Symlink (umgestellt?)`);
  if ((await bestandsArt(datenroot)) !== ORDNER) throw new Error(`${datenroot} hat schon Generationen`);
  const liste = await dateien(datenroot);
  const sonder = liste.filter((d) => !d.datei).map((d) => d.rel);
  if (sonder.length) throw new Error(`Keine normalen Dateien (Symlinks o. a.): ${sonder.join(", ")}`);
  const basis = `${datenroot}.gen`;
  if (await lstat(basis).catch(() => null)) throw new Error(`${basis} existiert schon; vorher pruefen und wegraeumen`);
  let bytes = 0;
  for (const { rel } of liste) bytes += (await lstat(path.join(datenroot, rel))).size;
  return { datenroot, basis, sicherung: `${datenroot}.ordner-${zeitpunkt()}`, dateien: liste.map((d) => d.rel).sort(), bytes };
}

const gleicheListe = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// Vergleich Ordner gegen Generation 000001: Dateiliste und Bytes.
export async function vergleiche(datenroot, basis, erwartet) {
  const ordner = generationsOrdner(basis, "000001");
  const fehler = [...(await pruefeGeneration(basis, "000001"))];
  const manifest = JSON.parse(await readFile(path.join(ordner, MANIFEST), "utf8"));
  const inGeneration = Object.keys(manifest.dateien).sort();
  if (!gleicheListe(inGeneration, erwartet)) fehler.push(`Dateiliste weicht ab: Ordner ${erwartet.length}, Generation ${inGeneration.length}`);
  for (const rel of erwartet) {
    const [a, b] = await Promise.all([readFile(path.join(datenroot, rel)), readFile(path.join(ordner, rel)).catch(() => null)]);
    if (!b || !a.equals(b)) fehler.push(`${rel}: nicht byte-gleich`);
  }
  return fehler;
}

// Lesetest wie im Webdienst (ProtectSystem=strict, kein Schreibrecht im
// Bestand, also ohne Lease): jede Datei des Manifests ueber den Lesepfad lesen
// und gegen das Manifest pruefen. pfad ist die Basis oder der Datenroot.
export async function lesetestOhneLease(pfad) {
  const fehler = [];
  try {
    await mitLesestand(pfad, async (leser) => {
      const manifest = JSON.parse(await readFile(path.join(leser.ordner, MANIFEST), "utf8"));
      for (const [rel, soll] of Object.entries(manifest.dateien)) {
        const inhalt = await leser.lies(rel, null);
        if (createHash("sha256").update(inhalt).digest("hex") !== soll.sha256) fehler.push(`Lesetest ohne Lease: ${rel} weicht vom Manifest ab`);
      }
    }, { lease: false });
  } catch (error) {
    fehler.push(`Lesetest ohne Lease gescheitert: ${error.message}`);
  }
  return fehler;
}

export async function stelleUm(plan, { wartenMs = 120000 } = {}) {
  const { datenroot, basis, sicherung } = plan;
  const sperre = await nimmSperre(datenroot, { wer: "generationen-einrichten", wartenMs });
  let umgestellt = false;
  try {
    const vorher = (await validatorFehler(datenroot)).sort();
    await einrichten(basis, datenroot);
    const fehler = [...(await vergleiche(datenroot, basis, plan.dateien)), ...(await lesetestOhneLease(basis))];
    const nachEinrichten = (await validatorFehler(generationsOrdner(basis, "000001"))).sort();
    if (!gleicheListe(vorher, nachEinrichten)) fehler.push(`Validator weicht ab: vorher ${vorher.length} Fehler, Generation ${nachEinrichten.length}`);
    if (fehler.length) {
      await rm(basis, { recursive: true, force: true });
      return { ok: false, fehler };
    }
    // Umstellen: Symlink bereitlegen, Ordner zur Sicherung, Symlink an seinen Platz.
    const link = `${datenroot}.link-${process.pid}`;
    await symlink(path.join(path.basename(basis), "aktuell"), link);
    await rename(datenroot, sicherung);
    try {
      await rename(link, datenroot);
    } catch (error) {
      await rename(sicherung, datenroot);
      await unlink(link).catch(() => {});
      throw error;
    }
    umgestellt = true;
    await synchronisiereOrdner(path.dirname(datenroot));
    const fingerabdruck = await bestandFingerabdruck(datenroot);
    const danach = (await validatorFehler(datenroot)).sort();
    const nachpruefung = [];
    if (fingerabdruck !== "G000001") nachpruefung.push(`Fingerabdruck ${fingerabdruck}, erwartet G000001`);
    if (!gleicheListe(vorher, danach)) nachpruefung.push(`Validator ueber ${datenroot}: ${danach.length} Fehler, vorher ${vorher.length}`);
    nachpruefung.push(...(await lesetestOhneLease(datenroot)));
    return { ok: nachpruefung.length === 0, fehler: nachpruefung, fingerabdruck, validator: danach.length };
  } finally {
    // Die Sperrdatei ist mit dem alten Ordner in die Sicherung gewandert.
    if (umgestellt) await unlink(path.join(sicherung, ".schreibsperre")).catch(() => {});
    else await sperre.freigeben();
  }
}

function rueckweg(plan) {
  const dir = path.dirname(plan.datenroot);
  const name = path.basename(plan.datenroot);
  return [
    `Rueckweg (aktueller Stand wieder als einfacher Ordner), im Ordner ${dir}:`,
    `  cp -RL ${name} ${name}.zurueck && rm -f ${name}.zurueck/MANIFEST.json ${name}.zurueck/.leser-* && chmod -R u+w ${name}.zurueck && rm ${name} && mv ${name}.zurueck ${name}`,
    "Ohne Schreibvorgaenge seit der Umstellung auch:",
    `  rm ${name} && mv ${path.basename(plan.sicherung)} ${name}`,
  ].join("\n");
}

async function main(argv) {
  const schreiben = argv.includes("--schreiben");
  const datenroot = path.resolve(fileURLToPath(pflichtDatenroot(argv.find((a) => !a.startsWith("--")))));
  const plan = await plane(datenroot);
  console.log(`${schreiben ? "Umstellung" : "Vorschau (nichts geschrieben)"}: ${plan.datenroot}`);
  console.log(`  ${plan.dateien.length} Dateien, ${plan.bytes} Bytes`);
  console.log(`  Generationen: ${plan.basis}/ (Generation 000001)`);
  console.log(`  Sicherung (bisheriger Ordner, unveraendert): ${plan.sicherung}`);
  console.log(`  danach: ${plan.datenroot} -> ${path.basename(plan.basis)}/aktuell`);
  if (!schreiben) {
    console.log("Mit --schreiben ausfuehren.");
    return;
  }
  let r;
  try {
    r = await stelleUm(plan);
  } catch (error) {
    if (!(error instanceof SperreBelegt)) throw error;
    console.error(error.message);
    process.exitCode = 3;
    return;
  }
  if (!r.ok && !r.fingerabdruck) {
    console.error("Abbruch vor der Umstellung, der Bestand ist unveraendert:");
    for (const f of r.fehler) console.error(`- ${f}`);
    process.exitCode = 1;
    return;
  }
  if (!r.ok) {
    console.error("Umgestellt, aber die Nachpruefung meldet:");
    for (const f of r.fehler) console.error(`- ${f}`);
    console.error(rueckweg(plan));
    process.exitCode = 1;
    return;
  }
  console.log(`Umgestellt: Fingerabdruck ${r.fingerabdruck}, Validator ${r.validator} Fehler (wie vorher), alle Dateien byte-gleich, Lesetest ohne Lease ok.`);
  console.log(rueckweg(plan));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

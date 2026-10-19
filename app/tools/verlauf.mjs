#!/usr/bin/env node
// app/tools/verlauf.mjs
// Verlauf eines Bestands mit Generationen (ADR 0035, E1 Schritt 6): die letzten
// N Generationen mit Zeit, ausloesendem Werkzeug und Kurzfassung der
// Aenderungen. Nur lesend; rueckgaengig machen mit tools/rueckgaengig.mjs.
//
//   node app/tools/verlauf.mjs data/master [--anzahl=10] [--json]
//   node app/tools/verlauf.mjs data/master --behalten=20 [--schreiben]
//
// --behalten: wie viele fruehere Generationen das Aufraeumen nach jedem
// Schreiben aufbewahrt (Default 10). Steht in EINSTELLUNGEN.json im
// Basisordner des Bestands, gilt fuer alle Werkzeuge; ohne --schreiben nur
// Vorschau. Kleinere Werte raeumen erst beim naechsten Schreiben auf.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pflichtDatenroot } from "./data-root.mjs";
import { bestandsArt, findeBasis, liesEinstellungen, OhneVerlauf, ORDNER, setzeBehalten, veroeffentlichteIds } from "./lib/generationen.mjs";
import { SperreBelegt } from "./lib/schreibsperre.mjs";
import { GESPERRT_EXITCODE } from "./lib/schreiblauf.mjs";
import { liesVerlauf, verlaufText } from "./lib/verlauf.mjs";

export async function verlaufBericht(datenroot, { anzahl = 10 } = {}) {
  const verlauf = await liesVerlauf(await findeBasis(datenroot), { anzahl });
  return { verlauf, text: verlaufText(verlauf, datenroot) };
}

function zahlArg(argv, name) {
  const roh = argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (roh === undefined) return undefined;
  if (!/^\d+$/.test(roh)) throw new Error(`--${name} braucht eine ganze Zahl: ${roh}`);
  return Number(roh);
}

async function behaltenSetzen(datenroot, behalten, schreiben) {
  const basis = await findeBasis(datenroot);
  if ((await bestandsArt(basis)) === ORDNER) throw new OhneVerlauf(basis);
  const bisher = await liesEinstellungen(basis).then((e) => e.behalten, () => "unlesbar");
  const aufbewahrt = (await veroeffentlichteIds(basis)).length;
  if (!schreiben) {
    console.log(`Vorschau (nichts geschrieben): behalten ${bisher} -> ${behalten} fruehere Generationen (aufbewahrt sind ${aufbewahrt} insgesamt). Mit --schreiben setzen.`);
    if (behalten === 0) console.log("Achtung: Mit 0 raeumt der naechste Schreibvorgang alle frueheren Generationen weg; danach gibt es nichts mehr rueckgaengig zu machen.");
    return;
  }
  try {
    await setzeBehalten(basis, behalten, { wer: "verlauf.mjs" });
  } catch (error) {
    if (!(error instanceof SperreBelegt)) throw error;
    console.error(error.message);
    process.exitCode = GESPERRT_EXITCODE;
    return;
  }
  console.log(`behalten: ${bisher} -> ${behalten}. Gilt ab dem naechsten Schreibvorgang.`);
}

async function main(argv) {
  const datenroot = path.resolve(fileURLToPath(pflichtDatenroot(argv.find((a) => !a.startsWith("--")))));
  try {
    const behalten = zahlArg(argv, "behalten");
    if (behalten !== undefined) return await behaltenSetzen(datenroot, behalten, argv.includes("--schreiben"));
    const { verlauf, text } = await verlaufBericht(datenroot, { anzahl: zahlArg(argv, "anzahl") ?? 10 });
    console.log(argv.includes("--json") ? JSON.stringify(verlauf, null, 2) : text);
  } catch (error) {
    if (!(error instanceof OhneVerlauf)) throw error;
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

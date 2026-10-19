#!/usr/bin/env node
// app/mcp/server.mjs
// MCP-Server "finanzen" ueber stdio (zeilengetrenntes JSON-RPC 2.0), nur
// Node-Bordmittel. stdout traegt ausschliesslich Protokoll, Logs gehen nach
// stderr (nur Methode/Tool/Dauer/Fehlerklasse, nie Inhalte).
//
//   node app/mcp/server.mjs <datenroot> [--recht=lesen|schreiben]
//
// Gedacht fuer den Start per SSH-Forced-Command; SSH_ORIGINAL_COMMAND wird
// bewusst nicht ausgewertet. App-Raum und Repo-Root ergeben sich aus der Lage
// dieses Skripts, der Datenroot muss unter <app>/data/ liegen.
import { stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dataRootFromArg } from "../tools/data-root.mjs";
import { verarbeiteZeile } from "./protokoll.mjs";
import { releaseKennung } from "./version.mjs";

const app = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
const repo = path.dirname(app);

function log(text) {
  process.stderr.write(`[finanzen-mcp] ${text}\n`);
}

function abbruch(text) {
  log(text);
  process.exit(2);
}

async function kontext(argv) {
  const rechtArg = argv.find((a) => a.startsWith("--recht="));
  const recht = rechtArg ? rechtArg.slice("--recht=".length) : "lesen";
  if (!["lesen", "schreiben"].includes(recht)) abbruch(`--recht muss lesen oder schreiben sein, nicht "${recht}"`);
  const unbekannt = argv.filter((a) => a.startsWith("--") && !a.startsWith("--recht="));
  if (unbekannt.length) abbruch(`unbekannte Option: ${unbekannt.join(" ")}`);
  const rootArg = argv.find((a) => !a.startsWith("--"));
  if (!rootArg) abbruch("Aufruf: node app/mcp/server.mjs <datenroot> [--recht=lesen|schreiben]");

  const datenroot = fileURLToPath(dataRootFromArg(rootArg, undefined, new URL("../", import.meta.url))).replace(/\/$/, "");
  const daten = path.join(app, "data");
  if (!datenroot.startsWith(`${daten}${path.sep}`)) abbruch("Datenroot muss unter <app>/data/ liegen (z. B. data/master)");
  if (!(await stat(datenroot).catch(() => null))?.isDirectory()) abbruch("Datenroot existiert nicht");
  // Release-Kennung beim Start: weicht die installierte spaeter ab, weist die
  // Sitzung fachliche Aufrufe ab (version.mjs).
  return { app, repo, datenroot, datenrootRel: path.relative(app, datenroot).split(path.sep).join("/"), recht, release: releaseKennung(app) };
}

async function main() {
  const ctx = await kontext(process.argv.slice(2));
  log(`gestartet, recht=${ctx.recht}, release=${ctx.release}`);
  const offen = new Set();
  const zeilen = createInterface({ input: process.stdin, crlfDelay: Infinity });
  zeilen.on("line", (zeile) => {
    const auftrag = verarbeiteZeile(ctx, zeile, log)
      .then((antwort) => { if (antwort) process.stdout.write(`${antwort}\n`); })
      .catch((error) => log(`unerwartet: ${error.name}`))
      .finally(() => offen.delete(auftrag));
    offen.add(auftrag);
  });
  zeilen.on("close", async () => {
    await Promise.allSettled([...offen]);
    log("beendet");
  });
}

main();

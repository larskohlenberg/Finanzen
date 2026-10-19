// app/tools/lib/schreiblauf.mjs
// Schreiblauf einer CLI ueber einen Entwurf (ADR 0035): Der Elternprozess
// nimmt die Schreibsperre, legt per mitSchreiber einen Entwurf an und startet
// dieselbe CLI darin neu (Datenroot = Entwurf). Nur wenn die CLI erfolgreich
// endet und der Validator keine neuen Fehler meldet, wird der Entwurf
// veroeffentlicht; sonst bleibt der Bestand unveraendert.
//
// Die CLI im Entwurf erkennt den Lauf an der Umgebung (ENTWURF_UMGEBUNG ist
// ihr Datenroot) und schreibt dann direkt. So laufen auch die vom MCP-Server
// gestarteten CLIs: mitRollback legt den Entwurf an und reicht ihn weiter.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadMasterData, validateMasterData } from "../validator.mjs";
import { dataRootFromArg } from "../data-root.mjs";
import { findeBasis, mitSchreiber, StandVeraltet } from "./generationen.mjs";
import { SperreBelegt, UMGEBUNG as SPERRE_UMGEBUNG } from "./schreibsperre.mjs";

export const ENTWURF_UMGEBUNG = "FINANZEN_ENTWURF";
export const BESTAND_UMGEBUNG = "FINANZEN_BESTAND";
export const VERALTET_EXITCODE = 4;
export const GESPERRT_EXITCODE = 3;

const gleich = (a, b) => path.resolve(String(a)) === path.resolve(String(b));

// Laeuft dieser Prozess im Entwurf, den ein Elternprozess fuer datenroot angelegt hat?
export function imEntwurfsLauf(datenroot) {
  const entwurf = process.env[ENTWURF_UMGEBUNG];
  return Boolean(entwurf) && gleich(entwurf, datenroot);
}

// Der Bestand, fuer den ein Entwurf steht (fuer Orte neben dem Bestand wie
// data/inbox oder Belege/); ausserhalb eines Entwurfs der Pfad selbst.
export function bestandZumEntwurf(datenroot) {
  return imEntwurfsLauf(datenroot) && process.env[BESTAND_UMGEBUNG] ? path.resolve(process.env[BESTAND_UMGEBUNG]) : path.resolve(datenroot);
}

export async function validatorFehler(ordner) {
  try {
    return validateMasterData(await loadMasterData(pathToFileURL(`${ordner}${path.sep}`))).errors;
  } catch (error) {
    return [`Masterdaten nicht lesbar: ${error.message}`];
  }
}

// Ersetzt im argv der CLI das Argument, das den Datenroot nennt (als eigenes
// Argument oder --x=<pfad>), durch den Entwurf.
export function argvImEntwurf(argv, datenroot, entwurf) {
  const appRoot = new URL("../../", import.meta.url);
  const zeigtAuf = (wert) => {
    try {
      return gleich(fileURLToPath(dataRootFromArg(wert, undefined, appRoot)), datenroot);
    } catch {
      return false;
    }
  };
  let treffer = 0;
  const neu = argv.map((arg) => {
    const gleichheit = arg.startsWith("--") ? arg.indexOf("=") : -1;
    if (gleichheit > 0 && zeigtAuf(arg.slice(gleichheit + 1))) {
      treffer += 1;
      return `${arg.slice(0, gleichheit + 1)}${entwurf}`;
    }
    if (!arg.startsWith("--") && zeigtAuf(arg)) {
      treffer += 1;
      return entwurf;
    }
    return arg;
  });
  if (treffer !== 1) throw new Error(`Datenroot ${datenroot} im Aufruf nicht eindeutig gefunden (${treffer} Treffer)`);
  return neu;
}

function starteKind(argv, env) {
  return new Promise((resolve, reject) => {
    const kind = spawn(process.execPath, [...process.execArgv, process.argv[1], ...argv], { env, stdio: "inherit" });
    kind.on("error", reject);
    kind.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

// Fuehrt den Schreiblauf der aufrufenden CLI im Entwurf aus und liefert den
// Exitcode fuer den Elternprozess. erwartet: Fingerabdruck aus der Vorschau.
// okCodes: Exitcodes, mit denen die CLI als erfolgreich gilt. aussenWirkung:
// die CLI verschiebt Dateien ausserhalb des Bestands (Inbox, Belege/); dann
// wird auch nach einem Werkzeugfehler veroeffentlicht, solange der Validator
// keine neuen Fehler meldet (die Verschiebung laesst sich nicht zuruecknehmen).
export async function schreibeImEntwurf(datenroot, argv, { erwartet, fingerabdruck, okCodes = [0], aussenWirkung = false } = {}) {
  const basis = await findeBasis(datenroot);
  let kindCode = 0;
  let vorher = [];
  try {
    const r = await mitSchreiber(basis, async (tx) => {
      if (erwartet) {
        const aktuell = await fingerabdruck(datenroot);
        if (aktuell !== erwartet) throw new StandVeraltet(datenroot, erwartet, aktuell);
      }
      vorher = await validatorFehler(tx.ordner);
      const env = { ...process.env, [ENTWURF_UMGEBUNG]: tx.ordner, [BESTAND_UMGEBUNG]: path.resolve(datenroot), ...(tx.sperre ? { [SPERRE_UMGEBUNG]: tx.sperre } : {}) };
      kindCode = await starteKind(argvImEntwurf(argv, datenroot, tx.ordner), env);
      if (!okCodes.includes(kindCode) && !aussenWirkung) throw new Werkzeugfehler(kindCode);
    }, {
      wer: path.basename(process.argv[1] ?? "node"),
      pruefe: async (ordner) => {
        const bekannt = new Set(vorher);
        return (await validatorFehler(ordner)).filter((f) => !bekannt.has(f));
      },
    });
    if (r.verworfen) {
      console.error(`Validator meldet ${r.fehler.length} neue(n) Fehler — nichts uebernommen, Bestand unveraendert:`);
      for (const f of r.fehler.slice(0, 20)) console.error(`- ${f}`);
      return 1;
    }
    if (r.warnung) console.error(r.warnung);
    if (r.geaendert.length && r.id !== r.vorher) console.error(`Neuer Stand: G${r.id} (${r.geaendert.length} Datei(en) geaendert)`);
    return kindCode;
  } catch (error) {
    if (error instanceof Werkzeugfehler) {
      console.error(`Werkzeug endete mit Exitcode ${error.code} — nichts uebernommen, Bestand unveraendert.`);
      return error.code;
    }
    if (error instanceof SperreBelegt) {
      console.error(error.message);
      return GESPERRT_EXITCODE;
    }
    if (error instanceof StandVeraltet) {
      console.error(`Bestand ${path.basename(datenroot)} hat sich seit der Vorschau geaendert (Fingerabdruck ${error.erwartet}, jetzt ${error.aktuell}). Nichts geschrieben; Vorschau neu ansehen und mit dem neuen Fingerabdruck schreiben.`);
      return VERALTET_EXITCODE;
    }
    throw error;
  }
}

class Werkzeugfehler extends Error {
  constructor(code) {
    super(`Werkzeug endete mit Exitcode ${code}`);
    this.code = code;
  }
}

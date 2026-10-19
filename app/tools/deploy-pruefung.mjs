// app/tools/deploy-pruefung.mjs
// Helfer fuer ops/aktualisieren.sh (geprueftes Release-Deploy, Review 1.0).
// Rein lesend bis auf die Sperrdatei.
//
//   node deploy-pruefung.mjs sperre <datenroot> --pid=<pid> [--warten=<sek>]
//     Nimmt die Schreibsperre fuer die Lebenszeit von <pid> (das Deploy-Skript)
//     und gibt die Kennung auf stdout aus. Wartet bis zu <sek> Sekunden auf
//     laufende Schreibvorgaenge. Belegt: Meldung, Exitcode 3.
//   node deploy-pruefung.mjs freigeben <datenroot> <kennung>
//     Gibt genau diese Sperre frei; eine fremde bleibt liegen.
//   node deploy-pruefung.mjs rauchtest <datenroot>
//     Laedt den Bestand, validiert und rechnet die Kennzahlen der Uebersicht
//     (wie das MCP-Tool kennzahlen). Ausgabe nur Mengen, keine Betraege.
//     Absturz: Exitcode 1.
import { fileURLToPath } from "node:url";
import { kennzahlenText } from "../mcp/kennzahlen.mjs";
import { localTodayIso } from "../liquiditaet.mjs";
import { pflichtDatenroot } from "./data-root.mjs";
import { gibSperreFrei, nimmSperre, SperreBelegt } from "./lib/schreibsperre.mjs";
import { loadMasterData, validateMasterData } from "./validator.mjs";

function option(args, name) {
  const treffer = args.find((a) => a.startsWith(`--${name}=`));
  return treffer?.slice(name.length + 3);
}

function ganzzahl(wert, name) {
  if (!/^[1-9][0-9]*$/.test(wert ?? "")) throw new Error(`--${name} muss eine positive ganze Zahl sein.`);
  return Number(wert);
}

export async function rauchtest(root, stichtag = localTodayIso()) {
  const daten = await loadMasterData(root);
  const validation = validateMasterData(daten);
  Object.assign(daten, { validation, checks: [], importfehler: [] });
  const text = kennzahlenText(daten, stichtag);
  if (!text.includes("Nettovermoegen")) throw new Error("Kennzahlen ohne Nettovermoegen");
  return {
    buchungen: daten.transaktionen.length,
    konten: daten.konten.length,
    fehler: validation.errors.length,
  };
}

async function main(argv) {
  const [befehl, rootArg, ...rest] = argv;
  const root = pflichtDatenroot(rootArg);
  const pfad = fileURLToPath(root);
  if (befehl === "sperre") {
    const pid = ganzzahl(option(rest, "pid"), "pid");
    const wartenMs = ganzzahl(option(rest, "warten") ?? "120", "warten") * 1000;
    try {
      const sperre = await nimmSperre(pfad, { wer: "deploy", pid, wartenMs });
      console.log(sperre.kennung);
    } catch (error) {
      if (!(error instanceof SperreBelegt)) throw error;
      console.error(error.message);
      process.exitCode = 3;
    }
    return;
  }
  if (befehl === "freigeben") {
    if (!(await gibSperreFrei(pfad, rest[0]))) console.error("Sperre war nicht (mehr) die eigene; nichts freigegeben.");
    return;
  }
  if (befehl === "rauchtest") {
    const r = await rauchtest(root);
    console.log(`Daten-Rauchtest ok: ${r.buchungen} Buchungen, ${r.konten} Konten, Validator ${r.fehler} Fehler`);
    return;
  }
  throw new Error(`Unbekannter Befehl: ${befehl ?? "(keiner)"} (sperre, freigeben, rauchtest)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error?.stack ?? String(error));
    process.exitCode = 1;
  });
}

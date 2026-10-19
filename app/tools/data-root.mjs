import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { physisch } from "./lib/datenort.mjs";

// Das Argument ist ein Dateisystempfad, keine URL: Prozentzeichen u. ae. bleiben
// woertlich (pathToFileURL), "data/..." ist relativ zum App-Raum, alles andere
// relativ zum Arbeitsverzeichnis. Mit FINANZEN_DATEN liegt data/master am
// externen Datenort (lib/datenort.mjs).
export function dataRootFromArg(arg, fallbackRoot, appRoot = new URL("../", import.meta.url)) {
  if (!arg) return fallbackRoot;
  const value = String(arg);
  const ziel = value.startsWith("data/") ? physisch(fileURLToPath(appRoot), value) : path.resolve(process.cwd(), value);
  return pathToFileURL(`${ziel}${path.sep}`);
}

// Fuer CLIs: der Datenbestand ist Pflicht (AGENTS.md, Regel 4). Kein stiller
// Default auf data/master — ein vergessenes Argument darf nie den Echtbestand
// treffen.
export function pflichtDatenroot(arg, appRoot = new URL("../", import.meta.url)) {
  if (!arg) {
    throw new Error("Datenbestand fehlt: ausdruecklich angeben, z. B. data/master (Echtdaten) oder data/demo (Beispieldaten).");
  }
  return dataRootFromArg(arg, undefined, appRoot);
}

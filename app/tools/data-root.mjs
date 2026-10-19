import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Das Argument ist ein Dateisystempfad, keine URL: Prozentzeichen u. ae. bleiben
// woertlich (pathToFileURL), "data/..." ist relativ zum App-Raum, alles andere
// relativ zum Arbeitsverzeichnis.
export function dataRootFromArg(arg, fallbackRoot, appRoot = new URL("../", import.meta.url)) {
  if (!arg) return fallbackRoot;
  const value = String(arg);
  const basis = value.startsWith("data/") ? fileURLToPath(appRoot) : process.cwd();
  return pathToFileURL(`${path.resolve(basis, value)}${path.sep}`);
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

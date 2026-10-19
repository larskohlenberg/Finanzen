// app/tools/validator.mjs
// Node-Seite des Validators: Dateien lesen + CLI. Die reine Pruefologik liegt in
// validate-core.mjs (browserfaehig), damit Browser und CLI exakt dieselbe Logik
// nutzen ("das Tool prueft" gilt auch in der UI).
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateMasterData } from "./validate-core.mjs";
import { dataRootFromArg } from "./data-root.mjs";
import { mitLesestand } from "./lib/lesestand.mjs";

export { validateMasterData };

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonl(path) {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

async function readJsonOptional(path, fallback) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readJsonlOptional(path) {
  try {
    return await readJsonl(path);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function loadMasterData(root = new URL("../data/master/", import.meta.url)) {
  return {
    personen: await readJson(new URL("personen.json", root)),
    konten: await readJson(new URL("konten.json", root)),
    kategorien: await readJson(new URL("kategorien.json", root)),
    transaktionen: await readJsonl(new URL("transaktionen.jsonl", root)),
    transfers: await readJson(new URL("transfers.json", root)),
    regelzahlungen: await readJson(new URL("regelzahlungen.json", root)),
    fristen: await readJsonOptional(new URL("fristen.json", root), []),
    szenarien: await readJsonOptional(new URL("szenarien.json", root), []),
    kategorisierungsregeln: await readJsonOptional(new URL("kategorisierungsregeln.json", root), []),
    immobilien: await readJsonOptional(new URL("immobilien.json", root), []),
    darlehen: await readJsonOptional(new URL("darlehen.json", root), []),
    vermoegenswerte: await readJsonOptional(new URL("vermoegenswerte.json", root), []),
    vorsorge: await readJsonOptional(new URL("vorsorge.json", root), []),
    zeitwerte: await readJsonlOptional(new URL("zeitwerte.jsonl", root)),
    logos: await readJsonOptional(new URL("logos.json", root), []),
    importauftraege: await readJsonlOptional(new URL("importauftraege.jsonl", root)),
  };
}

async function main() {
  const root = dataRootFromArg(process.argv[2], undefined, new URL("../", import.meta.url));
  // Eine Generation (Lease), im einfachen Ordner der Ordner selbst. Ohne
  // Argument bleibt der fruehere Default von loadMasterData.
  const result = root
    ? await mitLesestand(root, async (leser) => validateMasterData(await loadMasterData(leser.url)))
    : validateMasterData(await loadMasterData());
  if (result.valid) {
    console.log("Master data validation passed");
    return;
  }
  console.error("Master data validation failed");
  for (const error of result.errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

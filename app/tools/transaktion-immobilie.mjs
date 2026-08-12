import { appendFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dataRootFromArg } from "./data-root.mjs";
import { loadMasterData, validateMasterData } from "./validator.mjs";

export function aktualisiereImmobilienbezug({
  transaktionen,
  immobilien,
  ids,
  immobilieId,
  entfernen = false,
  ersetzen = false,
}) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("ids ist Pflicht");
  }
  if (Boolean(immobilieId) === Boolean(entfernen)) {
    throw new Error("genau eine Aktion angeben: --immobilie oder --entfernen");
  }
  if (entfernen && ersetzen) {
    throw new Error("--ersetzen ist nur zusammen mit --immobilie erlaubt");
  }
  if (immobilieId && !(immobilien ?? []).some((imm) => imm.immobilie_id === immobilieId)) {
    throw new Error(`immobilie_id ${immobilieId} existiert nicht`);
  }

  const gesucht = [...new Set(ids)];
  const byId = new Map(transaktionen.map((entry) => [entry.transaktion_id, entry]));
  const nichtGefunden = gesucht.filter((id) => !byId.has(id));
  const konflikte = entfernen || ersetzen
    ? []
    : gesucht.filter((id) => {
        const current = byId.get(id)?.immobilie_id;
        return current && current !== immobilieId;
      });
  const report = {
    betroffen: gesucht.length - nichtGefunden.length,
    gesetzt: 0,
    entfernt: 0,
    unveraendert: 0,
    konflikte,
    nicht_gefunden: nichtGefunden,
  };

  if (nichtGefunden.length || konflikte.length) {
    return { transaktionen, report, blockiert: true };
  }

  const ziel = new Set(gesucht);
  const next = transaktionen.map((entry) => {
    if (!ziel.has(entry.transaktion_id)) return entry;
    if (entfernen) {
      if (!Object.hasOwn(entry, "immobilie_id")) {
        report.unveraendert += 1;
        return entry;
      }
      const copy = { ...entry };
      delete copy.immobilie_id;
      report.entfernt += 1;
      return copy;
    }
    if (entry.immobilie_id === immobilieId) {
      report.unveraendert += 1;
      return entry;
    }
    report.gesetzt += 1;
    return { ...entry, immobilie_id: immobilieId };
  });

  return { transaktionen: next, report, blockiert: false };
}

function parseArgs(argv) {
  const args = {
    ids: [],
    immobilieId: undefined,
    entfernen: false,
    ersetzen: false,
    schreiben: false,
    root: undefined,
  };
  for (const arg of argv) {
    if (arg === "--entfernen") {
      args.entfernen = true;
    } else if (arg === "--ersetzen") {
      args.ersetzen = true;
    } else if (arg === "--schreiben") {
      args.schreiben = true;
    } else if (arg.startsWith("--ids=")) {
      args.ids = arg.slice("--ids=".length).split(",")
        .map((value) => value.trim()).filter(Boolean);
    } else if (arg.startsWith("--immobilie=")) {
      args.immobilieId = arg.slice("--immobilie=".length);
    } else if (arg.startsWith("--")) {
      throw new Error(`unbekanntes Argument: ${arg}`);
    } else if (args.root === undefined) {
      args.root = arg;
    } else {
      throw new Error(`mehr als ein Datenroot angegeben: ${arg}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataRoot = dataRootFromArg(
    args.root,
    new URL("../data/master/", import.meta.url),
    new URL("../", import.meta.url),
  );
  const data = await loadMasterData(dataRoot);
  const out = aktualisiereImmobilienbezug({
    transaktionen: data.transaktionen,
    immobilien: data.immobilien,
    ids: args.ids,
    immobilieId: args.immobilieId,
    entfernen: args.entfernen,
    ersetzen: args.ersetzen,
  });

  if (out.blockiert) {
    console.log(JSON.stringify({ modus: "blockiert", ...out.report }, null, 2));
    process.exitCode = 2;
    return;
  }
  if (!args.schreiben) {
    console.log(JSON.stringify({ modus: "vorschau", ...out.report }, null, 2));
    return;
  }

  const beforeWrite = validateMasterData({ ...data, transaktionen: out.transaktionen });
  if (!beforeWrite.valid) {
    throw new Error(`Validierung vor Schreiben fehlgeschlagen:\n${beforeWrite.errors.join("\n")}`);
  }

  await writeFile(
    new URL("transaktionen.jsonl", dataRoot),
    out.transaktionen.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
  );

  const afterWrite = validateMasterData(await loadMasterData(dataRoot));
  if (!afterWrite.valid) {
    throw new Error(`Validierung nach Schreiben fehlgeschlagen:\n${afterWrite.errors.join("\n")}`);
  }

  const logEntry = {
    zeitpunkt: new Date().toISOString(),
    anlass: "transaktion-immobilie",
    inputs: ["transaktionen.jsonl", "immobilien.json"],
    anzahl_importiert: 0,
    anzahl_offen: 0,
    anzahl_fehler: 0,
    immobilienbezuege_gesetzt: out.report.gesetzt,
    immobilienbezuege_entfernt: out.report.entfernt,
    notiz: args.entfernen
      ? "Immobilienbezug von Transaktionen entfernt"
      : `Immobilienbezug ${args.immobilieId} an Transaktionen gesetzt`,
    betroffene_ids: [...new Set(args.ids)],
  };
  await appendFile(
    new URL("agent_log.jsonl", dataRoot),
    `${JSON.stringify(logEntry)}\n`,
  );
  console.log(JSON.stringify({ modus: "geschrieben", ...out.report }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

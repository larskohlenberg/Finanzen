// app/tools/agent-vorschlag.mjs
//
// Setzt Agenten-Einzelvorschlaege: `vorgeschlagen` mit `kategorie_herkunft = agent`.
//
// Abgrenzung — warum das nicht confirm.mjs kann und auch nicht koennen soll:
// confirm.mjs ist der MENSCHLICHE Entscheidungskanal und schreibt darum immer
// `bestaetigt` (mit Herkunft `regel` oder `manuell`). Ein Agentenvorschlag ist
// das Gegenteil: eine Vorbereitung, ueber die noch entschieden werden muss.
// Beides in ein Tool zu legen hiesse, den Unterschied zwischen Vorschlag und
// Entscheidung von einem Flag abhaengig zu machen — genau die Grenze, auf der
// das ganze Herkunftsmodell steht.
//
// Genutzt von kategorisierungsregel-pflege fuer die Belegstufen E5 (Merchant
// klar, Leistung mehrdeutig) und E6 (Recherche ergebnislos -> KAT-012). Diese
// Faelle bekommen bewusst KEINE Regel: eine Regel ist dauerhaft und feuert auf
// kuenftige Importe, eine Vermutung darf das nicht.
//
// Fasst nur `offen` und eigene frueher gesetzte Agentenvorschlaege an. Alles,
// worueber schon entschieden wurde — und auch ein fremder Regel-Vorschlag —
// bleibt unangetastet.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadMasterData, validateMasterData } from "./validator.mjs";
import { dataRootFromArg } from "./data-root.mjs";

function istKandidat(tx) {
  if (tx.kategorisierung_status === "offen") return true;
  // Ein eigener Agentenvorschlag darf nachgebessert werden; ein Regel-Vorschlag
  // nicht — der gehoert dem Regelwerk und wird ueber Regeln korrigiert.
  return tx.kategorisierung_status === "vorgeschlagen" && tx.kategorie_herkunft === "agent";
}

export function agentVorschlag({ transaktionen, ids, kategorieId }) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("ids ist Pflicht — ein Agentenvorschlag gilt immer einer benannten Menge, nie einem offenen Filter");
  }
  if (!kategorieId) throw new Error("kategorie ist Pflicht");

  const gesucht = new Set(ids);
  const gesehen = new Set();
  const report = { betroffen: 0, geaendert: 0, unveraendert: 0, uebersprungen: 0, nicht_gefunden: [] };

  const next = transaktionen.map((tx) => {
    if (!gesucht.has(tx.transaktion_id)) return tx;
    gesehen.add(tx.transaktion_id);
    report.betroffen += 1;

    if (!istKandidat(tx)) {
      report.uebersprungen += 1;
      return tx;
    }
    if (tx.kategorisierung_status === "vorgeschlagen" && tx.kategorie_herkunft === "agent" && tx.kategorie_id === kategorieId) {
      report.unveraendert += 1;
      return tx;
    }

    // matched_regeln ist bei Herkunft agent nie vorhanden (agent-context).
    const { matched_regeln, ...rest } = tx;
    report.geaendert += 1;
    return { ...rest, kategorisierung_status: "vorgeschlagen", kategorie_id: kategorieId, kategorie_herkunft: "agent" };
  });

  report.nicht_gefunden = ids.filter((id) => !gesehen.has(id));
  return { transaktionen: next, report };
}

async function readJsonl(url) {
  const text = await readFile(url, "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
}

const USAGE = `Aufruf: node app/tools/agent-vorschlag.mjs --ids=TXN-a,TXN-b --kategorie=KAT-012 [datenroot] [--schreiben]

Setzt die genannten Buchungen auf kategorisierung_status=vorgeschlagen mit
kategorie_herkunft=agent. Entschiedene Buchungen und fremde Regel-Vorschlaege
bleiben unangetastet. Ohne --schreiben laeuft nur die Vorschau.`;

async function main() {
  const argv = process.argv.slice(2);
  const idsArg = argv.find((a) => a.startsWith("--ids="));
  const katArg = argv.find((a) => a.startsWith("--kategorie="));
  const root = argv.find((a) => !a.startsWith("--"));
  const schreiben = argv.includes("--schreiben");

  if (!idsArg || !katArg) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const masterRoot = dataRootFromArg(root, new URL("../data/master/", import.meta.url), new URL("../", import.meta.url));
  const transaktionen = await readJsonl(new URL("transaktionen.jsonl", masterRoot));

  const out = agentVorschlag({
    transaktionen,
    ids: idsArg.slice("--ids=".length).split(",").map((v) => v.trim()).filter(Boolean),
    kategorieId: katArg.slice("--kategorie=".length),
  });

  console.log(JSON.stringify({ modus: schreiben ? "geschrieben" : "vorschau", ...out.report }, null, 2));
  if (!schreiben) {
    console.log("\nVorschau — nichts geschrieben. Mit --schreiben anwenden.");
    return;
  }

  await writeFile(new URL("transaktionen.jsonl", masterRoot), out.transaktionen.map((tx) => JSON.stringify(tx)).join("\n") + "\n");

  const validation = validateMasterData(await loadMasterData(masterRoot));
  if (!validation.valid) {
    console.error("Validierung nach Agentenvorschlag fehlgeschlagen:");
    for (const error of validation.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

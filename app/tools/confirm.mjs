// app/tools/confirm.mjs
//
// Der menschliche Entscheidungskanal fuer Kategorien (ADR 0006: die App zeigt
// nur, geschrieben wird ueber Agent + Tool). Nimmt einen Filter und EINE
// Entscheidung und wendet sie auf den getroffenen Schnitt an — statt 468 Zeilen
// einzeln zu editieren.
//
// Abgrenzung zu recategorize.mjs: dort rechnet die Maschine das Regelwerk neu
// und fasst menschliche Akte NIE an. Hier entscheidet der Mensch und darf
// darum auch eine frueher getroffene Entscheidung korrigieren — aber nur mit
// ausdruecklichem `auch_entschiedene`, damit ein zu breiter Filter keine
// stille Massen-Ueberschreibung wird.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { categorize } from "./categorizer.mjs";
import { loadMasterData, validateMasterData } from "./validator.mjs";
import { dataRootFromArg } from "./data-root.mjs";
import { normalizeLoose } from "./lib/text.mjs";

const ENTSCHIEDEN = new Set(["bestaetigt", "abgelehnt"]);
const KRITERIEN = ["ids", "konto_id", "status", "herkunft", "gegenpartei", "verwendungszweck", "kategorie_id", "regel_id", "von", "bis"];

function alsListe(value) {
  if (value === undefined || value === null) return null;
  return Array.isArray(value) ? value : [value];
}

function ohne(tx, ...felder) {
  const rest = { ...tx };
  for (const feld of felder) delete rest[feld];
  return rest;
}

function trifftFilter(tx, filter) {
  const ids = alsListe(filter.ids);
  if (ids && !ids.includes(tx.transaktion_id)) return false;
  if (filter.konto_id && filter.konto_id !== tx.konto_id) return false;

  const status = alsListe(filter.status);
  if (status && !status.includes(tx.kategorisierung_status)) return false;

  const herkunft = alsListe(filter.herkunft);
  if (herkunft && !herkunft.includes(tx.kategorie_herkunft)) return false;

  if (filter.kategorie_id && filter.kategorie_id !== tx.kategorie_id) return false;
  if (filter.regel_id && !(tx.matched_regeln ?? []).includes(filter.regel_id)) return false;
  if (filter.von && tx.buchungsdatum < filter.von) return false;
  if (filter.bis && tx.buchungsdatum > filter.bis) return false;

  if (filter.gegenpartei && !normalizeLoose(tx.gegenpartei).includes(normalizeLoose(filter.gegenpartei))) return false;
  if (filter.verwendungszweck && !normalizeLoose(tx.verwendungszweck).includes(normalizeLoose(filter.verwendungszweck))) return false;
  return true;
}

// Herkunft einer gesetzten Kategorie: deckt eine aktive Regel dieselbe
// Kategorie ab, ist die Herkunft `regel` — sonst zaehlte die Buchung nie zur
// Regel und die Regel erschiene faelschlich als "greift nie" (agent-context:
// Regel und manuell schliessen sich aus).
function mitKategorie(tx, kategorieId, regeln) {
  const verdict = categorize(tx, regeln);
  if (verdict.status === "vorgeschlagen" && verdict.kategorie_id === kategorieId) {
    return { ...tx, kategorisierung_status: "bestaetigt", kategorie_id: kategorieId, kategorie_herkunft: "regel", matched_regeln: verdict.matched_regeln };
  }
  return { ...ohne(tx, "matched_regeln"), kategorisierung_status: "bestaetigt", kategorie_id: kategorieId, kategorie_herkunft: "manuell" };
}

function anwenden(tx, entscheidung, regeln) {
  if (entscheidung.aktion === "ablehnen") {
    return { tx: { ...ohne(tx, "kategorie_id", "kategorie_herkunft", "matched_regeln"), kategorisierung_status: "abgelehnt" } };
  }
  if (entscheidung.aktion === "kategorie") {
    return { tx: mitKategorie(tx, entscheidung.kategorie_id, regeln) };
  }
  // bestaetigen: uebernimmt den vorliegenden Vorschlag unveraendert. Ohne
  // Kategorie gibt es nichts zu bestaetigen — das ist ein Fehler, kein Rateschritt.
  if (!tx.kategorie_id) {
    return { fehler: "keine Kategorie am Datensatz — bestaetigen braucht eine Kategorie (erst `kategorie` setzen)" };
  }
  return { tx: { ...tx, kategorisierung_status: "bestaetigt" } };
}

function unveraendert(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function confirmTransactions({ transaktionen, regeln = [], filter = {}, entscheidung }) {
  if (!KRITERIEN.some((k) => filter[k] !== undefined && filter[k] !== null && filter[k] !== "")) {
    throw new Error(`Filter ohne Kriterium wirkt auf den gesamten Bestand — mindestens eines angeben: ${KRITERIEN.join(", ")}`);
  }
  if (!["bestaetigen", "ablehnen", "kategorie"].includes(entscheidung?.aktion)) {
    throw new Error("entscheidung.aktion muss bestaetigen, ablehnen oder kategorie sein");
  }
  if (entscheidung.aktion === "kategorie" && !entscheidung.kategorie_id) {
    throw new Error("entscheidung.aktion=kategorie braucht eine kategorie_id");
  }

  const report = { betroffen: 0, geaendert: 0, unveraendert: 0, uebersprungen: 0, fehler: [] };

  const next = transaktionen.map((tx) => {
    if (!trifftFilter(tx, filter)) return tx;
    report.betroffen += 1;

    if (ENTSCHIEDEN.has(tx.kategorisierung_status) && !filter.auch_entschiedene) {
      report.uebersprungen += 1;
      return tx;
    }

    const { tx: result, fehler } = anwenden(tx, entscheidung, regeln);
    if (fehler) {
      report.fehler.push({ transaktion_id: tx.transaktion_id, grund: fehler });
      return tx;
    }
    if (unveraendert(tx, result)) {
      report.unveraendert += 1;
      return tx;
    }
    report.geaendert += 1;
    return result;
  });

  return { transaktionen: next, report };
}

async function readJsonl(url) {
  const text = await readFile(url, "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
}

function parseArgs(argv) {
  const args = { filter: {}, entscheidung: {}, schreiben: false, root: undefined };
  for (const arg of argv) {
    if (arg === "--schreiben") { args.schreiben = true; continue; }
    if (arg === "--auch-entschiedene") { args.filter.auch_entschiedene = true; continue; }
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    const value = rest.join("=");
    if (!arg.startsWith("--")) { args.root = arg; continue; }
    if (key === "aktion") args.entscheidung.aktion = value;
    else if (key === "kategorie") args.entscheidung.kategorie_id = value;
    else if (key === "ids") args.filter.ids = value.split(",").map((v) => v.trim()).filter(Boolean);
    else if (key === "status") args.filter.status = value.split(",").map((v) => v.trim()).filter(Boolean);
    else if (key === "herkunft") args.filter.herkunft = value.split(",").map((v) => v.trim()).filter(Boolean);
    else if (KRITERIEN.includes(key) || key === "kategorie_id") args.filter[key] = value;
    else throw new Error(`unbekanntes Argument: ${arg}`);
  }
  return args;
}

const USAGE = `Aufruf: node app/tools/confirm.mjs --aktion=<bestaetigen|ablehnen|kategorie> [filter...] [datenroot] [--schreiben]

Filter (mindestens einer):  --ids=  --konto_id=  --status=  --herkunft=  --gegenpartei=
                            --verwendungszweck=  --kategorie_id=  --regel_id=  --von=  --bis=
Bei aktion=kategorie:       --kategorie=KAT-003
Korrektur bereits entschiedener Buchungen: --auch-entschiedene
Ohne --schreiben laeuft nur die Vorschau.`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.entscheidung.aktion) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const masterRoot = dataRootFromArg(args.root, new URL("../data/master/", import.meta.url), new URL("../", import.meta.url));
  const [transaktionen, regeln] = await Promise.all([
    readJsonl(new URL("transaktionen.jsonl", masterRoot)),
    readFile(new URL("kategorisierungsregeln.json", masterRoot), "utf8").then(JSON.parse),
  ]);

  const out = confirmTransactions({ transaktionen, regeln, filter: args.filter, entscheidung: args.entscheidung });
  console.log(JSON.stringify({ modus: args.schreiben ? "geschrieben" : "vorschau", ...out.report }, null, 2));

  if (!args.schreiben) {
    console.log("\nVorschau — nichts geschrieben. Mit --schreiben anwenden.");
    return;
  }
  await writeFile(new URL("transaktionen.jsonl", masterRoot), out.transaktionen.map((tx) => JSON.stringify(tx)).join("\n") + "\n");

  const validation = validateMasterData(await loadMasterData(masterRoot));
  if (!validation.valid) {
    console.error("Validierung nach Bestaetigungslauf fehlgeschlagen:");
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

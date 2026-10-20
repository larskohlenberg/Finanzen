// app/tools/personenbezug.mjs
//
// Fuer wen ist eine Buchung? (ADR 0039) Setzt fuer_person_id an Transaktionen:
// abgeleitet aus der Regelzahlung der Buchung oder aus Kategorisierungsregeln
// mit fuer_person_id, oder von Hand fuer explizite IDs. Wer bezahlt hat, folgt
// weiter dem Konto; dieses Feld sagt nur, wem die Ausgabe zugutekommt.
//
// Vorrang: manuell vor Regelzahlung vor Regel. Eine Handentscheidung fasst die
// Ableitung nie an; "manuell" ohne Person heisst bewusst keine Person.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { matchesRule } from "./categorizer.mjs";
import { pflichtDatenroot } from "./data-root.mjs";
import { meldeNachSchreiben, validatorBefunde } from "./lib/validator-befund.mjs";
import { beginneLauf } from "./lib/fingerabdruck.mjs";
import { ersetzeDatei } from "./lib/datei.mjs";

function ohnePerson(tx) {
  const { fuer_person_id, fuer_person_herkunft, ...rest } = tx;
  return rest;
}

// Abgeleitete Person einer Buchung oder ein Konflikt mehrerer Regeln.
function ableitung(tx, regelzahlungen, regeln) {
  const rz = tx.regelzahlung_id ? regelzahlungen.get(tx.regelzahlung_id) : undefined;
  if (rz?.fuer_person_id) return { person: rz.fuer_person_id, herkunft: "regelzahlung" };
  const treffer = regeln.filter((regel) => matchesRule(tx, regel));
  const personen = [...new Set(treffer.map((regel) => regel.fuer_person_id))];
  if (personen.length === 1) return { person: personen[0], herkunft: "regel" };
  if (personen.length > 1) return { konflikt: treffer.map((regel) => regel.regel_id) };
  return {};
}

export function personenbezug({
  transaktionen,
  personen = [],
  regeln = [],
  regelzahlungen = [],
  ids,
  personId,
  entfernen = false,
  automatisch = false,
}) {
  const handarbeit = Array.isArray(ids) && ids.length > 0;
  const aktionen = [Boolean(personId), entfernen, automatisch].filter(Boolean).length;
  if (handarbeit && aktionen !== 1) throw new Error("mit ids genau eine Aktion angeben: person, entfernen oder automatisch");
  if (!handarbeit && aktionen > 0) throw new Error("person, entfernen und automatisch brauchen ids");
  if (personId && !personen.some((p) => p.person_id === personId)) throw new Error(`person_id ${personId} existiert nicht`);

  const report = { hand: 0, gesetzt: 0, geaendert: 0, entfernt: 0, unveraendert: 0, konflikte: [], nicht_gefunden: [], je_person: {} };
  let liste = transaktionen;

  if (handarbeit) {
    const ziel = new Set(ids);
    report.nicht_gefunden = [...ziel].filter((id) => !transaktionen.some((tx) => tx.transaktion_id === id));
    if (report.nicht_gefunden.length) return { transaktionen, report, blockiert: true };
    liste = transaktionen.map((tx) => {
      if (!ziel.has(tx.transaktion_id)) return tx;
      report.hand += 1;
      if (automatisch) return ohnePerson(tx);
      if (entfernen) return { ...ohnePerson(tx), fuer_person_herkunft: "manuell" };
      return { ...tx, fuer_person_id: personId, fuer_person_herkunft: "manuell" };
    });
  }

  const rzMap = new Map(regelzahlungen.map((rz) => [rz.regelzahlung_id, rz]));
  const personenRegeln = regeln.filter((regel) => regel.status === "aktiv" && regel.fuer_person_id);
  const next = liste.map((tx, i) => {
    const vorher = transaktionen[i];
    let neu = tx;
    if (tx.fuer_person_herkunft !== "manuell") {
      const a = ableitung(tx, rzMap, personenRegeln);
      if (a.konflikt) report.konflikte.push({ transaktion_id: tx.transaktion_id, regeln: a.konflikt });
      neu = a.person ? { ...ohnePerson(tx), fuer_person_id: a.person, fuer_person_herkunft: a.herkunft } : ohnePerson(tx);
    }
    if (neu.fuer_person_id) report.je_person[neu.fuer_person_id] = (report.je_person[neu.fuer_person_id] ?? 0) + 1;
    if (vorher.fuer_person_id === neu.fuer_person_id && vorher.fuer_person_herkunft === neu.fuer_person_herkunft) {
      report.unveraendert += 1;
      return vorher;
    }
    if (!vorher.fuer_person_id && neu.fuer_person_id) report.gesetzt += 1;
    else if (vorher.fuer_person_id && !neu.fuer_person_id) report.entfernt += 1;
    else report.geaendert += 1;
    return neu;
  });
  return { transaktionen: next, report, blockiert: false };
}

async function readJson(url, fallback) {
  try {
    return JSON.parse(await readFile(url, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    throw error;
  }
}
async function readJsonl(url) {
  const text = await readFile(url, "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
}

function parseArgs(argv) {
  const args = { ids: [], schreiben: false, entfernen: false, automatisch: false };
  for (const arg of argv) {
    if (arg === "--schreiben") args.schreiben = true;
    else if (arg === "--entfernen") args.entfernen = true;
    else if (arg === "--automatisch") args.automatisch = true;
    else if (arg.startsWith("--ids=")) args.ids = arg.slice(6).split(",").map((v) => v.trim()).filter(Boolean);
    else if (arg.startsWith("--person=")) args.personId = arg.slice(9);
    else if (arg.startsWith("--fingerabdruck=")) {
      // lib/fingerabdruck.mjs
    } else if (arg.startsWith("--")) throw new Error(`unbekanntes Argument: ${arg}`);
    else if (args.root === undefined) args.root = arg;
    else throw new Error(`mehr als ein Datenroot angegeben: ${arg}`);
  }
  return args;
}

// Ohne ids: Ableitung ueber den ganzen Bestand (nach Import, Regel- oder
// Regelzahlungsaenderung nachziehen). Vorschau ist Default.
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = pflichtDatenroot(args.root);
  await beginneLauf(fileURLToPath(root), args.schreiben, undefined, { okCodes: [0, 2] });
  const [transaktionen, personen, regeln, regelzahlungen] = await Promise.all([
    readJsonl(new URL("transaktionen.jsonl", root)),
    readJson(new URL("personen.json", root)),
    readJson(new URL("kategorisierungsregeln.json", root), []),
    readJson(new URL("regelzahlungen.json", root), []),
  ]);
  const out = personenbezug({ transaktionen, personen, regeln, regelzahlungen, ...args });
  const modus = out.blockiert ? "blockiert" : args.schreiben ? "geschrieben" : "vorschau";
  console.log(JSON.stringify({ modus, ...out.report }, null, 2));
  if (out.blockiert) {
    process.exitCode = 2;
    return;
  }
  if (!args.schreiben) {
    console.log("\nVorschau — nichts geschrieben. Mit --schreiben anwenden.");
    return;
  }
  const vorher = await validatorBefunde(root);
  await ersetzeDatei(new URL("transaktionen.jsonl", root), out.transaktionen.map((tx) => JSON.stringify(tx)).join("\n") + "\n");
  await meldeNachSchreiben(root, vorher, "Validierung nach Personenbezug fehlgeschlagen");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

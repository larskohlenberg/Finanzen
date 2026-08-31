// app/tools/migrate-bestaetigt-durch.mjs
//
// Einmalige Migration (ADR 0025): bestehende bestaetigte Buchungen bekommen
// bestaetigt_durch = "mensch". Konservativ, weil sie damit vor Regellaeufen
// geschuetzt bleiben — genau wie vor Einfuehrung des Feldes. Als "auto"
// wuerde der naechste recategorize-Lauf sie alle neu bewerten.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dataRootFromArg } from "./data-root.mjs";

export function migriere(transaktionen) {
  let geaendert = 0;
  const next = transaktionen.map((tx) => {
    if (tx.kategorisierung_status !== "bestaetigt") return tx;
    if (tx.bestaetigt_durch) return tx;
    geaendert += 1;
    return { ...tx, bestaetigt_durch: "mensch" };
  });
  return { transaktionen: next, geaendert };
}

async function main() {
  const args = process.argv.slice(2);
  const schreiben = args.includes("--schreiben");
  const masterRoot = dataRootFromArg(args.find((a) => !a.startsWith("--")));
  const url = new URL("transaktionen.jsonl", masterRoot);
  const text = await readFile(url, "utf8");
  const transaktionen = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));

  const out = migriere(transaktionen);
  console.log(`${out.geaendert} Buchung(en) erhalten bestaetigt_durch = "mensch".`);
  if (!schreiben) {
    console.log("Vorschau — nichts geschrieben. Mit --schreiben anwenden.");
    return;
  }
  await writeFile(url, out.transaktionen.map((tx) => JSON.stringify(tx)).join("\n") + "\n");
  console.log("Geschrieben.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

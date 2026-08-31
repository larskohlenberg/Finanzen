// app/tools/migrate-belegstufe.mjs
//
// Einmalige Migration (ADR 0025): Bestandsregeln bekommen `belegstufe = "E2"`,
// wo der Bestand die Stufe **beweist** — nicht, wo sie plausibel waere.
//
// E2 heisst laut Belegleiter: derselbe Merchant ist anderswo schon entschieden.
// Genau das ist pruefbar: trifft das Muster einer Regel menschlich bestaetigte
// Buchungen, und tragen ALLE davon die Kategorie der Regel, dann ist die Regel
// durch den eigenen Bestand belegt.
//
// Regeln mit Widerspruch (menschliche Entscheidung weicht ab) und Regeln ohne
// jeden menschlichen Treffer bleiben ohne Stufe. Sie geben damit nichts
// automatisch frei und stehen im Gate-Durchfallbericht — das ist die
// Arbeitsliste, kein Fehler.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { categorize } from "./categorizer.mjs";
import { referenzmenge } from "./lib/spezifitaet.mjs";
import { dataRootFromArg } from "./data-root.mjs";

export function belegstufeAusBestand(regeln, transaktionen) {
  const referenz = referenzmenge(transaktionen);
  const bericht = { belegt: [], widerspruch: [], ohne_treffer: [], uebersprungen: [] };

  const next = regeln.map((regel) => {
    if (regel.belegstufe) { bericht.uebersprungen.push(regel.regel_id); return regel; }
    if (regel.status !== "aktiv") { bericht.uebersprungen.push(regel.regel_id); return regel; }

    const treffer = referenz.filter((tx) => categorize(tx, [regel]).matched_regeln.includes(regel.regel_id));
    if (treffer.length === 0) { bericht.ohne_treffer.push(regel.regel_id); return regel; }

    const abweichend = treffer.filter((tx) => tx.kategorie_id !== regel.kategorie_id);
    if (abweichend.length > 0) {
      bericht.widerspruch.push({ regel_id: regel.regel_id, passend: treffer.length - abweichend.length, abweichend: abweichend.length });
      return regel;
    }
    bericht.belegt.push({ regel_id: regel.regel_id, treffer: treffer.length });
    return { ...regel, belegstufe: "E2" };
  });

  return { regeln: next, bericht };
}

async function main() {
  const args = process.argv.slice(2);
  const schreiben = args.includes("--schreiben");
  const masterRoot = dataRootFromArg(args.find((a) => !a.startsWith("--")));

  const text = await readFile(new URL("transaktionen.jsonl", masterRoot), "utf8");
  const transaktionen = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  const regeln = JSON.parse(await readFile(new URL("kategorisierungsregeln.json", masterRoot), "utf8"));

  const out = belegstufeAusBestand(regeln, transaktionen);
  console.log(`E2 durch den Bestand belegt: ${out.bericht.belegt.length}`);
  console.log(`Ohne menschlichen Treffer (bleibt ohne Stufe): ${out.bericht.ohne_treffer.length}`);
  console.log(`Widerspruch zu menschlichen Entscheidungen: ${out.bericht.widerspruch.length}`);
  for (const w of out.bericht.widerspruch) {
    console.log(`  - ${w.regel_id}: ${w.passend} passend, ${w.abweichend} abweichend — Regel pruefen`);
  }

  if (!schreiben) { console.log("\nVorschau — nichts geschrieben. Mit --schreiben anwenden."); return; }
  await writeFile(new URL("kategorisierungsregeln.json", masterRoot), JSON.stringify(out.regeln, null, 2) + "\n");
  console.log("\nGeschrieben.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

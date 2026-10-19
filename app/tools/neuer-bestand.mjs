// app/tools/neuer-bestand.mjs
//
// Legt einen leeren, gueltigen Datenbestand an: alle Masterdateien leer, dazu
// ein Grundgeruest aus Kategorien. Regeln, Konten und Personen entstehen erst
// mit dem Nutzer — ein neuer Bestand erbt nichts aus einem anderen.
// Ueberschreibt nie: liegt schon eine Masterdatei im Ziel, bricht das Tool ab.
import { mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dataRootFromArg } from "./data-root.mjs";
import { legeDateiAn } from "./lib/datei.mjs";

const USAGE = `Aufruf: node app/tools/neuer-bestand.mjs <datenroot> [--schreiben]
Ohne --schreiben nur Vorschau. Produktiv ist der Datenroot data/master.`;

// KAT-012 hat im System eine feste Bedeutung (Pruefbericht, Agentenvorschlaege)
// und bleibt das letzte Element; neue Kategorien kommen davor.
export const GRUNDKATEGORIEN = [
  { kategorie_id: "KAT-001", name: "Gehalt & Einkommen", typ: "einnahme", lebenshaltung_relevant: false, status: "aktiv" },
  { kategorie_id: "KAT-002", name: "Sonstige Einnahmen", typ: "einnahme", lebenshaltung_relevant: false, status: "aktiv" },
  { kategorie_id: "KAT-003", name: "Wohnen & Energie", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" },
  { kategorie_id: "KAT-004", name: "Lebensmittel & Drogerie", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" },
  { kategorie_id: "KAT-005", name: "Mobilitaet", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" },
  { kategorie_id: "KAT-006", name: "Versicherungen", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" },
  { kategorie_id: "KAT-007", name: "Gesundheit", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" },
  { kategorie_id: "KAT-008", name: "Freizeit & Urlaub", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" },
  { kategorie_id: "KAT-009", name: "Kredite & Finanzierung", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" },
  { kategorie_id: "KAT-010", name: "Sparen & Umbuchung", typ: "neutral", lebenshaltung_relevant: false, status: "aktiv" },
  { kategorie_id: "KAT-011", name: "Sonstige Ausgaben", typ: "ausgabe", lebenshaltung_relevant: true, status: "aktiv" },
  { kategorie_id: "KAT-012", name: "Noch zu klaeren", typ: "neutral", lebenshaltung_relevant: false, status: "aktiv" },
];

const LEERE_LISTEN = [
  "personen.json", "konten.json", "transfers.json", "regelzahlungen.json",
  "kategorisierungsregeln.json", "szenarien.json", "immobilien.json",
  "darlehen.json", "vermoegenswerte.json", "vorsorge.json", "fristen.json",
];
const LEERE_ZEILENDATEIEN = ["transaktionen.jsonl", "zeitwerte.jsonl"];

const json = (wert) => JSON.stringify(wert, null, 2) + "\n";

export function planNeuerBestand(vorhandeneDateien) {
  const dateien = {
    ...Object.fromEntries(LEERE_LISTEN.map((name) => [name, "[]\n"])),
    "kategorien.json": json(GRUNDKATEGORIEN),
    ...Object.fromEntries(LEERE_ZEILENDATEIEN.map((name) => [name, ""])),
  };
  const vorhanden = vorhandeneDateien.filter((name) => name in dateien);
  return { dateien, vorhanden };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) { console.log(USAGE); return; }
  const rootArg = args.find((a) => !a.startsWith("--"));
  if (!rootArg) throw new Error(USAGE);
  const schreiben = args.includes("--schreiben");
  const root = dataRootFromArg(rootArg);

  const vorhandeneDateien = await readdir(root).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const plan = planNeuerBestand(vorhandeneDateien);
  if (plan.vorhanden.length > 0) {
    throw new Error(`Abbruch: Im Ziel liegen schon Masterdaten (${plan.vorhanden.join(", ")}). Ein neuer Bestand ueberschreibt nichts.`);
  }

  const ziel = fileURLToPath(root);
  console.log(`Neuer Datenbestand in ${ziel}:`);
  for (const name of Object.keys(plan.dateien)) console.log(`  ${name}`);
  console.log(`  davon kategorien.json mit ${GRUNDKATEGORIEN.length} Grundkategorien, KAT-012 = Noch zu klaeren`);

  if (!schreiben) {
    console.log("\nVorschau — nichts geschrieben. Mit --schreiben anlegen.");
    return;
  }
  await mkdir(root, { recursive: true });
  for (const [name, inhalt] of Object.entries(plan.dateien)) {
    await legeDateiAn(new URL(name, root), inhalt);
  }
  console.log("\nAngelegt. Jetzt den Validator laufen lassen.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

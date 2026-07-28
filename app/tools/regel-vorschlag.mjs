// app/tools/regel-vorschlag.mjs
//
// Macht aus dem offenen Kategorisierungs-Rueckstand Regelkandidaten: gleiche
// Gegenpartei = ein Vorschlag, sortiert nach Abdeckung. Damit entscheidet der
// Nutzer einmal pro Muster statt einmal pro Buchung.
//
// Das Tool schlaegt NIE eine Kategorie vor und legt NIE eine Regel an (siehe
// import-agent Don'ts). Es liefert Muster, Abdeckung und Beispiele — die
// Fachentscheidung bleibt beim Menschen, das Anlegen beim Regelpflege-Prozess.
//
// Gruppierung: volle, lose normalisierte Gegenpartei. Am echten Bestand
// (2026-07) gemessen deckt das 225 von 242 offenen Buchungen ab; eine
// Stamm-Variante (nur der Teil vor "/") brachte 2 Buchungen mehr bei deutlich
// unschaerferen Mustern — nicht wert (YAGNI).
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dataRootFromArg } from "./data-root.mjs";
import { normalizeLoose, toCents, centsToDecimal } from "./lib/text.mjs";

const MAX_BEISPIELE = 3;

export function regelVorschlaege({ transaktionen, mindestTreffer = 2 }) {
  const offen = transaktionen.filter((tx) => tx.kategorisierung_status === "offen");
  const ohneGegenpartei = offen.filter((tx) => normalizeLoose(tx.gegenpartei) === "");

  const gruppen = new Map();
  for (const tx of offen) {
    const key = normalizeLoose(tx.gegenpartei);
    if (key === "") continue;
    if (!gruppen.has(key)) gruppen.set(key, []);
    gruppen.get(key).push(tx);
  }

  const alle = [...gruppen.entries()].map(([gegenpartei_pattern, buchungen]) => {
    // offen + nicht leeres matched_regeln = Regelkonflikt (mehrere Regeln,
    // verschiedene Kategorien). Das braucht Reparatur, keine weitere Regel.
    const matched = [...new Set(buchungen.flatMap((tx) => tx.matched_regeln ?? []))].sort();
    return {
      gegenpartei_pattern,
      treffer: buchungen.length,
      summe: centsToDecimal(buchungen.reduce((sum, tx) => sum + toCents(tx.betrag), 0)),
      konflikt: matched.length > 0,
      ...(matched.length ? { matched_regeln: matched } : {}),
      beispiele: buchungen.slice(0, MAX_BEISPIELE).map((tx) => ({
        transaktion_id: tx.transaktion_id,
        buchungsdatum: tx.buchungsdatum,
        betrag: tx.betrag,
        gegenpartei: tx.gegenpartei,
        verwendungszweck: tx.verwendungszweck,
      })),
    };
  });

  const vorschlaege = alle
    .filter((v) => v.treffer >= mindestTreffer)
    .sort((a, b) => b.treffer - a.treffer || a.gegenpartei_pattern.localeCompare(b.gegenpartei_pattern));
  const einzelfaelle = alle.filter((v) => v.treffer < mindestTreffer).reduce((sum, v) => sum + v.treffer, 0);

  return {
    offen_gesamt: offen.length,
    abgedeckt: vorschlaege.reduce((sum, v) => sum + v.treffer, 0),
    einzelfaelle,
    ohne_gegenpartei: ohneGegenpartei.length,
    vorschlaege,
  };
}

async function readJsonl(url) {
  const text = await readFile(url, "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
}

function berichtZeilen(out, limit) {
  const anteil = out.offen_gesamt ? Math.round((out.abgedeckt / out.offen_gesamt) * 100) : 0;
  const zeilen = [
    `Offener Rueckstand: ${out.offen_gesamt} Buchungen`,
    `Regelkandidaten:    ${out.vorschlaege.length} (decken ${out.abgedeckt} Buchungen = ${anteil}%)`,
    `Einzelfaelle:       ${out.einzelfaelle}`,
  ];
  if (out.ohne_gegenpartei) zeilen.push(`Ohne Gegenpartei:   ${out.ohne_gegenpartei} (kein Muster ableitbar)`);
  zeilen.push("");
  for (const v of out.vorschlaege.slice(0, limit)) {
    const marker = v.konflikt ? `   [Regelkonflikt: ${v.matched_regeln.join(", ")}]` : "";
    zeilen.push(`${String(v.treffer).padStart(4)}x ${v.summe.padStart(10)} EUR  ${v.gegenpartei_pattern}${marker}`);
    for (const b of v.beispiele) {
      zeilen.push(`        ${b.buchungsdatum}  ${b.betrag.padStart(9)}  ${b.verwendungszweck || "(kein Verwendungszweck)"}`);
    }
  }
  if (out.vorschlaege.length > limit) zeilen.push(`\n… ${out.vorschlaege.length - limit} weitere Kandidaten (--limit= erhoehen)`);
  return zeilen;
}

async function main() {
  const argv = process.argv.slice(2);
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const minArg = argv.find((a) => a.startsWith("--min="));
  const root = argv.find((a) => !a.startsWith("--"));

  const masterRoot = dataRootFromArg(root, new URL("../data/master/", import.meta.url), new URL("../", import.meta.url));
  const transaktionen = await readJsonl(new URL("transaktionen.jsonl", masterRoot));
  const out = regelVorschlaege({ transaktionen, mindestTreffer: minArg ? Number(minArg.split("=")[1]) : 2 });

  if (argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
  else console.log(berichtZeilen(out, limitArg ? Number(limitArg.split("=")[1]) : 20).join("\n"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

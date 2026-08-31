// app/tools/lernen.mjs
//
// Lernschleife (ADR 0026). Wertet agent_log.jsonl aus, das bisher write-only
// war: 106 Eintraege mit Qualitaetsdaten, die kein Lauf je gelesen hat. Die
// Luecke war nie ein fehlender Speicher, sondern ein fehlender Rueckkanal.
//
// Kein Urteil, keine Selbsteinschaetzung — nur beobachtete Ergebnisse gegen den
// einzigen verfuegbaren Grundwahrheitswert: die Korrekturen des Nutzers an
// Auto-Freigaben.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dataRootFromArg } from "./data-root.mjs";

// Startwerte. Anders als eine risikobasierte Freigabeschwelle messen sie kein
// Urteil darueber, was eine Buchung bedeutet, sondern beobachtetes Verhalten —
// und sie steuern eine reversible, sichtbare Aktion.
const REGEL_QUOTE = 0.30;
const REGEL_MINDESTMENGE = 10;
const STUFE_SPERREN_AB = 0.25;
const STUFE_ENTSPERREN_UNTER = 0.15; // Hysterese gegen Flattern an der Schwelle
const STUFE_MINDESTMENGE = 20;

function zaehle(log) {
  const freigaben = new Map();
  const korrekturen = new Map();
  const stufeFreigaben = new Map();
  const stufeKorrekturen = new Map();
  const gate_gruende = {};

  for (const eintrag of log) {
    for (const f of eintrag.freigaben ?? []) {
      if (f.belegstufe) stufeFreigaben.set(f.belegstufe, (stufeFreigaben.get(f.belegstufe) ?? 0) + f.anzahl);
      if (!f.regel_id) continue; // Agentenvorschlaege tragen keine Regel
      freigaben.set(f.regel_id, (freigaben.get(f.regel_id) ?? 0) + f.anzahl);
    }
    for (const korrektur of eintrag.korrekturen ?? []) {
      if (korrektur.belegstufe) stufeKorrekturen.set(korrektur.belegstufe, (stufeKorrekturen.get(korrektur.belegstufe) ?? 0) + 1);
      if (!korrektur.regel_id) continue;
      korrekturen.set(korrektur.regel_id, (korrekturen.get(korrektur.regel_id) ?? 0) + 1);
    }
    for (const d of eintrag.gate_durchfall ?? []) {
      gate_gruende[d.grund] = (gate_gruende[d.grund] ?? 0) + 1;
    }
  }
  return { freigaben, korrekturen, stufeFreigaben, stufeKorrekturen, gate_gruende };
}

// Der zuletzt protokollierte Sperrzustand. Wird nicht als eigener Zustand
// gefuehrt, sondern aus dem juengsten Freigabe-Eintrag gelesen — dieselbe
// Begruendung, mit der ADR 0018 den persistierten Hit-Count verworfen hat.
export function gesperrteBelegstufenAus(log) {
  const letzte = [...(log ?? [])].filter((e) => e.anlass === "freigabe" && e.gesperrte_belegstufen).pop();
  return letzte?.gesperrte_belegstufen ?? [];
}

export function metriken(log, gesperrtBisher = []) {
  const z = zaehle(log ?? []);

  const je_regel = [...z.freigaben].map(([regel_id, anzahl]) => ({
    regel_id,
    freigaben: anzahl,
    korrekturen: z.korrekturen.get(regel_id) ?? 0,
    quote: (z.korrekturen.get(regel_id) ?? 0) / anzahl,
  })).sort((a, b) => b.quote - a.quote);

  const je_belegstufe = [...z.stufeFreigaben].map(([belegstufe, anzahl]) => ({
    belegstufe,
    freigaben: anzahl,
    korrekturen: z.stufeKorrekturen.get(belegstufe) ?? 0,
    quote: (z.stufeKorrekturen.get(belegstufe) ?? 0) / anzahl,
  })).sort((a, b) => b.quote - a.quote);

  // Hysterese: eine gesperrte Stufe faellt erst unter der niedrigeren Schwelle
  // zurueck, damit sie nicht bei jedem Lauf zwischen offen und gesperrt springt.
  const gesperrte_belegstufen = je_belegstufe.filter((s) => {
    if (s.freigaben < STUFE_MINDESTMENGE) return false;
    return gesperrtBisher.includes(s.belegstufe)
      ? s.quote >= STUFE_ENTSPERREN_UNTER
      : s.quote > STUFE_SPERREN_AB;
  }).map((s) => s.belegstufe);

  const stillzulegende_regeln = je_regel
    .filter((r) => r.freigaben >= REGEL_MINDESTMENGE && r.quote > REGEL_QUOTE)
    .map((r) => r.regel_id);

  return { je_regel, je_belegstufe, gate_gruende: z.gate_gruende, gesperrte_belegstufen, stillzulegende_regeln };
}

const USAGE = `Aufruf: node app/tools/lernen.mjs [datenroot] [--anwenden]

Wertet agent_log.jsonl aus. Ohne --anwenden nur Bericht. Mit --anwenden werden
Regeln ueber der Korrekturquote auf inaktiv gesetzt; danach muss
recategorize.mjs laufen. Das Tool aendert ausschliesslich den Status von
Regeln — nie eine Transaktion.`;

export function renderMetriken(m) {
  const z = [];
  z.push("KORREKTURQUOTE JE REGEL (absteigend)");
  const auffaellig = m.je_regel.filter((r) => r.korrekturen > 0);
  if (auffaellig.length === 0) z.push("  keine Korrektur an einer Auto-Freigabe protokolliert");
  for (const r of auffaellig.slice(0, 15)) z.push(`  ${r.regel_id}  ${(r.quote * 100).toFixed(0)}%  (${r.korrekturen}/${r.freigaben})`);

  z.push("", "KORREKTURQUOTE JE BELEGSTUFE");
  if (m.je_belegstufe.length === 0) z.push("  noch keine Freigaben protokolliert");
  for (const s of m.je_belegstufe) z.push(`  ${s.belegstufe}  ${(s.quote * 100).toFixed(0)}%  (${s.korrekturen}/${s.freigaben})`);

  z.push("", "GATE-DURCHFALL NACH GRUND");
  const gruende = Object.entries(m.gate_gruende);
  if (gruende.length === 0) z.push("  keiner protokolliert");
  for (const [grund, anzahl] of gruende) z.push(`  ${grund}: ${anzahl}`);

  z.push("", `GESPERRTE BELEGSTUFEN: ${m.gesperrte_belegstufen.join(", ") || "keine"}`);
  z.push(`STILLZULEGENDE REGELN: ${m.stillzulegende_regeln.join(", ") || "keine"}`);
  return z.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) { console.log(USAGE); return; }
  const anwenden = args.includes("--anwenden");
  const masterRoot = dataRootFromArg(args.find((a) => !a.startsWith("--")));

  const logText = await readFile(new URL("agent_log.jsonl", masterRoot), "utf8").catch(() => "");
  const log = logText.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  const regeln = JSON.parse(await readFile(new URL("kategorisierungsregeln.json", masterRoot), "utf8"));

  const m = metriken(log, gesperrteBelegstufenAus(log));
  console.log(renderMetriken(m));

  if (!anwenden) {
    console.log("\nVorschau — nichts geschrieben. Mit --anwenden Regeln stilllegen.");
    return;
  }
  if (m.stillzulegende_regeln.length === 0) {
    console.log("\nNichts stillzulegen.");
    return;
  }

  const next = regeln.map((r) => m.stillzulegende_regeln.includes(r.regel_id) ? { ...r, status: "inaktiv" } : r);
  await writeFile(new URL("kategorisierungsregeln.json", masterRoot), JSON.stringify(next, null, 2) + "\n");
  console.log(`\n${m.stillzulegende_regeln.length} Regel(n) auf inaktiv gesetzt. Jetzt recategorize.mjs laufen lassen.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

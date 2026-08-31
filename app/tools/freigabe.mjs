// app/tools/freigabe.mjs
//
// Auto-Freigabe mit Gate (ADR 0025). Arbeitet ueber den Bestand, nicht ueber
// den Import-Stream — damit wirkt der Lauf auch auf Vorschlaege, die vor
// Einfuehrung des Gates liegen geblieben sind, und nach jedem Regel-Tuning
// erneut.
//
// Abgrenzung zu confirm.mjs: dort entscheidet ein Mensch und darf darum auch
// eine fruehere Entscheidung korrigieren. Hier entscheidet das Regelwerk; jede
// Freigabe traegt bestaetigt_durch = "auto" und bleibt fuer recategorize.mjs
// anfassbar, weil nie jemand hingeschaut hat.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadMasterData, validateMasterData } from "./validator.mjs";
import { dataRootFromArg } from "./data-root.mjs";
import { referenzmenge, istSpezifisch } from "./lib/spezifitaet.mjs";
import { metriken, gesperrteBelegstufenAus } from "./lernen.mjs";
import { kontoanker, stufeVerliehen } from "./lib/kontoanker.mjs";

const BELEGSTUFEN = new Set(["E1", "E2", "E3", "E4"]);

// Warum eine Regel nicht automatisch freigeben darf. null heisst: sie darf.
//
// Kein Konfliktkriterium — categorize() liefert bei Regeln mit verschiedenen
// Kategorien "offen", nie "vorgeschlagen". Eine konfliktbehaftete Buchung
// erreicht dieses Gate also gar nicht.
function gateGrund(regel, konto_id, { referenz, gesperrt, anker }) {
  if (!regel) return "unbekannt";
  if (regel.status !== "aktiv") return "inaktiv";
  if (!String(regel.kommentar ?? "").trim()) return "kommentar";
  if (!BELEGSTUFEN.has(regel.belegstufe)) return "belegstufe";
  if (gesperrt.includes(regel.belegstufe)) return "gesperrt";
  if (!istSpezifisch(regel, referenz)) return "spezifitaet";
  // Zuletzt geprueft: alle Gruende davor gelten der Regel selbst und fallen auf
  // jedem Konto gleich aus. Dieser gilt erst dem Paar aus Regel und Konto —
  // die Belegstufe war auf einem anderen Konto verdient, hier ist sie geliehen
  // (ADR 0027).
  if (stufeVerliehen(regel, konto_id, anker)) return "anker";
  return null;
}

export function freigabe({ transaktionen, regeln, gesperrteBelegstufen = [] }) {
  // EINMAL vor dem Lauf gebildet: sonst zaehlten die Freigaben dieses Laufs als
  // Beleg fuer ihre eigene Spezifitaet — und als ihren eigenen Kontoanker.
  const referenz = referenzmenge(transaktionen);
  const anker = kontoanker(transaktionen);
  const index = new Map(regeln.map((r) => [r.regel_id, r]));
  const gate = new Map();
  const pruefe = (id, konto_id) => {
    const key = `${id}|${konto_id}`;
    if (!gate.has(key)) gate.set(key, gateGrund(index.get(id), konto_id, { referenz, gesperrt: gesperrteBelegstufen, anker }));
    return gate.get(key);
  };

  const freigaben = new Map();
  const durchfall = new Map();
  // Nur der Ankergrund haengt am Konto; alle anderen an der Regel allein. Darum
  // wird auch nur er je Konto aufgefuehrt — sonst stuende dieselbe kaputte
  // Regel einmal pro Konto in der Arbeitsliste.
  const merkeDurchfall = (regel_id, grund, konto_id) => {
    if (grund !== "anker") durchfall.set(regel_id, { regel_id, grund });
    else durchfall.set(`${regel_id}|${konto_id}`, { regel_id, grund, konto_id });
  };
  let freigegeben = 0;
  let agent_freigegeben = 0;
  let zurueckgehalten = 0;

  const next = transaktionen.map((tx) => {
    if (tx.kategorisierung_status !== "vorgeschlagen") return tx;

    if (tx.kategorie_herkunft === "agent") {
      agent_freigegeben += 1;
      const key = `agent:${tx.kategorie_id}`;
      const eintrag = freigaben.get(key) ?? { regel_id: null, belegstufe: null, kategorie_id: tx.kategorie_id, anzahl: 0 };
      eintrag.anzahl += 1;
      freigaben.set(key, eintrag);
      return { ...tx, kategorisierung_status: "bestaetigt", bestaetigt_durch: "auto" };
    }

    const ids = tx.matched_regeln ?? [];
    const gruende = ids.map((id) => [id, pruefe(id, tx.konto_id)]).filter(([, grund]) => grund !== null);
    if (ids.length === 0 || gruende.length > 0) {
      for (const [id, grund] of gruende) merkeDurchfall(id, grund, tx.konto_id);
      zurueckgehalten += 1;
      return tx;
    }

    freigegeben += 1;
    for (const id of ids) {
      const key = `regel:${id}`;
      const eintrag = freigaben.get(key) ?? { regel_id: id, belegstufe: index.get(id).belegstufe, kategorie_id: tx.kategorie_id, anzahl: 0 };
      eintrag.anzahl += 1;
      freigaben.set(key, eintrag);
    }
    return { ...tx, kategorisierung_status: "bestaetigt", bestaetigt_durch: "auto" };
  });

  return {
    transaktionen: next,
    report: {
      freigegeben, agent_freigegeben, zurueckgehalten,
      freigaben: [...freigaben.values()],
      gate_durchfall: [...durchfall.values()],
    },
  };
}

const USAGE = `Aufruf: node app/tools/freigabe.mjs [datenroot] [--schreiben]

Gibt vorgeschlagene Buchungen automatisch frei, soweit ihre Regel das Gate
besteht. Ohne --schreiben laeuft nur die Vorschau.`;

async function readJsonl(url) {
  const text = await readFile(url, "utf8").catch(() => "");
  return text.split(/\r?\n/).filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
}

function berichte(report) {
  console.log(`Freigegeben ueber Regeln: ${report.freigegeben}`);
  console.log(`Freigegeben als Agentenvorschlag: ${report.agent_freigegeben}`);
  console.log(`Zurueckgehalten: ${report.zurueckgehalten}`);
  if (report.gate_durchfall.length) {
    console.log("\nAm Gate gescheitert:");
    for (const d of report.gate_durchfall) console.log(`  - ${d.regel_id}${d.konto_id ? ` auf ${d.konto_id}` : ""}: ${d.grund}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) { console.log(USAGE); return; }
  const schreiben = args.includes("--schreiben");
  const masterRoot = dataRootFromArg(args.find((a) => !a.startsWith("--")));

  const [transaktionen, regeln] = await Promise.all([
    readJsonl(new URL("transaktionen.jsonl", masterRoot)),
    readFile(new URL("kategorisierungsregeln.json", masterRoot), "utf8").then(JSON.parse),
  ]);

  // Der Sperrzustand wird nicht gespeichert, sondern aus dem Log neu gerechnet.
  const logText = await readFile(new URL("agent_log.jsonl", masterRoot), "utf8").catch(() => "");
  const log = logText.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  const gesperrteBelegstufen = metriken(log, gesperrteBelegstufenAus(log)).gesperrte_belegstufen;
  if (gesperrteBelegstufen.length) console.log(`Gesperrte Belegstufen: ${gesperrteBelegstufen.join(", ")}`);

  const out = freigabe({ transaktionen, regeln, gesperrteBelegstufen });
  berichte(out.report);

  if (!schreiben) {
    console.log("\nVorschau — nichts geschrieben. Mit --schreiben anwenden.");
    return;
  }

  await writeFile(new URL("transaktionen.jsonl", masterRoot), out.transaktionen.map((tx) => JSON.stringify(tx)).join("\n") + "\n");

  const protokoll = {
    zeitpunkt: new Date().toISOString(),
    anlass: "freigabe",
    inputs: ["data/master/transaktionen.jsonl"],
    freigaben: out.report.freigaben,
    gate_durchfall: out.report.gate_durchfall,
    gesperrte_belegstufen: gesperrteBelegstufen,
    notiz: `freigabe.mjs: ${out.report.freigegeben} ueber Regeln, ${out.report.agent_freigegeben} als Agentenvorschlag, ${out.report.zurueckgehalten} zurueckgehalten`,
  };
  const logUrl = new URL("agent_log.jsonl", masterRoot);
  const bisher = await readFile(logUrl, "utf8").catch(() => "");
  await writeFile(logUrl, `${bisher.replace(/\n*$/, "\n")}${JSON.stringify(protokoll)}\n`);

  const validation = validateMasterData(await loadMasterData(masterRoot));
  if (!validation.valid) {
    console.error("Validierung nach Freigabe fehlgeschlagen:");
    for (const fehler of validation.errors.slice(0, 20)) console.error(`- ${fehler}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

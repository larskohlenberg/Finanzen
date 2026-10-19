// app/tools/recategorize.mjs
//
// Nach-Kategorisierung des Bestands (ADR 0017): deterministischer Voll-Recompute
// der infrage kommenden Buchungen gegen das volle aktuelle Regelwerk. Nutzt
// dieselbe categorize() wie der Import. Menschliche Entscheidungen (manuell,
// abgelehnt, bestaetigt durch mensch) fasst der Lauf nie an, auch nicht ihren
// Regelbezug. Widerspricht ihnen das Regelwerk, zaehlt der Bericht das unter
// `widerspruch`, und der Pruefbericht listet sie. Wiedervorgelegt wird nur eine
// Auto-Freigabe: die naechste Freigabe gaebe sonst eine menschliche
// Entscheidung still mit der neuen Kategorie frei.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { categorize } from "./categorizer.mjs";
import { loadMasterData, validateMasterData } from "./validator.mjs";
import { neueFehler } from "./lib/validator-befund.mjs";
import { dataRootFromArg } from "./data-root.mjs";
import { beginneLauf } from "./lib/fingerabdruck.mjs";
import { istWiderspruch, menschlichEntschieden } from "./lib/entscheidung.mjs";
import { ersetzeDatei } from "./lib/datei.mjs";

// Kandidat fuer die Neubewertung: offene Buchungen plus alles, was per Regel
// kategorisiert wurde. Menschliche Akte sind tabu, auch mit Herkunft regel.
function istKandidat(tx) {
  if (menschlichEntschieden(tx)) return false;
  // Eine Auto-Freigabe ist kein menschlicher Akt: nie hat jemand hingeschaut,
  // also darf ein spaeterer Regellauf sie neu bewerten (ADR 0025).
  if (tx.bestaetigt_durch === "auto") return true;
  return tx.kategorisierung_status === "offen" || tx.kategorie_herkunft === "regel";
}

function alsRegelVorschlag(tx, verdict) {
  // bestaetigt_durch faellt weg: das Feld ist nur bei bestaetigt erlaubt.
  const { bestaetigt_durch, ...rest } = tx;
  return { ...rest, kategorisierung_status: "vorgeschlagen", kategorie_id: verdict.kategorie_id, kategorie_herkunft: "regel", matched_regeln: verdict.matched_regeln };
}

function alsOffen(tx, verdict) {
  const { kategorie_id, kategorie_herkunft, matched_regeln, bestaetigt_durch, ...rest } = tx;
  if ((verdict.matched_regeln ?? []).length) return { ...rest, kategorisierung_status: "offen", matched_regeln: verdict.matched_regeln };
  return { ...rest, kategorisierung_status: "offen" };
}

// Nur eine eindeutige, mit der bestaetigten Kategorie konsistente Trefferliste
// ist eine gueltige Quelle. Sonst Quelle entfernen ("nicht mehr ermittelbar").
// Eine auto-freigegebene Agenten-Schaetzung, die eine Regel jetzt bestaetigt,
// hat damit einen Beleg: Herkunft wird regel, die Freigabe bleibt. Herkunft
// agent zusammen mit matched_regeln verbietet der Validator.
function stampeKonsistenteQuelle(tx, verdict) {
  if (verdict.status === "vorgeschlagen" && verdict.kategorie_id === tx.kategorie_id) {
    const herkunft = tx.kategorie_herkunft === "agent" ? { kategorie_herkunft: "regel" } : {};
    return { ...tx, ...herkunft, matched_regeln: verdict.matched_regeln };
  }
  const { matched_regeln, ...rest } = tx;
  return rest;
}

function recompute(tx, regeln) {
  const verdict = categorize(tx, regeln);
  // verdict.status === "vorgeschlagen" heisst: genau eine konkrete Kategorie.
  const treffer = verdict.status === "vorgeschlagen";

  if (tx.kategorisierung_status === "bestaetigt") {
    // Hier nur Auto-Freigaben (herkunft regel oder agent). Nur eine ANDERE
    // konkrete Kategorie loest eine Wiedervorlage aus; gleiche Kategorie oder
    // kein eindeutiger Treffer => unveraendert.
    if (treffer && verdict.kategorie_id !== tx.kategorie_id) {
      return alsRegelVorschlag(tx, verdict);
    }
    return stampeKonsistenteQuelle(tx, verdict);
  }

  // offen oder vorgeschlagen(+regel): noch keine menschliche Entscheidung,
  // also frisch gegen das aktuelle Regelwerk rechnen.
  if (treffer) return alsRegelVorschlag(tx, verdict);
  // Schon offen und ohne Kategorie: nichts zu tun, Original unveraendert lassen
  // (kein sinnloses Neuschreiben der Zeile). Nur ein Vorschlag, dessen Regel weg
  // ist, wird aktiv auf offen zurueckgestuft.
  // Aber: Konflikt-Quellen pflegen (matched_regeln sichtbar halten).
  if (tx.kategorisierung_status === "offen" && !Object.hasOwn(tx, "kategorie_id")) {
    if (verdict.matched_regeln.length) return { ...tx, matched_regeln: verdict.matched_regeln };
    const { matched_regeln, ...rest } = tx;
    return matched_regeln ? rest : tx;
  }
  return alsOffen(tx, verdict);
}

function sameRegeln(a, b) {
  const xa = a ?? [];
  const xb = b ?? [];
  return xa.length === xb.length && xa.every((id, i) => id === xb[i]);
}

function changed(a, b) {
  return a.kategorisierung_status !== b.kategorisierung_status
    || a.kategorie_id !== b.kategorie_id
    || a.kategorie_herkunft !== b.kategorie_herkunft
    || !sameRegeln(a.matched_regeln, b.matched_regeln);
}

function fachlichChanged(a, b) {
  return a.kategorisierung_status !== b.kategorisierung_status
    || a.kategorie_id !== b.kategorie_id
    || a.kategorie_herkunft !== b.kategorie_herkunft;
}

export function recategorize({ transaktionen, regeln }) {
  const report = { neu_vorgeschlagen: 0, wiedervorlage: 0, belegt: 0, zurueckgesetzt: 0, unveraendert: 0, uebersprungen: 0, widerspruch: 0 };

  const next = transaktionen.map((tx) => {
    if (!istKandidat(tx)) {
      report.uebersprungen += 1;
      if (menschlichEntschieden(tx) && istWiderspruch(tx, categorize(tx, regeln))) report.widerspruch += 1;
      return tx;
    }
    const result = recompute(tx, regeln);
    if (!fachlichChanged(tx, result)) {
      report.unveraendert += 1;
    } else if (result.kategorisierung_status === "bestaetigt") {
      // Gleiche Kategorie, nur die Herkunft wechselt von agent auf regel.
      report.belegt += 1;
    } else if (tx.kategorisierung_status === "bestaetigt") {
      report.wiedervorlage += 1;
    } else if (result.kategorisierung_status === "offen") {
      report.zurueckgesetzt += 1;
    } else {
      report.neu_vorgeschlagen += 1;
    }
    return result;
  });

  return { transaktionen: next, report };
}

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}
async function readJsonl(url) {
  const text = await readFile(url, "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
}

// Aufruf: node app/tools/recategorize.mjs <datenroot> [--schreiben]
// Ohne --schreiben nur der Bericht (Vorschau). Geschrieben wird nur, wenn der
// neue Stand keine neuen Validatorfehler hat.
async function main() {
  const argv = process.argv.slice(2);
  const schreiben = argv.includes("--schreiben");
  const rootArg = argv.find((a) => !a.startsWith("--"));
  if (!rootArg) {
    console.error("Aufruf: node app/tools/recategorize.mjs <datenroot> [--schreiben] — der Datenroot ist Pflicht (z. B. data/master oder data/demo).");
    process.exitCode = 2;
    return;
  }
  const masterRoot = dataRootFromArg(rootArg, undefined, new URL("../", import.meta.url));
  // Schreibsperre und ggf. Fingerabdruck-Pruefung fuer den ganzen Lauf
  // (Lesen bis Schreiben); die Vorschau nennt den Fingerabdruck.
  await beginneLauf(fileURLToPath(masterRoot), schreiben);
  const [transaktionen, regeln] = await Promise.all([
    readJsonl(new URL("transaktionen.jsonl", masterRoot)),
    readJson(new URL("kategorisierungsregeln.json", masterRoot)),
  ]);

  const out = recategorize({ transaktionen, regeln });
  console.log(JSON.stringify(out.report, null, 2));
  if (!schreiben) {
    console.log("\nVorschau — nichts geschrieben. Mit --schreiben anwenden.");
    return;
  }

  const bestand = await loadMasterData(masterRoot);
  const neu = neueFehler(validateMasterData(bestand).befunde, validateMasterData({ ...bestand, transaktionen: out.transaktionen }).befunde);
  if (neu.length) {
    console.error("Validierung des neuen Stands fehlgeschlagen — nichts geschrieben:");
    for (const error of neu) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  await ersetzeDatei(
    new URL("transaktionen.jsonl", masterRoot),
    out.transaktionen.map((tx) => JSON.stringify(tx)).join("\n") + "\n",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

// app/tools/recategorize.mjs
//
// Nach-Kategorisierung des Bestands (ADR 0017): deterministischer Voll-Recompute
// der infrage kommenden Buchungen gegen das volle aktuelle Regelwerk. Nutzt
// dieselbe categorize() wie der Import. Schreibt nie still eine menschliche
// Entscheidung um: manuell/abgelehnt bleiben unangetastet; ein Widerspruch zu
// einer bestaetigten Regel-Kategorie wird als Wiedervorlage sichtbar gemacht.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { categorize } from "./categorizer.mjs";
import { loadMasterData, validateMasterData } from "./validator.mjs";

// Kandidat fuer die Neubewertung: offene Buchungen plus alles, was per Regel
// kategorisiert wurde. Menschliche Akte (manuell, abgelehnt) sind tabu.
function istKandidat(tx) {
  if (tx.kategorie_herkunft === "manuell") return false;
  if (tx.kategorisierung_status === "abgelehnt") return false;
  return tx.kategorisierung_status === "offen" || tx.kategorie_herkunft === "regel";
}

function alsRegelVorschlag(tx, verdict) {
  return { ...tx, kategorisierung_status: "vorgeschlagen", kategorie_id: verdict.kategorie_id, kategorie_herkunft: "regel", matched_regeln: verdict.matched_regeln };
}

function alsOffen(tx, verdict) {
  const { kategorie_id, kategorie_herkunft, matched_regeln, ...rest } = tx;
  if ((verdict.matched_regeln ?? []).length) return { ...rest, kategorisierung_status: "offen", matched_regeln: verdict.matched_regeln };
  return { ...rest, kategorisierung_status: "offen" };
}

// Nur eine eindeutige, mit der bestaetigten Kategorie konsistente Trefferliste
// ist eine gueltige Quelle. Sonst Quelle entfernen ("nicht mehr ermittelbar").
function stampeKonsistenteQuelle(tx, verdict) {
  if (verdict.status === "vorgeschlagen" && verdict.kategorie_id === tx.kategorie_id) {
    return { ...tx, matched_regeln: verdict.matched_regeln };
  }
  const { matched_regeln, ...rest } = tx;
  return rest;
}

function recompute(tx, regeln) {
  const verdict = categorize(tx, regeln);
  // verdict.status === "vorgeschlagen" heisst: genau eine konkrete Kategorie.
  const treffer = verdict.status === "vorgeschlagen";

  if (tx.kategorisierung_status === "bestaetigt") {
    // Bestaetigt (herkunft = regel): eine bestaetigte Kategorie ist Fakt (ADR 0002)
    // und wird nie still gekippt. Nur eine ANDERE konkrete Kategorie loest eine
    // Wiedervorlage aus; gleiche Kategorie oder kein eindeutiger Treffer => unveraendert.
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
  const report = { neu_vorgeschlagen: 0, wiedervorlage: 0, zurueckgesetzt: 0, unveraendert: 0, uebersprungen: 0 };

  const next = transaktionen.map((tx) => {
    if (!istKandidat(tx)) {
      report.uebersprungen += 1;
      return tx;
    }
    const result = recompute(tx, regeln);
    if (!fachlichChanged(tx, result)) {
      report.unveraendert += 1;
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

async function main() {
  const masterRoot = new URL("../data/master/", import.meta.url);
  const [transaktionen, regeln] = await Promise.all([
    readJsonl(new URL("transaktionen.jsonl", masterRoot)),
    readJson(new URL("kategorisierungsregeln.json", masterRoot)),
  ]);

  const out = recategorize({ transaktionen, regeln });
  await writeFile(
    new URL("transaktionen.jsonl", masterRoot),
    out.transaktionen.map((tx) => JSON.stringify(tx)).join("\n") + "\n",
  );

  const validation = validateMasterData(await loadMasterData(masterRoot));
  console.log(JSON.stringify(out.report, null, 2));
  if (!validation.valid) {
    console.error("Validierung nach Nach-Kategorisierung fehlgeschlagen:");
    for (const error of validation.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

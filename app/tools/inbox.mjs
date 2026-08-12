// app/tools/inbox.mjs
//
// Ein Lauf ueber `data/inbox/`: Profil zuordnen, CSV deterministisch
// normalisieren, durch die bestehende Import-Pipeline schicken, Datei nach
// processed/ oder error/ verschieben, Lauf protokollieren.
//
// Bewusste Grenze: PDFs werden NICHT automatisch in Buchungen zerlegt. Sie
// bekommen einen deterministischen Textvorlauf (pdftotext -layout) nach
// `data/inbox/standardized/`; die Zeilenextraktion bleibt Agentenarbeit
// (ADR 0005). Der Gewinn ist trotzdem gross: der Agent liest Text statt
// PDF-Binaer, wiederholbar und pruefbar.
//
// `standardized/` ist Durchgangsstation, kein Archiv. Der dauerhafte
// Textzwilling entsteht neben dem Beleg unter `Belege/` — siehe
// `belege-text.mjs`, das den Vorlauf danach wieder abraeumt.
import { readFile, writeFile, readdir, rename, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runImport } from "./import.mjs";
import { normalizeCsv } from "./normalize.mjs";
import { loadMasterData, validateMasterData } from "./validator.mjs";
import { dataRootFromArg } from "./data-root.mjs";

const execFileAsync = promisify(execFile);
const IGNORIEREN = new Set([".DS_Store", ".gitkeep"]);

export function planInbox({ dateien, profile }) {
  const auftraege = [];
  const offen = [];

  for (const datei of [...dateien].sort()) {
    if (IGNORIEREN.has(datei) || datei.startsWith(".")) continue;
    const endung = datei.toLowerCase().split(".").pop();
    // macOS liefert Dateinamen aus readdir in NFD, ein von Hand geschriebenes
    // Profil traegt NFC. Beide Seiten auf dieselbe Normalform ziehen, sonst
    // findet ein Muster mit Umlaut seine Datei nie.
    const name = datei.normalize("NFC");
    const passend = profile.filter((p) => new RegExp(p.dateimuster.normalize("NFC")).test(name));

    if (passend.length > 1) {
      offen.push({ datei, grund: `Profil mehrdeutig: ${passend.map((p) => p.profil_id).join(", ")} — dateimuster schaerfen` });
      continue;
    }
    if (endung === "pdf") {
      // Textvorlauf ist immer moeglich und immer nuetzlich, auch ohne Profil.
      auftraege.push({ datei, art: "pdf-text", profil_id: passend[0]?.profil_id ?? null });
      continue;
    }
    if (endung === "csv") {
      if (passend.length === 0) {
        offen.push({ datei, grund: "kein Profil — beim ersten Import dieser Bank ein Profil in data/import-profile/ anlegen" });
        continue;
      }
      auftraege.push({ datei, art: "csv", profil_id: passend[0].profil_id });
      continue;
    }
    offen.push({ datei, grund: `Dateityp .${endung} wird nicht verarbeitet` });
  }

  return { auftraege, offen };
}

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}
async function readJsonl(url) {
  const text = await readFile(url, "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
}

async function ladeProfile(inboxRoot) {
  const dir = new URL("../import-profile/", inboxRoot);
  let namen = [];
  try {
    namen = (await readdir(dir)).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  return Promise.all(namen.map((n) => readJson(new URL(n, dir))));
}

async function pdfText(quelle, ziel) {
  await execFileAsync("pdftotext", ["-layout", fileURLToPath(quelle), fileURLToPath(ziel)]);
}

async function main() {
  const argv = process.argv.slice(2);
  const schreiben = argv.includes("--schreiben");
  const masterRoot = dataRootFromArg(argv.find((a) => !a.startsWith("--")), new URL("../data/master/", import.meta.url), new URL("../", import.meta.url));
  const inboxRoot = new URL("../data/inbox/", import.meta.url);

  const profile = await ladeProfile(inboxRoot);
  const eintraege = await readdir(inboxRoot, { withFileTypes: true });
  const plan = planInbox({ dateien: eintraege.filter((e) => e.isFile()).map((e) => e.name), profile });

  const bericht = { modus: schreiben ? "geschrieben" : "vorschau", profile: profile.length, dateien: plan.auftraege.length, laeufe: [], offen: plan.offen };

  let [konten, kategorien, transaktionen, transfers, regeln, regelzahlungen] = await Promise.all([
    readJson(new URL("konten.json", masterRoot)),
    readJson(new URL("kategorien.json", masterRoot)),
    readJsonl(new URL("transaktionen.jsonl", masterRoot)),
    readJson(new URL("transfers.json", masterRoot)),
    readJson(new URL("kategorisierungsregeln.json", masterRoot)),
    readJson(new URL("regelzahlungen.json", masterRoot)),
  ]);

  for (const auftrag of plan.auftraege) {
    const quelle = new URL(encodeURIComponent(auftrag.datei), inboxRoot);

    if (auftrag.art === "pdf-text") {
      const zielName = `${auftrag.datei.replace(/\.pdf$/i, "")}.txt`;
      if (schreiben) {
        await mkdir(new URL("standardized/", inboxRoot), { recursive: true });
        await pdfText(quelle, new URL(`standardized/${encodeURIComponent(zielName)}`, inboxRoot));
      }
      bericht.laeufe.push({ datei: auftrag.datei, art: "pdf-text", ziel: `data/inbox/standardized/${zielName}`, hinweis: "Zeilenextraktion durch den Agenten; Textzwilling danach ueber belege-text.mjs" });
      continue;
    }

    const profil = profile.find((p) => p.profil_id === auftrag.profil_id);
    const rohquelle = profil.beleg_ziel ? `${profil.beleg_ziel}/${auftrag.datei}` : `data/inbox/processed/${auftrag.datei}`;
    let normalized;
    try {
      normalized = normalizeCsv({ text: await readFile(quelle, "utf8"), profil, rohquelle });
    } catch (error) {
      bericht.laeufe.push({ datei: auftrag.datei, art: "csv", abgebrochen: error.message });
      if (schreiben) {
        await mkdir(new URL("error/", inboxRoot), { recursive: true });
        await rename(fileURLToPath(quelle), fileURLToPath(new URL(`error/${encodeURIComponent(auftrag.datei)}`, inboxRoot)));
        await writeFile(new URL(`error/${encodeURIComponent(auftrag.datei)}.fehler.txt`, inboxRoot), `${error.message}\n`);
      }
      continue;
    }

    const out = runImport({ entries: normalized.eintraege, konten, kategorien, kategorisierungsregeln: regeln, transaktionen, transfers, regelzahlungen });
    transaktionen = out.transaktionen;
    transfers = out.transfers;

    bericht.laeufe.push({
      datei: auftrag.datei,
      art: "csv",
      profil: profil.profil_id,
      gelesen: normalized.eintraege.length,
      lesefehler: normalized.fehler.length,
      geschrieben: out.result.written.length,
      uebersprungen_dedupe: out.result.skipped_dedupe.length,
      importfehler: out.result.errors.length,
      transfer_treffer: out.result.transfers_matched.length,
      ...(normalized.fehler.length ? { erste_lesefehler: normalized.fehler.slice(0, 3) } : {}),
      ...(out.result.errors.length ? { erste_importfehler: out.result.errors.slice(0, 3) } : {}),
    });

    if (schreiben) {
      const zielOrdner = out.result.errors.length === normalized.eintraege.length && normalized.eintraege.length > 0 ? "error" : "processed";
      await mkdir(new URL(`${zielOrdner}/`, inboxRoot), { recursive: true });
      await rename(fileURLToPath(quelle), fileURLToPath(new URL(`${zielOrdner}/${encodeURIComponent(auftrag.datei)}`, inboxRoot)));
    }
  }

  console.log(JSON.stringify(bericht, null, 2));

  if (!schreiben) {
    console.log("\nVorschau — nichts geschrieben, nichts verschoben. Mit --schreiben anwenden.");
    return;
  }

  await writeFile(new URL("transaktionen.jsonl", masterRoot), transaktionen.map((tx) => JSON.stringify(tx)).join("\n") + "\n");
  await writeFile(new URL("transfers.json", masterRoot), JSON.stringify(transfers, null, 2) + "\n");

  const protokoll = {
    zeitpunkt: new Date().toISOString(),
    anlass: "inbox-lauf",
    inputs: plan.auftraege.map((a) => `data/inbox/${a.datei}`),
    anzahl_importiert: bericht.laeufe.reduce((s, l) => s + (l.geschrieben ?? 0), 0),
    anzahl_offen: plan.offen.length,
    anzahl_fehler: bericht.laeufe.reduce((s, l) => s + (l.importfehler ?? 0) + (l.lesefehler ?? 0), 0),
    notiz: `inbox.mjs: ${bericht.laeufe.length} Datei(en) verarbeitet`,
    betroffene_ids: [],
  };
  const logUrl = new URL("agent_log.jsonl", masterRoot);
  const bisher = await readFile(logUrl, "utf8").catch(() => "");
  await writeFile(logUrl, `${bisher.replace(/\n*$/, "\n")}${JSON.stringify(protokoll)}\n`);

  const validation = validateMasterData(await loadMasterData(masterRoot));
  if (!validation.valid) {
    console.error("Validierung nach Inbox-Lauf fehlgeschlagen:");
    for (const error of validation.errors.slice(0, 20)) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

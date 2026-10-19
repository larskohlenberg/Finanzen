// app/tools/inbox.mjs
//
// Ein Lauf ueber `data/inbox/`: Profil zuordnen, CSV deterministisch
// normalisieren, durch die bestehende Import-Pipeline schicken, Lauf
// protokollieren, Datei nach processed/ oder error/ verschieben.
//
// Reihenfolge im Schreiblauf: erst den neuen Bestand pruefen, dann schreiben
// und erneut validieren, erst danach archivieren. Bricht der Lauf vorher ab
// oder wird zurueckgerollt, liegt die Quelle noch im Inbox-Root; ein erneuter
// Lauf verdoppelt dank Dublettenpruefung nichts. Nach processed/ kommt nur
// eine vollstaendig gelesene Datei, eine mit Zeilenfehlern samt Fehlernotiz
// nach error/. Archivziele sind kollisionsfrei (Suffix -2, -3 ...).
//
// Bewusste Grenze: PDFs werden NICHT automatisch in Buchungen zerlegt. Sie
// bekommen einen deterministischen Textvorlauf (pdftotext -layout) nach
// `data/inbox/standardized/`; die Zeilenextraktion bleibt Agentenarbeit
// (ADR 0005). Der Gewinn ist trotzdem gross: der Agent liest Text statt
// PDF-Binaer, wiederholbar und pruefbar. Bilder (png/jpg/jpeg) und PDFs ohne
// Textlayer bekommen den Vorlauf per OCR (lib/ocr.mjs, dieselbe Erkennung wie
// der Textzwilling). Bilder bleiben wie PDFs im Inbox-Root liegen, bis der
// Agent sie ablegt; sie wandern nie nach error/.
//
// `standardized/` ist Durchgangsstation, kein Archiv. Der dauerhafte
// Textzwilling entsteht neben dem Beleg unter `Belege/` — siehe
// `belege-text.mjs`, das den Vorlauf danach wieder abraeumt.
import { access, readFile, writeFile, readdir, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runImport } from "./import.mjs";
import { normalizeCsv } from "./normalize.mjs";
import { loadMasterData, validateMasterData } from "./validator.mjs";
import { dataRootFromArg } from "./data-root.mjs";
import { validateImportProfil } from "./import-format.mjs";
import { BILD_ENDUNGEN, erkenneText } from "./lib/ocr.mjs";
import { bestandOrte } from "./lib/bestand-orte.mjs";

const APP = fileURLToPath(new URL("../", import.meta.url));
// Inbox-Pfad relativ zum App-Raum fuer Bericht, rohquelle und Protokoll
// (data/master: data/inbox, sonst <bestand>/inbox).
const inboxName = (inboxRoot) => path.relative(APP, fileURLToPath(inboxRoot)).split(path.sep).join("/");

const IGNORIEREN = new Set([".DS_Store", ".gitkeep"]);
const VERARBEITBAR = new Set(["csv", "pdf", ...BILD_ENDUNGEN]);
// Die Stationen des Laufs selbst. Alles andere im Inbox-Root ist ein Ordner,
// den jemand dorthin kopiert hat — und den der flache Lauf nicht anfasst.
export const PIPELINE_ORDNER = new Set(["processed", "standardized", "error"]);

function endungVon(datei) {
  return datei.toLowerCase().split(".").pop();
}

// ungueltigeProfile: Profile, die die Pruefung nicht bestanden haben
// ({ datei, profil_id, dateimuster, fehler }). Sie normalisieren nichts, aber
// eine CSV, die nur sie treffen, wird ein Fehlerauftrag (Datei nach error/)
// statt still als "kein Profil" liegen zu bleiben.
export function planInbox({ dateien, unterordner = [], profile, ungueltigeProfile = [] }) {
  const auftraege = [];
  const offen = [];

  for (const datei of [...dateien].sort()) {
    if (IGNORIEREN.has(datei) || datei.startsWith(".")) continue;
    const endung = endungVon(datei);
    // macOS liefert Dateinamen aus readdir in NFD, ein von Hand geschriebenes
    // Profil traegt NFC. Beide Seiten auf dieselbe Normalform ziehen, sonst
    // findet ein Muster mit Umlaut seine Datei nie.
    const name = datei.normalize("NFC");
    const trifft = (p) => new RegExp(p.dateimuster.normalize("NFC")).test(name);
    const passend = profile.filter(trifft);
    const passendUngueltig = endung === "csv" ? ungueltigeProfile.filter((p) => typeof p.dateimuster === "string" && trifft(p)) : [];

    if (passend.length + passendUngueltig.length > 1) {
      offen.push({ datei, grund: `Profil mehrdeutig: ${[...passend, ...passendUngueltig].map((p) => p.profil_id).join(", ")} — dateimuster schaerfen` });
      continue;
    }
    if (passendUngueltig.length === 1) {
      const p = passendUngueltig[0];
      auftraege.push({ datei, art: "profil-ungueltig", profil_id: p.profil_id, profildatei: p.datei, fehler: p.fehler });
      continue;
    }
    if (endung === "pdf") {
      // Textvorlauf ist immer moeglich und immer nuetzlich, auch ohne Profil.
      auftraege.push({ datei, art: "pdf-text", profil_id: passend[0]?.profil_id ?? null });
      continue;
    }
    if (BILD_ENDUNGEN.includes(endung)) {
      // Foto eines Belegs: OCR-Vorlauf wie beim Scan-PDF, Datei bleibt liegen.
      auftraege.push({ datei, art: "bild-text", profil_id: passend[0]?.profil_id ?? null });
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

  // Unterordner werden bewusst nicht verarbeitet — aber auch nicht verschwiegen.
  // Ein Bankdownload landet gern als Ordner voller Auszuege in der Inbox; ohne
  // diesen Hinweis sieht der Eingang leer aus, obwohl 42 PDFs darin liegen.
  const uebersehen = [];
  for (const ordner of unterordner) {
    const name = ordner.name.normalize("NFC");
    if (PIPELINE_ORDNER.has(name.toLowerCase())) continue;
    const anzahl = ordner.dateien.filter((d) => VERARBEITBAR.has(endungVon(d))).length;
    if (anzahl > 0) uebersehen.push({ ordner: name, dateien: anzahl });
  }
  uebersehen.sort((a, b) => (a.ordner < b.ordner ? -1 : a.ordner > b.ordner ? 1 : 0));

  return { auftraege, offen, unterordner: uebersehen };
}

export function importLaufBericht({ auftrag, profil, normalized, result }) {
  return {
    datei: auftrag.datei,
    art: "csv",
    profil: profil.profil_id,
    gelesen: normalized.eintraege.length,
    lesefehler: normalized.fehler.length,
    geschrieben: result.written.length,
    geschriebene_ids: result.written.map((entry) => entry.transaktion_id),
    uebersprungen_dedupe: result.skipped_dedupe.length,
    importfehler: result.errors.length,
    transfer_treffer: result.transfers_matched.length,
    ...(normalized.fehler.length ? { lesefehler_details: normalized.fehler } : {}),
    ...(result.errors.length ? { importfehler_details: result.errors.map(({ row, reason, detail }) => ({ row, reason, detail })) } : {}),
  };
}

// Inhalt von error/<datei>.fehler.txt fuer eine teilweise importierte Datei:
// jede nicht uebernommene Zeile, damit sie korrigiert und erneut eingespielt
// werden kann.
function fehlerNotiz({ normalized, result }) {
  const zeilen = [`${result.written.length} Buchung(en) importiert, ${result.skipped_dedupe.length} als Dublette uebersprungen. Nicht uebernommen:`];
  for (const f of normalized.fehler) zeilen.push(`- Zeile ${f.zeile}: ${f.grund} | ${f.rohzeile}`);
  for (const f of result.errors) zeilen.push(`- Eintrag ${f.row} (${f.raw?.buchungsdatum ?? "?"}, ${f.raw?.betrag ?? "?"}): ${f.reason} — ${f.detail}`);
  zeilen.push("Korrigierte Datei zurueck in die Inbox legen; schon importierte Zeilen ueberspringt die Dublettenpruefung.");
  return `${zeilen.join("\n")}\n`;
}

const existiert = (url) => access(url).then(() => true, () => false);

// Erster freier Name im Archivordner: datei, sonst stamm-2.endung, -3 ...
// Frei heisst: weder die Datei noch ihre Fehlernotiz gibt es dort schon.
async function freierArchivName(ordner, datei) {
  const punkt = datei.lastIndexOf(".");
  const stamm = punkt > 0 ? datei.slice(0, punkt) : datei;
  const endung = punkt > 0 ? datei.slice(punkt) : "";
  for (let n = 1; ; n += 1) {
    const name = n === 1 ? datei : `${stamm}-${n}${endung}`;
    const belegt = await existiert(new URL(encodeURIComponent(name), ordner))
      || await existiert(new URL(encodeURIComponent(`${name}.fehler.txt`), ordner));
    if (!belegt) return name;
  }
}

async function archiviere(inboxRoot, { quelle, datei, ordner, notiz }) {
  const zielOrdner = new URL(`${ordner}/`, inboxRoot);
  await mkdir(zielOrdner, { recursive: true });
  const name = await freierArchivName(zielOrdner, datei);
  await rename(fileURLToPath(quelle), fileURLToPath(new URL(encodeURIComponent(name), zielOrdner)));
  if (notiz) await writeFile(new URL(encodeURIComponent(`${name}.fehler.txt`), zielOrdner), notiz);
  return `${inboxName(inboxRoot)}/${ordner}/${name}`;
}

export function betroffeneTransaktionsIds(laeufe) {
  return laeufe.flatMap((lauf) => lauf.geschriebene_ids ?? []);
}

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}
async function readJsonl(url) {
  const text = await readFile(url, "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
}

// Jedes Profil wird vor der Nutzung geprueft. Ein kaputtes Profil bricht den
// Lauf nicht ab: es landet mit seinen Fehlern in `ungueltig`. Sein dateimuster
// bleibt nur erhalten, wenn es sich uebersetzen laesst — sonst kann es keine
// Datei treffen und erscheint nur im Bericht.
export async function ladeProfile(dir) {
  let namen = [];
  try {
    namen = (await readdir(dir)).filter((n) => n.endsWith(".json")).sort();
  } catch {
    return { profile: [], ungueltig: [] };
  }
  const profile = [];
  const ungueltig = [];
  for (const datei of namen) {
    let profil;
    try {
      profil = JSON.parse(await readFile(new URL(encodeURIComponent(datei), dir), "utf8"));
    } catch (error) {
      ungueltig.push({ datei, profil_id: datei.replace(/\.json$/, ""), dateimuster: null, fehler: [`kein gueltiges JSON (${error.message})`] });
      continue;
    }
    const fehler = validateImportProfil(profil);
    if (fehler.length === 0) {
      profile.push(profil);
      continue;
    }
    const musterOk = typeof profil?.dateimuster === "string" && !fehler.some((f) => f.startsWith("dateimuster:"));
    ungueltig.push({
      datei,
      profil_id: typeof profil?.profil_id === "string" ? profil.profil_id : datei.replace(/\.json$/, ""),
      dateimuster: musterOk ? profil.dateimuster : null,
      fehler,
    });
  }
  return { profile, ungueltig };
}

// Nur eine Ebene tief auflisten, dann je Fund-Ordner rekursiv zaehlen. Die
// Pipeline-Ordner werden gar nicht erst betreten — processed/ ist gross und
// planInbox wuerde sie ohnehin verwerfen.
async function sammleUnterordner(inboxRoot) {
  const eintraege = await readdir(inboxRoot, { withFileTypes: true });
  const ordner = eintraege.filter(
    (e) => e.isDirectory() && !e.name.startsWith(".") && !PIPELINE_ORDNER.has(e.name.normalize("NFC").toLowerCase()),
  );
  return Promise.all(ordner.map(async (e) => ({
    name: e.name,
    dateien: (await readdir(new URL(`${encodeURIComponent(e.name)}/`, inboxRoot), { recursive: true, withFileTypes: true }))
      .filter((k) => k.isFile())
      .map((k) => k.name),
  })));
}

// Textvorlauf einer Inbox-Datei (PDF oder Bild). inhalt ist null, wenn es
// nichts zu schreiben gibt (Bild ohne brauchbares OCR). Ein PDF ohne Textlayer
// und ohne OCR-Ergebnis bekommt wie bisher den rohen pdftotext-Vorlauf (nur
// Seitenvorschuebe), den belege-text.mjs als leer wieder raeumt.
export async function erzeugeTextvorlauf(pfad, erkennung = {}) {
  const ergebnis = await erkenneText(pfad, erkennung);
  if (ergebnis.art !== "ohne-text") return ergebnis;
  return { art: "ohne-text", inhalt: ergebnis.rohtext ? ergebnis.rohtext : null, grund: ergebnis.grund };
}

async function main() {
  const argv = process.argv.slice(2);
  const schreiben = argv.includes("--schreiben");
  const masterRoot = dataRootFromArg(argv.find((a) => !a.startsWith("--")), new URL("../data/master/", import.meta.url), new URL("../", import.meta.url));
  // Jeder Bestand hat seine Inbox (data/master: data/inbox/), siehe bestand-orte.mjs.
  const inboxRoot = pathToFileURL(`${bestandOrte(APP, fileURLToPath(masterRoot)).inbox}${path.sep}`);

  const { profile, ungueltig: ungueltigeProfile } = await ladeProfile(new URL("../import-profile/", inboxRoot));
  const eintraege = await readdir(inboxRoot, { withFileTypes: true });
  const plan = planInbox({
    dateien: eintraege.filter((e) => e.isFile()).map((e) => e.name),
    unterordner: await sammleUnterordner(inboxRoot),
    profile,
    ungueltigeProfile,
  });

  const bericht = {
    modus: schreiben ? "geschrieben" : "vorschau",
    profile: profile.length,
    ...(ungueltigeProfile.length ? { profilfehler: ungueltigeProfile.map(({ datei, profil_id, fehler }) => ({ datei, profil_id, fehler })) } : {}),
    dateien: plan.auftraege.length,
    laeufe: [],
    offen: plan.offen,
    unterordner: plan.unterordner,
  };
  // CSV-Quellen und ihr Ziel; verschoben wird erst nach Schreiben und Validieren.
  const archiv = [];

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

    if (auftrag.art === "pdf-text" || auftrag.art === "bild-text") {
      const zielName = `${auftrag.datei.replace(/\.[^.]+$/, "")}.txt`;
      const lauf = { datei: auftrag.datei, art: auftrag.art, ziel: `${inboxName(inboxRoot)}/standardized/${zielName}`, hinweis: "Zeilenextraktion durch den Agenten; Textzwilling danach ueber belege-text.mjs" };
      // OCR ist teuer: nur im Schreiblauf. Die Vorschau nennt nur den Auftrag.
      if (schreiben) {
        let vorlauf;
        try {
          vorlauf = await erzeugeTextvorlauf(fileURLToPath(quelle));
        } catch (error) {
          bericht.laeufe.push({ ...lauf, ziel: null, abgebrochen: error.message });
          continue;
        }
        lauf.text = vorlauf.art;
        if (vorlauf.art === "ohne-text") lauf.hinweis = `Kein brauchbarer Text (${vorlauf.grund}) — der Agent liest ${auftrag.art === "bild-text" ? "das Bild" : "die Seiten"} selbst`;
        if (vorlauf.inhalt === null) lauf.ziel = null;
        else {
          await mkdir(new URL("standardized/", inboxRoot), { recursive: true });
          await writeFile(new URL(`standardized/${encodeURIComponent(zielName)}`, inboxRoot), vorlauf.inhalt);
        }
      }
      bericht.laeufe.push(lauf);
      continue;
    }

    if (auftrag.art === "profil-ungueltig") {
      const meldung = `Profil ${auftrag.profil_id} (${auftrag.profildatei}) ungueltig — nichts gelesen, Profil in data/import-profile/ korrigieren und Datei aus error/ zurueckholen:\n${auftrag.fehler.map((f) => `- ${f}`).join("\n")}`;
      const lauf = { datei: auftrag.datei, art: "csv", profil: auftrag.profil_id, abgebrochen: meldung };
      bericht.laeufe.push(lauf);
      archiv.push({ quelle, datei: auftrag.datei, ordner: "error", notiz: `${meldung}\n`, lauf });
      continue;
    }

    const profil = profile.find((p) => p.profil_id === auftrag.profil_id);
    const rohquelle = profil.beleg_ziel ? `${profil.beleg_ziel}/${auftrag.datei}` : `${inboxName(inboxRoot)}/processed/${auftrag.datei}`;
    let normalized;
    try {
      normalized = normalizeCsv({ text: await readFile(quelle, "utf8"), profil, rohquelle });
    } catch (error) {
      const lauf = { datei: auftrag.datei, art: "csv", abgebrochen: error.message };
      bericht.laeufe.push(lauf);
      archiv.push({ quelle, datei: auftrag.datei, ordner: "error", notiz: `${error.message}\n`, lauf });
      continue;
    }

    const out = runImport({ entries: normalized.eintraege, konten, kategorien, kategorisierungsregeln: regeln, transaktionen, transfers, regelzahlungen });
    transaktionen = out.transaktionen;
    transfers = out.transfers;

    const lauf = importLaufBericht({
      auftrag,
      profil,
      normalized,
      result: out.result,
    });
    bericht.laeufe.push(lauf);
    // Ein Teilimport ist nicht "verarbeitet": die nicht uebernommenen Zeilen
    // muessen sichtbar bleiben, bis jemand sie klaert.
    const unvollstaendig = normalized.fehler.length > 0 || out.result.errors.length > 0;
    archiv.push({
      quelle,
      datei: auftrag.datei,
      ordner: unvollstaendig ? "error" : "processed",
      notiz: unvollstaendig ? fehlerNotiz({ normalized, result: out.result }) : null,
      lauf,
    });
  }

  const ausgeben = () => {
    console.log(JSON.stringify(bericht, null, 2));
    for (const p of ungueltigeProfile) {
      console.warn(`Importprofil ${p.datei} ungueltig, wird nicht benutzt: ${p.fehler.join("; ")}`);
    }
    for (const o of plan.unterordner) {
      console.warn(`Unterordner "${o.ordner}" enthaelt ${o.dateien} verarbeitbare Datei(en), wird nicht verarbeitet — zum Import in den Inbox-Root legen.`);
    }
  };

  if (!schreiben) {
    ausgeben();
    console.log("\nVorschau — nichts geschrieben, nichts verschoben. Mit --schreiben anwenden.");
    return;
  }

  // Erst den neuen Bestand pruefen: bringt der Lauf neue Validatorfehler, wird
  // nichts geschrieben und keine Quelle verschoben.
  const bestand = await loadMasterData(masterRoot);
  const bekannt = new Set(validateMasterData(bestand).errors);
  const neu = validateMasterData({ ...bestand, transaktionen, transfers }).errors.filter((f) => !bekannt.has(f));
  if (neu.length) {
    ausgeben();
    console.error("Validierung des neuen Bestands fehlgeschlagen — nichts geschrieben, keine Datei verschoben:");
    for (const error of neu) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  await writeFile(new URL("transaktionen.jsonl", masterRoot), transaktionen.map((tx) => JSON.stringify(tx)).join("\n") + "\n");
  await writeFile(new URL("transfers.json", masterRoot), JSON.stringify(transfers, null, 2) + "\n");

  const protokoll = {
    zeitpunkt: new Date().toISOString(),
    anlass: "inbox-lauf",
    inputs: plan.auftraege.map((a) => `${inboxName(inboxRoot)}/${a.datei}`),
    anzahl_importiert: bericht.laeufe.reduce((s, l) => s + (l.geschrieben ?? 0), 0),
    anzahl_offen: plan.offen.length,
    anzahl_fehler: bericht.laeufe.reduce((s, l) => s + (l.importfehler ?? 0) + (l.lesefehler ?? 0), 0),
    notiz: `inbox.mjs: ${bericht.laeufe.length} Datei(en) verarbeitet`,
    betroffene_ids: betroffeneTransaktionsIds(bericht.laeufe),
  };
  const logUrl = new URL("agent_log.jsonl", masterRoot);
  const bisher = await readFile(logUrl, "utf8").catch(() => "");
  await writeFile(logUrl, `${bisher.replace(/\n*$/, "\n")}${JSON.stringify(protokoll)}\n`);

  // Archiviert wird erst, wenn der geschriebene Bestand keine neuen Fehler hat.
  const validation = validateMasterData(await loadMasterData(masterRoot));
  const neuNachher = validation.errors.filter((f) => !bekannt.has(f));
  if (neuNachher.length) {
    ausgeben();
    console.error("Validierung nach dem Schreiben fehlgeschlagen — keine Datei verschoben:");
    for (const error of neuNachher) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  for (const eintrag of archiv) {
    eintrag.lauf.abgelegt = await archiviere(inboxRoot, eintrag);
  }
  ausgeben();

  if (!validation.valid) {
    console.error(`Validierung nach Inbox-Lauf: ${validation.errors.length} Fehler, alle schon vorher vorhanden:`);
    for (const error of validation.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

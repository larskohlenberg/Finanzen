// prototyp/e1/messung.mjs
// Messwerte fuer den E1-Bericht. Nur Demodaten und daraus erzeugte,
// vervielfachte Kopien (erfundene Daten), alles in einem Temp-Ordner.
//   node prototyp/e1/messung.mjs [faktoren=1,10,40] [killrunden=40]
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DATEN_DATEIEN } from "../../app/data-loader.mjs";
import { loadMasterData, validateMasterData } from "../../app/tools/validator.mjs";
import { einrichten, mitLeser, mitSchreiber as schreibeA } from "./generationen.mjs";
import { DB_DATEI, exportiere, importiere, mitSchreiber as schreibeB, oeffneDb } from "./sqlite-bestand.mjs";
import { vergleicheOrdner } from "./rundweg.mjs";
import { backendGenerationen, backendSqlite, leseHandler } from "./lese-api.mjs";
import { liesStand, testBuchung } from "./arbeiter.mjs";

const DEMO = fileURLToPath(new URL("../../app/data/demo/", import.meta.url));
const ARBEITER = fileURLToPath(new URL("./arbeiter.mjs", import.meta.url));
const faktoren = (process.argv[2] ?? "1,10,40").split(",").map(Number);
const KILLRUNDEN = Number(process.argv[3] ?? 40);

const ms = (t0) => performance.now() - t0;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
async function mal(n, fn) {
  const zeiten = [];
  for (let i = 0; i < n; i += 1) {
    const t0 = performance.now();
    await fn(i);
    zeiten.push(ms(t0));
  }
  return Number(median(zeiten).toFixed(2));
}

// Demodaten vervielfachen: Buchungen mit neuen IDs, sonst unveraendert.
async function skaliert(ziel, faktor) {
  await cp(DEMO, ziel, { recursive: true });
  if (faktor === 1) return;
  const zeilen = (await readFile(path.join(DEMO, "transaktionen.jsonl"), "utf8")).split("\n").filter(Boolean);
  const aus = [];
  for (let k = 0; k < faktor; k += 1) {
    for (const z of zeilen) {
      const t = JSON.parse(z);
      if (k > 0) {
        t.transaktion_id = `${t.transaktion_id}-x${k}`;
        t.dedupe_hash = `${t.dedupe_hash}-x${k}`;
      }
      aus.push(JSON.stringify(t));
    }
  }
  await writeFile(path.join(ziel, "transaktionen.jsonl"), `${aus.join("\n")}\n`);
}

async function groesse(ordner) {
  let summe = 0;
  for (const e of await readdir(ordner, { withFileTypes: true })) {
    const p = path.join(ordner, e.name);
    summe += e.isDirectory() ? await groesse(p) : (await stat(p)).size;
  }
  return summe;
}

// Bytes, die auf der Platte NEU belegt sind (Inodes mit nur einem Link).
async function neueBytes(ordner) {
  let summe = 0;
  for (const e of await readdir(ordner, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    const s = await stat(path.join(ordner, e.name));
    if (s.nlink === 1) summe += s.size;
  }
  return summe;
}

async function mitServer(backend, fn) {
  const s = http.createServer(leseHandler(backend));
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const basis = `http://127.0.0.1:${s.address().port}`;
  try {
    return await fn(async (pfad) => {
      const res = await fetch(`${basis}${pfad}`);
      return (await res.arrayBuffer()).byteLength;
    });
  } finally {
    await new Promise((r) => s.close(r));
  }
}

const bekannteFehler = async (ordner) => new Set(validateMasterData(await loadMasterData(pathToFileURL(`${ordner}${path.sep}`))).errors);

async function messeFaktor(tmp, faktor) {
  const quelle = path.join(tmp, `quelle-${faktor}`);
  await skaliert(quelle, faktor);
  const anzahl = (await readFile(path.join(quelle, "transaktionen.jsonl"), "utf8")).split("\n").filter(Boolean).length;
  const bundle = (await Promise.all(DATEN_DATEIEN.map((d) => stat(path.join(quelle, d)).then((s) => s.size).catch(() => 0)))).reduce((a, b) => a + b, 0);
  const bekannt = await bekannteFehler(quelle);
  const zeile = { faktor, buchungen: anzahl, bundle_bytes: bundle };

  // Validator allein (heute nach jedem Schreiben)
  zeile.validator_ms = await mal(5, async () => validateMasterData(await loadMasterData(pathToFileURL(`${quelle}${path.sep}`))));

  // ---- A
  const basis = path.join(tmp, `a-${faktor}`);
  let t0 = performance.now();
  await einrichten(basis, quelle);
  zeile.a_einrichten_ms = Number(ms(t0).toFixed(1));
  let n = 0;
  const neueBuchungA = async (tx) => {
    n += 1;
    await tx.schreibe("transaktionen.jsonl", `${await tx.lies("transaktionen.jsonl")}${JSON.stringify(testBuchung("m", n))}\n`);
  };
  zeile.a_commit_buchung_ms = await mal(15, () => schreibeA(basis, neueBuchungA, { behalten: 10 }));
  zeile.a_commit_klein_ms = await mal(15, (i) => schreibeA(basis, (tx) => tx.schreibe("farben.json", `{"n":${i}}\n`), { behalten: 10 }));
  zeile.a_commit_mit_validator_ms = await mal(5, () => schreibeA(basis, neueBuchungA, {
    behalten: 10,
    pruefe: async (o) => validateMasterData(await loadMasterData(pathToFileURL(`${o}${path.sep}`))).errors.filter((f) => !bekannt.has(f)),
  }));
  const genOrdner = path.join(basis, "generationen");
  const ids = (await readdir(genOrdner)).filter((x) => /^\d{6}$/.test(x)).sort();
  zeile.a_generationen = ids.length;
  zeile.a_platte_gesamt_bytes = await groesse(genOrdner); // stat-Groessen, Hardlinks mehrfach gezaehlt
  zeile.a_neu_je_generation_klein_bytes = await neueBytes(path.join(genOrdner, ids.at(-6)));
  zeile.a_leser_lease_ms = await mal(50, () => mitLeser(basis, async () => {}));

  // ---- B
  const ordnerB = path.join(tmp, `b-${faktor}`);
  await mkdir(ordnerB);
  const db = oeffneDb(path.join(ordnerB, DB_DATEI));
  t0 = performance.now();
  await importiere(db, quelle);
  zeile.b_import_ms = Number(ms(t0).toFixed(1));
  t0 = performance.now();
  await exportiere(db, path.join(tmp, `b-export-${faktor}`));
  zeile.b_export_ms = Number(ms(t0).toFixed(1));
  const v = await vergleicheOrdner(quelle, path.join(tmp, `b-export-${faktor}`));
  zeile.b_rundweg = `${v.byte.length} byte-gleich, ${v.feld.length} feldgleich, ${v.abweichung.length} abweichend`;
  db.close();
  zeile.b_commit_buchung_ms = await mal(15, () => schreibeB(ordnerB, (tx) => { n += 1; tx.fuegeHinzu("transaktionen", testBuchung("m", n)); }));
  zeile.b_commit_ersetze_alle_ms = await mal(5, () => schreibeB(ordnerB, (tx) => { n += 1; tx.ersetze("transaktionen", [...tx.lies("transaktionen"), testBuchung("m", n)]); }));
  zeile.b_commit_mit_validator_ms = await mal(5, () => schreibeB(ordnerB, (tx) => { n += 1; tx.fuegeHinzu("transaktionen", testBuchung("m", n)); }, {
    pruefe: (daten) => validateMasterData(daten).errors.filter((f) => !bekannt.has(f)),
  }));
  zeile.b_db_bytes = (await stat(path.join(ordnerB, DB_DATEI))).size;

  // ---- Lese-API (Antwortgroessen und Zeiten, je Variante)
  for (const [k, backend] of [["a", backendGenerationen(basis)], ["b", backendSqlite(ordnerB)]]) {
    await mitServer(backend, async (hol) => {
      zeile[`${k}_api_seite_bytes`] = await hol("/api/v1/transaktionen?konto=KTO-001&seite=1&groesse=50");
      zeile[`${k}_api_kennzahl_bytes`] = await hol("/api/v1/kennzahlen?stichtag=2026-10-19");
      zeile[`${k}_api_seite_ms`] = await mal(20, () => hol("/api/v1/transaktionen?konto=KTO-001&seite=3&groesse=50"));
      zeile[`${k}_api_text_ms`] = await mal(10, () => hol("/api/v1/transaktionen?text=gehalt&groesse=50"));
      zeile[`${k}_api_kennzahl_ms`] = await mal(10, () => hol("/api/v1/kennzahlen?stichtag=2026-10-19"));
    });
    // Erste Anfrage nach einem Schreibvorgang (Cache von A kalt).
    if (k === "a") await schreibeA(basis, neueBuchungA);
    else await schreibeB(ordnerB, (tx) => { n += 1; tx.fuegeHinzu("transaktionen", testBuchung("m", n)); });
    await mitServer(backend, async (hol) => {
      const t = performance.now();
      await hol("/api/v1/kennzahlen?stichtag=2026-10-19");
      zeile[`${k}_api_kennzahl_kalt_ms`] = Number(ms(t).toFixed(2));
    });
    backend.schliessen?.();
  }
  return zeile;
}

function starte(args) {
  const kind = spawn(process.execPath, [ARBEITER, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  kind.stdout.on("data", (d) => { out += d; });
  const fertig = new Promise((r) => kind.on("exit", () => r(out)));
  return { kind, fertig };
}

// Kill-Kampagne: Schreiber endlos, nach Zufallszeit SIGKILL. Geprueft: Stand
// konsistent und kein bestaetigter Commit verloren (gemeldet n -> Stand n oder n+1).
async function killKampagne(tmp, variante) {
  const pfad = path.join(tmp, `kill-${variante}`);
  if (variante === "a") await einrichten(pfad, DEMO);
  else {
    await mkdir(pfad);
    const db = oeffneDb(path.join(pfad, DB_DATEI));
    await importiere(db, DEMO);
    db.close();
  }
  const db = variante === "b" ? oeffneDb(path.join(pfad, DB_DATEI)) : null;
  const befund = { runden: KILLRUNDEN, commits: 0, inkonsistent: 0, verloren: 0 };
  let basisZahl = 0;
  for (let r = 0; r < KILLRUNDEN; r += 1) {
    const { kind, fertig } = starte([variante, pfad, "endlos", `k${r}`]);
    await new Promise((res) => setTimeout(res, 80 + Math.floor(Math.random() * 400)));
    kind.kill("SIGKILL");
    const out = await fertig;
    const gemeldet = out.split("\n").filter(Boolean).length;
    const s = await liesStand(variante, pfad, db);
    if (!s.ok) befund.inkonsistent += 1;
    const zuwachs = s.buchungen - basisZahl;
    if (zuwachs < gemeldet || zuwachs > gemeldet + 1) befund.verloren += 1;
    befund.commits += zuwachs;
    basisZahl = s.buchungen;
  }
  db?.close();
  return befund;
}

// Heutiger Weg als Kontrolle: zwei Dateien nacheinander ueberschreiben, ein
// Leser liest daneben.
async function naivKontrolle(tmp) {
  const pfad = path.join(tmp, "naiv");
  await cp(DEMO, pfad, { recursive: true });
  const leser = starte(["naiv", pfad, "lies", "3000"]);
  const schreiber = starte(["naiv", pfad, "schreibe", "200", "n"]);
  await schreiber.fertig;
  return JSON.parse(await leser.fertig);
}

const tmp = await mkdtemp(path.join(tmpdir(), "e1-messung-"));
try {
  const ergebnis = { node: process.version, plattform: `${process.platform} ${process.arch}`, faktoren: [] };
  for (const f of faktoren) ergebnis.faktoren.push(await messeFaktor(tmp, f));
  ergebnis.kill_a = await killKampagne(tmp, "a");
  ergebnis.kill_b = await killKampagne(tmp, "b");
  ergebnis.naiv = await naivKontrolle(tmp);
  console.log(JSON.stringify(ergebnis, null, 2));
} finally {
  await rm(tmp, { recursive: true, force: true });
}

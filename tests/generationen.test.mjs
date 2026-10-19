// Generationen-Bibliothek (ADR 0035): Garantien, Rueckfallmodus, Formatversion,
// Kill- und Nebenlaeufigkeitstests mit echten Prozessen.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, cp, lstat, mkdir, mkdtemp, readdir, readFile, rename, stat, symlink, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {
  aktuelleId, bestandsArt, einrichten, FORMAT, FormatUnbekannt, generationsOrdner, mitLeser, mitSchreiber,
  oeffneLeser, ORDNER, pruefeGeneration, rueckgaengig, StandVeraltet, veroeffentlichteIds,
} from "../app/tools/lib/generationen.mjs";
import { nimmSperre, SPERRDATEI, SperreBelegt } from "../app/tools/lib/schreibsperre.mjs";
import { loadMasterData, validateMasterData } from "../app/tools/validator.mjs";
import { liesStand } from "./generationen-arbeiter.mjs";

const DEMO = fileURLToPath(new URL("../app/data/demo/", import.meta.url));
const ARBEITER = fileURLToPath(new URL("./generationen-arbeiter.mjs", import.meta.url));
const istRoot = process.getuid?.() === 0;

const tempOrdner = () => mkdtemp(path.join(tmpdir(), "generationen-"));

async function bestand() {
  const basis = path.join(await tempOrdner(), "bestand");
  await einrichten(basis, DEMO);
  return basis;
}

async function ordnerBestand() {
  const basis = path.join(await tempOrdner(), "ordner");
  await cp(DEMO, basis, { recursive: true });
  return basis;
}

const genPfad = (basis, id, rel) => path.join(generationsOrdner(basis, id), rel);

async function reste(basis) {
  const wurzel = await readdir(basis);
  const gen = wurzel.includes("generationen") ? await readdir(path.join(basis, "generationen")) : [];
  return [...gen.filter((n) => n.startsWith(".")), ...wurzel.filter((n) => n.includes(".tmp-") || n.startsWith(".entwurf-") || n === SPERRDATEI)];
}

async function alleGenerationenHeil(basis) {
  const fehler = [];
  for (const id of await veroeffentlichteIds(basis)) fehler.push(...(await pruefeGeneration(basis, id)));
  return fehler;
}

// Nur neue Validatorfehler gegenueber dem Stand vorher zaehlen.
const validatorPruefung = (bekannt) => async (ordner) => {
  const ergebnis = validateMasterData(await loadMasterData(pathToFileURL(`${ordner}${path.sep}`)));
  return ergebnis.errors.filter((f) => !bekannt.has(f));
};

function starte(args, env = {}) {
  const kind = spawn(process.execPath, [ARBEITER, ...args], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  kind.stdout.on("data", (d) => { out += d; });
  kind.stderr.on("data", (d) => { err += d; });
  const fertig = new Promise((resolve) => kind.on("exit", (code, signal) => resolve({ code, signal, out, err, pid: kind.pid })));
  return { kind, fertig };
}
const lauf = (args, env) => starte(args, env).fertig;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// Macht eine veroeffentlichte Datei beschreibbar und aendert sie (wie es root
// trotz 0444 koennte).
async function manipuliere(datei, inhalt) {
  await chmod(datei, 0o644);
  await writeFile(datei, inhalt);
}

// ------------------------------------------------------------ Grundfunktion

test("Einrichten: byte-gleiche Uebernahme, Formatversion im Manifest, Dateien schreibgeschuetzt", async () => {
  const basis = await bestand();
  assert.equal(await bestandsArt(basis), "generationen");
  assert.equal(await aktuelleId(basis), "000001");
  const manifest = JSON.parse(await readFile(genPfad(basis, "000001", "MANIFEST.json"), "utf8"));
  assert.equal(manifest.format, FORMAT);
  assert.equal(manifest.id, "000001");
  assert.deepEqual(await alleGenerationenHeil(basis), []);
  for (const name of ["transaktionen.jsonl", "konten.json", "README.md"]) {
    assert.ok((await readFile(genPfad(basis, "000001", name))).equals(await readFile(path.join(DEMO, name))));
  }
  await assert.rejects(einrichten(basis, DEMO), /schon eingerichtet/);
  assert.deepEqual(await reste(basis), []);
});

test("Einrichten: abgebrochenes Einrichten (Generationen ohne Zeiger) wird erkannt und neu begonnen", async () => {
  const basis = path.join(await tempOrdner(), "bestand");
  await mkdir(path.join(basis, "generationen", "000001"), { recursive: true });
  await assert.rejects(bestandsArt(basis), /nicht abgeschlossen/);
  assert.equal(await einrichten(basis, DEMO), "000001");
  assert.deepEqual(await alleGenerationenHeil(basis), []);
});

test("Commit ersetzt nur Geaendertes (neuer Inode), Unveraendertes ist Hardlink, alte Generation bleibt", async () => {
  const basis = await bestand();
  const vorher = await readFile(genPfad(basis, "000001", "konten.json"));
  const r = await mitSchreiber(basis, async (tx) => {
    const k = JSON.parse(await tx.lies("konten.json"));
    k[0].name = "Umbenannt";
    await tx.schreibe("konten.json", `${JSON.stringify(k, null, 2)}\n`);
  });
  assert.equal(r.id, "000002");
  assert.equal(r.vorher, "000001");
  assert.deepEqual(r.geaendert, ["konten.json"]);
  const [a, b] = await Promise.all(["000001", "000002"].map((id) => stat(genPfad(basis, id, "konten.json"))));
  assert.notEqual(a.ino, b.ino);
  const [c, d] = await Promise.all(["000001", "000002"].map((id) => stat(genPfad(basis, id, "transaktionen.jsonl"))));
  assert.equal(c.ino, d.ino);
  assert.ok((await readFile(genPfad(basis, "000001", "konten.json"))).equals(vorher));
  assert.equal(b.mode & 0o222, 0);
  const manifest = JSON.parse(await readFile(genPfad(basis, "000002", "MANIFEST.json"), "utf8"));
  assert.equal(manifest.quelle, "000001");
  assert.deepEqual(await alleGenerationenHeil(basis), []);
  assert.deepEqual(await reste(basis), []);
});

test("Ohne inhaltliche Aenderung entsteht keine neue Generation", async () => {
  const basis = await bestand();
  assert.equal((await mitSchreiber(basis, async () => {})).id, "000001");
  const r = await mitSchreiber(basis, async (tx) => tx.schreibe("konten.json", await tx.lies("konten.json", null)));
  assert.equal(r.id, "000001");
  assert.deepEqual(r.geaendert, []);
  assert.deepEqual(await veroeffentlichteIds(basis), ["000001"]);
});

test("Loeschen und neue Unterordner werden veroeffentlicht", async () => {
  const basis = await bestand();
  const r = await mitSchreiber(basis, async (tx) => {
    await tx.loesche("README.md");
    await tx.schreibe("logos/test.svg", "<svg/>");
  });
  assert.deepEqual(r.geaendert, ["README.md", "logos/test.svg"]);
  assert.deepEqual(r.geloescht, ["README.md"]);
  await mitLeser(basis, async (l) => {
    assert.ok(!(await l.dateien()).includes("README.md"));
    assert.equal(await l.lies("logos/test.svg"), "<svg/>");
  });
  assert.deepEqual(await alleGenerationenHeil(basis), []);
});

test("Ein In-place-Schreibversuch auf eine veroeffentlichte Datei scheitert, auch im Entwurf", { skip: istRoot && "als root greift 0444 nicht" }, async () => {
  const basis = await bestand();
  await assert.rejects(writeFile(genPfad(basis, "000001", "konten.json"), "[]"), { code: "EACCES" });
  await assert.rejects(mitSchreiber(basis, (tx) => writeFile(path.join(tx.ordner, "konten.json"), "[]")), { code: "EACCES" });
  assert.equal(await aktuelleId(basis), "000001");
  assert.deepEqual(await alleGenerationenHeil(basis), []);
  assert.deepEqual(await reste(basis), []);
});

test("Direkt in tx.ordner per neuer Datei + rename geschrieben: veroeffentlicht und schreibgeschuetzt", async () => {
  const basis = await bestand();
  const r = await mitSchreiber(basis, async (tx) => {
    const temp = path.join(tx.ordner, ".tmp-farben");
    await writeFile(temp, "{\"direkt\":true}\n", { mode: 0o644 });
    await rename(temp, path.join(tx.ordner, "farben.json"));
  });
  assert.deepEqual(r.geaendert, ["farben.json"]);
  assert.equal((await stat(genPfad(basis, r.id, "farben.json"))).mode & 0o222, 0);
  assert.deepEqual(await alleGenerationenHeil(basis), []);
});

test("Eine nach der Veroeffentlichung veraenderte Datei (z. B. durch root) blockiert die naechste Veroeffentlichung", async () => {
  const basis = await bestand();
  await manipuliere(genPfad(basis, "000001", "konten.json"), "[]\n");
  assert.deepEqual(await pruefeGeneration(basis, "000001"), ["000001: konten.json weicht vom Manifest ab", "000001: konten.json ist beschreibbar"]);
  await assert.rejects(mitSchreiber(basis, (tx) => tx.schreibe("farben.json", "{}\n")), /konten\.json wurde nach der Veroeffentlichung veraendert/);
  assert.deepEqual(await veroeffentlichteIds(basis), ["000001"]);
  assert.deepEqual(await reste(basis), []);
});

test("Symlinks im Entwurf und Pfade ausserhalb des Bestands werden abgewiesen", async () => {
  const basis = await bestand();
  await assert.rejects(mitSchreiber(basis, (tx) => symlink("/etc/hosts", path.join(tx.ordner, "fremd.json"))), /keine normale Datei/);
  for (const rel of ["../draussen.json", "/abs.json", ".schreibsperre", "MANIFEST.json", "a/../../b"]) {
    await assert.rejects(mitSchreiber(basis, (tx) => tx.schreibe(rel, "x")), /ungueltiger Pfad/, rel);
  }
  await assert.rejects(mitLeser(basis, (l) => l.lies("../MANIFEST.json")), /ungueltiger Pfad/);
  assert.equal(await aktuelleId(basis), "000001");
  assert.deepEqual(await reste(basis), []);
});

test("Werkzeugfehler oder Pruefungsfehler veroeffentlichen nichts", async () => {
  const basis = await bestand();
  await assert.rejects(mitSchreiber(basis, async (tx) => {
    await tx.schreibe("konten.json", "[]\n");
    throw new Error("Werkzeug kaputt");
  }), /Werkzeug kaputt/);
  assert.equal(await aktuelleId(basis), "000001");
  const bekannt = new Set(validateMasterData(await loadMasterData(pathToFileURL(`${generationsOrdner(basis, "000001")}${path.sep}`))).errors);
  const r = await mitSchreiber(basis, async (tx) => {
    const t = (await tx.lies("transaktionen.jsonl")).split("\n");
    t[0] = t[0].replace('"KTO-001"', '"KTO-999"');
    await tx.schreibe("transaktionen.jsonl", t.join("\n"));
  }, { pruefe: validatorPruefung(bekannt) });
  assert.equal(r.verworfen, true);
  assert.deepEqual(r.geaendert, ["transaktionen.jsonl"]);
  assert.ok(r.fehler.some((f) => f.includes("KTO-999")), r.fehler.join("\n"));
  assert.equal(await aktuelleId(basis), "000001");
  assert.deepEqual(await reste(basis), []);
});

test("erwartet: ein veralteter Vorschau-Stand wird abgewiesen", async () => {
  const basis = await bestand();
  await mitSchreiber(basis, (tx) => tx.schreibe("farben.json", "{\"n\":1}\n"));
  await assert.rejects(mitSchreiber(basis, (tx) => tx.schreibe("farben.json", "{}\n"), { erwartet: "000001" }), StandVeraltet);
  assert.equal((await mitSchreiber(basis, (tx) => tx.schreibe("farben.json", "{}\n"), { erwartet: "000002" })).id, "000003");
});

test("Formatversion: unbekanntes Format wird weder gelesen noch geschrieben", async () => {
  const basis = await bestand();
  const datei = genPfad(basis, "000001", "MANIFEST.json");
  const manifest = JSON.parse(await readFile(datei, "utf8"));
  await manipuliere(datei, JSON.stringify({ ...manifest, format: FORMAT + 1 }));
  await assert.rejects(oeffneLeser(basis), FormatUnbekannt);
  await assert.rejects(mitSchreiber(basis, (tx) => tx.schreibe("farben.json", "{}\n")), FormatUnbekannt);
  assert.match((await pruefeGeneration(basis, "000001"))[0], /Formatversion 2/);
  // Leser hat seine Lease wieder abgemeldet.
  assert.deepEqual((await readdir(generationsOrdner(basis, "000001"))).filter((n) => n.startsWith(".leser-")), []);
  assert.deepEqual(await reste(basis), []);
});

// ------------------------------------------------------------ Sperre

test("Sperre liegt im Basisordner; tx.sperre traegt ihre Kennung; gesperrt nutzt eine gehaltene Sperre", async () => {
  const basis = await bestand();
  await mitSchreiber(basis, async (tx) => {
    const halter = JSON.parse(await readFile(path.join(basis, SPERRDATEI), "utf8"));
    assert.equal(tx.sperre, halter.kennung);
    assert.ok(!(await readdir(tx.ordner)).includes(SPERRDATEI));
    await tx.schreibe("farben.json", "{}\n");
  });
  const sperre = await nimmSperre(basis, { wer: "test" });
  try {
    await assert.rejects(mitSchreiber(basis, async () => {}, { wartenMs: 200 }), SperreBelegt);
    const r = await mitSchreiber(basis, (tx) => tx.schreibe("farben.json", "{\"n\":2}\n"), { gesperrt: true });
    assert.equal(r.id, "000003");
  } finally {
    await sperre.freigeben();
  }
  assert.ok(!(await readdir(generationsOrdner(basis, "000003"))).includes(SPERRDATEI));
});

// ------------------------------------------------------------ Leser, Aufraeumen, Undo

test("Aufraeumen behaelt N Generationen und keine mit lebendem Leser; Undo", async () => {
  const basis = await bestand();
  const leser = await oeffneLeser(basis); // haelt 000001 fest
  for (let i = 0; i < 4; i += 1) {
    await mitSchreiber(basis, (tx) => tx.schreibe("farben.json", `{"n":${i}}\n`), { behalten: 1 });
  }
  assert.deepEqual(await veroeffentlichteIds(basis), ["000001", "000004", "000005"]);
  assert.equal(await leser.lies("farben.json"), await readFile(path.join(DEMO, "farben.json"), "utf8"));
  await leser.schliessen();
  const r = await mitSchreiber(basis, (tx) => tx.schreibe("farben.json", "{\"n\":9}\n"), { behalten: 1 });
  assert.deepEqual(r.aufgeraeumt, ["000001", "000004"]);
  assert.deepEqual(await veroeffentlichteIds(basis), ["000005", "000006"]);
  const u = await rueckgaengig(basis, { behalten: 1 });
  assert.equal(u.id, "000007");
  assert.deepEqual(u.geaendert, ["farben.json"]);
  assert.equal(await mitLeser(basis, (l) => l.lies("farben.json")), "{\"n\":3}\n");
  await assert.rejects(rueckgaengig(basis, { schritte: 5 }), /keine Generation/);
  assert.deepEqual(await alleGenerationenHeil(basis), []);
});

test("Verwaiste Leases blockieren nicht, frisch angelegte halbe Leases schon", async () => {
  const basis = await bestand();
  const tot = await lauf(["/gibt/es/nicht", "nichts"]);
  const ordner = generationsOrdner(basis, "000001");
  await writeFile(path.join(ordner, ".leser-tot"), JSON.stringify({ pid: tot.pid, rechner: hostname(), zeit: new Date().toISOString() }));
  await mitSchreiber(basis, (tx) => tx.schreibe("farben.json", "{}\n"), { behalten: 0 });
  assert.deepEqual(await veroeffentlichteIds(basis), ["000002"]);
  await writeFile(path.join(generationsOrdner(basis, "000002"), ".leser-halb"), "");
  await mitSchreiber(basis, (tx) => tx.schreibe("farben.json", "{\"n\":1}\n"), { behalten: 0 });
  assert.deepEqual(await veroeffentlichteIds(basis), ["000002", "000003"]);
});

// ------------------------------------------------------------ Rueckfallmodus

test("Rueckfallmodus: einfacher Ordner ist eine Generation ohne Historie", async () => {
  const basis = await ordnerBestand();
  assert.equal(await bestandsArt(basis), ORDNER);
  assert.equal(await aktuelleId(basis), ORDNER);
  assert.equal(await mitLeser(basis, async (l) => {
    assert.equal(l.ordner, basis);
    return l.id;
  }), ORDNER);
  const r = await mitSchreiber(basis, async (tx) => {
    await tx.schreibe("farben.json", "{\"ordner\":true}\n");
    await tx.loesche("README.md");
    await tx.schreibe("konten.json", await tx.lies("konten.json"));
  }, { erwartet: ORDNER });
  assert.equal(r.id, ORDNER);
  assert.deepEqual(r.geaendert, ["README.md", "farben.json"]);
  assert.equal(await readFile(path.join(basis, "farben.json"), "utf8"), "{\"ordner\":true}\n");
  assert.equal((await lstat(path.join(basis, "README.md")).catch(() => null)), null);
  assert.deepEqual(await reste(basis), []);
  await assert.rejects(rueckgaengig(basis), /einfacher Ordner/);
});

test("Rueckfallmodus: In-place im Entwurf, Werkzeug- und Pruefungsfehler lassen den Ordner unberuehrt", async () => {
  const basis = await ordnerBestand();
  const vorher = await readFile(path.join(basis, "konten.json"));
  await assert.rejects(mitSchreiber(basis, async (tx) => {
    await writeFile(path.join(tx.ordner, "konten.json"), "[]");
    throw new Error("kaputt");
  }), /kaputt/);
  const r = await mitSchreiber(basis, (tx) => writeFile(path.join(tx.ordner, "konten.json"), "[]"), { pruefe: async () => ["Fehler"] });
  assert.equal(r.verworfen, true);
  assert.ok((await readFile(path.join(basis, "konten.json"))).equals(vorher));
  assert.deepEqual(await reste(basis), []);
});

// ------------------------------------------------------------ Kill-Tests

const SCHRITTE = [
  ["entwurf-angelegt", false],
  ["datei-geschrieben", false],
  ["manifest", false],
  ["generation-umbenannt", false],
  ["zeiger-temp", false],
  ["zeiger-umgestellt", true],
  ["gc-umbenannt", true],
];

for (const [schritt, sichtbar] of SCHRITTE) {
  test(`Kill bei ${schritt} -> ${sichtbar ? "neuer" : "alter"} Stand vollstaendig, Wiederanlauf sauber`, async () => {
    const basis = await bestand();
    // Vier Generationen vorweg, damit das Aufraeumen (behalten 3) etwas zu tun hat.
    assert.equal((await lauf([basis, "schreibe", "4", "vor"])).code, 0);
    const vorher = await liesStand(basis);
    const r = await lauf([basis, "schreibe", "1", "kill"], { GEN_HALT: schritt });
    assert.equal(r.signal, "SIGKILL", r.err);
    const danach = await liesStand(basis);
    assert.equal(danach.ok, true);
    assert.equal(danach.buchungen, vorher.buchungen + (sichtbar ? 1 : 0));
    // Verwaiste Sperre (toter Prozess) wird uebernommen, Reste weggeraeumt.
    assert.equal((await lauf([basis, "schreibe", "1", "nach"])).code, 0);
    const ende = await liesStand(basis);
    assert.equal(ende.ok, true);
    assert.equal(ende.buchungen, danach.buchungen + 1);
    assert.deepEqual(await reste(basis), []);
    assert.deepEqual(await alleGenerationenHeil(basis), []);
  });
}

test("Rueckfallmodus: Kill im Schreibvorgang hinterlaesst keinen Entwurf beim naechsten Lauf", async () => {
  const basis = await ordnerBestand();
  const r = await lauf([basis, "schreibe", "1", "kill"], { GEN_HALT: "entwurf-angelegt" });
  assert.equal(r.signal, "SIGKILL", r.err);
  assert.ok((await readdir(basis)).some((n) => n.startsWith(".entwurf-")));
  assert.equal((await liesStand(basis)).buchungen, 0);
  assert.equal((await lauf([basis, "schreibe", "1", "nach"])).code, 0);
  assert.equal((await liesStand(basis)).buchungen, 1);
  assert.deepEqual(await reste(basis), []);
});

test("Kill zu zufaelligen Zeitpunkten (20 Runden) laesst nie einen halben Stand zurueck", async () => {
  const basis = await bestand();
  let letzte = 0;
  for (let runde = 0; runde < 20; runde += 1) {
    const { kind, fertig } = starte([basis, "endlos", `r${runde}`]);
    await warte(20 + Math.floor(Math.random() * 150));
    kind.kill("SIGKILL");
    await fertig;
    const s = await liesStand(basis);
    assert.equal(s.ok, true, JSON.stringify(s));
    assert.ok(s.buchungen >= letzte);
    letzte = s.buchungen;
  }
  assert.equal((await lauf([basis, "schreibe", "1", "ende"])).code, 0);
  assert.deepEqual(await reste(basis), []);
  assert.deepEqual(await alleGenerationenHeil(basis), []);
});

test("Zwei Schreibprozesse und ein Leser gleichzeitig: nichts verloren, nie inkonsistent", async () => {
  const basis = await bestand();
  const leser = starte([basis, "lies", "2500"]);
  const [x, y] = await Promise.all([lauf([basis, "schreibe", "25", "x"]), lauf([basis, "schreibe", "25", "y"])]);
  assert.equal(x.code, 0, x.err);
  assert.equal(y.code, 0, y.err);
  const befund = JSON.parse((await leser.fertig).out);
  assert.equal(befund.verletzt, 0, JSON.stringify(befund));
  assert.ok(befund.lesungen > 10);
  const s = await liesStand(basis);
  assert.equal(s.buchungen, 50);
  assert.equal(s.ok, true);
  assert.deepEqual(await alleGenerationenHeil(basis), []);
});

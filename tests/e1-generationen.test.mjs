// Prototyp E1, Variante A (Dateigenerationen): Garantien mit echten Prozessen.
import assert from "node:assert/strict";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { aktuelleId, einrichten, mitLeser, mitSchreiber, oeffneLeser, pruefeGeneration, rueckgaengig, veroeffentlichteIds } from "../prototyp/e1/generationen.mjs";
import { liesStand } from "../prototyp/e1/arbeiter.mjs";
import { loadMasterData, validateMasterData } from "../app/tools/validator.mjs";
import { DEMO, lauf, starte, tempOrdner, warte } from "./e1-hilfen.mjs";

async function bestand() {
  const basis = path.join(await tempOrdner("e1a-"), "bestand");
  await einrichten(basis, DEMO);
  return basis;
}

const genPfad = (basis, id, rel) => path.join(basis, "generationen", id, rel);

async function reste(basis) {
  const gen = await readdir(path.join(basis, "generationen"));
  const wurzel = await readdir(basis);
  return [...gen.filter((n) => n.startsWith(".")), ...wurzel.filter((n) => n.includes(".tmp-"))];
}

async function alleGenerationenHeil(basis) {
  const fehler = [];
  for (const id of await veroeffentlichteIds(basis)) fehler.push(...(await pruefeGeneration(basis, id)));
  return fehler;
}

// Neue Fehler gegenueber dem Stand vorher (wie mitRollback heute).
const validatorPruefung = (bekannt) => async (ordner) => {
  const ergebnis = validateMasterData(await loadMasterData(pathToFileURL(`${ordner}${path.sep}`)));
  return ergebnis.errors.filter((f) => !bekannt.has(f));
};

test("A: Einrichten uebernimmt die Demodaten byte-gleich, Dateien schreibgeschuetzt", async () => {
  const basis = await bestand();
  assert.equal(await aktuelleId(basis), "000001");
  assert.deepEqual(await alleGenerationenHeil(basis), []);
  for (const name of ["transaktionen.jsonl", "konten.json", "farben.json"]) {
    assert.ok((await readFile(genPfad(basis, "000001", name))).equals(await readFile(path.join(DEMO, name))));
  }
});

test("A: Commit ersetzt nur Geaendertes (neuer Inode), Unveraendertes ist Hardlink, alte Generation bleibt", async () => {
  const basis = await bestand();
  const vorher = await readFile(genPfad(basis, "000001", "konten.json"));
  const r = await mitSchreiber(basis, async (tx) => {
    const k = JSON.parse(await tx.lies("konten.json"));
    k[0].name = "Umbenannt";
    await tx.schreibe("konten.json", `${JSON.stringify(k, null, 2)}\n`);
  });
  assert.equal(r.id, "000002");
  const [a, b] = await Promise.all(["000001", "000002"].map((id) => stat(genPfad(basis, id, "konten.json"))));
  assert.notEqual(a.ino, b.ino);
  const [c, d] = await Promise.all(["000001", "000002"].map((id) => stat(genPfad(basis, id, "transaktionen.jsonl"))));
  assert.equal(c.ino, d.ino);
  assert.ok((await readFile(genPfad(basis, "000001", "konten.json"))).equals(vorher));
  assert.equal((b.mode & 0o222), 0);
  assert.deepEqual(await alleGenerationenHeil(basis), []);
});

test("A: Ein In-place-Schreibversuch auf eine veroeffentlichte Datei scheitert", async () => {
  const basis = await bestand();
  await assert.rejects(writeFile(genPfad(basis, "000001", "konten.json"), "[]"), { code: "EACCES" });
});

test("A: Werkzeugfehler oder Pruefungsfehler veroeffentlichen nichts", async () => {
  const basis = await bestand();
  await assert.rejects(mitSchreiber(basis, async (tx) => {
    await tx.schreibe("konten.json", "[]\n");
    throw new Error("Werkzeug kaputt");
  }), /Werkzeug kaputt/);
  assert.equal(await aktuelleId(basis), "000001");
  const bekannt = new Set(validateMasterData(await loadMasterData(pathToFileURL(`${genPfad(basis, "000001", "")}${path.sep}`))).errors);
  const r = await mitSchreiber(basis, async (tx) => {
    const t = (await tx.lies("transaktionen.jsonl")).split("\n");
    t[0] = t[0].replace('"KTO-001"', '"KTO-999"');
    await tx.schreibe("transaktionen.jsonl", t.join("\n"));
  }, { pruefe: validatorPruefung(bekannt) });
  assert.equal(r.verworfen, true);
  assert.ok(r.fehler.some((f) => f.includes("KTO-999")), r.fehler.join("\n"));
  assert.equal(await aktuelleId(basis), "000001");
  assert.deepEqual(await reste(basis), []);
});

test("A: Aufraeumen behaelt N Generationen und keine mit lebendem Leser; Undo", async () => {
  const basis = await bestand();
  const leser = await oeffneLeser(basis); // haelt 000001 fest
  for (let i = 0; i < 4; i += 1) {
    await mitSchreiber(basis, async (tx) => tx.schreibe("farben.json", `{"n":${i}}\n`), { behalten: 1 });
  }
  assert.deepEqual(await veroeffentlichteIds(basis), ["000001", "000004", "000005"]);
  assert.equal(await leser.lies("farben.json"), await readFile(path.join(DEMO, "farben.json"), "utf8"));
  await leser.schliessen();
  await mitSchreiber(basis, async (tx) => tx.schreibe("farben.json", "{\"n\":9}\n"), { behalten: 1 });
  assert.deepEqual(await veroeffentlichteIds(basis), ["000005", "000006"]);
  const u = await rueckgaengig(basis, { behalten: 1 });
  assert.equal(u.id, "000007");
  assert.equal(await mitLeser(basis, (l) => l.lies("farben.json")), "{\"n\":3}\n");
});

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
  test(`A: Kill bei ${schritt} -> ${sichtbar ? "neuer" : "alter"} Stand vollstaendig, Wiederanlauf sauber`, async () => {
    const basis = await bestand();
    // Vier Generationen vorweg, damit das Aufraeumen (behalten 3) etwas zu tun hat.
    assert.equal((await lauf(["a", basis, "schreibe", "4", "vor"])).code, 0);
    const vorher = await liesStand("a", basis);
    const r = await lauf(["a", basis, "schreibe", "1", "kill"], { E1_HALT: schritt });
    assert.equal(r.signal, "SIGKILL", r.err);
    const danach = await liesStand("a", basis);
    assert.equal(danach.ok, true);
    assert.equal(danach.buchungen, vorher.buchungen + (sichtbar ? 1 : 0));
    // Verwaiste Sperre (toter Prozess) wird uebernommen, Reste weggeraeumt.
    assert.equal((await lauf(["a", basis, "schreibe", "1", "nach"])).code, 0);
    const ende = await liesStand("a", basis);
    assert.equal(ende.ok, true);
    assert.equal(ende.buchungen, danach.buchungen + 1);
    assert.deepEqual(await reste(basis), []);
    assert.deepEqual(await alleGenerationenHeil(basis), []);
  });
}

test("A: Kill zu zufaelligen Zeitpunkten (20 Runden) laesst nie einen halben Stand zurueck", async () => {
  const basis = await bestand();
  let letzte = 0;
  for (let runde = 0; runde < 20; runde += 1) {
    const { kind, fertig } = starte(["a", basis, "endlos", `r${runde}`]);
    await warte(20 + Math.floor(Math.random() * 150));
    kind.kill("SIGKILL");
    await fertig;
    const s = await liesStand("a", basis);
    assert.equal(s.ok, true, JSON.stringify(s));
    assert.ok(s.buchungen >= letzte);
    letzte = s.buchungen;
  }
  assert.equal((await lauf(["a", basis, "schreibe", "1", "ende"])).code, 0);
  assert.deepEqual(await reste(basis), []);
  assert.deepEqual(await alleGenerationenHeil(basis), []);
});

test("A: Zwei Schreibprozesse und ein Leser gleichzeitig: nichts verloren, nie inkonsistent", async () => {
  const basis = await bestand();
  const leser = starte(["a", basis, "lies", "2500"]);
  const [x, y] = await Promise.all([lauf(["a", basis, "schreibe", "25", "x"]), lauf(["a", basis, "schreibe", "25", "y"])]);
  assert.equal(x.code, 0, x.err);
  assert.equal(y.code, 0, y.err);
  const befund = JSON.parse((await leser.fertig).out);
  assert.equal(befund.verletzt, 0, JSON.stringify(befund));
  assert.ok(befund.lesungen > 10);
  const s = await liesStand("a", basis);
  assert.equal(s.buchungen, 50);
  assert.equal(s.ok, true);
});

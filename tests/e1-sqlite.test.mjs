// Prototyp E1, Variante B (SQLite ueber node:sqlite): Rundweg, Constraints,
// Transaktionen mit echten Prozessen.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { DB_DATEI, exportiere, exportiereInhalte, importiere, integritaet, ladeSammlungen, mitSchreiber, oeffneDb, revision, schnappschuss, sichere } from "../prototyp/e1/sqlite-bestand.mjs";
import { vergleicheOrdner } from "../prototyp/e1/rundweg.mjs";
import { pruefeInvariante, testBuchung } from "../prototyp/e1/arbeiter.mjs";
import { loadMasterData, validateMasterData } from "../app/tools/validator.mjs";
import { DEMO, lauf, starte, tempOrdner, warte } from "./e1-hilfen.mjs";

async function bestand() {
  const ordner = path.join(await tempOrdner("e1b-"), "bestand");
  await mkdir(ordner, { recursive: true });
  const db = oeffneDb(path.join(ordner, DB_DATEI));
  await importiere(db, DEMO);
  db.close();
  return ordner;
}

const mitDb = (ordner, fn) => {
  const db = oeffneDb(path.join(ordner, DB_DATEI));
  try {
    return fn(db);
  } finally {
    db.close();
  }
};

const standB = (ordner) => mitDb(ordner, (db) => schnappschuss(db, () => {
  const d = ladeSammlungen(db, ["transaktionen", "agent_log"]);
  return pruefeInvariante(d.transaktionen, d.agent_log);
}));

test("B: Rundweg JSON -> DB -> JSON verlustfrei (byte- bzw. feldgleich), zweiter Rundweg byte-gleich", async () => {
  const ordner = await bestand();
  const aus = path.join(ordner, "export1");
  await mitDb(ordner, (db) => exportiere(db, aus));
  const v = await vergleicheOrdner(DEMO, aus);
  assert.deepEqual(v.abweichung, []);
  assert.ok(v.byte.includes("transaktionen.jsonl"));
  assert.ok(v.byte.includes("README.md"));
  assert.deepEqual(v.zahlen, {}); // keine Zahl-Schreibweise geht verloren
  // Export wieder importieren und exportieren: jetzt alles byte-gleich.
  const ordner2 = path.join(ordner, "zwei");
  await mkdir(ordner2);
  const db2 = oeffneDb(path.join(ordner2, DB_DATEI));
  await importiere(db2, aus);
  await exportiere(db2, path.join(ordner2, "export2"));
  db2.close();
  const w = await vergleicheOrdner(aus, path.join(ordner2, "export2"));
  assert.deepEqual([w.feld, w.abweichung], [[], []]);
  // Der exportierte Stand ist fuer den heutigen Validator derselbe Bestand.
  const a = validateMasterData(await loadMasterData(pathToFileURL(DEMO)));
  const b = validateMasterData(await loadMasterData(pathToFileURL(`${aus}/`)));
  assert.deepEqual(b.errors, a.errors);
});

test("B: Constraints weisen ab: unbekanntes Konto, Betrag als Zahl, doppelte ID; nichts committed", async () => {
  const ordner = await bestand();
  const rev = mitDb(ordner, revision);
  const falsch = [
    ["Fremdschluessel", { ...testBuchung("c", 1), konto_id: "KTO-999" }, /FOREIGN KEY/],
    ["Betrag als Zahl", { ...testBuchung("c", 2), betrag: -1.23 }, /CHECK|betrag/i],
    ["doppelte ID", { ...testBuchung("c", 3), transaktion_id: "TXN-00000000-0000-4000-8000-000000000001" }, /UNIQUE/],
  ];
  for (const [, buchung, fehler] of falsch) {
    await assert.rejects(mitSchreiber(ordner, (tx) => {
      tx.fuegeHinzu("agent_log", { anlass: "e1-test", betroffene_ids: [buchung.transaktion_id] });
      tx.fuegeHinzu("transaktionen", buchung);
    }), fehler);
  }
  assert.equal(mitDb(ordner, revision), rev);
  assert.equal(mitDb(ordner, (db) => ladeSammlungen(db, ["agent_log"]).agent_log.length), 1);
  assert.deepEqual(mitDb(ordner, integritaet), { integrity: ["ok"], fremdschluessel: [] });
});

test("B: Werkzeugfehler und Validator-Pruefung in der Transaktion: ROLLBACK", async () => {
  const ordner = await bestand();
  await assert.rejects(mitSchreiber(ordner, (tx) => {
    tx.ersetze("konten", []);
    throw new Error("Werkzeug kaputt");
  }), /Werkzeug kaputt/);
  assert.equal(mitDb(ordner, (db) => ladeSammlungen(db, ["konten"]).konten.length), 6);
  const bekannt = new Set(validateMasterData(await loadMasterData(pathToFileURL(DEMO))).errors);
  const r = await mitSchreiber(ordner, (tx) => {
    const k = tx.lies("kategorien");
    tx.ersetze("kategorien", k.map((x, i) => (i === 0 ? { ...x, typ: "quatsch" } : x)));
  }, { pruefe: (daten) => validateMasterData(daten).errors.filter((f) => !bekannt.has(f)) });
  assert.equal(r.verworfen, true);
  assert.ok(r.fehler.length > 0);
  assert.equal(mitDb(ordner, (db) => ladeSammlungen(db, ["kategorien"]).kategorien[0].typ), "einnahme");
});

const SCHRITTE = [
  ["begonnen", false],
  ["halb", false],
  ["vor-pruefung", false],
  ["vor-commit", false],
  ["nach-commit", true],
];

for (const [schritt, sichtbar] of SCHRITTE) {
  test(`B: Kill bei ${schritt} -> ${sichtbar ? "neuer" : "alter"} Stand vollstaendig, Wiederanlauf sauber`, async () => {
    const ordner = await bestand();
    assert.equal((await lauf(["b", ordner, "schreibe", "2", "vor"])).code, 0);
    const vorher = standB(ordner);
    const r = await lauf(["b", ordner, "schreibe", "1", "kill"], { E1_HALT: schritt });
    assert.equal(r.signal, "SIGKILL", r.err);
    const danach = standB(ordner);
    assert.equal(danach.ok, true);
    assert.equal(danach.buchungen, vorher.buchungen + (sichtbar ? 1 : 0));
    assert.deepEqual(mitDb(ordner, integritaet), { integrity: ["ok"], fremdschluessel: [] });
    assert.equal((await lauf(["b", ordner, "schreibe", "1", "nach"])).code, 0);
    assert.equal(standB(ordner).buchungen, danach.buchungen + 1);
  });
}

test("B: Kill beim Import (vor COMMIT) laesst die alte DB unberuehrt", async () => {
  const ordner = await bestand();
  const { spawnSync } = await import("node:child_process");
  const skript = `import { oeffneDb, importiere } from ${JSON.stringify(new URL("../prototyp/e1/sqlite-bestand.mjs", import.meta.url).href)};
    const db = oeffneDb(${JSON.stringify(path.join(ordner, DB_DATEI))}); await importiere(db, ${JSON.stringify(path.join(ordner, "leer"))});`;
  await mkdir(path.join(ordner, "leer"));
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", skript], { env: { ...process.env, E1_HALT: "import-vor-commit" } });
  assert.equal(r.signal, "SIGKILL", String(r.stderr));
  assert.equal(mitDb(ordner, (db) => ladeSammlungen(db, ["transaktionen"]).transaktionen.length), 675);
});

test("B: Kill zu zufaelligen Zeitpunkten (20 Runden) laesst nie einen halben Stand zurueck", async () => {
  const ordner = await bestand();
  let letzte = 0;
  for (let runde = 0; runde < 20; runde += 1) {
    const { kind, fertig } = starte(["b", ordner, "endlos", `r${runde}`]);
    await warte(20 + Math.floor(Math.random() * 150));
    kind.kill("SIGKILL");
    await fertig;
    const s = standB(ordner);
    assert.equal(s.ok, true, JSON.stringify(s));
    assert.ok(s.buchungen >= letzte);
    letzte = s.buchungen;
    assert.deepEqual(mitDb(ordner, integritaet).integrity, ["ok"]);
  }
});

test("B: Zwei Schreibprozesse und ein Leser gleichzeitig: nichts verloren, nie inkonsistent", async () => {
  const ordner = await bestand();
  const leser = starte(["b", ordner, "lies", "2500"]);
  const [x, y] = await Promise.all([lauf(["b", ordner, "schreibe", "25", "x"]), lauf(["b", ordner, "schreibe", "25", "y"])]);
  assert.equal(x.code, 0, x.err);
  assert.equal(y.code, 0, y.err);
  const befund = JSON.parse((await leser.fertig).out);
  assert.equal(befund.verletzt, 0, JSON.stringify(befund));
  assert.ok(befund.lesungen > 10);
  assert.equal(standB(ordner).buchungen, 50);
});

test("B: Export und Sicherung waehrend laufender Schreiber kommen aus einem Stand", async () => {
  const ordner = await bestand();
  const schreiber = starte(["b", ordner, "schreibe", "30", "s"]);
  const db = oeffneDb(path.join(ordner, DB_DATEI));
  let exporte = 0;
  while (schreiber.kind.exitCode === null) {
    const { dateien } = exportiereInhalte(db);
    const zeilen = (name) => dateien.get(name).toString("utf8").split("\n").filter(Boolean).map((z) => JSON.parse(z));
    assert.equal(pruefeInvariante(zeilen("transaktionen.jsonl"), zeilen("agent_log.jsonl")).ok, true);
    exporte += 1;
    await warte(5);
  }
  const ziel = path.join(ordner, "sicherung.sqlite");
  sichere(db, ziel);
  db.close();
  assert.ok(exporte > 3);
  assert.equal((await schreiber.fertig).code, 0);
  const kopie = oeffneDb(ziel);
  assert.equal(schnappschuss(kopie, () => pruefeInvariante(ladeSammlungen(kopie, ["transaktionen"]).transaktionen, ladeSammlungen(kopie, ["agent_log"]).agent_log)).buchungen, 30);
  kopie.close();
});

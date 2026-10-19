// Verlauf und Rueckgaengig (E1 Schritt 6, ADR 0035): Bibliothek, CLIs und
// MCP-Tools auf einem Bestand mit Generationen; im einfachen Ordner eine klare
// Meldung. Temp-Verzeichnisse, erfundene Demodaten.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  aktuelleId, einrichten, generationsOrdner, liesEinstellungen, mitLeser, mitSchreiber, oeffneGeneration,
  OhneVerlauf, pruefeGeneration, rueckgaengig, rueckgaengigZiel, setzeBehalten, veroeffentlichteIds,
} from "../app/tools/lib/generationen.mjs";
import { liesVerlauf, vergleicheDatensaetze, vergleicheGenerationen } from "../app/tools/lib/verlauf.mjs";
import { legeAbzugAn, starteServer } from "./mcp-hilfe.mjs";

const DEMO = fileURLToPath(new URL("../app/data/demo/", import.meta.url));
const TOOLS = fileURLToPath(new URL("../app/tools/", import.meta.url));
const TXN = "TXN-00000000-0000-4000-8000-000000000001";

async function bestand() {
  const basis = path.join(await mkdtemp(path.join(tmpdir(), "verlauf-")), "bestand");
  await einrichten(basis, DEMO);
  return basis;
}

// Erste Buchung aendern, die letzten zwei entfernen, eine neue Regel anhaengen.
async function aendere(basis, wer = "test.mjs") {
  return mitSchreiber(basis, async (tx) => {
    const zeilen = (await tx.lies("transaktionen.jsonl")).trimEnd().split("\n");
    const erste = JSON.parse(zeilen[0]);
    erste.verwendungszweck = "geaendert im Test";
    zeilen[0] = JSON.stringify(erste);
    await tx.schreibe("transaktionen.jsonl", `${zeilen.slice(0, -2).join("\n")}\n`);
    await tx.schreibe("farben.json", "{}\n");
  }, { wer });
}

const letzteIds = async (basis, n) => (await readFile(path.join(generationsOrdner(basis, "000001"), "transaktionen.jsonl"), "utf8"))
  .trimEnd().split("\n").slice(-n).map((z) => JSON.parse(z).transaktion_id);

function cli(skript, args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(TOOLS, skript), ...args], (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout, stderr });
    });
  });
}

test("Datensatz-Vergleich: ueber die Id, ohne Id als Mehrfachmenge", () => {
  const d = vergleicheDatensaetze(
    [{ a_id: "1", x: 1 }, { a_id: "2", x: 1 }, { z: 1 }, { z: 1 }],
    [{ a_id: "1", x: 2 }, { a_id: "3", x: 1 }, { z: 1 }, { z: 2 }],
  );
  assert.deepEqual(d, { neu: 2, geaendert: 1, entfernt: 2, ids: { neu: ["3"], geaendert: ["1"], entfernt: ["2"] } });
});

test("Manifest nennt das ausloesende Werkzeug; Verlauf mit Kurzfassung und Wiederherstellung", async () => {
  const basis = await bestand();
  await aendere(basis);
  const diff = await vergleicheGenerationen(basis, "000001", "000002");
  assert.deepEqual(diff.map((d) => [d.datei, d.art]), [["farben.json", "geaendert"], ["transaktionen.jsonl", "geaendert"]]);
  const txn = diff[1].datensaetze;
  assert.deepEqual([txn.neu, txn.geaendert, txn.entfernt], [0, 1, 2]);
  assert.deepEqual(txn.ids.geaendert, [TXN]);
  assert.deepEqual(txn.ids.entfernt.sort(), (await letzteIds(basis, 2)).sort());
  assert.equal(diff[0].datensaetze, undefined, "farben.json ist ein Objekt, keine Datensaetze");

  const u = await rueckgaengig(basis, { wer: "rueckgaengig-test" });
  assert.equal(u.id, "000003");
  assert.equal(u.ziel, "000001");
  const v = await liesVerlauf(basis, { anzahl: 2 });
  assert.equal(v.aktuell, "000003");
  assert.equal(v.behalten, 10);
  assert.equal(v.aufbewahrt, 3);
  assert.deepEqual(v.eintraege.map((e) => [e.id, e.wer, e.wiederherstellung, e.aktuell]), [
    ["000003", "rueckgaengig-test", true, true],
    ["000002", "test.mjs", false, false],
  ]);
  assert.equal(v.eintraege[0].quelle, "000001");
  assert.deepEqual(v.eintraege[0].aenderungen.find((a) => a.datei === "transaktionen.jsonl").datensaetze.ids.neu.sort(), (await letzteIds(basis, 2)).sort());
  // Aelteste Generation ohne Vorgaenger: kein Vergleich.
  assert.equal((await liesVerlauf(basis, { anzahl: 5 })).eintraege.at(-1).aenderungen, null);
  // Keine Generation geloescht, alle heil, Leases wieder weg.
  assert.deepEqual(await veroeffentlichteIds(basis), ["000001", "000002", "000003"]);
  for (const id of await veroeffentlichteIds(basis)) {
    assert.deepEqual(await pruefeGeneration(basis, id), []);
    assert.deepEqual((await readdir(generationsOrdner(basis, id))).filter((n) => n.startsWith(".leser-")), []);
  }
});

test("rueckgaengig: Ziel per Id, gleicher Inhalt legt keine Generation an, Undo des Undo", async () => {
  const basis = await bestand();
  await aendere(basis);
  await mitSchreiber(basis, (tx) => tx.schreibe("farben.json", "{\"n\":2}\n"));
  assert.equal(await rueckgaengigZiel(basis), "000002");
  assert.equal(await rueckgaengigZiel(basis, { schritte: 2 }), "000001");
  assert.equal(await rueckgaengigZiel(basis, { ziel: "G000001" }), "000001");
  await assert.rejects(rueckgaengigZiel(basis, { ziel: "G000003" }), /aktuelle Stand/);
  await assert.rejects(rueckgaengigZiel(basis, { ziel: "G000009" }), /keine Generation G000009/);
  await assert.rejects(rueckgaengigZiel(basis, { schritte: 3 }), /keine Generation 3 Schritt/);

  const r = await rueckgaengig(basis, { ziel: "000001" });
  assert.equal(r.id, "000004");
  assert.equal(await mitLeser(basis, (l) => l.lies("farben.json")), await readFile(path.join(DEMO, "farben.json"), "utf8"));
  // Gleicher Inhalt wie aktuell (G000001 == G000004): keine neue Generation.
  const gleich = await rueckgaengig(basis, { ziel: "000001" });
  assert.equal(gleich.id, "000004");
  assert.deepEqual(gleich.geaendert, []);
  // Undo des Undo.
  const zurueck = await rueckgaengig(basis, { ziel: "000003" });
  assert.equal(zurueck.id, "000005");
  assert.equal(await mitLeser(basis, (l) => l.lies("farben.json")), "{\"n\":2}\n");
  // Fingerabdruck: falscher Stand wird abgewiesen.
  await assert.rejects(rueckgaengig(basis, { erwartet: "000004" }), { name: "StandVeraltet" });
  assert.equal(await aktuelleId(basis), "000005");
});

test("rueckgaengig: neue Validatorfehler verhindern die Uebernahme", async () => {
  const basis = await bestand();
  await aendere(basis);
  const r = await rueckgaengig(basis, { pruefe: async () => ["neuer Fehler"] });
  assert.equal(r.verworfen, true);
  assert.equal(await aktuelleId(basis), "000002");
  assert.deepEqual(await veroeffentlichteIds(basis), ["000001", "000002"]);
});

test("behalten aus EINSTELLUNGEN.json; nur im Generationsmodus", async () => {
  const basis = await bestand();
  assert.equal((await liesEinstellungen(basis)).behalten, 10);
  await setzeBehalten(basis, 1);
  assert.equal((await liesEinstellungen(basis)).behalten, 1);
  for (let i = 0; i < 3; i += 1) await mitSchreiber(basis, (tx) => tx.schreibe("farben.json", `{"n":${i}}\n`));
  assert.deepEqual(await veroeffentlichteIds(basis), ["000003", "000004"]);
  // Die Option schlaegt die Einstellung.
  await mitSchreiber(basis, (tx) => tx.schreibe("farben.json", "{\"n\":9}\n"), { behalten: 5 });
  assert.deepEqual(await veroeffentlichteIds(basis), ["000003", "000004", "000005"]);
  await assert.rejects(setzeBehalten(basis, -1), /ganze Zahl/);
  // Unlesbare Einstellungen: geschrieben wird, aufgeraeumt nicht; reparierbar.
  await writeFile(path.join(basis, "EINSTELLUNGEN.json"), "{kaputt");
  const w = await mitSchreiber(basis, (tx) => tx.schreibe("farben.json", "{}\n"));
  assert.equal(w.id, "000006");
  assert.match(w.warnung, /kein gueltiges JSON/);
  assert.deepEqual(await veroeffentlichteIds(basis), ["000003", "000004", "000005", "000006"]);
  await writeFile(path.join(basis, "EINSTELLUNGEN.json"), "null");
  await assert.rejects(liesEinstellungen(basis), /kein JSON-Objekt/);
  await setzeBehalten(basis, 2);
  assert.equal((await liesEinstellungen(basis)).behalten, 2);

  const ordner = path.join(await mkdtemp(path.join(tmpdir(), "verlauf-ordner-")), "m");
  await cp(DEMO, ordner, { recursive: true });
  await assert.rejects(setzeBehalten(ordner, 3), OhneVerlauf);
  await assert.rejects(liesVerlauf(ordner), /Verlauf erst nach Umstellung verfuegbar/);
  await assert.rejects(oeffneGeneration(ordner, "000001"), OhneVerlauf);
});

test("CLIs: Vorschau mit Diff und IDs, Schreiben mit Fingerabdruck, veraltet = Exitcode 4", async () => {
  const wurzel = await mkdtemp(path.join(tmpdir(), "verlauf-cli-"));
  const basis = path.join(wurzel, "master.gen");
  await einrichten(basis, DEMO);
  await symlink(path.join("master.gen", "aktuell"), path.join(wurzel, "master"));
  const datenroot = path.join(wurzel, "master");
  await aendere(basis);

  const v = await cli("rueckgaengig.mjs", [datenroot]);
  assert.equal(v.code, 0, v.stderr);
  assert.match(v.stdout, /Wiederhergestellt wuerde: G000001/);
  assert.match(v.stdout, /transaktionen\.jsonl: 2 neu, 1 geaendert/);
  assert.match(v.stdout, new RegExp(`geaendert: ${TXN}`));
  assert.match(v.stdout, /Fingerabdruck: G000002/);
  assert.equal(await aktuelleId(basis), "000002", "Vorschau schreibt nichts");
  const ohne = await cli("rueckgaengig.mjs", [datenroot, "--schreiben"]);
  assert.equal(ohne.code, 1);
  assert.match(ohne.stderr, /nur mit dem Fingerabdruck/);
  assert.equal((await cli("rueckgaengig.mjs", [datenroot, "--schritte=1", "--ziel=G000001"])).code, 1);

  const s = await cli("rueckgaengig.mjs", [datenroot, "--schreiben", "--fingerabdruck=G000002"]);
  assert.equal(s.code, 0, s.stderr);
  assert.match(s.stdout, /jetzt der neue Stand G000003/);
  assert.match(s.stdout, /Validator: gueltig/);
  const alt = await cli("rueckgaengig.mjs", [datenroot, "--schreiben", "--fingerabdruck=G000002"]);
  assert.equal(alt.code, 4);
  assert.equal(await aktuelleId(basis), "000003");

  const verlauf = await cli("verlauf.mjs", [datenroot, "--anzahl=2"]);
  assert.equal(verlauf.code, 0, verlauf.stderr);
  assert.match(verlauf.stdout, /G000003 \(aktuell\) .* rueckgaengig\.mjs, stellt G000001 wieder her/);
  assert.match(verlauf.stdout, /transaktionen\.jsonl \(\+2 ~1\)/);
  assert.match(verlauf.stdout, /G000002 .* test\.mjs/);
  const json = JSON.parse((await cli("verlauf.mjs", [datenroot, "--json"])).stdout);
  assert.equal(json.eintraege.length, 3);

  const vorschau = await cli("verlauf.mjs", [datenroot, "--behalten=3"]);
  assert.match(vorschau.stdout, /Vorschau.*10 -> 3/);
  assert.equal((await liesEinstellungen(basis)).behalten, 10);
  assert.equal((await cli("verlauf.mjs", [datenroot, "--behalten=3", "--schreiben"])).code, 0);
  assert.equal((await liesEinstellungen(basis)).behalten, 3);

  const ordner = path.join(wurzel, "ordner");
  await cp(DEMO, ordner, { recursive: true });
  for (const skript of ["verlauf.mjs", "rueckgaengig.mjs"]) {
    const r = await cli(skript, [ordner]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /Verlauf erst nach Umstellung verfuegbar/);
  }
  await rm(wurzel, { recursive: true, force: true });
});

test("MCP: verlauf und rueckgaengig mit Fingerabdruck; einfacher Ordner meldet sich klar", async () => {
  const abzug = legeAbzugAn();
  try {
    await rm(abzug.master, { recursive: true, force: true });
    await einrichten(path.join(abzug.app, "data", "master.gen"), DEMO);
    await symlink(path.join("master.gen", "aktuell"), abzug.master);
    const s = starteServer(abzug, "schreiben");
    try {
      await s.anfrage("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
      const namen = (await s.anfrage("tools/list")).result.tools.map((t) => t.name);
      assert.ok(namen.includes("verlauf") && namen.includes("rueckgaengig"));

      const w = await s.werkzeug("datei_schreiben", { pfad: "data/master/farben.json", inhalt: "{}\n", schreiben: true });
      assert.ok(!w.isError, w.text);
      const verlauf = await s.werkzeug("verlauf", {});
      assert.ok(!verlauf.isError, verlauf.text);
      assert.match(verlauf.text, /G000002 \(aktuell\) .* MCP datei_schreiben/);

      const vorschau = await s.werkzeug("rueckgaengig", {});
      assert.ok(!vorschau.isError, vorschau.text);
      assert.match(vorschau.text, /farben\.json: Inhalt geaendert/);
      assert.match(vorschau.text, /Fingerabdruck: G000002/);
      assert.equal((vorschau.text.match(/Fingerabdruck:/g) ?? []).length, 1);

      const beides = await s.werkzeug("rueckgaengig", { schritte: 1, ziel: "G000001" });
      assert.ok(beides.isError);
      assert.match((await s.werkzeug("rueckgaengig", { schreiben: true })).text, /nur mit dem Fingerabdruck/);
      const alt = await s.werkzeug("rueckgaengig", { schreiben: true, fingerabdruck: "G000001" });
      assert.ok(alt.isError);
      assert.match(alt.text, /seit der Vorschau geaendert/);
      const r = await s.werkzeug("rueckgaengig", { schreiben: true, fingerabdruck: "G000002" });
      assert.ok(!r.isError, r.text);
      assert.match(r.text, /neue Stand G000003/);
      assert.match((await s.werkzeug("verlauf", { anzahl: 1 })).text, /G000003 \(aktuell\) .* MCP rueckgaengig, stellt G000001 wieder her/);
    } finally {
      await s.beenden();
    }

    const lesen = starteServer(abzug, "lesen");
    try {
      await lesen.anfrage("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
      const namen = (await lesen.anfrage("tools/list")).result.tools.map((t) => t.name);
      assert.ok(namen.includes("verlauf") && !namen.includes("rueckgaengig"), "rueckgaengig nur mit --recht=schreiben");
    } finally {
      await lesen.beenden();
    }

    // Einfacher Ordner: klare Meldung, kein Fehlerstapel.
    await rm(abzug.master);
    await cp(DEMO, abzug.master, { recursive: true });
    const o = starteServer(abzug, "schreiben");
    try {
      await o.anfrage("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
      for (const name of ["verlauf", "rueckgaengig"]) {
        const r = await o.werkzeug(name, {});
        assert.ok(r.isError);
        assert.match(r.text, /Verlauf erst nach Umstellung verfuegbar/);
      }
    } finally {
      await o.beenden();
    }
  } finally {
    abzug.aufraeumen();
  }
});

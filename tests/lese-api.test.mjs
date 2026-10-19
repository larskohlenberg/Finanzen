// Schmale Lese-APIs (E1 Schritt 8): GET /api/v1/transaktionen und
// /api/v1/regelwirkung ueber den App-Server. Temp-Verzeichnis mit Kopien des
// erfundenen Demo-Bestands; Echt bekommt eine eigene Buchung, damit die
// Trennung Demo/Echt sichtbar ist.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import http from "node:http";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../app/server.mjs";
import { transaktionenParameter } from "../app/lese-api.mjs";

const DEMO = new URL("../app/data/demo/", import.meta.url);
const NUR_ECHT = "TXN-00000000-0000-4000-8000-00000000e001";
let wurzel;
let server;
let port;
let demoTransaktionen;

before(async () => {
  wurzel = await mkdtemp(join(tmpdir(), "lese-api-"));
  const app = join(wurzel, "app");
  await mkdir(join(app, "data"), { recursive: true });
  await writeFile(join(app, "index.html"), "<!doctype html><title>t</title>");
  await cp(DEMO, join(app, "data", "master"), { recursive: true });
  await cp(DEMO, join(app, "data", "demo"), { recursive: true });
  const zeilen = (await readFile(join(app, "data", "demo", "transaktionen.jsonl"), "utf8")).trim().split("\n").map((z) => JSON.parse(z));
  demoTransaktionen = zeilen;
  const extra = { ...zeilen[0], transaktion_id: NUR_ECHT, dedupe_hash: "lese-api-echt-1", gegenpartei: "Nur im Echtbestand", betrag: "-1.23" };
  await writeFile(join(app, "data", "master", "transaktionen.jsonl"), `${[...zeilen, extra].map((z) => JSON.stringify(z)).join("\n")}\n`);
  server = createAppServer({ appDir: app, inboxDir: join(wurzel, "inbox"), log: () => {} });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(wurzel, { recursive: true, force: true });
});

function hole(pfad, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: pfad, method }, (res) => {
      const teile = [];
      res.on("data", (t) => teile.push(t));
      res.on("end", () => {
        const text = Buffer.concat(teile).toString("utf8");
        resolve({ status: res.statusCode, headers: res.headers, json: () => JSON.parse(text) });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

test("Transaktionen: eine Seite mit Kennzahlen des Filters, nur Buchungsdaten, no-store", async () => {
  const res = await hole("/api/v1/transaktionen?quelle=demo&groesse=20");
  assert.equal(res.status, 200);
  assert.match(res.headers["cache-control"], /no-store/);
  const a = res.json();
  assert.match(a.stand, /^[0-9a-f]{24}$/);
  assert.equal(a.gesamt, demoTransaktionen.length);
  assert.equal(a.treffer, demoTransaktionen.length);
  assert.equal(a.zeilen.length, 20);
  assert.equal(a.seiten, Math.ceil(demoTransaktionen.length / 20));
  assert.ok(a.monate.length > 0 && a.jahre.length > 0);
  // Datenschutz: nur Buchungen der Seite, keine anderen Sammlungen des Bestands.
  assert.deepEqual(Object.keys(a).sort(), ["auswahl", "gesamt", "groesse", "jahre", "monate", "offen", "saldo_cent", "seite", "seiten", "stand", "treffer", "zeilen"].sort());
  for (const tx of a.zeilen) assert.ok("gegenbuchung" in tx);
});

test("Transaktionen: Demo und Echt getrennt", async () => {
  const echt = (await hole(`/api/v1/transaktionen?search=${NUR_ECHT}`)).json();
  const demo = (await hole(`/api/v1/transaktionen?quelle=demo&search=${NUR_ECHT}`)).json();
  assert.equal(echt.treffer, 1);
  assert.equal(demo.treffer, 0);
  assert.equal(echt.gesamt, demo.gesamt + 1);
});

test("Transaktionen: Seite begrenzt, Sprung zur Buchung, Auswahl nur im Filter", async () => {
  const letzte = demoTransaktionen.length;
  const zuWeit = (await hole("/api/v1/transaktionen?quelle=demo&seite=99999")).json();
  assert.equal(zuWeit.seite, zuWeit.seiten);

  // Aelteste Buchung: bei absteigendem Datum auf der letzten Seite.
  const sortiert = [...demoTransaktionen].sort((a, b) => (a.buchungsdatum + a.transaktion_id).localeCompare(b.buchungsdatum + b.transaktion_id));
  const aelteste = sortiert[0].transaktion_id;
  const sprung = (await hole(`/api/v1/transaktionen?quelle=demo&zeige=${aelteste}&auswahl=${aelteste}`)).json();
  assert.equal(sprung.seite, Math.ceil(letzte / 10));
  assert.ok(sprung.zeilen.some((tx) => tx.transaktion_id === aelteste));
  assert.equal(sprung.auswahl.transaktion.transaktion_id, aelteste);
  assert.ok("regelzahlung" in sprung.auswahl && "vorsorge" in sprung.auswahl && "immobilie" in sprung.auswahl);

  const ausserhalb = (await hole(`/api/v1/transaktionen?quelle=demo&auswahl=${aelteste}&search=gibt-es-nicht-xyz`)).json();
  assert.equal(ausserhalb.treffer, 0);
  assert.equal(ausserhalb.auswahl, null);
});

test("Transaktionen: ungueltige Parameter geben 400, andere Methoden 405", async () => {
  for (const q of ["sort=boese", "dir=seitwaerts", "groesse=7", "seite=-1", `search=${"x".repeat(301)}`]) {
    const res = await hole(`/api/v1/transaktionen?quelle=demo&${q}`);
    assert.equal(res.status, 400, q);
    assert.match(res.json().grund, /^parameter: /);
  }
  assert.equal((await hole("/api/v1/transaktionen", "POST")).status, 405);
  assert.equal((await hole("/api/v1/gibt-es-nicht")).status, 404);
  assert.equal((await hole("/api/v1/../server.mjs")).status, 404);
});

test("transaktionenParameter: unbekannte Parameter werden ignoriert, Filter haben Defaults", () => {
  const p = transaktionenParameter(new URLSearchParams("account=KTO-001&unbekannt=1&timeMode="));
  assert.equal(p.filter.account, "KTO-001");
  assert.equal(p.filter.timeMode, "none");
  assert.equal(p.filter.quarter, "1");
  assert.equal("unbekannt" in p.filter, false);
  assert.deepEqual(p.sort, { key: "date", dir: "desc" });
});

test("Regelwirkung: Treffer je Regel, fuer eine Regel nur Datum, Gegenpartei und Id", async () => {
  const alle = (await hole("/api/v1/regelwirkung?quelle=demo")).json();
  const [regel, anzahl] = Object.entries(alle.anzahl)[0];
  assert.ok(anzahl > 0);
  const eine = (await hole(`/api/v1/regelwirkung?quelle=demo&regel=${regel}`)).json();
  assert.equal(eine.regel.anzahl, anzahl);
  for (const z of eine.regel.zeilen) assert.deepEqual(Object.keys(z).sort(), ["buchungsdatum", "gegenpartei", "transaktion_id"]);
});

test("Uebersicht: Kennzahlen der Kacheln ohne Rohlisten, Stichtag geprueft", async () => {
  const res = await hole("/api/v1/uebersicht?quelle=demo&heute=2026-10-19");
  assert.equal(res.status, 200);
  const a = res.json();
  assert.equal(a.heute, "2026-10-19");
  assert.deepEqual(Object.keys(a).sort(), ["absicherung", "fristen", "heute", "konten", "mittel", "plan", "stand", "vermoegen", "vorsorge", "zahlungen"]);
  // Datenschutz: keine Buchungslisten, Konten nur mit Id, Name und Wert.
  assert.equal(JSON.stringify(a).includes('"transaktion_id"'), false);
  for (const z of a.konten.zeilen) assert.deepEqual(Object.keys(z).sort(), ["konto_id", "name", "wert_cents"]);
  for (const r of a.vorsorge.renten) assert.deepEqual(Object.keys(r).sort(), ["name", "vorsorge_id", "wert_cents"]);
  assert.equal(typeof a.vermoegen.netto_cents, "number");
  for (const falsch of ["morgen", "2026-13-45", "2026-02-30", "0000-00-00"]) {
    assert.equal((await hole(`/api/v1/uebersicht?quelle=demo&heute=${falsch}`)).status, 400, falsch);
  }
  // Nur die Felder, die die Kacheln lesen: keine Einzelbuchungen der Sondereffekte, keine Monatsreihen.
  assert.deepEqual(Object.keys(a.mittel).sort(), ["anzahl_monate", "ausgaben", "bis", "einnahmen", "monate", "sparen", "von"]);
  assert.deepEqual(Object.keys(a.mittel.einnahmen).sort(), ["kategorien", "mittel_cents"]);
  // Demo und Echt: die zusaetzliche Echt-Buchung veraendert nur den Echtbestand.
  const echt = (await hole("/api/v1/uebersicht?heute=2026-10-19")).json();
  assert.notEqual(echt.stand, a.stand);
});

test("Kopfleiste: Zaehler und Aktionen; Prompt nennt den Bestand der Anfrage", async () => {
  const demo = (await hole("/api/v1/kopfleiste?quelle=demo&heute=2026-10-19")).json();
  assert.equal(typeof demo.offene_kategorien, "number");
  assert.equal(typeof demo.offene_checks, "number");
  assert.ok(Array.isArray(demo.aktionen));
  for (const aktion of demo.aktionen) assert.deepEqual(Object.keys(aktion).sort(), ["count", "label", "prompt", "type"]);
  const offen = demoTransaktionen.filter((tx) => tx.kategorisierung_status === "offen").length;
  assert.equal(demo.offene_kategorien, offen);
  if (demo.aktionen[0]?.prompt) assert.match(demo.aktionen[0].prompt, /data\/demo/);
  const echt = (await hole("/api/v1/kopfleiste?heute=2026-10-19")).json();
  if (echt.aktionen[0]?.prompt) assert.match(echt.aktionen[0].prompt, /data\/master/);
});

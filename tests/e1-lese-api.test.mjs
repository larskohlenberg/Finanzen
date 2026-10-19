// Prototyp E1: schmale Lese-API je Ansicht, fuer beide Varianten gleich.
// Ergebnis muss dem entsprechen, was die heutige App aus dem vollen Bestand
// rechnet; nach einem Schreibvorgang ist der neue Stand sofort da.
import assert from "node:assert/strict";
import http from "node:http";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { einrichten, mitSchreiber as schreibeA } from "../prototyp/e1/generationen.mjs";
import { DB_DATEI, importiere, mitSchreiber as schreibeB, oeffneDb } from "../prototyp/e1/sqlite-bestand.mjs";
import { backendGenerationen, backendSqlite, kennzahl, leseHandler, ZEILEN_FELDER } from "../prototyp/e1/lese-api.mjs";
import { testBuchung } from "../prototyp/e1/arbeiter.mjs";
import { passt } from "../app/mcp/abfrage.mjs";
import { loadMasterData } from "../app/tools/validator.mjs";
import { DEMO, tempOrdner } from "./e1-hilfen.mjs";

const STICHTAG = "2026-10-19";

async function server(backend) {
  const s = http.createServer(leseHandler(backend));
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const basis = `http://127.0.0.1:${s.address().port}`;
  return {
    hol: async (pfad, kopf = {}) => {
      const res = await fetch(`${basis}${pfad}`, { headers: kopf });
      return { status: res.status, etag: res.headers.get("etag"), body: res.status === 200 ? await res.json() : null };
    },
    zu: () => new Promise((r) => s.close(r)),
  };
}

async function varianten() {
  const tmp = await tempOrdner("e1api-");
  const basisA = path.join(tmp, "a");
  await einrichten(basisA, DEMO);
  const ordnerB = path.join(tmp, "b");
  await mkdir(ordnerB);
  const db = oeffneDb(path.join(ordnerB, DB_DATEI));
  await importiere(db, DEMO);
  db.close();
  const neu = testBuchung("api", 1);
  return [
    { name: "A", backend: backendGenerationen(basisA), schreibe: () => schreibeA(basisA, async (tx) => tx.schreibe("transaktionen.jsonl", `${await tx.lies("transaktionen.jsonl")}${JSON.stringify(neu)}\n`)) },
    { name: "B", backend: backendSqlite(ordnerB), schreibe: () => schreibeB(ordnerB, (tx) => tx.fuegeHinzu("transaktionen", neu)) },
  ];
}

test("Lese-API: gefilterte Seite und Kennzahl wie aus dem vollen Bestand, beide Varianten gleich", async () => {
  const voll = await loadMasterData(pathToFileURL(DEMO));
  const erwartet = voll.transaktionen.filter((t) => passt(t, { konto: "KTO-001", von: "2024-01-01" }))
    .sort((a, b) => (a.buchungsdatum < b.buchungsdatum ? 1 : a.buchungsdatum > b.buchungsdatum ? -1 : 0));
  const antworten = [];
  for (const v of await varianten()) {
    const s = await server(v.backend);
    const seite = await s.hol("/api/v1/transaktionen?konto=KTO-001&von=2024-01-01&seite=2&groesse=20");
    assert.equal(seite.status, 200);
    assert.equal(seite.body.anzahl, erwartet.length);
    assert.deepEqual(seite.body.zeilen.map((z) => z.transaktion_id), erwartet.slice(20, 40).map((t) => t.transaktion_id), v.name);
    for (const z of seite.body.zeilen) assert.deepEqual(Object.keys(z).filter((k) => !ZEILEN_FELDER.includes(k)), []);
    const k = await s.hol(`/api/v1/kennzahlen?stichtag=${STICHTAG}`);
    assert.deepEqual({ ...k.body, stand: undefined, stichtag: undefined }, { ...kennzahl(voll, STICHTAG), stand: undefined, stichtag: undefined }, v.name);
    const text = await s.hol("/api/v1/transaktionen?text=gehalt&groesse=5");
    antworten.push({ seite: { ...seite.body, stand: 0 }, kennzahl: { ...k.body, stand: 0 }, text: { ...text.body, stand: 0 } });
    await s.zu();
    v.backend.schliessen?.();
  }
  assert.deepEqual(antworten[0], antworten[1]);
});

test("Lese-API: ETag spart unveraenderte Antworten; nach dem Schreiben sofort der neue Stand", async () => {
  for (const v of await varianten()) {
    const s = await server(v.backend);
    const erst = await s.hol("/api/v1/transaktionen?konto=KTO-001&groesse=1");
    assert.equal((await s.hol("/api/v1/transaktionen?konto=KTO-001&groesse=1", { "if-none-match": erst.etag })).status, 304, v.name);
    await v.schreibe();
    const dann = await s.hol("/api/v1/transaktionen?konto=KTO-001&groesse=1", { "if-none-match": erst.etag });
    assert.equal(dann.status, 200, v.name);
    assert.notEqual(dann.etag, erst.etag);
    assert.equal(dann.body.anzahl, erst.body.anzahl + 1);
    assert.equal(dann.body.zeilen[0].transaktion_id, "TXN-E1-api-00001");
    await s.zu();
    v.backend.schliessen?.();
  }
});

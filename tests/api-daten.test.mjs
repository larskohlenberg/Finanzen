// Browser-Cache der Lese-APIs (app/api-daten.mjs): Abruf einmal je Pfad,
// letzte Antwort solange der neue Pfad laedt, kein Endlos-Abruf bei Fehlern,
// Verwerfen bei neuem Stand.
import assert from "node:assert/strict";
import test from "node:test";
import { apiAbwarten } from "./hilfe-bestand.mjs";

const abrufe = [];
let fehlschlag = false;
globalThis.fetch = async (pfad, optionen) => {
  abrufe.push({ pfad, optionen });
  if (fehlschlag) return { ok: false, status: 500, json: async () => ({ grund: "bestand-unlesbar" }) };
  return { ok: true, status: 200, json: async () => ({ pfad }) };
};
const { beiApiAntwort, erstelleApiCache, leereApiCaches, verwerfeApiCaches } = await import("../app/api-daten.mjs");
let gezeichnet = 0;
beiApiAntwort(() => { gezeichnet += 1; });

test("einmal je Pfad, no-store, danach aus dem Cache; Zeichnen nach der Antwort", async () => {
  const cache = erstelleApiCache();
  assert.deepEqual(cache.hole("/a"), { antwort: null, laedt: true, fehler: null, veraltet: false });
  cache.hole("/a");
  await apiAbwarten();
  assert.equal(abrufe.filter((a) => a.pfad === "/a").length, 1);
  assert.deepEqual(abrufe[0].optionen, { cache: "no-store" });
  assert.equal(gezeichnet, 1);
  assert.deepEqual(cache.hole("/a").antwort, { pfad: "/a" });
  // Neuer Pfad: bis zur Antwort die letzte, als veraltet markiert.
  const zwischen = cache.hole("/b");
  assert.equal(zwischen.veraltet, true);
  assert.deepEqual(zwischen.antwort, { pfad: "/a" });
});

test("Fehler: kein erneuter Abruf fuer denselben Pfad, bis verworfen wird", async () => {
  const cache = erstelleApiCache();
  fehlschlag = true;
  abrufe.length = 0;
  cache.hole("/x");
  await apiAbwarten();
  const r = cache.hole("/x");
  assert.match(r.fehler.message, /HTTP 500 \(bestand-unlesbar\)/);
  assert.equal(r.laedt, false);
  cache.hole("/x");
  await apiAbwarten();
  assert.equal(abrufe.length, 1);
  fehlschlag = false;
  verwerfeApiCaches();
  cache.hole("/x");
  await apiAbwarten();
  assert.equal(abrufe.length, 2);
  assert.deepEqual(cache.hole("/x").antwort, { pfad: "/x" });
});

test("Verwerfen: laufende Antworten des alten Stands werden nicht mehr uebernommen; leeren vergisst auch die letzte", async () => {
  const cache = erstelleApiCache();
  cache.hole("/alt");
  verwerfeApiCaches();
  await apiAbwarten();
  assert.equal(cache.hole("/alt").laedt, true, "alte Antwort nicht im Cache");
  await apiAbwarten();
  leereApiCaches();
  assert.equal(cache.hole("/neu").antwort, null);
});

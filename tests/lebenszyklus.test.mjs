import assert from "node:assert/strict";
import test from "node:test";
import { beiDatenwechsel, datenwechselMelden, erstelleEntpreller, eingabeBereit, detailsAttr, merkeDetails } from "../app/lebenszyklus.mjs";
import { erstelleApiCache, verwerfeApiCaches, beiApiAntwort } from "../app/api-daten.mjs";

const warte = () => new Promise((r) => setTimeout(r, 0));

test("Datenwechsel ruft alle Aufraeumer mit Grund", () => {
  const gerufen = [];
  const ab = beiDatenwechsel((grund) => gerufen.push(`a:${grund}`));
  beiDatenwechsel((grund) => gerufen.push(`b:${grund}`));
  datenwechselMelden("stand");
  ab();
  datenwechselMelden("sperre");
  assert.deepEqual(gerufen, ["a:stand", "b:stand", "b:sperre"]);
});

test("Lese-API: verwerfen bricht laufende Anfragen ab, spaete Antworten zaehlen nicht", async () => {
  const signale = [];
  let loese;
  globalThis.fetch = (pfad, optionen) => {
    signale.push(optionen.signal);
    return new Promise((resolve) => { loese = () => resolve({ ok: true, json: async () => ({ alt: true }) }); });
  };
  let gezeichnet = 0;
  beiApiAntwort(() => { gezeichnet += 1; });
  const cache = erstelleApiCache();
  assert.equal(cache.hole("./api/x").laedt, true);
  verwerfeApiCaches();
  assert.equal(signale[0].aborted, true, "Anfrage des alten Stands abgebrochen");
  loese();
  await warte();
  assert.equal(gezeichnet, 0, "spaete Antwort zeichnet nicht");
  assert.equal(cache.hole("./api/x").antwort, null, "und landet nicht im Cache");
});

test("Entpreller: ruft einmal nach Ruhe, sofort() zieht vor", () => {
  const timer = new Map();
  let id = 0;
  const uhr = { setTimeout: (fn) => { id += 1; timer.set(id, fn); return id; }, clearTimeout: (i) => timer.delete(i) };
  let n = 0;
  const e = erstelleEntpreller(() => { n += 1; }, 250, uhr);
  e(); e(); e();
  assert.equal(timer.size, 1);
  [...timer.values()][0]();
  assert.equal(n, 1);
  e();
  e.sofort();
  assert.equal(n, 2);
  assert.equal(timer.size, 1, "der vorgezogene Timer bleibt wirkungslos");
  e.abbrechen();
});

test("IME: waehrend der Komposition keine Verarbeitung", () => {
  assert.equal(eingabeBereit({ isComposing: true }), false);
  assert.equal(eingabeBereit({ isComposing: false }), true);
  assert.equal(eingabeBereit({}), true);
});

test("details: Standard, danach der vom Nutzer gesetzte Zustand", () => {
  assert.equal(detailsAttr("test.a"), ` data-details="test.a"`);
  assert.equal(detailsAttr("test.b", true), ` data-details="test.b" open`);
  merkeDetails("test.a", true);
  merkeDetails("test.b", false);
  assert.equal(detailsAttr("test.a"), ` data-details="test.a" open`);
  assert.equal(detailsAttr("test.b", true), ` data-details="test.b"`);
});

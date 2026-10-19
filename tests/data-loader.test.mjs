import assert from "node:assert/strict";
import { test } from "node:test";
import { BESTAND_TEILE, DATEN_DATEIEN, ladeSnapshot, ladeStand, loadFinanceData, parseJsonl } from "../app/data-loader.mjs";
import { snapshotAusTexten } from "../app/stand.mjs";

test("parseJsonl parses non-empty lines and ignores blanks", () => {
  assert.deepEqual(parseJsonl('{"a":1}\n\n{"b":2}\n'), [{ a: 1 }, { b: 2 }]);
});

test("parseJsonl reports the source path and line number", () => {
  assert.throws(
    () => parseJsonl('{"a":1}\nkaputt\n', "data/master/test.jsonl"),
    /data\/master\/test\.jsonl:2:/,
  );
});

test("DATEN_DATEIEN sind genau die Dateien der Bestandsteile", () => {
  assert.deepEqual(DATEN_DATEIEN, BESTAND_TEILE.map((teil) => teil.datei));
  assert.equal(new Set(BESTAND_TEILE.map((teil) => teil.schluessel)).size, BESTAND_TEILE.length);
});

// Kleinster gueltiger Satz Dateitexte: alle Pflichtdateien leer.
function leereTexte() {
  return Object.fromEntries(BESTAND_TEILE.filter((teil) => teil.ersatz === undefined).map(({ datei }) => [datei, datei.endsWith(".jsonl") ? "" : "[]"]));
}

test("snapshotAusTexten: optionale Dateien bekommen ihren Ersatz, Regeln kommen mit", () => {
  const texte = { ...leereTexte(), "kategorisierungsregeln.json": "[]", "vorsorge.json": undefined };
  const { daten, validierung } = snapshotAusTexten(texte);
  assert.deepEqual(daten.vorsorge, []);
  assert.deepEqual(daten.fristen, []);
  assert.deepEqual(daten.logos, []);
  assert.deepEqual(daten.farben, {});
  assert.ok(Array.isArray(daten.kategorisierungsregeln));
  assert.equal(validierung.valid, true, validierung.errors.join("\n"));
});

test("snapshotAusTexten: fehlende Pflichtdatei und kaputtes JSON werfen mit Dateiname", () => {
  const ohneKonten = leereTexte();
  delete ohneKonten["konten.json"];
  assert.throws(() => snapshotAusTexten(ohneKonten), /konten\.json: fehlt/);
  assert.throws(() => snapshotAusTexten({ ...leereTexte(), "transaktionen.jsonl": "{}\nkaputt\n" }), /transaktionen\.jsonl:2:/);
  assert.throws(() => snapshotAusTexten({ ...leereTexte(), "konten.json": "[" }), /konten\.json: /);
});

test("snapshotAusTexten: Strukturfehler stehen im Befund, Listen bleiben lesbar", () => {
  const { daten, validierung } = snapshotAusTexten({ ...leereTexte(), "konten.json": "[null]", "transfers.json": "{}" });
  assert.equal(validierung.valid, false);
  assert.match(validierung.errors.join("\n"), /konten\[0\]: muss ein Objekt sein/);
  assert.deepEqual(daten.konten, []);
  assert.deepEqual(daten.transfers, []);
});

function mitFetch(t, antwort) {
  const original = globalThis.fetch;
  const aufrufe = [];
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (pfad, optionen) => {
    aufrufe.push({ pfad, optionen });
    return antwort(pfad, optionen);
  };
  return aufrufe;
}

const SNAPSHOT = { format: 1, stand: "s1", validierung: { valid: false, errors: ["konten[0]: kaputt"] }, daten: { konten: [{ konto_id: "KTO-001" }], farben: {} } };
const ok = (body) => ({ ok: true, status: 200, json: async () => body });

test("loadFinanceData laedt den Snapshot ohne Browser-Cache, Echt standardmaessig", async (t) => {
  const aufrufe = mitFetch(t, () => ok(SNAPSHOT));
  const data = await loadFinanceData();
  assert.deepEqual(aufrufe, [{ pfad: "./api/v1/snapshot", optionen: { cache: "no-store", headers: {} } }]);
  assert.equal(data.metadata.dataMode, "live");
  assert.equal(data.metadata.bundleVersion, "live-master");
  assert.equal(data.metadata.stand, "s1");
  assert.equal(data.metadata.validation, "failed");
  assert.deepEqual(data.validation, { valid: false, errors: ["konten[0]: kaputt"] });
  assert.deepEqual(data.konten, [{ konto_id: "KTO-001" }]);
  assert.deepEqual(data.checks, []);
});

test("loadFinanceData kann Demodaten statt Masterdaten laden", async (t) => {
  const aufrufe = mitFetch(t, () => ok(SNAPSHOT));
  const data = await loadFinanceData({ dataMode: "demo" });
  assert.equal(aufrufe[0].pfad, "./api/v1/snapshot?quelle=demo");
  assert.equal(data.metadata.dataMode, "demo");
  assert.equal(data.metadata.label, "Demodaten");
});

test("ladeSnapshot fragt mit Stand bedingt und liefert bei 304 null", async (t) => {
  const aufrufe = mitFetch(t, () => ({ ok: false, status: 304 }));
  assert.equal(await ladeSnapshot({ dataMode: "demo", stand: "s1" }), null);
  assert.deepEqual(aufrufe[0].optionen, { cache: "no-store", headers: { "If-None-Match": '"s1"' } });
});

test("ladeSnapshot meldet Serverfehler mit Grund", async (t) => {
  mitFetch(t, () => ({ ok: false, status: 500, json: async () => ({ grund: "bestand-unlesbar", meldung: "konten.json: fehlt" }) }));
  await assert.rejects(ladeSnapshot({ dataMode: "live" }), /HTTP 500 \(konten\.json: fehlt\)/);
});

test("ladeStand liest die Kennung je Bestand", async (t) => {
  const aufrufe = mitFetch(t, () => ok({ stand: "abc" }));
  assert.equal(await ladeStand("demo"), "abc");
  assert.equal(await ladeStand("live"), "abc");
  assert.deepEqual(aufrufe.map((a) => a.pfad), ["./api/v1/stand?quelle=demo", "./api/v1/stand"]);
  mitFetch(t, () => ok({}));
  await assert.rejects(ladeStand("live"), /keine Standkennung/);
});

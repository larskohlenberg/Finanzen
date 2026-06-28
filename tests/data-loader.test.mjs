import assert from "node:assert/strict";
import { test } from "node:test";
import { loadJson, loadJsonl, loadFinanceData, parseJsonl } from "../app/data-loader.mjs";

test("parseJsonl parses non-empty lines and ignores blanks", () => {
  assert.deepEqual(parseJsonl('{"a":1}\n\n{"b":2}\n'), [{ a: 1 }, { b: 2 }]);
});

test("parseJsonl reports the source path and line number", () => {
  assert.throws(
    () => parseJsonl('{"a":1}\nkaputt\n', "data/master/test.jsonl"),
    /data\/master\/test\.jsonl:2:/,
  );
});

test("loadJson bypasses browser caches when loading data", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options });
    return {
      ok: true,
      json: async () => ({ ok: true }),
    };
  };

  assert.deepEqual(await loadJson("./data/master/konten.json", { refreshToken: "abc" }), { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "./data/master/konten.json?v=abc");
  assert.deepEqual(calls[0].options, { cache: "no-store" });
});

test("loadJsonl bypasses browser caches when loading data", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options });
    return {
      ok: true,
      text: async () => '{"a":1}\n',
    };
  };

  assert.deepEqual(await loadJsonl("./data/master/transaktionen.jsonl", { refreshToken: "abc" }), [{ a: 1 }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "./data/master/transaktionen.jsonl?v=abc");
  assert.deepEqual(calls[0].options, { cache: "no-store" });
});

test("loadFinanceData liefert kategorisierungsregeln", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const jsonResponses = {
    "personen.json": [],
    "konten.json": [],
    "kategorien.json": [],
    "transfers.json": [],
    "regelzahlungen.json": [],
    "immobilien.json": [],
    "darlehen.json": [],
    "vermoegenswerte.json": [],
    "vorsorge.json": [{ vorsorge_id: "VS-001" }],
    "kategorisierungsregeln.json": [{ id: "R-001", name: "Test-Regel" }],
  };

  globalThis.fetch = async (path, options) => {
    const filename = path.split("/").pop().split("?")[0];
    if (filename in jsonResponses) {
      return {
        ok: true,
        json: async () => jsonResponses[filename],
        text: async () => "",
      };
    }
    // JSONL files
    return {
      ok: true,
      text: async () => "",
      json: async () => [],
    };
  };

  const data = await loadFinanceData();
  assert.ok(Array.isArray(data.kategorisierungsregeln), "kategorisierungsregeln should be an array");
  assert.equal(data.kategorisierungsregeln.length, 1);
  assert.equal(data.kategorisierungsregeln[0].id, "R-001");
  assert.deepEqual(data.vorsorge, [{ vorsorge_id: "VS-001" }]);
});

test("loadFinanceData nutzt leere Vorsorge-Liste wenn optionale Datei fehlt", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (path) => {
    const filename = path.split("/").pop().split("?")[0];
    if (filename === "vorsorge.json") {
      return { ok: false, status: 404 };
    }
    if (filename.endsWith(".jsonl")) {
      return {
        ok: true,
        text: async () => "",
      };
    }
    return {
      ok: true,
      json: async () => [],
    };
  };

  const data = await loadFinanceData();
  assert.deepEqual(data.vorsorge, []);
});

test("loadFinanceData kann Demodaten statt Masterdaten laden", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (path) => {
    calls.push(path);
    const filename = path.split("/").pop().split("?")[0];
    if (filename.endsWith(".jsonl")) {
      return {
        ok: true,
        text: async () => "",
      };
    }
    return {
      ok: true,
      json: async () => [],
    };
  };

  const data = await loadFinanceData({ dataMode: "demo" });

  assert.ok(calls.length > 0);
  assert.ok(calls.every((path) => path.startsWith("./data/demo/")), "every request should target app/data/demo");
  assert.equal(data.metadata.bundleVersion, "demo");
  assert.equal(data.metadata.label, "Demodaten");
  assert.equal(data.metadata.dataMode, "demo");
});

test("loadFinanceData nutzt standardmaessig Live-Masterdaten", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (path) => {
    calls.push(path);
    const filename = path.split("/").pop().split("?")[0];
    if (filename.endsWith(".jsonl")) {
      return {
        ok: true,
        text: async () => "",
      };
    }
    return {
      ok: true,
      json: async () => [],
    };
  };

  const data = await loadFinanceData();

  assert.ok(calls.length > 0);
  assert.ok(calls.every((path) => path.startsWith("./data/master/")), "default requests should target app/data/master");
  assert.equal(data.metadata.bundleVersion, "live-master");
  assert.equal(data.metadata.dataMode, "live");
});

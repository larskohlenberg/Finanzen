// App mit DOM-Attrappe: aendert sich der Datenstand auf dem Server, zeigt der
// naechste Klick die neuen Daten, ohne Seiten-Reload; Zustand und Filter bleiben.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bestandAntwort } from "./hilfe-bestand.mjs";

const appListeners = new Map();
const app = {
  innerHTML: "",
  classList: { toggle: () => {} },
  addEventListener(type, listener) {
    appListeners.set(type, [...(appListeners.get(type) ?? []), listener]);
  },
  contains: () => false,
  querySelector: () => null,
  querySelectorAll: () => [],
};
const srStatus = { textContent: "" };
globalThis.document = {
  activeElement: null,
  body: {},
  documentElement: { dataset: {}, lang: "" },
  querySelector: (selector) => (selector === "#app" ? app : selector === "#sr-status" ? srStatus : null),
};
document.activeElement = document.body;
globalThis.localStorage = { getItem: (key) => (key === "finance-m2-data-mode" ? "demo" : null), setItem: () => {} };
globalThis.window = globalThis;

// Der "Server": Stand und Ersetzungen lassen sich im Test umstellen.
const server = { stand: "stand-1", ersetze: {}, anfragen: [], kopfleisteFehlt: false };
globalThis.fetch = async (pfad, optionen) => {
  server.anfragen.push({ pfad: String(pfad), optionen });
  if (server.kopfleisteFehlt && String(pfad).includes("api/v1/kopfleiste")) return { ok: false, status: 503, json: async () => ({ grund: "voruebergehend" }) };
  if (String(pfad).includes("api/v1/snapshot") && optionen?.headers?.["If-None-Match"] === `"${server.stand}"`) {
    return { ok: false, status: 304 };
  }
  const bestand = bestandAntwort(pfad, { stand: server.stand, ersetze: server.ersetze });
  if (bestand) return bestand;
  const rein = String(pfad).replace(/^\.\//, "").replace(/\?.*$/, "");
  if (rein.startsWith("api/")) return { ok: false, status: 404, json: async () => ({}) };
  const body = readFileSync(new URL(`../app/${rein}`, import.meta.url), "utf8");
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
};
const reloads = [];
globalThis.location = { hash: "", href: "http://127.0.0.1/", reload: () => reloads.push("reload"), assign: (url) => reloads.push(String(url)) };
globalThis.history = { pushState: () => {}, replaceState: () => {} };
globalThis.CSS = { escape: (value) => String(value) };
globalThis.scrollX = 0;
globalThis.scrollY = 0;
globalThis.scrollTo = () => {};
const fensterListener = new Map();
globalThis.addEventListener = (typ, fn) => fensterListener.set(typ, [...(fensterListener.get(typ) ?? []), fn]);
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {} });

await import("../app/i18n.js");
const runtime = await import("../app/runtime.mjs");
const { data, state, transaktionenById, kontenById } = runtime;
await import("../app/main.js");

const klick = () => {
  const ereignis = { target: { closest: () => null } };
  for (const fn of appListeners.get("click") ?? []) fn(ereignis);
};

async function warteBis(bedingung) {
  for (let i = 0; i < 200; i += 1) {
    if (bedingung()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("Bedingung nicht erreicht");
}

const NEUE_TX = {
  transaktion_id: "TX-STANDWECHSEL",
  dedupe_hash: "stand-wechsel-test-1",
  rohquelle: "tests/stand-wechsel-app.test.mjs",
  konto_id: "KTO-001",
  buchungsdatum: "2026-01-15",
  betrag: "-12.34",
  gegenpartei: "Testladen",
  verwendungszweck: "Testbuchung nach Standwechsel",
  kategorisierung_status: "bestaetigt",
  ist_transfer: false,
  kategorie_herkunft: "manuell",
};

test("Start: Daten und Befund kommen aus dem Snapshot des Servers", () => {
  assert.equal(data.metadata.stand, "stand-1");
  assert.equal(data.metadata.dataMode, "demo");
  assert.equal(data.validation.valid, true, data.validation.errors.join("\n"));
  assert.ok(server.anfragen.some((a) => a.pfad === "./api/v1/snapshot?quelle=demo"));
  assert.ok(!transaktionenById.has(NEUE_TX.transaktion_id));
});

test("gleicher Stand: Klick fragt nur die Kennung ab", async () => {
  server.anfragen.length = 0;
  klick();
  await warteBis(() => server.anfragen.some((a) => a.pfad.includes("api/v1/stand")));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(!server.anfragen.some((a) => a.pfad.includes("api/v1/snapshot")));
});

test("neuer Stand: naechster Klick laedt neu, ohne Reload, Filter und Auswahl bleiben", async () => {
  state.view = "transactions";
  state.transactionFilters.search = "Testbuchung";
  state.selectedKonto = "KTO-001";
  const altesData = data.transaktionen;
  const zeilen = readFileSync(new URL("../app/data/demo/transaktionen.jsonl", import.meta.url), "utf8");
  const konten = JSON.parse(readFileSync(new URL("../app/data/demo/konten.json", import.meta.url), "utf8"));
  server.stand = "stand-2";
  server.ersetze = {
    "transaktionen.jsonl": `${zeilen.trimEnd()}\n${JSON.stringify(NEUE_TX)}\n`,
    "konten.json": JSON.stringify([...konten, null]),
  };
  // Der Mindestabstand zwischen zwei Abfragen ist kurz; danach zaehlt der Klick.
  await new Promise((resolve) => setTimeout(resolve, 1600));
  klick();
  await warteBis(() => data.metadata?.stand === "stand-2");

  assert.notEqual(data.transaktionen, altesData);
  assert.equal(transaktionenById.get(NEUE_TX.transaktion_id)?.betrag, "-12.34");
  assert.equal(kontenById.size, konten.length, "Nachschlage-Maps neu gefuellt (kaputter Eintrag faellt heraus)");
  // Befund vom Server: der kaputte Eintrag steht im Banner.
  assert.equal(data.validation.valid, false);
  assert.match(data.validation.errors.join("\n"), /konten\[\d+\]/);
  assert.match(app.innerHTML, /validation-banner/);
  assert.equal(state.view, "transactions");
  assert.equal(state.transactionFilters.search, "Testbuchung");
  assert.equal(state.selectedKonto, "KTO-001");
  assert.deepEqual(reloads, [], "kein Seiten-Reload");
  // Hinweis plus Statusmeldung der Ansicht mit den Zahlen aus der Transaktionen-API.
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.match(srStatus.textContent, /^Neuer Datenstand geladen\. Transaktionen: 1 Treffer/);
  const bedingt = server.anfragen.filter((a) => a.pfad.includes("api/v1/snapshot")).at(-1);
  assert.equal(bedingt.optionen.headers["If-None-Match"], '"stand-1"');
});

test("Knopf Daten neu laden: bedingt laden ohne Reload, 304 laesst alles stehen", async () => {
  const vorher = data.transaktionen;
  server.anfragen.length = 0;
  const knopf = { dataset: { action: "reload-data" } };
  for (const fn of appListeners.get("click") ?? []) {
    fn({ target: { closest: (sel) => (sel === "[data-action]" ? knopf : null) } });
  }
  await warteBis(() => server.anfragen.some((a) => a.pfad.includes("api/v1/snapshot")));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const anfrage = server.anfragen.find((a) => a.pfad.includes("api/v1/snapshot"));
  assert.equal(anfrage.optionen.headers["If-None-Match"], '"stand-2"');
  assert.equal(data.transaktionen, vorher);
  assert.deepEqual(reloads, []);
});

test("Kopfleiste: gescheiterter Abruf wird gezeigt, Daten neu laden holt ihn erneut", async () => {
  const neuLaden = () => {
    const knopf = { dataset: { action: "reload-data" } };
    for (const fn of appListeners.get("click") ?? []) {
      fn({ target: { closest: (sel) => (sel === "[data-action]" ? knopf : null) } });
    }
  };
  server.kopfleisteFehlt = true;
  neuLaden();
  await warteBis(() => /Status nicht geladen/.test(app.innerHTML));
  server.kopfleisteFehlt = false;
  neuLaden();
  await warteBis(() => !/Status nicht geladen/.test(app.innerHTML));
  assert.deepEqual(reloads, []);
});

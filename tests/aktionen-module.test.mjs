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
  if (String(pfad).includes("api/v1/grunddaten") && optionen?.headers?.["If-None-Match"] === `"${server.stand}"`) {
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
const { data, state, kontenById } = runtime;

// Jede Aktion laeuft mit einem leeren Element durch, ohne auf einen fehlenden
// Bezeichner zu stossen (ReferenceError). Fachliche Wirkung pruefen die Tests
// der Ansichten und die Browsertests; hier geht es um die Verdrahtung nach der
// Teilung von main.js.
const module = await Promise.all(["rahmen", "dokumente", "stammdaten", "transaktionen", "vermoegen", "vorsorge", "szenarien", "plan-termine"]
  .map((name) => import(`../app/aktionen/${name}.mjs`)));
Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async () => {} } }, configurable: true });
document.getElementById = () => null;

test("Aktionen: Namen eindeutig, jede laeuft ohne fehlenden Bezeichner", async () => {
  const gesehen = new Set();
  const fehler = [];
  for (const { aktionen } of module) {
    for (const [name, handler] of Object.entries(aktionen)) {
      assert.ok(!gesehen.has(name), `doppelte Aktion ${name}`);
      gesehen.add(name);
      if (["set-setting", "abmelden"].includes(name)) continue; // laden die Seite neu bzw. sperren
      const element = { dataset: { action: name }, closest: () => null };
      try {
        await handler(element, name);
      } catch (grund) {
        if (grund instanceof ReferenceError) fehler.push(`${name}: ${grund.message}`);
      }
    }
  }
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(fehler, []);
  assert.ok(gesehen.size > 60);
});

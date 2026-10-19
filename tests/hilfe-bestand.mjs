// Fetch-Antworten fuer Tests mit DOM-Attrappe: Stand und Snapshot des App-Servers
// (/api/v1/stand, /api/v1/snapshot) aus dem Demo-Bestand, wie server.mjs sie
// liefert. ersetze ueberschreibt einzelne Dateien (Text; undefined = fehlt).
import { readFileSync } from "node:fs";
import { BESTAND_TEILE } from "../app/data-loader.mjs";
import { snapshotAusTexten } from "../app/stand.mjs";
import { leseAnsicht } from "../app/lese-api.mjs";

export const TEST_STAND = "teststand";

function demoTexte(ersetze) {
  const texte = {};
  for (const { datei } of BESTAND_TEILE) {
    if (Object.hasOwn(ersetze, datei)) {
      if (ersetze[datei] !== undefined) texte[datei] = ersetze[datei];
      continue;
    }
    try {
      texte[datei] = readFileSync(new URL(`../app/data/demo/${datei}`, import.meta.url), "utf8");
    } catch (fehler) {
      if (fehler.code !== "ENOENT") throw fehler;
    }
  }
  return texte;
}

export function snapshotFuerTest({ ersetze = {}, stand = TEST_STAND } = {}) {
  return { format: 1, stand, ...snapshotAusTexten(demoTexte(ersetze)) };
}

function antwort(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

// null, wenn pfad keine Bestandsanfrage ist; dann antwortet der Test selbst.
// Lese-APIs (/api/v1/transaktionen ...) rechnen wie der Server; mit daten
// ueber einen vom Test vorgegebenen Bestand (z. B. das data-Objekt der App).
export function bestandAntwort(pfad, { ersetze = {}, stand = TEST_STAND, daten = null } = {}) {
  const text = String(pfad).replace(/^\.\//, "");
  const rein = text.replace(/\?.*$/, "");
  if (rein === "api/v1/stand") return antwort(200, { stand });
  if (rein === "api/v1/snapshot") return antwort(200, snapshotFuerTest({ ersetze, stand }));
  if (rein.startsWith("api/v1/")) {
    const quelle = daten ?? snapshotFuerTest({ ersetze, stand }).daten;
    const merkliste = new Map();
    const bestand = { stand, daten: quelle, merke: (k, f) => (merkliste.has(k) ? merkliste.get(k) : merkliste.set(k, f()).get(k)) };
    try {
      const ergebnis = leseAnsicht(rein.slice("api/v1/".length), bestand, new URLSearchParams(text.split("?")[1] ?? ""));
      return ergebnis ? antwort(200, ergebnis) : antwort(404, { grund: "nicht-gefunden" });
    } catch (fehler) {
      return antwort(400, { grund: `parameter: ${fehler.message}` });
    }
  }
  return null;
}

// Wartet, bis offene Abrufe der Lese-APIs (api-daten.mjs) durch sind.
export async function apiAbwarten() {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

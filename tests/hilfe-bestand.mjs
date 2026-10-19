// Fetch-Antworten fuer Tests mit DOM-Attrappe: Stand und Snapshot des App-Servers
// (/api/v1/stand, /api/v1/snapshot) aus dem Demo-Bestand, wie server.mjs sie
// liefert. ersetze ueberschreibt einzelne Dateien (Text; undefined = fehlt).
import { readFileSync } from "node:fs";
import { BESTAND_TEILE } from "../app/data-loader.mjs";
import { snapshotAusTexten } from "../app/stand.mjs";

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
export function bestandAntwort(pfad, { ersetze = {}, stand = TEST_STAND } = {}) {
  const rein = String(pfad).replace(/^\.\//, "").replace(/\?.*$/, "");
  if (rein === "api/v1/stand") return antwort(200, { stand });
  if (rein === "api/v1/snapshot") return antwort(200, snapshotFuerTest({ ersetze, stand }));
  return null;
}

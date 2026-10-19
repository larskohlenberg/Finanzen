// Fetch-Antworten fuer Tests mit DOM-Attrappe: Stand und Grunddaten des
// App-Servers (/api/v1/stand, /api/v1/grunddaten) aus dem Demo-Bestand, wie
// server.mjs sie liefert. ersetze ueberschreibt einzelne Dateien (Text;
// undefined = fehlt).
import { readFileSync } from "node:fs";
import { BESTAND_TEILE } from "../app/data-loader.mjs";
import { grunddatenAus, snapshotAusTexten } from "../app/stand.mjs";
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
// Was nur der Server hat (Buchungen, Transfers) und daten nicht selbst setzt,
// kommt aus dem Demo-Bestand.
export function bestandAntwort(pfad, { ersetze = {}, stand = TEST_STAND, daten = null } = {}) {
  const text = String(pfad).replace(/^\.\//, "");
  const rein = text.replace(/\?.*$/, "");
  if (rein === "api/v1/stand") return antwort(200, { stand });
  if (rein === "api/v1/grunddaten") return antwort(200, grunddatenAus(snapshotFuerTest({ ersetze, stand })));
  if (rein.startsWith("api/v1/")) {
    const demo = snapshotFuerTest({ ersetze, stand }).daten;
    const quelle = daten ? { transaktionen: demo.transaktionen, transfers: demo.transfers, ...daten } : demo;
    const merkliste = new Map();
    const validierung = daten?.validation ?? snapshotFuerTest({ ersetze, stand }).validierung;
    const bestand = { stand, daten: quelle, validierung, merke: (k, f) => (merkliste.has(k) ? merkliste.get(k) : merkliste.set(k, f()).get(k)) };
    try {
      const suche = new URLSearchParams(text.split("?")[1] ?? "");
      const ergebnis = leseAnsicht(rein.slice("api/v1/".length), bestand, suche, { quelle: suche.get("quelle") === "demo" ? "demo" : "live" });
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

// Buchungen und Transfers des Demo-Bestands: was nur der Server hat. Tests, die
// das data-Objekt der App als Bestand der Lese-APIs nutzen und mit Buchungen
// arbeiten, legen sie dort ab (frische Kopien).
export function demoBuchungen() {
  const { transaktionen, transfers } = snapshotFuerTest().daten;
  return { transaktionen: structuredClone(transaktionen), transfers: structuredClone(transfers) };
}

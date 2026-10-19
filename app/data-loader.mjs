import { localTodayIso } from "./liquiditaet.mjs";

export const dataModes = {
  live: {
    key: "live",
    // Logos (logos/*.png) kommen weiter statisch aus dem Bestand.
    basePath: "./data/master",
    bundleVersion: "live-master",
    label: "Live-Masterdaten",
  },
  demo: {
    key: "demo",
    basePath: "./data/demo",
    bundleVersion: "demo",
    label: "Demodaten",
  },
};

// Was die App aus einem Datenbestand bekommt: Datei, Schluessel im Bestand und,
// fuer optionale Dateien, der Ersatz, wenn sie fehlen. Der App-Server liest
// genau diese Dateien fuer den Snapshot (app/stand.mjs); fehlt eine Pflichtdatei
// oder ist eine unlesbar, gibt es keinen Snapshot.
export const BESTAND_TEILE = Object.freeze([
  { datei: "personen.json", schluessel: "personen" },
  { datei: "konten.json", schluessel: "konten" },
  { datei: "kategorien.json", schluessel: "kategorien" },
  { datei: "transaktionen.jsonl", schluessel: "transaktionen" },
  { datei: "transfers.json", schluessel: "transfers" },
  { datei: "regelzahlungen.json", schluessel: "regelzahlungen" },
  { datei: "fristen.json", schluessel: "fristen", ersatz: [] },
  { datei: "szenarien.json", schluessel: "szenarien" },
  { datei: "immobilien.json", schluessel: "immobilien" },
  { datei: "darlehen.json", schluessel: "darlehen" },
  { datei: "vermoegenswerte.json", schluessel: "vermoegenswerte" },
  { datei: "vorsorge.json", schluessel: "vorsorge", ersatz: [] },
  { datei: "zeitwerte.jsonl", schluessel: "zeitwerte" },
  { datei: "kategorisierungsregeln.json", schluessel: "kategorisierungsregeln" },
  { datei: "logos.json", schluessel: "logos", ersatz: [] },
  // Fest vergebene Anzeigefarben (z. B. je Vorsorgevertrag); optional, kein Schema.
  { datei: "farben.json", schluessel: "farben", ersatz: {} },
].map(Object.freeze));

export const DATEN_DATEIEN = Object.freeze(BESTAND_TEILE.map((teil) => teil.datei));

export function normalizeDataMode(value) {
  return value === dataModes.demo.key ? dataModes.demo.key : dataModes.live.key;
}

export function parseJsonl(text, path = "JSONL") {
  return text
    .split(/\r?\n/)
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.trim().length > 0)
    .map(({ line, number }) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${path}:${number}: ${error.message}`);
      }
    });
}

// Endpunkte des App-Servers (server.mjs). Demo und Echt sind getrennte Bestaende.
export function standUrl(dataMode) {
  return `./api/v1/stand${normalizeDataMode(dataMode) === "demo" ? "?quelle=demo" : ""}`;
}

export function snapshotUrl(dataMode) {
  return `./api/v1/snapshot${normalizeDataMode(dataMode) === "demo" ? "?quelle=demo" : ""}`;
}

async function fehlerAus(response, url) {
  const grund = await response.json().then((body) => body?.meldung ?? body?.grund).catch(() => null);
  return new Error(`${url}: HTTP ${response.status}${grund ? ` (${grund})` : ""}`);
}

// Kennung des aktuellen Datenstands auf dem Server.
export async function ladeStand(dataMode) {
  const url = standUrl(dataMode);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw await fehlerAus(response, url);
  const { stand } = await response.json();
  if (typeof stand !== "string" || !stand) throw new Error(`${url}: keine Standkennung`);
  return stand;
}

// Ganzer Bestand samt Validator-Befund des Servers. Mit stand fragt der Browser
// bedingt (If-None-Match): ist der Stand unveraendert, kommt 304 und hier null.
// Kein Browser-Cache: die Finanzdaten bleiben no-store.
export async function ladeSnapshot({ dataMode, stand = null } = {}) {
  const url = snapshotUrl(dataMode);
  const response = await fetch(url, { cache: "no-store", headers: stand ? { "If-None-Match": `"${stand}"` } : {} });
  if (response.status === 304) return null;
  if (!response.ok) throw await fehlerAus(response, url);
  return bundleAusSnapshot(await response.json(), dataMode);
}

export function bundleAusSnapshot(snapshot, dataMode) {
  const mode = dataModes[normalizeDataMode(dataMode)];
  const { stand, validierung, daten } = snapshot ?? {};
  if (typeof stand !== "string" || !daten || typeof daten !== "object" || typeof validierung?.valid !== "boolean") {
    throw new Error("Snapshot unvollstaendig");
  }
  return {
    metadata: {
      bundleVersion: mode.bundleVersion,
      label: mode.label,
      dataMode: mode.key,
      generatedAt: localTodayIso(),
      stand,
      validation: validierung.valid ? "passed" : "failed",
    },
    ...daten,
    validation: { valid: validierung.valid, errors: validierung.errors ?? [] },
    checks: [],
    importfehler: [],
  };
}

export async function loadFinanceData(options = {}) {
  return ladeSnapshot({ dataMode: options.dataMode });
}

import { localTodayIso } from "./liquiditaet.mjs";

export const dataModes = {
  live: {
    key: "live",
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

export function normalizeDataMode(value) {
  return value === dataModes.demo.key ? dataModes.demo.key : dataModes.live.key;
}

function withRefreshToken(path, refreshToken) {
  if (!refreshToken) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}v=${encodeURIComponent(refreshToken)}`;
}

export async function loadJson(path, options = {}) {
  const response = await fetch(withRefreshToken(path, options.refreshToken), { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function loadJsonOptional(path, fallback, options = {}) {
  const response = await fetch(withRefreshToken(path, options.refreshToken), { cache: "no-store" });
  if (!response.ok) {
    if (response.status === 404) return fallback;
    throw new Error(`${path}: HTTP ${response.status}`);
  }
  return response.json();
}

export async function loadJsonl(path, options = {}) {
  const response = await fetch(withRefreshToken(path, options.refreshToken), { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const text = await response.text();
  return parseJsonl(text, path);
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

export async function loadFinanceData(options = {}) {
  const mode = dataModes[normalizeDataMode(options.dataMode)];
  const path = (filename) => `${mode.basePath}/${filename}`;
  const refreshToken = String(Date.now());
  const [
    personen,
    konten,
    kategorien,
    transaktionen,
    transfers,
    regelzahlungen,
    szenarien,
    immobilien,
    darlehen,
    vermoegenswerte,
    vorsorge,
    zeitwerte,
    kategorisierungsregeln,
  ] = await Promise.all([
    loadJson(path("personen.json"), { refreshToken }),
    loadJson(path("konten.json"), { refreshToken }),
    loadJson(path("kategorien.json"), { refreshToken }),
    loadJsonl(path("transaktionen.jsonl"), { refreshToken }),
    loadJson(path("transfers.json"), { refreshToken }),
    loadJson(path("regelzahlungen.json"), { refreshToken }),
    loadJson(path("szenarien.json"), { refreshToken }),
    loadJson(path("immobilien.json"), { refreshToken }),
    loadJson(path("darlehen.json"), { refreshToken }),
    loadJson(path("vermoegenswerte.json"), { refreshToken }),
    loadJsonOptional(path("vorsorge.json"), [], { refreshToken }),
    loadJsonl(path("zeitwerte.jsonl"), { refreshToken }),
    loadJson(path("kategorisierungsregeln.json"), { refreshToken }),
  ]);

  return {
    metadata: {
      bundleVersion: mode.bundleVersion,
      label: mode.label,
      dataMode: mode.key,
      generatedAt: localTodayIso(),
      validation: "not-run-in-browser",
    },
    personen,
    konten,
    kategorien,
    transaktionen,
    transfers,
    regelzahlungen,
    szenarien,
    immobilien,
    darlehen,
    vermoegenswerte,
    vorsorge,
    zeitwerte,
    kategorisierungsregeln,
    checks: [],
    importfehler: [],
  };
}

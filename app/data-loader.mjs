import { localTodayIso } from "./liquiditaet.mjs";

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

export async function loadFinanceData() {
  const refreshToken = String(Date.now());
  const [
    personen,
    konten,
    kategorien,
    transaktionen,
    transfers,
    regelzahlungen,
    immobilien,
    darlehen,
    vermoegenswerte,
    zeitwerte,
  ] = await Promise.all([
    loadJson("./data/master/personen.json", { refreshToken }),
    loadJson("./data/master/konten.json", { refreshToken }),
    loadJson("./data/master/kategorien.json", { refreshToken }),
    loadJsonl("./data/master/transaktionen.jsonl", { refreshToken }),
    loadJson("./data/master/transfers.json", { refreshToken }),
    loadJson("./data/master/regelzahlungen.json", { refreshToken }),
    loadJson("./data/master/immobilien.json", { refreshToken }),
    loadJson("./data/master/darlehen.json", { refreshToken }),
    loadJson("./data/master/vermoegenswerte.json", { refreshToken }),
    loadJsonl("./data/master/zeitwerte.jsonl", { refreshToken }),
  ]);

  return {
    metadata: {
      bundleVersion: "live-master",
      label: "Live-Masterdaten",
      generatedAt: localTodayIso(),
      validation: "not-run-in-browser",
    },
    personen,
    konten,
    kategorien,
    transaktionen,
    transfers,
    regelzahlungen,
    immobilien,
    darlehen,
    vermoegenswerte,
    zeitwerte,
    checks: [],
    importfehler: [],
  };
}

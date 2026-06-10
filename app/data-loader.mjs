import { localTodayIso } from "./liquiditaet.mjs";

export async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

export async function loadJsonl(path) {
  const response = await fetch(path);
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
    loadJson("./data/master/personen.json"),
    loadJson("./data/master/konten.json"),
    loadJson("./data/master/kategorien.json"),
    loadJsonl("./data/master/transaktionen.jsonl"),
    loadJson("./data/master/transfers.json"),
    loadJson("./data/master/regelzahlungen.json"),
    loadJson("./data/master/immobilien.json"),
    loadJson("./data/master/darlehen.json"),
    loadJson("./data/master/vermoegenswerte.json"),
    loadJsonl("./data/master/zeitwerte.jsonl"),
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

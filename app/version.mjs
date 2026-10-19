// Versionsanzeige unten in der Sidebar. app/version.json schreibt
// ops/aktualisieren.sh beim Deploy; lokal fehlt die Datei, dann steht dort
// "lokal". Reine Funktionen, damit sie ohne Browser testbar sind.

import { formatierer } from "./format.mjs";

const REPO_COMMIT_URL = "https://github.com/larskohlenberg/Finanzen/commit/";

// Nur, was das Skript wirklich schreibt: Hex-Hashes und ein ISO-Datum. Alles
// andere gilt als kaputt — so landet nichts Fremdes im Link.
function gueltig(version) {
  return Boolean(version)
    && typeof version === "object"
    && /^[0-9a-f]{7,64}$/.test(version.commit ?? "")
    && /^[0-9a-f]{7,64}$/.test(version.kurz ?? "")
    && /^\d{4}-\d{2}-\d{2}$/.test(version.datum ?? "");
}

// Liefert die Teile der Anzeige. `lang` formatiert das Datum wie die
// uebrige App (format.mjs), `lokal` ist der uebersetzte Ersatztext ohne
// version.json.
export function versionAnzeige(version, { lang = "de", lokal = "lokal" } = {}) {
  if (!gueltig(version)) return { lokal: true, text: lokal };
  const datum = formatierer(lang).datum(version.datum);
  const branch = typeof version.branch === "string" && version.branch && version.branch !== "main"
    ? version.branch
    : "";
  return {
    lokal: false,
    kurz: version.kurz,
    href: REPO_COMMIT_URL + version.commit,
    datum,
    branch,
    text: [version.kurz, datum, branch].filter(Boolean).join(" · "),
  };
}

// Laedt ./version.json ohne Cache. Scheitert still mit null — die Anzeige
// darf den App-Start nie aufhalten.
export async function ladeVersion(fetchFn = globalThis.fetch) {
  try {
    const antwort = await fetchFn("./version.json", { cache: "no-store" });
    if (!antwort.ok) return null;
    return await antwort.json();
  } catch {
    return null;
  }
}

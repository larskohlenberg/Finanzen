// app/mcp/version.mjs
// Release-Kennung des installierten Codes aus app/version.json (schreibt
// ops/aktualisieren.sh beim Deploy). Der MCP-Server merkt sich beim Start die
// Kennung; weicht die installierte spaeter ab, laeuft die Sitzung mit altem
// Code gegen neue Werkzeuge und Daten und muss neu starten. Ohne version.json
// (Entwicklung) heisst die Kennung "entwicklung".
import { readFileSync } from "node:fs";
import path from "node:path";

export const OHNE_RELEASE = "entwicklung";

export function releaseKennung(app) {
  try {
    const v = JSON.parse(readFileSync(path.join(app, "version.json"), "utf8"));
    if (typeof v.commit === "string" && v.commit) return typeof v.kurz === "string" && v.kurz ? v.kurz : v.commit.slice(0, 7);
  } catch {
    // keine oder unlesbare Datei
  }
  return OHNE_RELEASE;
}

export function releaseStand(ctx) {
  const installiert = releaseKennung(ctx.app);
  return { gestartet: ctx.release, installiert, veraltet: installiert !== ctx.release };
}

// Meldung fuer eine veraltete Sitzung oder null.
export function veraltetHinweis(ctx) {
  if (!ctx.release) return null;
  const stand = releaseStand(ctx);
  if (!stand.veraltet) return null;
  return `MCP-Server veraltet: gestartet mit Release ${stand.gestartet}, installiert ist ${stand.installiert}. Die Sitzung laeuft mit altem Code und wird darum abgewiesen. MCP-Server neu starten (Client neu verbinden bzw. neue Sitzung); bis dahin ist nur status moeglich.`;
}

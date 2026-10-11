// app/mcp/pfade.mjs
// Pfadschutz fuer die Datei-Tools. Pfade sind immer relativ zum App-Raum; die
// Repo-Doku erreicht man ueber `../docs/...` und `../CONTEXT.md`. Erlaubt ist,
// was nach dem Aufloesen — lexikalisch UND nach realpath (Symlinks) — unter
// einer der erlaubten Wurzeln liegt. Absolute Pfade werden nie angenommen.
import { realpath } from "node:fs/promises";
import path from "node:path";

export const LESE_WURZELN = ["data", "Belege", "docs", "schemas", "../docs", "../CONTEXT.md"];
export const SCHREIB_WURZELN = ["data"];

export class PfadFehler extends Error {}

function liegtUnter(kandidat, wurzel) {
  return kandidat === wurzel || kandidat.startsWith(`${wurzel}${path.sep}`);
}

async function echterPfad(absolut) {
  // Fuer noch nicht existierende Ziele: naechsten existierenden Vorfahren
  // aufloesen und den Rest anhaengen.
  let kopf = absolut;
  const rest = [];
  for (;;) {
    try {
      return path.join(await realpath(kopf), ...rest);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const eltern = path.dirname(kopf);
      if (eltern === kopf) return absolut;
      rest.unshift(path.basename(kopf));
      kopf = eltern;
    }
  }
}

export async function loesePfad(appRoot, relativ, wurzeln) {
  if (typeof relativ !== "string" || relativ.trim() === "" || relativ.includes("\0")) {
    throw new PfadFehler("Pfad fehlt oder ist ungueltig");
  }
  if (path.isAbsolute(relativ) || relativ.startsWith("~")) {
    throw new PfadFehler("Absolute Pfade sind nicht erlaubt — Pfad relativ zum App-Raum angeben (z. B. data/master/konten.json)");
  }
  const absolut = path.resolve(appRoot, relativ);
  const erlaubt = wurzeln.map((w) => path.resolve(appRoot, w));
  if (!erlaubt.some((w) => liegtUnter(absolut, w))) {
    throw new PfadFehler(`Pfad liegt ausserhalb der erlaubten Wurzeln (${wurzeln.join(", ")})`);
  }
  const echt = await echterPfad(absolut);
  const echteWurzeln = await Promise.all(erlaubt.map((w) => echterPfad(w)));
  if (!echteWurzeln.some((w) => liegtUnter(echt, w))) {
    throw new PfadFehler("Pfad fuehrt ueber einen Symlink aus den erlaubten Wurzeln heraus");
  }
  return { absolut, relativ: path.relative(appRoot, absolut).split(path.sep).join("/") };
}

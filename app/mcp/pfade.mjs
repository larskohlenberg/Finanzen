// app/mcp/pfade.mjs
// Pfadschutz fuer die Datei-Tools. Pfade sind immer relativ zum App-Raum; die
// Repo-Doku erreicht man ueber `../docs/...` und `../CONTEXT.md`. Erlaubt ist,
// was nach dem Aufloesen — lexikalisch UND nach realpath (Symlinks) — unter
// einer der erlaubten Wurzeln liegt. Absolute Pfade werden nie angenommen.
// Geschrieben wird nur im Bestand der Sitzung samt dessen Inbox, Importprofilen
// und Papierkorb (bestandWurzeln), und nur mit erlaubter Endung.
// Pfade sind logisch (data/master, data/inbox, Belege/); wo sie auf der Platte
// liegen, entscheidet der Datenort (tools/lib/datenort.mjs, FINANZEN_DATEN).
import { realpath } from "node:fs/promises";
import path from "node:path";
import { bestandOrte } from "../tools/lib/bestand-orte.mjs";
import { logisch, physisch, physischeWurzeln } from "../tools/lib/datenort.mjs";

export { logisch, physisch, physischeWurzeln };

export const LESE_WURZELN = ["data", "Belege", "docs", "schemas", "../docs", "../CONTEXT.md"];
// Keine ausfuehrbaren oder im Browser aktiven Typen (html, js, svg, ...).
export const SCHREIB_ENDUNGEN = [".json", ".jsonl", ".csv", ".txt", ".md", ".pdf", ".png", ".jpg", ".jpeg"];

export class PfadFehler extends Error {}

const relativZu = (app, absolut) => logisch(app, absolut);

// Orte des Bestands der Sitzung, relativ zum App-Raum; belege ist null, wenn
// der Bestand keine Belegablage hat. schreiben = alle Schreibwurzeln.
export function bestandWurzeln(ctx) {
  const orte = bestandOrte(ctx.app, ctx.datenroot);
  const r = {
    datenroot: relativZu(ctx.app, ctx.datenroot),
    inbox: relativZu(ctx.app, orte.inbox),
    profile: relativZu(ctx.app, orte.profile),
    papierkorb: relativZu(ctx.app, orte.papierkorb),
    belege: orte.belege ? relativZu(ctx.app, orte.belege) : null,
  };
  r.schreiben = [...new Set([r.datenroot, r.inbox, r.profile, r.papierkorb])];
  return r;
}

// Abgelegte Belege behalten ihre Endung (xlsx, docx, heic ...); ausgeschlossen
// sind nur Typen, die im Browser aktiv werden koennen.
const AKTIVE_ENDUNGEN = [".html", ".htm", ".xhtml", ".shtml", ".js", ".mjs", ".cjs", ".svg", ".svgz", ".xml", ".xsl", ".swf"];

export function pruefeKeinAktiverTyp(relativ) {
  const endung = path.extname(relativ).toLowerCase();
  if (AKTIVE_ENDUNGEN.includes(endung)) throw new PfadFehler(`Endung ${endung} ist nicht erlaubt (im Browser aktiver Dateityp)`);
}

export function pruefeEndung(relativ) {
  const endung = path.extname(relativ).toLowerCase();
  if (!SCHREIB_ENDUNGEN.includes(endung)) {
    throw new PfadFehler(`Endung ${endung || "(keine)"} ist nicht erlaubt; erlaubt sind ${SCHREIB_ENDUNGEN.join(", ")}`);
  }
}

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
  // Erst logisch pruefen (relativ zum App-Raum), dann am Ort auf der Platte.
  const logischAbsolut = path.resolve(appRoot, relativ);
  const erlaubt = wurzeln.map((w) => path.resolve(appRoot, w));
  if (!erlaubt.some((w) => liegtUnter(logischAbsolut, w))) {
    throw new PfadFehler(`Pfad liegt ausserhalb der erlaubten Wurzeln (${wurzeln.join(", ")})`);
  }
  const logischRelativ = path.relative(appRoot, logischAbsolut);
  const absolut = physisch(appRoot, logischRelativ);
  const echt = await echterPfad(absolut);
  const echteWurzeln = await Promise.all(wurzeln.flatMap((w) => physischeWurzeln(appRoot, w)).map((w) => echterPfad(w)));
  if (!echteWurzeln.some((w) => liegtUnter(echt, w))) {
    throw new PfadFehler("Pfad fuehrt ueber einen Symlink aus den erlaubten Wurzeln heraus");
  }
  return { absolut, relativ: logischRelativ.split(path.sep).join("/") };
}
